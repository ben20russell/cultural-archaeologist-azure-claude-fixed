import { useCallback, useRef, useState } from 'react';

type StreamPhase = 'idle' | 'loading' | 'done' | 'error';

export type InsightStreamState = {
  phase: StreamPhase;
  insights: string[];
  image: {
    url: string;
    blurhash: string;
    dominantColor: string;
  } | null;
  error: string | null;
};

function parseSseChunk(buffer: string): { events: Array<{ event: string; data: string }>; remainder: string } {
  const events: Array<{ event: string; data: string }> = [];
  const parts = buffer.split('\n\n');
  const remainder = parts.pop() || '';

  for (const part of parts) {
    const lines = part.split('\n');
    const eventLine = lines.find((line) => line.startsWith('event:'));
    const dataLines = lines.filter((line) => line.startsWith('data:'));
    if (!eventLine || dataLines.length === 0) continue;

    const event = eventLine.slice('event:'.length).trim();
    const data = dataLines.map((line) => line.slice('data:'.length).trim()).join('\n');
    events.push({ event, data });
  }

  return { events, remainder };
}

export function useInsightStream() {
  const [state, setState] = useState<InsightStreamState>({
    phase: 'idle',
    insights: [],
    image: null,
    error: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const start = useCallback(async (audience: string) => {
    stop();

    const cleanAudience = audience.trim();
    if (!cleanAudience) {
      setState({ phase: 'error', insights: [], image: null, error: 'Audience is required.' });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setState({ phase: 'loading', insights: [], image: null, error: null });

    try {
      const response = await fetch(`/api/stream-insights?audience=${encodeURIComponent(cleanAudience)}`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'text/event-stream',
        },
      });

      if (!response.ok || !response.body) {
        throw new Error(`Stream request failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSseChunk(buffer);
        buffer = parsed.remainder;

        for (const evt of parsed.events) {
          if (evt.event === 'insights') {
            const payload = JSON.parse(evt.data) as { data?: { insights?: string[] } };
            setState((prev) => ({
              ...prev,
              phase: 'loading',
              insights: payload.data?.insights || prev.insights,
            }));
          } else if (evt.event === 'image') {
            const payload = JSON.parse(evt.data) as {
              data?: { url: string; blurhash: string; dominantColor: string };
            };
            setState((prev) => ({
              ...prev,
              image: payload.data || null,
            }));
          } else if (evt.event === 'done') {
            setState((prev) => ({ ...prev, phase: 'done' }));
          } else if (evt.event === 'error') {
            const payload = JSON.parse(evt.data) as { message?: string };
            throw new Error(payload.message || 'Server stream error.');
          }
        }
      }

      setState((prev) => ({ ...prev, phase: prev.phase === 'error' ? 'error' : 'done' }));
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : 'Unknown stream error';
      setState({ phase: 'error', insights: [], image: null, error: message });
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, [stop]);

  return { state, start, stop };
}
