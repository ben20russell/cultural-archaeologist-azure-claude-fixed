type TextInsightPayload = {
  type: 'insights';
  data: {
    audience: string;
    insights: string[];
  };
};

type ImagePayload = {
  type: 'image';
  data: {
    url: string;
    blurhash: string;
    dominantColor: string;
  };
};

async function generateTextInsights(audience: string): Promise<string[]> {
  // Mock implementation; replace with real text generation.
  return [
    `Audience signal: ${audience} values practical utility over novelty.`,
    `${audience} responds to visual proof and concrete outcomes.`,
    `Tone strategy: concise, clear, and confidence-forward narratives.`,
  ];
}

async function generateAndStoreImage(audience: string): Promise<ImagePayload['data']> {
  // Mock long-running image pipeline.
  await new Promise((resolve) => setTimeout(resolve, 10000));
  return {
    url: `https://cdn.example.com/personas/${encodeURIComponent(audience)}.png`,
    blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
    dominantColor: '#1FCAD3',
  };
}

function sseEncode(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const audience = (url.searchParams.get('audience') || '').trim();

  if (!audience) {
    return new Response(JSON.stringify({ error: 'Missing audience query parameter.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        // Keep-alive ping so proxies establish the stream quickly.
        controller.enqueue(encoder.encode(': connected\n\n'));

        const insights = await generateTextInsights(audience);
        const textPayload: TextInsightPayload = {
          type: 'insights',
          data: { audience, insights },
        };
        controller.enqueue(encoder.encode(sseEncode('insights', textPayload)));

        // Background-style second phase on same stream.
        const imageData = await generateAndStoreImage(audience);
        const imagePayload: ImagePayload = { type: 'image', data: imageData };
        controller.enqueue(encoder.encode(sseEncode('image', imagePayload)));

        controller.enqueue(encoder.encode('event: done\ndata: {"ok":true}\n\n'));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown SSE error';
        controller.enqueue(
          encoder.encode(sseEncode('error', { type: 'error', message }))
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
