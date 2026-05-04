import { describe, expect, it } from 'vitest';
import {
  buildBrandModeSubQueries,
  deriveRecentNewsFromSources,
  extractUrlsFromEvidenceDigest,
  formatDevilsAdvocateLens,
  getDeploymentCandidatesFromEnv,
  scoreEvidenceDomain,
  shouldRetryWithAlternateDeployment,
} from './azure-openai';

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

describe('deployment fallback helpers', () => {
  it('builds unique deployment candidates in priority order', () => {
    const candidates = getDeploymentCandidatesFromEnv({
      AZURE_OPENAI_PRIMARY_DEPLOYMENT_NAME: 'gpt-5.4',
      AZURE_OPENAI_DEPLOYMENT_NAME: 'gpt-5.4-mini',
      AZURE_OPENAI_FALLBACK_DEPLOYMENT_NAME: 'gpt-4o-mini',
    } as NodeJS.ProcessEnv);

    expect(candidates).toEqual(['gpt-5.4', 'gpt-5.4-mini', 'gpt-4o-mini', 'gpt-4o']);
  });

  it('recognizes invalid_prompt as retryable on an alternate deployment', () => {
    const shouldRetry = shouldRetryWithAlternateDeployment({
      status: 400,
      code: 'invalid_prompt',
      message: 'Invalid prompt',
    });

    expect(shouldRetry).toBe(true);
  });

  it('does not retry validation style client errors', () => {
    const shouldRetry = shouldRetryWithAlternateDeployment({
      status: 400,
      code: 'unsupported_parameter',
      message: 'Unsupported parameter',
    });

    expect(shouldRetry).toBe(false);
  });
});

describe('brand evidence query helpers', () => {
  it('builds targeted brand-mode dork queries from brand context', () => {
    const queries = buildBrandModeSubQueries('Brands: Nike, Adidas; Audience: runners; Topic: footwear');

    expect(queries).toHaveLength(5);
    expect(queries[0]).toContain('"Nike"');
    expect(queries[0]).toContain('site:sec.gov');
    expect(queries[1]).toContain('site:adweek.com');
    expect(queries[3]).toContain('site:trustpilot.com');
  });
});

describe('evidence domain scoring', () => {
  it('classifies SEC and trade press domains as authoritative', () => {
    expect(scoreEvidenceDomain('https://www.sec.gov/ixviewer/ix.html')).toEqual({ quality: 'authoritative', weight: 1.3 });
    expect(scoreEvidenceDomain('https://www.thedrum.com/news')).toEqual({ quality: 'authoritative', weight: 1.3 });
  });

  it('classifies review and community domains with lower behavioral/community weights', () => {
    expect(scoreEvidenceDomain('https://www.g2.com/products/acme/reviews')).toEqual({ quality: 'behavioral', weight: 0.9 });
    expect(scoreEvidenceDomain('https://www.trustpilot.com/review/example.com')).toEqual({ quality: 'behavioral', weight: 0.9 });
    expect(scoreEvidenceDomain('https://twitter.com/example')).toEqual({ quality: 'community', weight: 0.7 });
  });
});

describe('recent news fallback derivation', () => {
  it('derives article headlines from sources when recentNews is empty', () => {
    const fallback = deriveRecentNewsFromSources([
      {
        title: 'Patagonia expands retail footprint in key U.S. metros',
        url: 'https://www.foxnews.com/lifestyle/patagonia-expands-retail-footprint',
      },
      {
        title: 'Sources',
        url: 'https://example.com/source-index',
      },
    ]);

    expect(fallback).toHaveLength(1);
    expect(fallback[0].headline).toContain('Patagonia expands retail footprint');
    expect(fallback[0].url).toBe('https://www.foxnews.com/lifestyle/patagonia-expands-retail-footprint');
  });

  it('excludes social media URLs from recent news source fallback', () => {
    const fallback = deriveRecentNewsFromSources([
      {
        title: 'Patagonia post on X',
        url: 'https://x.com/patagonia/status/12345',
      },
      {
        title: 'Patagonia expands retail footprint in key U.S. metros',
        url: 'https://www.foxnews.com/lifestyle/patagonia-expands-retail-footprint',
      },
    ]);

    expect(fallback).toHaveLength(1);
    expect(fallback[0].url).toBe('https://www.foxnews.com/lifestyle/patagonia-expands-retail-footprint');
  });
});

describe('evidence digest URL extraction', () => {
  it('returns normalized, unique URLs from the evidence digest', () => {
    const urls = extractUrlsFromEvidenceDigest(`
1. (authoritative) Census Pulse survey | https://www.census.gov/library/stories/example
2. (mainstream) Reuters market signal | http://www.reuters.com/world/example-story
3. (community) duplicate source | https://www.census.gov/library/stories/example
    `);

    expect(urls).toEqual([
      'https://www.census.gov/library/stories/example',
      'http://www.reuters.com/world/example-story',
    ]);
  });
});
