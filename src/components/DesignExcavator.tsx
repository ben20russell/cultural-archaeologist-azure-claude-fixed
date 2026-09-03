import PptxGenJS from 'pptxgenjs';
import { ProgressiveLoader } from './ProgressiveLoader';
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
// Loader state for all visuals
type UseAllVisualsLoadedResult = {
  allVisualsLoaded: boolean;
  handleImageLoad: () => void;
  handleImageError: () => void;
  expectedCount: number;
};

const useAllVisualsLoaded = (
  report: VisualDesignReport | null,
  bestVisualsByBrand: Record<string, BrandVisualSelection>
): UseAllVisualsLoadedResult => {
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
    report.brandProfiles.forEach((profile) => {
      const visuals = bestVisualsByBrand[profile.brandName];
      if (visuals) {
        if (visuals.deterministicLogoUrl) count += 1;
        count += visuals.images.length;
      }
    });
    setExpectedCount(count);
    loadedCountRef.current = 0;
    setAllVisualsLoaded(count === 0);
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
import { Search, Info, ChevronDown, Trash2, Plus, Crosshair, Loader2, Presentation, FileText, ImageIcon, Type, Palette, Clock, ExternalLink, Share2, Globe, Tag, Sparkles, ArrowLeft, RefreshCw, X, Pipette, Menu } from 'lucide-react';
import { CompassRoseIcon } from './icons/CompassRoseIcon';
import { navigateToHashRoute } from '../services/navigation';
import { toSafeExternalHref } from '../services/external-links';
import {
  BrandColorSpec,
  BrandDeepDiveReport as VisualDesignReport,
  generateBrandDeepDive as generateVisualDesign,
  submitBrandDeepDivePrompt as submitVisualDesignPrompt,
  suggestBrandWebsite,
} from '../services/azure-openai';
import { supabase } from '../services/supabase-client';
import { Accordion } from './Accordion';
import { runUserAction } from '../services/user-actions';
import { normalizeAppError } from '../services/api-errors';
import { logger } from '../services/logger';
import { getUserTelemetry } from '../services/telemetry';
import { SectionErrorBoundary } from './SectionErrorBoundary';
import { RecentResultsLibrary } from './RecentResultsLibrary';
import {
  APP_RECENT_RESULTS_MODES,
  saveRecentResult,
  type RecentResultRecord,
} from '../services/recent-results-storage';
import { handleTextareaBulletShortcuts } from '../services/textarea-bullet-shortcuts';
import { SourceLinkRow } from './SourceLinkRow';
import {
  clearDesignExcavatorPrefill,
  readDesignExcavatorPrefill,
} from '../services/design-excavator-prefill';
import { MobileTwoLineSubcopy } from './MobileTwoLineSubcopy';
import { MobileResultsNav } from './MobileResultsNav';
import { ShowThinkingDropdown } from './ShowThinkingDropdown';
import {
  type BrandAtlasExportDocument,
  exportBrandAtlasDocumentToPdf,
  exportBrandAtlasDocumentToPptx,
} from '../services/brand-atlas-themed-export';

interface VisualDesignPageProps {
  onBack: () => void;
}

const DESIGN_EXCAVATOR_SHOW_THINKING_TEXT = 'Ran multimodal retrieval + analysis: parsed visual/UI signals, retrieved comparable design patterns, scored alignment against current conventions, and produced evidence-backed improvement opportunities.';

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

interface LiveTypographyStyleSample {
  fontFamily: string;
  fontWeight: string;
  fontSize: string;
  lineHeight: string;
  color: string;
}

interface LiveTypographyByTag {
  h1: LiveTypographyStyleSample[];
  h2: LiveTypographyStyleSample[];
  h3: LiveTypographyStyleSample[];
  p: LiveTypographyStyleSample[];
  body: LiveTypographyStyleSample[];
}

interface SavedDeepDiveSearch {
  id: string;
  date: string;
  brands: Array<{ name: string; website?: string }>;
  analysisObjective: string;
  targetAudience: string;
  report: VisualDesignReport;
  customName?: string;
  device?: string;
  location?: string;
  ip_address?: string;
}

const BRAND_EXCAVATOR_TABLE = 'brandexcavator';
const BRAND_EXCAVATOR_TABLE_CANDIDATES = [
  BRAND_EXCAVATOR_TABLE,
  'BrandExcavator',
  'Design_Excavator',
  'brand_deep_dives',
] as const;

type DesignExcavatorRecentResult = RecentResultRecord & {
  savedSearch?: SavedDeepDiveSearch;
  report?: VisualDesignReport;
  brands?: Array<{ name: string; website?: string }>;
  analysisObjective?: string;
  targetAudience?: string;
};

type ResultTab = 'profiles' | 'compare';
type CompareElement = 'primaryColors' | 'accentColors' | 'neutrals' | 'typography' | 'imageryStyle';
type PaletteColorGroup = 'primaryColors' | 'secondaryAccentColors' | 'neutrals';
type EvidenceTagLabel = 'known' | 'inferred' | 'speculative' | 'analogy';

const isMissingResultTextValue = (value?: string | null): boolean => {
  const normalized = (value || '').trim().toLowerCase();
  return normalized.length === 0 || normalized === 'n/a' || normalized === 'na' || normalized === 'data unavailable';
};

const MAX_EXCAVATOR_BRAND_NAME_LENGTH = 120;
const MAX_EXCAVATOR_BRAND_WEBSITE_LENGTH = 200;
const MAX_EXCAVATOR_OBJECTIVE_LENGTH = 240;
const MAX_EXCAVATOR_AUDIENCE_LENGTH = 180;
const MAX_EXCAVATOR_QUESTION_LENGTH = 400;

const buildDetailedAudiencePrompt = (audienceValue: string, audienceDetailValue: string): string => {
  const trimmedAudience = (audienceValue || '').trim();
  const trimmedAudienceDetail = (audienceDetailValue || '').trim();

  if (!trimmedAudienceDetail) {
    return trimmedAudience;
  }

  if (!trimmedAudience) {
    return `Detailed Audience Definition:\n${trimmedAudienceDetail}`;
  }

  return `${trimmedAudience}\n\nDetailed Audience Definition (background context):\n${trimmedAudienceDetail}`;
};

interface ComparePopupState {
  x: number;
  y: number;
  target: CompareElement;
}

interface ActiveColorOverride {
  brandIndex: number;
  brandName: string;
  colorGroup: PaletteColorGroup;
  colorIndex: number;
  colorName: string;
  currentHex: string;
  screenshotUrl: string | null;
  autoLaunchNonce: number;
}

const extractEvidenceTags = (value: string): { cleanText: string; labels: EvidenceTagLabel[] } => {
  if (!value) {
    return { cleanText: '', labels: [] };
  }

  const labels: EvidenceTagLabel[] = [];
  const markerPattern = /\[(KNOWN|INFERRED|INFERED|SPECULATIVE|ANALOGY)(?:[^\]]*)\]|\[(KNOWN|INFERRED|INFERED|SPECULATIVE|ANALOGY)(?=[^\]]*$)|\b(KNOWN|INFERRED|INFERED|SPECULATIVE|ANALOGY)\b(?=\s*[:;\-]|\s*$|[.)\]])/gi;
  let match: RegExpExecArray | null = markerPattern.exec(value);

  while (match) {
    const rawLabel = (match[1] || match[2] || match[3] || '').toLowerCase();
    const normalizedLabel: EvidenceTagLabel = rawLabel === 'infered' ? 'inferred' : (rawLabel as EvidenceTagLabel);
    if (!labels.includes(normalizedLabel)) {
      labels.push(normalizedLabel);
    }
    match = markerPattern.exec(value);
  }

  const cleanText = value
    .replace(/\[(KNOWN|INFERRED|INFERED|SPECULATIVE|ANALOGY)(?:[^\]]*)\]\s*/gi, '')
    .replace(/\[(KNOWN|INFERRED|INFERED|SPECULATIVE|ANALOGY)\s*[:;\-]?\s*/gi, '')
    .replace(/\b(KNOWN|INFERRED|INFERED|SPECULATIVE|ANALOGY)\b\s*[:;\-]\s*/gi, '')
    .replace(/\.(KNOWN|INFERRED|INFERED|SPECULATIVE|ANALOGY)\s*$/i, '.')
    .replace(/\s+(KNOWN|INFERRED|INFERED|SPECULATIVE|ANALOGY)\s*$/i, '')
    .replace(/\[\s*\]/g, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return { cleanText, labels };
};

const cleanEvidenceText = (value?: string | null): string => {
  const parsed = extractEvidenceTags(value || '');
  return (parsed.cleanText || value || '').trim();
};

const evidenceLabelChipClass = (label: EvidenceTagLabel): string => {
  if (label === 'analogy') {
    return 'bg-zinc-100 text-zinc-600 border border-zinc-200';
  }
  return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
};

const renderEvidenceLabel = (label: EvidenceTagLabel): string =>
  label.toUpperCase();

function isDevilsAdvocateLine(value: string): boolean {
  return /devil'?s advocate/i.test(value || '');
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

  // Default to same-origin relative `/api` so Vite proxy and deployed routes both work.
  return '';
};

function buildApiUrl(pathname: string): string {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const base = getImageProxyBaseUrl();
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

function pickFirstNonEmptyUrl(...candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    const value = (candidate || '').trim();
    if (value) return value;
  }
  return null;
}

function extractOriginalImageUrlFromProxy(rawUrl: string): string | null {
  if (!rawUrl || !rawUrl.includes('/api/image-proxy')) return null;

  try {
    const parsed = rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
      ? new URL(rawUrl)
      : new URL(rawUrl, 'http://localhost');
    const proxied = parsed.searchParams.get('url');
    return normalizeHttpUrl(proxied || '');
  } catch {
    return null;
  }
}

function withImageProxy(rawUrl: string): string {
  if (!rawUrl || rawUrl.startsWith('data:image')) {
    return rawUrl;
  }

  const normalized = normalizeHttpUrl(rawUrl);
  const proxiedOriginal = extractOriginalImageUrlFromProxy(rawUrl);
  const proxyBase = getImageProxyBaseUrl();

  if (proxiedOriginal) {
    return proxyBase ? rawUrl : proxiedOriginal;
  }

  if (!normalized) {
    return rawUrl;
  }

  // Prefer direct browser image loading by default. This keeps visuals working
  // even when the local API proxy server is unavailable.
  if (!proxyBase) return normalized;
  return `${proxyBase}/api/image-proxy?url=${encodeURIComponent(normalized)}`;
}

function normalizeHttpUrl(rawUrl?: string | null): string | null {
  if (!rawUrl) return null;

  const trimmed = (rawUrl || '').trim();
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

function buildWebsiteFaviconCandidateUrls(website?: string | null): string[] {
  const origin = getOriginFromUrl(website);
  const hostname = getDomainFromUrl(website);
  if (!origin) return [];

  const localCandidates = dedupeVisualCards([
    { label: 'Favicon ICO', url: `${origin}/favicon.ico` },
    { label: 'Favicon PNG', url: `${origin}/favicon.png` },
    { label: 'Favicon SVG', url: `${origin}/favicon.svg` },
    { label: 'Apple Touch Icon', url: `${origin}/apple-touch-icon.png` },
    { label: 'Apple Touch Icon Precomposed', url: `${origin}/apple-touch-icon-precomposed.png` },
    { label: 'Apple Icon 180', url: `${origin}/apple-touch-icon-180x180.png` },
    { label: 'Android Chrome Icon 192', url: `${origin}/android-chrome-192x192.png` },
  ]).map((card) => card.url);

  const externalCandidates = hostname
    ? [
        `https://logo.clearbit.com/${hostname}`,
        `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=256`,
        `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=128`,
        `https://icons.duckduckgo.com/ip3/${hostname}.ico`,
      ]
    : [];

  return dedupeVisualCards(
    [...localCandidates, ...externalCandidates].map((url) => ({ label: 'favicon-fallback', url }))
  ).map((card) => card.url);
}

function buildSquareLogoCandidateUrls(website?: string | null): string[] {
  const origin = getOriginFromUrl(website);
  if (!origin) return [];

  return dedupeVisualCards([
    { label: 'Brand Mark', url: `${origin}/brandmark.svg` },
    { label: 'Brand Mark PNG', url: `${origin}/brandmark.png` },
    { label: 'Logo Icon', url: `${origin}/logo-icon.svg` },
    { label: 'Logo Icon PNG', url: `${origin}/logo-icon.png` },
    { label: 'Icon SVG', url: `${origin}/icon.svg` },
    { label: 'Icon PNG', url: `${origin}/icon.png` },
    { label: 'Mark SVG', url: `${origin}/mark.svg` },
    { label: 'Mark PNG', url: `${origin}/mark.png` },
    { label: 'Symbol SVG', url: `${origin}/symbol.svg` },
    { label: 'Symbol PNG', url: `${origin}/symbol.png` },
    { label: 'Assets Icon', url: `${origin}/assets/icon.png` },
    { label: 'Images Icon', url: `${origin}/images/icon.png` },
    { label: 'Square Logo 512', url: `${origin}/logo-512x512.png` },
    { label: 'Square Logo 256', url: `${origin}/logo-256x256.png` },
    { label: 'Square Logo 192', url: `${origin}/logo-192x192.png` },
  ]).map((card) => card.url);
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
    { label: 'Open Graph Image Root', url: `${origin}/images/og-image.jpg` },
    { label: 'Open Graph Image Root PNG', url: `${origin}/images/og-image.png` },
    { label: 'Twitter Card Image', url: `${origin}/images/twitter-card.jpg` },
    { label: 'Twitter Card Image PNG', url: `${origin}/images/twitter-card.png` },
    { label: 'Homepage Cover', url: `${origin}/images/cover.jpg` },
    { label: 'Homepage Cover PNG', url: `${origin}/images/cover.png` },
    { label: 'Hero Assets JPG', url: `${origin}/assets/hero.jpg` },
    { label: 'Hero Assets PNG', url: `${origin}/assets/hero.png` },
    { label: 'Homepage Assets JPG', url: `${origin}/assets/homepage.jpg` },
    { label: 'Homepage Assets PNG', url: `${origin}/assets/homepage.png` },
    { label: 'Banner Assets JPG', url: `${origin}/assets/banner.jpg` },
    { label: 'Banner Assets PNG', url: `${origin}/assets/banner.png` },
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
    ? [buildWordpressScreenshotUrl(normalizedWebsite), buildScreenshotPreviewUrl(normalizedWebsite)]
    : [];
  const visualAssetFallbacks = buildLargeVisualCandidateUrls(website);

  return dedupeVisualCards(
    [
      ...visualAssetFallbacks.map((url) => ({ label: 'visual', url })),
      ...screenshotFallbacks.map((url) => ({ label: 'preview', url })),
    ]
  )
    .map((card) => withImageProxy(card.url))
    .filter((url) => normalizeHttpUrl(url) !== normalizedPrimary);
}

function buildContextualSiteTargets(website?: string | null): string[] {
  const origin = getOriginFromUrl(website);
  if (!origin) return [];

  return dedupeVisualCards([
    { label: 'Homepage Preview', url: `${origin}/` },
    { label: 'About Page Preview', url: `${origin}/about` },
    { label: 'Company Page Preview', url: `${origin}/company` },
    { label: 'Products Page Preview', url: `${origin}/products` },
    { label: 'Services Page Preview', url: `${origin}/services` },
    { label: 'Features Page Preview', url: `${origin}/features` },
    { label: 'Collections Page Preview', url: `${origin}/collections` },
    { label: 'Work Page Preview', url: `${origin}/work` },
  ]).map((card) => card.url);
}

function prioritizeLogoAndVisualCards(cards: BrandVisualCard[], maxCards = 8): BrandVisualCard[] {
  const deduped = dedupeVisualCards(cards);
  const nonLogoCards = deduped.filter((card) => !isLogoLikeAsset(card.originalUrl || card.url, card.label));
  const logoCards = deduped.filter((card) => isLogoLikeAsset(card.originalUrl || card.url, card.label));

  if (nonLogoCards.length === 0) {
    return deduped.slice(0, maxCards);
  }

  return [...nonLogoCards, ...logoCards.slice(0, 1)].slice(0, maxCards);
}

function buildBrandBadgeFallbackChain(primaryUrl?: string | null, website?: string | null): string[] {
  const primary = primaryUrl ? withImageProxy(primaryUrl) : null;

  return dedupeVisualCards(
    [
      ...buildWebsiteFaviconCandidateUrls(website).map((url) => ({ label: 'favicon', url })),
      ...buildLargeLogoCandidateUrls(website).map((url) => ({ label: 'logo', url })),
    ]
  )
    .map((card) => withImageProxy(card.url))
    .filter((url) => url !== primary);
}

function buildSquareLogoPreferredBadgeChain(website?: string | null, primaryUrl?: string | null): string[] {
  const primary = primaryUrl ? withImageProxy(primaryUrl) : null;

  return dedupeVisualCards(
    [
      ...buildSquareLogoCandidateUrls(website).map((url) => ({ label: 'square-logo', url })),
      ...(primaryUrl ? [{ label: 'primary', url: primaryUrl }] : []),
      ...buildLargeLogoCandidateUrls(website)
        .filter((url) => !isFaviconLikeAssetUrl(url))
        .map((url) => ({ label: 'logo', url })),
      ...buildWebsiteFaviconCandidateUrls(website).map((url) => ({ label: 'favicon', url })),
    ]
  )
    .map((card) => withImageProxy(card.url))
    .filter((url) => url !== primary);
}

function buildFaviconPreferredBadgeChain(website?: string | null, primaryUrl?: string | null): string[] {
  const primary = primaryUrl ? withImageProxy(primaryUrl) : null;

  return dedupeVisualCards(
    [
      ...buildWebsiteFaviconCandidateUrls(website).map((url) => ({ label: 'favicon', url })),
      ...buildSquareLogoCandidateUrls(website).map((url) => ({ label: 'square-logo', url })),
      ...(primaryUrl ? [{ label: 'primary', url: primaryUrl }] : []),
      ...buildLargeLogoCandidateUrls(website)
        .filter((url) => !isFaviconLikeAssetUrl(url))
        .map((url) => ({ label: 'logo', url })),
    ]
  )
    .map((card) => withImageProxy(card.url))
    .filter((url) => url !== primary);
}

function isFaviconLikeAssetUrl(url?: string | null): boolean {
  if (!url) return false;
  let value = url.toLowerCase();
  try {
    value = decodeURIComponent(value);
  } catch {
    // Keep original string if decode fails.
  }
  return (
    value.includes('favicon') ||
    value.includes('apple-touch-icon') ||
    value.includes('android-chrome') ||
    value.includes('mstile') ||
    value.includes('mask-icon')
  );
}

function advanceImageFallbackOrHide(event: React.SyntheticEvent<HTMLImageElement>) {
  const target = event.currentTarget;
  const attemptedSource = target.currentSrc || target.src;
  const unproxiedSource = extractOriginalImageUrlFromProxy(attemptedSource);
  const unproxiedAttempted = target.dataset.unproxiedAttempted === 'true';
  if (unproxiedSource && !unproxiedAttempted && attemptedSource !== unproxiedSource) {
    target.dataset.unproxiedAttempted = 'true';
    target.dataset.revealed = 'false';
    target.style.opacity = '0';
    target.src = unproxiedSource;
    return;
  }

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
    target.dataset.revealed = 'false';
    target.style.opacity = '0';
    target.src = nextFallback;
    return;
  }

  target.onerror = null;
  target.style.display = 'none';
}

function buildInlineFallbackImageSvg(label: string): string {
  const safeLabel = (label || 'Preview unavailable').replace(/\s+/g, ' ').trim();
  const svg = [
    "<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360'>",
    "<rect width='100%' height='100%' fill='#F4F4F5'/>",
    "<rect x='24' y='24' width='592' height='312' rx='16' ry='16' fill='#FFFFFF' stroke='#D4D4D8'/>",
    `<text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#6B7280' font-family='Arial, sans-serif' font-size='20'>${safeLabel}</text>`,
    '</svg>',
  ].join('');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
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
  const attemptedSource = target.currentSrc || target.src;
  const unproxiedSource = extractOriginalImageUrlFromProxy(attemptedSource);
  const unproxiedAttempted = target.dataset.unproxiedAttempted === 'true';
  if (unproxiedSource && !unproxiedAttempted && attemptedSource !== unproxiedSource) {
    target.dataset.unproxiedAttempted = 'true';
    target.dataset.revealed = 'false';
    target.style.opacity = '0';
    target.src = unproxiedSource;
    return;
  }

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
    target.dataset.revealed = 'false';
    target.style.opacity = '0';
    target.src = nextFallback;
    return;
  }

  target.onerror = null;
  target.dataset.revealed = 'false';
  target.style.opacity = '0';
  target.src = buildInlineFallbackImageSvg(target.alt || 'Preview unavailable');
}

