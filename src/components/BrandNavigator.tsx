import { getUserTelemetry } from '../services/telemetry';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  Loader2,
  Sparkles,
  FileText,
  Presentation,
  ExternalLink,
  Info,
  Tag,
  Filter,
  ChevronDown,
  Check,
  Clock,
  Trash2,
  Target,
  Upload,
  X,
  RefreshCw,
  Palette,
  ArrowLeft,
  Menu,
} from 'lucide-react';
import { BrandResearchMatrix, UploadedFile } from '../services/azure-openai';
import {
  askBrandNavigatorQuestion,
  generateBrandResearchMatrix,
  suggestBrandWebsite,
  suggestBrands,
} from '../services/azure-openai';
import { navigateToHashRoute, navigateToHomeDashboard } from '../services/navigation';
import { isBrandNavigatorRoute } from '../services/navigation-routes';
import { normalizeExternalHttpUrl, toSafeExternalHref } from '../services/external-links';
import { isLikelyArticleUrl, isSocialMediaUrl } from '../services/news-outlets';
import {
  BRAND_SUGGESTION_DEBOUNCE_MS,
  getLocalBrandSuggestions,
  normalizeBrandTokens,
  parseBrandsInput,
} from '../services/brand-input';
import { SplashGrid } from './SplashGrid';
import { BrandDeepDivePage } from './DesignExcavator';
import { ProgressiveLoader } from './ProgressiveLoader';
import { FeedbackChatWidget } from './FeedbackChatWidget';
import { CompassRoseIcon } from './icons/CompassRoseIcon';
import pptxgen from 'pptxgenjs';
import { supabase } from '../services/supabase-client';
import { saveCulturalPrefill } from '../services/cultural-prefill';
import { runUserAction } from '../services/user-actions';
import { normalizeAppError } from '../services/api-errors';
import { logger } from '../services/logger';
import { SectionErrorBoundary } from './SectionErrorBoundary';
import { RecentResultsLibrary } from './RecentResultsLibrary';
import MenuPage, { type MenuPageCard } from './MenuPage';
import { SourceLinkRow } from './SourceLinkRow';
import {
  APP_RECENT_RESULTS_MODES,
  saveRecentResult,
  type RecentResultRecord,
} from '../services/recent-results-storage';
import { saveDesignExcavatorPrefill } from '../services/design-excavator-prefill';
import { MobileTwoLineSubcopy } from './MobileTwoLineSubcopy';
import { MobileResultsNav } from './MobileResultsNav';
import { ShowThinkingDropdown } from './ShowThinkingDropdown';
import { SPLASH_GLOBE_STATIC_PROPS } from './splashGlobeDefaults';
import { buildExportFileBase } from '../services/export-filenames';
import {
  exportBrandAtlasDocumentToPdf,
  exportBrandAtlasDocumentToPptx,
  type BrandAtlasExportDocument,
} from '../services/brand-atlas-themed-export';
import {
  playCompletionSound,
  type CompletionSoundId,
} from '../services/completion-sound';
import { handleTextareaBulletShortcuts } from '../services/textarea-bullet-shortcuts';

const BRAND_NAVIGATOR_TABLE = 'Brand_Navigator';
const BRAND_NAVIGATOR_SHOW_THINKING_TEXT = 'Used a RAG pipeline: retrieved high-signal brand/category sources, re-ranked for relevance, extracted structured positioning evidence, and generated recommendations grounded in cited inputs.';
const RESULTS_COMPLETE_SOUND_ID: CompletionSoundId = 'classic-chime';

type BrandMatrixMeta = {
  audience: string;
  brand: string;
  generations: string[];
  topicFocus?: string;
  sourcesType?: string[];
  hasUploadedDocuments?: boolean;
};

interface SavedMatrix {
  id: string;
  date: string;
  brand: string;
  audience: string;
  generations: string[];
  topicFocus?: string;
  sourcesType?: string[];
  hasUploadedDocuments?: boolean;
  customName?: string;
  matrix: BrandResearchMatrix;
}

type BrandNavigatorRecentResult = RecentResultRecord & {
  savedMatrix?: SavedMatrix;
  matrix?: BrandResearchMatrix;
  matrixMeta?: BrandMatrixMeta;
};

type BrandResultSectionKey =
  | 'highLevelSummary'
  | 'brandMission'
  | 'brandPositioning'
  | 'keyOfferingsProductsServices'
  | 'strategicMoatsStrengths'
  | 'potentialThreatsWeaknesses'
  | 'challenges'
  | 'targetAudiences'
  | 'recentCampaigns'
  | 'keyMarketingChannels'
  | 'socialMediaChannels'
  | 'recentNews';

type EvidenceTagLabel = 'known' | 'inferred' | 'speculative' | 'analogy';

const BRAND_RESULT_SECTION_KEYS: BrandResultSectionKey[] = [
  'highLevelSummary',
  'brandMission',
  'brandPositioning',
  'keyOfferingsProductsServices',
  'strategicMoatsStrengths',
  'potentialThreatsWeaknesses',
  'challenges',
  'targetAudiences',
  'recentCampaigns',
  'keyMarketingChannels',
  'socialMediaChannels',
  'recentNews',
];

const isMissingResultTextValue = (value?: string | null): boolean => {
  const normalized = (value || '').trim().toLowerCase();
  return (
    normalized.length === 0
    || normalized === 'n/a'
    || normalized === 'na'
    || normalized === 'data unavailable'
    || normalized.endsWith(': n/a')
    || normalized.endsWith(': na')
  );
};

const MAX_BRAND_INPUT_LENGTH = 120;
const MAX_AUDIENCE_INPUT_LENGTH = 180;
const MAX_TOPIC_INPUT_LENGTH = 180;
const BRAND_AUDIENCE_GUIDANCE_TOOLTIP = 'The more specific the audience, the most specific the results. Examples: Gen Z women, AI tech professionals, Homebuyers.';
const BRAND_TOPIC_GUIDANCE_TOOLTIP = 'Examples: Gen Z purchase behavior, post-workout rituals, why runners switch from Nike to Hoka.';
const BRAND_GENERATION_FILTER_EXPLAINER_TOOLTIP = 'Select one or more age groups to focus your analysis.';
const BRAND_SOURCES_FILTER_EXPLAINER_TOOLTIP = 'Select the type of source(s) for your results. Source type adds context and specificity to observations.';
const BRAND_UPLOAD_DOCUMENTS_EXPLAINER_TOOLTIP = 'Upload one or more documents to complement your analysis.';

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

const GENERATIONS = [
  'Gen Alpha (2013–mid 2020s)',
  'Gen Z (1997–2012)',
  'Millennials (1981–1996)',
  'Gen X (1965–1980)',
  'Boomers (1946–1964)',
];

const SOURCES_TYPES = [
  'Mainstream',
  'Topic-Specific',
  'Alternative Media',
  'Niche/Fringe',
];

type FieldHoverExplainerProps = {
  tooltipLabel: string;
  tooltipText: string;
  baseTestId: string;
  suppressTooltip?: boolean;
  disableOnMobile?: boolean;
  children: React.ReactNode;
};

type InputGuidanceProps = {
  helperText: string;
  tooltipLabel: string;
  tooltipText: string;
  baseTestId: string;
  helperTextClassName?: string;
};

const InputGuidance = ({
  helperText,
  tooltipLabel,
  tooltipText,
  baseTestId,
  helperTextClassName = 'text-zinc-400',
}: InputGuidanceProps) => {
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const guidanceRef = useRef<HTMLDivElement | null>(null);
  const tooltipId = `${baseTestId}-tooltip`;

  const openTooltip = useCallback((reason: string) => {
    setIsTooltipOpen((wasOpen) => {
      if (!wasOpen) {
        console.log('[BrandNavigator] Input guidance tooltip opened.', { guidanceId: baseTestId, reason });
      }
      return true;
    });
  }, [baseTestId]);

  const closeTooltip = useCallback((reason: string) => {
    setIsTooltipOpen((wasOpen) => {
      if (wasOpen) {
        console.log('[BrandNavigator] Input guidance tooltip closed.', { guidanceId: baseTestId, reason });
      }
      return false;
    });
  }, [baseTestId]);

  useEffect(() => {
    if (!isTooltipOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const eventTarget = event.target as Node | null;
      if (!eventTarget || !guidanceRef.current) return;
      if (!guidanceRef.current.contains(eventTarget)) {
        closeTooltip('outside-click');
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeTooltip('escape');
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [closeTooltip, isTooltipOpen]);

  return (
    <div data-testid={baseTestId} className="mt-2 ml-2 flex items-start justify-start gap-1.5 text-xs text-left">
      <span className={`block self-start leading-tight text-left ${helperTextClassName}`}>{helperText}</span>
      <div
        ref={guidanceRef}
        className="relative inline-flex items-start self-start"
        onMouseEnter={() => openTooltip('hover')}
        onMouseLeave={() => closeTooltip('mouse-leave')}
      >
        <button
          type="button"
          data-testid={`${baseTestId}-trigger`}
          onClick={() => (isTooltipOpen ? closeTooltip('click-toggle-close') : openTooltip('click-toggle-open'))}
          onFocus={() => openTooltip('focus')}
          onBlur={(event) => {
            const nextFocusedTarget = event.relatedTarget as Node | null;
            if (!nextFocusedTarget || !guidanceRef.current?.contains(nextFocusedTarget)) {
              closeTooltip('blur');
            }
          }}
          className="inline-flex self-start items-center justify-center rounded-full p-0.5 text-zinc-400 hover:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          aria-label={tooltipLabel}
          aria-expanded={isTooltipOpen}
          aria-describedby={isTooltipOpen ? tooltipId : undefined}
        >
          <Info className="w-3.5 h-3.5" />
        </button>
        {isTooltipOpen && (
          <div
            id={tooltipId}
            role="tooltip"
            data-testid={`${baseTestId}-tooltip`}
            className="pointer-events-none absolute bottom-full right-0 z-50 mb-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl bg-black px-3 py-2 text-[11px] leading-relaxed text-white shadow-lg md:left-1/2 md:right-auto md:-translate-x-1/2"
          >
            {tooltipText}
            <span className="absolute top-full right-2 border-4 border-transparent border-t-black md:left-1/2 md:right-auto md:-translate-x-1/2" />
          </div>
        )}
      </div>
    </div>
  );
};

const FieldHoverExplainer = ({
  tooltipLabel,
  tooltipText,
  baseTestId,
  suppressTooltip = false,
  disableOnMobile = false,
  children,
}: FieldHoverExplainerProps) => {
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const explainerRef = useRef<HTMLDivElement | null>(null);
  const tooltipId = `${baseTestId}-tooltip`;
  const isTooltipSuppressedOnMobile = disableOnMobile
    && typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 767px)').matches;

  const openTooltip = useCallback((reason: string) => {
    if (suppressTooltip || isTooltipSuppressedOnMobile) return;
    setIsTooltipOpen((wasOpen) => {
      if (!wasOpen) {
        console.log('[BrandNavigator] Field explainer tooltip opened.', {
          explainerId: baseTestId,
          reason,
        });
      }
      return true;
    });
  }, [baseTestId, suppressTooltip, isTooltipSuppressedOnMobile]);

  const closeTooltip = useCallback((reason: string) => {
    setIsTooltipOpen((wasOpen) => {
      if (wasOpen) {
        console.log('[BrandNavigator] Field explainer tooltip closed.', {
          explainerId: baseTestId,
          reason,
        });
      }
      return false;
    });
  }, [baseTestId]);

  useEffect(() => {
    if (suppressTooltip) {
      closeTooltip('suppressed');
    }
  }, [closeTooltip, suppressTooltip]);

  useEffect(() => {
    if (isTooltipSuppressedOnMobile) {
      closeTooltip('suppressed-mobile');
    }
  }, [closeTooltip, isTooltipSuppressedOnMobile]);

  useEffect(() => {
    if (!isTooltipOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeTooltip('escape');
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [closeTooltip, isTooltipOpen]);

  return (
    <div
      ref={explainerRef}
      data-testid={baseTestId}
      className="relative w-full"
      onMouseEnter={() => openTooltip('hover')}
      onMouseLeave={() => closeTooltip('mouse-leave')}
      onFocusCapture={() => openTooltip('focus-within')}
      onBlurCapture={(event) => {
        const nextFocusedTarget = event.relatedTarget as Node | null;
        if (!nextFocusedTarget || !explainerRef.current?.contains(nextFocusedTarget)) {
          closeTooltip('blur-within');
        }
      }}
    >
      {children}
      {isTooltipOpen && !suppressTooltip && !isTooltipSuppressedOnMobile && (
        <div
          id={tooltipId}
          role="tooltip"
          data-testid={`${baseTestId}-tooltip`}
          aria-label={tooltipLabel}
          className="pointer-events-none absolute top-full left-1/2 z-40 mt-2 w-72 -translate-x-1/2 rounded-xl bg-black px-3 py-2 text-[11px] leading-relaxed text-white shadow-lg"
        >
          {tooltipText}
          <span className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-black" />
        </div>
      )}
    </div>
  );
};

const isTestEnvironment = (): boolean =>
  typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';

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

const evidenceLabelChipClass = (label: EvidenceTagLabel): string => {
  if (label === 'analogy') {
    return 'bg-zinc-100 text-zinc-600 border border-zinc-200';
  }
  return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
};

const buildTextFragmentHref = (baseUrl: string | undefined, claimText?: string): string => {
  const safeBase = toSafeExternalHref(baseUrl || '');
  if (!safeBase || !claimText) {
    return safeBase;
  }

  const normalizedClaim = claimText.replace(/\s+/g, ' ').trim();
  if (!normalizedClaim) {
    return safeBase;
  }

  const fragmentSnippet = normalizedClaim.slice(0, 120).trim();
  if (!fragmentSnippet) {
    return safeBase;
  }

  const delimiter = safeBase.includes('#') ? '&' : '#';
  return `${safeBase}${delimiter}:~:text=${encodeURIComponent(fragmentSnippet)}`;
};

const renderEvidenceLabelChip = (
  tag: EvidenceTagLabel,
  key: string,
  inferredEvidenceUrl?: string,
  claimText?: string
): React.ReactNode => {
  const chipLabel = tag.toUpperCase();
  const chipClass = `inline-block ml-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded align-middle ${evidenceLabelChipClass(tag)}`;
  if (tag === 'inferred' && inferredEvidenceUrl) {
    const deepLinkHref = buildTextFragmentHref(inferredEvidenceUrl, claimText);
    return (
      <a
        key={key}
        aria-label="Inferred evidence"
        href={deepLinkHref}
        target="_blank"
        rel="noopener noreferrer"
        className={`${chipClass} hover:underline`}
        title="Open evidence source and highlight related text when supported by your browser"
      >
        {chipLabel}
      </a>
    );
  }

  return (
    <span key={key} className={chipClass}>
      {chipLabel}
    </span>
  );
};

const shouldShowSplashOnInit = (isDirectBrandNavigatorRoute: boolean): boolean =>
  !isDirectBrandNavigatorRoute && !isTestEnvironment();

const getExportErrorDetail = (error: unknown): string | null => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error.trim();
  }
  return null;
};

const buildBrandNavigatorCustomName = (
  brands: string[],
  audience: string,
  topic: string
): string => {
  const brandSegment = brands.length > 0 ? brands.join('+') : 'General';
  const audienceSegment = audience.trim() || 'AnyAudience';
  const topicSegment = topic.trim() || 'GeneralTopic';
  const timestamp = new Date().toISOString();
  return `BN|${brandSegment}|${audienceSegment}|${topicSegment}|${timestamp}`;
};

const normalizeBrandLookupKey = (brandName: string): string =>
  (brandName || '').trim().toLowerCase();

const getImageProxyBaseUrl = (): string => {
  const configured = (((import.meta as any).env?.VITE_IMAGE_PROXY_BASE_URL as string) || '').trim();
  if (configured) return configured.replace(/\/$/, '');

  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
    return '';
  }

  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${protocol}//${hostname}:3001`;
    }
    return window.location.origin.replace(/\/$/, '');
  }

  return '';
};

const withImageProxy = (rawUrl: string): string => {
  if (!rawUrl || rawUrl.startsWith('data:image') || rawUrl.includes('/api/image-proxy?url=')) {
    return rawUrl;
  }

  const normalized = normalizeExternalHttpUrl(rawUrl);
  if (!normalized) {
    return rawUrl;
  }

  const proxyBase = getImageProxyBaseUrl();
  if (!proxyBase) {
    return normalized;
  }

  return `${proxyBase}/api/image-proxy?url=${encodeURIComponent(normalized)}`;
};

const getOriginFromUrl = (url?: string | null): string | null => {
  const normalized = normalizeExternalHttpUrl(url);
  if (!normalized) return null;
  try {
    return new URL(normalized).origin;
  } catch {
    return null;
  }
};

const dedupeUrls = (urls: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();
  const unique: string[] = [];
  urls.forEach((raw) => {
    const normalized = normalizeExternalHttpUrl(raw || '');
    if (!normalized) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    unique.push(normalized);
  });
  return unique;
};

const buildDeterministicLogoUrl = (website?: string | null): string | null => {
  const origin = getOriginFromUrl(website);
  if (!origin) return null;
  return `${origin}/logo.svg`;
};

const buildWebsiteFaviconCandidateUrls = (website?: string | null): string[] => {
  const origin = getOriginFromUrl(website);
  if (!origin) return [];
  return dedupeUrls([
    `${origin}/favicon.ico`,
    `${origin}/favicon.png`,
    `${origin}/favicon.svg`,
    `${origin}/apple-touch-icon.png`,
    `${origin}/apple-touch-icon-precomposed.png`,
    `${origin}/apple-touch-icon-180x180.png`,
    `${origin}/android-chrome-192x192.png`,
  ]);
};

const buildLargeLogoCandidateUrls = (website?: string | null): string[] => {
  const origin = getOriginFromUrl(website);
  const deterministicLogo = buildDeterministicLogoUrl(website);
  if (!origin && !deterministicLogo) return [];

  return dedupeUrls([
    deterministicLogo,
    origin ? `${origin}/logo.svg` : null,
    origin ? `${origin}/logo.png` : null,
    origin ? `${origin}/logo.webp` : null,
    origin ? `${origin}/wordmark.svg` : null,
    origin ? `${origin}/wordmark.png` : null,
    origin ? `${origin}/brandmark.svg` : null,
    origin ? `${origin}/brandmark.png` : null,
    origin ? `${origin}/assets/logo.png` : null,
    origin ? `${origin}/assets/logo.svg` : null,
    origin ? `${origin}/images/logo.png` : null,
    origin ? `${origin}/images/logo.svg` : null,
    origin ? `${origin}/apple-touch-icon.png` : null,
    origin ? `${origin}/apple-touch-icon-precomposed.png` : null,
    origin ? `${origin}/android-chrome-192x192.png` : null,
    origin ? `${origin}/favicon.ico` : null,
    origin ? `${origin}/favicon.png` : null,
    origin ? `${origin}/favicon.svg` : null,
    origin ? `${origin}/android-chrome-512x512.png` : null,
  ]);
};

const buildBrandLogoFallbackChain = (website?: string | null): string[] => {
  return dedupeUrls([
    ...buildLargeLogoCandidateUrls(website),
    ...buildWebsiteFaviconCandidateUrls(website),
  ]).map((url) => withImageProxy(url));
};

const extractedBrandLogoCache = new Map<string, string>();

const EMPTY_BRAND_RESEARCH_MATRIX: BrandResearchMatrix = {
  analysisObjective: '',
  ecosystemMethod: '',
  results: [],
  sources: [],
};

