const FALLBACK_BRAND_SUGGESTIONS = [
  'Nike',
  'Nikon',
  'Nintendo',
  'Netflix',
  'Nestle',
  'Nespresso',
  'North Face',
  'New Balance',
  'Apple',
  'Amazon',
  'Adobe',
  'Airbnb',
  'Google',
  'Meta',
  'Microsoft',
  'OpenAI',
  'Spotify',
  'Starbucks',
  'Samsung',
  'Sony',
  'Target',
  'Tesla',
  'TikTok',
  'YouTube',
];

export const BRAND_SUGGESTION_DEBOUNCE_MS = 180;

const dedupeCaseInsensitive = (values: string[]): string[] => {
  const seen = new Set<string>();
  const unique: string[] = [];

  values.forEach((value) => {
    const trimmed = (value || '').trim();
    if (!trimmed) return;

    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(trimmed);
  });

  return unique;
};

export const parseBrandsInput = (value: string): string[] => {
  const parsed = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return dedupeCaseInsensitive(parsed);
};

export const getLocalBrandSuggestions = (query: string, savedBrandValues: string[]): string[] => {
  const normalizedQuery = (query || '').trim().toLowerCase();
  if (normalizedQuery.length < 2) return [];

  const fromSavedSearches = savedBrandValues
    .flatMap((brandValue) => parseBrandsInput(brandValue || ''))
    .filter(Boolean);

  const merged = dedupeCaseInsensitive([...fromSavedSearches, ...FALLBACK_BRAND_SUGGESTIONS]);

  return merged
    .filter((candidate) => candidate.toLowerCase().includes(normalizedQuery))
    .slice(0, 8);
};

export const normalizeBrandTokens = (values: string[]): string[] => {
  return dedupeCaseInsensitive(values.map((value) => (value || '').trim()).filter(Boolean));
};
