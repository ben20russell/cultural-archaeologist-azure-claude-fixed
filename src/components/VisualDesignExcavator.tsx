import PptxGenJS from 'pptxgenjs';
import { ProgressiveLoader } from './ProgressiveLoader';
import React, { useEffect, useRef, useState, useCallback } from 'react';
// Loader state for all visuals
const useAllVisualsLoaded = (
  report: BrandDeepDiveReport | null,
  bestVisualsByBrand: Record<string, BrandVisualSelection>
): {
  allVisualsLoaded: boolean;
  handleImageLoad: () => void;
  handleImageError: () => void;
  expectedCount: number;
} => {
  const [allVisualsLoaded, setAllVisualsLoaded] = useState(false);
  const [expectedCount, setExpectedCount] = useState(0);
  const loadedCountRef = useRef(0);

  useEffect(() => {
    if (!report || !bestVisualsByBrand) {
      setAllVisualsLoaded(false);
      setExpectedCount(0);
      loadedCountRef.current = 0;
      return;
    }
    // Count all logo + visual images for all brands
    let count = 0;
    report.brandProfiles.forEach((profile: any) => {
      const visuals = bestVisualsByBrand[profile.brandName];
      if (visuals) {
        // logo
        if (visuals.deterministicLogoUrl) count += 1;
        // visual reference cards
        count += visuals.images.length;
      }
    });
    setExpectedCount(count);
    loadedCountRef.current = 0;
    setAllVisualsLoaded(count === 0); // If no images, consider loaded
  }, [report, bestVisualsByBrand]);

  const handleImageLoad = useCallback(() => {
    loadedCountRef.current += 1;
    if (loadedCountRef.current >= expectedCount && expectedCount > 0) {
      setAllVisualsLoaded(true);
    }
  }, [expectedCount]);

  const handleImageError = useCallback(() => {
    loadedCountRef.current += 1;
    if (loadedCountRef.current >= expectedCount && expectedCount > 0) {
      setAllVisualsLoaded(true);
    }
  }, [expectedCount]);

  // Reset on new report
  useEffect(() => {
    if (!report) {
      setAllVisualsLoaded(false);
      setExpectedCount(0);
      loadedCountRef.current = 0;
    }
  }, [report]);

  return { allVisualsLoaded, handleImageLoad, handleImageError, expectedCount };
};
import { motion, AnimatePresence } from 'framer-motion';
import { Search, RefreshCw, Info, Sparkles, Building2, Users, Trash2, Plus, Crosshair, Loader2, Presentation, FileText, ImageIcon, Type, Palette, Clock, ExternalLink, Share2 } from 'lucide-react';
import { BrandColorSpec, BrandDeepDiveReport, generateBrandDeepDive, submitBrandDeepDivePrompt, suggestBrandWebsite } from '../services/azure-openai';
import { supabase } from '../services/supabase-client';
import { Accordion } from './Accordion';

interface BrandDeepDivePageProps {
  onBack: () => void;
}

type VisualMethod = 'deterministic' | 'screenshot';

interface BrandVisualCard {
  label: string;
  url: string;
  originalUrl?: string;
  status?: 'ok' | 'fallback' | 'placeholder';
}

interface BrandVisualSelection {
  method: VisualMethod;
  images: BrandVisualCard[];
  deterministicLogoUrl?: string;
}

interface SavedDeepDiveSearch {
  id: string;
  date: string;
  brands: Array<{ name: string; website?: string }>;
  analysisObjective: string;
  targetAudience: string;
  report: BrandDeepDiveReport;
  customName?: string;
}

type ResultTab = 'profiles' | 'compare';
type CompareElement = 'primaryColors' | 'accentColors' | 'neutrals' | 'typography' | 'imageryStyle';

interface ComparePopupState {
  x: number;
  y: number;
  target: CompareElement;
}

const VISUAL_METHOD_LABEL: Record<VisualMethod, string> = {
  deterministic: 'Derived Domain Logo',
  screenshot: 'Website Screenshot Previews',
};

const getImageProxyBaseUrl = (): string => {
  const configured = (((import.meta as any).env?.VITE_IMAGE_PROXY_BASE_URL as string) || '').trim();
  if (configured) {
    return configured.replace(/\/$/, '');
  }

  return '';
};

function withImageProxy(rawUrl: string): string {
  if (!rawUrl || rawUrl.startsWith('data:image')) {
    return rawUrl;
  }

  if (rawUrl.includes('/api/image-proxy?url=')) {
    return rawUrl;
  }

  const normalized = normalizeHttpUrl(rawUrl);
  if (!normalized) {
    return rawUrl;
  }

  const proxyBase = getImageProxyBaseUrl();
  if (!proxyBase) {
    return normalized;
  }

  return `${proxyBase}/api/image-proxy?url=${encodeURIComponent(normalized)}`;
}

