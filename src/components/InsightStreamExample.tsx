import { useState } from 'react';
import { useInsightStream } from './useInsightStream';

export function InsightStreamExample() {
  const [audience, setAudience] = useState('Gen Z beauty shoppers');
  const { state, start, stop } = useInsightStream();

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-3">
      <h3 className="text-sm font-semibold text-zinc-900">Insight Stream Demo</h3>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          placeholder="Target audience"
        />
        <button
          type="button"
          onClick={() => start(audience)}
          className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white"
        >
          Start Stream
        </button>
        <button
          type="button"
          onClick={stop}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700"
        >
          Stop
        </button>
      </div>

      <p className="text-xs text-zinc-500">Phase: {state.phase}</p>

      <ul className="list-disc pl-5 text-sm text-zinc-700 space-y-1">
        {state.insights.map((item, idx) => (
          <li key={`${idx}-${item}`}>{item}</li>
        ))}
      </ul>

      {state.image && (
        <div className="rounded-xl border border-zinc-200 p-3 space-y-2">
          <img src={state.image.url} alt="Generated persona" className="h-40 w-full object-cover rounded-lg" />
          <p className="text-xs text-zinc-600">Dominant color: {state.image.dominantColor}</p>
          <p className="text-xs text-zinc-600">Blurhash: {state.image.blurhash}</p>
        </div>
      )}

      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </section>
  );
}
