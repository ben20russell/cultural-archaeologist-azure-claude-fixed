import { getUserTelemetry } from '../services/telemetry';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Loader2, Sparkles, FileText, Presentation, ExternalLink, Info, Tag, Users, Filter, ChevronDown, Check, Clock, Trash2, Target, Upload, X, RefreshCw, Palette, ArrowLeft } from 'lucide-react';
import { BrandResearchMatrix, UploadedFile } from '../services/azure-openai';
import { askBrandNavigatorQuestion, generateBrandResearchMatrix, suggestBrands } from '../services/azure-openai';
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
import {
  APP_RECENT_RESULTS_MODES,
  saveRecentResult,
  type RecentResultRecord,
} from '../services/recent-results-storage';

const BRAND_NAVIGATOR_TABLE = 'BrandNavigator';



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
  matrixMeta?: {
    audience: string;
    brand: string;
    generations: string[];
    topicFocus?: string;
    sourcesType?: string[];
    hasUploadedDocuments?: boolean;
  };
};

type BrandResultSectionKey =
  | 'highLevelSummary'
  | 'brandMission'
  | 'brandPositioning'
  | 'keyOfferingsProductsServices'
  | 'strategicMoatsStrengths'
  | 'potentialThreatsWeaknesses'
  | 'targetAudiences'
  | 'recentCampaigns'
  | 'keyMarketingChannels'
  | 'socialMediaChannels'
  | 'recentNews';

const BRAND_RESULT_SECTION_KEYS: BrandResultSectionKey[] = [
  'highLevelSummary',
  'brandMission',
  'brandPositioning',
  'keyOfferingsProductsServices',
  'strategicMoatsStrengths',
  'potentialThreatsWeaknesses',
  'targetAudiences',
  'recentCampaigns',
  'keyMarketingChannels',
  'socialMediaChannels',
  'recentNews',
];

const MAX_BRAND_INPUT_LENGTH = 120;
const MAX_AUDIENCE_INPUT_LENGTH = 180;
const MAX_TOPIC_INPUT_LENGTH = 180;

const GENERATIONS = [
  "Gen Alpha (2013–mid 2020s)",
  "Gen Z (1997–2012)",
  "Millennials (1981–1996)",
  "Gen X (1965–1980)",
  "Boomers (1946–1964)"
];