function normalizeHttpUrl(rawUrl?: string | null): string | null {
  if (!rawUrl) return null;

  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function getDomainFromUrl(url?: string | null): string | null {
  const normalized = normalizeHttpUrl(url);
  if (!normalized) return null;

  try {
    return new URL(normalized).hostname;
  } catch {
    return null;
  }
}

function getOriginFromUrl(url?: string | null): string | null {
  const normalized = normalizeHttpUrl(url);
  if (!normalized) return null;

  try {
    return new URL(normalized).origin;
  } catch {
    return null;
  }
}

function buildDeterministicLogoUrl(website?: string | null): string | null {
  const origin = getOriginFromUrl(website);
  if (!origin) return null;
  return `${origin}/logo.svg`;
}

function buildLargeLogoCandidateUrls(website?: string | null): string[] {
  const origin = getOriginFromUrl(website);
  const deterministicLogo = buildDeterministicLogoUrl(website);

  return dedupeVisualCards(
    [
      origin ? { label: 'Primary Logo', url: `${origin}/logo.svg` } : null,
      origin ? { label: 'Primary Logo PNG', url: `${origin}/logo.png` } : null,
      origin ? { label: 'Primary Logo WEBP', url: `${origin}/logo.webp` } : null,
      origin ? { label: 'Wordmark', url: `${origin}/wordmark.svg` } : null,
      origin ? { label: 'Wordmark PNG', url: `${origin}/wordmark.png` } : null,
      origin ? { label: 'Brand Mark', url: `${origin}/brandmark.svg` } : null,
      origin ? { label: 'Brand Mark PNG', url: `${origin}/brandmark.png` } : null,
      origin ? { label: 'Site Logo', url: `${origin}/logo.png` } : null,
      origin ? { label: 'Site Logo SVG', url: `${origin}/logo.svg` } : null,
      origin ? { label: 'Site Logo Alt', url: `${origin}/assets/logo.png` } : null,
      origin ? { label: 'Site Logo Alt SVG', url: `${origin}/assets/logo.svg` } : null,
      origin ? { label: 'Site Logo Image', url: `${origin}/images/logo.png` } : null,
      origin ? { label: 'Site Logo Image SVG', url: `${origin}/images/logo.svg` } : null,
      origin ? { label: 'Apple Touch Icon', url: `${origin}/apple-touch-icon.png` } : null,
      origin ? { label: 'Apple Touch Icon Precomposed', url: `${origin}/apple-touch-icon-precomposed.png` } : null,
      origin ? { label: 'Android Chrome Icon', url: `${origin}/android-chrome-512x512.png` } : null,
      origin ? { label: 'Android Chrome Icon Alt', url: `${origin}/android-chrome-192x192.png` } : null,
      origin ? { label: 'Favicon SVG', url: `${origin}/favicon.svg` } : null,
      origin ? { label: 'Favicon PNG', url: `${origin}/favicon.png` } : null,
      origin ? { label: 'Favicon ICO', url: `${origin}/favicon.ico` } : null,
      origin ? { label: 'Apple Icon 180', url: `${origin}/apple-touch-icon-180x180.png` } : null,
      deterministicLogo ? { label: 'Fallback Logo Asset', url: deterministicLogo } : null,
    ].filter((card): card is BrandVisualCard => Boolean(card))
  ).map((card) => card.url);
}

function buildLargeVisualCandidateUrls(website?: string | null): string[] {
  const origin = getOriginFromUrl(website);
  if (!origin) return [];

  return dedupeVisualCards([
    { label: 'Open Graph Image', url: `${origin}/og-image.png` },
    { label: 'Open Graph Image JPG', url: `${origin}/og-image.jpg` },
    { label: 'Social Preview', url: `${origin}/social-preview.png` },
    { label: 'Social Card', url: `${origin}/social-card.png` },
    { label: 'Hero Image', url: `${origin}/hero.jpg` },
    { label: 'Hero Image PNG', url: `${origin}/hero.png` },
    { label: 'Home Hero', url: `${origin}/images/hero.jpg` },
    { label: 'Home Hero PNG', url: `${origin}/images/hero.png` },
    { label: 'Banner', url: `${origin}/images/banner.jpg` },
    { label: 'Banner PNG', url: `${origin}/images/banner.png` },
    { label: 'Share Image', url: `${origin}/images/share.jpg` },
    { label: 'Share Image PNG', url: `${origin}/images/share.png` },
    { label: 'Homepage Image', url: `${origin}/images/homepage.jpg` },
    { label: 'Homepage Image PNG', url: `${origin}/images/homepage.png` },
  ]).map((card) => card.url);
}

function buildImageFallbackChain(primaryUrl: string, website?: string | null): string[] {
  const normalizedPrimary = normalizeHttpUrl(primaryUrl);
  return buildLargeLogoCandidateUrls(website)
    .filter((url) => normalizeHttpUrl(url) !== normalizedPrimary)
    .map((url) => withImageProxy(url));
}

function buildVisualPreviewFallbackChain(primaryUrl: string, website?: string | null): string[] {
  const normalizedPrimary = normalizeHttpUrl(primaryUrl);
  const normalizedWebsite = normalizeHttpUrl(website);
  const screenshotFallbacks = normalizedWebsite
    ? [buildWordpressScreenshotUrl(normalizedWebsite)]
    : [];
  const visualAssetFallbacks = buildLargeVisualCandidateUrls(website);

  return dedupeVisualCards(
    [
      ...buildImageFallbackChain(primaryUrl, website).map((url) => ({ label: 'fallback', url })),
      ...screenshotFallbacks.map((url) => ({ label: 'preview', url })),
      ...visualAssetFallbacks.map((url) => ({ label: 'visual', url })),
    ]
  )
    .map((card) => withImageProxy(card.url))
    .filter((url) => normalizeHttpUrl(url) !== normalizedPrimary);
}

function buildInlineFallbackImageSvg(label: string): string {
  const safeLabel = encodeURIComponent(label || 'Preview unavailable');
  return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360'><rect width='100%' height='100%' fill='%23F4F4F5'/><rect x='24' y='24' width='592' height='312' rx='16' ry='16' fill='%23FFFFFF' stroke='%23D4D4D8'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%236B7280' font-family='Arial, sans-serif' font-size='20'>${safeLabel}</text></svg>`;
}

function buildDeterministicPlaceholderCards(brandName: string): BrandVisualCard[] {
  return [
    {
      label: 'Awaiting verified visual source',
      url: buildInlineFallbackImageSvg(`${brandName}: waiting on reliable image source`),
      status: 'placeholder',
    },
    {
      label: 'Proxy fallback active',
      url: buildInlineFallbackImageSvg(`${brandName}: proxy retry in progress`),
      status: 'placeholder',
    },
    {
      label: 'Use Ask to rescan if needed',
      url: buildInlineFallbackImageSvg(`${brandName}: ask to rescan for fresher assets`),
      status: 'placeholder',
    },
  ];
}

function advanceImageFallback(event: React.SyntheticEvent<HTMLImageElement>) {
  const target = event.currentTarget;
  const fallbackChain = (target.dataset.fallbackChain || '')
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);

  let nextFallback = fallbackChain.shift();
  while (nextFallback && target.src === nextFallback) {
    nextFallback = fallbackChain.shift();
  }

  if (nextFallback && target.src !== nextFallback) {
    target.dataset.fallbackChain = fallbackChain.join('|');
    target.src = nextFallback;
    return;
  }

  target.onerror = null;
  target.src = buildInlineFallbackImageSvg(target.alt || 'Preview unavailable');
}

function buildScreenshotPreviewUrl(pageUrl: string): string {
  return `https://image.thum.io/get/width/1920/noanimate/${pageUrl}`;
}

function buildWordpressScreenshotUrl(pageUrl: string): string {
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(pageUrl)}?w=1920`;
}

function canonicalizeVisualUrl(rawUrl: string): string {
  const normalized = normalizeHttpUrl(rawUrl);
  if (!normalized) return rawUrl;

  try {
    const parsed = new URL(normalized);
    return `${parsed.origin}${parsed.pathname}`.toLowerCase();
  } catch {
    return normalized.toLowerCase();
  }
}

function isLogoLikeAsset(url: string, label: string): boolean {
  const value = `${url} ${label}`.toLowerCase();
  return (
    value.includes('logo') ||
    value.includes('favicon') ||
    value.includes('icon') ||
    value.includes('wordmark') ||
    value.includes('brand mark')
  );
}

function isLikelyLowFidelityVisual(url: string): boolean {
  const value = url.toLowerCase();
  return (
    value.includes('favicon') ||
    value.includes('avatar') ||
    value.includes('gravatar')
  );
}

function scoreVisualMethod(method: VisualMethod, cards: BrandVisualCard[]): number {
  const uniqueDomains = new Set(cards.map((card) => getDomainFromUrl(card.url) || card.url)).size;
  const nonLogoCount = cards.filter((card) => !isLogoLikeAsset(card.url, card.label)).length;
  const lowFidelityCount = cards.filter((card) => isLikelyLowFidelityVisual(card.url)).length;
  const base = cards.length * 10 + uniqueDomains * 4 + nonLogoCount * 3 - lowFidelityCount * 6;

  const methodBonus = method === 'screenshot' ? 2 : 0;
  return base + methodBonus;
}

function dedupeVisualCards(cards: BrandVisualCard[]): BrandVisualCard[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const canonical = canonicalizeVisualUrl(card.url);
    if (seen.has(canonical)) return false;
    seen.add(canonical);
    return true;
  });
}

export function BrandDeepDivePage({ onBack }: BrandDeepDivePageProps) {
  const [brands, setBrands] = useState<Array<{ id: string; name: string; website: string }>>([
    { id: 'brand-1', name: '', website: '' },
    { id: 'brand-2', name: '', website: '' },
  ]);
  const [analysisObjective, setAnalysisObjective] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [resultTab, setResultTab] = useState<ResultTab>('profiles');
  const [compareElement, setCompareElement] = useState<CompareElement>('primaryColors');
  const [comparePopup, setComparePopup] = useState<ComparePopupState | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fakeProgress, setFakeProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [report, setReport] = useState<BrandDeepDiveReport | null>(null);
  const [reportQuestion, setReportQuestion] = useState('');
  const [reportAnswer, setReportAnswer] = useState('');
  const [isSubmittingPrompt, setIsSubmittingPrompt] = useState(false);
  const [isSearchControlsMinimized, setIsSearchControlsMinimized] = useState(false);
  const [bestVisualsByBrand, setBestVisualsByBrand] = useState<Record<string, BrandVisualSelection>>({});
  const [visualFailuresByCard, setVisualFailuresByCard] = useState<Record<string, { attempts: number; lastSource: string; isPlaceholder: boolean; hidden?: boolean; retried?: boolean }>>({});
  const [isExporting, setIsExporting] = useState(false);
  const [, setToast] = useState<string | null>(null);
  const [savedSearches, setSavedSearches] = useState<SavedDeepDiveSearch[]>([]);
  const websiteLookupTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const undoDeleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [recentlyDeletedSearch, setRecentlyDeletedSearch] = useState<SavedDeepDiveSearch | null>(null);
  const [undoToast, setUndoToast] = useState<{ message: string } | null>(null);
  const [processedLogos, setProcessedLogos] = useState<Record<string, { base64Placeholder: string; dominantColorHex: string }>>({});
  const requestedLogosRef = useRef<Set<string>>(new Set());
  const [heroImages, setHeroImages] = useState<Record<string, string | null>>({});
  const [logoImages, setLogoImages] = useState<Record<string, string | null>>({});
  const requestedHeroRef = useRef<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Loader for all visuals (now after report and bestVisualsByBrand)
  const { allVisualsLoaded, handleImageLoad, handleImageError, expectedCount } = useAllVisualsLoaded(report, bestVisualsByBrand);

  const clearExcavatorSearch = () => {
    setBrands([
      { id: 'brand-1', name: '', website: '' },
      { id: 'brand-2', name: '', website: '' },
    ]);
    setAnalysisObjective('');
    setTargetAudience('');
    setResultTab('profiles');
    setCompareElement('primaryColors');
    setShowValidation(false);
    setError(null);
    setReport(null);
    setReportQuestion('');
    setReportAnswer('');
    setIsSearchControlsMinimized(false);
    setBestVisualsByBrand({});
    setProcessedLogos({});
    requestedLogosRef.current.clear();
    setHeroImages({});
    setLogoImages({});
    requestedHeroRef.current.clear();
    setToast('Started a new search.');
  };

  const openComparePopup = (event: React.MouseEvent<HTMLElement>, target: CompareElement) => {
    const clickedInteractiveElement = (event.target as HTMLElement | null)?.closest('a,button,input,textarea,select,label');
    if (clickedInteractiveElement) {
      return;
    }

    const popupWidth = 220;
    const popupHeight = 46;
    const padding = 12;
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;

    const x = Math.min(
      Math.max(event.clientX + 10, padding),
      Math.max(padding, viewportWidth - popupWidth - padding)
    );
    const y = Math.min(
      Math.max(event.clientY + 10, padding),
      Math.max(padding, viewportHeight - popupHeight - padding)
    );

    setComparePopup({ x, y, target });
  };

  const compareAcrossBrands = (target: CompareElement) => {
    setCompareElement(target);
    setResultTab('compare');
    setComparePopup(null);
  };

  const loadSavedSearch = (saved: SavedDeepDiveSearch) => {
    const loadedBrands = saved.brands.slice(0, 6).map((brand, idx) => ({
      id: `brand-loaded-${Date.now()}-${idx}`,
      name: brand.name,
      website: brand.website || '',
    }));
    setBrands(loadedBrands.length > 0 ? loadedBrands : [{ id: 'brand-1', name: '', website: '' }]);
    setAnalysisObjective(saved.analysisObjective || '');
    setTargetAudience(saved.targetAudience || '');
    setReport(saved.report);
    setReportQuestion('');
    setReportAnswer('');
    setResultTab('profiles');
    setShowValidation(false);
    setError(null);
    setProcessedLogos({});
    requestedLogosRef.current.clear();
    setHeroImages({});
    setLogoImages({});
    requestedHeroRef.current.clear();
    setToast('Loaded saved search.');
  };

  const renameSavedSearch = async (id: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const { data, error } = await supabase
      .from('brand_deep_dives')
      .update({ custom_name: trimmed })
      .eq('id', id)
      .select();
    if (!error && data) {
      setSavedSearches((prev) => prev.map((item) => item.id === id ? { ...item, customName: trimmed } : item));
    }
  };

  const commitRename = (id: string, value: string) => {
    if (value.trim()) renameSavedSearch(id, value);
    setRenamingId(null);
    setRenameValue('');
  };

  const deleteSavedSearch = async (id: string) => {
    const deleted = savedSearches.find((item) => item.id === id);
    if (!deleted) return;

    const { error } = await supabase
      .from('brand_deep_dives')
      .delete()
      .eq('id', id);

    if (!error) {
      const updated = savedSearches.filter((item) => item.id !== id);
      setSavedSearches(updated);
      if (undoDeleteTimeoutRef.current) {
        clearTimeout(undoDeleteTimeoutRef.current);
        undoDeleteTimeoutRef.current = null;
      }
      setRecentlyDeletedSearch(deleted);
      setToast('Saved project deleted.');
      setUndoToast({ message: `${deleted.brands.map((b) => b.name).join(' vs ')} deleted` });
      undoDeleteTimeoutRef.current = setTimeout(() => {
        setRecentlyDeletedSearch(null);
        setUndoToast(null);
        undoDeleteTimeoutRef.current = null;
      }, 8000);
    }
  };

  const undoDeleteSavedSearch = async () => {
    if (!recentlyDeletedSearch) return;

    if (undoDeleteTimeoutRef.current) {
      clearTimeout(undoDeleteTimeoutRef.current);
      undoDeleteTimeoutRef.current = null;
    }

    // Re-insert into Supabase
    const { error } = await supabase.from('brand_deep_dives').insert([
      {
        id: recentlyDeletedSearch.id,
        brands: recentlyDeletedSearch.brands,
        analysis_objective: recentlyDeletedSearch.analysisObjective,
        target_audience: recentlyDeletedSearch.targetAudience,
        report: recentlyDeletedSearch.report,
        custom_name: recentlyDeletedSearch.customName,
        created_at: recentlyDeletedSearch.date,
      },
    ]);
    if (!error) {
      const updated = [recentlyDeletedSearch, ...savedSearches.filter((item) => item.id !== recentlyDeletedSearch.id)];
      setSavedSearches(updated);
      setRecentlyDeletedSearch(null);
      setUndoToast(null);
      setToast('Deletion undone.');
    }
  };

  useEffect(() => {
    // Load saved deep dives from Supabase
    (async () => {
      const { data, error } = await supabase
        .from('brand_deep_dives')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && Array.isArray(data)) {
        setSavedSearches(
          data.map((row) => ({
            id: row.id,
            date: row.created_at,
            brands: row.brands,
            analysisObjective: row.analysis_objective,
            targetAudience: row.target_audience,
            report: row.report,
            customName: row.custom_name,
          }))
        );
      } else {
        setSavedSearches([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!comparePopup) {
      return;
    }

    const closePopup = () => setComparePopup(null);
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closePopup();
      }
    };

    window.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', closePopup);
    window.addEventListener('scroll', closePopup, true);

    return () => {
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', closePopup);
      window.removeEventListener('scroll', closePopup, true);
    };
  }, [comparePopup]);

  useEffect(() => {
    setComparePopup(null);
  }, [resultTab, report]);

  useEffect(() => {
    const proxyBase = getImageProxyBaseUrl();
    if (!proxyBase) return;

    Object.entries(bestVisualsByBrand).forEach(([brandName, visuals]) => {
      const logoUrl = visuals.deterministicLogoUrl;
      if (!logoUrl || requestedLogosRef.current.has(brandName)) return;

      requestedLogosRef.current.add(brandName);
      fetch(`${proxyBase}/api/process-image?url=${encodeURIComponent(logoUrl)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((data: { base64Placeholder: string; dominantColorHex: string }) => {
          setProcessedLogos((prev) => ({
            ...prev,
            [brandName]: { base64Placeholder: data.base64Placeholder, dominantColorHex: data.dominantColorHex },
          }));
        })
        .catch(() => {
          // Enhancement silently degrades; logo renders without blur-up.
        });
    });

    // Fetch hero image per brand that has a website
    if (!report) return;
    report.brandProfiles.forEach((profile) => {
      const website = profile.website;
      if (!website || requestedHeroRef.current.has(profile.brandName)) return;

      requestedHeroRef.current.add(profile.brandName);
      fetch(`${proxyBase}/api/brand-images?domain=${encodeURIComponent(website)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((data: { logoUrl: string | null; heroImageUrl: string | null }) => {
          setLogoImages((prev) => ({ ...prev, [profile.brandName]: data.logoUrl }));
          setHeroImages((prev) => ({ ...prev, [profile.brandName]: data.heroImageUrl }));
        })
        .catch(() => {
          setLogoImages((prev) => ({ ...prev, [profile.brandName]: null }));
          setHeroImages((prev) => ({ ...prev, [profile.brandName]: null }));
        });
    });
  }, [bestVisualsByBrand, report]);

  useEffect(() => {
    return () => {
      if (undoDeleteTimeoutRef.current) {
        clearTimeout(undoDeleteTimeoutRef.current);
        undoDeleteTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (report && !isLoading) {
      setIsSearchControlsMinimized(true);
      return;
    }

    if (!report) {
      setIsSearchControlsMinimized(false);
    }
  }, [report, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowValidation(true);

    const normalizedBrands = brands
      .map((brand) => ({
        name: brand.name.trim(),
        website: brand.website.trim(),
      }))
      .filter((brand) => brand.name.length > 0)
      .slice(0, 6);

    if (normalizedBrands.length === 0) {
      setError('Please add at least one brand.');
      return;
    }

    if (!analysisObjective.trim()) {
      setError('Please provide a visual identity objective.');
      return;
    }

    setFakeProgress(5);
    setIsLoading(true);
    setError(null);
    setResultTab('profiles');
    setReportQuestion('');
    setReportAnswer('');
    setBestVisualsByBrand({});

    try {
      const result = await generateBrandDeepDive({
        brands: normalizedBrands,
        analysisObjective,
        targetAudience,
      });
      setReport(result);

      const nextSaved: SavedDeepDiveSearch = {
        id: `deep-dive-${Date.now()}`,
        date: new Date().toISOString(),
        brands: normalizedBrands,
        analysisObjective,
        targetAudience,
        report: result,
      };
      // Persist to Supabase
      try {
        const { data, error } = await supabase.from('brand_deep_dives').insert([
          {
            id: nextSaved.id,
            brands: normalizedBrands,
            analysis_objective: analysisObjective,
            target_audience: targetAudience,
            report: result,
            created_at: nextSaved.date,
          },
        ]).select();
        if (!error && data) {
          setSavedSearches((prev) => [nextSaved, ...prev.filter((item) => item.id !== nextSaved.id)].slice(0, 20));
        }
      } catch (saveErr) {
        // Do not block UI if Supabase fails
        console.warn('Failed to save brand deep dive to Supabase:', saveErr);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('Failed to generate brand excavator:', message);
      setError(`Failed to generate brand excavator: ${message}`);
    } finally {
      setFakeProgress(100);
      await new Promise((resolve) => setTimeout(resolve, 220));
      setIsLoading(false);
    }
  };

  const getNormalizedBrands = () =>
    brands
      .map((brand) => ({
        name: brand.name.trim(),
        website: brand.website.trim(),
      }))
      .filter((brand) => brand.name.length > 0)
      .slice(0, 6);

  const handleAskQuestion = async () => {
    if (!report || !reportQuestion.trim()) return;

    const normalizedBrands = getNormalizedBrands();
    if (normalizedBrands.length === 0) return;

    setIsSubmittingPrompt(true);
    setError(null);
    setReportAnswer('');

    try {
      const result = await submitBrandDeepDivePrompt({
        brands: normalizedBrands,
        analysisObjective,
        targetAudience,
        currentReport: report,
        prompt: reportQuestion,
      });

      if (result.mode === 'rescan') {
        setReport(result.report);
        setResultTab('profiles');

        const nextSaved: SavedDeepDiveSearch = {
          id: `deep-dive-${Date.now()}`,
          date: new Date().toISOString(),
          brands: normalizedBrands,
          analysisObjective,
          targetAudience,
          report: result.report,
        };
        // Persist to Supabase
        try {
          const { data, error } = await supabase.from('brand_deep_dives').insert([
            {
              id: nextSaved.id,
              brands: normalizedBrands,
              analysis_objective: analysisObjective,
              target_audience: targetAudience,
              report: result.report,
              created_at: nextSaved.date,
            },
          ]).select();
          if (!error && data) {
            setSavedSearches((prev) => [nextSaved, ...prev.filter((item) => item.id !== nextSaved.id)].slice(0, 20));
          }
        } catch (saveErr) {
          // Do not block UI if Supabase fails
          console.warn('Failed to save brand deep dive to Supabase:', saveErr);
        }
      }

      setReportAnswer(result.answer);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('Failed to process excavator prompt:', message);
      setReportAnswer("Sorry, I couldn't answer that question right now.");
      setError(`Failed to process prompt: ${message}`);
    } finally {
      setIsSubmittingPrompt(false);
    }
  };

  const canAddBrand = brands.length < 6;
  const brandCount = brands.filter((brand) => brand.name.trim()).length;

  const addBrandRow = () => {
    if (!canAddBrand) return;
    const nextId = `brand-${Date.now()}`;
    setBrands((prev) => [...prev, { id: nextId, name: '', website: '' }]);
  };

  const removeBrandRow = (id: string) => {
    setBrands((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((brand) => brand.id !== id);
    });
  };

  const updateBrandRow = (id: string, key: 'name' | 'website', value: string) => {
    setBrands((prev) => prev.map((brand) => (brand.id === id ? { ...brand, [key]: value } : brand)));
  };

  const renderColorSwatch = (color: BrandColorSpec) => {
    const normalizedHex = color.hex.startsWith('#') ? color.hex : `#${color.hex}`;
    return (
      <li key={`${color.name}-${color.hex}`} className="rounded-xl border border-zinc-200 p-3 bg-white">
        <div className="flex items-center gap-3">
          <span
            className="w-8 h-8 rounded-lg border border-zinc-200"
            style={{ backgroundColor: normalizedHex }}
            aria-label={`${color.name} swatch`}
          />
          <div>
            <p className="text-sm font-medium text-zinc-900">{color.name}</p>
            <p className="text-xs text-zinc-500">HEX {color.hex}</p>
          </div>
        </div>
        {(color.rgb || color.cmyk || color.pantone || color.usage) && (
          <div className="mt-2 text-xs text-zinc-500 space-y-1">
            {color.rgb && <p>RGB: {color.rgb}</p>}
            {color.cmyk && <p>CMYK: {color.cmyk}</p>}
            {color.pantone && <p>Pantone: {color.pantone}</p>}
            {color.usage && <p>Usage: {color.usage}</p>}
          </div>
        )}
      </li>
    );
  };

  const renderListOrFallback = (items: string[], fallbackLabel: string) => {
    if (!items || items.length === 0) {
      return <p className="text-sm text-zinc-500">{fallbackLabel}</p>;
    }

    return (
      <ul className="space-y-1">
        {items.map((item, idx) => (
          <li key={idx} className="text-sm text-zinc-700">• {item}</li>
        ))}
      </ul>
    );
  };

  const renderComparePanel = () => {
    if (!report) return null;

    if (compareElement === 'primaryColors' || compareElement === 'accentColors' || compareElement === 'neutrals') {
      const titleMap: Record<CompareElement, string> = {
        primaryColors: 'Primary Colors Comparison',
        accentColors: 'Accent Colors Comparison',
        neutrals: 'Neutral Colors Comparison',
        typography: 'Typography Comparison',
        imageryStyle: 'Imagery Style Comparison',
      };

      return (
        <section className="lg:col-span-2 bg-white rounded-3xl border border-zinc-200 p-6 space-y-4">
          <h3 className="text-lg font-semibold text-zinc-900">{titleMap[compareElement]}</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {report.brandProfiles.map((profile) => {
              const colors =
                compareElement === 'primaryColors'
                  ? profile.colorPalette.primaryColors
                  : compareElement === 'accentColors'
                    ? profile.colorPalette.secondaryAccentColors
                    : profile.colorPalette.neutrals;

              return (
                <div key={`${profile.brandName}-${compareElement}`} className="rounded-2xl border border-zinc-200 p-4">
                  <p className="text-sm font-semibold text-zinc-900 mb-3">{profile.brandName}</p>
                  {colors.length > 0 ? (
                    <ul className="space-y-2">{colors.map(renderColorSwatch)}</ul>
                  ) : (
                    <p className="text-sm text-zinc-500">No color data available.</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      );
    }

    if (compareElement === 'typography') {
      return (
        <section className="lg:col-span-2 bg-white rounded-3xl border border-zinc-200 p-6 space-y-4">
          <h3 className="text-lg font-semibold text-zinc-900">Typography Comparison</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {report.brandProfiles.map((profile) => (
              <div key={`${profile.brandName}-typography`} className="rounded-2xl border border-zinc-200 p-4">
                <p className="text-sm font-semibold text-zinc-900 mb-2">{profile.brandName}</p>
                <p className="text-sm text-zinc-700 mb-1"><span className="font-medium">Families:</span> {profile.typography.fontFamilies.join(', ') || 'Not provided'}</p>
                <p className="text-sm text-zinc-700"><span className="font-medium">H1:</span> {profile.typography.hierarchy.h1}</p>
                <p className="text-sm text-zinc-700"><span className="font-medium">H2:</span> {profile.typography.hierarchy.h2}</p>
                <p className="text-sm text-zinc-700"><span className="font-medium">Body:</span> {profile.typography.hierarchy.body}</p>
              </div>
            ))}
          </div>
        </section>
      );
    }

    return (
      <section className="lg:col-span-2 bg-white rounded-3xl border border-zinc-200 p-6 space-y-4">
        <h3 className="text-lg font-semibold text-zinc-900">Imagery Style Comparison</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {report.brandProfiles.map((profile) => (
            <div key={`${profile.brandName}-imagery`} className="rounded-2xl border border-zinc-200 p-4">
              <p className="text-sm font-semibold text-zinc-900 mb-2">{profile.brandName}</p>
              {profile.supportingVisualElements.imageryStyle.length > 0 ? (
                <ul className="space-y-1">
                  {profile.supportingVisualElements.imageryStyle.map((item, idx) => (
                    <li key={idx} className="text-sm text-zinc-700">• {item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-500">No imagery style notes available.</p>
              )}
            </div>
          ))}
        </div>
      </section>
    );
  };

  useEffect(() => {
    if (!isLoading) {
      setFakeProgress(0);
      return;
    }

    setFakeProgress(8);
    const startedAt = Date.now();
    const progressInterval = setInterval(() => {
      setFakeProgress((prev) => {
        const elapsedMs = Date.now() - startedAt;
        const ceiling =
          elapsedMs < 4000
            ? 86
            : elapsedMs < 10000
              ? 94
              : elapsedMs < 20000
                ? 97.5
                : 99.2;

        if (prev >= ceiling) {
          return prev;
        }

        const step = Math.max(0.15, (ceiling - prev) * 0.08);
        return Math.min(ceiling, prev + step);
      });
    }, 140);

    return () => clearInterval(progressInterval);
  }, [isLoading]);

  useEffect(() => {
    const activeBrandIds = new Set(brands.map((brand) => brand.id));

    Object.keys(websiteLookupTimersRef.current).forEach((id) => {
      if (!activeBrandIds.has(id)) {
        clearTimeout(websiteLookupTimersRef.current[id]);
        delete websiteLookupTimersRef.current[id];
      }
    });

    brands.forEach((brand) => {
      const hasName = brand.name.trim().length >= 2;
      const hasWebsite = brand.website.trim().length > 0;

      if (!hasName || hasWebsite) {
        if (websiteLookupTimersRef.current[brand.id]) {
          clearTimeout(websiteLookupTimersRef.current[brand.id]);
          delete websiteLookupTimersRef.current[brand.id];
        }
        return;
      }

      if (websiteLookupTimersRef.current[brand.id]) {
        return;
      }

      websiteLookupTimersRef.current[brand.id] = setTimeout(async () => {
        try {
          const suggestedWebsite = await suggestBrandWebsite(brand.name);
          if (!suggestedWebsite) return;

          setBrands((prev) =>
            prev.map((current) => {
              if (current.id !== brand.id) return current;

              if (current.website.trim()) {
                return current;
              }

              if (current.name.trim().toLowerCase() !== brand.name.trim().toLowerCase()) {
                return current;
              }

              return { ...current, website: suggestedWebsite };
            })
          );
        } finally {
          clearTimeout(websiteLookupTimersRef.current[brand.id]);
          delete websiteLookupTimersRef.current[brand.id];
        }
      }, 700);
    });

    return () => {
      Object.keys(websiteLookupTimersRef.current).forEach((id) => {
        clearTimeout(websiteLookupTimersRef.current[id]);
        delete websiteLookupTimersRef.current[id];
      });
    };
  }, [brands]);

  useEffect(() => {
    if (!report) {
      setBestVisualsByBrand({});
      setVisualFailuresByCard({});
      return;
    }

    setVisualFailuresByCard({});

    const resolvedMap: Record<string, BrandVisualSelection> = {};

    report.brandProfiles.forEach((profile) => {

      const prioritizedLogoCandidates = [
        logoImages[profile.brandName],
        ...buildLargeLogoCandidateUrls(profile.website),
      ].filter((url): url is string => Boolean(url));

      const deterministicCards = dedupeVisualCards(
        prioritizedLogoCandidates.map((url, idx) => ({
          label: idx === 0 ? 'Primary Logo' : `Logo Asset ${idx + 1}`,
          url: withImageProxy(url),
          originalUrl: url,
          status: 'fallback' as const,
        }))
      ).slice(0, 3);

      const websiteOrigin = getOriginFromUrl(profile.website);
      const contextualSiteTargets = websiteOrigin
        ? [
            `${websiteOrigin}/`,
            `${websiteOrigin}/products`,
            `${websiteOrigin}/solutions`,
            `${websiteOrigin}/pricing`,
            `${websiteOrigin}/about`,
            `${websiteOrigin}/blog`,
            `${websiteOrigin}/contact`,
            `${websiteOrigin}/careers`,
          ]
        : [];

      const screenshotTargets = dedupeVisualCards(
        [
          ...contextualSiteTargets.map((url, idx) => ({
            label: idx === 0 ? 'Homepage Preview' : `Site Context ${idx}`,
            url,
          })),
          ...(profile.sources || []).map((source, idx) => ({
            label: `Source Preview ${idx + 1}`,
            url: source.url,
          })),
        ]
          .map((target) => ({
            ...target,
            url: normalizeHttpUrl(target.url) || '',
          }))
          .filter((target) => Boolean(target.url))
      ).slice(0, 4);

      const directVisualCards = dedupeVisualCards(
        buildLargeVisualCandidateUrls(profile.website).map((url, idx) => ({
          label: idx === 0 ? 'Website Visual' : `Website Visual ${idx + 1}`,
          url: withImageProxy(url),
          originalUrl: url,
          status: 'fallback' as const,
        }))
      ).slice(0, 4);

      const screenshotCards = dedupeVisualCards(
        [
          ...screenshotTargets.map((target) => ({
            label: target.label,
            url: withImageProxy(buildWordpressScreenshotUrl(target.url)),
            originalUrl: buildWordpressScreenshotUrl(target.url),
            status: 'ok' as const,
          })),
          ...directVisualCards,
        ]
      ).slice(0, 8);

      const candidates: Array<{ method: VisualMethod; images: BrandVisualCard[]; score: number }> = [];

      if (screenshotCards.length > 0) {
        candidates.push({ method: 'screenshot', images: screenshotCards, score: 80 + scoreVisualMethod('screenshot', screenshotCards) });
      }

      if (deterministicCards.length > 0) {
        candidates.push({ method: 'deterministic', images: deterministicCards, score: 20 + scoreVisualMethod('deterministic', deterministicCards) });
      }

      if (!candidates.length) {
        resolvedMap[profile.brandName] = {
          method: 'deterministic',
          images: buildDeterministicPlaceholderCards(profile.brandName),
        };
        return;
      }

      candidates.sort((a, b) => b.score - a.score);

      resolvedMap[profile.brandName] = {
        method: candidates[0].method,
        images: candidates[0].images,
        deterministicLogoUrl: withImageProxy(prioritizedLogoCandidates[0] || ''),
      };
    });

    setBestVisualsByBrand(resolvedMap);
  }, [logoImages, report]);

  const getFailureSourceLabel = (value: string): string => {
    if (!value) return 'unknown source';
    if (value.startsWith('data:image')) return 'inline placeholder';

    try {
      const parsed = new URL(value);
      if (parsed.pathname.endsWith('/api/image-proxy')) {
        const proxied = parsed.searchParams.get('url');
        if (proxied) {
          const original = new URL(proxied);
          return original.hostname;
        }
      }
      return parsed.hostname;
    } catch {
      return 'image source';
    }
  };

  const handleVisualImageError = (event: React.SyntheticEvent<HTMLImageElement>, cardKey: string) => {
    const target = event.currentTarget;
    const attemptedSource = target.currentSrc || target.src;
    advanceImageFallback(event);
    const nextSource = target.currentSrc || target.src;
    const retryAttempted = target.dataset.retryAttempted === 'true';

    // If all fallback sources were exhausted, try one final cache-busted reload.
    if (nextSource.startsWith('data:image/svg+xml') && !retryAttempted) {
      const originalSource = target.dataset.originalSrc || attemptedSource;
      if (originalSource && !originalSource.startsWith('data:image')) {
        const retryUrl = `${originalSource}${originalSource.includes('?') ? '&' : '?'}retry=${Date.now()}`;
        target.dataset.retryAttempted = 'true';
        target.src = retryUrl;
      }
    }

    setVisualFailuresByCard((prev) => {
      const current = prev[cardKey];
      const effectiveNextSource = target.currentSrc || target.src;
      const shouldHide = effectiveNextSource.startsWith('data:image/svg+xml') && retryAttempted;

      return {
        ...prev,
        [cardKey]: {
          attempts: (current?.attempts || 0) + 1,
          lastSource: getFailureSourceLabel(attemptedSource),
          isPlaceholder: effectiveNextSource.startsWith('data:image/svg+xml'),
          hidden: shouldHide,
          retried: retryAttempted || current?.retried,
        },
      };
    });
  };

  const clearVisualFailureState = (cardKey: string) => {
    setVisualFailuresByCard((prev) => {
      if (!prev[cardKey]) return prev;
      const next = { ...prev };
      delete next[cardKey];
      return next;
    });
  };

  const exportImageCacheRef = useRef<Map<string, Promise<string | null>>>(new Map());

  const fetchImageAsDataUrl = async (url?: string | null): Promise<string | null> => {
    if (!url) return null;
    if (url.startsWith('data:image')) return url;

    const existing = exportImageCacheRef.current.get(url);
    if (existing) {
      return existing;
    }

    const pending = (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          return null;
        }

        const blob = await response.blob();
        return await new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      } catch {
        return null;
      }
    })();

    exportImageCacheRef.current.set(url, pending);
    return pending;
  };

  const collectProfileExportImages = async (profile: BrandDeepDiveReport['brandProfiles'][number]) => {
    const visuals = bestVisualsByBrand[profile.brandName];
    const visibleVisualCards = (visuals?.images || []).filter((image, idx) => {
      const failureState = visualFailuresByCard[`${profile.brandName}-visual-${idx}`];
      return !failureState?.hidden;
    });

    const logoCandidates = [
      processedLogos[profile.brandName]?.base64Placeholder || null,
      logoImages[profile.brandName] || null,
      visuals?.deterministicLogoUrl || null,
    ].filter((candidate): candidate is string => Boolean(candidate));

    let logoDataUrl: string | null = null;
    for (const candidate of logoCandidates) {
      logoDataUrl = await fetchImageAsDataUrl(candidate);
      if (logoDataUrl) {
        break;
      }
    }

    const visualDataUrls: string[] = [];
    for (const image of visibleVisualCards.slice(0, 3)) {
      const dataUrl = await fetchImageAsDataUrl(image.url);
      if (dataUrl) {
        visualDataUrls.push(dataUrl);
      }
    }

    return { logoDataUrl, visualDataUrls };
  };

  const getPdfImageFormat = (dataUrl: string): 'PNG' | 'JPEG' => {
    return dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg') ? 'JPEG' : 'PNG';
  };

  const exportToPPTX = async () => {
    if (!report) return;
    setIsExporting(true);
    setToast('Generating PowerPoint...');
    try {
      const pres = new PptxGenJS();
      pres.layout = 'LAYOUT_16x9';
      const titleSlide = pres.addSlide();
      titleSlide.background = { color: 'FAFAFA' };
      titleSlide.addText('Visual Design Excavator Report', { x: 0.5, y: 0.5, w: 9, h: 0.6, fontSize: 48, bold: true, color: '18181B' });
      if (analysisObjective) {
        titleSlide.addText(`Objective: ${analysisObjective}`, { x: 0.5, y: 1.3, w: 9, h: 0.6, fontSize: 16, color: '4F46E5' });
      }
      if (targetAudience) {
        titleSlide.addText(`Target Audience: ${targetAudience}`, { x: 0.5, y: 2.0, w: 9, h: 0.4, fontSize: 14, color: '52525B' });
      }
      titleSlide.addText(`Generated on ${new Date().toLocaleDateString()}`, { x: 0.5, y: 5.5, w: 9, h: 0.4, fontSize: 12, color: 'A1A1AA' });
      for (const profile of report.brandProfiles) {
        const exportImages = await collectProfileExportImages(profile);
        const slide = pres.addSlide();
        slide.background = { color: 'FAFAFA' };
        slide.addText(profile.brandName, { x: 0.5, y: 0.3, w: 9, h: 0.5, fontSize: 32, bold: true, color: '18181B' });
        if (profile.website) {
          slide.addText(profile.website, { x: 0.5, y: 0.85, w: 9, h: 0.3, fontSize: 12, color: '52525B' });
        }
        let currentY = 1.3;
        slide.addText('Distinctiveness', { x: 0.5, y: currentY, w: 9, h: 0.3, fontSize: 12, bold: true, color: '18181B' });
        currentY += 0.35;
        slide.addText(profile.distinctivenessAssessment, { x: 0.5, y: currentY, w: 9, h: 1.0, fontSize: 10, color: '3F3F46', valign: 'top' });
        currentY += 1.0;
        currentY += 0.2;
        slide.addText('Logo System', { x: 0.5, y: currentY, w: 4, h: 0.3, fontSize: 12, bold: true, color: '18181B' });
        currentY += 0.35;
        slide.addText(`Primary: ${profile.logo.mainLogo}`, { x: 0.5, y: currentY, w: 4, h: 0.25, fontSize: 10, color: '3F3F46' });
        currentY += 0.3;
        slide.addText(`Wordmark: ${profile.logo.wordmarkLogotype}`, { x: 0.5, y: currentY, w: 4, h: 0.25, fontSize: 10, color: '3F3F46' });
        currentY += 0.4;
        if (exportImages.logoDataUrl) {
          slide.addImage({ data: exportImages.logoDataUrl, x: 0.5, y: currentY, w: 1.8, h: 0.9 });
        }
        if (exportImages.visualDataUrls[0]) {
          slide.addImage({ data: exportImages.visualDataUrls[0], x: 2.6, y: currentY, w: 2.2, h: 1.2 });
        }
        if (exportImages.visualDataUrls[1]) {
          slide.addImage({ data: exportImages.visualDataUrls[1], x: 4.95, y: currentY, w: 2.2, h: 1.2 });
        }
        currentY += 1.35;
        slide.addText('Primary Colors', { x: 5.2, y: 1.3, w: 4, h: 0.3, fontSize: 12, bold: true, color: '18181B' });
        let colorY = 1.65;
        profile.colorPalette.primaryColors.slice(0, 3).forEach((color) => {
          const colorBox = { x: 5.2, y: colorY, w: 0.3, h: 0.25, fill: { color: color.hex.replace('#', '') } };
          slide.addShape(pres.ShapeType.rect, colorBox);
          slide.addText(`${color.name} (${color.hex})`, { x: 5.6, y: colorY, w: 3.6, h: 0.25, fontSize: 9, color: '3F3F46' });
          colorY += 0.3;
        });
      }
      await pres.writeFile({ fileName: `Visual_Design_Excavator_${new Date().toISOString().split('T')[0]}.pptx` });
      setToast('PowerPoint exported successfully!');
    } catch (err) {
      const pptxError = err instanceof Error ? err.message : 'Unknown error';
      console.error('Failed to generate PPTX:', pptxError);
      setToast('Failed to generate PowerPoint.');
    } finally {
      setIsExporting(false);
    }
  };

  const exportToPDF = async () => {
    if (!report) return;
    setIsExporting(true);
    setToast('Generating PDF...');
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pageWidth - margin * 2;
      const addWrappedText = (text: string, x: number, y: number, fontSize: number, isBold: boolean = false, color: number[] = [0, 0, 0]) => {
        doc.setFontSize(fontSize);
        doc.setFont('helvetica', isBold ? 'bold' : 'normal');
        doc.setTextColor(color[0], color[1], color[2]);
        const lines = doc.splitTextToSize(text, contentWidth);
        const lineHeightMm = fontSize * 0.352778 * 1.5;
        for (let i = 0; i < lines.length; i++) {
          if (y > pageHeight - margin) {
            doc.addPage();
            y = margin;
          }
          doc.text(lines[i], x, y);
          y += lineHeightMm;
        }
        return y + 2;
      };
      let y = margin;
      y = addWrappedText('Visual Design Excavator Report', margin, y, 22, true, [24, 24, 27]);
      y += 5;
      if (analysisObjective) {
        addWrappedText(`Objective: ${analysisObjective}`, margin, y, 11, true, [79, 70, 229]);
        y += 8;
      }
      if (targetAudience) {
        addWrappedText(`Target Audience: ${targetAudience}`, margin, y, 11, false, [82, 82, 91]);
        y += 6;
      }
      y += 3;
      for (let profileIdx = 0; profileIdx < report.brandProfiles.length; profileIdx += 1) {
        const profile = report.brandProfiles[profileIdx];
        const exportImages = await collectProfileExportImages(profile);
        if (y > pageHeight - margin - 60) {
          doc.addPage();
          y = margin;
        }
        y = addWrappedText(profile.brandName, margin, y, 16, true, [24, 24, 27]);
        if (profile.website) {
          y = addWrappedText(profile.website, margin, y, 10, false, [82, 82, 91]);
        }
        y += 3;
        if (exportImages.logoDataUrl || exportImages.visualDataUrls.length > 0) {
          const imageTop = y;
          if (exportImages.logoDataUrl) {
            doc.addImage(exportImages.logoDataUrl, getPdfImageFormat(exportImages.logoDataUrl), margin, imageTop, 35, 18, undefined, 'FAST');
          }
          if (exportImages.visualDataUrls[0]) {
            doc.addImage(exportImages.visualDataUrls[0], getPdfImageFormat(exportImages.visualDataUrls[0]), margin + 40, imageTop, 55, 31, undefined, 'FAST');
          }
          if (exportImages.visualDataUrls[1]) {
            doc.addImage(exportImages.visualDataUrls[1], getPdfImageFormat(exportImages.visualDataUrls[1]), margin + 98, imageTop, 55, 31, undefined, 'FAST');
          }
          y += 36;
        }
        y = addWrappedText('Distinctiveness', margin, y, 11, true, [24, 24, 27]);
        y = addWrappedText(profile.distinctivenessAssessment, margin, y, 10, false, [63, 63, 70]);
        y += 3;
        y = addWrappedText('Logo System', margin, y, 11, true, [24, 24, 27]);
        y = addWrappedText(`Primary: ${profile.logo.mainLogo}`, margin, y, 10, false, [63, 63, 70]);
        y = addWrappedText(`Wordmark: ${profile.logo.wordmarkLogotype}`, margin, y, 10, false, [63, 63, 70]);
        y += 2;
        y = addWrappedText('Variations', margin, y, 10, true, [63, 63, 70]);
        profile.logo.logoVariations.forEach((variation) => {
          y = addWrappedText(`• ${variation}`, margin + 3, y, 9, false, [82, 82, 91]);
        });
        y += 2;
        y = addWrappedText('Typography', margin, y, 11, true, [24, 24, 27]);
        y = addWrappedText(`Families: ${profile.typography.fontFamilies.join(', ')}`, margin, y, 10, false, [63, 63, 70]);
        y = addWrappedText(`H1: ${profile.typography.hierarchy.h1}`, margin, y, 9, false, [82, 82, 91]);
        y = addWrappedText(`H2: ${profile.typography.hierarchy.h2}`, margin, y, 9, false, [82, 82, 91]);
        y = addWrappedText(`Body: ${profile.typography.hierarchy.body}`, margin, y, 9, false, [82, 82, 91]);
        y += 2;
        y = addWrappedText('Primary Colors', margin, y, 11, true, [24, 24, 27]);
        profile.colorPalette.primaryColors.forEach((color) => {
          y = addWrappedText(`• ${color.name} (${color.hex})`, margin + 3, y, 9, false, [82, 82, 91]);
        });
        y += 2;
        y = addWrappedText('Accent Colors', margin, y, 11, true, [24, 24, 27]);
        profile.colorPalette.secondaryAccentColors.forEach((color) => {
          y = addWrappedText(`• ${color.name} (${color.hex})`, margin + 3, y, 9, false, [82, 82, 91]);
        });
        y += 2;
        y = addWrappedText('Supporting Visual Elements', margin, y, 11, true, [24, 24, 27]);
        y = addWrappedText('Imagery Style', margin, y, 10, true, [63, 63, 70]);
        profile.supportingVisualElements.imageryStyle.forEach((item) => {
          y = addWrappedText(`• ${item}`, margin + 3, y, 9, false, [82, 82, 91]);
        });
        y += 1;
        y = addWrappedText('Icons', margin, y, 10, true, [63, 63, 70]);
        profile.supportingVisualElements.icons.forEach((item) => {
          y = addWrappedText(`• ${item}`, margin + 3, y, 9, false, [82, 82, 91]);
        });
        y += 4;
        if (profileIdx < report.brandProfiles.length - 1) {
          doc.addPage();
          y = margin;
        }
      }
      if (report.crossBrandReadout && report.crossBrandReadout.length > 0) {
        if (y > pageHeight - margin - 20) {
          doc.addPage();
          y = margin;
        }
        y = addWrappedText('Opportunity Spaces', margin, y, 14, true, [24, 24, 27]);
        report.crossBrandReadout.forEach((item) => {
          y = addWrappedText(`• ${item}`, margin + 3, y, 10, false, [82, 82, 91]);
        });
      }
      doc.save(`Visual_Design_Excavator_${new Date().toISOString().split('T')[0]}.pdf`);
      setToast('PDF exported successfully!');
    } catch (err) {
      const pdfError = err instanceof Error ? err.message : 'Unknown error';
      console.error('Failed to generate PDF:', pdfError);
      setToast('Failed to generate PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <div className="w-full px-2 sm:px-0">
      {/* Top Navigation / Actions */}
      <div className="absolute top-6 right-6 z-50 no-print flex items-center gap-2">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm border border-zinc-200 text-zinc-700 rounded-full font-medium hover:bg-zinc-50 hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-500/50 focus:ring-offset-1 transition-all shadow-sm text-sm"
        >
          <Search className="w-4 h-4" /> Cultural Archaeologist
        </button>
        <button
          type="button"
          onClick={clearExcavatorSearch}
          className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm border border-zinc-200 text-zinc-700 rounded-full font-medium hover:bg-zinc-50 hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-500/50 focus:ring-offset-1 transition-all shadow-sm text-sm"
        >
          <RefreshCw className="w-4 h-4" /> New Search
        </button>
      </div>

      <AnimatePresence>
        {undoToast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-zinc-900 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-4 text-sm no-print"
          >
            <Info className="w-4 h-4 text-indigo-400" />
            <span>{undoToast.message}</span>
            <button
              onClick={undoDeleteSavedSearch}
              className="text-indigo-400 hover:text-indigo-300 font-medium px-3 py-1 bg-white/10 rounded hover:bg-white/20 transition-colors"
            >
              Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Centered Header Section */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-12 text-center flex flex-col items-center"
      >
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 mb-6">
          <Sparkles className="w-5 h-5" />
        </div>
        <h1 className="text-4xl md:text-6xl font-medium tracking-tight text-zinc-900 mb-6 select-none">
          Visual Design <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-fuchsia-500">Excavator</span>
        </h1>
        <p className="text-lg text-zinc-500 max-w-2xl mx-auto leading-relaxed select-none">
          Compare visual identity systems across 1-6 brands.
        </p>
      </motion.div>

      <div className="w-full max-w-4xl mx-auto space-y-6 md:space-y-8">

      {isSearchControlsMinimized && report && !isLoading && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 bg-white border border-zinc-200 rounded-2xl px-4 py-3 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 no-print"
        >
          <div className="text-left">
            <p className="text-xs uppercase tracking-wider text-zinc-500 font-semibold">Visual Design Excavator</p>
            <p className="text-sm text-zinc-700">
              {brands.filter((b) => b.name.trim()).map((b) => b.name.trim()).slice(0, 3).join(' vs ') || 'Brand comparison ready'}
              {analysisObjective.trim() ? ` • Objective: ${analysisObjective.trim()}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsSearchControlsMinimized(false)}
            className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-500/50 focus:ring-offset-1"
          >
            Edit Search
          </button>
        </motion.div>
      )}

      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        onSubmit={handleSubmit}
        noValidate
        className={`w-full relative flex flex-col gap-4 bg-white rounded-3xl border border-zinc-200 shadow-sm p-4 sm:p-6 md:p-8 space-y-4 ${isSearchControlsMinimized ? 'hidden' : ''}`}
      >
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Brands To Analyze</h3>
            <span className="text-xs text-zinc-400">{brandCount}/6 filled</span>
          </div>

          <div className="space-y-4 sm:space-y-3">
            {brands.map((brand, idx) => (
              <div key={brand.id} className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_1fr_auto] gap-3 items-center">
                <div className="relative md:col-auto">
                  <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                  <input
                    type="text"
                    value={brand.name}
                    onChange={(e) => updateBrandRow(brand.id, 'name', e.target.value)}
                    placeholder={`Brand ${idx + 1} Name`}
                    className="w-full pl-12 pr-4 py-3 rounded-2xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-left"
                    disabled={isLoading}
                  />
                </div>
                <div className="relative col-span-2 md:col-span-1">
                  <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                  <input
                    type="text"
                    value={brand.website}
                    onChange={(e) => updateBrandRow(brand.id, 'website', e.target.value)}
                    placeholder="Website URL (optional)"
                    className="w-full pl-12 pr-4 py-3 rounded-2xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-left"
                    disabled={isLoading}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeBrandRow(brand.id)}
                  className="col-start-2 row-start-1 self-start md:col-start-auto md:row-start-auto md:self-auto px-3 py-3 rounded-2xl border border-zinc-200 text-zinc-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition-colors"
                  disabled={isLoading || brands.length === 1}
                  aria-label={`Remove brand ${idx + 1}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-3">
            <button
              type="button"
              onClick={addBrandRow}
              disabled={!canAddBrand || isLoading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-zinc-200 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Add Brand
            </button>
          </div>
          {showValidation && brandCount === 0 && (
            <p className="text-sm text-red-500 mt-2">Add at least one brand name.</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <div className="relative md:col-span-2">
            <Crosshair className="absolute left-4 top-4 w-5 h-5 text-zinc-400" />
            <textarea
              value={analysisObjective}
              onChange={(e) => setAnalysisObjective(e.target.value)}
              placeholder="Visual Identity Objective (Required) e.g. Compare distinctiveness and consistency across premium skincare brands"
              rows={3}
              className="w-full pl-12 pr-4 py-4 rounded-2xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none text-left"
              disabled={isLoading}
            />
          </div>

          <div className="relative">
            <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            <input
              type="text"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              placeholder="Target Audience (Optional)"
              className="w-full pl-12 pr-4 py-4 rounded-2xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-left"
              disabled={isLoading}
            />
          </div>

        </div>

        <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-end pt-2">
          <button
            type="submit"
            disabled={isLoading}
            className="px-8 py-3 bg-zinc-900 text-white rounded-2xl font-medium hover:bg-zinc-800 transition-colors disabled:opacity-60 inline-flex items-center gap-2 relative overflow-hidden"
          >
            {isLoading ? (
              <ProgressiveLoader
                messages={[
                  'Collecting brand ecosystem snapshots...',
                  'Auditing logos, type, and color systems...',
                  'Comparing visual distinctiveness...',
                  'Drafting strategic visual guidance...',
                ]}
                showProgress
                progress={fakeProgress}
              />
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate Visual Analysis
              </>
            )}
            {isLoading && (
              <div className="absolute left-3 right-3 bottom-2 h-1 rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-fuchsia-400 transition-all duration-200"
                  style={{ width: `${fakeProgress}%` }}
                />
              </div>
            )}
          </button>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
      </motion.form>

      <p className={`text-xs text-zinc-400 text-center mt-4 sm:mt-3 select-none ${isSearchControlsMinimized ? 'hidden' : ''}`}>
        AI models can make mistakes. Always double check your work. Remember to think critically.
      </p>

      </div>


      <AnimatePresence mode="wait">
        {report && (
          <>
            {!allVisualsLoaded && expectedCount > 0 ? (
              <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
                <ProgressiveLoader
                  messages={['Loading all visual design elements...']}
                  showProgress
                  progress={Math.min(100, Math.round((expectedCount ? (100 * (expectedCount - (expectedCount - (allVisualsLoaded ? expectedCount : 0)))) / expectedCount : 0)))}
                />
                <span className="mt-4 text-zinc-500 text-sm">Preparing results...</span>
              </div>
            ) : (
              <motion.div
                key="brand-deep-dive-report"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="w-full max-w-4xl mx-auto mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6"
              >
                {/* ...existing code for the report panel... */}
              </motion.div>
            )}
          </>
        )}
      </AnimatePresence>

      <section className="w-full max-w-4xl mx-auto mt-10 bg-white rounded-3xl border border-zinc-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-zinc-400" />
            <h3 className="text-xl font-semibold text-zinc-900">Your Library</h3>
            <span className="text-xs text-zinc-400 ml-auto">{savedSearches.length} saved</span>
          </div>
          {savedSearches.length === 0 ? (
            <p className="text-sm text-zinc-500">Run an excavation to start building your saved search library.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
              {savedSearches.map((saved) => (
                <div
                  key={saved.id}
                  onClick={() => { if (renamingId !== saved.id) loadSavedSearch(saved); }}
                  className="group relative bg-zinc-50 border border-zinc-200 rounded-2xl p-4 hover:shadow-sm hover:border-indigo-200 cursor-pointer transition-all"
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSavedSearch(saved.id);
                    }}
                    className="absolute top-3 right-3 p-2 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all focus:opacity-100"
                    title="Delete saved report"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  {renamingId === saved.id ? (
                    <input
                      autoFocus
                      type="text"
                      value={renameValue}
                      maxLength={80}
                      className="text-sm font-semibold text-zinc-900 w-full pr-8 bg-transparent border-b border-indigo-400 outline-none text-left"
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => commitRename(saved.id, renameValue)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); commitRename(saved.id, renameValue); }
                        if (e.key === 'Escape') { setRenamingId(null); setRenameValue(''); }
                      }}
                    />
                  ) : (
                    <p
                      className="text-sm font-semibold text-zinc-900 truncate pr-8 hover:text-indigo-600 transition-colors"
                      title="Click to rename"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingId(saved.id);
                        setRenameValue(saved.customName ?? saved.brands.map((b) => b.name).join(' vs '));
                      }}
                    >
                      {saved.customName ?? saved.brands.map((b) => b.name).join(' vs ')}
                    </p>
                  )}
                  <p className="text-xs text-zinc-600 mt-1 line-clamp-2">
                    {saved.targetAudience || 'No audience provided'}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    {new Date(saved.date).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

      <AnimatePresence>
        {comparePopup && resultTab === 'profiles' && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setComparePopup(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -4 }}
              transition={{ duration: 0.16 }}
              className="fixed z-50"
              style={{ left: comparePopup.x, top: comparePopup.y }}
            >
              <button
                type="button"
                onClick={() => compareAcrossBrands(comparePopup.target)}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-lg hover:bg-zinc-50"
              >
                <Share2 className="w-4 h-4" /> Compare Across Brands
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      </div>
    </>
  );
}