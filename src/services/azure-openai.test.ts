import { describe, expect, it } from 'vitest';
import { formatDevilsAdvocateLens } from './azure-openai';

describe('formatDevilsAdvocateLens', () => {
  it('uses consolidated summary when provided', () => {
    const result = formatDevilsAdvocateLens({
      counterArgument: 'Long counter argument that is intentionally verbose.',
      keyWeaknesses: ['Weakness one', 'Weakness two'],
      consolidatedSummary: 'Tight summary preserving all core claims and risks.',
    });

    expect(result).toBe('Tight summary preserving all core claims and risks.');
  });

  it('falls back to counter argument when consolidated summary is empty', () => {
    const result = formatDevilsAdvocateLens({
      counterArgument: 'Counter argument fallback text.',
      keyWeaknesses: ['Weakness one'],
      consolidatedSummary: '   ',
    });

    expect(result).toBe('Counter argument fallback text.');
  });

  it('returns a friendly fallback when no lens text is available', () => {
    const result = formatDevilsAdvocateLens({
      counterArgument: '   ',
      keyWeaknesses: [],
      consolidatedSummary: '',
    });

    expect(result).toBe('Alternative interpretation not available.');
  });
});
