

type TrendStage = 'emerging' | 'peaking' | 'declining';

const STAGE_LABELS: Record<TrendStage, string> = {
  emerging: 'Emerging',
  peaking: 'Peaking',
  declining: 'Declining',
};

const STAGE_TONE: Record<TrendStage, string> = {
  emerging: 'bg-amber-50 text-amber-700 border-amber-200',
  peaking: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  declining: 'bg-zinc-100 text-zinc-700 border-zinc-200',
};

const normalizeStage = (stage?: string): TrendStage => {
  if (stage === 'peaking' || stage === 'declining') {
    return stage;
  }
  return 'emerging';
};

export function TrendLifecycleBadge({ stage }: { stage?: string }) {
  const normalizedStage = normalizeStage(stage);

  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider align-middle ${STAGE_TONE[normalizedStage]}`}
      title={`Trend lifecycle: ${STAGE_LABELS[normalizedStage]}`}
    >
      {STAGE_LABELS[normalizedStage]}
    </span>
  );
}
