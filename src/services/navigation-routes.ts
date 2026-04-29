export type RootView = 'app' | 'privacy-policy' | 'brand-navigator';

const normalizePathname = (pathname: string): string => {
  const trimmed = pathname.trim();
  if (!trimmed) return '/';

  let normalized = trimmed.toLowerCase();
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
};

const normalizeHash = (hash: string): string => {
  const trimmed = hash.trim();
  if (!trimmed) return '';

  const normalized = trimmed.toLowerCase();
  return normalized.startsWith('#') ? normalized : `#${normalized}`;
};

export const isPrivacyPolicyPath = (pathname: string): boolean => {
  return normalizePathname(pathname) === '/privacy-policy';
};

export const isBrandNavigatorPath = (pathname: string): boolean => {
  const normalizedPath = normalizePathname(pathname);
  return (
    normalizedPath === '/brand-navigator' ||
    normalizedPath === '/brandnavigator'
  );
};

export const isBrandNavigatorRoute = (pathname: string, hash: string): boolean => {
  const normalizedHash = normalizeHash(hash);
  return (
    isBrandNavigatorPath(pathname) ||
    normalizedHash === '#brand-navigator' ||
    normalizedHash === '#brandnavigator'
  );
};

export const resolveRootView = (pathname: string, hash: string): RootView => {
  if (isPrivacyPolicyPath(pathname)) {
    return 'privacy-policy';
  }
  if (isBrandNavigatorRoute(pathname, hash)) {
    return 'brand-navigator';
  }
  return 'app';
};
