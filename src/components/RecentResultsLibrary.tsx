import React, { useEffect, useMemo, useState } from 'react';
import { Clock, Trash2 } from 'lucide-react';
import {
  clearRecentResults,
  getRecentResults,
  RecentResultRecord,
  RecentResultsMode,
} from '../services/recent-results-storage';

type RecentResultsLibraryProps<T extends RecentResultRecord> = {
  mode: RecentResultsMode;
  title?: string;
  emptyMessage?: string;
  refreshNonce?: number;
  onSelectItem: (item: T) => void;
  className?: string;
};

export function RecentResultsLibrary<T extends RecentResultRecord>({
  mode,
  title = 'Recent Projects',
  refreshNonce = 0,
  onSelectItem,
  className = '',
}: RecentResultsLibraryProps<T>) {
  const [recentResults, setRecentResults] = useState<T[]>([]);

  useEffect(() => {
    const next = getRecentResults<T>(mode);
    console.log('[RecentResultsLibrary] Loaded recent results.', {
      mode,
      count: next.length,
      refreshNonce,
    });
    setRecentResults(next);
  }, [mode, refreshNonce]);

  const hasResults = recentResults.length > 0;

  const clearHistory = () => {
    console.log('[RecentResultsLibrary] Clearing recent results.', { mode, previousCount: recentResults.length });
    clearRecentResults(mode);
    setRecentResults([]);
  };

  const heading = useMemo(() => `${title}`, [title]);

  if (!hasResults) {
    return null;
  }

  return (
    <section
      className={`w-full rounded-2xl border border-zinc-200/80 bg-zinc-50/55 p-4 sm:p-5 ${className}`.trim()}
      data-testid="recent-results-library"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium uppercase tracking-wide text-zinc-600 flex items-center gap-2" data-testid="recent-results-title">
          <Clock className="h-4 w-4 text-zinc-400" />
          {heading}
        </h3>
        <button
          type="button"
          onClick={clearHistory}
          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white/70 px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-white hover:text-zinc-900 transition-colors disabled:opacity-50"
          data-testid="clear-recent-history"
          aria-label="Clear History"
          disabled={!hasResults}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear History
        </button>
      </div>

      <div className="flex flex-wrap gap-2" data-testid="recent-results-list">
        {recentResults.map((item) => (
          <button
            key={String(item.id)}
            type="button"
            onClick={() => {
              console.log('[RecentResultsLibrary] Selected recent result item.', { mode, id: item.id, title: item.title });
              onSelectItem(item);
            }}
            className="w-full sm:w-[22rem] rounded-lg border border-zinc-200/80 bg-white/80 px-3 py-2 text-left hover:border-zinc-300 hover:bg-white transition-colors"
            data-testid={`recent-result-item-${String(item.id)}`}
            aria-label={item.title}
          >
            <p className="truncate text-sm font-medium text-zinc-900">{item.title}</p>
            {item.description ? (
              <p className="mt-1 line-clamp-2 text-xs text-zinc-600">{item.description}</p>
            ) : null}
          </button>
        ))}
      </div>
    </section>
  );
}
