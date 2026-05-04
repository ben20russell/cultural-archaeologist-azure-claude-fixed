export const MAX_RECENT_RESULTS = 6;

export const APP_RECENT_RESULTS_MODES = {
  BRAND_NAVIGATOR: 'brand_navigator_recent_results',
  DESIGN_EXCAVATOR: 'design_excavator_recent_results',
  CULTURAL_ARCHAEOLOGIST: 'cultural_archaeologist_recent_results',
} as const;

export type RecentResultsMode =
  (typeof APP_RECENT_RESULTS_MODES)[keyof typeof APP_RECENT_RESULTS_MODES];

export type RecentResultRecord = {
  id: string | number;
  title: string;
  description?: string;
  [key: string]: unknown;
};

const safeLocalStorage = (): Storage | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch (error) {
    console.error('[recent-results-storage] Unable to access localStorage.', error);
    return null;
  }
};

const isRecentResultRecord = (value: unknown): value is RecentResultRecord => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const hasValidId = typeof candidate.id === 'string' || typeof candidate.id === 'number';
  const hasValidTitle = typeof candidate.title === 'string';

  return hasValidId && hasValidTitle;
};

export const getRecentResults = <T extends RecentResultRecord>(mode: RecentResultsMode): T[] => {
  const storage = safeLocalStorage();
  if (!storage) {
    console.log('[recent-results-storage] No storage available. Returning empty list.', { mode });
    return [];
  }

  try {
    const raw = storage.getItem(mode);
    if (!raw) {
      console.log('[recent-results-storage] No recent results found for mode.', { mode });
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.log('[recent-results-storage] Stored value was not an array. Resetting mode.', { mode });
      return [];
    }

    const validated = parsed.filter(isRecentResultRecord) as T[];
    if (validated.length !== parsed.length) {
      console.log('[recent-results-storage] Dropped invalid recent result records.', {
        mode,
        receivedCount: parsed.length,
        validCount: validated.length,
      });
    }

    return validated;
  } catch (error) {
    console.error('[recent-results-storage] Failed to parse recent results.', { mode, error });
    return [];
  }
};

export const saveRecentResult = <T extends RecentResultRecord>(
  mode: RecentResultsMode,
  resultItem: T
): T[] => {
  const storage = safeLocalStorage();
  if (!storage) {
    console.log('[recent-results-storage] No storage available. Skipping save.', { mode, resultItem });
    return [];
  }

  if (!isRecentResultRecord(resultItem)) {
    console.log('[recent-results-storage] Ignoring invalid recent result payload.', {
      mode,
      resultItem,
    });
    return getRecentResults<T>(mode);
  }

  const currentResults = getRecentResults<T>(mode);
  const deduped = currentResults.filter(
    (item) => String(item.id) !== String(resultItem.id)
  );
  const next = [resultItem, ...deduped].slice(0, MAX_RECENT_RESULTS);

  try {
    storage.setItem(mode, JSON.stringify(next));
    console.log('[recent-results-storage] Saved recent result.', {
      mode,
      id: resultItem.id,
      nextCount: next.length,
    });
  } catch (error) {
    console.error('[recent-results-storage] Failed to save recent result.', {
      mode,
      id: resultItem.id,
      error,
    });
  }

  return next;
};

export const clearRecentResults = (mode: RecentResultsMode): void => {
  const storage = safeLocalStorage();
  if (!storage) {
    console.log('[recent-results-storage] No storage available. Skipping clear.', { mode });
    return;
  }

  try {
    storage.removeItem(mode);
    console.log('[recent-results-storage] Cleared recent results for mode.', { mode });
  } catch (error) {
    console.error('[recent-results-storage] Failed to clear recent results.', { mode, error });
  }
};
