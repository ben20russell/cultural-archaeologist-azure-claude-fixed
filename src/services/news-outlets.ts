import { normalizeExternalHttpUrl } from './external-links';

// Strict allowlist for Recent News sourcing.
// All entries are hostnames; subdomains are allowed.
export const TOP_MAINSTREAM_NEWS_HOSTS: string[] = [
  'reuters.com',
  'apnews.com',
  'nytimes.com',
  'wsj.com',
  'ft.com',
  'bloomberg.com',
  'washingtonpost.com',
  'usatoday.com',
  'latimes.com',
  'theguardian.com',
  'npr.org',
  'abcnews.go.com',
  'cbsnews.com',
  'nbcnews.com',
  'cnn.com',
  'bbc.com',
  'bbc.co.uk',
  'forbes.com',
  'fortune.com',
  'businessinsider.com',
  'newsweek.com',
  'time.com',
  'axios.com',
  'politico.com',
  'thehill.com',
  'huffpost.com',
  'marketwatch.com',
  'cnbc.com',
  'investing.com',
  'economist.com',
  'newyorker.com',
  'aljazeera.com',
  'dw.com',
  'france24.com',
  'thetimes.co.uk',
  'telegraph.co.uk',
  'independent.co.uk',
  'theatlantic.com',
  'semafor.com',
  'scmp.com',
  'straitstimes.com',
  'japantimes.co.jp',
  'globalnews.ca',
  'ctvnews.ca',
  'cbc.ca',
  'smh.com.au',
  'theage.com.au',
  'afr.com',
  'irishtimes.com',
  'elpais.com',
];

// Secondary mainstream fallback list.
// Used only when strict top-50 filtering returns no items.
export const SECONDARY_MAINSTREAM_NEWS_HOSTS: string[] = [
  'foxnews.com',
  'msn.com',
  'yahoo.com',
  'yahoo.co.jp',
  'usnews.com',
  'news.com.au',
  'nationalpost.com',
  'torontosun.com',
  'suntimes.com',
  'denverpost.com',
  'sfchronicle.com',
  'bostonglobe.com',
  'seattletimes.com',
  'philly.com',
  'nypost.com',
  'dailymail.co.uk',
  'mirror.co.uk',
  'edition.cnn.com',
  'today.com',
  'skift.com',
];

const matchesAllowedHostname = (hostname: string, allowed: string): boolean => {
  return hostname === allowed || hostname.endsWith(`.${allowed}`);
};

export const isTopMainstreamNewsUrl = (url?: string | null): boolean => {
  const safeUrl = normalizeExternalHttpUrl(url);
  if (!safeUrl) return false;

  try {
    const hostname = new URL(safeUrl).hostname.toLowerCase();
    return TOP_MAINSTREAM_NEWS_HOSTS.some((allowed) => matchesAllowedHostname(hostname, allowed));
  } catch {
    return false;
  }
};

export const isMainstreamNewsUrl = (url?: string | null): boolean => {
  const safeUrl = normalizeExternalHttpUrl(url);
  if (!safeUrl) return false;

  try {
    const hostname = new URL(safeUrl).hostname.toLowerCase();
    return (
      TOP_MAINSTREAM_NEWS_HOSTS.some((allowed) => matchesAllowedHostname(hostname, allowed)) ||
      SECONDARY_MAINSTREAM_NEWS_HOSTS.some((allowed) => matchesAllowedHostname(hostname, allowed))
    );
  } catch {
    return false;
  }
};

export const isLikelyArticleUrl = (url?: string | null): boolean => {
  const safeUrl = normalizeExternalHttpUrl(url);
  if (!safeUrl) return false;

  try {
    const parsed = new URL(safeUrl);
    const pathname = (parsed.pathname || '').trim().toLowerCase();
    if (!pathname || pathname === '/' || pathname === '/home' || pathname === '/index.html') {
      return false;
    }

    const normalizedPath = pathname.replace(/\/+$/, '');
    if (!normalizedPath || normalizedPath === '') return false;

    const segments = normalizedPath.split('/').filter(Boolean);
    if (segments.length === 0) return false;

    const homepageLikeSegment = /^(news|latest|top|world|business|markets|technology|tech|politics|opinion|video|videos|sections?)$/i;
    if (segments.length === 1 && homepageLikeSegment.test(segments[0])) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
};