const normalizeSavedMatrixRow = (row: any): SavedMatrix => {
  return {
    id: String(row?.id || `bn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    date: row?.created_at || row?.createdAt || new Date().toISOString(),
    brand: row?.brand || '',
    audience: row?.audience || '',
    generations: Array.isArray(row?.generations) ? row.generations : [],
    topicFocus: row?.topic_focus ?? row?.topicFocus ?? undefined,
    sourcesType: Array.isArray(row?.sources_type)
      ? row.sources_type
      : Array.isArray(row?.sourcesType)
        ? row.sourcesType
        : [],
    hasUploadedDocuments: Boolean(row?.has_uploaded_documents ?? row?.hasUploadedDocuments),
    customName: row?.custom_name ?? row?.customName ?? undefined,
    matrix: row?.matrix || row?.results || EMPTY_BRAND_RESEARCH_MATRIX,
  };
};

export default function BrandNavigator() {
  const SPLASH_DURATION_MS = 3000;
  const isDirectBrandNavigatorRoute =
    typeof window !== 'undefined' &&
    isBrandNavigatorRoute(window.location.pathname, window.location.hash);
  logger.debug('[BrandNavigator] Route context', {
    pathname: typeof window !== 'undefined' ? window.location.pathname : '',
    hash: typeof window !== 'undefined' ? window.location.hash : '',
    isDirectBrandNavigatorRoute,
  });
  // Instantly skip splash in test environments.
  const [showSplash, setShowSplash] = useState(() =>
    shouldShowSplashOnInit(isDirectBrandNavigatorRoute)
  );
  const [isSplashHeld, setIsSplashHeld] = useState(false);
  const [isSplashManualMode, setIsSplashManualMode] = useState(false);
  const [activeExperience, setActiveExperience] = useState<'research' | 'brand' | null>(
    isDirectBrandNavigatorRoute ? 'research' : null
  );
  const [hasOpenedBrand, setHasOpenedBrand] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isMobileTopBarVisible, setIsMobileTopBarVisible] = useState(true);
  const lastMobileScrollYRef = useRef(0);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [brandInput, setBrandInput] = useState('');
  const [audience, setAudience] = useState('');
  const [audienceDetail, setAudienceDetail] = useState('');
  const [isAudienceDetailOpen, setIsAudienceDetailOpen] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [brandSuggestions, setBrandSuggestions] = useState<string[]>([]);
  const [isSuggestingBrands, setIsSuggestingBrands] = useState(false);
  const [resolvedBrandWebsites, setResolvedBrandWebsites] = useState<Record<string, string>>({});
  const [resolvingBrandWebsiteKeys, setResolvingBrandWebsiteKeys] = useState<string[]>([]);
  const websiteLookupTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  
  const [selectedGenerations, setSelectedGenerations] = useState<string[]>([]);
  const [isGenerationDropdownOpen, setIsGenerationDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const [topicFocus, setTopicFocus] = useState('');
  const [sourcesType, setSourcesType] = useState<string[]>([]);
  const [isSourcesDropdownOpen, setIsSourcesDropdownOpen] = useState(false);
  const sourcesDropdownRef = useRef<HTMLDivElement>(null);
  
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [savedMatrices, setSavedMatrices] = useState<SavedMatrix[]>([]);
  const [isBrandDropdownOpen, setIsBrandDropdownOpen] = useState(false);
  const brandDropdownRef = useRef<HTMLDivElement>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [fakeProgress, setFakeProgress] = useState(5);
  // Track average load time for smoother progress pacing
  const [averageLoadTime, setAverageLoadTime] = useState(() => {
    const stored = localStorage.getItem('averageLoadTimeMs');
    return stored ? parseFloat(stored) : 4000;
  });
  const loadTimesRef = useRef<number[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [matrix, setMatrix] = useState<BrandResearchMatrix | null>(null);
  const [matrixMeta, setMatrixMeta] = useState<BrandMatrixMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [suggestionsRetryNonce, setSuggestionsRetryNonce] = useState(0);
  const [fileReadErrors, setFileReadErrors] = useState<string[]>([]);
  const [exportError, setExportError] = useState<{ type: 'pptx' | 'pdf'; message: string } | null>(null);
  const [brandQuestion, setBrandQuestion] = useState('');
  const [brandAnswer, setBrandAnswer] = useState('');
  const [isAskingBrandQuestion, setIsAskingBrandQuestion] = useState(false);
  const [highlightedBrandSections, setHighlightedBrandSections] = useState<BrandResultSectionKey[]>([]);
  const [webHighlights, setWebHighlights] = useState<string[]>([]);
  const normalizedBrands = useMemo(() => normalizeBrandTokens(selectedBrands), [selectedBrands]);
  const brandInputQuery = brandInput.trim();
  const activeBrandLookupKeys = useMemo(
    () => normalizedBrands.map((brandName) => normalizeBrandLookupKey(brandName)).filter(Boolean),
    [normalizedBrands]
  );
  const activeBrandLookupKeysRef = useRef<Set<string>>(new Set());
  const [isResearchControlsMinimized, setIsResearchControlsMinimized] = useState(false);
  const [recentResultsRefreshNonce, setRecentResultsRefreshNonce] = useState(0);

  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const deleteTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [undoToast, setUndoToast] = useState<{ id: string, message: string } | null>(null);
  
  const visibleSavedMatrices = useMemo(() => {
    return savedMatrices.filter(sm => !deletingIds.includes(sm.id));
  }, [savedMatrices, deletingIds]);

  const filteredSavedMatrices = useMemo(() => {
    const search = (brandInput || '').trim().toLowerCase();
    if (!search) {
      return visibleSavedMatrices;
    }

    return visibleSavedMatrices.filter(
      (sm) =>
        (sm.brand || '').toLowerCase().includes(search) ||
        (sm.audience || '').toLowerCase().includes(search)
    );
  }, [brandInput, visibleSavedMatrices]);

  const brandResults = useMemo(() => {
    if (!matrix || !('results' in matrix)) {
      return [];
    }
    return matrix.results || [];
  }, [matrix]);
  const isBrandResultsMode = brandResults.length > 0;

  const loadSavedMatrix = (sm: SavedMatrix, shouldScroll = false) => {
    setSelectedBrands(parseBrandsInput(sm.brand || ''));
    setBrandInput('');
    setAudience(sm.audience);
    setAudienceDetail('');
    setIsAudienceDetailOpen(false);
    setSelectedGenerations(sm.generations || []);
    setTopicFocus(sm.topicFocus || '');
    setSourcesType(sm.sourcesType || []);
    setMatrix(sanitizeBrandResearchMatrix(sm.matrix));
    setMatrixMeta({
      audience: sm.audience,
      brand: sm.brand,
      generations: sm.generations || [],
      topicFocus: sm.topicFocus,
      sourcesType: sm.sourcesType || [],
      hasUploadedDocuments: sm.hasUploadedDocuments || false,
    });
    const recentItem: BrandNavigatorRecentResult = {
      id: sm.id,
      title: (sm.customName || sm.brand || 'Saved Brand Navigator Result').trim(),
      description: `Audience: ${(sm.audience || 'Not specified').trim()}`,
      savedMatrix: sm,
    };
    console.log('[BrandNavigator] Tracking recently viewed saved matrix.', { id: sm.id, title: recentItem.title });
    saveRecentResult(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR, recentItem);
    setRecentResultsRefreshNonce((prev) => prev + 1);

    if (shouldScroll) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const reportRef = useRef<HTMLDivElement>(null);
  const splashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const splashStartedAtRef = useRef<number | null>(null);
  const splashRemainingMsRef = useRef<number>(SPLASH_DURATION_MS);

  useEffect(() => {
    if (activeExperience === 'brand') {
      setHasOpenedBrand(true);
    }
  }, [activeExperience]);

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

  useEffect(() => {
    const syncExperienceFromLocation = () => {
      if (typeof window === 'undefined') return;
      const isOnBrandNavigatorRoute = isBrandNavigatorRoute(window.location.pathname, window.location.hash);
      if (!isOnBrandNavigatorRoute) return;

      setShowSplash(false);
      setActiveExperience((prev) => prev ?? 'research');
    };

    syncExperienceFromLocation();
    window.addEventListener('hashchange', syncExperienceFromLocation);
    window.addEventListener('popstate', syncExperienceFromLocation);

    return () => {
      window.removeEventListener('hashchange', syncExperienceFromLocation);
      window.removeEventListener('popstate', syncExperienceFromLocation);
    };
  }, []);

  // Auto-hide splash screen after 3 seconds, with press-and-hold pause.
  useEffect(() => {
    // Instantly dismiss splash in test env.
    if (isTestEnvironment()) {
      setShowSplash(false);
      return;
    }
    if (!showSplash) {
      return;
    }
    if (isSplashManualMode) {
      if (splashTimeoutRef.current) {
        clearTimeout(splashTimeoutRef.current);
        splashTimeoutRef.current = null;
      }
      splashStartedAtRef.current = null;
      return;
    }
    if (isSplashHeld) {
      if (splashStartedAtRef.current !== null) {
        const elapsed = Date.now() - splashStartedAtRef.current;
        splashRemainingMsRef.current = Math.max(0, splashRemainingMsRef.current - elapsed);
        splashStartedAtRef.current = null;
      }
      if (splashTimeoutRef.current) {
        clearTimeout(splashTimeoutRef.current);
        splashTimeoutRef.current = null;
      }
      return;
    }
    if (splashRemainingMsRef.current <= 0) {
      setShowSplash(false);
      return;
    }
    splashStartedAtRef.current = Date.now();
    splashTimeoutRef.current = setTimeout(() => {
      setShowSplash(false);
    }, splashRemainingMsRef.current);
    return () => {
      if (splashTimeoutRef.current) {
        clearTimeout(splashTimeoutRef.current);
        splashTimeoutRef.current = null;
      }
    };
  }, [showSplash, isSplashHeld, isSplashManualMode]);

  useEffect(() => {
    if (showSplash) {
      return;
    }
    setIsSplashManualMode(false);
    setIsSplashHeld(false);
  }, [showSplash]);

  useEffect(() => {
    if (!showSplash || !isSplashHeld) {
      return;
    }

    const releaseSplashHold = () => setIsSplashHeld(false);
    window.addEventListener('pointerup', releaseSplashHold);
    window.addEventListener('pointercancel', releaseSplashHold);

    return () => {
      window.removeEventListener('pointerup', releaseSplashHold);
      window.removeEventListener('pointercancel', releaseSplashHold);
    };
  }, [showSplash, isSplashHeld]);

  useEffect(() => {
    if (matrix && !isLoading) {
      setIsResearchControlsMinimized(true);
      return;
    }

    if (!matrix) {
      setIsResearchControlsMinimized(false);
    }
  }, [matrix, isLoading]);

  const handleSplashHoldStart = () => {
    if (showSplash) {
      setIsSplashHeld(true);
    }
  };

  const handleSplashHoldEnd = () => {
    if (showSplash) {
      setIsSplashHeld(false);
    }
  };

  const handleSplashDoubleClick = () => {
    if (!showSplash) return;
    setIsSplashManualMode(true);
    setIsSplashHeld(false);
  };

  const handleSplashManualDismiss = () => {
    if (!showSplash || !isSplashManualMode) return;
    setShowSplash(false);
    setIsSplashManualMode(false);
    setIsSplashHeld(false);
  };

  // Handle click outside dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsGenerationDropdownOpen(false);
      }
      if (brandDropdownRef.current && !brandDropdownRef.current.contains(event.target as Node)) {
        setIsBrandDropdownOpen(false);
      }
      if (sourcesDropdownRef.current && !sourcesDropdownRef.current.contains(event.target as Node)) {
        setIsSourcesDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load saved matrices from Supabase
  useEffect(() => {
    const fetchSavedMatrices = async () => {
      const { data, error } = await supabase
        .from(BRAND_NAVIGATOR_TABLE)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (!error) {
        const normalizedRows = (data || []).map(normalizeSavedMatrixRow);
        setSavedMatrices(normalizedRows);
      }
    };
    fetchSavedMatrices();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeoutId = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    activeBrandLookupKeysRef.current = new Set(activeBrandLookupKeys);
  }, [activeBrandLookupKeys]);

  useEffect(() => {
    return () => {
      Object.values(deleteTimeouts.current).forEach((timeoutId) => {
        clearTimeout(timeoutId as ReturnType<typeof setTimeout>);
      });
      deleteTimeouts.current = {};
      Object.values(websiteLookupTimersRef.current).forEach((timeoutId) => {
        clearTimeout(timeoutId as ReturnType<typeof setTimeout>);
      });
      websiteLookupTimersRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (!isLoading) {
      setFakeProgress(0);
      return;
    }

    setFakeProgress(8);
    const startedAt = Date.now();
    let finished = false;
    const progressInterval = setInterval(() => {
      setFakeProgress((prev) => {
        if (finished) return prev;
        const elapsedMs = Date.now() - startedAt;
        // Cap at 97% for most of the load
        const percent = Math.min(97, (elapsedMs / averageLoadTime) * 97);
        if (prev >= percent) return prev;
        return percent;
      });
    }, 60);

    // When loading completes, animate from current to 100% smoothly
    const cleanup = () => {
      finished = true;
      clearInterval(progressInterval);
      setFakeProgress((prev) => {
        if (prev >= 100) return 100;
        // Animate to 100% over 400ms
        const step = (100 - prev) / 8;
        let val = prev;
        const anim = setInterval(() => {
          val += step;
          if (val >= 100) {
            setFakeProgress(100);
            clearInterval(anim);
          } else {
            setFakeProgress(val);
          }
        }, 50);
        return prev;
      });
    };

    return cleanup;
  }, [isLoading, averageLoadTime]);




  const commitBrandInput = (rawValue: string): boolean => {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return false;
    }

    setSelectedBrands((prev) => {
      const exists = prev.some((item) => item.toLowerCase() === trimmed.toLowerCase());
      if (exists) {
        return prev;
      }
      const updated = [...prev, trimmed];
      logger.debug('Committed brand chip', { trimmed, count: updated.length });
      return updated;
    });
    setBrandInput('');
    if (showValidation) {
      setShowValidation(false);
    }
    return true;
  };

  const removeBrandChip = (brandToRemove: string) => {
    setSelectedBrands((prev) => {
      const updated = prev.filter((item) => item !== brandToRemove);
      logger.debug('Removed brand chip', { brandToRemove, count: updated.length });
      return updated;
    });
  };

  // Fetch brand suggestions as user types
  useEffect(() => {
    const activeQuery = brandInput.trim();

    if (!activeQuery) {
      setBrandSuggestions(prev => prev.length === 0 ? prev : []);
      setIsSuggestingBrands(false);
      return;
    }

    if (activeQuery.length < 2) {
      setBrandSuggestions(prev => prev.length === 0 ? prev : []);
      setIsSuggestingBrands(false);
      return;
    }

    // Don't suggest if the brand matches an existing saved search exactly
    if (visibleSavedMatrices.some(sm => (sm.brand || '').toLowerCase() === activeQuery.toLowerCase())) {
      setBrandSuggestions(prev => prev.length === 0 ? prev : []);
      return;
    }

    const localSuggestions = getLocalBrandSuggestions(
      activeQuery,
      visibleSavedMatrices.map((sm) => sm.brand || '')
    );
    setBrandSuggestions(localSuggestions);

    setIsSuggestingBrands(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        let suggestions: string[] = [];
        try {
          setSuggestionsError(null);
          suggestions = await runUserAction({
            actionName: 'brand-suggestions',
            action: async () => suggestBrands(activeQuery),
            onError: (normalized) => {
              setSuggestionsError(normalized.message);
              setToast('Failed to get brand suggestions. Please try again.');
            },
          });
          logger.debug('Brand suggestions resolved', { activeQuery, suggestionsCount: suggestions.length });
        } catch {
          suggestions = [];
        }

        const apiSuggestions = Array.isArray(suggestions) ? suggestions : [];
        if (apiSuggestions.length > 0) {
          if (!cancelled) {
            setBrandSuggestions(apiSuggestions);
          }
          return;
        }
      } catch (outerErr) {
        logger.error('Unexpected error in brand suggestion effect.', outerErr);
        setToast('An unexpected error occurred while suggesting brands.');
      } finally {
        if (!cancelled) {
          setIsSuggestingBrands(false);
        }
      }
    }, BRAND_SUGGESTION_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [brandInput, visibleSavedMatrices, suggestionsRetryNonce]);

  useEffect(() => {
    const activeKeys = new Set(activeBrandLookupKeys);
    const activeBrandPairs = normalizedBrands.map((brandName) => ({
      brandName,
      lookupKey: normalizeBrandLookupKey(brandName),
    }));
    console.log('[BrandNavigator] Reconciling background homepage lookups.', {
      activeBrands: normalizedBrands,
      activeBrandLookupKeys,
      resolvedCount: Object.keys(resolvedBrandWebsites).length,
      resolvingCount: resolvingBrandWebsiteKeys.length,
    });

    Object.keys(websiteLookupTimersRef.current).forEach((lookupKey) => {
      if (!activeKeys.has(lookupKey)) {
        console.log('[BrandNavigator] Clearing stale homepage lookup timer.', { lookupKey });
        clearTimeout(websiteLookupTimersRef.current[lookupKey]);
        delete websiteLookupTimersRef.current[lookupKey];
      }
    });

    setResolvedBrandWebsites((prev) => {
      const entries = Object.entries(prev).filter(([lookupKey]) => activeKeys.has(lookupKey));
      if (entries.length === Object.keys(prev).length) {
        return prev;
      }
      const next = Object.fromEntries(entries);
      console.log('[BrandNavigator] Dropped stale homepage resolutions.', {
        previousCount: Object.keys(prev).length,
        nextCount: Object.keys(next).length,
      });
      return next;
    });

    setResolvingBrandWebsiteKeys((prev) => prev.filter((lookupKey) => activeKeys.has(lookupKey)));

    activeBrandPairs.forEach(({ brandName, lookupKey }) => {
      if (!lookupKey || brandName.length < 2) {
        return;
      }
      if (resolvedBrandWebsites[lookupKey]) {
        return;
      }
      if (websiteLookupTimersRef.current[lookupKey]) {
        return;
      }

      setResolvingBrandWebsiteKeys((prev) => (prev.includes(lookupKey) ? prev : [...prev, lookupKey]));
      console.log('[BrandNavigator] Scheduling homepage lookup.', { brandName, lookupKey });
      websiteLookupTimersRef.current[lookupKey] = setTimeout(async () => {
        try {
          console.log('[BrandNavigator] Starting homepage lookup.', { brandName, lookupKey });
          const suggestedWebsite = await suggestBrandWebsite(brandName);
          console.log('[BrandNavigator] Homepage lookup completed.', { brandName, lookupKey, suggestedWebsite });
          if (!suggestedWebsite) {
            return;
          }
          if (!activeBrandLookupKeysRef.current.has(lookupKey)) {
            console.log('[BrandNavigator] Skipping stale homepage lookup result.', { brandName, lookupKey, suggestedWebsite });
            return;
          }
          setResolvedBrandWebsites((prev) => ({
            ...prev,
            [lookupKey]: suggestedWebsite,
          }));
        } finally {
          setResolvingBrandWebsiteKeys((prev) => prev.filter((item) => item !== lookupKey));
          clearTimeout(websiteLookupTimersRef.current[lookupKey]);
          delete websiteLookupTimersRef.current[lookupKey];
        }
      }, 700);
    });

    return () => {
      Object.keys(websiteLookupTimersRef.current).forEach((lookupKey) => {
        clearTimeout(websiteLookupTimersRef.current[lookupKey]);
        delete websiteLookupTimersRef.current[lookupKey];
      });
    };
  }, [activeBrandLookupKeys, normalizedBrands, resolvedBrandWebsites, resolvingBrandWebsiteKeys.length]);

  const handleReset = () => {
    setSelectedBrands([]);
    setBrandInput('');
    setAudience('');
    setAudienceDetail('');
    setIsAudienceDetailOpen(false);
    setTopicFocus('');
    setSourcesType([]);
    setSelectedGenerations([]);
    setFiles([]);
    setMatrix(null);
    setMatrixMeta(null);
    setError(null);
    setSaveWarning(null);
    setSuggestionsError(null);
    setFileReadErrors([]);
    setExportError(null);
    setBrandQuestion('');
    setBrandAnswer('');
    setIsAskingBrandQuestion(false);
    setHighlightedBrandSections([]);
    setWebHighlights([]);
    setIsResearchControlsMinimized(false);
    setShowValidation(false);
    setResolvedBrandWebsites({});
    setResolvingBrandWebsiteKeys([]);
    Object.keys(websiteLookupTimersRef.current).forEach((lookupKey) => {
      clearTimeout(websiteLookupTimersRef.current[lookupKey]);
      delete websiteLookupTimersRef.current[lookupKey];
    });
  };

  const shouldKeepDefaultLinkBehavior = (event: React.MouseEvent<HTMLAnchorElement>): boolean => {
    return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
  };

  const handlePrimaryLinkNavigation = (
    event: React.MouseEvent<HTMLAnchorElement>,
    navigate: () => void,
  ): void => {
    if (shouldKeepDefaultLinkBehavior(event)) {
      return;
    }

    event.preventDefault();
    navigate();
  };

  const handleAskBrandQuestion = async () => {
    if (!matrix || !brandQuestion.trim() || isAskingBrandQuestion) return;

    setIsAskingBrandQuestion(true);
    try {
      const audienceForSourcing = buildDetailedAudiencePrompt(matrixMeta?.audience || audience, audienceDetail);
      const response = await runUserAction({
        actionName: 'brand-followup-question',
        action: async () => askBrandNavigatorQuestion(matrix, brandQuestion, {
          audience: audienceForSourcing,
          brand: matrixMeta?.brand || selectedBrands.join(', '),
          topicFocus: matrixMeta?.topicFocus || topicFocus,
        }),
        onError: (normalized) => {
          setToast(normalized.message);
        },
      });
      setBrandAnswer(response.answer || '');
      setHighlightedBrandSections((response.relevantSections || []).filter(Boolean) as BrandResultSectionKey[]);
      setWebHighlights((response.webHighlights || []).filter((item) => (item || '').trim().length > 0));
    } catch {
      setToast('Unable to complete that search right now. Please try again.');
    } finally {
      setIsAskingBrandQuestion(false);
    }
  };

  const runBrandGeneration = async ({
    actionName,
    audienceValue,
    audienceDetailValue,
    brandsForGenerate,
    generationsValue,
    topicFocusValue,
    filesValue,
    sourcesTypeValue,
  }: {
    actionName: string;
    audienceValue: string;
    audienceDetailValue?: string;
    brandsForGenerate: Array<{ name: string; website: string }>;
    generationsValue: string[];
    topicFocusValue: string;
    filesValue: UploadedFile[];
    sourcesTypeValue: string[];
  }) => {
    const brandContext = brandsForGenerate.map((brand) => brand.name).join(', ');
    logger.info('Generating Brand Analysis', {
      actionName,
      audience: audienceValue,
      brands: brandsForGenerate,
      brandContext,
      sourcesTypeValue,
    });

    setFakeProgress(5);
    setIsLoading(true);
    const searchStart = Date.now();
    setError(null);
    setSaveWarning(null);
    setShowValidation(false);
    const hasUploadedDocuments = filesValue.length > 0;
    try {
      const effectiveAudienceValue = buildDetailedAudiencePrompt(audienceValue, audienceDetailValue || '');
      const result = await runUserAction({
        actionName,
        action: async () =>
          generateBrandResearchMatrix(
            effectiveAudienceValue,
            brandsForGenerate,
            generationsValue,
            topicFocusValue,
            filesValue,
            sourcesTypeValue
          ),
        onError: (normalized) => {
          setError(normalized.message);
        },
      });
      const sanitizedResult = sanitizeBrandResearchMatrix(result);
      setMatrix(sanitizedResult);
      setMatrixMeta({
        audience: audienceValue,
        brand: brandContext,
        generations: generationsValue,
        topicFocus: topicFocusValue,
        sourcesType: sourcesTypeValue,
        hasUploadedDocuments,
      });
      const generatedRecentId = `generated:${brandContext.toLowerCase()}|${audienceValue.toLowerCase()}|${topicFocusValue.toLowerCase()}`;
      const generatedRecentItem: BrandNavigatorRecentResult = {
        id: generatedRecentId,
        title: (brandContext || 'Generated Brand Analysis').trim(),
        description: `Audience: ${(audienceValue || 'Not specified').trim()}`,
        matrix: sanitizedResult,
        matrixMeta: {
          audience: audienceValue,
          brand: brandContext,
          generations: generationsValue,
          topicFocus: topicFocusValue,
          sourcesType: sourcesTypeValue,
          hasUploadedDocuments,
        },
      };
      console.log('[BrandNavigator] Tracking generated result in recent results library.', {
        id: generatedRecentId,
        title: generatedRecentItem.title,
      });
      saveRecentResult(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR, generatedRecentItem);
      setRecentResultsRefreshNonce((prev) => prev + 1);

      // Persist generated searches directly to Supabase
      try {
        // 1. Grab the silent data
        const { device, location, ip_address } = await getUserTelemetry();

        // 2. Inject it into the database payload
        const customName = buildBrandNavigatorCustomName(
          brandsForGenerate.map((brand) => brand.name),
          audienceValue,
          topicFocusValue
        );
        const { error: saveError } = await supabase.from(BRAND_NAVIGATOR_TABLE).insert([
          {
            custom_name: customName,
            brand: brandContext || null,
            audience: audienceValue || null,
            topic_focus: topicFocusValue || null,
            generations: generationsValue,
            sources_type: sourcesTypeValue,
            has_uploaded_documents: hasUploadedDocuments,
            matrix: sanitizedResult,
            device,
            location,
            ip_address,
          },
        ]);
        if (saveError) {
          throw saveError;
        }
        // Optionally, refresh saved matrices here if you want instant UI update
      } catch (saveErr) {
        logger.warn('Failed to save search to Supabase', saveErr);
        setSaveWarning('Report generated, but we could not save this search history. You can still continue using the results.');
      }

      await playCompletionSound(RESULTS_COMPLETE_SOUND_ID);

    } catch (err: unknown) {
      const normalized = normalizeAppError(err);
      setError(normalized.kind === 'unknown' ? 'Failed to generate Brand Navigator report. Please try again.' : normalized.message);
    } finally {
      const searchEnd = Date.now();
      const duration = searchEnd - searchStart;
      // Update average load time (simple moving average, last 10 loads)
      loadTimesRef.current.push(duration);
      if (loadTimesRef.current.length > 10) loadTimesRef.current.shift();
      const avg = loadTimesRef.current.reduce((a, b) => a + b, 0) / loadTimesRef.current.length;
      setAverageLoadTime(avg);
      localStorage.setItem('averageLoadTimeMs', String(avg));
      setFakeProgress(100);
      await new Promise((resolve) => setTimeout(resolve, 220));
      setIsLoading(false);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const pendingBrand = brandInput.trim();
    const brandNamesForGenerate = pendingBrand && !normalizedBrands.some((item) => item.toLowerCase() === pendingBrand.toLowerCase())
      ? [...normalizedBrands, pendingBrand]
      : normalizedBrands;

    if (pendingBrand) {
      logger.debug('Auto-committing pending brand on generate', { pendingBrand });
      setSelectedBrands(brandNamesForGenerate);
      setBrandInput('');
    }

    const brandsForGenerate = brandNamesForGenerate
      .map((name) => ({
        name: (name || '').trim(),
        website: resolvedBrandWebsites[normalizeBrandLookupKey(name)] || '',
      }))
      .filter((brand) => brand.name.length > 0)
      .slice(0, 6);

    setShowValidation(true);
    if (brandsForGenerate.length === 0) return;

    await runBrandGeneration({
      actionName: 'brand-generate-report',
      audienceValue: audience,
      audienceDetailValue: audienceDetail,
      brandsForGenerate,
      generationsValue: selectedGenerations,
      topicFocusValue: topicFocus,
      filesValue: files,
      sourcesTypeValue: sourcesType,
    });
  };

  const handleRefreshBrandSection = async (brandName: string, sectionKey: BrandResultSectionKey) => {
    const sectionLabel = sectionTitleMap[sectionKey] || sectionKey;
    const rerunBrands = normalizeBrandTokens(parseBrandsInput(matrixMeta?.brand || normalizedBrands.join(', ')))
      .map((name) => ({
        name,
        website: resolvedBrandWebsites[normalizeBrandLookupKey(name)] || '',
      }))
      .filter((brand) => brand.name.length > 0)
      .slice(0, 6);
    if (rerunBrands.length === 0 || !matrix) return;

    const rerunAudience = matrixMeta?.audience ?? audience;
    const rerunGenerations = matrixMeta?.generations ?? selectedGenerations;
    const baseTopic = matrixMeta?.topicFocus ?? topicFocus;
    const rerunTopic = [baseTopic, `Refresh focus: ${brandName} ${sectionLabel}`]
      .filter((value) => (value || '').trim().length > 0)
      .join(' | ');
    const rerunSources = matrixMeta?.sourcesType ?? sourcesType;

    console.log('[BrandNavigator] Refreshing individual section with new GPT search.', {
      brandName,
      sectionKey,
      sectionLabel,
      rerunAudience,
      rerunGenerations,
      rerunTopic,
      rerunSources,
    });
    setToast(`Refreshing ${sectionLabel} for ${brandName}...`);

    await runBrandGeneration({
      actionName: `brand-refresh-section-${sectionKey}`,
      audienceValue: rerunAudience,
      audienceDetailValue: audienceDetail,
      brandsForGenerate: rerunBrands,
      generationsValue: rerunGenerations,
      topicFocusValue: rerunTopic,
      filesValue: files,
      sourcesTypeValue: rerunSources,
    });
  };

  const deleteSavedMatrix = async (id: string) => {
    await supabase.from(BRAND_NAVIGATOR_TABLE).delete().eq('id', id);
    // Optionally, refresh saved matrices here
  };

  const undoDelete = (id: string) => {
    if (deleteTimeouts.current[id]) {
      clearTimeout(deleteTimeouts.current[id]);
      delete deleteTimeouts.current[id];
    }
    setDeletingIds(prev => prev.filter(dId => dId !== id));
    setUndoToast(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;

    const newFiles: UploadedFile[] = [];
    const failedFiles: string[] = [];
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const base64String = (event.target?.result as string).split(',')[1];
          if (!base64String) throw new Error('File read error');
          newFiles.push({
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            data: base64String
          });
          if (newFiles.length === selectedFiles.length) {
            setFiles(prev => [...prev, ...newFiles]);
          }
        } catch (err) {
          failedFiles.push(file.name);
          setToast('Failed to read one or more files.');
        }
      };
      reader.onerror = () => {
        failedFiles.push(file.name);
        setToast('Failed to read one or more files.');
      };
      reader.readAsDataURL(file);
    }
    if (failedFiles.length > 0) {
      setFileReadErrors((prev) => [...prev, ...failedFiles]);
    }
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const sectionTitleMap: Record<BrandResultSectionKey, string> = {
    highLevelSummary: 'High-Level Summary',
    brandMission: 'Brand Mission',
    brandPositioning: 'Brand Positioning',
    keyOfferingsProductsServices: 'Key Offerings / Products / Services',
    strategicMoatsStrengths: 'Strategic Moats (Strengths)',
    potentialThreatsWeaknesses: 'Potential Threats (Weaknesses)',
    challenges: 'Potential Challenges',
    targetAudiences: 'Target Audiences',
    recentCampaigns: 'Recent Campaigns',
    keyMarketingChannels: 'Key Marketing Channels',
    socialMediaChannels: 'Social Media Channels',
    recentNews: 'Recent News',
  };
  const brandResultNavItems = useMemo(() => {
    if (!isBrandResultsMode) {
      return [];
    }

    const items: Array<{ id: string; label: string }> = [{ id: 'brand-results-ask', label: 'Brand Q&A' }];
    brandResults.forEach((result, index) => {
      const brandLabel = (result.brandName || `Brand ${index + 1}`).trim();
      items.push({ id: `brand-results-brand-${index}`, label: brandLabel });
      BRAND_RESULT_SECTION_KEYS.forEach((sectionKey) => {
        items.push({
          id: `brand-results-brand-${index}-section-${sectionKey}`,
          label: `${brandLabel}: ${sectionTitleMap[sectionKey]}`,
        });
      });
    });

    if ((matrix?.sources || []).length > 0) {
      items.push({ id: 'brand-results-sources', label: 'Sources' });
    }

    return items;
  }, [brandResults, isBrandResultsMode, matrix?.sources, sectionTitleMap]);

  const sectionLinesForBrand = (brand: BrandResultEntry, key: BrandResultSectionKey): string[] => {
    switch (key) {
      case 'highLevelSummary':
        return [brand.highLevelSummary || 'N/A'];
      case 'brandMission':
        return [brand.brandMission || 'N/A'];
      case 'brandPositioning': {
        const positioning = brand.brandPositioning || {};
        return [
          `Taglines: ${(positioning.taglines || []).join(' | ') || 'N/A'}`,
          `Key messages and claims: ${(positioning.keyMessagesAndClaims || []).join(' | ') || 'N/A'}`,
          `Value proposition: ${positioning.valueProposition || 'N/A'}`,
          `Voice and tone: ${positioning.voiceAndTone || 'N/A'}`,
        ];
      }
      case 'keyOfferingsProductsServices':
        return (brand.keyOfferingsProductsServices || []).length > 0 ? brand.keyOfferingsProductsServices! : ['N/A'];
      case 'strategicMoatsStrengths':
        return (brand.strategicMoatsStrengths || []).length > 0 ? brand.strategicMoatsStrengths! : ['N/A'];
      case 'potentialThreatsWeaknesses':
        return (brand.potentialThreatsWeaknesses || []).length > 0 ? brand.potentialThreatsWeaknesses! : ['N/A'];
      case 'challenges':
        return (brand.challenges || []).length > 0 ? brand.challenges! : ['N/A'];
      case 'targetAudiences': {
        if (!brand.targetAudiences || brand.targetAudiences.length === 0) return ['N/A'];
        return brand.targetAudiences.flatMap((aud, index) => [
          `${index + 1}. ${aud.audience || 'Audience'}`,
          `Priority: ${aud.priority || 'N/A'}`,
          `Role to consumers: ${aud.inferredRoleToConsumers || 'N/A'}`,
          `Functional benefits: ${(aud.functionalBenefits || []).join(' | ') || 'N/A'}`,
          `Emotional benefits: ${(aud.emotionalBenefits || []).join(' | ') || 'N/A'}`,
        ]);
      }
      case 'recentCampaigns':
        return (brand.recentCampaigns || []).length > 0 ? brand.recentCampaigns! : ['N/A'];
      case 'keyMarketingChannels':
        return (brand.keyMarketingChannels || []).length > 0 ? brand.keyMarketingChannels! : ['N/A'];
      case 'socialMediaChannels':
        return (brand.socialMediaChannels || []).length > 0
          ? brand.socialMediaChannels!.map((item) => `${item.channel || 'Channel'}: ${item.url || 'N/A'}`)
          : ['N/A'];
      case 'recentNews':
        {
          const recentHeadlines = buildRecentHeadlines(brand);
          const pressReleaseFallback = recentHeadlines.length === 0
            ? pickBrandPressReleaseFallback(brand, brand.brandName || '')
            : null;
          const displayItems = pressReleaseFallback ? [pressReleaseFallback] : recentHeadlines;
          const recentHeadlineLines = displayItems.map((item) =>
            item.url
              ? `${item.headline}${item.outlet ? ` - ${item.outlet}` : ''}${item.publishedAt ? ` (${new Date(item.publishedAt).toLocaleDateString()})` : ''}: ${item.url}`
              : item.headline
          );
          return recentHeadlineLines.length > 0 ? recentHeadlineLines : ['N/A'];
        }
      default:
        return ['N/A'];
    }
  };

  const isBrandSectionMissing = (brand: BrandResultEntry, sectionKey: BrandResultSectionKey): boolean => {
    const lines = sectionLinesForBrand(brand, sectionKey);
    return lines.length === 0 || lines.every((line) => isMissingResultTextValue(line));
  };

  const generatePPTX = () => {
    if (!matrixMeta || brandResults.length === 0) return null;
    const pres = new pptxgen();
    pres.layout = 'LAYOUT_16x9';

    const titleSlide = pres.addSlide();
    titleSlide.background = { color: 'FAFAFA' };
    titleSlide.addText('Brand Navigator', { x: 0.8, y: 1.1, w: 12, h: 0.8, fontSize: 42, bold: true, color: '18181B' });
    titleSlide.addText('Brand Audit Report', { x: 0.8, y: 1.95, w: 12, h: 0.5, fontSize: 20, bold: true, color: '4F46E5' });
    titleSlide.addText(`Audience: ${matrixMeta.audience || 'N/A'}`, { x: 0.8, y: 2.7, w: 12, h: 0.4, fontSize: 14, color: '3F3F46' });
    if (matrixMeta.brand) titleSlide.addText(`Brands: ${matrixMeta.brand}`, { x: 0.8, y: 3.1, w: 12, h: 0.4, fontSize: 14, color: '3F3F46' });
    if (matrixMeta.topicFocus) titleSlide.addText(`Topic: ${matrixMeta.topicFocus}`, { x: 0.8, y: 3.5, w: 12, h: 0.4, fontSize: 14, color: '3F3F46' });
    titleSlide.addText(`Generated on ${new Date().toLocaleDateString()}`, { x: 0.8, y: 4.3, w: 12, h: 0.4, fontSize: 12, color: '71717A' });

    brandResults.forEach((brand, brandIndex) => {
      const brandName = brand.brandName || `Brand ${brandIndex + 1}`;
      const brandSlide = pres.addSlide();
      brandSlide.background = { color: 'FAFAFA' };
      brandSlide.addText(brandName, { x: 0.6, y: 0.4, w: 12, h: 0.5, fontSize: 24, bold: true, color: '18181B' });

      let y = 1.0;
      BRAND_RESULT_SECTION_KEYS.forEach((sectionKey) => {
        const title = sectionTitleMap[sectionKey];
        const lines = sectionLinesForBrand(brand, sectionKey);
        const body = lines.map((line) => `• ${line}`).join('\n');
        const estimatedHeight = Math.max(0.45, 0.22 * (lines.length + 1));

        if (y + estimatedHeight > 6.9) {
          y = 1.0;
          const continuationSlide = pres.addSlide();
          continuationSlide.background = { color: 'FAFAFA' };
          continuationSlide.addText(`${brandName} (Cont.)`, { x: 0.6, y: 0.4, w: 12, h: 0.5, fontSize: 22, bold: true, color: '18181B' });
          continuationSlide.addText(title, { x: 0.6, y, w: 12, h: 0.3, fontSize: 12, bold: true, color: '4F46E5' });
          continuationSlide.addText(body, { x: 0.75, y: y + 0.22, w: 11.5, h: Math.min(5.8, estimatedHeight), fontSize: 10, color: '3F3F46' });
          y += estimatedHeight + 0.25;
          return;
        }

        brandSlide.addText(title, { x: 0.6, y, w: 12, h: 0.3, fontSize: 12, bold: true, color: '4F46E5' });
        brandSlide.addText(body, { x: 0.75, y: y + 0.22, w: 11.5, h: estimatedHeight, fontSize: 10, color: '3F3F46' });
        y += estimatedHeight + 0.25;
      });
    });

    return pres;
  };

  const exportToPPTX = async () => {
    if (!matrixMeta || brandResults.length === 0) return;
    const fileBase = buildExportFileBase(matrixMeta.audience, 'Brand_Navigator');
    const exportDocument: BrandAtlasExportDocument = {
      reportTitle: 'Brand Navigator',
      reportSubtitle: 'Brand Atlas Competitive Audit',
      audience: matrixMeta.audience || 'N/A',
      contextLines: [
        matrixMeta.brand ? `Brands: ${matrixMeta.brand}` : '',
        matrixMeta.topicFocus ? `Topic: ${matrixMeta.topicFocus}` : '',
        matrixMeta.sourcesType?.length ? `Sources: ${matrixMeta.sourcesType.join(', ')}` : '',
      ].filter(Boolean),
      sections: brandResults.map((brand, index) => ({
        title: brand.brandName || `Brand ${index + 1}`,
        cards: BRAND_RESULT_SECTION_KEYS.map((sectionKey) => ({
          title: sectionTitleMap[sectionKey],
          lines: sectionLinesForBrand(brand, sectionKey).slice(0, 6),
        })),
      })),
    };

    setExportError(null);
    setIsExporting(true);
    setToast('Generating PPTX...');
    try {
      await exportBrandAtlasDocumentToPptx(exportDocument, `${fileBase}_Brand_Navigator.pptx`);
      setToast('PPTX exported successfully!');
    } catch (err) {
      const normalized = normalizeAppError(err);
      const detail = getExportErrorDetail(err);
      logger.error('Failed to export visual PPTX', { err, normalized });
      setExportError({
        type: 'pptx',
        message: detail ? `Failed to export PPTX: ${detail}` : (normalized.message || 'Failed to export PPTX. Please retry.'),
      });
      setToast('Failed to export PPTX.');
    } finally {
      setIsExporting(false);
    }
  };

  const exportToPDF = async () => {
    if (!matrixMeta || brandResults.length === 0) return;
    const fileBase = buildExportFileBase(matrixMeta.audience, 'Brand_Navigator');
    const exportDocument: BrandAtlasExportDocument = {
      reportTitle: 'Brand Navigator',
      reportSubtitle: 'Brand Atlas Competitive Audit',
      audience: matrixMeta.audience || 'N/A',
      contextLines: [
        matrixMeta.brand ? `Brands: ${matrixMeta.brand}` : '',
        matrixMeta.topicFocus ? `Topic: ${matrixMeta.topicFocus}` : '',
        matrixMeta.sourcesType?.length ? `Sources: ${matrixMeta.sourcesType.join(', ')}` : '',
      ].filter(Boolean),
      sections: brandResults.map((brand, index) => ({
        title: brand.brandName || `Brand ${index + 1}`,
        cards: BRAND_RESULT_SECTION_KEYS.map((sectionKey) => ({
          title: sectionTitleMap[sectionKey],
          lines: sectionLinesForBrand(brand, sectionKey).slice(0, 8),
        })),
      })),
    };

    setExportError(null);
    setIsExporting(true);
    setToast('Generating PDF...');
    try {
      await exportBrandAtlasDocumentToPdf(exportDocument, `${fileBase}_Brand_Navigator.pdf`);
      setToast('PDF exported successfully!');
    } catch (err) {
      const normalized = normalizeAppError(err);
      const detail = getExportErrorDetail(err);
      logger.error('Failed to export visual PDF', { err, normalized });
      setExportError({
        type: 'pdf',
        message: detail ? `Failed to generate PDF: ${detail}` : (normalized.message || 'Failed to generate PDF. Please retry.'),
      });
      setToast('Failed to generate PDF.');
    } finally {
      setIsExporting(false);
    }
  };

// Removed Google Slides export logic

  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  useEffect(() => {
    const checkApiKey = async () => {
      const aistudio = (window as any).aistudio;
      if (aistudio && aistudio.hasSelectedApiKey) {
        const hasKey = await aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      } else {
        setHasApiKey(true);
      }
    };
    checkApiKey();
  }, []);

  const handleSelectApiKey = async () => {
    const aistudio = (window as any).aistudio;
    if (aistudio && aistudio.openSelectKey) {
      await aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  if (hasApiKey === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] text-zinc-900 font-sans p-4">
        <div className="bg-white p-8 md:p-12 rounded-3xl border border-zinc-200 shadow-xl max-w-lg w-full text-center">
          <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold mb-4 text-zinc-900">Welcome to Brand Navigator</h1>
          <p className="text-zinc-600 mb-8 text-lg">
            To use this application, please connect your Gemini account. This ensures you have access to the latest models and features.
          </p>
          <button
            onClick={handleSelectApiKey}
            className="w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-2xl transition-all shadow-lg shadow-indigo-200 hover:shadow-indigo-300 flex items-center justify-center gap-3 text-lg"
          >
            <Sparkles className="w-5 h-5" />
            Connect Gemini Account
          </button>
        </div>
      </div>
    );
  }

  if (hasApiKey === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  const menuPageCards: MenuPageCard[] = [
    {
      id: 'brand-navigator',
      title: 'Brand Navigator',
      description: 'Get up-to-speed with a brand or survey an entire competitive landscape.',
      bullets: ['Brand audits', 'Competitive landscape analysis', 'Opportunity space identification', 'Creative briefs', 'Pitches'],
      icon: <CompassRoseIcon className="w-4 h-4" />,
      href: '/#brand-navigator',
      onClick: () => setActiveExperience('research'),
      bulletsMarginClassName: 'mt-3',
    },
    {
      id: 'design-excavator',
      title: 'Design Excavator',
      description: 'Compare design systems across brands: logos, colors, typography, visual cues.',
      bullets: ['Competitive research', 'Branding strategy development', 'Visual identity exploration', 'Creative briefs', 'Pitches'],
      icon: <Palette className="w-4 h-4" />,
      href: '/#design-excavator',
      onClick: () => navigateToHashRoute('design-excavator'),
      badgeText: 'Beta',
      badgeClassName:
        'align-super ml-3 inline-block px-2 py-1.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold tracking-wide border border-indigo-200',
      bulletsMarginClassName: 'mt-3',
    },
  ];

  return (
    <div className="min-h-screen relative flex flex-col bg-[#FAFAFA] text-zinc-900 font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-hidden">
      <AnimatePresence>
        {showSplash && (
          <motion.div
            data-testid="splash-screen"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className="fixed inset-0 z-[100] bg-[#FAFAFA] flex flex-col items-center justify-center overflow-hidden"
            onPointerDown={handleSplashHoldStart}
            onPointerUp={handleSplashHoldEnd}
            onPointerCancel={handleSplashHoldEnd}
            onDoubleClick={handleSplashDoubleClick}
            onClick={handleSplashManualDismiss}
          >
            <div className="absolute inset-0 z-0 translate-y-[20px]">
              <SplashGrid {...SPLASH_GLOBE_STATIC_PROPS} />
            </div>
            
            {!isSplashManualMode && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12, duration: 0.8 }}
                className="relative z-20 flex flex-col items-center text-center px-4 py-6 pointer-events-none mb-24 md:mb-16"
              >
                <Sparkles className="w-7 h-7 text-indigo-600 mb-8" />
                <h1 className="text-5xl md:text-7xl font-semibold tracking-tight text-zinc-950 mb-5 select-none">
                    Brand <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-fuchsia-500">Atlas</span>
                </h1>
                <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-zinc-200/70 bg-white/80 px-3 py-1.5 text-xs font-medium text-zinc-600 shadow-sm">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                  Loading research tools...
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Soft Dialpad-style background gradient */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-indigo-200/30 blur-[120px]" />
        <div className="absolute top-[20%] -right-[10%] w-[50%] h-[50%] rounded-full bg-cyan-200/20 blur-[120px]" />
        <div className="absolute -bottom-[10%] left-[20%] w-[60%] h-[60%] rounded-full bg-fuchsia-200/20 blur-[120px]" />
      </div>

      <main className={`relative z-10 flex-1 w-full max-w-6xl mx-auto px-6 ${activeExperience === null ? 'py-6 md:py-10' : 'py-16 md:py-24'}`}>
        {activeExperience === null && (
          <MenuPage
            subtitle="Start with a cultural deep dive or jump into a visual identity analysis."
            sectionClassName="max-w-3xl"
            cardsGridClassName="grid grid-cols-1 md:grid-cols-2 gap-8 items-start"
            cards={menuPageCards}
          />
        )}

        {(activeExperience === 'brand' || hasOpenedBrand) && (
          <div className={activeExperience === 'brand' ? '' : 'hidden'}>
            <BrandDeepDivePage onBack={() => navigateToHomeDashboard()} />
          </div>
        )}

        {activeExperience === 'research' && (
          <>
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
                  <p data-testid="mobile-page-title" className="truncate text-right text-sm font-semibold text-zinc-900">Brand Navigator</p>
                  <div data-testid="mobile-page-icon" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-indigo-600">
                    <CompassRoseIcon className="h-4 w-4" />
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
                      navigateToHomeDashboard();
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
                    href="/#design-excavator"
                    onClick={(event) => handlePrimaryLinkNavigation(event, () => {
                      setIsMobileNavOpen(false);
                      navigateToHashRoute('design-excavator');
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
            {!matrix && (
              <div className="mt-[2px] mb-[2px] px-2 sm:hidden">
                <MobileTwoLineSubcopy>
                  Audit any brand or competitive landscape.
                </MobileTwoLineSubcopy>
              </div>
            )}
            <div className="absolute top-6 left-6 z-50 no-print hidden sm:block">
              <a
                href="/?home=1"
                onClick={(event) => handlePrimaryLinkNavigation(event, () => navigateToHomeDashboard())}
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
                href="/#design-excavator"
                onClick={(event) => handlePrimaryLinkNavigation(event, () => navigateToHashRoute('design-excavator'))}
                className="inline-flex h-10 w-full items-center justify-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm border border-zinc-200 text-zinc-700 rounded-full font-medium leading-none hover:bg-zinc-50 hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-500/50 focus:ring-offset-1 transition-all shadow-sm text-sm sm:w-auto"
              >
                <Palette className="w-4 h-4" /> Design Excavator
                <span className="align-super ml-3 inline-block px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold tracking-wide border border-indigo-200">
                  Beta
                </span>
              </a>
              <button
                onClick={handleReset}
                className="inline-flex h-10 w-full items-center justify-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm border border-zinc-200 text-zinc-700 rounded-full font-medium leading-none hover:bg-zinc-50 hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-500/50 focus:ring-offset-1 transition-all shadow-sm text-sm sm:w-auto"
              >
                <RefreshCw className="w-4 h-4" /> New Search
              </button>
            </div>

        {/* Toast Notification */}
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

        {/* Undo Toast Notification */}
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
                onClick={() => undoDelete(undoToast.id)}
                className="text-indigo-400 hover:text-indigo-300 font-medium px-3 py-1 bg-white/10 rounded hover:bg-white/20 transition-colors"
              >
                Undo
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Google Slides export and modal removed for Supabase-only version */}

        <div className="mb-16 flex flex-col items-center text-center no-print pt-6 sm:pt-14">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="hidden sm:block"
          >
            <div className="inline-flex items-center justify-center p-2 bg-white rounded-2xl shadow-sm border border-indigo-200/80 mb-8">
              <CompassRoseIcon className="w-5 h-5 text-indigo-600" />
            </div>
            <h1 className="text-4xl md:text-6xl font-medium tracking-tight text-zinc-900 mb-6 select-none">
              Brand <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-fuchsia-500">Navigator</span>
            </h1>
            <p className="text-lg text-zinc-500 max-w-2xl mx-auto leading-relaxed select-none">
              Audit any brand or competitive landscape.
            </p>
          </motion.div>

          {isResearchControlsMinimized && matrixMeta && !isLoading && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-4xl mx-auto mt-8 mb-2"
            >
              <div className="bg-white border border-zinc-200 rounded-2xl px-4 py-3 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="text-left">
                  <p className="text-xs uppercase tracking-wider text-zinc-500 font-semibold">Brand Navigator</p>
                  <p className="text-sm text-zinc-700">
                    Audience: {matrixMeta.audience || 'N/A'}
                    {matrixMeta.brand ? ` • Brands: ${matrixMeta.brand}` : ''}
                    {matrixMeta.topicFocus ? ` • Topic: ${matrixMeta.topicFocus}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsResearchControlsMinimized(false)}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-500/50 focus:ring-offset-1"
                >
                  Edit Search
                </button>
              </div>
            </motion.div>
          )}

          <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            onSubmit={handleGenerate}
            noValidate
            className={`w-full max-w-4xl mt-4 sm:mt-10 relative flex flex-col gap-4 pb-24 sm:pb-0 ${isResearchControlsMinimized ? 'hidden' : ''}`}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start content-start">
              <div className="relative flex flex-col w-full self-start" ref={brandDropdownRef}>
                <div
                  data-testid="brand-input-frame"
                  className={`relative flex items-start w-full ${normalizedBrands.length > 0 ? 'min-h-14' : 'h-14'} bg-white border ${showValidation && normalizedBrands.length === 0 ? 'border-red-500 focus-within:ring-red-500/20 focus-within:border-red-500' : 'border-zinc-200 focus-within:ring-indigo-500/20 focus-within:border-indigo-500'} rounded-2xl text-zinc-900 focus-within:outline-none focus-within:ring-2 transition-all shadow-sm text-sm`}
                >
                  <Tag className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                  <div
                    data-testid="brands-input-shell"
                    className={`w-full pl-12 pr-12 flex gap-2 flex-wrap ${normalizedBrands.length > 0 ? 'min-h-14 py-2 items-start' : 'h-14 py-0 items-center'}`}
                  >
                    {normalizedBrands.map((brandChip, chipIndex) => (
                      <span
                        key={`${brandChip}-${chipIndex}`}
                        data-testid={`brand-chip-${chipIndex}`}
                        title={(() => {
                          const lookupKey = normalizeBrandLookupKey(brandChip);
                          if (resolvedBrandWebsites[lookupKey]) {
                            return `Verified website: ${resolvedBrandWebsites[lookupKey]}`;
                          }
                          if (resolvingBrandWebsiteKeys.includes(lookupKey)) {
                            return 'Verifying official homepage...';
                          }
                          return 'Homepage lookup pending';
                        })()}
                        className="group relative inline-flex max-w-full items-start gap-1 rounded-full bg-zinc-100 text-zinc-800 border border-zinc-200 px-3 py-1 text-xs font-medium whitespace-normal break-words"
                      >
                        {brandChip}
                        <span
                          data-testid={`brand-chip-website-${chipIndex}`}
                          className="pointer-events-none absolute left-1/2 top-full z-30 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-600 shadow-md group-hover:block"
                        >
                          {(() => {
                            const lookupKey = normalizeBrandLookupKey(brandChip);
                            if (resolvedBrandWebsites[lookupKey]) {
                              return resolvedBrandWebsites[lookupKey];
                            }
                            if (resolvingBrandWebsiteKeys.includes(lookupKey)) {
                              return 'Verifying homepage...';
                            }
                            return 'Homepage unavailable';
                          })()}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeBrandChip(brandChip)}
                          className="inline-flex items-center justify-center text-zinc-500 hover:text-zinc-800"
                          aria-label={`Remove ${brandChip}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    <input
                      data-testid="brands-input"
                      type="text"
                      value={brandInput}
                      onChange={(e) => {
                        setBrandInput(e.target.value.slice(0, MAX_BRAND_INPUT_LENGTH));
                        setIsBrandDropdownOpen(true);
                        if (showValidation) setShowValidation(false);
                      }}
                      onFocus={() => setIsBrandDropdownOpen(true)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault();
                          logger.debug('Brand input commit key pressed', { key: e.key, brandInput });
                          commitBrandInput(brandInput);
                          return;
                        }

                        if (e.key === 'Backspace' && !brandInput.trim() && normalizedBrands.length > 0) {
                          e.preventDefault();
                          const lastBrand = normalizedBrands[normalizedBrands.length - 1];
                          logger.debug('Brand input backspace remove last chip', { lastBrand });
                          removeBrandChip(lastBrand);
                        }
                      }}
                      placeholder={normalizedBrands.length > 0 ? 'Add more brands' : 'Brands (Required)'}
                      className={`flex-1 min-w-[140px] bg-transparent text-zinc-900 text-left placeholder:text-left placeholder-zinc-400 focus:outline-none ${normalizedBrands.length > 0 ? 'py-1' : 'h-10'}`}
                      disabled={isLoading}
                    />
                  </div>
                  {isDetecting && !brandInput.trim() && (
                    <div className="absolute right-4 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                    </div>
                  )}
                </div>
                {showValidation && normalizedBrands.length === 0 && (
                  <span className="text-red-500 text-sm mt-1 ml-2 text-left">At least one brand is required to generate insights.</span>
                )}
                <div data-testid="brand-brands-guidance" className="mt-2 ml-2 flex items-start justify-start gap-1.5 text-xs text-left">
                  <span className="block self-start leading-tight text-left text-zinc-400">Add one or more brands to analyze.</span>
                </div>
                <AnimatePresence>
                  {isBrandDropdownOpen && (brandInputQuery.length > 0 || visibleSavedMatrices.length > 0 || brandSuggestions.length > 0 || isSuggestingBrands) && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="absolute top-full left-0 w-full mt-2 bg-white border border-zinc-200 rounded-2xl shadow-lg z-20 max-h-80 overflow-y-auto"
                    >
                      {brandInputQuery.length > 0 && brandInputQuery.length < 2 && (
                        <div className="p-4 text-sm text-zinc-500 text-center">
                          Type at least 2 characters for suggestions.
                        </div>
                      )}

                      {isSuggestingBrands && (
                        <div className="p-4 text-sm text-zinc-500 flex items-center gap-2 justify-center border-b border-zinc-100">
                          <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                          Finding suggestions...
                        </div>
                      )}

                      {suggestionsError && (
                        <div className="px-4 pb-3 text-xs text-amber-700 flex items-center justify-between gap-2">
                          <span>{suggestionsError}</span>
                          <button
                            type="button"
                            onClick={() => setSuggestionsRetryNonce((prev) => prev + 1)}
                            className="inline-flex items-center gap-1 rounded-md border border-amber-300 px-2 py-1 text-[11px] font-semibold hover:bg-amber-50"
                          >
                            Retry
                          </button>
                        </div>
                      )}

                      {brandSuggestions.length > 0 && (
                        <>
                          <div className="p-3 text-xs font-bold text-zinc-400 uppercase tracking-wider border-b border-zinc-100 flex items-center gap-2">
                            <Sparkles className="w-4 h-4" /> Suggestions
                          </div>
                          <div className="p-2">
                            {brandSuggestions.map((suggestion, idx) => (
                              <button
                                key={`sug-${idx}`}
                                type="button"
                                onClick={() => {
                                  logger.debug('Brand suggestion selected', { suggestion });
                                  commitBrandInput(suggestion);
                                }}
                                className="w-full text-left px-4 py-3 hover:bg-zinc-50 focus:outline-none focus:bg-zinc-50 rounded-xl transition-colors font-medium text-zinc-900"
                              >
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        </>
                      )}

                      {brandInputQuery.length >= 2 && !isSuggestingBrands && brandSuggestions.length === 0 && (
                        <div className="p-4 text-sm text-zinc-500 text-center">
                          No suggestions found.
                        </div>
                      )}

                      {/* Recent Searches is hidden for now. Code is preserved below for future use. */}
                      {false && visibleSavedMatrices.length > 0 && (
                        <>
                          <div className="p-3 text-xs font-bold text-zinc-400 uppercase tracking-wider border-b border-zinc-100 flex items-center gap-2">
                            <Clock className="w-4 h-4" /> Recent Searches
                          </div>
                          <div className="p-2">
                            {filteredSavedMatrices.map(sm => (
                              <div key={sm.id} className="group flex items-center justify-between w-full hover:bg-zinc-50 rounded-xl transition-colors">
                                <button
                                  type="button"
                                  onClick={() => {
                                    loadSavedMatrix(sm);
                                    setIsBrandDropdownOpen(false);
                                  }}
                                  className="flex-1 text-left px-4 py-3 flex flex-col focus:outline-none focus:bg-zinc-50 rounded-xl transition-colors"
                                >
                                  <span className="font-medium text-zinc-900">{(sm.brand || 'General Audience').trim()}</span>
                                  <span className="text-xs text-zinc-500">
                                    Audience: {(sm.audience || '').trim()}
                                    {sm.topicFocus && ` • Topic: ${(sm.topicFocus || '').trim()}`}
                                    {sm.sourcesType && sm.sourcesType.length > 0 && ` • Sources: ${sm.sourcesType.join(', ')}`}
                                    {(() => {
                                      const dateObj = sm.date ? new Date(sm.date) : null;
                                      return dateObj && !isNaN(dateObj.getTime()) ? ` • ${dateObj.toLocaleDateString()}` : '';
                                    })()}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteSavedMatrix(sm.id);
                                  }}
                                  className="p-3 text-zinc-300 hover:text-red-500 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500/50 rounded-lg opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all"
                                  title="Delete saved report"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                            {filteredSavedMatrices.length === 0 && (
                              <div className="p-4 text-sm text-zinc-500 text-center">No matching saved searches.</div>
                            )}
                          </div>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="relative flex flex-col w-full self-start">
                <div className="relative flex h-14 items-start w-full">
                  <button
                    type="button"
                    data-testid="brand-audience-detail-toggle"
                    aria-label="Toggle detailed audience definition"
                    aria-expanded={isAudienceDetailOpen}
                    onClick={() => {
                      setIsAudienceDetailOpen((wasOpen) => {
                        const nextOpen = !wasOpen;
                        console.log('[BrandNavigator] Audience detail input toggled.', { isOpen: nextOpen });
                        return nextOpen;
                      });
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                  >
                    <ChevronDown className={`w-5 h-5 transition-transform ${isAudienceDetailOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <input
                    data-testid="audience-input"
                    type="text"
                    value={audience}
                    onChange={(e) => {
                      setAudience(e.target.value.slice(0, MAX_AUDIENCE_INPUT_LENGTH));
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                      }
                    }}
                    placeholder="Primary Audience (Optional)"
                    className="w-full h-14 pl-4 pr-20 py-0 bg-white border border-zinc-200 rounded-2xl text-zinc-900 text-left placeholder:text-left placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm text-sm"
                    disabled={isLoading}
                  />
                  {isDetecting && !audience.trim() && (
                    <div className="absolute right-12 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                    </div>
                  )}
                </div>
                {isAudienceDetailOpen && (
                  <div data-testid="brand-audience-detail-box" className="mt-2 ml-2">
                    <textarea
                      id="brand-audience-detail-input"
                      data-testid="brand-audience-detail-input"
                      value={audienceDetail}
                      onChange={(event) => setAudienceDetail(event.target.value)}
                      onKeyDown={(event) => {
                        handleTextareaBulletShortcuts(event, {
                          value: audienceDetail,
                          onValueChange: setAudienceDetail,
                          logPrefix: 'BrandNavigator',
                        });
                      }}
                      placeholder={`Add more audience details.\n- Demographics\n- Motivations\n- Behaviors`}
                      className="w-full min-h-[128px] rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-y"
                      disabled={isLoading}
                    />
                  </div>
                )}
                <InputGuidance
                  baseTestId="brand-audience-guidance"
                  helperText="Add the audience you want to analyze."
                  tooltipLabel="Primary audience input guidance"
                  tooltipText={BRAND_AUDIENCE_GUIDANCE_TOOLTIP}
                />
              </div>

              <div className="relative flex flex-col w-full self-start">
                <div className="relative flex h-14 items-start w-full">
                  <Target className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                  <input
                    type="text"
                    value={topicFocus}
                    onChange={(e) => setTopicFocus(e.target.value.slice(0, MAX_TOPIC_INPUT_LENGTH))}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                      }
                    }}
                    placeholder="Topic Focus (Optional)"
                    className="w-full h-14 pl-12 pr-12 py-0 bg-white border border-zinc-200 rounded-2xl text-zinc-900 text-left placeholder:text-left placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm text-sm"
                    disabled={isLoading}
                  />
                  {isDetecting && !topicFocus.trim() && (
                    <div className="absolute right-4 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                    </div>
                  )}
                </div>
                <InputGuidance
                  baseTestId="brand-topic-guidance"
                  helperText="Add a question or topic you want to explore."
                  tooltipLabel="Topic input guidance"
                  tooltipText={BRAND_TOPIC_GUIDANCE_TOOLTIP}
                />
              </div>
            </div>

            {/* Filters Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
              <FieldHoverExplainer
                baseTestId="brand-generation-field-explainer"
                tooltipLabel="Generation filter explainer"
                tooltipText={BRAND_GENERATION_FILTER_EXPLAINER_TOOLTIP}
                suppressTooltip={isGenerationDropdownOpen}
                disableOnMobile
              >
                <div className="relative flex flex-col w-full self-start" ref={dropdownRef}>
                  <button
                    data-testid="brand-generation-field"
                    type="button"
                    onClick={() => setIsGenerationDropdownOpen(!isGenerationDropdownOpen)}
                    className="w-full flex items-center justify-between px-4 py-4 bg-white border border-zinc-200 rounded-2xl text-zinc-700 text-left hover:bg-zinc-50 hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:ring-offset-1 transition-all shadow-sm text-sm"
                    disabled={isLoading}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <Filter className="w-5 h-5 text-zinc-400 shrink-0" />
                      <span className="truncate text-left">
                        {selectedGenerations.length > 0
                          ? `Generations: ${selectedGenerations.map(g => g.split(' ')[0] + (g.split(' ')[1] ? ' ' + g.split(' ')[1] : '')).join(', ')}`
                          : 'Filter by Generation (Optional)'}
                      </span>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-zinc-400 transition-transform ${isGenerationDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {isGenerationDropdownOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="absolute z-10 w-full mt-2 bg-white border border-zinc-200 rounded-2xl shadow-lg overflow-hidden"
                      >
                        <div className="max-h-60 overflow-y-auto p-2">
                          {GENERATIONS.map((gen) => {
                            const isSelected = selectedGenerations.includes(gen);
                            return (
                              <button
                                key={gen}
                                type="button"
                                onClick={() => {
                                  setSelectedGenerations(prev =>
                                    isSelected
                                      ? prev.filter(g => g !== gen)
                                      : [...prev, gen]
                                  );
                                }}
                                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-50 focus:bg-zinc-50 focus:outline-none rounded-xl transition-colors"
                              >
                                <span className={`text-sm ${isSelected ? 'font-medium text-indigo-900' : 'text-zinc-700'}`}>
                                  {gen}
                                </span>
                                {isSelected && <Check className="w-4 h-4 text-indigo-600" />}
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div data-testid="brand-generation-mobile-guidance" className="md:hidden">
                    <InputGuidance
                      baseTestId="brand-generation-mobile-guidance-inline"
                      helperText={BRAND_GENERATION_FILTER_EXPLAINER_TOOLTIP}
                      tooltipLabel="Generation filter explainer"
                      tooltipText={BRAND_GENERATION_FILTER_EXPLAINER_TOOLTIP}
                    />
                  </div>
                </div>
              </FieldHoverExplainer>

              <FieldHoverExplainer
                baseTestId="brand-sources-field-explainer"
                tooltipLabel="Sources filter explainer"
                tooltipText={BRAND_SOURCES_FILTER_EXPLAINER_TOOLTIP}
                suppressTooltip={isSourcesDropdownOpen}
                disableOnMobile
              >
                <div className="relative flex flex-col w-full self-start" ref={sourcesDropdownRef}>
                  <button
                    data-testid="brand-sources-field"
                    type="button"
                    onClick={() => setIsSourcesDropdownOpen(!isSourcesDropdownOpen)}
                    className="w-full flex items-center justify-between px-4 py-4 bg-white border border-zinc-200 rounded-2xl text-zinc-700 text-left hover:bg-zinc-50 hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:ring-offset-1 transition-all shadow-sm text-sm"
                    disabled={isLoading}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <FileText className="w-5 h-5 text-zinc-400 shrink-0" />
                      <span className="truncate text-left">
                        {sourcesType.length > 0 ? sourcesType.join(', ') : 'Sources (Optional)'}
                      </span>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-zinc-400 transition-transform ${isSourcesDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {isSourcesDropdownOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="absolute z-10 w-full mt-2 bg-white border border-zinc-200 rounded-2xl shadow-lg overflow-hidden"
                      >
                        <div className="max-h-60 overflow-y-auto p-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSourcesType([]);
                              setIsSourcesDropdownOpen(false);
                            }}
                            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-50 focus:bg-zinc-50 focus:outline-none rounded-xl transition-colors"
                          >
                            <span className={`text-sm ${sourcesType.length === 0 ? 'font-medium text-indigo-900' : 'text-zinc-700'}`}>
                              Any Source
                            </span>
                            {sourcesType.length === 0 && <Check className="w-4 h-4 text-indigo-600" />}
                          </button>
                          {SOURCES_TYPES.map((type) => {
                            const isSelected = sourcesType.includes(type);
                            return (
                              <button
                                key={type}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSourcesType(prev =>
                                    prev.includes(type)
                                      ? prev.filter(t => t !== type)
                                      : [...prev, type]
                                  );
                                }}
                                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-50 focus:bg-zinc-50 focus:outline-none rounded-xl transition-colors"
                              >
                                <span className={`text-sm ${isSelected ? 'font-medium text-indigo-900' : 'text-zinc-700'}`}>
                                  {type}
                                </span>
                                {isSelected && <Check className="w-4 h-4 text-indigo-600" />}
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div data-testid="brand-sources-mobile-guidance" className="md:hidden">
                    <InputGuidance
                      baseTestId="brand-sources-mobile-guidance-inline"
                      helperText={BRAND_SOURCES_FILTER_EXPLAINER_TOOLTIP}
                      tooltipLabel="Sources filter explainer"
                      tooltipText={BRAND_SOURCES_FILTER_EXPLAINER_TOOLTIP}
                    />
                  </div>
                </div>
              </FieldHoverExplainer>

              {/* File Upload */}
              <div className="relative flex flex-col w-full self-start">
                <input
                  type="file"
                  multiple
                  accept=".pdf,.txt,.docx,.csv,.pptx,.key"
                  onChange={handleFileChange}
                  className="hidden"
                  ref={fileInputRef}
                  disabled={isLoading}
                />
                <FieldHoverExplainer
                  baseTestId="brand-upload-field-explainer"
                  tooltipLabel="Upload documents explainer"
                  tooltipText={BRAND_UPLOAD_DOCUMENTS_EXPLAINER_TOOLTIP}
                  disableOnMobile
                >
                  <button
                    data-testid="brand-upload-field"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading}
                    className="w-full relative flex items-center bg-white border border-dashed border-zinc-300 rounded-2xl text-zinc-600 hover:bg-zinc-50 hover:border-indigo-300 hover:text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:ring-offset-1 transition-all shadow-sm text-sm"
                    style={{ minHeight: '56px', padding: 0 }}
                  >
                    <Upload className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                    <span className="w-full pl-12 pr-4 py-4 text-left block">
                      {files.length > 0
                        ? files.map(f => f.name).join(', ')
                        : 'Upload Documents (Optional)'}
                    </span>
                  </button>
                </FieldHoverExplainer>
                <div data-testid="brand-upload-mobile-guidance" className="md:hidden">
                  <InputGuidance
                    baseTestId="brand-upload-mobile-guidance-inline"
                    helperText={BRAND_UPLOAD_DOCUMENTS_EXPLAINER_TOOLTIP}
                    tooltipLabel="Upload documents explainer"
                    tooltipText={BRAND_UPLOAD_DOCUMENTS_EXPLAINER_TOOLTIP}
                  />
                </div>
                
                {files.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {files.map((file, index) => (
                      <div key={index} className="flex items-center gap-2 bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg text-sm border border-indigo-100">
                        <FileText className="w-4 h-4" />
                        <span className="max-w-[150px] truncate">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removeFile(index)}
                          className="p-0.5 hover:bg-indigo-200 hover:text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 rounded-md transition-colors"
                          disabled={isLoading}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {fileReadErrors.length > 0 && (
                  <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    Some files could not be read: {Array.from(new Set(fileReadErrors)).slice(0, 4).join(', ')}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-2 mx-auto flex w-full max-w-[312px] items-stretch justify-center gap-2 sm:max-w-none sm:flex sm:justify-center">
              <button
                type="submit"
                disabled={isLoading}
                className="w-[252px] sm:w-[288px] px-4 py-4 bg-zinc-900 text-white rounded-2xl font-medium hover:bg-zinc-800 hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-zinc-900/50 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none transition-all flex items-center justify-center gap-2 text-sm select-none relative overflow-hidden"
              >
                {isLoading ? (
                  <ProgressiveLoader
                    messages={[
                    'Pulling brand intelligence...',
                    'Building audience personas...',
                    'Mapping the competitive landscape...',
                        'Benchmarking brand positioning...',
                        'Identifying market white space...',
                        'Extracting strategic advantages...',
                    ]}
                    className="text-xs whitespace-nowrap leading-none"
                    showProgress
                    progress={fakeProgress}
                    averageDurationMs={4000}
                  />
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" /> Generate Analysis
                  </>
                )}
                {/* Progress bar is now rendered inside ProgressiveLoader for alignment with % */}
              </button>
              <button
                type="button"
                data-testid="new-search-below-generate"
                aria-label="New Search"
                title="New Search"
                onClick={handleReset}
                className="inline-flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500/50 focus:ring-offset-2 sm:hidden"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            <p className="subheader-copy text-xs text-zinc-400 text-center mt-8">
              AI models can make mistakes. Always double check your work. Remember to think critically.
              <br />
              Powered by OpenAI's GPT-5.6-Sol.
            </p>
            <RecentResultsLibrary<BrandNavigatorRecentResult>
              mode={APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR}
              title="Recent Projects"
              refreshNonce={recentResultsRefreshNonce}
              onSelectItem={(item) => {
                console.log('[BrandNavigator] Recent result selected.', { id: item.id, title: item.title });
                if (item.savedMatrix) {
                  loadSavedMatrix(item.savedMatrix, true);
                  return;
                }
                if (item.matrix && item.matrixMeta) {
                  setMatrix(sanitizeBrandResearchMatrix(item.matrix));
                  setMatrixMeta(item.matrixMeta);
                  setAudience(item.matrixMeta.audience || '');
                  setAudienceDetail('');
                  setIsAudienceDetailOpen(false);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
              className="mt-8"
            />
            
            {error && (
              <p className="text-red-500 text-sm mt-2">{error}</p>
            )}
            {saveWarning && (
              <p className="text-amber-700 text-sm mt-2">{saveWarning}</p>
            )}
            {exportError && (
              <div className="mt-2 flex items-center justify-center gap-2 text-xs text-amber-700">
                <span>{exportError.message}</span>
                <button
                  type="button"
                  onClick={() => {
                    if (exportError.type === 'pptx') {
                      exportToPPTX();
                    } else {
                      exportToPDF();
                    }
                  }}
                  className="inline-flex items-center rounded-md border border-amber-300 px-2 py-1 font-semibold hover:bg-amber-50"
                >
                  Retry
                </button>
              </div>
            )}
          </motion.form>
        </div>

        {/* Your Library is hidden for now. Code is preserved below for future use. */}
        {false && !matrix && !isLoading && visibleSavedMatrices.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-5xl mx-auto mt-8 mb-24 px-4"
          >
            <div className="flex items-center gap-2 mb-6">
              <Clock className="w-5 h-5 text-zinc-400" />
              <h3 className="text-xl font-semibold text-zinc-900 select-none">Your Library</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleSavedMatrices.map((sm) => (
                <div 
                  key={sm.id} 
                  className="group relative bg-white border border-zinc-200 rounded-2xl p-5 hover:shadow-md transition-all hover:border-indigo-200 cursor-pointer flex flex-col items-start text-left h-full" 
                  onClick={() => {
                    loadSavedMatrix(sm, true);
                  }}
                >
                  <div className="flex justify-between items-start w-full mb-2">
                    <h4 className="font-bold text-lg text-zinc-900 truncate pr-8">{sm.brand || 'General Audience'}</h4>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSavedMatrix(sm.id);
                      }}
                      className="absolute top-4 right-4 p-2 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all focus:opacity-100"
                      title="Delete saved report"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-zinc-600 font-medium mb-4 line-clamp-2 flex-1">{sm.audience}</p>
                  <div className="flex flex-wrap gap-2 mt-auto w-full items-center">
                    {sm.topicFocus && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-zinc-100 text-zinc-600 text-xs rounded-md truncate max-w-[120px]">
                        <Target className="w-3 h-3" /> <span className="truncate">{sm.topicFocus}</span>
                      </span>
                    )}
                    {sm.sourcesType && sm.sourcesType.length > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-zinc-100 text-zinc-600 text-xs rounded-md truncate max-w-[120px]">
                        <Filter className="w-3 h-3" /> <span className="truncate">{sm.sourcesType.join(', ')}</span>
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 px-2 py-1 text-zinc-400 text-xs rounded-md ml-auto">
                      {(() => {
                        const dateObj = sm.date ? new Date(sm.date) : null;
                        return dateObj && !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString() : '';
                      })()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {matrix && matrixMeta && (
            <motion.div
              ref={reportRef}
              key="matrix"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -40 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="w-full"
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-10 no-print gap-6">
                <div>
                  <h2 className="text-3xl font-bold text-zinc-900 mb-2">
                    Audience: <span className="text-indigo-600">{matrixMeta.audience}</span>
                  </h2>
                  {matrixMeta.brand && (
                    <p className="text-zinc-500 text-lg flex items-center gap-2">
                      <Tag className="w-4 h-4" /> Brands: {matrixMeta.brand}
                    </p>
                  )}
                  {matrixMeta.topicFocus && (
                    <p className="text-zinc-500 text-lg flex items-center gap-2 mt-1">
                      <Target className="w-4 h-4" /> Topic: {matrixMeta.topicFocus}
                    </p>
                  )}
                  {matrixMeta.sourcesType && matrixMeta.sourcesType.length > 0 && (
                    <p className="text-zinc-500 text-lg flex items-center gap-2 mt-1">
                      <FileText className="w-4 h-4" /> Sources: {matrixMeta.sourcesType.join(', ')}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button onClick={exportToPPTX} className="flex items-center gap-2 px-4 py-2 bg-white border border-zinc-200 rounded-full text-sm font-medium text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-500/50 focus:ring-offset-1 transition-all shadow-sm">
                    <Presentation className="w-4 h-4" /> PPTX <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-500 border border-indigo-100">Beta</span>
                  </button>
                  <button onClick={exportToPDF} className="flex items-center gap-2 px-4 py-2 bg-white border border-zinc-200 rounded-full text-sm font-medium text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-500/50 focus:ring-offset-1 transition-all shadow-sm">
                    <FileText className="w-4 h-4" /> PDF <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-500 border border-indigo-100">Beta</span>
                  </button>
                </div>
              </div>

              {/* Print Title (Only visible when printing) */}
              <div className="hidden print:block mb-10">
                <h1 className="text-4xl font-bold text-zinc-900 mb-2">Audience: {matrixMeta.audience}</h1>
                {matrixMeta.brand && <p className="text-xl text-zinc-600 mb-2">Brands: {matrixMeta.brand}</p>}
                {matrixMeta.topicFocus && <p className="text-xl text-zinc-600 mb-2">Topic: {matrixMeta.topicFocus}</p>}
                {matrixMeta.sourcesType && matrixMeta.sourcesType.length > 0 && <p className="text-xl text-zinc-600 mb-2">Sources: {matrixMeta.sourcesType.join(', ')}</p>}
                <p className="text-zinc-500">Generated on {new Date().toLocaleDateString()}</p>
              </div>

              <ShowThinkingDropdown
                methodologyText={BRAND_NAVIGATOR_SHOW_THINKING_TEXT}
                testIdPrefix="brand-show-thinking"
              />

              {isBrandResultsMode && (
                <MobileResultsNav
                  testId="mobile-results-nav-brand"
                  items={brandResultNavItems}
                />
              )}

              {isBrandResultsMode && (
                <div id="brand-results-ask" className="mb-10 bg-indigo-50 rounded-3xl p-6 md:p-8 border border-indigo-100 shadow-sm no-print">
                  <h3 className="text-xl font-bold text-indigo-900 mb-4 flex items-center gap-2">
                    <Search className="w-6 h-6" /> Ask the Navigator
                  </h3>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      data-testid="brand-qa-input"
                      type="text"
                      value={brandQuestion}
                      onChange={(e) => setBrandQuestion(e.target.value.slice(0, 320))}
                      placeholder="Ask a follow-up question and run a comprehensive web-backed search"
                      className="flex-1 px-5 py-4 rounded-2xl border border-indigo-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-zinc-900 shadow-sm text-sm"
                      onKeyDown={(e) => e.key === 'Enter' && handleAskBrandQuestion()}
                      disabled={isAskingBrandQuestion}
                    />
                    <button
                      data-testid="brand-qa-submit"
                      onClick={handleAskBrandQuestion}
                      disabled={isAskingBrandQuestion || !brandQuestion.trim()}
                      className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-medium hover:bg-indigo-700 hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:ring-offset-2 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none transition-all flex items-center justify-center gap-2 shadow-sm"
                    >
                      {isAskingBrandQuestion ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Search'}
                    </button>
                  </div>
                  {brandAnswer && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-6 p-6 bg-white rounded-2xl border border-indigo-100 text-zinc-700 shadow-sm leading-relaxed"
                    >
                      <p className="text-zinc-800 text-[15px] leading-7 whitespace-pre-wrap">{brandAnswer}</p>
                      {highlightedBrandSections.length > 0 && (
                        <div className="mt-4">
                          <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Located In Report Sections</p>
                          <div className="flex flex-wrap gap-2">
                            {highlightedBrandSections.map((section) => (
                              <span key={`highlight-section-${section}`} className="px-2.5 py-1 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-semibold">
                                {sectionTitleMap[section]}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {webHighlights.length > 0 && (
                        <div className="mt-4">
                          <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Web Search Highlights</p>
                          <ul className="list-disc pl-5 space-y-1 text-sm text-zinc-700">
                            {webHighlights.map((highlight, idx) => (
                              <li key={`web-highlight-${idx}`}>{highlight}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </motion.div>
                  )}
                </div>
              )}

              {isBrandResultsMode ? (
                <SectionErrorBoundary title="Brand Results">
                  <BrandResultsGrid
                    results={brandResults}
                    resolvedBrandWebsites={resolvedBrandWebsites}
                    highlightedSections={highlightedBrandSections}
                    sectionTitleMap={sectionTitleMap}
                    sectionLinesForBrand={sectionLinesForBrand}
                    isBrandSectionMissing={isBrandSectionMissing}
                    onRefreshBrandSection={(brandName, sectionKey) => {
                      void handleRefreshBrandSection(brandName, sectionKey);
                    }}
                    isRefreshing={isLoading}
                    onAudienceDeepDive={(audienceLabel, brandName) => {
                      const audienceFromCard = (audienceLabel || '').trim();
                      const brandFromCard = (brandName || '').trim();
                      const topicFromSearch = (topicFocus || '').trim();

                      saveCulturalPrefill({
                        audience: audienceFromCard,
                        brand: brandFromCard,
                        topicFocus: topicFromSearch,
                      });

                      const params = new URLSearchParams({
                        home: '1',
                      });
                      if (audienceFromCard) {
                        params.set('ca_audience', audienceFromCard);
                      }
                      if (brandFromCard) {
                        params.set('ca_brand', brandFromCard);
                      }
                      if (topicFromSearch) {
                        params.set('ca_topic', topicFromSearch);
                      }
                      const targetUrl = `${window.location.origin}/?${params.toString()}#cultural-archaeologist`;
                      window.open(targetUrl, '_blank', 'noopener,noreferrer');
                    }}
                  />
                </SectionErrorBoundary>
              ) : (
                <div className="mb-8 p-5 rounded-2xl border border-zinc-200 bg-white text-sm text-zinc-600 no-print">
                  No brand results were returned. Try updating your prompt and regenerate.
                </div>
              )}

              {/* Sources Section */}
              {matrix.sources && matrix.sources.length > 0 && (
                <motion.div
                  id="brand-results-sources"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                  className="mt-12 p-8 bg-zinc-50 rounded-3xl border border-zinc-200 print-break-inside-avoid"
                >
                  <h3 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
                    <Info className="w-5 h-5 text-zinc-400" />
                    Sources & Research
                  </h3>
                  <ul className="space-y-3">
                    {matrix.sources.map((source, idx) => (
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
          )}
        </AnimatePresence>

        {matrix && (
          <div className="w-full mt-14 mb-20 no-print">
            <RecentResultsLibrary<BrandNavigatorRecentResult>
              mode={APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR}
              title="Recent Projects"
              refreshNonce={recentResultsRefreshNonce}
              onSelectItem={(item) => {
                console.log('[BrandNavigator] Recent result selected.', { id: item.id, title: item.title });
                if (item.savedMatrix) {
                  loadSavedMatrix(item.savedMatrix, true);
                  return;
                }
                if (item.matrix && item.matrixMeta) {
                  setMatrix(sanitizeBrandResearchMatrix(item.matrix));
                  setMatrixMeta(item.matrixMeta);
                  setAudience(item.matrixMeta.audience || '');
                  setAudienceDetail('');
                  setIsAudienceDetailOpen(false);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
            />
          </div>
        )}

        {/* Recent Searches at bottom of results is hidden for now. Code is preserved below for future use. */}
        {false && matrix && visibleSavedMatrices.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-5xl mx-auto mt-16 mb-24 px-4 no-print"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-zinc-400" />
                <h3 className="text-xl font-semibold text-zinc-900">Recent Searches</h3>
              </div>
              <button 
                onClick={() => {
                  setMatrix(null);
                  setMatrixMeta(null);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
              >
                View All
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {visibleSavedMatrices.slice(0, 5).map((sm) => (
                <div 
                  key={sm.id} 
                  className="group relative bg-white border border-zinc-200 rounded-xl p-3 hover:shadow-md transition-all hover:border-indigo-200 cursor-pointer flex flex-col items-start text-left h-full" 
                  onClick={() => {
                    loadSavedMatrix(sm, true);
                  }}
                >
                  <div className="flex justify-between items-start w-full mb-1">
                    <h4 className="font-bold text-sm text-zinc-900 truncate pr-6">{sm.brand || 'General'}</h4>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSavedMatrix(sm.id);
                      }}
                      className="absolute top-2 right-2 p-1 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-md opacity-0 group-hover:opacity-100 transition-all focus:opacity-100"
                      title="Delete saved report"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-zinc-500 text-xs font-medium mb-2 line-clamp-2 flex-1">{sm.audience}</p>
                  <span className="text-zinc-400 text-[10px] mt-auto">
                    {(() => {
                      const dateObj = sm.date ? new Date(sm.date) : null;
                      return dateObj && !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString() : '';
                    })()}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
          </>
        )}
        {!showSplash && <FeedbackChatWidget />}
      </main>

      <footer
        className={`relative z-10 text-center no-print ${
          !showSplash && activeExperience === null ? 'pt-5 pb-6' : 'py-6'
        }`}
      >
        <p className="copyright-copy text-[10px] text-zinc-400 mt-0">© 2026 Brand Atlas by The Kapalaran Group LLC | All rights reserved | <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-zinc-500">Privacy Policy</a></p>
      </footer>
    </div>
  );
}

type BrandResultAudience = {
  audience?: string;
  priority?: string;
  inferredRoleToConsumers?: string;
  functionalBenefits?: string[];
  emotionalBenefits?: string[];
};

type BrandResultEntry = {
  brandName?: string;
  highLevelSummary?: string;
  brandMission?: string | null;
  brandPositioning?: {
    taglines?: string[];
    keyMessagesAndClaims?: string[];
    valueProposition?: string | null;
    voiceAndTone?: string;
  };
  keyOfferingsProductsServices?: string[];
  strategicMoatsStrengths?: string[];
  potentialThreatsWeaknesses?: string[];
  challenges?: string[];
  targetAudiences?: BrandResultAudience[];
  recentCampaigns?: string[];
  keyMarketingChannels?: string[];
  socialMediaChannels?: Array<{ channel?: string; url?: string }>;
  recentNews?: Array<
    string | {
      headline?: string | null;
      title?: string | null;
      url?: string | null;
      publishedAt?: string | null;
      date?: string | null;
      outlet?: string | null;
    }
  >;
  sources?: Array<{ title?: string; url?: string }>;
};

type ParsedHeadline = {
  headline: string;
  url?: string;
  publishedAt?: string;
  outlet?: string;
};

const PRESS_RELEASE_KEYWORDS = ['press', 'press-release', 'pressroom', 'newsroom', 'media', 'announcements', 'investor'];

const SOCIAL_CHANNEL_HOSTNAMES: Record<string, string[]> = {
  instagram: ['instagram.com', 'www.instagram.com'],
  linkedin: ['linkedin.com', 'www.linkedin.com'],
  x: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'],
  twitter: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'],
  facebook: ['facebook.com', 'www.facebook.com', 'fb.com', 'www.fb.com'],
  tiktok: ['tiktok.com', 'www.tiktok.com'],
  youtube: ['youtube.com', 'www.youtube.com', 'youtu.be'],
  threads: ['threads.net', 'www.threads.net'],
  pinterest: ['pinterest.com', 'www.pinterest.com'],
  snapchat: ['snapchat.com', 'www.snapchat.com'],
  reddit: ['reddit.com', 'www.reddit.com'],
};

const URL_PATTERN = /(https?:\/\/[^\s)]+|www\.[^\s)]+)/i;
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/i;
const BRAND_TOKEN_STOPWORDS = new Set([
  'the',
  'and',
  'of',
  'inc',
  'llc',
  'ltd',
  'co',
  'corp',
  'corporation',
  'company',
  'group',
  'official',
  'brand',
]);

const normalizeChannelKey = (channel?: string): string => {
  const normalized = (channel || '').trim().toLowerCase();
  if (normalized === 'twitter') return 'x';
  return normalized;
};

const normalizeSocialPath = (url: string): string[] => {
  try {
    const pathname = new URL(url).pathname || '';
    return pathname.split('/').map((segment) => segment.trim().toLowerCase()).filter(Boolean);
  } catch {
    return [];
  }
};

const isLikelySocialProfilePath = (channel: string, url: string): boolean => {
  const segments = normalizeSocialPath(url);
  if (segments.length === 0) return false;

  const first = segments[0];
  const second = segments[1] || '';

  if (channel === 'linkedin') {
    return first === 'company' || first === 'school' || first === 'showcase';
  }
  if (channel === 'youtube') {
    return first.startsWith('@') || first === 'channel' || first === 'c' || first === 'user';
  }
  if (channel === 'reddit') {
    return first === 'r' || first === 'user' || first === 'u';
  }
  if (channel === 'facebook') {
    return !['home.php', 'watch', 'marketplace', 'gaming', 'groups'].includes(first);
  }
  if (channel === 'x' || channel === 'instagram' || channel === 'tiktok' || channel === 'threads' || channel === 'pinterest' || channel === 'snapchat') {
    return !['home', 'explore', 'search', 'i', 'messages', 'about', 'discover'].includes(first) && first !== '';
  }

  return first !== '' || second !== '';
};

const extractBrandTokens = (brandName: string): { compact: string; tokens: string[] } => {
  const normalized = (brandName || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const tokens = normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !BRAND_TOKEN_STOPWORDS.has(token));
  const compact = normalized.replace(/[^a-z0-9]/g, '');
  return { compact, tokens };
};

const inferIsoDateFromText = (value: string): string | undefined => {
  const text = (value || '').trim();
  if (!text) return undefined;

  const numericDateMatch = text.match(/(20\d{2})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (numericDateMatch) {
    const [, y, m, d] = numericDateMatch;
    const parsed = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  const monthDateMatch = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2}\b/i);
  if (monthDateMatch) {
    const parsed = new Date(monthDateMatch[0]);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  return undefined;
};

const getOutletFromUrl = (url?: string): string | undefined => {
  const normalized = normalizeExternalHttpUrl(url);
  if (!normalized) return undefined;
  try {
    return new URL(normalized).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return undefined;
  }
};

const pickBrandPressReleaseFallback = (brandResult: BrandResultEntry, brandName: string): ParsedHeadline | null => {
  const sources = brandResult.sources || [];
  if (sources.length === 0) return null;

  const { compact, tokens } = extractBrandTokens(brandName);
  const candidates: Array<ParsedHeadline & { score: number; recency: number }> = [];

  for (const source of sources) {
    const safeUrl = normalizeExternalHttpUrl(source.url);
    const title = (source.title || '').trim();
    if (!safeUrl || !title) continue;

    let urlObj: URL;
    try {
      urlObj = new URL(safeUrl);
    } catch {
      continue;
    }

    const hostPath = `${urlObj.hostname}${urlObj.pathname}`.toLowerCase();
    const isPressLike = PRESS_RELEASE_KEYWORDS.some((keyword) => hostPath.includes(keyword) || title.toLowerCase().includes(keyword));
    if (!isPressLike) continue;

    const normalizedHostPath = hostPath.replace(/[^a-z0-9]/g, '');
    const brandMatches =
      (compact && normalizedHostPath.includes(compact)) ||
      tokens.some((token) => token.length >= 4 && normalizedHostPath.includes(token));
    if (!brandMatches) continue;

    const publishedAt = inferIsoDateFromText(`${title} ${safeUrl}`);
    const recency = publishedAt ? new Date(publishedAt).getTime() : 0;
    const outlet = getOutletFromUrl(safeUrl);

    candidates.push({
      headline: title,
      url: safeUrl,
      ...(publishedAt ? { publishedAt } : {}),
      ...(outlet ? { outlet } : {}),
      score: 18 + (publishedAt ? 3 : 0),
      recency,
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (b.recency !== a.recency) return b.recency - a.recency;
    return b.score - a.score;
  });

  const { score: _score, recency: _recency, ...best } = candidates[0];
  return best;
};

const socialUrlMatchesBrand = (url: string, brandName: string): boolean => {
  const segments = normalizeSocialPath(url);
  const slug = segments.join(' ').replace(/[^a-z0-9]/g, '');
  if (!slug) return false;

  const { compact, tokens } = extractBrandTokens(brandName);
  if (!compact && tokens.length === 0) return true;

  if (compact && slug.includes(compact)) return true;
  return tokens.some((token) => token.length >= 4 && slug.includes(token));
};

const urlMatchesChannel = (channel?: string, url?: string): boolean => {
  const normalizedUrl = normalizeExternalHttpUrl(url);
  if (!normalizedUrl) return false;

  const key = normalizeChannelKey(channel);
  if (!key) return true;

  const expected = SOCIAL_CHANNEL_HOSTNAMES[key];
  if (!expected || expected.length === 0) return true;

  try {
    const hostname = new URL(normalizedUrl).hostname.toLowerCase();
    return expected.some((allowedHost) => hostname === allowedHost || hostname.endsWith(`.${allowedHost}`));
  } catch {
    return false;
  }
};

const sanitizeSocialChannels = (
  channels: Array<{ channel?: string; url?: string }> | undefined,
  brandName: string
): Array<{ channel: string; url: string }> => {
  const sanitized: Array<{ channel: string; url: string }> = [];
  const seen = new Set<string>();

  (channels || []).forEach((channelEntry, index) => {
    const channelLabel = (channelEntry.channel || '').trim() || 'Social channel';
    const safeUrl = normalizeExternalHttpUrl(channelEntry.url);

    if (!safeUrl) {
      logger.debug('[BrandNavigator] Dropping social media link with invalid URL.', {
        brandName,
        channel: channelLabel,
        rawUrl: channelEntry.url,
        index,
      });
      return;
    }

    if (!urlMatchesChannel(channelLabel, safeUrl)) {
      logger.debug('[BrandNavigator] Dropping social media link due to channel-domain mismatch.', {
        brandName,
        channel: channelLabel,
        safeUrl,
        index,
      });
      return;
    }

    const normalizedChannel = normalizeChannelKey(channelLabel);
    if (!isLikelySocialProfilePath(normalizedChannel, safeUrl)) {
      logger.debug('[BrandNavigator] Dropping social media link that is not a profile/page URL.', {
        brandName,
        channel: channelLabel,
        safeUrl,
        index,
      });
      return;
    }

    if (!socialUrlMatchesBrand(safeUrl, brandName)) {
      logger.debug('[BrandNavigator] Dropping social media link that does not appear to match the brand page.', {
        brandName,
        channel: channelLabel,
        safeUrl,
        index,
      });
      return;
    }

    const dedupeKey = `${channelLabel.toLowerCase()}|${safeUrl.toLowerCase()}`;
    if (seen.has(dedupeKey)) {
      logger.debug('[BrandNavigator] Skipping duplicate social media link.', {
        brandName,
        channel: channelLabel,
        safeUrl,
      });
      return;
    }

    seen.add(dedupeKey);
    sanitized.push({ channel: channelLabel, url: safeUrl });
  });

  return sanitized;
};

const sanitizeSourceLinks = (
  sources: Array<{ title?: string; url?: string }> | undefined,
  context: { scope: 'global' | 'brand'; brandName?: string }
): Array<{ title: string; url: string }> => {
  const sanitized: Array<{ title: string; url: string }> = [];
  const seen = new Set<string>();

  (sources || []).forEach((source, index) => {
    const safeUrl = normalizeExternalHttpUrl(source?.url);
    const title = (source?.title || '').trim() || 'Source';

    if (!safeUrl) {
      logger.debug('[BrandNavigator] Dropping source with invalid external URL.', {
        scope: context.scope,
        brandName: context.brandName || null,
        title,
        rawUrl: source?.url,
        index,
      });
      return;
    }

    const dedupeKey = safeUrl.toLowerCase();
    if (seen.has(dedupeKey)) {
      logger.debug('[BrandNavigator] Skipping duplicate source URL.', {
        scope: context.scope,
        brandName: context.brandName || null,
        safeUrl,
      });
      return;
    }

    seen.add(dedupeKey);
    sanitized.push({ title, url: safeUrl });
  });

  return sanitized;
};

const parseHeadlineFromNewsItem = (
  newsItem: string | {
    headline?: string | null;
    title?: string | null;
    url?: string | null;
    publishedAt?: string | null;
    date?: string | null;
    outlet?: string | null;
  }
): ParsedHeadline | null => {
  if (typeof newsItem !== 'string') {
    const objectHeadline = (newsItem.headline || newsItem.title || '').trim();
    const objectUrl = normalizeExternalHttpUrl(newsItem.url);
    const publishedRaw = (newsItem.publishedAt || newsItem.date || '').trim();
    const publishedDate = publishedRaw ? new Date(publishedRaw) : null;
    const publishedAt =
      publishedDate && !Number.isNaN(publishedDate.getTime())
        ? publishedDate.toISOString()
        : undefined;
    const outlet = (newsItem.outlet || '').trim() || undefined;
    if (!objectHeadline && !objectUrl) return null;
    return {
      headline: objectHeadline || objectUrl || 'Article',
      ...(objectUrl ? { url: objectUrl } : {}),
      ...(publishedAt ? { publishedAt } : {}),
      ...(outlet ? { outlet } : {}),
    };
  }

  const trimmed = newsItem.trim();
  if (!trimmed) return null;

  const markdownMatch = trimmed.match(MARKDOWN_LINK_PATTERN);
  if (markdownMatch) {
    const headline = (markdownMatch[1] || '').trim();
    const url = normalizeExternalHttpUrl(markdownMatch[2]);
    if (!headline && !url) return null;
    return {
      headline: headline || 'Article',
      ...(url ? { url } : {}),
    };
  }

  const urlMatch = trimmed.match(URL_PATTERN);
  if (urlMatch) {
    const url = normalizeExternalHttpUrl(urlMatch[1]);
    const headline = trimmed.replace(urlMatch[1], '').trim().replace(/^[-:|•\s]+/, '') || 'Article';
    return {
      headline,
      ...(url ? { url } : {}),
    };
  }

  return { headline: trimmed };
};

const buildRecentHeadlines = (brandResult: BrandResultEntry): ParsedHeadline[] => {
  const fromRecentNews = (brandResult.recentNews || [])
    .map(parseHeadlineFromNewsItem)
    .filter((item): item is ParsedHeadline => Boolean(item));
  const deduped: ParsedHeadline[] = [];
  const seen = new Set<string>();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  fromRecentNews.forEach((item) => {
    if (!item.url) return;
    if (!isLikelyArticleUrl(item.url) || isSocialMediaUrl(item.url)) return;
    if (item.publishedAt) {
      const publishedTime = new Date(item.publishedAt).getTime();
      if (Number.isNaN(publishedTime) || publishedTime < sixMonthsAgo.getTime()) return;
    }

    const dedupeKey = `${item.headline.toLowerCase()}|${(item.url || '').toLowerCase()}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    deduped.push(item);
  });

  deduped.sort((a, b) => {
    const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return bTime - aTime;
  });

  return deduped.slice(0, 8);
};

const getPrimaryInferredEvidenceUrl = (
  brandResult: BrandResultEntry,
  displayNewsItems: ParsedHeadline[]
): string | undefined => {
  const sourceCandidates = (brandResult.sources || [])
    .map((source) => normalizeExternalHttpUrl(source?.url))
    .filter((url): url is string => Boolean(url));
  if (sourceCandidates.length > 0) {
    return sourceCandidates[0];
  }

  const newsCandidates = (displayNewsItems || [])
    .map((item) => normalizeExternalHttpUrl(item?.url))
    .filter((url): url is string => Boolean(url));
  if (newsCandidates.length > 0) {
    return newsCandidates[0];
  }

  return undefined;
};

const SECTION_OVERLAP_STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'into',
  'their',
  'they',
  'them',
  'over',
  'across',
  'brand',
  'company',
  'products',
  'services',
  'channels',
  'campaigns',
]);

const CHALLENGE_FOCUS_TERMS = [
  'brand',
  'positioning',
  'awareness',
  'perception',
  'equity',
  'message',
  'messaging',
  'creative',
  'campaign',
  'paid media',
  'social',
  'content',
  'influencer',
  'audience',
  'customer',
  'consumer',
  'retention',
  'churn',
  'acquisition',
  'conversion',
  'loyalty',
  'crm',
  'journey',
  'segmentation',
  'targeting',
  'engagement',
  'funnel',
];

const CHALLENGE_BUSINESS_MACRO_TERMS = [
  'macroeconomic',
  'macro',
  'inflation',
  'interest rate',
  'rate environment',
  'recession',
  'currency',
  'fx',
  'foreign exchange',
  'tariff',
  'trade policy',
  'geopolitical',
  'regulation',
  'regulatory',
  'antitrust',
  'privacy law',
  'labor market',
  'unemployment',
  'commodity',
  'energy cost',
  'shipping cost',
  'tax',
  'margin',
  'profitability',
  'cash flow',
  'debt',
  'financing',
  'cost of capital',
  'unit economics',
  'working capital',
];

const DEFAULT_BUSINESS_MACRO_CHALLENGE =
  '[INFERRED] Business/macro challenge: inflationary cost pressure and policy/regulatory shifts can increase demand volatility and planning risk.';

const normalizeOverlapText = (value: string): string => {
  return value
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
};

const tokenizeForOverlap = (value: string): string[] => {
  return normalizeOverlapText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !SECTION_OVERLAP_STOPWORDS.has(token));
};

const containsChallengeTerm = (value: string, terms: string[]): boolean => {
  const normalized = normalizeOverlapText(value);
  return terms.some((term) => normalized.includes(term));
};

type ChallengePriorityBucket = 'focus' | 'macro' | 'secondary';

const classifyChallengePriority = (value: string): ChallengePriorityBucket => {
  if (containsChallengeTerm(value, CHALLENGE_BUSINESS_MACRO_TERMS)) {
    return 'macro';
  }
  if (containsChallengeTerm(value, CHALLENGE_FOCUS_TERMS)) {
    return 'focus';
  }
  return 'secondary';
};

const prioritizeChallengesForMixAndOrder = (challenges: string[]): string[] => {
  const focus: string[] = [];
  const secondary: string[] = [];
  const macro: string[] = [];

  challenges.forEach((challenge) => {
    const bucket = classifyChallengePriority(challenge);
    if (bucket === 'macro') {
      macro.push(challenge);
      return;
    }
    if (bucket === 'focus') {
      focus.push(challenge);
      return;
    }
    secondary.push(challenge);
  });

  if (focus.length === 0 && secondary.length > 0) {
    focus.push(secondary.shift()!);
  }

  if (macro.length === 0 && challenges.length > 0) {
    macro.push(DEFAULT_BUSINESS_MACRO_CHALLENGE);
  }

  const hasFocusMajority = () => focus.length > (focus.length + secondary.length + macro.length) / 2;
  while (!hasFocusMajority() && secondary.length > 0) {
    secondary.pop();
  }
  while (!hasFocusMajority() && macro.length > 1) {
    macro.pop();
  }

  return [...focus, ...secondary, ...macro];
};

const hasHighSectionOverlap = (candidate: string, reference: string): boolean => {
  const normalizedCandidate = normalizeOverlapText(candidate);
  const normalizedReference = normalizeOverlapText(reference);

  if (!normalizedCandidate || !normalizedReference) {
    return false;
  }

  if (normalizedCandidate === normalizedReference) {
    return true;
  }

  if (
    (normalizedCandidate.includes(normalizedReference) || normalizedReference.includes(normalizedCandidate)) &&
    Math.min(normalizedCandidate.length, normalizedReference.length) >= 24
  ) {
    return true;
  }

  const candidateTokens = tokenizeForOverlap(candidate);
  const referenceTokens = tokenizeForOverlap(reference);
  if (candidateTokens.length === 0 || referenceTokens.length === 0) {
    return false;
  }

  const referenceTokenSet = new Set(referenceTokens);
  const sharedTokenCount = candidateTokens.reduce(
    (count, token) => count + (referenceTokenSet.has(token) ? 1 : 0),
    0
  );
  if (sharedTokenCount < 3) {
    return false;
  }

  const overlapVsCandidate = sharedTokenCount / candidateTokens.length;
  const overlapVsReference = sharedTokenCount / referenceTokens.length;
  return overlapVsCandidate >= 0.65 && overlapVsReference >= 0.5;
};

const collectNonChallengeLines = (result: BrandResultEntry): string[] => {
  const positioning = result.brandPositioning || {};
  const targetAudienceLines = (result.targetAudiences || []).flatMap((audienceEntry) => [
    audienceEntry.audience,
    audienceEntry.priority,
    audienceEntry.inferredRoleToConsumers,
    ...(audienceEntry.functionalBenefits || []),
    ...(audienceEntry.emotionalBenefits || []),
  ]);
  const socialLines = (result.socialMediaChannels || []).flatMap((channelEntry) => [
    channelEntry.channel,
    channelEntry.url,
    `${channelEntry.channel || ''} ${channelEntry.url || ''}`.trim(),
  ]);
  const recentNewsLines = (result.recentNews || [])
    .map(parseHeadlineFromNewsItem)
    .filter((item): item is ParsedHeadline => Boolean(item))
    .flatMap((item) => [item.headline, item.url || '']);

  return [
    result.highLevelSummary || '',
    result.brandMission || '',
    ...(positioning.taglines || []),
    ...(positioning.keyMessagesAndClaims || []),
    positioning.valueProposition || '',
    positioning.voiceAndTone || '',
    ...(result.keyOfferingsProductsServices || []),
    ...(result.strategicMoatsStrengths || []),
    ...(result.potentialThreatsWeaknesses || []),
    ...targetAudienceLines,
    ...(result.recentCampaigns || []),
    ...(result.keyMarketingChannels || []),
    ...socialLines,
    ...recentNewsLines,
  ]
    .map((value) => (value || '').trim())
    .filter((value) => value.length > 0);
};

const limitChallengeOverlap = (result: BrandResultEntry): string[] => {
  const rawChallenges = (result.challenges || [])
    .map((value) => (value || '').trim())
    .filter((value) => value.length > 0 && !isMissingResultTextValue(value));
  if (rawChallenges.length === 0) {
    return [];
  }

  const otherSectionLines = collectNonChallengeLines(result);
  const filteredChallenges: string[] = [];

  rawChallenges.forEach((challenge) => {
    const overlapsOtherSections = otherSectionLines.some((line) => hasHighSectionOverlap(challenge, line));
    if (overlapsOtherSections) {
      return;
    }

    const overlapsExistingChallenge = filteredChallenges.some((line) => hasHighSectionOverlap(challenge, line));
    if (overlapsExistingChallenge) {
      return;
    }

    filteredChallenges.push(challenge);
  });

  if (filteredChallenges.length > 0) {
    return prioritizeChallengesForMixAndOrder(filteredChallenges);
  }

  const fallbackUniqueChallenges = rawChallenges.filter(
    (challenge, index, list) =>
      list.findIndex((entry) => hasHighSectionOverlap(entry, challenge)) === index
  );
  return prioritizeChallengesForMixAndOrder(fallbackUniqueChallenges.slice(0, 1));
};

const sanitizeBrandResearchMatrix = (rawMatrix: BrandResearchMatrix): BrandResearchMatrix => {
  const sanitizedResults = (rawMatrix.results || []).map((result, index) => {
    const brandName = result.brandName || `Brand ${index + 1}`;
    const sanitizedChannels = sanitizeSocialChannels(result.socialMediaChannels, brandName);
    const sanitizedSources = sanitizeSourceLinks(result.sources, { scope: 'brand', brandName });
    const sanitizedChallenges = limitChallengeOverlap(result);

    logger.debug('[BrandNavigator] Sanitized social channels while loading results.', {
      brandName,
      beforeCount: (result.socialMediaChannels || []).length,
      afterCount: sanitizedChannels.length,
    });
    logger.debug('[BrandNavigator] Sanitized brand sources while loading results.', {
      brandName,
      beforeCount: (result.sources || []).length,
      afterCount: sanitizedSources.length,
    });
    logger.debug('[BrandNavigator] Reduced overlap for challenges while loading results.', {
      brandName,
      beforeCount: (result.challenges || []).length,
      afterCount: sanitizedChallenges.length,
    });

    return {
      ...result,
      socialMediaChannels: sanitizedChannels,
      challenges: sanitizedChallenges,
      sources: sanitizedSources,
    };
  });

  const sanitizedGlobalSources = sanitizeSourceLinks(rawMatrix.sources, { scope: 'global' });
  logger.debug('[BrandNavigator] Sanitized global sources while loading results.', {
    beforeCount: (rawMatrix.sources || []).length,
    afterCount: sanitizedGlobalSources.length,
  });

  return {
    ...rawMatrix,
    results: sanitizedResults,
    sources: sanitizedGlobalSources,
  };
};

function BrandResultsGrid({
  results,
  resolvedBrandWebsites,
  highlightedSections,
  sectionTitleMap,
  sectionLinesForBrand,
  isBrandSectionMissing,
  onRefreshBrandSection,
  isRefreshing,
  onAudienceDeepDive,
}: {
  results: BrandResultEntry[];
  resolvedBrandWebsites: Record<string, string>;
  highlightedSections: BrandResultSectionKey[];
  sectionTitleMap: Record<BrandResultSectionKey, string>;
  sectionLinesForBrand: (brand: BrandResultEntry, key: BrandResultSectionKey) => string[];
  isBrandSectionMissing: (brand: BrandResultEntry, key: BrandResultSectionKey) => boolean;
  onRefreshBrandSection: (brandName: string, sectionKey: BrandResultSectionKey) => void;
  isRefreshing: boolean;
  onAudienceDeepDive: (audienceLabel: string, brandName: string) => void;
}) {
  const isMultiBrandCompareEnabled = results.length > 1;
  const brandNamesForVisualDeepDive = results
    .map((result) => (result.brandName || '').trim())
    .filter((name) => name.length > 0);
  const [compareSection, setCompareSection] = useState<BrandResultSectionKey | null>(null);
  const [comparePopup, setComparePopup] = useState<{ x: number; y: number; section: BrandResultSectionKey } | null>(null);
  const comparePanelRef = useRef<HTMLElement | null>(null);

  const openComparePopup = (event: React.MouseEvent<HTMLElement>, section: BrandResultSectionKey) => {
    if (!isMultiBrandCompareEnabled) return;
    const clickedInteractiveElement = (event.target as HTMLElement | null)?.closest('a,button,input,textarea,select,label');
    if (clickedInteractiveElement) return;

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

    setComparePopup({ x, y, section });
  };

  useEffect(() => {
    if (!comparePopup) return;

    const closePopup = () => setComparePopup(null);
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePopup();
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
    if (!compareSection || !comparePanelRef.current) return;
    if (typeof comparePanelRef.current.scrollIntoView === 'function') {
      comparePanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [compareSection]);

  return (
    <div className="space-y-5">
      {isMultiBrandCompareEnabled && compareSection && (
        <section
          ref={comparePanelRef}
          data-testid="compare-across-brands-panel"
          className="bg-white rounded-3xl border border-zinc-200 p-6 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-zinc-900">
              Compare Across Brands: {sectionTitleMap[compareSection]}
            </h3>
            <button
              type="button"
              onClick={() => setCompareSection(null)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-200 text-zinc-600 text-sm hover:bg-zinc-50"
            >
              <span>Close Compare</span>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {BRAND_RESULT_SECTION_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setCompareSection(key)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  compareSection === key
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                }`}
              >
                {sectionTitleMap[key]}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {results.map((brandResult, brandIndex) => {
              const brandLabel = brandResult.brandName || `Brand ${brandIndex + 1}`;
              const lines = sectionLinesForBrand(brandResult, compareSection);
              return (
                <div key={`${brandLabel}-compare-${compareSection}`} className="rounded-2xl border border-zinc-200 p-4 bg-zinc-50/40">
                  <h4 className="text-sm font-semibold text-zinc-900 mb-2">{brandLabel}</h4>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-zinc-700">
                    {lines.map((line, idx) => (
                      <li key={`${brandLabel}-line-${idx}`}>{line}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      )}
      {results.map((brandResult, brandIndex) => (
        <BrandResultCard
          key={`${brandResult.brandName || 'brand'}-${brandIndex}`}
          sectionId={`brand-results-brand-${brandIndex}`}
          brandResult={brandResult}
          brandIndex={brandIndex}
          brandWebsite={resolvedBrandWebsites[normalizeBrandLookupKey(brandResult.brandName || '')] || ''}
          visualDeepDiveBrands={brandNamesForVisualDeepDive}
          highlightedSections={highlightedSections}
          canCompareAcrossBrands={isMultiBrandCompareEnabled}
          onRequestCompareAcrossBrands={openComparePopup}
          isSectionMissing={(sectionKey) => isBrandSectionMissing(brandResult, sectionKey)}
          onRefreshSection={(sectionKey) => onRefreshBrandSection(brandResult.brandName || `Brand ${brandIndex + 1}`, sectionKey)}
          isRefreshing={isRefreshing}
          onAudienceDeepDive={onAudienceDeepDive}
        />
      ))}
      {comparePopup && isMultiBrandCompareEnabled && (
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setComparePopup(null)} />
          <div
            className="fixed z-[101] bg-white border border-zinc-200 rounded-xl shadow-lg px-3 py-2 min-w-[220px]"
            style={{ left: comparePopup.x, top: comparePopup.y }}
          >
            <button
              type="button"
              onClick={() => {
                setCompareSection(comparePopup.section);
                setComparePopup(null);
              }}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 rounded-lg"
            >
              Compare Across Brands
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function BrandResultCard({
  sectionId,
  brandResult,
  brandIndex,
  brandWebsite,
  visualDeepDiveBrands,
  highlightedSections,
  canCompareAcrossBrands,
  onRequestCompareAcrossBrands,
  isSectionMissing,
  onRefreshSection,
  isRefreshing,
  onAudienceDeepDive,
}: {
  sectionId: string;
  brandResult: BrandResultEntry;
  brandIndex: number;
  brandWebsite: string;
  visualDeepDiveBrands: string[];
  highlightedSections: BrandResultSectionKey[];
  canCompareAcrossBrands: boolean;
  onRequestCompareAcrossBrands: (event: React.MouseEvent<HTMLElement>, section: BrandResultSectionKey) => void;
  isSectionMissing: (section: BrandResultSectionKey) => boolean;
  onRefreshSection: (section: BrandResultSectionKey) => void;
  isRefreshing: boolean;
  onAudienceDeepDive: (audienceLabel: string, brandName: string) => void;
}) {
  const brandName = brandResult.brandName || `Brand ${brandIndex + 1}`;
  const normalizedBrandWebsite = normalizeExternalHttpUrl(brandWebsite);
  const cachedExtractedLogo = normalizedBrandWebsite
    ? extractedBrandLogoCache.get(normalizedBrandWebsite) || ''
    : '';
  const positioning = brandResult.brandPositioning || {};
  const sanitizedSocialChannels = sanitizeSocialChannels(brandResult.socialMediaChannels, brandName);
  const recentNewsItems = buildRecentHeadlines(brandResult);
  const fallbackPressRelease = recentNewsItems.length === 0
    ? pickBrandPressReleaseFallback(brandResult, brandName)
    : null;
  const displayNewsItems = fallbackPressRelease ? [fallbackPressRelease] : recentNewsItems;
  const inferredEvidenceUrl = getPrimaryInferredEvidenceUrl(brandResult, displayNewsItems);
  const [extractedBrandLogoUrl, setExtractedBrandLogoUrl] = useState<string>(cachedExtractedLogo);
  const [isPrimaryLogoHidden, setIsPrimaryLogoHidden] = useState(false);
  const brandWebsiteForLogo = extractedBrandLogoUrl || normalizedBrandWebsite || inferredEvidenceUrl;
  const brandLogoFallbackChain = buildBrandLogoFallbackChain(brandWebsiteForLogo);
  const primaryBrandLogo = brandLogoFallbackChain[0] || null;
  const brandLogoRemainingFallbacks = brandLogoFallbackChain.slice(1);

  useEffect(() => {
    setIsPrimaryLogoHidden(false);
  }, [brandName, primaryBrandLogo]);

  useEffect(() => {
    let isCancelled = false;
    setExtractedBrandLogoUrl(cachedExtractedLogo);

    if (cachedExtractedLogo) {
      logger.debug('[BrandNavigator] Using cached extracted brand logo URL.', {
        brandName,
        normalizedBrandWebsite,
      });
      return () => {
        isCancelled = true;
      };
    }

    if (!normalizedBrandWebsite || typeof fetch !== 'function') {
      return () => {
        isCancelled = true;
      };
    }

    const apiBase = getImageProxyBaseUrl();
    if (!apiBase) {
      return () => {
        isCancelled = true;
      };
    }

    const controller = new AbortController();
    const requestTimeout = setTimeout(() => controller.abort(), 4000);
    const lookupTarget = `${apiBase}/api/brand-images-legacy?domain=${encodeURIComponent(normalizedBrandWebsite)}`;
    logger.debug('[BrandNavigator] Requesting brand logo from brand-images endpoint.', {
      brandName,
      normalizedBrandWebsite,
      lookupTarget,
    });

    fetch(lookupTarget, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json() as Promise<{ logoUrl?: string | null }>;
      })
      .then((payload) => {
        if (isCancelled) return;
        const resolved = normalizeExternalHttpUrl(payload?.logoUrl || '');
        if (!resolved) return;
        extractedBrandLogoCache.set(normalizedBrandWebsite, resolved);
        setExtractedBrandLogoUrl(resolved);
      })
      .catch((error) => {
        logger.debug('[BrandNavigator] Brand logo extraction request failed; using fallback logo chain.', {
          brandName,
          normalizedBrandWebsite,
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        clearTimeout(requestTimeout);
      });

    return () => {
      isCancelled = true;
      clearTimeout(requestTimeout);
      controller.abort();
    };
  }, [brandName, cachedExtractedLogo, normalizedBrandWebsite]);

  logger.debug('[BrandNavigator] Rendering brand result card with validated links.', {
    brandName,
    brandWebsiteForLogo,
    logoCandidates: brandLogoFallbackChain.slice(0, 6),
    socialMediaBefore: (brandResult.socialMediaChannels || []).length,
    socialMediaAfter: sanitizedSocialChannels.length,
    recentHeadlinesCount: recentNewsItems.length,
    fallbackPressReleaseUsed: Boolean(fallbackPressRelease),
  });

  const handleAnalyzeVisualIdentities = () => {
    const normalizedBrands = (visualDeepDiveBrands.length > 0 ? visualDeepDiveBrands : [brandName])
      .map((name) => name.trim())
      .filter((name) => name.length > 0)
      .slice(0, 6)
      .map((name) => ({ name, website: '' }));

    saveDesignExcavatorPrefill({
      brands: normalizedBrands,
    });

    const targetUrl = `${window.location.origin}/#design-excavator`;
    console.log('[BrandNavigator] Opening Design Excavator in new tab from Analyze Visual Identity.', {
      targetUrl,
      selectedBrands: normalizedBrands.map((brand) => brand.name),
    });

    const openedWindow = window.open(targetUrl, '_blank', 'noopener,noreferrer');
    if (!openedWindow) {
      console.warn('[BrandNavigator] Popup blocked while opening Design Excavator. Keeping user on current Brand Navigator tab.', {
        targetUrl,
      });
    }
  };
  const resolveBrandSectionId = (sectionKey: BrandResultSectionKey): string =>
    `brand-results-brand-${brandIndex}-section-${sectionKey}`;

  const handleBrandLogoError = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    const fallbackAttr = img.dataset.fallbackChain || '';
    const fallbacks = fallbackAttr.split('|').map((item) => item.trim()).filter(Boolean);
    if (fallbacks.length > 0) {
      const [next, ...rest] = fallbacks;
      img.src = next;
      img.dataset.fallbackChain = rest.join('|');
      logger.debug('[BrandNavigator] Retrying brand logo with fallback candidate.', {
        brandName,
        failedSrc: img.currentSrc || img.src,
        nextCandidate: next,
        remainingFallbacks: rest.length,
      });
      return;
    }
    logger.debug('[BrandNavigator] Exhausted brand logo fallback chain; reverting to placeholder.', {
      brandName,
      website: brandWebsiteForLogo,
    });
    setIsPrimaryLogoHidden(true);
  };

  return (
    <section
      id={sectionId}
      className="bg-zinc-50/60 p-6 rounded-3xl border border-zinc-200 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-shadow duration-300 w-full"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div data-testid={`brand-result-identity-${brandIndex}`} className="flex items-center gap-3 min-w-0">
          <span className="w-11 h-11 rounded-xl flex items-center justify-center overflow-hidden shrink-0 relative border border-zinc-200 bg-white">
            {!primaryBrandLogo && (
              <span data-testid={`brand-result-logo-placeholder-${brandIndex}`} className="text-zinc-400 font-semibold text-base">
                {brandName[0] || '?'}
              </span>
            )}
            {isPrimaryLogoHidden && (
              <span data-testid={`brand-result-logo-placeholder-${brandIndex}`} className="text-zinc-400 font-semibold text-base">
                {brandName[0] || '?'}
              </span>
            )}
            {primaryBrandLogo && !isPrimaryLogoHidden && (
              <img
                data-testid={`brand-result-logo-${brandIndex}`}
                src={primaryBrandLogo}
                alt={`${brandName} logo`}
                data-fallback-chain={brandLogoRemainingFallbacks.join('|')}
                className="w-full h-full object-contain p-1 absolute inset-0 z-10 bg-transparent"
                loading="eager"
                fetchPriority="high"
                decoding="async"
                onError={handleBrandLogoError}
              />
            )}
          </span>
          <h3 className="text-2xl font-bold text-zinc-900 truncate">{brandName}</h3>
        </div>
        <button
          type="button"
          onClick={handleAnalyzeVisualIdentities}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-indigo-200 bg-white text-indigo-700 text-sm font-medium hover:bg-indigo-50 transition-colors"
        >
          <Palette className="w-4 h-4" />
          Analyze Visual Identity
        </button>
      </div>

      <div
        data-testid="brand-result-sections-layout"
        className="columns-1 lg:columns-2 gap-6 text-sm text-zinc-700"
      >
        <BrandCriteriaSection sectionId={resolveBrandSectionId('highLevelSummary')} title="High-level summary" sectionKey="highLevelSummary" highlighted={highlightedSections.includes('highLevelSummary')} canCompareAcrossBrands={canCompareAcrossBrands} onRequestCompareAcrossBrands={onRequestCompareAcrossBrands} fullWidth showRefresh={isSectionMissing('highLevelSummary')} onRefresh={() => onRefreshSection('highLevelSummary')} isRefreshing={isRefreshing} refreshTestId={`brand-section-refresh-${brandIndex}-highLevelSummary`}>
          <BrandResultRichText value={brandResult.highLevelSummary} inferredEvidenceUrl={inferredEvidenceUrl} />
        </BrandCriteriaSection>

        <BrandCriteriaSection sectionId={resolveBrandSectionId('brandMission')} title="Brand mission" sectionKey="brandMission" highlighted={highlightedSections.includes('brandMission')} canCompareAcrossBrands={canCompareAcrossBrands} onRequestCompareAcrossBrands={onRequestCompareAcrossBrands} showRefresh={isSectionMissing('brandMission')} onRefresh={() => onRefreshSection('brandMission')} isRefreshing={isRefreshing} refreshTestId={`brand-section-refresh-${brandIndex}-brandMission`}>
          <BrandResultRichText value={brandResult.brandMission} inferredEvidenceUrl={inferredEvidenceUrl} />
        </BrandCriteriaSection>

        <BrandCriteriaSection sectionId={resolveBrandSectionId('brandPositioning')} title="Brand positioning" sectionKey="brandPositioning" highlighted={highlightedSections.includes('brandPositioning')} canCompareAcrossBrands={canCompareAcrossBrands} onRequestCompareAcrossBrands={onRequestCompareAcrossBrands} fullWidth showRefresh={isSectionMissing('brandPositioning')} onRefresh={() => onRefreshSection('brandPositioning')} isRefreshing={isRefreshing} refreshTestId={`brand-section-refresh-${brandIndex}-brandPositioning`}>
          <div className="space-y-2">
            <BrandResultLabeledBulletList label="Taglines" items={positioning.taglines || []} inferredEvidenceUrl={inferredEvidenceUrl} />
            <BrandResultLabeledBulletList label="Key messages and claims" items={positioning.keyMessagesAndClaims || []} inferredEvidenceUrl={inferredEvidenceUrl} />
            <BrandResultInlineField label="Value proposition" value={positioning.valueProposition} inferredEvidenceUrl={inferredEvidenceUrl} />
            <BrandResultInlineField label="Voice and tone" value={positioning.voiceAndTone} inferredEvidenceUrl={inferredEvidenceUrl} />
          </div>
        </BrandCriteriaSection>

        <BrandCriteriaSection sectionId={resolveBrandSectionId('keyOfferingsProductsServices')} title="Key offerings/products/services" sectionKey="keyOfferingsProductsServices" highlighted={highlightedSections.includes('keyOfferingsProductsServices')} canCompareAcrossBrands={canCompareAcrossBrands} onRequestCompareAcrossBrands={onRequestCompareAcrossBrands} showRefresh={isSectionMissing('keyOfferingsProductsServices')} onRefresh={() => onRefreshSection('keyOfferingsProductsServices')} isRefreshing={isRefreshing} refreshTestId={`brand-section-refresh-${brandIndex}-keyOfferingsProductsServices`}>
          <BrandResultBulletList items={brandResult.keyOfferingsProductsServices || []} inferredEvidenceUrl={inferredEvidenceUrl} />
        </BrandCriteriaSection>

        <BrandCriteriaSection sectionId={resolveBrandSectionId('strategicMoatsStrengths')} title="Strategic moats (strengths)" sectionKey="strategicMoatsStrengths" highlighted={highlightedSections.includes('strategicMoatsStrengths')} canCompareAcrossBrands={canCompareAcrossBrands} onRequestCompareAcrossBrands={onRequestCompareAcrossBrands} showRefresh={isSectionMissing('strategicMoatsStrengths')} onRefresh={() => onRefreshSection('strategicMoatsStrengths')} isRefreshing={isRefreshing} refreshTestId={`brand-section-refresh-${brandIndex}-strategicMoatsStrengths`}>
          <BrandResultBulletList items={brandResult.strategicMoatsStrengths || []} inferredEvidenceUrl={inferredEvidenceUrl} />
        </BrandCriteriaSection>

        <BrandCriteriaSection sectionId={resolveBrandSectionId('potentialThreatsWeaknesses')} title="Potential threats (weaknesses)" sectionKey="potentialThreatsWeaknesses" highlighted={highlightedSections.includes('potentialThreatsWeaknesses')} canCompareAcrossBrands={canCompareAcrossBrands} onRequestCompareAcrossBrands={onRequestCompareAcrossBrands} showRefresh={isSectionMissing('potentialThreatsWeaknesses')} onRefresh={() => onRefreshSection('potentialThreatsWeaknesses')} isRefreshing={isRefreshing} refreshTestId={`brand-section-refresh-${brandIndex}-potentialThreatsWeaknesses`}>
          <BrandResultBulletList items={brandResult.potentialThreatsWeaknesses || []} inferredEvidenceUrl={inferredEvidenceUrl} />
        </BrandCriteriaSection>

        <BrandCriteriaSection sectionId={resolveBrandSectionId('challenges')} title="Potential Challenges" sectionKey="challenges" highlighted={highlightedSections.includes('challenges')} canCompareAcrossBrands={canCompareAcrossBrands} onRequestCompareAcrossBrands={onRequestCompareAcrossBrands} showRefresh={isSectionMissing('challenges')} onRefresh={() => onRefreshSection('challenges')} isRefreshing={isRefreshing} refreshTestId={`brand-section-refresh-${brandIndex}-challenges`}>
          <BrandResultBulletList items={brandResult.challenges || []} inferredEvidenceUrl={inferredEvidenceUrl} />
        </BrandCriteriaSection>

        <BrandCriteriaSection sectionId={resolveBrandSectionId('targetAudiences')} title="Target audiences" sectionKey="targetAudiences" highlighted={highlightedSections.includes('targetAudiences')} canCompareAcrossBrands={canCompareAcrossBrands} onRequestCompareAcrossBrands={onRequestCompareAcrossBrands} fullWidth showRefresh={isSectionMissing('targetAudiences')} onRefresh={() => onRefreshSection('targetAudiences')} isRefreshing={isRefreshing} refreshTestId={`brand-section-refresh-${brandIndex}-targetAudiences`}>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
            {(brandResult.targetAudiences || []).map((aud, audIndex) => (
              <TargetAudienceCard
                key={`${brandName}-aud-${audIndex}`}
                audience={aud}
                brandName={brandName}
                brandIndex={brandIndex}
                audienceIndex={audIndex}
                onAudienceDeepDive={onAudienceDeepDive}
                inferredEvidenceUrl={inferredEvidenceUrl}
              />
            ))}
          </div>
        </BrandCriteriaSection>

        <BrandCriteriaSection sectionId={resolveBrandSectionId('recentCampaigns')} title="Recent campaigns" sectionKey="recentCampaigns" highlighted={highlightedSections.includes('recentCampaigns')} canCompareAcrossBrands={canCompareAcrossBrands} onRequestCompareAcrossBrands={onRequestCompareAcrossBrands} showRefresh={isSectionMissing('recentCampaigns')} onRefresh={() => onRefreshSection('recentCampaigns')} isRefreshing={isRefreshing} refreshTestId={`brand-section-refresh-${brandIndex}-recentCampaigns`}>
          <BrandResultBulletList items={brandResult.recentCampaigns || []} inferredEvidenceUrl={inferredEvidenceUrl} />
        </BrandCriteriaSection>

        <BrandCriteriaSection sectionId={resolveBrandSectionId('keyMarketingChannels')} title="Key marketing channels" sectionKey="keyMarketingChannels" highlighted={highlightedSections.includes('keyMarketingChannels')} canCompareAcrossBrands={canCompareAcrossBrands} onRequestCompareAcrossBrands={onRequestCompareAcrossBrands} showRefresh={isSectionMissing('keyMarketingChannels')} onRefresh={() => onRefreshSection('keyMarketingChannels')} isRefreshing={isRefreshing} refreshTestId={`brand-section-refresh-${brandIndex}-keyMarketingChannels`}>
          <BrandResultBulletList items={brandResult.keyMarketingChannels || []} inferredEvidenceUrl={inferredEvidenceUrl} />
        </BrandCriteriaSection>

        <BrandCriteriaSection sectionId={resolveBrandSectionId('socialMediaChannels')} title="Social media channels" sectionKey="socialMediaChannels" highlighted={highlightedSections.includes('socialMediaChannels')} canCompareAcrossBrands={canCompareAcrossBrands} onRequestCompareAcrossBrands={onRequestCompareAcrossBrands} showRefresh={isSectionMissing('socialMediaChannels')} onRefresh={() => onRefreshSection('socialMediaChannels')} isRefreshing={isRefreshing} refreshTestId={`brand-section-refresh-${brandIndex}-socialMediaChannels`}>
          <div className="flex flex-wrap gap-2">
            {sanitizedSocialChannels.map((channel, channelIndex) => (
              <a
                key={`${brandName}-social-${channelIndex}`}
                data-testid={`social-link-${brandIndex}-${channelIndex}`}
                href={toSafeExternalHref(channel.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-2.5 py-1 rounded-full transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                <span>{channel.channel || 'Social channel'}</span>
              </a>
            ))}
          </div>
        </BrandCriteriaSection>

        <BrandCriteriaSection sectionId={resolveBrandSectionId('recentNews')} title="Recent news" sectionKey="recentNews" highlighted={highlightedSections.includes('recentNews')} canCompareAcrossBrands={canCompareAcrossBrands} onRequestCompareAcrossBrands={onRequestCompareAcrossBrands} fullWidth showRefresh={isSectionMissing('recentNews')} onRefresh={() => onRefreshSection('recentNews')} isRefreshing={isRefreshing} refreshTestId={`brand-section-refresh-${brandIndex}-recentNews`}>
          <ul className="space-y-1">
            {displayNewsItems.length > 0 ? (
              displayNewsItems.map((item, idx) => (
                <li key={`${brandName}-news-${idx}`} className="text-zinc-700">
                  {item.url ? (
                    <a
                      data-testid={`news-link-${brandIndex}-${idx}`}
                      href={toSafeExternalHref(item.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-start gap-1.5 text-indigo-700 hover:text-indigo-900 hover:underline"
                    >
                      <ExternalLink className="w-3 h-3 mt-0.5 shrink-0" />
                      <span>
                        {item.headline}
                        {item.outlet ? (
                          <span className="ml-1 text-[11px] text-zinc-600">
                            {item.outlet}
                          </span>
                        ) : null}
                        {item.publishedAt ? (
                          <span className="ml-1 text-[11px] text-zinc-500">
                            ({new Date(item.publishedAt).toLocaleDateString()})
                          </span>
                        ) : null}
                      </span>
                    </a>
                  ) : (
                    <span>• {item.headline}</span>
                  )}
                </li>
              ))
            ) : (
              <li className="text-zinc-500">No recent coverage found from news outlets or brand press pages.</li>
            )}
          </ul>
        </BrandCriteriaSection>
      </div>
    </section>
  );
}

function TargetAudienceCard({
  audience,
  brandName,
  brandIndex,
  audienceIndex,
  onAudienceDeepDive,
  inferredEvidenceUrl,
}: {
  audience: BrandResultAudience;
  brandName: string;
  brandIndex: number;
  audienceIndex: number;
  onAudienceDeepDive: (audienceLabel: string, brandName: string) => void;
  inferredEvidenceUrl?: string;
}) {
  const audienceLabel = audience.audience || 'N/A';
  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5 shadow-[0_1px_6px_-3px_rgba(0,0,0,0.08)] h-fit self-start">
      <BrandResultInlineField label="Audience" value={audienceLabel} inferredEvidenceUrl={inferredEvidenceUrl} />
      <BrandResultInlineField label="Priority of audience" value={audience.priority} inferredEvidenceUrl={inferredEvidenceUrl} />
      <BrandResultInlineField label="Role to consumers" value={audience.inferredRoleToConsumers} inferredEvidenceUrl={inferredEvidenceUrl} />
      <BrandResultLabeledBulletList label="Functional benefits" items={audience.functionalBenefits || []} inferredEvidenceUrl={inferredEvidenceUrl} />
      <BrandResultLabeledBulletList label="Emotional benefits" items={audience.emotionalBenefits || []} inferredEvidenceUrl={inferredEvidenceUrl} />
      <button
        type="button"
        data-testid={`deep-dive-audience-${brandIndex}-${audienceIndex}`}
        onClick={() => onAudienceDeepDive(audienceLabel, brandName)}
        className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-100 text-zinc-700 text-xs font-medium hover:bg-indigo-400"
      >
        Analyze Audience
      </button>
    </div>
  );
}

function BrandCriteriaSection({
  sectionId,
  title,
  sectionKey,
  highlighted = false,
  canCompareAcrossBrands = false,
  onRequestCompareAcrossBrands,
  className = '',
  fullWidth = false,
  showRefresh = false,
  isRefreshing = false,
  onRefresh,
  refreshTestId,
  children,
}: {
  sectionId?: string;
  title: string;
  sectionKey?: BrandResultSectionKey;
  highlighted?: boolean;
  canCompareAcrossBrands?: boolean;
  onRequestCompareAcrossBrands?: (event: React.MouseEvent<HTMLElement>, section: BrandResultSectionKey) => void;
  className?: string;
  fullWidth?: boolean;
  showRefresh?: boolean;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  refreshTestId?: string;
  children: React.ReactNode;
}) {
  const sectionTestId = `brand-result-section-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
  const compareEnabled = canCompareAcrossBrands && Boolean(sectionKey) && Boolean(onRequestCompareAcrossBrands);
  const showExistingLabel = sectionKey === 'brandPositioning';
  return (
    <div
      id={sectionId}
      data-testid={sectionTestId}
      style={fullWidth ? { columnSpan: 'all' } : undefined}
      onClick={(event) => {
        if (!compareEnabled || !sectionKey || !onRequestCompareAcrossBrands) return;
        onRequestCompareAcrossBrands(event, sectionKey);
      }}
      className={`inline-block w-full mb-6 break-inside-avoid rounded-2xl border bg-zinc-50/80 p-6 shadow-[0_1px_6px_-3px_rgba(0,0,0,0.08)] h-fit self-start ${highlighted ? 'border-indigo-300 ring-2 ring-indigo-200/70' : 'border-zinc-200'} ${compareEnabled ? 'cursor-pointer hover:border-zinc-300' : 'cursor-default'} ${className}`.trim()}
    >
      <h4 className="text-sm font-semibold text-zinc-900 mb-3 uppercase tracking-wider inline-flex items-center gap-3">
        <span>{showExistingLabel ? `${title} (existing)` : title}</span>
        {showRefresh && onRefresh ? (
          <button
            type="button"
            data-testid={refreshTestId}
            onClick={(event) => {
              event.stopPropagation();
              onRefresh();
            }}
            className="relative z-10 pointer-events-auto inline-flex items-center justify-center p-1.5 text-zinc-400 hover:text-zinc-600 cursor-pointer focus:outline-none"
            title={`Refresh ${title}`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        ) : null}
        {compareEnabled ? (
          <span className="inline-flex items-center rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold text-indigo-700 normal-case tracking-normal">
            Compare
          </span>
        ) : null}
      </h4>
      {children}
    </div>
  );
}

function BrandResultInlineField({ label, value, inferredEvidenceUrl }: { label: string; value?: string | null; inferredEvidenceUrl?: string }) {
  const parsed = extractEvidenceTags(value || '');
  const displayValue = parsed.cleanText || 'N/A';
  return (
    <p>
      <span className="font-medium text-zinc-900">{label}:</span> {displayValue}
      {parsed.labels.map((tag) => renderEvidenceLabelChip(tag, `${label}-${tag}`, inferredEvidenceUrl, displayValue))}
    </p>
  );
}

function BrandResultRichText({ value, inferredEvidenceUrl }: { value?: string | null; inferredEvidenceUrl?: string }) {
  const parsed = extractEvidenceTags(value || '');
  const displayValue = parsed.cleanText || 'N/A';
  return (
    <p>
      {displayValue}
      {parsed.labels.map((tag) => renderEvidenceLabelChip(tag, `rich-${displayValue}-${tag}`, inferredEvidenceUrl, displayValue))}
    </p>
  );
}

function BrandResultBulletList({ items, inferredEvidenceUrl }: { items: string[]; inferredEvidenceUrl?: string }) {
  const INITIAL_SHOW = 4;
  const [isExpanded, setIsExpanded] = useState(false);
  const normalizedItems = (items || []).map((item) => (item || '').trim()).filter(Boolean);
  if (normalizedItems.length === 0) {
    return <p>N/A</p>;
  }

  const hasMoreItems = normalizedItems.length > INITIAL_SHOW;
  const visibleItems = isExpanded ? normalizedItems : normalizedItems.slice(0, INITIAL_SHOW);

  return (
    <>
      <ul className="list-disc pl-5 space-y-1">
        {visibleItems.map((item, index) => {
          const parsed = extractEvidenceTags(item);
          const displayValue = parsed.cleanText || 'N/A';
          return (
            <li key={`${item}-${index}`}>
              {displayValue}
              {parsed.labels.map((tag) => renderEvidenceLabelChip(tag, `${item}-${index}-${tag}`, inferredEvidenceUrl, displayValue))}
            </li>
          );
        })}
      </ul>
      {hasMoreItems ? (
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
        >
          <span>
            {isExpanded ? `Show less (${INITIAL_SHOW}/${normalizedItems.length})` : `Show all ${normalizedItems.length} items`}
          </span>
          <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </button>
      ) : null}
    </>
  );
}

function BrandResultLabeledBulletList({ label, items, inferredEvidenceUrl }: { label: string; items: string[]; inferredEvidenceUrl?: string }) {
  return (
    <div>
      <p className="font-medium text-zinc-900">{label}:</p>
      <BrandResultBulletList items={items} inferredEvidenceUrl={inferredEvidenceUrl} />
    </div>
  );
}
