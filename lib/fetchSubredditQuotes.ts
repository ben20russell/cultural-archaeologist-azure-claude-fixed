const REDDIT_BASE_URL = 'https://www.reddit.com';
const DEFAULT_POST_LIMIT = 5;
const REDDIT_TIMEOUT_MS = 10000;

type RedditPostData = {
  title?: string;
  selftext?: string;
};

type RedditListingChild = {
  data?: RedditPostData;
};

type RedditListingResponse = {
  data?: {
    children?: RedditListingChild[];
  };
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function stripUrls(value: string): string {
  return value.replace(/https?:\/\/\S+|www\.\S+/gi, ' ');
}

function stripSpecialCharacters(value: string): string {
  // Keep letters, numbers, spacing, and sentence punctuation for usable verbatim context.
  return value.replace(/[^\p{L}\p{N}\s.,!?;:'"()\-]/gu, ' ');
}

function sanitizeQuote(value: string): string {
  const withoutUrls = stripUrls(value);
  const withoutSpecialChars = stripSpecialCharacters(withoutUrls);
  return normalizeWhitespace(withoutSpecialChars);
}

function isMeaningfulQuote(value: string): boolean {
  const normalized = value.toLowerCase();
  return Boolean(normalized) && normalized !== '[removed]' && normalized !== '[deleted]';
}

function toPostQuote(post: RedditPostData): string {
  const title = sanitizeQuote(post.title || '');
  const selftext = sanitizeQuote(post.selftext || '');

  if (title && selftext) {
    return `${title} ${selftext}`;
  }

  return title || selftext;
}

function assertValidSubredditName(subreddit: string): string {
  const trimmed = subreddit.trim();
  if (!trimmed) {
    throw new Error('Subreddit name is required.');
  }

  // Reddit allows letters, numbers, and underscores in subreddit names.
  if (!/^[A-Za-z0-9_]+$/.test(trimmed)) {
    throw new Error('Invalid subreddit name format.');
  }

  return trimmed;
}

async function fetchHotPosts(subreddit: string, limit: number): Promise<RedditPostData[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REDDIT_TIMEOUT_MS);

  try {
    const url = new URL(`/r/${subreddit}/hot.json`, REDDIT_BASE_URL);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('raw_json', '1');

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'CulturalArcheologistSubredditFetcher/1.0',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Reddit API request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as RedditListingResponse;
    const children = payload.data?.children || [];
    return children.map((child) => child.data || {});
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Reddit API request timed out.');
    }

    const message = error instanceof Error ? error.message : 'Unknown Reddit API error.';
    throw new Error(message);
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchSubredditQuotes(subredditName: string, limit = DEFAULT_POST_LIMIT): Promise<string[]> {
  const subreddit = assertValidSubredditName(subredditName);
  const cappedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), DEFAULT_POST_LIMIT)) : DEFAULT_POST_LIMIT;

  const posts = await fetchHotPosts(subreddit, cappedLimit);

  return posts
    .map(toPostQuote)
    .filter(isMeaningfulQuote)
    .slice(0, DEFAULT_POST_LIMIT);
}
