import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_RECENT_RESULTS_MODES,
  clearRecentResults,
  getRecentResults,
  MAX_RECENT_RESULTS,
  saveRecentResult,
} from './recent-results-storage';

type MockResult = {
  id: string;
  title: string;
  description: string;
  extra?: string;
};

describe('recent-results-storage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('returns empty array when mode has no records', () => {
    expect(getRecentResults<MockResult>(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR)).toEqual([]);
  });

  it('keeps data siloed by app mode', () => {
    saveRecentResult(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR, {
      id: 'brand-1',
      title: 'Brand One',
      description: 'Brand result',
    });

    saveRecentResult(APP_RECENT_RESULTS_MODES.DESIGN_EXCAVATOR, {
      id: 'design-1',
      title: 'Design One',
      description: 'Design result',
    });

    const brandResults = getRecentResults<MockResult>(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR);
    const designResults = getRecentResults<MockResult>(APP_RECENT_RESULTS_MODES.DESIGN_EXCAVATOR);

    expect(brandResults).toHaveLength(1);
    expect(designResults).toHaveLength(1);
    expect(brandResults[0]?.id).toBe('brand-1');
    expect(designResults[0]?.id).toBe('design-1');
  });

  it('moves duplicate item to the front instead of duplicating', () => {
    saveRecentResult(APP_RECENT_RESULTS_MODES.CULTURAL_ARCHAEOLOGIST, {
      id: 'a',
      title: 'A',
      description: 'First',
    });
    saveRecentResult(APP_RECENT_RESULTS_MODES.CULTURAL_ARCHAEOLOGIST, {
      id: 'b',
      title: 'B',
      description: 'Second',
    });

    saveRecentResult(APP_RECENT_RESULTS_MODES.CULTURAL_ARCHAEOLOGIST, {
      id: 'a',
      title: 'A Updated',
      description: 'Re-opened',
      extra: 'kept object payload',
    });

    const results = getRecentResults<MockResult>(APP_RECENT_RESULTS_MODES.CULTURAL_ARCHAEOLOGIST);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      id: 'a',
      title: 'A Updated',
      description: 'Re-opened',
      extra: 'kept object payload',
    });
    expect(results[1]?.id).toBe('b');
  });

  it('caps history at MAX_RECENT_RESULTS', () => {
    for (let i = 0; i < MAX_RECENT_RESULTS + 3; i += 1) {
      saveRecentResult(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR, {
        id: `id-${i}`,
        title: `Title ${i}`,
        description: `Description ${i}`,
      });
    }

    const results = getRecentResults<MockResult>(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR);

    expect(results).toHaveLength(MAX_RECENT_RESULTS);
    expect(results[0]?.id).toBe(`id-${MAX_RECENT_RESULTS + 2}`);
    expect(results[MAX_RECENT_RESULTS - 1]?.id).toBe('id-3');
  });

  it('clears history for a single mode', () => {
    saveRecentResult(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR, {
      id: 'brand-1',
      title: 'Brand One',
      description: 'Brand result',
    });
    saveRecentResult(APP_RECENT_RESULTS_MODES.DESIGN_EXCAVATOR, {
      id: 'design-1',
      title: 'Design One',
      description: 'Design result',
    });

    clearRecentResults(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR);

    expect(getRecentResults<MockResult>(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR)).toEqual([]);
    expect(getRecentResults<MockResult>(APP_RECENT_RESULTS_MODES.DESIGN_EXCAVATOR)).toHaveLength(1);
  });

  it('returns empty array if stored JSON is invalid', () => {
    const parseSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR, '{invalid_json');

    expect(getRecentResults<MockResult>(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR)).toEqual([]);
    expect(parseSpy).toHaveBeenCalled();
  });
});