const SOURCES_TYPES = [
  "Mainstream",
  "Topic-Specific",
  "Alternative Media",
  "Niche/Fringe"
];

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
  // Instantly skip splash in test environments
  const [showSplash, setShowSplash] = useState(() => {
    if (isDirectBrandNavigatorRoute) {
      return false;
    }
    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test') {
      return false;
    }
    return true;
  });
  const [isSplashHeld, setIsSplashHeld] = useState(false);
  const [activeExperience, setActiveExperience] = useState<'research' | 'brand' | null>(
    isDirectBrandNavigatorRoute ? 'research' : null
  );
  const [hasOpenedBrand, setHasOpenedBrand] = useState(false);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [brandInput, setBrandInput] = useState('');
  const [audience, setAudience] = useState('');
  const [showValidation, setShowValidation] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [brandSuggestions, setBrandSuggestions] = useState<string[]>([]);
  const [isSuggestingBrands, setIsSuggestingBrands] = useState(false);
  
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
  const [matrixMeta, setMatrixMeta] = useState<{audience: string, brand: string, generations: string[], topicFocus?: string, sourcesType?: string[], hasUploadedDocuments?: boolean} | null>(null);
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
    setSelectedGenerations(sm.generations || []);
    setTopicFocus(sm.topicFocus || '');
    setSourcesType(sm.sourcesType || []);
    setMatrix(sm.matrix);
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
    // Instantly dismiss splash in test env
    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test') {
      setShowSplash(false);
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
  }, [showSplash, isSplashHeld]);

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
    return () => {
      Object.values(deleteTimeouts.current).forEach((timeoutId) => {
        clearTimeout(timeoutId as ReturnType<typeof setTimeout>);
      });
      deleteTimeouts.current = {};
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

  const handleReset = () => {
    setSelectedBrands([]);
    setBrandInput('');
    setAudience('');
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
  };

  const handleAskBrandQuestion = async () => {
    if (!matrix || !brandQuestion.trim() || isAskingBrandQuestion) return;

    setIsAskingBrandQuestion(true);
    try {
      const response = await runUserAction({
        actionName: 'brand-followup-question',
        action: async () => askBrandNavigatorQuestion(matrix, brandQuestion, {
          audience: matrixMeta?.audience || audience,
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
        website: '',
      }))
      .filter((brand) => brand.name.length > 0)
      .slice(0, 6);

    setShowValidation(true);
    if (brandsForGenerate.length === 0) return;
    const brandContext = brandsForGenerate.map((brand) => brand.name).join(', ');
    logger.info('Generating Brand Analysis', { audience, brands: brandsForGenerate, brandContext });

    setFakeProgress(5);
    setIsLoading(true);
    const searchStart = Date.now();
    setError(null);
    setSaveWarning(null);
    setShowValidation(false);
    const hasUploadedDocuments = files.length > 0;
    try {
      const result = await runUserAction({
        actionName: 'brand-generate-report',
        action: async () => generateBrandResearchMatrix(audience, brandsForGenerate, selectedGenerations, topicFocus, files, sourcesType),
        onError: (normalized) => {
          setError(normalized.message);
        },
      });
      const sanitizedResult = sanitizeBrandResearchMatrix(result);
      setMatrix(sanitizedResult);
      setMatrixMeta({ audience, brand: brandContext, generations: selectedGenerations, topicFocus, sourcesType, hasUploadedDocuments });
      const generatedRecentId = `generated:${brandContext.toLowerCase()}|${audience.toLowerCase()}|${topicFocus.toLowerCase()}`;
      const generatedRecentItem: BrandNavigatorRecentResult = {
        id: generatedRecentId,
        title: (brandContext || 'Generated Brand Analysis').trim(),
        description: `Audience: ${(audience || 'Not specified').trim()}`,
        matrix: sanitizedResult,
        matrixMeta: {
          audience,
          brand: brandContext,
          generations: selectedGenerations,
          topicFocus,
          sourcesType,
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
        const customName = buildBrandNavigatorCustomName(brandsForGenerate.map((brand) => brand.name), audience, topicFocus);
        const { error: saveError } = await supabase.from(BRAND_NAVIGATOR_TABLE).insert([
          {
            custom_name: customName,
            brand: brandContext || null,
            audience: audience || null,
            topic_focus: topicFocus || null,
            generations: selectedGenerations,
            sources_type: sourcesType,
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

      // Play chime sound using Web Audio API
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContext();
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gainNode = ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';

        osc1.frequency.setValueAtTime(1046.50, ctx.currentTime);
        osc2.frequency.setValueAtTime(1318.51, ctx.currentTime);

        gainNode.gain.setValueAtTime(0, ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2);

        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc1.start();
        osc2.start();
        osc1.stop(ctx.currentTime + 2);
        osc2.stop(ctx.currentTime + 2);
      } catch (e) {
        logger.warn('Failed to play sound', e);
      }

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
    targetAudiences: 'Target Audiences',
    recentCampaigns: 'Recent Campaigns',
    keyMarketingChannels: 'Key Marketing Channels',
    socialMediaChannels: 'Social Media Channels',
    recentNews: 'Recent News',
  };

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

  const exportToPPTX = () => {
    try {
      const pres = generatePPTX();
      if (!pres) throw new Error('No presentation generated');
      pres.writeFile({ fileName: `${matrixMeta?.audience.replace(/\s+/g, '_')}_Brand_Navigator.pptx` });
      setExportError(null);
    } catch (err) {
      logger.error('Failed to export PPTX', err);
      setExportError({ type: 'pptx', message: 'Failed to export PPTX. Please retry.' });
      setToast('Failed to export PPTX.');
    }
  };

  const exportToPDF = () => {
    if (!matrixMeta || brandResults.length === 0) return;
    
    setIsExporting(true);
    setToast("Generating PDF...");
    
    import('jspdf').then(({ jsPDF }) => {
      try {

        const doc = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4'
        });
        
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 20;
        const contentWidth = pageWidth - margin * 2;
        
        const addWrappedText = (text: string, x: number, y: number, fontSize: number, isBold: boolean = false, color: number[] = [0, 0, 0]) => {
          doc.setFontSize(fontSize);
          doc.setFont("helvetica", isBold ? "bold" : "normal");
          doc.setTextColor(color[0], color[1], color[2]);
          
          const lines = doc.splitTextToSize(text, contentWidth - (x - margin));
          const lineHeightMm = fontSize * 0.352778 * 1.5;
          
          for (let i = 0; i < lines.length; i++) {
            if (y > pageHeight - margin) {
              doc.addPage();
              y = margin + lineHeightMm;
              doc.setFontSize(fontSize);
              doc.setFont("helvetica", isBold ? "bold" : "normal");
              doc.setTextColor(color[0], color[1], color[2]);
            }
            doc.text(lines[i], x, y);
            y += lineHeightMm;
          }
          return y + 2;
        };
        
        // Title Page
        let y = margin + 10;
        y = addWrappedText("Brand Navigator Report", margin, y, 24, true, [24, 24, 27]);
        y += 10;
        
        y = addWrappedText(`Audience: ${matrixMeta.audience || 'N/A'}`, margin, y, 16, true, [79, 70, 229]);
        y += 5;
        
        if (matrixMeta.brand) {
          y = addWrappedText(`Brands: ${matrixMeta.brand}`, margin, y, 12, false, [82, 82, 91]);
        }
        if (matrixMeta.topicFocus) {
          y = addWrappedText(`Topic Focus: ${matrixMeta.topicFocus}`, margin, y, 12, false, [82, 82, 91]);
        }
        if (matrixMeta.generations && matrixMeta.generations.length > 0) {
          y = addWrappedText(`Generations: ${matrixMeta.generations.join(', ')}`, margin, y, 12, false, [82, 82, 91]);
        }
        
        brandResults.forEach((brand, brandIndex) => {
          doc.addPage();
          let currentY = margin + 5;
          const brandName = brand.brandName || `Brand ${brandIndex + 1}`;
          currentY = addWrappedText(brandName, margin, currentY, 18, true, [24, 24, 27]);
          currentY += 2;

          BRAND_RESULT_SECTION_KEYS.forEach((sectionKey) => {
            const title = sectionTitleMap[sectionKey];
            const lines = sectionLinesForBrand(brand, sectionKey);
            currentY = addWrappedText(title, margin, currentY, 11, true, [79, 70, 229]);
            lines.forEach((line) => {
              currentY = addWrappedText(`• ${line}`, margin + 3, currentY, 10, false, [63, 63, 70]);
            });
            currentY += 2;
          });
        });
        
        doc.save(`${matrixMeta?.audience.replace(/\s+/g, '_')}_Brand_Navigator.pdf`);
        setToast("PDF exported successfully!");
      } catch (err) {
        logger.error('Failed to generate PDF', err);
        setExportError({ type: 'pdf', message: 'Failed to generate PDF. Please retry.' });
        setToast("Failed to generate PDF.");
      } finally {
        setIsExporting(false);
      }
    });
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
          >
            <div className="absolute inset-0 z-0">
              <SplashGrid />
            </div>
            
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
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!showSplash && activeExperience === null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="fixed inset-0 z-[1] pointer-events-none overflow-hidden"
          >
            <div className="absolute inset-0">
              <SplashGrid />
            </div>
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
          <motion.section
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="max-w-3xl mx-auto text-center min-h-[78vh] flex flex-col"
          >
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 mb-3 mx-auto">
              <Sparkles className="w-5 h-5" />
            </div>
            <h1 className="text-lg md:text-xl font-semibold tracking-tight text-zinc-950 mb-4 select-none">
              Brand <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-fuchsia-500">Atlas</span>
            </h1>
            <div className="flex-1 flex flex-col justify-center">
              <h2 className="text-[1.91rem] md:text-[2.55rem] font-semibold tracking-tight text-zinc-900 mb-3">
                Choose Your Research Experience
              </h2>
              <p className="subheader-copy text-zinc-700 mb-10 text-lg md:text-xl font-medium">
                Start with a cultural deep dive or jump into a visual identity analysis.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                <button
                  onClick={() => setActiveExperience('research')}
                  className="text-left bg-white/90 border border-zinc-200/80 border-[1px] rounded-3xl p-6 hover:border-zinc-300 hover:shadow-sm transition-all h-full flex flex-col justify-start main-box-hover"
                >
                  <div className="inline-flex items-center gap-2 text-zinc-800 font-semibold mb-2 text-lg md:text-xl items-start">
                    <CompassRoseIcon className="w-4 h-4" /> Brand Navigator
                  </div>
                  <p className="subheader-copy text-base text-zinc-500">
                    Get up-to-speed with a brand or survey an entire competitive landscape.
                  </p>
                  <ul className="mt-3 space-y-1">
                    {['Brand audits', 'Competitive landscape analysis', 'Opportunity space identification', 'Creative briefs', 'Pitches'].map((item) => (
                      <li key={item} className="flex items-center gap-2 text-sm text-zinc-500">
                        <span className="w-1 h-1 rounded-full bg-zinc-500 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </button>
                <button
                  onClick={() => navigateToHashRoute('design-excavator')}
                  className="text-left bg-white/90 border border-zinc-200/80 border-[1px] rounded-3xl p-6 hover:border-zinc-300 hover:shadow-sm transition-all h-full flex flex-col justify-start main-box-hover"
                >
                  <div className="inline-flex items-center gap-2 text-zinc-800 font-semibold mb-2 text-lg md:text-xl items-start">
                    <Palette className="w-4 h-4" /> Design Excavator
                    <span className="align-super ml-3 inline-block px-2 py-1.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold tracking-wide border border-indigo-200">
                      Beta
                    </span>
                  </div>
                  <p className="subheader-copy text-base text-zinc-500">
                    Compare design systems across brands: logos, colors, typography, visual cues.
                  </p>
                  <ul className="mt-3 space-y-1">
                    {['Competitive research', 'Branding strategy development', 'Visual identity exploration', 'Creative briefs', 'Pitches'].map((item) => (
                      <li key={item} className="flex items-center gap-2 text-sm text-zinc-500">
                        <span className="w-1 h-1 rounded-full bg-zinc-500 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </button>
              </div>
            </div>
          </motion.section>
        )}

        {(activeExperience === 'brand' || hasOpenedBrand) && (
          <div className={activeExperience === 'brand' ? '' : 'hidden'}>
            <BrandDeepDivePage onBack={() => navigateToHomeDashboard()} />
          </div>
        )}

        {activeExperience === 'research' && (
          <>
            <div className="absolute top-4 left-4 right-4 z-50 no-print sm:top-6 sm:left-6 sm:right-auto">
              <button
                onClick={() => navigateToHomeDashboard()}
                className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400/40 focus:ring-offset-2 rounded-md"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Home
              </button>
            </div>
            {/* Top Navigation / Actions */}
            <div className="absolute top-20 right-4 z-50 no-print flex flex-col items-end gap-3 sm:top-6 sm:right-6 sm:flex-row sm:items-center sm:gap-2">
              <button
                onClick={() => navigateToHashRoute('cultural-archaeologist')}
                className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm border border-zinc-200 text-zinc-700 rounded-full font-medium hover:bg-zinc-50 hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-500/50 focus:ring-offset-1 transition-all shadow-sm text-sm"
              >
                <Search className="w-4 h-4" /> Cultural Archaeologist
              </button>
              <button
                onClick={() => navigateToHashRoute('design-excavator')}
                className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm border border-zinc-200 text-zinc-700 rounded-full font-medium hover:bg-zinc-50 hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-500/50 focus:ring-offset-1 transition-all shadow-sm text-sm"
              >
                <Palette className="w-4 h-4" /> Design Excavator
                <span className="align-super ml-3 inline-block px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold tracking-wide border border-indigo-200">
                  Beta
                </span>
              </button>
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm border border-zinc-200 text-zinc-700 rounded-full font-medium hover:bg-zinc-50 hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-500/50 focus:ring-offset-1 transition-all shadow-sm text-sm"
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

        <div className="flex flex-col items-center text-center mb-16 no-print pt-28 sm:pt-14">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
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
            className={`w-full max-w-4xl mt-10 relative flex flex-col gap-4 pb-24 sm:pb-0 ${isResearchControlsMinimized ? 'hidden' : ''}`}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              <div className="relative flex flex-col w-full self-start" ref={brandDropdownRef}>
                <div className={`relative flex items-center w-full h-14 bg-white border ${showValidation && normalizedBrands.length === 0 ? 'border-red-500 focus-within:ring-red-500/20 focus-within:border-red-500' : 'border-zinc-200 focus-within:ring-indigo-500/20 focus-within:border-indigo-500'} rounded-2xl text-zinc-900 focus-within:outline-none focus-within:ring-2 transition-all shadow-sm text-sm`}>
                  <Tag className="absolute left-4 top-4 w-5 h-5 text-zinc-400" />
                  <div className="w-full h-full pl-12 pr-12 py-0 flex items-center gap-2 flex-nowrap overflow-x-auto">
                    {normalizedBrands.map((brandChip, chipIndex) => (
                      <span
                        key={`${brandChip}-${chipIndex}`}
                        data-testid={`brand-chip-${chipIndex}`}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-zinc-100 text-zinc-800 border border-zinc-200 px-3 py-1 text-xs font-medium"
                      >
                        {brandChip}
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
                      className="flex-1 min-w-[140px] h-full py-0 bg-transparent text-zinc-900 placeholder-zinc-400 focus:outline-none"
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
                <div className="relative flex items-center w-full">
                  <Users className="absolute left-4 top-4 w-5 h-5 text-zinc-400" />
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
                    className="w-full h-14 pl-12 pr-12 py-0 bg-white border border-zinc-200 rounded-2xl text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm text-sm"
                    disabled={isLoading}
                  />
                  {isDetecting && !audience.trim() && (
                    <div className="absolute right-4 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                    </div>
                  )}
                </div>
              </div>

              <div className="relative flex items-center w-full self-start">
                <Target className="absolute left-4 top-4 w-5 h-5 text-zinc-400" />
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
                  className="w-full h-14 pl-12 pr-12 py-0 bg-white border border-zinc-200 rounded-2xl text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm text-sm"
                  disabled={isLoading}
                />
                {isDetecting && !topicFocus.trim() && (
                  <div className="absolute right-4 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                  </div>
                )}
              </div>
            </div>

            {/* Filters Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
              <div className="relative w-full" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsGenerationDropdownOpen(!isGenerationDropdownOpen)}
                  className="w-full flex items-center justify-between px-4 py-4 bg-white border border-zinc-200 rounded-2xl text-zinc-700 hover:bg-zinc-50 hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:ring-offset-1 transition-all shadow-sm text-sm"
                  disabled={isLoading}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <Filter className="w-5 h-5 text-zinc-400 shrink-0" />
                    <span className="truncate">
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
              </div>

              <div className="relative w-full" ref={sourcesDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsSourcesDropdownOpen(!isSourcesDropdownOpen)}
                  className="w-full flex items-center justify-between px-4 py-4 bg-white border border-zinc-200 rounded-2xl text-zinc-700 hover:bg-zinc-50 hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:ring-offset-1 transition-all shadow-sm text-sm"
                  disabled={isLoading}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <FileText className="w-5 h-5 text-zinc-400 shrink-0" />
                    <span className="truncate">
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
              </div>

              {/* File Upload */}
              <div className="w-full">
                <input
                  type="file"
                  multiple
                  accept=".pdf,.txt,.docx,.csv,.pptx,.key"
                  onChange={handleFileChange}
                  className="hidden"
                  ref={fileInputRef}
                  disabled={isLoading}
                />
                <button
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

            <button
              type="submit"
              disabled={isLoading}
              className="w-[288px] mx-auto px-4 py-4 bg-zinc-900 text-white rounded-2xl font-medium hover:bg-zinc-800 hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-zinc-900/50 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none transition-all flex items-center justify-center gap-2 text-sm mt-2 select-none relative overflow-hidden"
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

            <p className="subheader-copy text-xs text-zinc-400 text-center mt-2">
              AI models can make mistakes. Always double check your work. Remember to think critically.
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
                  setMatrix(item.matrix);
                  setMatrixMeta(item.matrixMeta);
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

              {isBrandResultsMode && (
                <div className="mb-10 bg-indigo-50 rounded-3xl p-6 md:p-8 border border-indigo-100 shadow-sm no-print">
                  <h3 className="text-xl font-bold text-indigo-900 mb-4 flex items-center gap-2">
                    <Search className="w-6 h-6" /> Ask Brand Navigator
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
                    highlightedSections={highlightedBrandSections}
                    sectionTitleMap={sectionTitleMap}
                    sectionLinesForBrand={sectionLinesForBrand}
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
                      <li key={idx} className="text-sm">
                        <a 
                          href={toSafeExternalHref(source.url)} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-800 hover:underline flex items-start gap-2"
                        >
                          <span className="text-zinc-400 mt-0.5">[{idx + 1}]</span>
                          <span>{source.title}</span>
                        </a>
                      </li>
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
                  setMatrix(item.matrix);
                  setMatrixMeta(item.matrixMeta);
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

      <footer className="relative z-10 py-6 text-center no-print">
        <p className="copyright-copy text-[10px] text-zinc-400 mt-1">© 2026 Brand Atlas by The Kapalaran Group LLC | All rights reserved | <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-zinc-500">Privacy Policy</a></p>
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
  brandMission?: string;
  brandPositioning?: {
    taglines?: string[];
    keyMessagesAndClaims?: string[];
    valueProposition?: string;
    voiceAndTone?: string;
  };
  keyOfferingsProductsServices?: string[];
  strategicMoatsStrengths?: string[];
  potentialThreatsWeaknesses?: string[];
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

const sanitizeBrandResearchMatrix = (rawMatrix: BrandResearchMatrix): BrandResearchMatrix => {
  const sanitizedResults = (rawMatrix.results || []).map((result, index) => {
    const brandName = result.brandName || `Brand ${index + 1}`;
    const sanitizedChannels = sanitizeSocialChannels(result.socialMediaChannels, brandName);

    logger.debug('[BrandNavigator] Sanitized social channels while loading results.', {
      brandName,
      beforeCount: (result.socialMediaChannels || []).length,
      afterCount: sanitizedChannels.length,
    });

    return {
      ...result,
      socialMediaChannels: sanitizedChannels,
    };
  });

  return {
    ...rawMatrix,
    results: sanitizedResults,
  };
};

function BrandResultsGrid({
  results,
  highlightedSections,
  sectionTitleMap,
  sectionLinesForBrand,
  onAudienceDeepDive,
}: {
  results: BrandResultEntry[];
  highlightedSections: BrandResultSectionKey[];
  sectionTitleMap: Record<BrandResultSectionKey, string>;
  sectionLinesForBrand: (brand: BrandResultEntry, key: BrandResultSectionKey) => string[];
  onAudienceDeepDive: (audienceLabel: string, brandName: string) => void;
}) {
  const isMultiBrandCompareEnabled = results.length > 1;
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
          brandResult={brandResult}
          brandIndex={brandIndex}
          highlightedSections={highlightedSections}
          canCompareAcrossBrands={isMultiBrandCompareEnabled}
          onRequestCompareAcrossBrands={openComparePopup}
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
  brandResult,
  brandIndex,
  highlightedSections,
  canCompareAcrossBrands,
  onRequestCompareAcrossBrands,
  onAudienceDeepDive,
}: {
  brandResult: BrandResultEntry;
  brandIndex: number;
  highlightedSections: BrandResultSectionKey[];
  canCompareAcrossBrands: boolean;
  onRequestCompareAcrossBrands: (event: React.MouseEvent<HTMLElement>, section: BrandResultSectionKey) => void;
  onAudienceDeepDive: (audienceLabel: string, brandName: string) => void;
}) {
  const brandName = brandResult.brandName || `Brand ${brandIndex + 1}`;
  const positioning = brandResult.brandPositioning || {};
  const sanitizedSocialChannels = sanitizeSocialChannels(brandResult.socialMediaChannels, brandName);
  const recentNewsItems = buildRecentHeadlines(brandResult);
  const fallbackPressRelease = recentNewsItems.length === 0
    ? pickBrandPressReleaseFallback(brandResult, brandName)
    : null;
  const displayNewsItems = fallbackPressRelease ? [fallbackPressRelease] : recentNewsItems;

  logger.debug('[BrandNavigator] Rendering brand result card with validated links.', {
    brandName,
    socialMediaBefore: (brandResult.socialMediaChannels || []).length,
    socialMediaAfter: sanitizedSocialChannels.length,
    recentHeadlinesCount: recentNewsItems.length,
    fallbackPressReleaseUsed: Boolean(fallbackPressRelease),
  });

  return (
    <section className="bg-zinc-50/60 p-6 rounded-3xl border border-zinc-200 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-shadow duration-300 w-full">
      <h3 className="text-2xl font-bold text-zinc-900 mb-3">{brandName}</h3>

      <div
        data-testid="brand-result-sections-layout"
        className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-sm text-zinc-700"
      >
        <BrandCriteriaSection title="High-level summary" sectionKey="highLevelSummary" highlighted={highlightedSections.includes('highLevelSummary')} canCompareAcrossBrands={canCompareAcrossBrands} onRequestCompareAcrossBrands={onRequestCompareAcrossBrands} className="lg:col-span-2">
          <p>{brandResult.highLevelSummary || 'N/A'}</p>
        </BrandCriteriaSection>

        <BrandCriteriaSection title="Brand mission" sectionKey="brandMission" highlighted={highlightedSections.includes('brandMission')} canCompareAcrossBrands={canCompareAcrossBrands} onRequestCompareAcrossBrands={onRequestCompareAcrossBrands}>
          <p>{brandResult.brandMission || 'N/A'}</p>
        </BrandCriteriaSection>

        <BrandCriteriaSection title="Brand positioning" sectionKey="brandPositioning" highlighted={highlightedSections.includes('brandPositioning')} canCompareAcrossBrands={canCompareAcrossBrands} onRequestCompareAcrossBrands={onRequestCompareAcrossBrands} className="lg:col-span-2">
          <div className="space-y-2">
            <BrandResultLabeledBulletList label="Taglines" items={positioning.taglines || []} />
            <BrandResultLabeledBulletList label="Key messages and claims" items={positioning.keyMessagesAndClaims || []} />
            <BrandResultInlineField label="Value proposition" value={positioning.valueProposition} />
            <BrandResultInlineField label="Voice and tone" value={positioning.voiceAndTone} />
          </div>
        </BrandCriteriaSection>

        <BrandCriteriaSection title="Key offerings/products/services" sectionKey="keyOfferingsProductsServices" highlighted={highlightedSections.includes('keyOfferingsProductsServices')} canCompareAcrossBrands={canCompareAcrossBrands} onRequestCompareAcrossBrands={onRequestCompareAcrossBrands}>
          <BrandResultBulletList items={brandResult.keyOfferingsProductsServices || []} />
        </BrandCriteriaSection>

        <BrandCriteriaSection title="Strategic moats (strengths)" sectionKey="strategicMoatsStrengths" highlighted={highlightedSections.includes('strategicMoatsStrengths')} canCompareAcrossBrands={canCompareAcrossBrands} onRequestCompareAcrossBrands={onRequestCompareAcrossBrands}>
          <BrandResultBulletList items={brandResult.strategicMoatsStrengths || []} />
        </BrandCriteriaSection>

        <BrandCriteriaSection title="Potential threats (weaknesses)" sectionKey="potentialThreatsWeaknesses" highlighted={highlightedSections.includes('potentialThreatsWeaknesses')} canCompareAcrossBrands={canCompareAcrossBrands} onRequestCompareAcrossBrands={onRequestCompareAcrossBrands}>
          <BrandResultBulletList items={brandResult.potentialThreatsWeaknesses || []} />
        </BrandCriteriaSection>

        <BrandCriteriaSection title="Target audiences" sectionKey="targetAudiences" highlighted={highlightedSections.includes('targetAudiences')} canCompareAcrossBrands={canCompareAcrossBrands} onRequestCompareAcrossBrands={onRequestCompareAcrossBrands} className="lg:col-span-2">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
            {(brandResult.targetAudiences || []).map((aud, audIndex) => (
              <TargetAudienceCard
                key={`${brandName}-aud-${audIndex}`}
                audience={aud}
                brandName={brandName}
                brandIndex={brandIndex}
                audienceIndex={audIndex}
                onAudienceDeepDive={onAudienceDeepDive}
              />
            ))}
          </div>
        </BrandCriteriaSection>

        <BrandCriteriaSection title="Recent campaigns" sectionKey="recentCampaigns" highlighted={highlightedSections.includes('recentCampaigns')} canCompareAcrossBrands={canCompareAcrossBrands} onRequestCompareAcrossBrands={onRequestCompareAcrossBrands}>
          <BrandResultBulletList items={brandResult.recentCampaigns || []} />
        </BrandCriteriaSection>

        <BrandCriteriaSection title="Key marketing channels" sectionKey="keyMarketingChannels" highlighted={highlightedSections.includes('keyMarketingChannels')} canCompareAcrossBrands={canCompareAcrossBrands} onRequestCompareAcrossBrands={onRequestCompareAcrossBrands}>
          <BrandResultBulletList items={brandResult.keyMarketingChannels || []} />
        </BrandCriteriaSection>

        <BrandCriteriaSection title="Social media channels" sectionKey="socialMediaChannels" highlighted={highlightedSections.includes('socialMediaChannels')} canCompareAcrossBrands={canCompareAcrossBrands} onRequestCompareAcrossBrands={onRequestCompareAcrossBrands}>
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

        <BrandCriteriaSection title="Recent news" sectionKey="recentNews" highlighted={highlightedSections.includes('recentNews')} canCompareAcrossBrands={canCompareAcrossBrands} onRequestCompareAcrossBrands={onRequestCompareAcrossBrands} className="lg:col-span-2">
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
}: {
  audience: BrandResultAudience;
  brandName: string;
  brandIndex: number;
  audienceIndex: number;
  onAudienceDeepDive: (audienceLabel: string, brandName: string) => void;
}) {
  const audienceLabel = audience.audience || 'N/A';
  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5 shadow-[0_1px_6px_-3px_rgba(0,0,0,0.08)] h-fit self-start">
      <BrandResultInlineField label="Audience" value={audienceLabel} />
      <BrandResultInlineField label="Priority of audience" value={audience.priority} />
      <BrandResultInlineField label="Role to consumers" value={audience.inferredRoleToConsumers} />
      <BrandResultLabeledBulletList label="Functional benefits" items={audience.functionalBenefits || []} />
      <BrandResultLabeledBulletList label="Emotional benefits" items={audience.emotionalBenefits || []} />
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
  title,
  sectionKey,
  highlighted = false,
  canCompareAcrossBrands = false,
  onRequestCompareAcrossBrands,
  className = '',
  children,
}: {
  title: string;
  sectionKey?: BrandResultSectionKey;
  highlighted?: boolean;
  canCompareAcrossBrands?: boolean;
  onRequestCompareAcrossBrands?: (event: React.MouseEvent<HTMLElement>, section: BrandResultSectionKey) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const sectionTestId = `brand-result-section-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
  const compareEnabled = canCompareAcrossBrands && Boolean(sectionKey) && Boolean(onRequestCompareAcrossBrands);
  return (
    <div
      data-testid={sectionTestId}
      onClick={(event) => {
        if (!compareEnabled || !sectionKey || !onRequestCompareAcrossBrands) return;
        onRequestCompareAcrossBrands(event, sectionKey);
      }}
      className={`rounded-2xl border bg-zinc-50/80 p-6 shadow-[0_1px_6px_-3px_rgba(0,0,0,0.08)] h-fit self-start ${highlighted ? 'border-indigo-300 ring-2 ring-indigo-200/70' : 'border-zinc-200'} ${compareEnabled ? 'cursor-pointer hover:border-zinc-300' : ''} ${className}`.trim()}
    >
      <h4 className="text-sm font-semibold text-zinc-900 mb-3 uppercase tracking-wider inline-flex items-center gap-3">
        <span>{title}</span>
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

function BrandResultInlineField({ label, value }: { label: string; value?: string }) {
  return (
    <p>
      <span className="font-medium text-zinc-900">{label}:</span> {value || 'N/A'}
    </p>
  );
}

function BrandResultBulletList({ items }: { items: string[] }) {
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
        {visibleItems.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
      {hasMoreItems ? (
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
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

function BrandResultLabeledBulletList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="font-medium text-zinc-900">{label}:</p>
      <BrandResultBulletList items={items} />
    </div>
  );
}
