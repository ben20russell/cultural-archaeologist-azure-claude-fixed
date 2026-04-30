import { describe, expect, it } from 'vitest';
import { getLocalBrandSuggestions, normalizeBrandTokens, parseBrandsInput } from './brand-input';

describe('brand-input helpers', () => {
  it('parses comma-separated brands without duplicates', () => {
    expect(parseBrandsInput('Nike, Adidas, nike')).toEqual(['Nike', 'Adidas']);
  });

  it('normalizes brand tokens without changing free-form category text', () => {
    expect(normalizeBrandTokens(['Outdoor lifestyle', 'outdoor lifestyle', 'Gen Z culture'])).toEqual([
      'Outdoor lifestyle',
      'Gen Z culture',
    ]);
  });

  it('returns fast local suggestions from saved brand values', () => {
    const suggestions = getLocalBrandSuggestions('ni', ['Nike, Adidas', 'Nintendo']);
    expect(suggestions).toContain('Nike');
    expect(suggestions).toContain('Nintendo');
  });
});