function revealImageOnLoad(event: React.SyntheticEvent<HTMLImageElement>) {
  const target = event.currentTarget;
  if (target.dataset.revealed === 'true') return;
  target.dataset.revealed = 'true';
  target.style.opacity = '1';
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
    if (parsed.pathname.endsWith('/api/image-proxy')) {
      const proxiedRawUrl = parsed.searchParams.get('url');
      const normalizedProxiedUrl = normalizeHttpUrl(proxiedRawUrl || '');
      if (normalizedProxiedUrl) {
        const proxiedParsed = new URL(normalizedProxiedUrl);
        return `${proxiedParsed.origin}${proxiedParsed.pathname}${proxiedParsed.search}`.toLowerCase();
      }
    }

    return `${parsed.origin}${parsed.pathname}${parsed.search}`.toLowerCase();
  } catch {
    return normalized.toLowerCase();
  }
}

function isKnownBrokenVisualAssetUrl(rawUrl: string): boolean {
  const value = (rawUrl || '').toLowerCase();
  return (
    /(^|[\/_.-])404([\/_.-]|$)/.test(value) ||
    value.includes('not-found') ||
    value.includes('not_found') ||
    value.includes('missing-image') ||
    value.includes('missing_image') ||
    value.includes('placeholder-image') ||
    value.includes('placeholder_image') ||
    value.includes('default-image') ||
    value.includes('default_image')
  );
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

function normalizeHexColorValue(value: string): string | null {
  const cleaned = (value || '').trim().replace(/^#/, '');
  if (!cleaned) return null;
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(cleaned)) return null;
  const expanded = cleaned.length === 3
    ? cleaned.split('').map((char) => `${char}${char}`).join('')
    : cleaned;
  return `#${expanded.toUpperCase()}`;
}

function useNativeEyedropper() {
  const [isSupported] = useState(() => typeof window !== 'undefined' && 'EyeDropper' in window);

  const pickColor = useCallback(async (): Promise<string | null> => {
    if (!isSupported || typeof window === 'undefined') {
      return null;
    }

    try {
      const EyeDropperCtor = (window as Window & { EyeDropper?: { new (): { open: () => Promise<{ sRGBHex: string }> } } }).EyeDropper;
      if (!EyeDropperCtor) {
        return null;
      }
      const eyeDropper = new EyeDropperCtor();
      const result = await eyeDropper.open();
      return normalizeHexColorValue(result?.sRGBHex || '') || result?.sRGBHex || null;
    } catch (error) {
      console.log('[DesignExcavator] Native eyedropper was cancelled or failed.', { error });
      return null;
    }
  }, [isSupported]);

  return { isSupported, pickColor };
}

export function VisualDesignPage({ onBack }: VisualDesignPageProps) {
  const exportCaptureRef = useRef<HTMLDivElement>(null);
  const brandNameInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const pendingBrandNameFocusIndexRef = useRef<number | null>(null);
  const [brands, setBrands] = useState<Array<{ id: string; name: string; website: string }>>([
    { id: 'brand-1', name: '', website: '' },
    { id: 'brand-2', name: '', website: '' },
  ]);
  const [analysisObjective, setAnalysisObjective] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [targetAudienceDetail, setTargetAudienceDetail] = useState('');
  const [isTargetAudienceDetailOpen, setIsTargetAudienceDetailOpen] = useState(false);
  const [resultTab, setResultTab] = useState<ResultTab>('profiles');
  const [compareElement, setCompareElement] = useState<CompareElement>('primaryColors');
  const [comparePopup, setComparePopup] = useState<ComparePopupState | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fakeProgress, setFakeProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const [exportError, setExportError] = useState<{ type: 'pptx' | 'pdf'; message: string } | null>(null);

  const [report, setReport] = useState<VisualDesignReport | null>(null);
  const [reportQuestion, setReportQuestion] = useState('');
  const [reportAnswer, setReportAnswer] = useState('');
  const [isSubmittingPrompt, setIsSubmittingPrompt] = useState(false);
  const [isSearchControlsMinimized, setIsSearchControlsMinimized] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isMobileTopBarVisible, setIsMobileTopBarVisible] = useState(true);
  const lastMobileScrollYRef = useRef(0);
  const [bestVisualsByBrand, setBestVisualsByBrand] = useState<Record<string, BrandVisualSelection>>({});
  const [visualFailuresByCard, setVisualFailuresByCard] = useState<Record<string, { attempts: number; lastSource: string; isPlaceholder: boolean; hidden?: boolean; retried?: boolean }>>({});
  const [isExporting, setIsExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [savedSearches, setSavedSearches] = useState<SavedDeepDiveSearch[]>([]);
  const [resolvedBrandExcavatorTable, setResolvedBrandExcavatorTable] = useState<string>(BRAND_EXCAVATOR_TABLE);
  const websiteLookupTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const undoDeleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [recentlyDeletedSearch, setRecentlyDeletedSearch] = useState<SavedDeepDiveSearch | null>(null);
  const [undoToast, setUndoToast] = useState<{ message: string } | null>(null);
  const [processedLogos, setProcessedLogos] = useState<Record<string, { base64Placeholder: string; dominantColorHex: string }>>({});
  const requestedLogosRef = useRef<Set<string>>(new Set());
  const [heroImages, setHeroImages] = useState<Record<string, string | null>>({});
  const [logoImages, setLogoImages] = useState<Record<string, string | null>>({});
  const requestedHeroRef = useRef<Set<string>>(new Set());
  const [liveTypographyByBrand, setLiveTypographyByBrand] = useState<Record<string, LiveTypographyByTag | null>>({});
  const requestedTypographyRef = useRef<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [recentResultsRefreshNonce, setRecentResultsRefreshNonce] = useState(0);
  const [activeColorOverride, setActiveColorOverride] = useState<ActiveColorOverride | null>(null);
  const [isPickingColor, setIsPickingColor] = useState(false);
  const { isSupported: isNativeEyedropperSupported, pickColor } = useNativeEyedropper();

  // Loader for all visuals (now after report and bestVisualsByBrand)
  const { allVisualsLoaded, handleImageLoad, handleImageError, expectedCount } = useAllVisualsLoaded(report, bestVisualsByBrand);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleMobileHeaderScroll = () => {
      const currentScrollY = window.scrollY || 0;
      const previousScrollY = lastMobileScrollYRef.current;

      if (currentScrollY <= 0) {
        setIsMobileTopBarVisible(true);
        lastMobileScrollYRef.current = 0;
        return;
      }

      if (currentScrollY > previousScrollY + 4) {
        setIsMobileTopBarVisible(false);
        setIsMobileNavOpen(false);
      } else if (currentScrollY < previousScrollY - 4) {
        setIsMobileTopBarVisible(true);
      }

      lastMobileScrollYRef.current = currentScrollY;
    };

    lastMobileScrollYRef.current = window.scrollY || 0;
    window.addEventListener('scroll', handleMobileHeaderScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleMobileHeaderScroll);
  }, []);

  const clearExcavatorSearch = (options?: { singleRow?: boolean }) => {
    if (options?.singleRow) {
      setBrands([{ id: brands[0]?.id || 'brand-1', name: '', website: '' }]);
    } else {
      setBrands([
        { id: 'brand-1', name: '', website: '' },
        { id: 'brand-2', name: '', website: '' },
      ]);
    }
    setAnalysisObjective('');
    setTargetAudience('');
    setTargetAudienceDetail('');
    setIsTargetAudienceDetailOpen(false);
    setResultTab('profiles');
    setCompareElement('primaryColors');
    setShowValidation(false);
    setError(null);
    setSaveWarning(null);
    setExportError(null);
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
    setLiveTypographyByBrand({});
    requestedTypographyRef.current.clear();
    setToast(options?.singleRow ? 'Cleared search fields.' : 'Started a new search.');
    setActiveColorOverride(null);
    setIsPickingColor(false);
  };

  const shouldKeepDefaultLinkBehavior = (event: React.MouseEvent<HTMLAnchorElement>): boolean => {
    return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
  };

  const handlePrimaryLinkNavigation = (
    event: React.MouseEvent<HTMLAnchorElement>,
    navigate: () => void
  ): void => {
    if (shouldKeepDefaultLinkBehavior(event)) {
      return;
    }

    event.preventDefault();
    navigate();
  };

  const openComparePopup = (event: React.MouseEvent<HTMLElement>, target: CompareElement) => {
    if (!showCompareTab) {
      return;
    }

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
    if (!showCompareTab) {
      setComparePopup(null);
      return;
    }
    setCompareElement(target);
    setResultTab('compare');
    setComparePopup(null);
  };

  const loadSavedSearch = (saved: SavedDeepDiveSearch) => {
    const loadedBrands = saved.brands.slice(0, 6).map((brand, idx) => ({
      id: `brand-loaded-${Date.now()}-${idx}`,
      name: (brand.name || '').trim(),
      website: (brand.website || '').trim(),
    }));
    setBrands(loadedBrands.length > 0 ? loadedBrands : [{ id: 'brand-1', name: '', website: '' }]);
    setAnalysisObjective(saved.analysisObjective || '');
    setTargetAudience(saved.targetAudience || '');
    setTargetAudienceDetail('');
    setIsTargetAudienceDetailOpen(false);
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
    setLiveTypographyByBrand({});
    requestedTypographyRef.current.clear();
    setToast('Loaded saved search.');
    const recentItem: DesignExcavatorRecentResult = {
      id: saved.id,
      title: (saved.customName || saved.brands.map((brand) => brand.name).join(' vs ') || 'Saved Design Result').trim(),
      description: (saved.targetAudience || 'No audience provided').trim(),
      savedSearch: saved,
    };
    console.log('[DesignExcavator] Tracking recently viewed saved search.', { id: saved.id, title: recentItem.title });
    saveRecentResult(APP_RECENT_RESULTS_MODES.DESIGN_EXCAVATOR, recentItem);
    setRecentResultsRefreshNonce((prev) => prev + 1);
  };

  const renameSavedSearch = async (id: string, newName: string) => {
    const trimmed = (newName || '').trim();
    if (!trimmed) return;
    const { data, error } = await supabase
      .from(resolvedBrandExcavatorTable)
      .update({ custom_name: trimmed })
      .eq('id', id)
      .select();
    if (!error && data) {
      setSavedSearches((prev) => prev.map((item) => item.id === id ? { ...item, customName: trimmed } : item));
    }
  };

  const commitRename = (id: string, value: string) => {
    if ((value || '').trim()) renameSavedSearch(id, value);
    setRenamingId(null);
    setRenameValue('');
  };

  const deleteSavedSearch = async (id: string) => {
    const deleted = savedSearches.find((item) => item.id === id);
    if (!deleted) return;

    const { error } = await supabase
      .from(resolvedBrandExcavatorTable)
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
    const { error } = await supabase.from(resolvedBrandExcavatorTable).insert([
      {
        id: recentlyDeletedSearch.id,
        brands: recentlyDeletedSearch.brands,
        analysis_objective: recentlyDeletedSearch.analysisObjective,
        target_audience: recentlyDeletedSearch.targetAudience,
        report: recentlyDeletedSearch.report,
        custom_name: recentlyDeletedSearch.customName,
        created_at: recentlyDeletedSearch.date,
        device: recentlyDeletedSearch.device || 'Unknown',
        location: recentlyDeletedSearch.location || 'Unknown',
        ip_address: recentlyDeletedSearch.ip_address || '',
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
      const orderColumns = ['created_at', 'createdAt'];
      console.log('[DesignExcavator] Loading saved searches from Supabase.', {
        tableCandidates: BRAND_EXCAVATOR_TABLE_CANDIDATES,
        orderColumns,
      });

      for (const tableName of BRAND_EXCAVATOR_TABLE_CANDIDATES) {
        for (const orderColumn of orderColumns) {
          const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .order(orderColumn, { ascending: false });

          if (!error && Array.isArray(data)) {
            console.log('[DesignExcavator] Loaded saved searches from Supabase.', {
              tableName,
              orderColumn,
              count: data.length,
            });
            setResolvedBrandExcavatorTable(tableName);
            setSavedSearches(
              data.map((row) => ({
                id: row.id,
                date: row.created_at || row.createdAt,
                brands: row.brands,
                analysisObjective: row.analysis_objective,
                targetAudience: row.target_audience,
                report: row.report,
                customName: row.custom_name,
                device: row.device,
                location: row.location,
                ip_address: row.ip_address,
              }))
            );
            return;
          }

          console.log('[DesignExcavator] Supabase saved-search load attempt failed.', {
            tableName,
            orderColumn,
            errorCode: error?.code,
            errorMessage: error?.message,
            errorHint: error?.hint,
          });
        }
      }

      console.log('[DesignExcavator] Unable to load saved searches from all table candidates.');
      setSavedSearches([]);
      setSaveWarning('Could not load saved projects. Confirm table name, RLS policies, and refresh.');
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
    Object.entries(bestVisualsByBrand).forEach(([brandName, visuals]) => {
      const logoUrl = visuals.deterministicLogoUrl;
      if (!logoUrl || requestedLogosRef.current.has(brandName)) return;

      requestedLogosRef.current.add(brandName);
      fetch(buildApiUrl(`/api/process-image?url=${encodeURIComponent(logoUrl)}`))
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
      fetch(buildApiUrl(`/api/brand-images?domain=${encodeURIComponent(website)}`))
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

    report.brandProfiles.forEach((profile) => {
      const website = profile.website;
      if (!website || requestedTypographyRef.current.has(profile.brandName)) return;

      requestedTypographyRef.current.add(profile.brandName);
      const endpoint = buildApiUrl(`/api/extract-typography?url=${encodeURIComponent(website)}&maxSamplesPerTag=3`);
      console.log('[DesignExcavator] Requesting live typography extraction.', {
        brandName: profile.brandName,
        website,
        endpoint,
      });
      fetch(endpoint)
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
        .then((payload: {
          success?: boolean;
          typography?: LiveTypographyByTag;
        }) => {
          if (!payload?.success || !payload.typography) {
            setLiveTypographyByBrand((prev) => ({ ...prev, [profile.brandName]: null }));
            return;
          }
          setLiveTypographyByBrand((prev) => ({ ...prev, [profile.brandName]: payload.typography || null }));
          console.log('[DesignExcavator] Received live typography extraction.', {
            brandName: profile.brandName,
            h1: payload.typography.h1?.length || 0,
            h2: payload.typography.h2?.length || 0,
            h3: payload.typography.h3?.length || 0,
            p: payload.typography.p?.length || 0,
          });
        })
        .catch((error) => {
          console.log('[DesignExcavator] Live typography extraction failed; keeping fallback UI.', {
            brandName: profile.brandName,
            website,
            error: error instanceof Error ? error.message : String(error),
          });
          setLiveTypographyByBrand((prev) => ({ ...prev, [profile.brandName]: null }));
        });
    });
  }, [bestVisualsByBrand, report]);

  useEffect(() => {
    if (!toast) return;
    const timeoutId = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    return () => {
      if (undoDeleteTimeoutRef.current) {
        clearTimeout(undoDeleteTimeoutRef.current);
        undoDeleteTimeoutRef.current = null;
      }
    };
  }, []);

  const runDesignGeneration = async ({
    actionName,
    normalizedBrands,
    resolvedAnalysisObjective,
    targetAudienceValue,
    targetAudienceDetailValue,
  }: {
    actionName: string;
    normalizedBrands: Array<{ name: string; website: string }>;
    resolvedAnalysisObjective: string;
    targetAudienceValue: string;
    targetAudienceDetailValue?: string;
  }) => {
    setFakeProgress(5);
    setIsLoading(true);
    setError(null);
    setSaveWarning(null);
    setExportError(null);
    setResultTab('profiles');
    setReportQuestion('');
    setReportAnswer('');
    setBestVisualsByBrand({});

    try {
      const effectiveTargetAudienceValue = buildDetailedAudiencePrompt(targetAudienceValue, targetAudienceDetailValue || '');
      const result = await runUserAction({
        actionName,
        action: () =>
          generateVisualDesign({
            brands: normalizedBrands,
            analysisObjective: resolvedAnalysisObjective,
            targetAudience: effectiveTargetAudienceValue,
          }),
        onError: (normalized) => setError(normalized.message),
      });

      if (!result) {
        setError('No results were returned from the visual design API. Please try again.');
        setIsLoading(false);
        return;
      }

      setReport(result);
      setIsSearchControlsMinimized(true);
      const generatedRecentId = `generated:${normalizedBrands.map((brand) => brand.name.toLowerCase()).join('|')}|${targetAudienceValue.toLowerCase()}`;
      const generatedRecentItem: DesignExcavatorRecentResult = {
        id: generatedRecentId,
        title: normalizedBrands.map((brand) => brand.name).join(' vs ') || 'Generated Visual Analysis',
        description: (targetAudienceValue || 'No audience provided').trim(),
        report: result,
        brands: normalizedBrands,
        analysisObjective: resolvedAnalysisObjective,
        targetAudience: targetAudienceValue,
      };
      console.log('[DesignExcavator] Tracking generated result in recent results library.', {
        id: generatedRecentId,
        title: generatedRecentItem.title,
      });
      saveRecentResult(APP_RECENT_RESULTS_MODES.DESIGN_EXCAVATOR, generatedRecentItem);
      setRecentResultsRefreshNonce((prev) => prev + 1);

      const nextSaved: SavedDeepDiveSearch = {
        id: `deep-dive-${Date.now()}`,
        date: new Date().toISOString(),
        brands: normalizedBrands,
        analysisObjective: resolvedAnalysisObjective,
        targetAudience: targetAudienceValue,
        report: result,
      };
      // Persist to Supabase
      try {
        const { device, location, ip_address } = await getUserTelemetry();
        console.log('[DesignExcavator] Collected telemetry for generated report save.', {
          device,
          location,
          ip_address,
        });
        const { data, error } = await supabase.from(resolvedBrandExcavatorTable).insert([
          {
            id: nextSaved.id,
            brands: normalizedBrands,
            analysis_objective: resolvedAnalysisObjective,
            target_audience: targetAudienceValue,
            report: result,
            created_at: nextSaved.date,
            device,
            location,
            ip_address,
          },
        ]).select();
        if (!error && data) {
          nextSaved.device = device;
          nextSaved.location = location;
          nextSaved.ip_address = ip_address;
          setSavedSearches((prev) => [nextSaved, ...prev.filter((item) => item.id !== nextSaved.id)].slice(0, 20));
        } else if (error) {
          throw error;
        }
      } catch (saveErr) {
        // Do not block UI if Supabase fails
        logger.warn('Failed to save visual design report to Supabase', saveErr);
        setSaveWarning('Analysis generated, but this report could not be saved right now.');
      }
    } catch (err: unknown) {
      const normalized = normalizeAppError(err);
      logger.error('Failed to generate design excavator report', { err, normalized });
      setError(normalized.message || 'Failed to generate design excavator report.');
    } finally {
      setFakeProgress(100);
      await new Promise((resolve) => setTimeout(resolve, 220));
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    setShowValidation(true);

    const normalizedBrands = brands
      .map((brand) => ({
        name: (brand.name || '').trim(),
        website: (brand.website || '').trim(),
      }))
      .filter((brand) => brand.name.length > 0)
      .slice(0, 6);

    if (normalizedBrands.length === 0) {
      setError('Please add at least one brand.');
      return;
    }

    const resolvedAnalysisObjective =
      (analysisObjective || '').trim() || 'Compare visual identity systems across selected brands.';

    await runDesignGeneration({
      actionName: 'generate-design-report',
      normalizedBrands,
      resolvedAnalysisObjective,
      targetAudienceValue: targetAudience,
      targetAudienceDetailValue: targetAudienceDetail,
    });
  };

  const handleRefreshDesignComponent = async (brandName: string, sectionName: string) => {
    if (!report) return;
    const normalizedBrands = getNormalizedBrands();
    if (normalizedBrands.length === 0) return;
    const baseObjective = (analysisObjective || '').trim() || report.analysisObjective || 'Compare visual identity systems across selected brands.';
    const resolvedAnalysisObjective = `${baseObjective} | Refresh focus: ${brandName} ${sectionName}`;
    const rerunTargetAudience = (targetAudience || '').trim();
    console.log('[DesignExcavator] Running component refresh search for incomplete results.', {
      brandName,
      sectionName,
      normalizedBrands,
      resolvedAnalysisObjective,
      rerunTargetAudience,
    });
    setToast(`Refreshing ${sectionName} for ${brandName}...`);
    await runDesignGeneration({
      actionName: `refresh-design-component-${sectionName.toLowerCase().replace(/\s+/g, '-')}`,
      normalizedBrands,
      resolvedAnalysisObjective,
      targetAudienceValue: rerunTargetAudience,
      targetAudienceDetailValue: targetAudienceDetail,
    });
  };

  const getNormalizedBrands = () =>
    brands
      .map((brand) => ({
        name: (brand.name || '').trim(),
        website: (brand.website || '').trim(),
      }))
      .filter((brand) => brand.name.length > 0)
      .slice(0, 6);

  const handleAskQuestion = async () => {
    if (!report || !(reportQuestion || '').trim()) return;

    const normalizedBrands = getNormalizedBrands();
    if (normalizedBrands.length === 0) return;
    const resolvedAnalysisObjective =
      (analysisObjective || '').trim() || 'Compare visual identity systems across selected brands.';

    setIsSubmittingPrompt(true);
    setError(null);
    setReportAnswer('');

    try {
      const result = await runUserAction({
        actionName: 'ask-design-question',
        action: () =>
          submitVisualDesignPrompt({
            brands: normalizedBrands,
            analysisObjective: resolvedAnalysisObjective,
            targetAudience: buildDetailedAudiencePrompt(targetAudience, targetAudienceDetail),
            currentReport: report,
            prompt: reportQuestion,
          }),
      });

      if (result.mode === 'rescan') {
        setReport(result.report);
        setResultTab('profiles');
        const rescanRecentId = `rescan:${normalizedBrands.map((brand) => brand.name.toLowerCase()).join('|')}|${targetAudience.toLowerCase()}`;
        const rescanRecentItem: DesignExcavatorRecentResult = {
          id: rescanRecentId,
          title: normalizedBrands.map((brand) => brand.name).join(' vs ') || 'Updated Visual Analysis',
          description: (targetAudience || 'No audience provided').trim(),
          report: result.report,
          brands: normalizedBrands,
          analysisObjective,
          targetAudience,
        };
        console.log('[DesignExcavator] Tracking rescanned result in recent results library.', {
          id: rescanRecentId,
          title: rescanRecentItem.title,
        });
        saveRecentResult(APP_RECENT_RESULTS_MODES.DESIGN_EXCAVATOR, rescanRecentItem);
        setRecentResultsRefreshNonce((prev) => prev + 1);

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
          const { device, location, ip_address } = await getUserTelemetry();
          console.log('[DesignExcavator] Collected telemetry for prompt rescan save.', {
            device,
            location,
            ip_address,
          });
          const { data, error } = await supabase.from(resolvedBrandExcavatorTable).insert([
            {
              id: nextSaved.id,
              brands: normalizedBrands,
              analysis_objective: analysisObjective,
              target_audience: targetAudience,
              report: result.report,
              created_at: nextSaved.date,
              device,
              location,
              ip_address,
            },
          ]).select();
          if (!error && data) {
            nextSaved.device = device;
            nextSaved.location = location;
            nextSaved.ip_address = ip_address;
            setSavedSearches((prev) => [nextSaved, ...prev.filter((item) => item.id !== nextSaved.id)].slice(0, 20));
          } else if (error) {
            throw error;
          }
        } catch (saveErr) {
          // Do not block UI if Supabase fails
          logger.warn('Failed to save visual prompt rescan to Supabase', saveErr);
          setSaveWarning('Updated analysis is visible, but saving this run failed.');
        }
      }

      setReportAnswer(result.answer);
    } catch (err: unknown) {
      const normalized = normalizeAppError(err);
      logger.error('Failed to process design excavator prompt', { err, normalized });
      setReportAnswer(normalized.kind === 'quota'
        ? 'Quota limit reached. Please check billing and try again.'
        : "Sorry, I couldn't answer that question right now.");
      setError(normalized.message || 'Failed to process prompt.');
    } finally {
      setIsSubmittingPrompt(false);
    }
  };

  const canAddBrand = brands.length < 6;
  const brandCount = brands.filter((brand) => (brand.name || '').trim()).length;
  const reportBrandCount = report?.brandProfiles?.filter((profile) => (profile.brandName || '').trim().length > 0).length || 0;
  const showCompareTab = reportBrandCount > 1;
  const designResultNavItems = useMemo(() => {
    if (!report) {
      return [];
    }

    const items: Array<{ id: string; label: string }> = [];

    if (resultTab === 'profiles') {
      items.push({ id: 'design-results-ask', label: 'Analysis Q&A' });
      report.brandProfiles.forEach((profile, index) => {
        const label = (profile.brandName || `Brand ${index + 1}`).trim();
        const brandPrefix = label;
        items.push({ id: `brand-${index}`, label });
        items.push({ id: `design-results-brand-${index}-logos-visuals`, label: `${brandPrefix}: Logos & Visuals` });
        items.push({ id: `design-results-brand-${index}-logo-system`, label: `${brandPrefix}: Logo System` });
        items.push({ id: `design-results-brand-${index}-color-palette`, label: `${brandPrefix}: Color Palette` });
        items.push({ id: `design-results-brand-${index}-typography`, label: `${brandPrefix}: Typography` });
        items.push({
          id: `design-results-brand-${index}-supporting-visual-elements`,
          label: `${brandPrefix}: Supporting Visual Elements`,
        });
      });
    }

    if (resultTab === 'compare' && showCompareTab) {
      items.push({ id: 'design-results-compare', label: 'Compare Across Brands' });
    }

    if ((report.crossBrandReadout?.length || 0) > 0) {
      items.push({ id: 'design-results-opportunity', label: 'Opportunity Spaces' });
    }

    if (report.strategicRecommendations?.some((item) => !isDevilsAdvocateLine(item || ''))) {
      items.push({ id: 'design-results-strategic', label: 'Strategic Recommendations' });
    }

    if ((report.sources || []).length > 0) {
      items.push({ id: 'design-results-sources', label: 'Sources' });
    }

    return items;
  }, [report, resultTab, showCompareTab]);

  useEffect(() => {
    if (!showCompareTab && resultTab === 'compare') {
      setResultTab('profiles');
    }
  }, [showCompareTab, resultTab]);

  const addBrandRow = (options?: { focusNewBrandName?: boolean }) => {
    if (!canAddBrand) return;
    const nextId = `brand-${Date.now()}`;
    setBrands((prev) => {
      if (options?.focusNewBrandName) {
        pendingBrandNameFocusIndexRef.current = prev.length;
      }
      return [...prev, { id: nextId, name: '', website: '' }];
    });
  };

  useEffect(() => {
    const pendingIndex = pendingBrandNameFocusIndexRef.current;
    if (pendingIndex === null) return;
    const input = brandNameInputRefs.current[pendingIndex];
    if (!input) return;
    input.focus();
    pendingBrandNameFocusIndexRef.current = null;
  }, [brands.length]);

  const removeBrandRow = (id: string) => {
    if (brands.length <= 1) {
      clearExcavatorSearch({ singleRow: true });
      return;
    }

    setBrands((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((brand) => brand.id !== id);
    });
  };

  const updateBrandRow = (id: string, key: 'name' | 'website', value: string) => {
    const boundedValue =
      key === 'name'
        ? value.slice(0, MAX_EXCAVATOR_BRAND_NAME_LENGTH)
        : value.slice(0, MAX_EXCAVATOR_BRAND_WEBSITE_LENGTH);
    setBrands((prev) => prev.map((brand) => (brand.id === id ? { ...brand, [key]: boundedValue } : brand)));
  };

  const handleBrandNameEnter = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const nextInput = brandNameInputRefs.current[index + 1];
    if (nextInput) {
      nextInput.focus();
      return;
    }

    if (canAddBrand) {
      addBrandRow({ focusNewBrandName: true });
    }
  };

  const resolveColorSamplingImage = useCallback((profile: VisualDesignReport['brandProfiles'][number]) => {
    const visuals = bestVisualsByBrand[profile.brandName];
    const prioritizedCandidates = [
      ...(visuals?.images || [])
        .filter((card) => !isLogoLikeAsset(card.originalUrl || card.url, card.label))
        .map((card) => card.url),
      ...(visuals?.images || []).map((card) => card.url),
      heroImages[profile.brandName] || '',
      profile.sampleVisuals?.[0]?.url || '',
      profile.website ? buildWordpressScreenshotUrl(profile.website) : '',
      profile.website ? buildScreenshotPreviewUrl(profile.website) : '',
    ].filter((candidate): candidate is string => Boolean(candidate));

    if (prioritizedCandidates.length === 0) {
      return null;
    }

    const firstCandidate = prioritizedCandidates[0];
    return withImageProxy(firstCandidate);
  }, [bestVisualsByBrand, heroImages]);

  const handleOpenColorOverride = useCallback((
    profile: VisualDesignReport['brandProfiles'][number],
    brandIndex: number,
    colorGroup: PaletteColorGroup,
    colorIndex: number,
    color: BrandColorSpec
  ) => {
    const normalizedHex = normalizeHexColorValue(color.hex) || (color.hex.startsWith('#') ? color.hex : `#${color.hex}`);
    const screenshotUrl = resolveColorSamplingImage(profile);

    console.log('[DesignExcavator] Opening color override modal.', {
      brandName: profile.brandName,
      brandIndex,
      colorName: color.name,
      colorIndex,
      colorGroup,
      screenshotUrl,
    });

    setActiveColorOverride({
      brandIndex,
      brandName: profile.brandName,
      colorGroup,
      colorIndex,
      colorName: color.name,
      currentHex: normalizedHex,
      screenshotUrl,
      autoLaunchNonce: Date.now(),
    });
  }, [resolveColorSamplingImage]);

  const handleApplyPickedColor = useCallback((nextHex: string) => {
    const normalizedNextHex = normalizeHexColorValue(nextHex);
    if (!normalizedNextHex || !activeColorOverride) {
      return;
    }

    console.log('[DesignExcavator] Applying picked color override.', {
      brandName: activeColorOverride.brandName,
      brandIndex: activeColorOverride.brandIndex,
      colorGroup: activeColorOverride.colorGroup,
      colorIndex: activeColorOverride.colorIndex,
      nextHex: normalizedNextHex,
    });

    setReport((previousReport) => {
      if (!previousReport) return previousReport;

      return {
        ...previousReport,
        brandProfiles: previousReport.brandProfiles.map((profile, profileIndex) => {
          if (profileIndex !== activeColorOverride.brandIndex) {
            return profile;
          }

          const updatedColors = (profile.colorPalette[activeColorOverride.colorGroup] || []).map((color, colorIndex) => (
            colorIndex === activeColorOverride.colorIndex
              ? { ...color, hex: normalizedNextHex }
              : color
          ));

          return {
            ...profile,
            colorPalette: {
              ...profile.colorPalette,
              [activeColorOverride.colorGroup]: updatedColors,
            },
          };
        }),
      };
    });

    setActiveColorOverride((previous) => previous ? { ...previous, currentHex: normalizedNextHex } : previous);
  }, [activeColorOverride]);

  const handleLaunchEyedropper = useCallback(async () => {
    if (!activeColorOverride) return;
    setIsPickingColor(true);
    const selectedHex = await pickColor();
    setIsPickingColor(false);
    if (!selectedHex) {
      console.log('[DesignExcavator] No color selected from native eyedropper.');
      return;
    }
    handleApplyPickedColor(selectedHex);
    setActiveColorOverride(null);
  }, [activeColorOverride, handleApplyPickedColor, pickColor]);

  useEffect(() => {
    if (!activeColorOverride) return;
    if (!isNativeEyedropperSupported) return;
    void handleLaunchEyedropper();
  }, [
    activeColorOverride?.autoLaunchNonce,
    isNativeEyedropperSupported,
    handleLaunchEyedropper,
  ]);

  const renderColorSwatch = (
    color: BrandColorSpec,
    options: {
      brandIndex: number;
      colorGroup: PaletteColorGroup;
      colorIndex: number;
      profile: VisualDesignReport['brandProfiles'][number];
    }
  ) => {
    const normalizedHex = normalizeHexColorValue(color.hex) || (color.hex.startsWith('#') ? color.hex : `#${color.hex}`);
    const renderColorMetaRow = (label: string, value: string) => {
      const parsed = extractEvidenceTags(value || '');
      return (
        <p>
          <span>{label}: {parsed.cleanText || value}</span>
          {parsed.labels.map((evidenceLabel) => (
            <span
              key={`${label}-${color.name}-${evidenceLabel}`}
              className={`inline-block ml-2 px-1.5 py-0.5 text-[10px] tracking-wider font-semibold rounded align-middle ${evidenceLabelChipClass(evidenceLabel)}`}
            >
              {renderEvidenceLabel(evidenceLabel)}
            </span>
          ))}
        </p>
      );
    };

    return (
      <li key={`${options.profile.brandName}-${options.colorGroup}-${options.colorIndex}-${color.name}-${color.hex}`} className="rounded-xl border border-zinc-200 p-3 bg-white">
        <div className="flex items-center gap-3">
          <button
            type="button"
            data-testid={`color-swatch-trigger-${options.brandIndex}-${options.colorGroup}-${options.colorIndex}`}
            onClick={() => handleOpenColorOverride(
              options.profile,
              options.brandIndex,
              options.colorGroup,
              options.colorIndex,
              color
            )}
            className="group relative w-8 h-8 rounded-lg border border-zinc-200 cursor-pointer transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-indigo-400 overflow-hidden"
            style={{ backgroundColor: normalizedHex }}
            aria-label={`${color.name} swatch`}
            title={`Verify and replace ${color.name} with eyedropper`}
          >
            <span className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity" />
            <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Pipette className="w-3.5 h-3.5 text-white" aria-hidden="true" />
            </span>
          </button>
          <div>
            <p className="text-sm font-medium text-zinc-900">{color.name}</p>
            <p className="text-xs text-zinc-500">HEX {normalizedHex}</p>
          </div>
        </div>
        {(color.rgb || color.cmyk || color.pantone || color.usage) && (
          <div className="mt-2 text-xs text-zinc-500 space-y-1">
            {color.rgb && renderColorMetaRow('RGB', color.rgb)}
            {color.cmyk && renderColorMetaRow('CMYK', color.cmyk)}
            {color.pantone && renderColorMetaRow('Pantone', color.pantone)}
            {color.usage && renderColorMetaRow('Usage', color.usage)}
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
        {items.map((item, idx) => {
          const parsed = extractEvidenceTags(item || '');
          return (
            <li key={idx} className="text-sm text-zinc-700">
              • {parsed.cleanText || item}
              {parsed.labels.map((label) => (
                <span
                  key={`${idx}-${label}`}
                  className={`inline-block ml-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded align-middle ${evidenceLabelChipClass(label)}`}
                >
                  {label}
                </span>
              ))}
            </li>
          );
        })}
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
        <section className="bg-white rounded-3xl border border-zinc-200 p-6 space-y-4">
          <h3 className="text-lg font-semibold text-zinc-900">{titleMap[compareElement]}</h3>
          <div
            data-testid="design-excavator-compare-cards-layout"
            className="columns-1 lg:columns-2 gap-4"
          >
            {report.brandProfiles.map((profile, profileIndex) => {
              const colors =
                compareElement === 'primaryColors'
                  ? profile.colorPalette.primaryColors
                  : compareElement === 'accentColors'
                    ? profile.colorPalette.secondaryAccentColors
                    : profile.colorPalette.neutrals;

              return (
                <div key={`${profile.brandName}-${compareElement}`} className="inline-block w-full mb-4 break-inside-avoid rounded-2xl border border-zinc-200 p-4">
                  <p className="text-sm font-semibold text-zinc-900 mb-3">{profile.brandName}</p>
                  {colors.length > 0 ? (
                    <ul className="space-y-2">
                      {colors.map((color, colorIndex) => renderColorSwatch(color, {
                        brandIndex: profileIndex,
                        colorGroup:
                          compareElement === 'primaryColors'
                            ? 'primaryColors'
                            : compareElement === 'accentColors'
                              ? 'secondaryAccentColors'
                              : 'neutrals',
                        colorIndex,
                        profile,
                      }))}
                    </ul>
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
        <section className="bg-white rounded-3xl border border-zinc-200 p-6 space-y-4">
          <h3 className="text-lg font-semibold text-zinc-900">Typography Comparison</h3>
          <div
            data-testid="design-excavator-compare-cards-layout"
            className="columns-1 lg:columns-2 gap-4"
          >
            {report.brandProfiles.map((profile) => (
              <div key={`${profile.brandName}-typography`} className="inline-block w-full mb-4 break-inside-avoid rounded-2xl border border-zinc-200 p-4">
                <p className="text-sm font-semibold text-zinc-900 mb-2">{profile.brandName}</p>
                {profile.typography.fontFamilies.length > 0 ? (
                  <p className="text-sm text-zinc-700 mb-1">
                    <span className="font-medium">Families:</span>{' '}
                    {profile.typography.fontFamilies.map((family, familyIndex) => {
                      const parsedFamily = extractEvidenceTags(family || '');
                      return (
                        <span key={`${profile.brandName}-compare-family-${familyIndex}`} className="inline">
                          {familyIndex > 0 ? ', ' : ''}
                          {parsedFamily.cleanText || family}
                          {parsedFamily.labels.map((label) => (
                            <span
                              key={`${profile.brandName}-compare-family-${familyIndex}-${label}`}
                              className={`inline-block ml-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded align-middle ${evidenceLabelChipClass(label)}`}
                            >
                              {renderEvidenceLabel(label)}
                            </span>
                          ))}
                        </span>
                      );
                    })}
                  </p>
                ) : (
                  <p className="text-sm text-zinc-500 mb-1"><span className="font-medium">Families:</span> Not provided</p>
                )}
                {[
                  { label: 'H1', value: profile.typography.hierarchy.h1 },
                  { label: 'H2', value: profile.typography.hierarchy.h2 },
                  { label: 'Body', value: profile.typography.hierarchy.body },
                ].map(({ label, value }) => {
                  const parsedValue = extractEvidenceTags(value || '');
                  return (
                    <p key={`${profile.brandName}-compare-${label}`} className="text-sm text-zinc-700">
                      <span className="font-medium">{label}:</span> {parsedValue.cleanText || value || 'Not provided'}
                      {parsedValue.labels.map((chipLabel) => (
                        <span
                          key={`${profile.brandName}-compare-${label}-${chipLabel}`}
                          className={`inline-block ml-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded align-middle ${evidenceLabelChipClass(chipLabel)}`}
                        >
                          {renderEvidenceLabel(chipLabel)}
                        </span>
                      ))}
                    </p>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      );
    }

    return (
      <section className="bg-white rounded-3xl border border-zinc-200 p-6 space-y-4">
        <h3 className="text-lg font-semibold text-zinc-900">Imagery Style Comparison</h3>
        <div
          data-testid="design-excavator-compare-cards-layout"
          className="columns-1 lg:columns-2 gap-4"
        >
          {report.brandProfiles.map((profile) => (
            <div key={`${profile.brandName}-imagery`} className="inline-block w-full mb-4 break-inside-avoid rounded-2xl border border-zinc-200 p-4">
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

  const handleBrandNavJump = useCallback((event: React.MouseEvent<HTMLAnchorElement>, index: number) => {
    event.preventDefault();
    const targetId = `brand-${index}`;
    const target = document.getElementById(targetId);

    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (window.location.hash !== `#${targetId}`) {
        window.history.replaceState(null, '', `#${targetId}`);
      }
      return;
    }

    window.location.hash = `#${targetId}`;
  }, []);

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
      const hasName = (brand.name || '').trim().length >= 2;
      const hasWebsite = (brand.website || '').trim().length > 0;

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

              if ((current.website || '').trim()) {
                return current;
              }

              if (((current.name || '').trim().toLowerCase()) !== ((brand.name || '').trim().toLowerCase())) {
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
    const prefill = readDesignExcavatorPrefill();
    if (!prefill) return;

    const prefillBrands = (prefill.brands || [])
      .map((brand) => ({
        name: (brand.name || '').trim(),
        website: (brand.website || '').trim(),
      }))
      .filter((brand) => brand.name.length > 0)
      .slice(0, 6);

    if (prefillBrands.length > 0) {
      setBrands(
        prefillBrands.map((brand, idx) => ({
          id: `brand-prefill-${Date.now()}-${idx}`,
          name: brand.name,
          website: brand.website,
        }))
      );
    }

    if ((prefill.analysisObjective || '').trim()) {
      setAnalysisObjective((prefill.analysisObjective || '').trim().slice(0, MAX_EXCAVATOR_OBJECTIVE_LENGTH));
    }

    if ((prefill.targetAudience || '').trim()) {
      setTargetAudience((prefill.targetAudience || '').trim().slice(0, MAX_EXCAVATOR_AUDIENCE_LENGTH));
      setTargetAudienceDetail('');
      setIsTargetAudienceDetailOpen(false);
    }

    clearDesignExcavatorPrefill();
  }, []);

  useEffect(() => {
    if (!report) {
      setBestVisualsByBrand({});
      setVisualFailuresByCard({});
      return;
    }

    setVisualFailuresByCard({});

    const resolvedMap: Record<string, BrandVisualSelection> = {};

    report.brandProfiles.forEach((profile) => {
      const reportLogoImageUrl = normalizeHttpUrl(profile.logoImageUrl || '');

      const prioritizedLogoCandidates = [
        reportLogoImageUrl,
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

      const contextualSiteTargets = buildContextualSiteTargets(profile.website);

      const reportSampleVisualCards = dedupeVisualCards(
        (profile.sampleVisuals || [])
          .flatMap((visual, idx) => {
            const normalized = normalizeHttpUrl(visual?.url || '');
            if (!normalized || isKnownBrokenVisualAssetUrl(normalized)) {
              return [];
            }

            return [{
              label: (visual?.title || '').trim() || `Sample Visual ${idx + 1}`,
              url: withImageProxy(normalized),
              originalUrl: normalized,
              status: 'ok' as const,
            }];
          })
      ).slice(0, 4);

      const apiHeroVisualCards = dedupeVisualCards(
        [heroImages[profile.brandName]]
          .map((url) => normalizeHttpUrl(url || ''))
          .filter((url): url is string => typeof url === 'string' && url.length > 0)
          .filter((url) => !isKnownBrokenVisualAssetUrl(url))
          .map((url) => ({
            label: 'Website Hero',
            url: withImageProxy(url),
            originalUrl: url,
            status: 'ok' as const,
          }))
      ).slice(0, 1);

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

      const screenshotProviderCards = dedupeVisualCards(
        screenshotTargets
          .filter((target) => !isKnownBrokenVisualAssetUrl(target.url))
          .flatMap((target) => {
            const wordpressUrl = buildWordpressScreenshotUrl(target.url);
            const thumioUrl = buildScreenshotPreviewUrl(target.url);
            return [
              {
                label: target.label,
                url: withImageProxy(wordpressUrl),
                originalUrl: wordpressUrl,
                status: 'ok' as const,
              },
              {
                label: `${target.label} (Thum.io)`,
                url: withImageProxy(thumioUrl),
                originalUrl: thumioUrl,
                status: 'ok' as const,
              },
            ];
          })
      ).slice(0, 8);

      const directVisualCards = dedupeVisualCards(
        buildLargeVisualCandidateUrls(profile.website)
          .filter((url) => !isKnownBrokenVisualAssetUrl(url))
          .map((url, idx) => ({
            label: idx === 0 ? 'Website Visual' : `Website Visual ${idx + 1}`,
            url: withImageProxy(url),
            originalUrl: url,
            status: 'fallback' as const,
          }))
      ).slice(0, 4);

      const screenshotCards = prioritizeLogoAndVisualCards(
        [
          ...reportSampleVisualCards,
          ...apiHeroVisualCards,
          ...screenshotProviderCards,
          ...directVisualCards,
        ]
      , 8);

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
        deterministicLogoUrl: prioritizedLogoCandidates[0] || undefined,
      };
    });

    setBestVisualsByBrand(resolvedMap);
  }, [heroImages, logoImages, report]);

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
      // Keep a visible placeholder instead of removing cards; blank tiles are harder to debug for users.
      const shouldHide = false;

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

  const collectProfileExportImages = async (profile: VisualDesignReport['brandProfiles'][number]) => {
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

  const getExportErrorDetail = (error: unknown): string | null => {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message.trim();
    }
    if (typeof error === 'string' && error.trim().length > 0) {
      return error.trim();
    }
    return null;
  };

  const buildDesignExportDocument = (): BrandAtlasExportDocument | null => {
    if (!report) return null;

    const toLines = (values: Array<string | null | undefined>, max = 8): string[] => {
      return values
        .map((value) => cleanEvidenceText(value || ''))
        .filter(Boolean)
        .slice(0, max);
    };

    const sections: BrandAtlasExportDocument['sections'] = report.brandProfiles
      .map((profile, profileIndex) => {
        const cards: BrandAtlasExportDocument['sections'][number]['cards'] = [
          {
            title: 'Logos & Visuals',
            lines: toLines([
              profile.logo.mainLogo ? `Main Logo: ${profile.logo.mainLogo}` : '',
              profile.logo.wordmarkLogotype ? `Wordmark: ${profile.logo.wordmarkLogotype}` : '',
              ...(profile.sampleVisuals || []).map((visual) => `Visual: ${visual.title || visual.url}`),
            ], 8),
          },
          {
            title: 'Logo System',
            lines: toLines([
              ...(profile.logo.logoVariations || []).map((variation) => `Variation: ${variation}`),
              ...(profile.logo.symbolsIcons || []).map((symbol) => `Symbol/Icon: ${symbol}`),
            ], 8),
          },
          {
            title: 'Color Palette',
            lines: [
              ...(profile.colorPalette.primaryColors || []).map((color) => cleanEvidenceText(`Primary: ${color.name || 'Color'} (${color.hex || 'N/A'})`)),
              ...(profile.colorPalette.secondaryAccentColors || []).map((color) => cleanEvidenceText(`Accent: ${color.name || 'Color'} (${color.hex || 'N/A'})`)),
              ...(profile.colorPalette.neutrals || []).map((color) => cleanEvidenceText(`Neutral: ${color.name || 'Color'} (${color.hex || 'N/A'})`)),
            ].filter(Boolean).slice(0, 8),
          },
          {
            title: 'Typography',
            lines: toLines([
              ...(profile.typography.fontFamilies || []).map((family) => `Font Family: ${family}`),
              profile.typography.hierarchy.h1 ? `H1: ${profile.typography.hierarchy.h1}` : '',
              profile.typography.hierarchy.h2 ? `H2: ${profile.typography.hierarchy.h2}` : '',
              profile.typography.hierarchy.body ? `Body: ${profile.typography.hierarchy.body}` : '',
              ...(profile.typography.usageRules || []).map((rule) => `Rule: ${rule}`),
            ], 8),
          },
          {
            title: 'Supporting Visual Elements',
            lines: toLines([
              ...(profile.supportingVisualElements.imageryStyle || []).map((value) => `Imagery: ${value}`),
              ...(profile.supportingVisualElements.icons || []).map((value) => `Icons: ${value}`),
              ...(profile.supportingVisualElements.patternsTextures || []).map((value) => `Pattern/Texture: ${value}`),
              ...(profile.supportingVisualElements.shapes || []).map((value) => `Shapes: ${value}`),
              ...(profile.supportingVisualElements.dataVisualization || []).map((value) => `Data Visualization: ${value}`),
            ], 8),
          },
          {
            title: 'Assessments',
            lines: toLines([
              profile.consistencyAssessment ? `Consistency: ${profile.consistencyAssessment}` : '',
              profile.distinctivenessAssessment ? `Distinctiveness: ${profile.distinctivenessAssessment}` : '',
            ], 4),
          },
        ].filter((card) => card.lines.length > 0);

        if ((profile.sources || []).length > 0) {
          cards.push({
            title: 'Sources',
            lines: (profile.sources || [])
              .slice(0, 6)
              .map((source) => cleanEvidenceText(`${source.title}: ${source.url}`))
              .filter(Boolean),
          });
        }

        return {
          title: cleanEvidenceText(profile.brandName) || `Brand ${profileIndex + 1}`,
          cards,
        };
      })
      .filter((section) => section.cards.length > 0);

    if ((report.crossBrandReadout || []).length > 0 || (report.strategicRecommendations || []).length > 0) {
      sections.push({
        title: 'Cross-Brand Readout',
        cards: [
          {
            title: 'Opportunity Spaces',
            lines: toLines(report.crossBrandReadout || [], 10),
          },
          {
            title: 'Strategic Recommendations',
            lines: toLines(report.strategicRecommendations || [], 10),
          },
        ].filter((card) => card.lines.length > 0),
      });
    }

    if ((report.sources || []).length > 0) {
      sections.push({
        title: 'Global Sources',
        cards: (report.sources || []).slice(0, 24).map((source) => ({
          title: cleanEvidenceText(source.title || 'Source'),
          lines: toLines([source.url], 1),
        })),
      });
    }

    const normalizedBrands = brands
      .map((brand) => cleanEvidenceText(brand.name))
      .filter(Boolean);

    return {
      reportTitle: 'Design Excavator',
      reportSubtitle: 'Brand Atlas Visual Identity Audit',
      audience: cleanEvidenceText(targetAudience) || 'N/A',
      contextLines: toLines([
        normalizedBrands.length > 0 ? `Brands: ${normalizedBrands.join(' vs ')}` : '',
        cleanEvidenceText(analysisObjective || report.analysisObjective)
          ? `Objective: ${cleanEvidenceText(analysisObjective || report.analysisObjective)}`
          : '',
      ], 3),
      sections,
    };
  };

  const exportToPPTX = async () => {
    if (!report) return;
    const exportDocument = buildDesignExportDocument();
    if (!exportDocument) {
      setExportError({ type: 'pptx', message: 'No design analysis results are available to export yet.' });
      setToast('No design analysis results are available to export yet.');
      return;
    }
    setExportError(null);
    setIsExporting(true);
    setToast('Generating visual PowerPoint...');
    try {
      await exportBrandAtlasDocumentToPptx(
        exportDocument,
        `Design_Excavator_${new Date().toISOString().split('T')[0]}.pptx`
      );
      setToast('PowerPoint exported successfully!');
    } catch (err) {
      const normalized = normalizeAppError(err);
      const detail = getExportErrorDetail(err);
      logger.error('Failed to generate visual design PPTX', { err, normalized });
      setExportError({
        type: 'pptx',
        message: detail ? `Failed to generate PowerPoint: ${detail}` : (normalized.message || 'Failed to generate PowerPoint.'),
      });
      setToast('Failed to generate PowerPoint.');
    } finally {
      setIsExporting(false);
    }
  };

  const exportToPDF = async () => {
    if (!report) return;
    const exportDocument = buildDesignExportDocument();
    if (!exportDocument) {
      setExportError({ type: 'pdf', message: 'No design analysis results are available to export yet.' });
      setToast('No design analysis results are available to export yet.');
      return;
    }
    setExportError(null);
    setIsExporting(true);
    setToast('Generating visual PDF...');
    try {
      await exportBrandAtlasDocumentToPdf(
        exportDocument,
        `Design_Excavator_${new Date().toISOString().split('T')[0]}.pdf`
      );
      setToast('PDF exported successfully!');
    } catch (err) {
      const normalized = normalizeAppError(err);
      const detail = getExportErrorDetail(err);
      logger.error('Failed to generate visual design PDF', { err, normalized });
      setExportError({
        type: 'pdf',
        message: detail ? `Failed to generate PDF: ${detail}` : (normalized.message || 'Failed to generate PDF.'),
      });
      setToast('Failed to generate PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <div className="w-full">
        <div
          data-testid="mobile-top-bar"
          className={`fixed top-0 left-0 right-0 z-[60] no-print border-b border-zinc-200/80 bg-white/92 backdrop-blur-sm transition-transform duration-200 sm:hidden ${isMobileTopBarVisible ? 'translate-y-0' : '-translate-y-full'}`}
        >
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
            <button
              type="button"
              data-testid="mobile-nav-trigger"
              aria-expanded={isMobileNavOpen}
              aria-label="Open navigation menu"
              onClick={() => setIsMobileNavOpen((prev) => !prev)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white/90 text-zinc-700 shadow-sm backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-zinc-500/50"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div data-testid="mobile-page-heading" className="ml-auto inline-flex min-w-0 items-center justify-end gap-2">
              <p data-testid="mobile-page-title" className="truncate text-right text-sm font-semibold text-zinc-900">Design Excavator</p>
              <div data-testid="mobile-page-icon" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-indigo-600">
                <Palette className="h-4 w-4" />
              </div>
            </div>
          </div>
        </div>
        <AnimatePresence>
          {isMobileNavOpen && (
            <motion.div
              data-testid="mobile-nav-menu"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="fixed top-16 left-4 right-4 z-[55] rounded-2xl border border-zinc-200 bg-white/95 p-2 shadow-lg backdrop-blur-sm no-print sm:hidden"
            >
              <a
                href="/?home=1"
                onClick={(event) => handlePrimaryLinkNavigation(event, () => {
                  setIsMobileNavOpen(false);
                  onBack();
                })}
                className="inline-flex h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Home
              </a>
              <a
                href="/#cultural-archaeologist"
                onClick={(event) => handlePrimaryLinkNavigation(event, () => {
                  setIsMobileNavOpen(false);
                  navigateToHashRoute('cultural-archaeologist');
                })}
                className="inline-flex h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                <Search className="w-4 h-4" />
                Cultural Archaeologist
              </a>
              <a
                href="/#brand-navigator"
                onClick={(event) => handlePrimaryLinkNavigation(event, () => {
                  setIsMobileNavOpen(false);
                  navigateToHashRoute('brand-navigator');
                })}
                className="inline-flex h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                <CompassRoseIcon className="w-4 h-4" />
                Brand Navigator
              </a>
              <a
                href="/#design-excavator"
                onClick={(event) => handlePrimaryLinkNavigation(event, () => {
                  setIsMobileNavOpen(false);
                  clearExcavatorSearch();
                })}
                className="inline-flex h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                <Palette className="w-4 h-4" />
                Design Excavator
                <span className="ml-1 inline-block rounded-full border border-indigo-200 bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
                  Beta
                </span>
              </a>
            </motion.div>
          )}
        </AnimatePresence>
        {!report && (
          <div className="mt-[2px] mb-[2px] px-2 sm:hidden">
            <MobileTwoLineSubcopy>
              Compare visual identity systems across brands.
            </MobileTwoLineSubcopy>
          </div>
        )}
        <div className="absolute top-6 left-6 z-50 no-print hidden sm:block">
          <a
            href="/?home=1"
            onClick={(event) => handlePrimaryLinkNavigation(event, onBack)}
            className="inline-flex h-10 items-center gap-2 text-sm font-medium leading-none text-zinc-500 hover:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400/40 focus:ring-offset-2 rounded-md"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </a>
        </div>
        {/* Top Navigation / Actions */}
        <div
          data-testid="top-action-buttons"
          className="absolute top-6 left-auto right-6 z-50 no-print hidden sm:flex sm:w-auto sm:flex-row sm:items-center sm:justify-end sm:gap-2"
        >
          <a
            href="/#cultural-archaeologist"
            onClick={(event) => handlePrimaryLinkNavigation(event, () => navigateToHashRoute('cultural-archaeologist'))}
            className="inline-flex h-10 w-full items-center justify-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm border border-zinc-200 text-zinc-700 rounded-full font-medium leading-none hover:bg-zinc-50 hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-500/50 focus:ring-offset-1 transition-all shadow-sm text-sm sm:w-auto"
          >
            <Search className="w-4 h-4" /> Cultural Archaeologist
          </a>
          <a
            href="/#brand-navigator"
            onClick={(event) => handlePrimaryLinkNavigation(event, () => navigateToHashRoute('brand-navigator'))}
            className="inline-flex h-10 w-full items-center justify-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm border border-zinc-200 text-zinc-700 rounded-full font-medium leading-none hover:bg-zinc-50 hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-500/50 focus:ring-offset-1 transition-all shadow-sm text-sm sm:w-auto"
          >
            <CompassRoseIcon className="w-4 h-4" /> Brand Navigator
          </a>
          <a
            href="/#design-excavator"
            onClick={(event) => handlePrimaryLinkNavigation(event, clearExcavatorSearch)}
            className="inline-flex h-10 w-full items-center justify-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm border border-zinc-200 text-zinc-700 rounded-full font-medium leading-none hover:bg-zinc-50 hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-500/50 focus:ring-offset-1 transition-all shadow-sm text-sm sm:w-auto"
          >
            <RefreshCw className="w-4 h-4" /> New Search
          </a>
        </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-zinc-900 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-3 text-sm no-print"
          >
            <Info className="w-4 h-4 text-indigo-400" />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {undoToast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed ${toast ? 'top-20' : 'top-6'} left-1/2 -translate-x-1/2 z-50 bg-zinc-900 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-4 text-sm no-print`}
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
        className="mb-12 hidden text-center flex-col items-center pt-14 sm:flex"
      >
        <div className="inline-flex items-center justify-center p-2 bg-white rounded-2xl shadow-sm border border-indigo-200/80 mb-8">
          <Palette className="w-5 h-5 text-indigo-600" />
        </div>
        <h1 className="text-4xl md:text-6xl font-medium tracking-tight text-zinc-900 mb-6 select-none">
          Design <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-fuchsia-500">Excavator</span>
          <span className="align-super ml-3 inline-block px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold tracking-wide border border-indigo-200">Beta</span>
        </h1>
        <p className="text-lg text-zinc-500 max-w-2xl mx-auto leading-relaxed select-none">
          Compare visual identity systems across brands.
        </p>
      </motion.div>

      <div className="w-full max-w-6xl mx-auto px-6 space-y-6 md:space-y-8">

      {isSearchControlsMinimized && report && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-4xl mx-auto mt-8 mb-2 bg-white border border-zinc-200 rounded-2xl px-4 py-3 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 no-print"
        >
          <div className="text-left">
            <p className="text-xs uppercase tracking-wider text-zinc-500 font-semibold">Design Excavator</p>
            <p className="text-sm text-zinc-700">
              {brands.filter((b) => (b.name || '').trim()).map((b) => (b.name || '').trim()).slice(0, 3).join(' vs ') || 'Brand comparison ready'}
              {(analysisObjective || '').trim() ? ` • Objective: ${(analysisObjective || '').trim()}` : ''}
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
        onSubmit={(e) => e.preventDefault()}
        noValidate
        className={`w-full max-w-4xl mx-auto mt-4 sm:mt-10 relative flex flex-col gap-4 pb-24 sm:pb-0 ${isSearchControlsMinimized ? 'hidden' : ''}`}
      >
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="m-0 text-sm font-semibold uppercase tracking-wider text-zinc-500">Brands To Analyze</h3>
            <span className="text-xs text-zinc-400">{brandCount}/6 brands </span>
          </div>

          <div className="space-y-4 sm:space-y-3">
            {brands.map((brand, idx) => (
              <div key={brand.id} className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_1fr_auto] gap-3 items-center">
                <div className="relative md:col-auto">
                  <Tag className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                  <input
                    type="text"
                    value={brand.name}
                    onChange={(e) => updateBrandRow(brand.id, 'name', e.target.value)}
                    onKeyDown={(e) => handleBrandNameEnter(idx, e)}
                    ref={(el) => {
                      brandNameInputRefs.current[idx] = el;
                    }}
                    placeholder={`Brand ${idx + 1} Name`}
                    data-testid={`design-excavator-brand-name-${idx + 1}`}
                    className="w-full bg-white pl-12 pr-4 py-3 rounded-2xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-left"
                    disabled={isLoading}
                  />
                </div>
                <div className="relative col-span-2 md:col-span-1">
                  <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                  <input
                    type="text"
                    value={brand.website}
                    onChange={(e) => updateBrandRow(brand.id, 'website', e.target.value)}
                    placeholder="Website URL (optional)"
                    className="w-full bg-white pl-12 pr-4 py-3 rounded-2xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-left"
                    disabled={isLoading}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (idx === 0) {
                      clearExcavatorSearch({ singleRow: true });
                      return;
                    }
                    removeBrandRow(brand.id);
                  }}
                  className="col-start-2 row-start-1 self-start md:col-start-auto md:row-start-auto md:self-auto px-3 py-3 rounded-2xl border border-zinc-200 bg-white text-zinc-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition-colors"
                  disabled={isLoading}
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
              onClick={() => addBrandRow()}
              disabled={!canAddBrand || isLoading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Add Brand
            </button>
          </div>
          {showValidation && brandCount === 0 && (
            <p className="text-sm text-red-500 mt-2">Add at least one brand name.</p>
          )}
        </div>

        <div className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_1fr_auto] gap-3 items-center">
          <div className="relative col-span-2 md:col-span-1">
            <Crosshair className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            <textarea
              value={analysisObjective}
              onChange={(e) => setAnalysisObjective(e.target.value.slice(0, MAX_EXCAVATOR_OBJECTIVE_LENGTH))}
              placeholder="Visual Identity Objective (Optional)"
              rows={1}
              className="w-full h-[50px] bg-white pl-12 pr-4 py-3 rounded-2xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none text-left"
              disabled={isLoading}
            />
          </div>

          <div className="relative col-span-2 md:col-span-1">
            <button
              type="button"
              data-testid="design-audience-detail-toggle"
              aria-label="Toggle detailed audience definition"
              aria-expanded={isTargetAudienceDetailOpen}
              onClick={() => {
                setIsTargetAudienceDetailOpen((wasOpen) => {
                  const nextOpen = !wasOpen;
                  console.log('[DesignExcavator] Audience detail input toggled.', { isOpen: nextOpen });
                  return nextOpen;
                });
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            >
              <ChevronDown className={`w-5 h-5 transition-transform ${isTargetAudienceDetailOpen ? 'rotate-180' : ''}`} />
            </button>
            <input
              type="text"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value.slice(0, MAX_EXCAVATOR_AUDIENCE_LENGTH))}
              placeholder="Target Audience (Optional)"
              className="w-full bg-white pl-4 pr-12 py-3 rounded-2xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-left"
              disabled={isLoading}
            />
            {isTargetAudienceDetailOpen && (
              <div data-testid="design-audience-detail-box" className="mt-2">
                <textarea
                  id="design-audience-detail-input"
                  data-testid="design-audience-detail-input"
                  value={targetAudienceDetail}
                  onChange={(event) => setTargetAudienceDetail(event.target.value)}
                  onKeyDown={(event) => {
                    handleTextareaBulletShortcuts(event, {
                      value: targetAudienceDetail,
                      onValueChange: setTargetAudienceDetail,
                      logPrefix: 'DesignExcavator',
                    });
                  }}
                  placeholder={`Add more audience details.\n- Demographics\n- Motivations\n- Behaviors`}
                  className="w-full min-h-[128px] rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-y"
                  disabled={isLoading}
                />
              </div>
            )}
          </div>
          <div
            className="hidden md:flex items-center justify-center px-3 py-3 rounded-2xl border border-transparent"
            aria-hidden="true"
          >
            <Trash2 className="w-4 h-4 opacity-0" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-center pt-2">
          <div className="md:col-span-3 mx-auto flex w-full max-w-[372px] items-stretch justify-center gap-2 sm:max-w-none sm:flex sm:justify-center">
            <button
              type="button"
              onClick={() => {
                void handleSubmit();
              }}
              disabled={isLoading}
              className="w-[304px] sm:w-[360px] px-4 py-4 bg-zinc-900 text-white rounded-2xl font-medium hover:bg-zinc-800 hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-zinc-900/50 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none transition-all inline-flex items-center justify-center gap-2 text-sm mt-2 select-none relative overflow-hidden"
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
                  averageDurationMs={4000}
                />
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate Visual Analysis
                </>
              )}
              {/* Progress bar is now rendered inside ProgressiveLoader for alignment with % */}
            </button>
            <button
              type="button"
              data-testid="new-search-below-generate"
              aria-label="New Search"
              title="New Search"
              onClick={() => clearExcavatorSearch()}
              className="mt-2 inline-flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500/50 focus:ring-offset-2 sm:hidden"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        {saveWarning && <p className="text-sm text-amber-700">{saveWarning}</p>}
        {exportError && (
          <div className="text-sm text-amber-700 flex items-center gap-2">
            <span>{exportError.message}</span>
            <button
              type="button"
              onClick={() => {
                if (exportError.type === 'pptx') {
                  void exportToPPTX();
                  return;
                }
                void exportToPDF();
              }}
              className="text-amber-800 font-medium hover:underline"
            >
              Retry Export
            </button>
          </div>
        )}
      </motion.form>

      <p className={`subheader-copy text-xs text-zinc-400 text-center mt-8 select-none ${isSearchControlsMinimized ? 'hidden' : ''}`}>
        AI models can make mistakes. Always double check your work. Remember to think critically.
        <br />
        Powered by OpenAI's GPT-5.6-Sol.
      </p>
      <RecentResultsLibrary<DesignExcavatorRecentResult>
        mode={APP_RECENT_RESULTS_MODES.DESIGN_EXCAVATOR}
        title="Recent Projects"
        refreshNonce={recentResultsRefreshNonce}
        onSelectItem={(item) => {
          console.log('[DesignExcavator] Recent result selected.', { id: item.id, title: item.title });
          if (item.savedSearch) {
            loadSavedSearch(item.savedSearch);
            return;
          }
          if (item.report && item.brands) {
            const loadedBrands = item.brands.slice(0, 6).map((brand, idx) => ({
              id: `brand-recent-${Date.now()}-${idx}`,
              name: (brand.name || '').trim(),
              website: (brand.website || '').trim(),
            }));
            setBrands(loadedBrands.length > 0 ? loadedBrands : [{ id: 'brand-1', name: '', website: '' }]);
            setAnalysisObjective(item.analysisObjective || '');
            setTargetAudience(item.targetAudience || '');
            setTargetAudienceDetail('');
            setIsTargetAudienceDetailOpen(false);
            setReport(item.report);
            setResultTab('profiles');
            setIsSearchControlsMinimized(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }}
        className={isSearchControlsMinimized ? 'hidden' : 'mt-8'}
      />

      </div>

      <AnimatePresence mode="wait">
        {report && (
          <SectionErrorBoundary title="Design Results">
            <motion.div
              ref={exportCaptureRef}
              key="visual-design-report"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full mt-8 space-y-6"
            >
            {/* ── Tab Bar ── */}
            <div className="flex gap-2 border-b border-zinc-200 pb-0">
              <button
                type="button"
                onClick={() => setResultTab('profiles')}
                className={`px-5 py-2.5 text-sm font-semibold rounded-t-xl border-b-2 transition-colors focus:outline-none ${
                  resultTab === 'profiles'
                    ? 'border-indigo-600 text-indigo-700 bg-indigo-50'
                    : 'border-transparent text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50'
                }`}
              >
                <span className="flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Brand Profiles</span>
              </button>
              {showCompareTab && (
                <button
                  type="button"
                  onClick={() => setResultTab('compare')}
                  className={`px-5 py-2.5 text-sm font-semibold rounded-t-xl border-b-2 transition-colors focus:outline-none ${
                    resultTab === 'compare'
                      ? 'border-indigo-600 text-indigo-700 bg-indigo-50'
                      : 'border-transparent text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50'
                  }`}
                >
                  <span className="flex items-center gap-2"><Palette className="w-4 h-4" /> Compare</span>
                </button>
              )}
              <div className="ml-auto flex items-center gap-2 pb-2">
                <button
                  type="button"
                  onClick={exportToPPTX}
                  disabled={isExporting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-zinc-200 rounded-full text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-50"
                >
                  <Presentation className="w-3.5 h-3.5" /> PPTX
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-500 border border-indigo-100">
                    Beta
                  </span>
                </button>
                <button
                  type="button"
                  onClick={exportToPDF}
                  disabled={isExporting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-zinc-200 rounded-full text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-50"
                >
                  <FileText className="w-3.5 h-3.5" /> PDF
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-500 border border-indigo-100">
                    Beta
                  </span>
                </button>
              </div>
            </div>
            {(saveWarning || exportError) && (
              <div className="mt-3 space-y-2">
                {saveWarning && <p className="text-sm text-amber-700">{saveWarning}</p>}
                {exportError && (
                  <div className="text-sm text-amber-700 flex items-center gap-2">
                    <span>{exportError.message}</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (exportError.type === 'pptx') {
                          void exportToPPTX();
                          return;
                        }
                        void exportToPDF();
                      }}
                      className="text-amber-800 font-medium hover:underline"
                    >
                      Retry Export
                    </button>
                  </div>
                )}
              </div>
            )}
            <MobileResultsNav
              testId="mobile-results-nav-design"
              items={designResultNavItems}
            />

            <ShowThinkingDropdown
              methodologyText={DESIGN_EXCAVATOR_SHOW_THINKING_TEXT}
              testIdPrefix="design-show-thinking"
            />

            {/* ── Profiles Tab ── */}
            {resultTab === 'profiles' && (
              <>
                {/* Ask About This Analysis section (moved above tabs) */}
                <section id="design-results-ask" className="mb-10 bg-indigo-50 rounded-3xl p-6 md:p-8 border border-indigo-100 shadow-sm no-print">
                  <h3 className="text-xl font-bold text-indigo-900 mb-4 flex items-center gap-2">
                    <Search className="w-6 h-6" /> Ask the Excavator
                  </h3>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={reportQuestion}
                      onChange={(e) => setReportQuestion(e.target.value.slice(0, MAX_EXCAVATOR_QUESTION_LENGTH))}
                      placeholder="e.g. Which brand has the most distinct color system?"
                      className="flex-1 px-5 py-4 rounded-2xl border border-indigo-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-zinc-900 shadow-sm text-sm"
                      onKeyDown={(e) => e.key === 'Enter' && handleAskQuestion()}
                      disabled={isSubmittingPrompt}
                    />
                    <button
                      type="button"
                      onClick={handleAskQuestion}
                      disabled={isSubmittingPrompt || !reportQuestion.trim()}
                      className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-medium hover:bg-indigo-700 hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:ring-offset-2 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none transition-all flex items-center justify-center gap-2 shadow-sm"
                    >
                      {isSubmittingPrompt ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Ask'}
                    </button>
                  </div>
                  {reportAnswer && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-6 p-6 bg-white rounded-2xl border border-indigo-100 text-zinc-700 shadow-sm leading-relaxed"
                    >
                      {reportAnswer}
                    </motion.div>
                  )}
                </section>
                {/* Brand Navigation Tab Bar */}
                {report.brandProfiles.length > 1 && (
                  <nav className="flex gap-2 mb-4 overflow-x-auto pb-2 border-b border-zinc-100">
                    {report.brandProfiles.map((profile, idx) => {
                      const visuals = bestVisualsByBrand[profile.brandName];
                      const navPrimaryLogoUrl = pickFirstNonEmptyUrl(
                        normalizeHttpUrl(profile.logoImageUrl || ''),
                        visuals?.deterministicLogoUrl,
                        logoImages[profile.brandName],
                        processedLogos[profile.brandName]?.base64Placeholder,
                      );
                      const navFallbackChain = buildFaviconPreferredBadgeChain(profile.website, navPrimaryLogoUrl);
                      const navBadgeUrl = navFallbackChain[0] || (navPrimaryLogoUrl ? withImageProxy(navPrimaryLogoUrl) : null);
                      const navRemainingFallbacks = navFallbackChain.slice(1);
                      const hasBadgeImage = Boolean(navBadgeUrl);

                      return (
                        <a
                          key={profile.brandName}
                          href={`#brand-${idx}`}
                          onClick={(event) => handleBrandNavJump(event, idx)}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-200 bg-white text-sm font-semibold text-zinc-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors whitespace-nowrap"
                          style={{ scrollMarginTop: '80px' }}
                        >
                          <span
                            className={`w-6 h-6 flex items-center justify-center rounded-lg text-zinc-400 font-bold text-xs relative shrink-0 ${hasBadgeImage ? 'bg-transparent border border-transparent' : 'bg-zinc-100 border border-zinc-100'}`}
                          >
                            <span>{profile.brandName[0]}</span>
                            {navBadgeUrl && (
                              <img
                                src={navBadgeUrl}
                                alt={`${profile.brandName} navigation logo`}
                                data-fallback-chain={navRemainingFallbacks.join('|')}
                                className="w-full h-full rounded-lg object-contain p-0.5 absolute inset-0 bg-transparent opacity-0 transition-opacity duration-200"
                                onLoad={revealImageOnLoad}
                                onError={advanceImageFallbackOrHide}
                              />
                            )}
                          </span>
                          {profile.brandName}
                        </a>
                      );
                    })}
                  </nav>
                )}
                {/* Brand Profiles Full Width */}
                <div className="flex flex-col gap-8">
                  {report.brandProfiles.map((profile, idx) => {
                    const visuals = bestVisualsByBrand[profile.brandName];
                    const logoUrl = pickFirstNonEmptyUrl(
                      normalizeHttpUrl(profile.logoImageUrl || ''),
                      visuals?.deterministicLogoUrl,
                      logoImages[profile.brandName],
                      processedLogos[profile.brandName]?.base64Placeholder,
                    );
                    const brandBadgeFallbackChain = buildSquareLogoPreferredBadgeChain(profile.website, logoUrl);
                    const brandBadgeUrl = brandBadgeFallbackChain[0] || (logoUrl ? withImageProxy(logoUrl) : null);
                    const brandBadgeRemainingFallbacks = brandBadgeFallbackChain.slice(1);
                    const hasBrandBadgeImage = Boolean(brandBadgeUrl);
                    const visibleVisualCards = (visuals?.images || []).filter((_, idx) => {
                      const failureState = visualFailuresByCard[`${profile.brandName}-visual-${idx}`];
                      return !failureState?.hidden;
                    });
                    const isLogosAndVisualsMissing = visibleVisualCards.length === 0;
                    const isLogoSystemMissing =
                      isMissingResultTextValue(profile.logo?.mainLogo)
                      && isMissingResultTextValue(profile.logo?.wordmarkLogotype)
                      && (profile.logo?.logoVariations?.length || 0) === 0
                      && (profile.logo?.symbolsIcons?.length || 0) === 0;
                    const isColorPaletteMissing =
                      (profile.colorPalette?.primaryColors?.length || 0) === 0
                      && (profile.colorPalette?.secondaryAccentColors?.length || 0) === 0
                      && (profile.colorPalette?.neutrals?.length || 0) === 0;
                    const isTypographyMissing =
                      (profile.typography?.fontFamilies?.length || 0) === 0
                      && isMissingResultTextValue(profile.typography?.hierarchy?.h1)
                      && isMissingResultTextValue(profile.typography?.hierarchy?.h2)
                      && isMissingResultTextValue(profile.typography?.hierarchy?.body)
                      && (profile.typography?.usageRules?.length || 0) === 0;
                    const isSupportingVisualElementsMissing =
                      (profile.supportingVisualElements?.imageryStyle?.length || 0) === 0
                      && (profile.supportingVisualElements?.icons?.length || 0) === 0
                      && (profile.supportingVisualElements?.patternsTextures?.length || 0) === 0
                      && (profile.supportingVisualElements?.shapes?.length || 0) === 0
                      && (profile.supportingVisualElements?.dataVisualization?.length || 0) === 0;

                    return (
                      <section
                        key={profile.brandName}
                        id={`brand-${idx}`}
                        className="bg-white rounded-3xl border border-zinc-200 p-6 space-y-6 shadow-sm w-full"
                      >
                        {/* ...existing code for each brand profile... */}

                        {/* Brand Header */}
                        <div className="flex items-start gap-4 mb-4">
                          <div
                            className={`w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden shrink-0 relative ${hasBrandBadgeImage ? 'border border-transparent bg-transparent' : 'border border-zinc-100 bg-zinc-50'}`}
                          >
                            {!brandBadgeUrl && (
                              <span className="text-zinc-400 font-semibold text-lg">{profile.brandName[0] || '?'}</span>
                            )}
                            {brandBadgeUrl && (
                              <img
                                src={brandBadgeUrl}
                                alt={`${profile.brandName} logo`}
                                data-fallback-chain={brandBadgeRemainingFallbacks.join('|')}
                                className="w-full h-full object-contain p-1 absolute inset-0 z-10 bg-transparent opacity-0 transition-opacity duration-200"
                                onLoad={(e) => {
                                  revealImageOnLoad(e);
                                  handleImageLoad();
                                }}
                                onError={(e) => { handleImageError(); advanceImageFallback(e); }}
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-xl font-bold text-zinc-900">{profile.brandName}</h3>
                            {profile.website && (
                              <a
                                href={toSafeExternalHref(profile.website)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-indigo-600 transition-colors mt-0.5"
                              >
                                <ExternalLink className="w-3 h-3" />
                                {profile.website}
                              </a>
                            )}
                          </div>
                        </div>

                        {/* Logos & Visuals Box */}
                        <div id={`design-results-brand-${idx}-logos-visuals`} className="bg-zinc-50 rounded-2xl border border-zinc-100 p-4 mb-4">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                              <ImageIcon className="w-3.5 h-3.5" /> Logos & Visuals
                            </p>
                            {isLogosAndVisualsMissing && (
                              <button
                                type="button"
                                data-testid={`design-section-refresh-${idx}-logos-visuals`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleRefreshDesignComponent(profile.brandName, 'Logos & Visuals');
                                }}
                                className="relative z-10 pointer-events-auto inline-flex items-center justify-center p-1.5 text-zinc-400 hover:text-zinc-600 cursor-pointer focus:outline-none"
                                title={`Refresh Logos & Visuals for ${profile.brandName}`}
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                              </button>
                            )}
                          </div>
                          {visibleVisualCards.length > 0 && (
                            <div className="flex gap-2 overflow-x-auto pb-1">
                              {visibleVisualCards.slice(0, 4).map((card, idx) => {
                                const cardKey = `${profile.brandName}-visual-${idx}`;
                                const fallbackChain = isLogoLikeAsset(card.originalUrl || card.url, card.label)
                                  ? buildImageFallbackChain(card.url, profile.website)
                                  : buildVisualPreviewFallbackChain(card.url, profile.website);
                                return (
                                  <div key={cardKey} className="shrink-0 w-40 h-24 rounded-xl border border-zinc-100 overflow-hidden bg-zinc-50">
                                    <img
                                      src={card.url}
                                      alt={card.label}
                                      data-original-src={card.url}
                                      data-fallback-chain={fallbackChain.join('|')}
                                      className="w-full h-full object-cover opacity-0 transition-opacity duration-200"
                                      onLoad={(e) => {
                                        revealImageOnLoad(e);
                                        handleImageLoad();
                                      }}
                                      onError={(e) => handleVisualImageError(e, cardKey)}
                                      onClick={() => clearVisualFailureState(cardKey)}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Distinctiveness Box */}
                        {profile.distinctivenessAssessment && (
                          <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100 mb-4">
                            <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-1.5">Distinctiveness Assessment</p>
                            {(() => {
                              const parsedDistinctiveness = extractEvidenceTags(profile.distinctivenessAssessment || '');
                              return (
                                <p className="text-sm text-indigo-900 leading-relaxed">
                                  {parsedDistinctiveness.cleanText || profile.distinctivenessAssessment}
                                  {parsedDistinctiveness.labels.map((label) => (
                                    <span
                                      key={`distinctiveness-${profile.brandName}-${label}`}
                                      className={`inline-block ml-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded align-middle ${evidenceLabelChipClass(label)}`}
                                    >
                                      {renderEvidenceLabel(label)}
                                    </span>
                                  ))}
                                </p>
                              );
                            })()}
                          </div>
                        )}

                        {/* Logo System Box */}
                        <div
                          id={`design-results-brand-${idx}-logo-system`}
                          className={`bg-zinc-50 rounded-2xl border border-zinc-100 p-4 mb-4 ${showCompareTab ? 'cursor-pointer' : 'cursor-default'}`}
                          onClick={showCompareTab ? (e) => openComparePopup(e, 'primaryColors') : undefined}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                              <ImageIcon className="w-3.5 h-3.5" /> Logo System
                            </p>
                            {isLogoSystemMissing && (
                              <button
                                type="button"
                                data-testid={`design-section-refresh-${idx}-logo-system`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleRefreshDesignComponent(profile.brandName, 'Logo System');
                                }}
                                className="relative z-10 pointer-events-auto inline-flex items-center justify-center p-1.5 text-zinc-400 hover:text-zinc-600 cursor-pointer focus:outline-none"
                                title={`Refresh Logo System for ${profile.brandName}`}
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                              </button>
                            )}
                          </div>
                          <div className="space-y-1">
                            {profile.logo.mainLogo && (() => {
                              const parsedMainLogo = extractEvidenceTags(profile.logo.mainLogo || '');
                              return (
                                <p className="text-sm text-zinc-700">
                                  <span className="font-medium text-zinc-900">Primary:</span> {parsedMainLogo.cleanText || profile.logo.mainLogo}
                                  {parsedMainLogo.labels.map((label) => (
                                    <span
                                      key={`main-logo-${profile.brandName}-${label}`}
                                      className={`inline-block ml-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded align-middle ${evidenceLabelChipClass(label)}`}
                                    >
                                      {renderEvidenceLabel(label)}
                                    </span>
                                  ))}
                                </p>
                              );
                            })()}
                            {profile.logo.wordmarkLogotype && (() => {
                              const parsedWordmark = extractEvidenceTags(profile.logo.wordmarkLogotype || '');
                              return (
                                <p className="text-sm text-zinc-700">
                                  <span className="font-medium text-zinc-900">Wordmark:</span> {parsedWordmark.cleanText || profile.logo.wordmarkLogotype}
                                  {parsedWordmark.labels.map((label) => (
                                    <span
                                      key={`wordmark-${profile.brandName}-${label}`}
                                      className={`inline-block ml-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded align-middle ${evidenceLabelChipClass(label)}`}
                                    >
                                      {renderEvidenceLabel(label)}
                                    </span>
                                  ))}
                                </p>
                              );
                            })()}
                            {profile.logo.logoVariations.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-zinc-500 mt-2 mb-1">Variations</p>
                                {renderListOrFallback(profile.logo.logoVariations, 'No variations documented.')}
                              </div>
                            )}
                            {profile.logo.symbolsIcons.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-zinc-500 mt-2 mb-1">Symbols & Icons</p>
                                {renderListOrFallback(profile.logo.symbolsIcons, 'No symbol data.')}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Color Palette Box */}
                        <div id={`design-results-brand-${idx}-color-palette`} className="bg-zinc-50 rounded-2xl border border-zinc-100 p-4 mb-4">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                              <Palette className="w-3.5 h-3.5" /> Color Palette
                            </p>
                            {isColorPaletteMissing && (
                              <button
                                type="button"
                                data-testid={`design-section-refresh-${idx}-color-palette`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleRefreshDesignComponent(profile.brandName, 'Color Palette');
                                }}
                                className="relative z-10 pointer-events-auto inline-flex items-center justify-center p-1.5 text-zinc-400 hover:text-zinc-600 cursor-pointer focus:outline-none"
                                title={`Refresh Color Palette for ${profile.brandName}`}
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                              </button>
                            )}
                          </div>
                          {profile.colorPalette.primaryColors.length > 0 ? (
                            <div
                              className={`${showCompareTab ? 'cursor-pointer hover:bg-zinc-50' : 'cursor-default'} rounded-xl p-2 -mx-2 transition-colors`}
                              onClick={showCompareTab ? (e) => openComparePopup(e, 'primaryColors') : undefined}
                            >
                              <p className="text-xs font-semibold text-zinc-600 mb-2">Primary</p>
                              <ul className="space-y-2">
                                {profile.colorPalette.primaryColors.map((c, colorIndex) => renderColorSwatch(c, {
                                  brandIndex: idx,
                                  colorGroup: 'primaryColors',
                                  colorIndex,
                                  profile,
                                }))}
                              </ul>
                            </div>
                          ) : (
                            <p className="text-sm text-zinc-500">No primary colors documented.</p>
                          )}
                          {profile.colorPalette.secondaryAccentColors.length > 0 ? (
                            <div
                              className={`${showCompareTab ? 'cursor-pointer hover:bg-zinc-50' : 'cursor-default'} rounded-xl p-2 -mx-2 transition-colors`}
                              onClick={showCompareTab ? (e) => openComparePopup(e, 'accentColors') : undefined}
                            >
                              <p className="text-xs font-semibold text-zinc-600 mb-2">Accent</p>
                              <ul className="space-y-2">
                                {profile.colorPalette.secondaryAccentColors.map((c, colorIndex) => renderColorSwatch(c, {
                                  brandIndex: idx,
                                  colorGroup: 'secondaryAccentColors',
                                  colorIndex,
                                  profile,
                                }))}
                              </ul>
                            </div>
                          ) : (
                            <p className="text-sm text-zinc-500 mt-2">No accent colors documented.</p>
                          )}
                          {profile.colorPalette.neutrals.length > 0 ? (
                            <div
                              className={`${showCompareTab ? 'cursor-pointer hover:bg-zinc-50' : 'cursor-default'} rounded-xl p-2 -mx-2 transition-colors`}
                              onClick={showCompareTab ? (e) => openComparePopup(e, 'neutrals') : undefined}
                            >
                              <p className="text-xs font-semibold text-zinc-600 mb-2">Neutrals</p>
                              <ul className="space-y-2">
                                {profile.colorPalette.neutrals.map((c, colorIndex) => renderColorSwatch(c, {
                                  brandIndex: idx,
                                  colorGroup: 'neutrals',
                                  colorIndex,
                                  profile,
                                }))}
                              </ul>
                            </div>
                          ) : (
                            <p className="text-sm text-zinc-500 mt-2">No neutral colors documented.</p>
                          )}
                        </div>

                        {/* Typography Box */}
                        <div
                          id={`design-results-brand-${idx}-typography`}
                          className={`bg-zinc-50 rounded-2xl border border-zinc-100 p-4 mb-4 ${showCompareTab ? 'cursor-pointer hover:bg-zinc-50' : 'cursor-default'}`}
                          onClick={showCompareTab ? (e) => openComparePopup(e, 'typography') : undefined}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                              <Type className="w-3.5 h-3.5" /> Typography
                            </p>
                            {isTypographyMissing && (
                              <button
                                type="button"
                                data-testid={`design-section-refresh-${idx}-typography`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleRefreshDesignComponent(profile.brandName, 'Typography');
                                }}
                                className="relative z-10 pointer-events-auto inline-flex items-center justify-center p-1.5 text-zinc-400 hover:text-zinc-600 cursor-pointer focus:outline-none"
                                title={`Refresh Typography for ${profile.brandName}`}
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                              </button>
                            )}
                          </div>
                          {profile.typography.fontFamilies.length > 0 ? (
                            <p className="text-sm text-zinc-700">
                              <span className="font-medium text-zinc-900">Families:</span>{' '}
                              {profile.typography.fontFamilies.map((family, familyIndex) => {
                                const parsedFamily = extractEvidenceTags(family || '');
                                return (
                                  <span key={`${profile.brandName}-family-${familyIndex}`} className="inline">
                                    {familyIndex > 0 ? ', ' : ''}
                                    {parsedFamily.cleanText || family}
                                    {parsedFamily.labels.map((label) => (
                                      <span
                                        key={`${profile.brandName}-family-${familyIndex}-${label}`}
                                        className={`inline-block ml-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded align-middle ${evidenceLabelChipClass(label)}`}
                                      >
                                        {renderEvidenceLabel(label)}
                                      </span>
                                    ))}
                                  </span>
                                );
                              })}
                            </p>
                          ) : (
                            <p className="text-sm text-zinc-500">No typography families documented.</p>
                          )}
                          <div className="grid grid-cols-3 gap-2 mt-2">
                            {[
                              { label: 'H1', value: profile.typography.hierarchy.h1 },
                              { label: 'H2', value: profile.typography.hierarchy.h2 },
                              { label: 'Body', value: profile.typography.hierarchy.body },
                            ].map(({ label, value }) => {
                              if (!value) return null;
                              const parsedValue = extractEvidenceTags(value);
                              return (
                                <div key={label} className="bg-white rounded-lg p-2 border border-zinc-100">
                                  <p className="text-[10px] font-bold text-zinc-400 uppercase mb-0.5">{label}</p>
                                  <p className="text-xs text-zinc-700 leading-tight">
                                    {parsedValue.cleanText || value}
                                    {parsedValue.labels.map((chipLabel) => (
                                      <span
                                        key={`${profile.brandName}-${label}-${chipLabel}`}
                                        className={`inline-block ml-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded align-middle ${evidenceLabelChipClass(chipLabel)}`}
                                      >
                                        {renderEvidenceLabel(chipLabel)}
                                      </span>
                                    ))}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                          {!profile.typography.hierarchy.h1 && !profile.typography.hierarchy.h2 && !profile.typography.hierarchy.body && (
                            <p className="text-sm text-zinc-500 mt-2">No typography hierarchy documented.</p>
                          )}
                          {profile.typography.usageRules.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-zinc-500 mt-2 mb-1">Usage Rules</p>
                              {renderListOrFallback(profile.typography.usageRules, '')}
                            </div>
                          )}
                          {profile.typography.usageRules.length === 0 && (
                            <p className="text-sm text-zinc-500 mt-2">No typography usage rules documented.</p>
                          )}
                          <div className="mt-3">
                            <p className="text-xs font-medium text-zinc-500 mb-1">Live Website Styles</p>
                            {(() => {
                              const liveTypography = liveTypographyByBrand[profile.brandName];
                              const samplesByTag: Array<{ tag: 'h1' | 'h2' | 'h3' | 'p'; label: string; samples: LiveTypographyStyleSample[] }> = [
                                { tag: 'h1', label: 'H1', samples: liveTypography?.h1 || [] },
                                { tag: 'h2', label: 'H2', samples: liveTypography?.h2 || [] },
                                { tag: 'h3', label: 'H3', samples: liveTypography?.h3 || [] },
                                { tag: 'p', label: 'Body', samples: liveTypography?.p || [] },
                              ];
                              const hasAnyLiveSamples = samplesByTag.some((entry) => entry.samples.length > 0);

                              if (!hasAnyLiveSamples) {
                                return (
                                  <p className="text-xs text-zinc-500" data-testid={`live-typography-empty-${idx}`}>
                                    No live website typography samples available.
                                  </p>
                                );
                              }

                              return (
                                <div className="space-y-1.5">
                                  {samplesByTag.map((entry) => (
                                    <div key={`${profile.brandName}-live-typography-${entry.tag}`} className="text-xs text-zinc-600">
                                      <span className="font-semibold text-zinc-700">{entry.label}:</span>{' '}
                                      {entry.samples.slice(0, 2).map((sample, sampleIndex) => (
                                        <span
                                          key={`${profile.brandName}-live-typography-${entry.tag}-${sampleIndex}`}
                                          className="inline-flex items-center gap-1 mr-2 mb-1 px-2 py-1 rounded-md bg-white border border-zinc-200"
                                        >
                                          <span className="truncate max-w-[160px]" title={sample.fontFamily}>{sample.fontFamily || 'N/A'}</span>
                                          <span className="text-zinc-400">•</span>
                                          <span>{sample.fontWeight || 'N/A'}</span>
                                          <span className="text-zinc-400">•</span>
                                          <span>{sample.fontSize || 'N/A'}/{sample.lineHeight || 'N/A'}</span>
                                          <span className="inline-block w-3 h-3 rounded border border-zinc-300" style={{ backgroundColor: sample.color || 'transparent' }} />
                                        </span>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Supporting Visual Elements Box */}
                        <div id={`design-results-brand-${idx}-supporting-visual-elements`} className="bg-zinc-50 rounded-2xl border border-zinc-100 p-4 mb-4">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Supporting Visual Elements</p>
                            {isSupportingVisualElementsMissing && (
                              <button
                                type="button"
                                data-testid={`design-section-refresh-${idx}-supporting-visual-elements`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleRefreshDesignComponent(profile.brandName, 'Supporting Visual Elements');
                                }}
                                className="relative z-10 pointer-events-auto inline-flex items-center justify-center p-1.5 text-zinc-400 hover:text-zinc-600 cursor-pointer focus:outline-none"
                                title={`Refresh Supporting Visual Elements for ${profile.brandName}`}
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                              </button>
                            )}
                          </div>
                          {profile.supportingVisualElements.imageryStyle.length > 0 && (
                            <div
                              className={`${showCompareTab ? 'cursor-pointer hover:bg-zinc-50' : 'cursor-default'} rounded-xl p-2 -mx-2 transition-colors`}
                              onClick={showCompareTab ? (e) => openComparePopup(e, 'imageryStyle') : undefined}
                            >
                              <p className="text-xs font-semibold text-zinc-600 mb-1">Imagery Style</p>
                              {renderListOrFallback(profile.supportingVisualElements.imageryStyle, '')}
                            </div>
                          )}
                          {profile.supportingVisualElements.icons.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-zinc-600 mb-1">Icons</p>
                              {renderListOrFallback(profile.supportingVisualElements.icons, '')}
                            </div>
                          )}
                          {profile.supportingVisualElements.icons.length === 0 && (
                            <p className="text-sm text-zinc-500 mb-1">No icon system details documented.</p>
                          )}
                          {profile.supportingVisualElements.patternsTextures.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-zinc-600 mb-1">Patterns & Textures</p>
                              {renderListOrFallback(profile.supportingVisualElements.patternsTextures, '')}
                            </div>
                          )}
                          {profile.supportingVisualElements.patternsTextures.length === 0 && (
                            <p className="text-sm text-zinc-500 mb-1">No pattern or texture details documented.</p>
                          )}
                          {profile.supportingVisualElements.shapes.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-zinc-600 mb-1">Shapes</p>
                              {renderListOrFallback(profile.supportingVisualElements.shapes, '')}
                            </div>
                          )}
                          {profile.supportingVisualElements.shapes.length === 0 && (
                            <p className="text-sm text-zinc-500 mb-1">No shape language details documented.</p>
                          )}
                          {profile.supportingVisualElements.dataVisualization.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-zinc-600 mb-1">Data Visualization</p>
                              {renderListOrFallback(profile.supportingVisualElements.dataVisualization, '')}
                            </div>
                          )}
                          {profile.supportingVisualElements.dataVisualization.length === 0 && (
                            <p className="text-sm text-zinc-500">No data visualization style documented.</p>
                          )}
                        </div>

                        {/* Sources Box */}
                        {(profile.sampleVisuals || []).length > 0 && (
                          <div className="bg-zinc-50 rounded-2xl border border-zinc-100 p-4 mb-4">
                            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Sources</p>
                            <div className="flex flex-wrap gap-2">
                              {(profile.sampleVisuals || []).map((source, idx) => (
                                <a
                                  key={idx}
                                  href={toSafeExternalHref(source.url)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-xs bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-3 py-1.5 rounded-full transition-colors"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  <span className="truncate max-w-[160px]">{source.title}</span>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                      </section>
                    );
                  })}
                </div>
              </>
            )}

            {/* ── Compare Tab ── */}
            {resultTab === 'compare' && (
              <div id="design-results-compare" className="space-y-4">
                <div className="flex flex-wrap gap-2 mb-2">
                  {[
                    { key: 'primaryColors', label: 'Primary Colors', icon: <Palette className="w-3.5 h-3.5" /> },
                    { key: 'accentColors', label: 'Accent Colors', icon: <Palette className="w-3.5 h-3.5" /> },
                    { key: 'neutrals', label: 'Neutrals', icon: <Palette className="w-3.5 h-3.5" /> },
                    { key: 'typography', label: 'Typography', icon: <Type className="w-3.5 h-3.5" /> },
                    { key: 'imageryStyle', label: 'Imagery Style', icon: <ImageIcon className="w-3.5 h-3.5" /> },
                  ].map(({ key, label, icon }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setCompareElement(key as CompareElement)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                        compareElement === key
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300'
                      }`}
                    >
                      {icon} {label}
                    </button>
                  ))}
                </div>
                {renderComparePanel()}
              </div>
            )}

            {/* ── Cross-Brand Readout & Strategic Recommendations ── */}
            {(report.crossBrandReadout?.length > 0 || report.strategicRecommendations?.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {report.crossBrandReadout?.length > 0 && (
                  <section id="design-results-opportunity" className="bg-indigo-50 rounded-3xl border border-indigo-100 p-6">
                    <h4 className="text-sm font-bold text-indigo-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <Palette className="w-4 h-4" /> Opportunity Spaces
                    </h4>
                    <ul className="space-y-3">
                      {report.crossBrandReadout.map((item, idx) => {
                        const parsed = extractEvidenceTags(item || '');
                        return (
                        <li key={idx} className="text-sm text-indigo-800 flex items-start gap-2 leading-relaxed">
                          <span className="text-indigo-400 mt-0.5 shrink-0">•</span>
                          <span>
                            {parsed.cleanText || item}
                            {parsed.labels.map((label) => (
                              <span
                                key={`${idx}-${label}`}
                                className={`inline-block ml-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded align-middle ${evidenceLabelChipClass(label)}`}
                              >
                                {label}
                              </span>
                            ))}
                          </span>
                        </li>
                      );})}
                    </ul>
                  </section>
                )}
                {report.strategicRecommendations?.filter((item) => !isDevilsAdvocateLine(item || '')).length > 0 && (
                  <section id="design-results-strategic" className="bg-white rounded-3xl border border-zinc-200 p-6">
                    <h4 className="text-sm font-bold text-zinc-900 uppercase tracking-wider mb-4">Strategic Recommendations</h4>
                    <ul className="space-y-3">
                      {report.strategicRecommendations
                        .filter((item) => !isDevilsAdvocateLine(item || ''))
                        .map((item, idx) => {
                        const parsed = extractEvidenceTags(item || '');
                        return (
                        <li key={idx} className="text-sm text-zinc-700 flex items-start gap-2 leading-relaxed">
                          <span className="text-indigo-500 font-bold shrink-0">{idx + 1}.</span>
                          <span>
                            {parsed.cleanText || item}
                            {parsed.labels.map((label) => (
                              <span
                                key={`${idx}-${label}`}
                                className={`inline-block ml-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded align-middle ${evidenceLabelChipClass(label)}`}
                              >
                                {label}
                              </span>
                            ))}
                          </span>
                        </li>
                      );})}
                    </ul>
                  </section>
                )}
              </div>
            )}

            {/* Sources Section */}
            {report.sources && report.sources.length > 0 && (
              <motion.div
                id="design-results-sources"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="mt-12 p-8 bg-zinc-50 rounded-3xl border border-zinc-200 print-break-inside-avoid"
                data-testid="design-excavator-sources-section"
              >
                <h3 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
                  <Info className="w-5 h-5 text-zinc-400" />
                  Sources & Research
                </h3>
                <ul className="space-y-3">
                  {report.sources.map((source, idx) => (
                    <SourceLinkRow
                      key={`${source.url}-${idx}`}
                      index={idx}
                      title={source.title}
                      url={source.url}
                    />
                  ))}
                </ul>
              </motion.div>
            )}

            </motion.div>
          </SectionErrorBoundary>
        )}
      </AnimatePresence>

      {report && (
        <div className="w-full mt-14 mb-20 no-print">
          <RecentResultsLibrary<DesignExcavatorRecentResult>
            mode={APP_RECENT_RESULTS_MODES.DESIGN_EXCAVATOR}
            title="Recent Projects"
            refreshNonce={recentResultsRefreshNonce}
            onSelectItem={(item) => {
              console.log('[DesignExcavator] Recent result selected.', { id: item.id, title: item.title });
              if (item.savedSearch) {
                loadSavedSearch(item.savedSearch);
                return;
              }
              if (item.report && item.brands) {
                const loadedBrands = item.brands.slice(0, 6).map((brand, idx) => ({
                  id: `brand-recent-${Date.now()}-${idx}`,
                  name: (brand.name || '').trim(),
                  website: (brand.website || '').trim(),
                }));
                setBrands(loadedBrands.length > 0 ? loadedBrands : [{ id: 'brand-1', name: '', website: '' }]);
                setAnalysisObjective(item.analysisObjective || '');
                setTargetAudience(item.targetAudience || '');
                setTargetAudienceDetail('');
                setIsTargetAudienceDetailOpen(false);
                setReport(item.report);
                setResultTab('profiles');
                setIsSearchControlsMinimized(true);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
          />
        </div>
      )}

      {/* Your Library section is hidden for now. Code is preserved below for future use. */}
      {false && (
        <section className="w-full max-w-5xl mx-auto mt-10 bg-white rounded-3xl border border-zinc-200 p-5">
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
      )}

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

      <AnimatePresence>
        {activeColorOverride && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm"
              onClick={() => {
                console.log('[DesignExcavator] Closing color override modal from backdrop click.');
                setActiveColorOverride(null);
              }}
            />
            <motion.section
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-[60] flex items-center justify-center p-4"
              aria-modal="true"
              role="dialog"
              data-testid="color-override-modal"
            >
              <div className="w-full max-w-5xl max-h-[92vh] rounded-3xl border border-zinc-200 bg-white shadow-2xl overflow-hidden flex flex-col">
                <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-zinc-200">
                  <div>
                    <h3 className="text-base font-semibold text-zinc-900">Verify {activeColorOverride.brandName} Color</h3>
                    <div className="mt-1 inline-flex items-center gap-2">
                      <p className="text-xs text-zinc-500">
                        Current selection:
                        <span className="ml-1 font-medium" style={{ color: activeColorOverride.currentHex }}>
                          {activeColorOverride.currentHex}
                        </span>
                      </p>
                      <span
                        className="inline-flex w-6 h-6 rounded-md border border-zinc-300 shadow-sm shrink-0"
                        style={{ backgroundColor: activeColorOverride.currentHex }}
                        aria-label="Current selected color reference"
                        title={`Reference color ${activeColorOverride.currentHex}`}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    data-testid="close-color-override-modal"
                    onClick={() => {
                      console.log('[DesignExcavator] Closing color override modal with close button.');
                      setActiveColorOverride(null);
                    }}
                    className="inline-flex items-center justify-center w-9 h-9 rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                    aria-label="Close color override modal"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </header>

                <div className="flex-1 overflow-auto bg-zinc-100">
                  {activeColorOverride.screenshotUrl ? (
                    <img
                      src={activeColorOverride.screenshotUrl}
                      alt={`${activeColorOverride.brandName} website preview`}
                      className="w-full h-auto"
                      data-testid="color-override-preview-image"
                    />
                  ) : (
                    <div className="min-h-[300px] h-full flex items-center justify-center p-6">
                      <div className="max-w-lg text-center space-y-2">
                        <p className="text-sm font-medium text-zinc-700">No website preview was found for this brand.</p>
                        <p className="text-xs text-zinc-500">Recovery option: launch the eyedropper anyway and sample from any visible screen area, then we will replace this color in your report.</p>
                      </div>
                    </div>
                  )}
                </div>

                <footer className="px-5 py-4 border-t border-zinc-200 flex flex-wrap items-center justify-between gap-3 bg-white">
                  <div>
                    {!isNativeEyedropperSupported ? (
                      <p className="text-sm text-amber-700">
                        Your browser does not support the native eyedropper. Recovery option: use Chrome or Edge, then re-open this color tool.
                      </p>
                    ) : (
                      <p className="text-sm text-zinc-600">
                        Click launch, then sample any pixel with the browser eyedropper. Press Escape to cancel.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    data-testid="launch-eyedropper-button"
                    onClick={() => {
                      void handleLaunchEyedropper();
                    }}
                    disabled={!isNativeEyedropperSupported || isPickingColor}
                    className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isPickingColor ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crosshair className="w-4 h-4" />}
                    {isPickingColor ? 'Picking...' : 'Launch Eyedropper'}
                  </button>
                </footer>
              </div>
            </motion.section>
          </>
        )}
      </AnimatePresence>
      </div>
    </>
  );
}

// Backward-compatible alias for existing imports.
export const BrandDeepDivePage = VisualDesignPage;
