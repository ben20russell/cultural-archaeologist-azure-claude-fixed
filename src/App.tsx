/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { Search, Loader2, Sparkles, FileText, Presentation, ExternalLink, Info, Tag, Users, Filter, ChevronDown, Check, Clock, Trash2, Target, Upload, X, RefreshCw, Calendar, Activity } from 'lucide-react';
import { CulturalMatrix, MatrixItem, UploadedFile, DeepDiveReport } from './services/azure-openai';
import { generateCulturalMatrix, autoPopulateFields, suggestBrands, askMatrixQuestion, generateDeepDive, generateDeepDivesBatch } from './services/azure-openai';
import { SplashGrid } from './components/SplashGrid';
import { BrandDeepDivePage } from './components/VisualDesignExcavator';
import AdminDashboard from './components/AdminDashboard';
  // --- ADMIN DASHBOARD STATE ---
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);
  const [adminVisualRecord, setAdminVisualRecord] = useState<any>(null);
  const [adminCulturalRecord, setAdminCulturalRecord] = useState<any>(null);

  // Check for admin route on mount
  useEffect(() => {
    const isAdminRoute = new URLSearchParams(window.location.search).get('admin') === 'true';
    setShowAdminDashboard(isAdminRoute);
  }, []);



  // --- ADMIN: Password Auth ---
  const [adminPass, setAdminPass] = useState('');
  const [adminError, setAdminError] = useState<string | null>(null);
  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // @ts-ignore
    const passphrase = (import.meta.env.VITE_ADMIN_PASSPHRASE as string | undefined) || '';
    if (adminPass === passphrase) {
      setIsAdminAuthenticated(true);
      setAdminError(null);
    } else {
      setAdminError('Incorrect passphrase.');
    }
  };
import { TrendLifecycleBadge } from './components/TrendLifecycleBadge';
import { ProgressiveLoader } from './components/ProgressiveLoader';
import { Accordion } from './components/Accordion';
import { FeedbackChatWidget } from './components/FeedbackChatWidget';
import pptxgen from 'pptxgenjs';
import { supabase } from './services/supabase-client';

// Removed Google Slides export and Google Auth modal (Supabase-only)

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
  matrix: CulturalMatrix;
}

interface MatrixContext {
  audience: string;
  brand: string;
  generations: string[];
  topicFocus?: string;
}

interface OAuthTokenResponse {
  access_token: string;
  error?: string;
}

type MatrixInsightKey =
  | 'moments'
  | 'beliefs'
  | 'tone'
  | 'language'
  | 'behaviors'
  | 'contradictions'
  | 'community'
  | 'influencers';

type ConfidenceLevelFilter = 'low' | 'medium' | 'high';
type EvidenceLabelFilter = 'known' | 'inferred' | 'speculative';
type EvidenceTagLabel = EvidenceLabelFilter | 'analogy';
type TrendStageFilter = 'emerging' | 'peaking' | 'declining';

const MATRIX_INSIGHT_KEYS: MatrixInsightKey[] = [
  'moments',
  'beliefs',
  'tone',
  'language',
  'behaviors',
  'contradictions',
  'community',
  'influencers',
];

const CONFIDENCE_FILTERS: ConfidenceLevelFilter[] = ['high', 'medium', 'low'];
const EVIDENCE_FILTERS: EvidenceLabelFilter[] = ['known', 'inferred', 'speculative'];
const TREND_STAGE_FILTERS: TrendStageFilter[] = ['peaking', 'emerging', 'declining'];

const normalizeTrendStage = (stage?: string): TrendStageFilter => {
  if (stage === 'peaking' || stage === 'declining') {
    return stage;
  }
  return 'emerging';
};

const extractEvidenceLabelsFromText = (text: string): EvidenceLabelFilter[] => {
  const labels = new Set<EvidenceLabelFilter>();

  if (/\[KNOWN\]|\bKNOWN\b\s*[:\-]?/i.test(text)) labels.add('known');
  if (/\[INFERRED?\]|\bINFERRED?\b\s*[:\-]?/i.test(text)) labels.add('inferred');
  if (/\[SPECULATIVE\]|\bSPECULATIVE\b\s*[:\-]?/i.test(text)) labels.add('speculative');

  return Array.from(labels);
};

const normalizeSourceTypeValue = (value?: string): string => {
  return (value || '').trim().toLowerCase();
};

const mapInsightSourceToSearchSource = (sourceType?: string): string | null => {
  const normalized = normalizeSourceTypeValue(sourceType);
  if (!normalized) return null;

  if (normalized.includes('topic') || normalized.includes('specific')) return 'Topic-Specific';
  if (normalized.includes('alternative')) return 'Alternative Media';
  if (normalized.includes('niche') || normalized.includes('fringe') || normalized.includes('community')) return 'Niche/Fringe';
  if (normalized.includes('mainstream') || normalized.includes('authoritative') || normalized.includes('behavioral')) return 'Mainstream';

  return null;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const stripDemographicEvidenceMarkers = (value: string): string => {
  if (!value) return '';

  return value
    .replace(/\[(KNOWN|INFERRED|INFERED|SPECULATIVE)\]\s*/gi, '')
    .replace(/\b(KNOWN|INFERRED|INFERED|SPECULATIVE)\b\s*[:\-]?\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

const extractEvidenceTags = (value: string): { cleanText: string; labels: EvidenceTagLabel[] } => {
  if (!value) {
    return { cleanText: '', labels: [] };
  }

  const labels: EvidenceTagLabel[] = [];
  const markerPattern = /\[(KNOWN|INFERRED|INFERED|SPECULATIVE|ANALOGY)\]|\b(KNOWN|INFERRED|INFERED|SPECULATIVE|ANALOGY)\b(?=\s*[:\-]|\s*$|\.)/g;
  let match: RegExpExecArray | null = markerPattern.exec(value);

  while (match) {
    const rawLabel = (match[1] || match[2] || '').toLowerCase();
    const normalizedLabel: EvidenceTagLabel = rawLabel === 'infered' ? 'inferred' : (rawLabel as EvidenceTagLabel);
    if (!labels.includes(normalizedLabel)) {
      labels.push(normalizedLabel);
    }
    match = markerPattern.exec(value);
  }

  const cleanText = value
    .replace(/\[(KNOWN|INFERRED|INFERED|SPECULATIVE|ANALOGY)\]\s*/gi, '')
    .replace(/\b(KNOWN|INFERRED|INFERED|SPECULATIVE|ANALOGY)\b\s*[:\-]\s*/gi, '')
    .replace(/\.(KNOWN|INFERRED|INFERED|SPECULATIVE|ANALOGY)\s*$/i, '.')
    .replace(/\s+(KNOWN|INFERRED|INFERED|SPECULATIVE|ANALOGY)\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return { cleanText, labels };
};

type AskAnswerSection = {
  title?: string;
  text: string;
  labels: EvidenceTagLabel[];
};

const structureAskAnswer = (value: string): AskAnswerSection[] => {
  if (!value || !value.trim()) {
    return [];
  }

  const normalized = value.replace(/\r\n/g, '\n').trim();
  const byOptions = normalized
    .split(/(?=\bOption\s+\d+\s*:)/gi)
    .map((part) => part.trim())
    .filter(Boolean);

  const baseChunks = byOptions.length > 1 ? byOptions : normalized.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);

  return baseChunks.map((chunk) => {
    const optionMatch = chunk.match(/^(Option\s+\d+)\s*:\s*(.*)$/is);
    if (optionMatch) {
      const parsed = extractEvidenceTags(optionMatch[2].trim());
      return {
        title: optionMatch[1],
        text: parsed.cleanText,
        labels: parsed.labels,
      };
    }

    const parsed = extractEvidenceTags(chunk);
    return {
      text: parsed.cleanText,
      labels: parsed.labels,
    };
  });
};

const evidenceLabelChipClass = (label: EvidenceTagLabel): string => {
  if (label === 'analogy') {
    return 'bg-zinc-100 text-zinc-600 border border-zinc-200';
  }
  return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
};

const sanitizeDemographics = (demographics: { age: string; race: string; gender: string }) => ({
  age: stripDemographicEvidenceMarkers(demographics.age),
  race: stripDemographicEvidenceMarkers(demographics.race),
  gender: stripDemographicEvidenceMarkers(demographics.gender),
});

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

const SAVED_MATRICES_STORAGE_KEY = 'cultural_matrices';

const readSavedMatrices = (): SavedMatrix[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const saved = window.localStorage.getItem(SAVED_MATRICES_STORAGE_KEY);
    if (!saved) {
      return [];
    }

    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Failed to read saved matrices from local storage:', error);
    return [];
  }
};

const persistSavedMatrices = (matrices: SavedMatrix[]): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    window.localStorage.setItem(SAVED_MATRICES_STORAGE_KEY, JSON.stringify(matrices));
    return true;
  } catch (error) {
    console.warn('Failed to persist saved matrices to local storage:', error);
    return false;
  }
};

export default function App() {
  const SPLASH_DURATION_MS = 3000;
  const [showSplash, setShowSplash] = useState(true);
  const [isSplashHeld, setIsSplashHeld] = useState(false);
  const [activeExperience, setActiveExperience] = useState<'research' | 'brand' | null>(null);
  const [hasOpenedBrand, setHasOpenedBrand] = useState(false);
  const [brand, setBrand] = useState('');
  const [audience, setAudience] = useState('');
  const [showValidation, setShowValidation] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [brandSuggestions, setBrandSuggestions] = useState<string[]>([]);
  const [isSuggestingBrands, setIsSuggestingBrands] = useState(false);
  const [hasQuotaError, setHasQuotaError] = useState(false);
  
  const [selectedGenerations, setSelectedGenerations] = useState<string[]>([]);
  const [isGenerationDropdownOpen, setIsGenerationDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const [topicFocus, setTopicFocus] = useState('');
  const [sourcesType, setSourcesType] = useState<string[]>([]);
  const [isSourcesDropdownOpen, setIsSourcesDropdownOpen] = useState(false);
  const sourcesDropdownRef = useRef<HTMLDivElement>(null);
  
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [matrixQuestion, setMatrixQuestion] = useState('');
  const [matrixAnswer, setMatrixAnswer] = useState('');
  const [isAskingQuestion, setIsAskingQuestion] = useState(false);
  const [highlightedInsights, setHighlightedInsights] = useState<string[]>([]);
  
  const [deepDiveInsight, setDeepDiveInsight] = useState<MatrixItem | null>(null);
  const [deepDiveResult, setDeepDiveResult] = useState<DeepDiveReport | null>(null);
  const [isDeepDiveLoading, setIsDeepDiveLoading] = useState(false);
  const [isVocabularyOpen, setIsVocabularyOpen] = useState(false);
  
  const [savedMatrices, setSavedMatrices] = useState<SavedMatrix[]>([]);
  const [isBrandDropdownOpen, setIsBrandDropdownOpen] = useState(false);
  const brandDropdownRef = useRef<HTMLDivElement>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [fakeProgress, setFakeProgress] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [showGoogleAuthModal, setShowGoogleAuthModal] = useState(false);
  const [matrix, setMatrix] = useState<CulturalMatrix | null>(null);
  const [matrixMeta, setMatrixMeta] = useState<{audience: string, brand: string, generations: string[], topicFocus?: string, sourcesType?: string[], hasUploadedDocuments?: boolean} | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [isGeneratingDeepDives, setIsGeneratingDeepDives] = useState(false);
  const [deepDiveProgress, setDeepDiveProgress] = useState({ current: 0, total: 0 });

  const [selectedConfidenceFilters, setSelectedConfidenceFilters] = useState<ConfidenceLevelFilter[]>([]);
  const [selectedEvidenceFilters, setSelectedEvidenceFilters] = useState<EvidenceLabelFilter[]>([]);
  const [selectedTrendStageFilters, setSelectedTrendStageFilters] = useState<TrendStageFilter[]>([]);
  const [selectedSourceFilters, setSelectedSourceFilters] = useState<string[]>([]);
  const [isResearchControlsMinimized, setIsResearchControlsMinimized] = useState(false);

  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const deleteTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [undoToast, setUndoToast] = useState<{ id: string, message: string } | null>(null);
  
  const visibleSavedMatrices = useMemo(() => {
    return savedMatrices.filter(sm => !deletingIds.includes(sm.id));
  }, [savedMatrices, deletingIds]);

  const filteredSavedMatrices = useMemo(() => {
    const search = brand.trim().toLowerCase();
    if (!search) {
      return visibleSavedMatrices;
    }

    return visibleSavedMatrices.filter(
      (sm) =>
        sm.brand.toLowerCase().includes(search) ||
        sm.audience.toLowerCase().includes(search)
    );
  }, [brand, visibleSavedMatrices]);

  const filteredMatrix = useMemo(() => {
    if (!matrix) {
      return null;
    }

    const itemMatchesFilters = (item: MatrixItem): boolean => {
      if (selectedConfidenceFilters.length > 0) {
        const confidence = (item.confidenceLevel || 'medium') as ConfidenceLevelFilter;
        if (!selectedConfidenceFilters.includes(confidence)) {
          return false;
        }
      }

      if (selectedEvidenceFilters.length > 0) {
        const labels = extractEvidenceLabelsFromText(item.text);
        const hasMatch = labels.some((label) => selectedEvidenceFilters.includes(label));
        if (!hasMatch) {
          return false;
        }
      }

      if (selectedTrendStageFilters.length > 0) {
        const stage = normalizeTrendStage(item.trendLifecycle);
        if (!selectedTrendStageFilters.includes(stage)) {
          return false;
        }
      }

      if (selectedSourceFilters.length > 0) {
        const mappedSource = mapInsightSourceToSearchSource(item.sourceType);
        const hasSourceMatch = mappedSource !== null && selectedSourceFilters.includes(mappedSource);

        if (!hasSourceMatch) {
          return false;
        }
      }

      return true;
    };

    const nextMatrix: CulturalMatrix = { ...matrix };
    MATRIX_INSIGHT_KEYS.forEach((key) => {
      nextMatrix[key] = (matrix[key] || []).filter(itemMatchesFilters);
    });

    return nextMatrix;
  }, [matrix, selectedConfidenceFilters, selectedEvidenceFilters, selectedTrendStageFilters, selectedSourceFilters]);

  const sourceFilterOptions = useMemo(() => {
    const configuredSources = (matrixMeta?.sourcesType || [])
      .filter((source): source is string => typeof source === 'string' && source.trim().length > 0)
      .map((source) => source.trim());

    if (configuredSources.length > 0) {
      return Array.from(new Set(configuredSources));
    }

    return SOURCES_TYPES;
  }, [matrixMeta]);

  const activeFilterCount =
    selectedConfidenceFilters.length +
    selectedEvidenceFilters.length +
    selectedTrendStageFilters.length +
    selectedSourceFilters.length;
  const displayMatrix = filteredMatrix || matrix;
  const hasVisibleInsights =
    !!displayMatrix && MATRIX_INSIGHT_KEYS.some((key) => (displayMatrix[key] || []).length > 0);
  const structuredMatrixAnswer = useMemo(() => structureAskAnswer(matrixAnswer), [matrixAnswer]);

  const loadSavedMatrix = (sm: SavedMatrix, shouldScroll = false) => {
    setBrand(sm.brand);
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

    if (shouldScroll) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const deepDiveDragControls = useDragControls();
  const reportRef = useRef<HTMLDivElement>(null);
  const splashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const splashStartedAtRef = useRef<number | null>(null);
  const splashRemainingMsRef = useRef<number>(SPLASH_DURATION_MS);

  useEffect(() => {
    if (activeExperience === 'brand') {
      setHasOpenedBrand(true);
    }
  }, [activeExperience]);

  // Auto-hide splash screen after 3 seconds, with press-and-hold pause.
  useEffect(() => {
    if (!showSplash) {
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
        .from('searches')
        .select('*')
        .order('createdAt', { ascending: false })
        .limit(20);
      if (!error) setSavedMatrices(data || []);
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

  // Auto-detect missing fields based on provided fields
  useEffect(() => {
    if (hasQuotaError) return;

    const hasBrand = !!brand.trim();
    const hasAudience = !!audience.trim();
    const hasTopic = !!topicFocus.trim();

    const filledCount = [hasBrand, hasAudience, hasTopic].filter(Boolean).length;
    
    // Only auto-populate if 1 or 2 fields are filled, and at least 1 is empty
    if (filledCount === 0 || filledCount === 3) return;
    
    const timer = setTimeout(async () => {
      setIsDetecting(true);
      try {
        const result = await autoPopulateFields(brand, audience, topicFocus);
        if (result.brand && !hasBrand) setBrand(result.brand);
        if (result.audience && !hasAudience) setAudience(result.audience);
        if (result.topicFocus && !hasTopic) setTopicFocus(result.topicFocus);
      } catch (err: unknown) {
        console.error("Failed to auto-populate fields:", err);
        const errorMessage = getErrorMessage(err);
        if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
          setHasQuotaError(true);
          setToast('API quota exceeded. Auto-detect disabled.');
        }
      } finally {
        setIsDetecting(false);
      }
    }, 1500); // 1.5 second debounce

    return () => clearTimeout(timer);
  }, [brand, audience, topicFocus, hasQuotaError]);

  // Fetch brand suggestions as user types
  useEffect(() => {
    if (hasQuotaError) return;

    if (!brand.trim() || brand.trim().length < 2) {
      setBrandSuggestions(prev => prev.length === 0 ? prev : []);
      return;
    }
    
    // Don't suggest if the brand matches an existing saved search exactly
    if (visibleSavedMatrices.some(sm => sm.brand.toLowerCase() === brand.trim().toLowerCase())) {
      setBrandSuggestions(prev => prev.length === 0 ? prev : []);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSuggestingBrands(true);
      try {
        const suggestions = await suggestBrands(brand);
        setBrandSuggestions(suggestions);
      } catch (err: unknown) {
        console.error("Failed to get brand suggestions:", err);
        const errorMessage = getErrorMessage(err);
        if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
          setHasQuotaError(true);
        }
      } finally {
        setIsSuggestingBrands(false);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [brand, visibleSavedMatrices, hasQuotaError]);

  const handleReset = () => {
    setBrand('');
    setAudience('');
    setTopicFocus('');
    setSourcesType([]);
    setSelectedGenerations([]);
    setFiles([]);
    setMatrix(null);
    setMatrixMeta(null);
    setError(null);
    setMatrixQuestion('');
    setMatrixAnswer('');
    setHighlightedInsights([]);
    setIsResearchControlsMinimized(false);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowValidation(true);
    if (!audience.trim()) return;

    setFakeProgress(5);
    setIsLoading(true);
    setError(null);
    setShowValidation(false);
    setMatrixQuestion('');
    setMatrixAnswer('');
    setHighlightedInsights([]);
    const hasUploadedDocuments = files.length > 0;
    try {
      const result = await generateCulturalMatrix(audience, brand, selectedGenerations, topicFocus, files, sourcesType);
      setMatrix(result);
      setMatrixMeta({ audience, brand, generations: selectedGenerations, topicFocus, sourcesType, hasUploadedDocuments });

      // Persist generated searches directly to Supabase
      try {
        await supabase.from('searches').insert([
          {
            brand: brand || null,
            audience,
            topicFocus: topicFocus || null,
            generations: selectedGenerations,
            sourcesType,
            results: result,
          },
        ]);
        // Optionally, refresh saved matrices here if you want instant UI update
      } catch (saveErr) {
        console.warn('Failed to save search to Supabase:', saveErr);
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
        console.error('Failed to play sound', e);
      }

      // Start background deep dives
      runBackgroundDeepDives(result, { audience, brand, generations: selectedGenerations, topicFocus });

    } catch (err: unknown) {
      console.error(err);
      const errorMessage = getErrorMessage(err);
      if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
        setError('You exceeded your current API quota. Please check your plan and billing details.');
      } else {
        setError('Failed to generate cultural archaeologist report. Please try again.');
      }
    } finally {
      setFakeProgress(100);
      await new Promise((resolve) => setTimeout(resolve, 220));
      setIsLoading(false);
    }
  };

  const runBackgroundDeepDives = async (currentMatrix: CulturalMatrix, context: MatrixContext) => {
    setIsGeneratingDeepDives(true);
    
    const categories = MATRIX_INSIGHT_KEYS;
    
    let totalItems = 0;
    categories.forEach(cat => {
      if (Array.isArray(currentMatrix[cat])) {
        totalItems += (currentMatrix[cat] as MatrixItem[]).length;
      }
    });
    
    setDeepDiveProgress({ current: 0, total: totalItems });
    let completed = 0;

    const updatedMatrix = { ...currentMatrix };

    for (const category of categories) {
      const items = updatedMatrix[category] as MatrixItem[];
      if (!items || items.length === 0) continue;

      try {
        const reports = await generateDeepDivesBatch(items, context);
        
        // Update items with their deep dives
        items.forEach((item, idx) => {
          if (reports[idx]) {
            item.deepDive = reports[idx];
          }
        });
        
        completed += items.length;
        setDeepDiveProgress({ current: completed, total: totalItems });
        
        // Update state progressively
        setMatrix({ ...updatedMatrix });
        
        // Update local storage progressively
        setSavedMatrices(prev => {
          const updated = [...prev];
          if (updated.length > 0) {
            updated[0].matrix = { ...updatedMatrix };
            if (!persistSavedMatrices(updated)) {
              setToast('Deep dives updated, but local save failed in this browser.');
            }
          }
          return updated;
        });
      } catch (err) {
        console.error(`Failed to generate deep dives for ${category}:`, err);
        // Continue with other categories even if one fails
      }
    }
    
    setIsGeneratingDeepDives(false);
  };

  const handleAskQuestion = async () => {
    if (!matrix || !matrixQuestion.trim()) return;
    setIsAskingQuestion(true);
    try {
      const result = await askMatrixQuestion(matrix, matrixQuestion);
      setMatrixAnswer(result.answer);
      setHighlightedInsights(result.relevantInsights || []);
    } catch (err) {
      console.error("Failed to answer question", err);
      setMatrixAnswer("Sorry, I couldn't answer that question right now.");
    } finally {
      setIsAskingQuestion(false);
    }
  };

  const handleDeepDive = async (item: MatrixItem) => {
    if (!matrixMeta) return;
    setDeepDiveInsight(item);
    
    if (item.deepDive) {
      setDeepDiveResult(item.deepDive);
      return;
    }
    
    setDeepDiveResult(null);
    setIsDeepDiveLoading(true);
    try {
      const result = await generateDeepDive(item, matrixMeta);
      setDeepDiveResult(result);
    } catch (err) {
      console.error(err);
      setToast("Failed to generate deep dive.");
      setDeepDiveInsight(null);
    } finally {
      setIsDeepDiveLoading(false);
    }
  };

  const deleteSavedMatrix = async (id: string) => {
    await supabase.from('searches').delete().eq('id', id);
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
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64String = (event.target?.result as string).split(',')[1];
        newFiles.push({
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          data: base64String
        });
        if (newFiles.length === selectedFiles.length) {
          setFiles(prev => [...prev, ...newFiles]);
        }
      };
      reader.readAsDataURL(file);
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const generatePPTX = () => {
    if (!matrix || !matrixMeta) return null;
    const pres = new pptxgen();
    pres.layout = 'LAYOUT_16x9';
    
    // Title Slide
    const slide = pres.addSlide();
    slide.background = { color: "FAFAFA" };

    const cleanDemographics = sanitizeDemographics(matrix.demographics);
    
    slide.addText("Cultural Archaeologist", { x: 1, y: 1.5, w: 8, h: 1, fontSize: 44, bold: true, color: "18181B" });
    slide.addText(`Audience: ${matrixMeta.audience}`, { x: 1, y: 2.5, w: 8, h: 0.5, fontSize: 24, color: "4F46E5", bold: true });
    
    let currentY = 3.2;
    if (matrixMeta.brand) {
      slide.addText(`Context: ${matrixMeta.brand}`, { x: 1, y: currentY, w: 8, h: 0.4, fontSize: 18, color: "52525B" });
      currentY += 0.5;
    }
    
    if (matrixMeta.generations && matrixMeta.generations.length > 0) {
      const genText = matrixMeta.generations.map(g => g.replace(/\s*\(.*?\)\s*/g, '')).join(', ');
      slide.addText(`Generations: ${genText}`, { x: 1, y: currentY, w: 8, h: 0.4, fontSize: 16, color: "52525B" });
      currentY += 0.5;
    }
    
    if (matrixMeta.topicFocus) {
      slide.addText(`Topic Focus: ${matrixMeta.topicFocus}`, { x: 1, y: currentY, w: 8, h: 0.4, fontSize: 16, color: "52525B" });
      currentY += 0.5;
    }
    
    if (matrixMeta.sourcesType && matrixMeta.sourcesType.length > 0) {
      slide.addText(`Sources: ${matrixMeta.sourcesType.join(', ')}`, { x: 1, y: currentY, w: 8, h: 0.4, fontSize: 16, color: "52525B" });
      currentY += 0.5;
    }
    
    slide.addText(`Generated on ${new Date().toLocaleDateString()}`, { x: 1, y: currentY, w: 8, h: 0.4, fontSize: 14, color: "A1A1AA" });
    
    // Demographics Boxes
    const boxY = currentY + 0.8;
    slide.addText([
      { text: "AVERAGE AGE\n", options: { fontSize: 10, color: "A1A1AA", bold: true } },
      { text: cleanDemographics.age, options: { fontSize: 14, color: "18181B", bold: true } }
    ], { shape: pres.ShapeType.roundRect, x: 1, y: boxY, w: 2.5, h: 0.8, fill: { color: "FFFFFF" }, line: { color: "E4E4E7", width: 1 }, align: "center", valign: "middle" });
    
    slide.addText([
      { text: "RACE / ETHNICITY\n", options: { fontSize: 10, color: "A1A1AA", bold: true } },
      { text: cleanDemographics.race, options: { fontSize: 14, color: "18181B", bold: true } }
    ], { shape: pres.ShapeType.roundRect, x: 3.75, y: boxY, w: 2.5, h: 0.8, fill: { color: "FFFFFF" }, line: { color: "E4E4E7", width: 1 }, align: "center", valign: "middle" });
    
    slide.addText([
      { text: "GENDER\n", options: { fontSize: 10, color: "A1A1AA", bold: true } },
      { text: cleanDemographics.gender, options: { fontSize: 14, color: "18181B", bold: true } }
    ], { shape: pres.ShapeType.roundRect, x: 6.5, y: boxY, w: 2.5, h: 0.8, fill: { color: "FFFFFF" }, line: { color: "E4E4E7", width: 1 }, align: "center", valign: "middle" });
    
    const categories = [
      { title: 'Moments', data: matrix.moments },
      { title: 'Beliefs', data: matrix.beliefs },
      { title: 'Tone', data: matrix.tone },
      { title: 'Language', data: matrix.language },
      { title: 'Behaviors', data: matrix.behaviors },
      { title: 'Contradictions', data: matrix.contradictions },
      { title: 'Community', data: matrix.community },
      { title: 'Influencers', data: matrix.influencers },
    ];
    
    categories.forEach(cat => {
      let catSlide = pres.addSlide();
      catSlide.background = { color: "FAFAFA" };
      catSlide.addText(cat.title.toUpperCase(), { x: 0.5, y: 0.5, w: 9, h: 0.5, fontSize: 18, bold: true, color: "18181B", align: "left" });
      
      let yPos = 1.2;
      cat.data.forEach(d => {
        const textLength = d.text.length;
        const estimatedHeight = Math.max(0.6, Math.ceil(textLength / 100) * 0.35);
        const confidenceText = (d.confidenceLevel || 'medium').toUpperCase();
        const sourceText = d.sourceType ? ` | ${d.sourceType}` : '';
        
        if (yPos + estimatedHeight > 5.2) {
          catSlide = pres.addSlide();
          catSlide.background = { color: "FAFAFA" };
          catSlide.addText(`${cat.title.toUpperCase()} (Cont.)`, { x: 0.5, y: 0.5, w: 9, h: 0.5, fontSize: 18, bold: true, color: "18181B", align: "left" });
          yPos = 1.2;
        }
        
        catSlide.addText(`${d.isHighlyUnique ? '✨ ' : '• '}${d.text}\n[${confidenceText} CONFIDENCE${sourceText}]`, {
          shape: pres.ShapeType.roundRect,
          x: 0.5, y: yPos, w: 9, h: estimatedHeight,
          fill: { color: d.isHighlyUnique ? "EEF2FF" : "FFFFFF" },
          line: { color: d.isHighlyUnique ? "C7D2FE" : "E4E4E7", width: 1 },
          color: d.isHighlyUnique ? "312E81" : "3F3F46",
          bold: d.isHighlyUnique,
          fontSize: 12,
          valign: "middle",
          align: "left",
          margin: 0.15
        });
        
        yPos += estimatedHeight + 0.15;
      });
      
      // Add Deep Dive Slides for this category
      cat.data.forEach(d => {
        if (d.deepDive) {
          const ddSlide = pres.addSlide();
          ddSlide.background = { color: "FAFAFA" };
          ddSlide.addText(`Deep Dive: ${cat.title}`, { x: 0.5, y: 0.3, w: 9, h: 0.5, fontSize: 14, color: "4F46E5", bold: true });
          ddSlide.addText(d.text, { x: 0.5, y: 0.8, w: 9, h: 0.6, fontSize: 16, color: "18181B", bold: true });
          
          let currentY = 1.6;
          
          // Expanded Context
          ddSlide.addText("Expanded Context", { x: 0.5, y: currentY, w: 9, h: 0.3, fontSize: 12, color: "52525B", bold: true });
          currentY += 0.3;
          ddSlide.addText(d.deepDive.expandedContext, { x: 0.5, y: currentY, w: 9, h: 0.6, fontSize: 11, color: "3F3F46" });
          currentY += 0.7;
          
          // Strategic Implications
          ddSlide.addText("Strategic Implications", { x: 0.5, y: currentY, w: 9, h: 0.3, fontSize: 12, color: "52525B", bold: true });
          currentY += 0.3;
          const implicationsText = d.deepDive.strategicImplications.map(imp => `• ${imp}`).join('\n');
          ddSlide.addText(implicationsText, { x: 0.5, y: currentY, w: 9, h: 0.6, fontSize: 11, color: "3F3F46" });
          currentY += 0.7;
          
          // Real World Examples
          ddSlide.addText("Real World Examples", { x: 0.5, y: currentY, w: 9, h: 0.3, fontSize: 12, color: "52525B", bold: true });
          currentY += 0.3;
          const examplesText = d.deepDive.realWorldExamples.map(ex => `• ${ex}`).join('\n');
          ddSlide.addText(examplesText, { x: 0.5, y: currentY, w: 9, h: 0.6, fontSize: 11, color: "3F3F46" });
        }
      });
    });

    // Sources Slide
    if (matrix.sources && matrix.sources.length > 0) {
      const sourceSlide = pres.addSlide();
      sourceSlide.background = { color: "FAFAFA" };
      sourceSlide.addText('SOURCES & RESEARCH', { x: 0.5, y: 0.5, w: 9, h: 0.5, fontSize: 18, bold: true, color: "18181B" });
      
      const sourcesText = matrix.sources.map(s => ({
        text: `• ${s.title}\n  ${s.url}\n\n`,
        options: { color: "4F46E5" }
      }));
      
      sourceSlide.addText(sourcesText, {
        shape: pres.ShapeType.roundRect,
        x: 0.5, y: 1.2, w: 9, h: 4,
        fill: { color: "FFFFFF" },
        line: { color: "E4E4E7", width: 1 },
        fontSize: 12,
        valign: "top",
        align: "left",
        margin: 0.3
      });
    }

    return pres;
  };

  const exportToPPTX = () => {
    const pres = generatePPTX();
    if (pres) {
      pres.writeFile({ fileName: `${matrixMeta?.audience.replace(/\s+/g, '_')}_Cultural_Archaeologist.pptx` });
    }
  };

  const exportToPDF = () => {
    if (!matrix || !matrixMeta) return;
    
    setIsExporting(true);
    setToast("Generating PDF...");
    
    import('jspdf').then(({ jsPDF }) => {
      try {
        const cleanDemographics = sanitizeDemographics(matrix.demographics);

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
        y = addWrappedText("Cultural Archaeologist Report", margin, y, 24, true, [24, 24, 27]);
        y += 10;
        
        y = addWrappedText(`Audience: ${matrixMeta.audience}`, margin, y, 16, true, [79, 70, 229]);
        y += 5;
        
        if (matrixMeta.brand) {
          y = addWrappedText(`Context: ${matrixMeta.brand}`, margin, y, 12, false, [82, 82, 91]);
        }
        if (matrixMeta.topicFocus) {
          y = addWrappedText(`Topic Focus: ${matrixMeta.topicFocus}`, margin, y, 12, false, [82, 82, 91]);
        }
        if (matrixMeta.generations && matrixMeta.generations.length > 0) {
          y = addWrappedText(`Generations: ${matrixMeta.generations.join(', ')}`, margin, y, 12, false, [82, 82, 91]);
        }
        
        y += 15;
        y = addWrappedText("Demographics", margin, y, 14, true, [24, 24, 27]);
        y += 2;
        y = addWrappedText(`Average Age: ${cleanDemographics.age}`, margin, y, 11, false, [63, 63, 70]);
        y = addWrappedText(`Race / Ethnicity: ${cleanDemographics.race}`, margin, y, 11, false, [63, 63, 70]);
        y = addWrappedText(`Gender: ${cleanDemographics.gender}`, margin, y, 11, false, [63, 63, 70]);
        
        const categories = [
          { title: 'Moments', data: matrix.moments },
          { title: 'Beliefs', data: matrix.beliefs },
          { title: 'Tone', data: matrix.tone },
          { title: 'Language', data: matrix.language },
          { title: 'Behaviors', data: matrix.behaviors },
          { title: 'Contradictions', data: matrix.contradictions },
          { title: 'Community', data: matrix.community },
          { title: 'Influencers', data: matrix.influencers },
        ];
        
        categories.forEach(cat => {
          if (!cat.data || cat.data.length === 0) return;
          
          cat.data.forEach((item, index) => {
            doc.addPage();
            let currentY = margin + 5;
            
            // Category Header
            currentY = addWrappedText(`${cat.title.toUpperCase()} - Insight ${index + 1}`, margin, currentY, 10, true, [161, 161, 170]);
            currentY += 2;
            
            // Insight Text
            currentY = addWrappedText(item.text, margin, currentY, 16, true, [24, 24, 27]);
            currentY += 8;
            currentY = addWrappedText(`Confidence: ${(item.confidenceLevel || 'medium').toUpperCase()}`, margin, currentY, 10, true, [79, 70, 229]);
            if (item.sourceType) {
              currentY = addWrappedText(`Source Type: ${item.sourceType}`, margin, currentY, 10, false, [82, 82, 91]);
            }
            currentY += 4;
            
            if (item.deepDive) {
              // Origination & Relevance
              currentY = addWrappedText(`Originated: ${item.deepDive.originationDate}`, margin, currentY, 10, true, [79, 70, 229]);
              currentY = addWrappedText(`Relevance: ${item.deepDive.relevance}`, margin, currentY, 11, false, [16, 185, 129]);
              currentY += 6;
              
              // Expanded Context
              currentY = addWrappedText("Expanded Context", margin, currentY, 12, true, [24, 24, 27]);
              currentY = addWrappedText(item.deepDive.expandedContext, margin, currentY, 10, false, [63, 63, 70]);
              currentY += 6;
              
              // Strategic Implications
              currentY = addWrappedText("Strategic Implications", margin, currentY, 12, true, [24, 24, 27]);
              item.deepDive.strategicImplications.forEach(imp => {
                currentY = addWrappedText(`• ${imp}`, margin + 5, currentY, 10, false, [63, 63, 70]);
              });
              currentY += 6;
              
              // Real World Examples
              currentY = addWrappedText("Real World Examples", margin, currentY, 12, true, [24, 24, 27]);
              item.deepDive.realWorldExamples.forEach(ex => {
                currentY = addWrappedText(`• ${ex}`, margin + 5, currentY, 10, false, [63, 63, 70]);
              });
            } else {
              currentY = addWrappedText("(Deep dive not generated for this insight yet)", margin, currentY, 10, false, [161, 161, 170]);
            }
          });
        });
        
        doc.save(`${matrixMeta?.audience.replace(/\s+/g, '_')}_Cultural_Archaeologist.pdf`);
        setToast("PDF exported successfully!");
      } catch (err) {
        console.error("Failed to generate PDF:", err);
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

  // --- ADMIN DASHBOARD RENDER LOGIC ---
  if (showAdminDashboard) {
    if (!isAdminAuthenticated) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] text-zinc-900 font-sans p-4">
          <form
            onSubmit={handleAdminLogin}
            className="bg-white p-8 md:p-12 rounded-3xl border border-zinc-200 shadow-xl max-w-sm w-full text-center"
          >
            <h1 className="text-2xl font-bold mb-4 text-zinc-900">Admin Access</h1>
            <p className="text-zinc-600 mb-8 text-base">Enter the admin passphrase to access the Master Admin Library.</p>
            <input
              type="password"
              value={adminPass}
              onChange={e => setAdminPass(e.target.value)}
              placeholder="Admin Passphrase"
              className="w-full px-4 py-3 mb-4 border border-zinc-200 rounded-xl text-zinc-900 bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              autoFocus
            />
            {adminError && <div className="text-red-500 text-sm mb-3">{adminError}</div>}
            <button
              type="submit"
              className="w-full py-3 px-6 bg-zinc-900 hover:bg-zinc-800 text-white font-medium rounded-xl transition-all shadow-lg shadow-zinc-200 hover:shadow-zinc-300"
            >
              Enter
            </button>
          </form>
        </div>
      );
    }
    return (
      <AdminDashboard
        onBack={() => { setShowAdminDashboard(false); }}
      />
    );
  }

  if (hasApiKey === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] text-zinc-900 font-sans p-4">
        <div className="bg-white p-8 md:p-12 rounded-3xl border border-zinc-200 shadow-xl max-w-lg w-full text-center">
          <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold mb-4 text-zinc-900">Welcome to Cultural Archaeologist</h1>
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
                  className="text-left bg-white/90 border border-zinc-200 rounded-3xl p-6 hover:border-zinc-300 hover:shadow-sm transition-all h-full flex flex-col justify-start main-box-hover"
                >
                  <div className="inline-flex items-center gap-2 text-zinc-800 font-semibold mb-2 text-lg md:text-xl items-start">
                    <Search className="w-4 h-4" /> Cultural Archaeologist
                  </div>
                  <p className="subheader-copy text-base text-zinc-500">
                    Generate sharper insights about any audience through a cultural lens.
                  </p>
                  <ul className="mt-3 space-y-1">
                    {['Audience research', 'Strategy development', 'Campaign & content ideation', 'Creative briefs', 'Pitches'].map((item) => (
                      <li key={item} className="flex items-center gap-2 text-sm text-zinc-500">
                        <span className="w-1 h-1 rounded-full bg-zinc-500 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </button>
                <button
                  onClick={() => setActiveExperience('brand')}
                  className="text-left bg-white/90 border border-zinc-200 rounded-3xl p-6 hover:border-zinc-300 hover:shadow-sm transition-all h-full flex flex-col justify-start main-box-hover"
                >
                  <div className="inline-flex items-center gap-2 text-zinc-800 font-semibold mb-2 text-lg md:text-xl items-start">
                    <Sparkles className="w-4 h-4" /> Visual Design Excavator
                    <span className="inline-flex items-center rounded-full border border-amber-300/80 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-700">
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
            <BrandDeepDivePage onBack={() => setActiveExperience('research')} />
          </div>
        )}

        {activeExperience === 'research' && (
          <>
            {/* Top Navigation / Actions */}
            <div className="absolute top-6 right-6 z-50 no-print flex items-center gap-2">
              <button
                onClick={() => setActiveExperience('brand')}
                className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm border border-zinc-200 text-zinc-700 rounded-full font-medium hover:bg-zinc-50 hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-500/50 focus:ring-offset-1 transition-all shadow-sm text-sm"
              >
                <Sparkles className="w-4 h-4" /> Visual Design Excavator
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

        {/* Deep Dive Modal */}
        <AnimatePresence>
          {deepDiveInsight && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 sm:p-6"
              onClick={(e) => { if (e.target === e.currentTarget) setDeepDiveInsight(null); }}
            >
              <motion.div
                drag
                dragControls={deepDiveDragControls}
                dragListener={false}
                dragConstraints={{ left: -300, right: 300, top: -300, bottom: 300 }}
                dragElastic={0.1}
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="bg-white rounded-3xl p-6 sm:p-8 max-w-3xl w-full shadow-2xl relative max-h-[90vh] overflow-y-auto"
              >
                <button 
                  onClick={() => setDeepDiveInsight(null)}
                  className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500/50 rounded-full transition-colors z-10"
                >
                  <X className="w-5 h-5" />
                </button>
                
                <div 
                  className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6 pr-8 cursor-grab active:cursor-grabbing"
                  onPointerDown={(e) => deepDiveDragControls.start(e)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-zinc-900 select-none">Insight Deep Dive</h3>
                      <p className="text-sm text-zinc-500 select-none">Strategic analysis & implications</p>
                    </div>
                  </div>
                  
                  {!isDeepDiveLoading && deepDiveResult && (
                    <div className="flex flex-col items-start md:items-end gap-2 text-right">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 text-xs font-medium text-zinc-700 border border-zinc-200">
                        <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                        Originated: {deepDiveResult.originationDate}
                      </div>
                      <div className="inline-flex items-start gap-1.5 px-3 py-2 rounded-lg bg-emerald-50 text-xs font-medium text-emerald-800 border border-emerald-100 max-w-xs text-left">
                        <Activity className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{deepDiveResult.relevance}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-zinc-50 rounded-xl p-5 mb-8 border border-zinc-100">
                  <h4 className="font-bold text-zinc-900 mb-2">Selected Insight</h4>
                  <p className="text-zinc-700 text-sm">
                    {extractEvidenceTags(deepDiveInsight.text).cleanText}
                    {extractEvidenceTags(deepDiveInsight.text).labels.map((label) => (
                      <span key={`deep-dive-${label}`} className={`inline-block ml-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded align-middle ${evidenceLabelChipClass(label)}`}>
                        {label}
                      </span>
                    ))}
                  </p>
                </div>

                {isDeepDiveLoading ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-4" />
                    <p className="text-zinc-500 animate-pulse">Analyzing cultural signals and strategic implications...</p>
                  </div>
                ) : deepDiveResult ? (
                  <div>
                    <div className="md:hidden">
                      <Accordion
                        items={[
                          {
                            id: 'expanded-context',
                            title: (
                              <>
                                <Search className="w-4 h-4 text-indigo-500" />
                                Expanded Context
                              </>
                            ),
                            content: (
                              <p className="text-zinc-700 leading-relaxed text-sm">
                                {extractEvidenceTags(deepDiveResult.expandedContext).cleanText}
                                {extractEvidenceTags(deepDiveResult.expandedContext).labels.map((label) => (
                                  <span key={`expanded-${label}`} className={`inline-block ml-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded align-middle ${evidenceLabelChipClass(label)}`}>
                                    {label}
                                  </span>
                                ))}
                              </p>
                            ),
                          },
                          {
                            id: 'real-world-examples',
                            title: (
                              <>
                                <Presentation className="w-4 h-4 text-blue-500" />
                                Real-World Examples
                              </>
                            ),
                            content: (
                              <ul className="space-y-3">
                                {deepDiveResult.realWorldExamples.map((ex, i) => {
                                  const parsedExample = extractEvidenceTags(ex);
                                  return (
                                  <li key={i} className="text-zinc-700 text-sm bg-blue-50/50 p-3 rounded-xl border border-blue-100/50">
                                    <span>
                                      {parsedExample.cleanText}
                                      {parsedExample.labels.map((label) => (
                                        <span key={`real-world-${i}-${label}`} className={`inline-block ml-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded align-middle ${evidenceLabelChipClass(label)}`}>
                                          {label}
                                        </span>
                                      ))}
                                    </span>
                                  </li>
                                  );
                                })}
                              </ul>
                            ),
                          },
                          {
                            id: 'strategic-implications',
                            title: (
                              <>
                                <Target className="w-4 h-4 text-emerald-500" />
                                Strategic Implications
                              </>
                            ),
                            content: (
                              <ul className="space-y-3">
                                {deepDiveResult.strategicImplications.map((imp, i) => {
                                  const parsedImplication = extractEvidenceTags(imp);
                                  return (
                                  <li key={i} className="text-zinc-700 text-sm">
                                    <span>
                                      {parsedImplication.cleanText}
                                      {parsedImplication.labels.map((label) => (
                                        <span key={`implication-${i}-${label}`} className={`inline-block ml-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded align-middle ${evidenceLabelChipClass(label)}`}>
                                          {label}
                                        </span>
                                      ))}
                                    </span>
                                  </li>
                                  );
                                })}
                              </ul>
                            ),
                          },
                          ...(deepDiveResult.sources && deepDiveResult.sources.length > 0
                            ? [
                                {
                                  id: 'deep-dive-sources',
                                  title: 'Sources',
                                  content: (
                                    <div className="flex flex-wrap gap-2">
                                      {deepDiveResult.sources.map((source, i) => (
                                        <a
                                          key={i}
                                          href={source.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1.5 text-xs bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-3 py-1.5 rounded-full transition-colors"
                                        >
                                          <ExternalLink className="w-3 h-3" />
                                          <span className="truncate max-w-[200px]">{source.title}</span>
                                        </a>
                                      ))}
                                    </div>
                                  ),
                                },
                              ]
                            : []),
                        ]}
                      />
                    </div>

                    <div className="hidden md:block space-y-8">
                      <section>
                        <h4 className="text-lg font-bold text-zinc-900 mb-3 flex items-center gap-2">
                          <Search className="w-5 h-5 text-indigo-500" />
                          Expanded Context
                        </h4>
                        <p className="text-zinc-700 leading-relaxed text-sm">
                          {extractEvidenceTags(deepDiveResult.expandedContext).cleanText}
                          {extractEvidenceTags(deepDiveResult.expandedContext).labels.map((label) => (
                            <span key={`expanded-desktop-${label}`} className={`inline-block ml-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded align-middle ${evidenceLabelChipClass(label)}`}>
                              {label}
                            </span>
                          ))}
                        </p>
                      </section>

                      <section>
                        <h4 className="text-lg font-bold text-zinc-900 mb-3 flex items-center gap-2">
                          <Presentation className="w-5 h-5 text-blue-500" />
                          Real-World Examples
                        </h4>
                        <ul className="space-y-3">
                          {deepDiveResult.realWorldExamples.map((ex, i) => {
                            const parsedExample = extractEvidenceTags(ex);
                            return (
                              <li key={i} className="text-zinc-700 text-sm bg-blue-50/50 p-3 rounded-xl border border-blue-100/50">
                                <span>
                                  {parsedExample.cleanText}
                                  {parsedExample.labels.map((label) => (
                                    <span key={`real-world-desktop-${i}-${label}`} className={`inline-block ml-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded align-middle ${evidenceLabelChipClass(label)}`}>
                                      {label}
                                    </span>
                                  ))}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </section>

                      <div className="gap-8">
                        <section>
                          <h4 className="text-lg font-bold text-zinc-900 mb-3 flex items-center gap-2">
                            <Target className="w-5 h-5 text-emerald-500" />
                            Strategic Implications
                          </h4>
                          <ul className="space-y-3">
                            {deepDiveResult.strategicImplications.map((imp, i) => {
                              const parsedImplication = extractEvidenceTags(imp);
                              return (
                                <li key={i} className="text-zinc-700 text-sm">
                                  <span>
                                    {parsedImplication.cleanText}
                                    {parsedImplication.labels.map((label) => (
                                      <span key={`implication-desktop-${i}-${label}`} className={`inline-block ml-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded align-middle ${evidenceLabelChipClass(label)}`}>
                                        {label}
                                      </span>
                                    ))}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </section>
                      </div>

                      {deepDiveResult.sources && deepDiveResult.sources.length > 0 && (
                        <section className="pt-6 border-t border-zinc-100">
                          <h4 className="text-sm font-bold text-zinc-900 mb-3">Sources</h4>
                          <div className="flex flex-wrap gap-2">
                            {deepDiveResult.sources.map((source, i) => (
                              <a
                                key={i}
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-3 py-1.5 rounded-full transition-colors"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span className="truncate max-w-[200px]">{source.title}</span>
                              </a>
                            ))}
                          </div>
                        </section>
                      )}
                    </div>
                  </div>
                ) : null}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Vocabulary Extractor Popout */}
        <AnimatePresence>
          {isVocabularyOpen && matrix && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 sm:p-6"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setIsVocabularyOpen(false);
                }
              }}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="bg-white rounded-3xl p-6 sm:p-8 max-w-4xl w-full shadow-2xl relative max-h-[90vh] overflow-y-auto"
              >
                <button
                  onClick={() => setIsVocabularyOpen(false)}
                  className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500/50 rounded-full transition-colors z-10"
                >
                  <X className="w-5 h-5" />
                </button>
                <div className="pr-8 mb-5">
                  <h3 className="text-xl font-bold text-zinc-900">Vocabulary Extractor</h3>
                  <p className="text-sm text-zinc-500">Instant language guardrails for copywriters.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800 mb-2">Words they use</h4>
                    <ul className="space-y-1">
                      {(matrix.vocabulary?.wordsTheyUse || []).slice(0, 20).map((word, idx) => (
                        <li key={`use-${idx}`} className="text-sm text-emerald-900">• {word}</li>
                      ))}
                      {(!matrix.vocabulary?.wordsTheyUse || matrix.vocabulary.wordsTheyUse.length === 0) && (
                        <li className="text-sm text-emerald-900/80">No terms extracted yet.</li>
                      )}
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-rose-800 mb-2">Words to avoid</h4>
                    <ul className="space-y-1">
                      {(matrix.vocabulary?.wordsToAvoid || []).slice(0, 20).map((word, idx) => (
                        <li key={`avoid-${idx}`} className="text-sm text-rose-900">• {word}</li>
                      ))}
                      {(!matrix.vocabulary?.wordsToAvoid || matrix.vocabulary.wordsToAvoid.length === 0) && (
                        <li className="text-sm text-rose-900/80">No avoidance terms extracted yet.</li>
                      )}
                    </ul>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-col items-center text-center mb-16 no-print">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center justify-center p-2 bg-white rounded-2xl shadow-sm border border-zinc-200/50 mb-8">
              <Search className="w-5 h-5 text-indigo-500" />
            </div>
            <h1 className="text-4xl md:text-6xl font-medium tracking-tight text-zinc-900 mb-6 select-none">
              Cultural <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-fuchsia-500">Archaeologist</span>
            </h1>
            <p className="text-lg text-zinc-500 max-w-2xl mx-auto leading-relaxed select-none">
              Deep dive into any culture or audience.
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
                  <p className="text-xs uppercase tracking-wider text-zinc-500 font-semibold">Cultural Archaeologist</p>
                  <p className="text-sm text-zinc-700">
                    Audience: {matrixMeta.audience || 'N/A'}
                    {matrixMeta.brand ? ` • Context: ${matrixMeta.brand}` : ''}
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
            className={`w-full max-w-4xl mt-10 relative flex flex-col gap-4 ${isResearchControlsMinimized ? 'hidden' : ''}`}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative flex flex-col w-full">
                <div className="relative flex items-center w-full">
                  <Users className="absolute left-4 w-5 h-5 text-zinc-400" />
                  <input
                    type="text"
                    value={audience}
                    onChange={(e) => {
                      setAudience(e.target.value);
                      if (showValidation) setShowValidation(false);
                    }}
                    placeholder="Primary Audience (Required) *"
                    className={`w-full pl-12 pr-12 py-4 bg-white border ${showValidation && !audience.trim() ? 'border-red-500 focus:ring-red-500/20 focus:border-red-500' : 'border-zinc-200 focus:ring-indigo-500/20 focus:border-indigo-500'} rounded-2xl text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 transition-all shadow-sm text-sm`}
                    disabled={isLoading}
                    required
                  />
                  {isDetecting && !audience.trim() && (
                    <div className="absolute right-4 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                    </div>
                  )}
                </div>
                {showValidation && !audience.trim() && (
                  <span className="text-red-500 text-sm mt-1 ml-2 text-left">Audience is required to generate insights.</span>
                )}
              </div>
              
              <div className="relative flex items-center w-full" ref={brandDropdownRef}>
                <Tag className="absolute left-4 w-5 h-5 text-zinc-400" />
                <input
                  type="text"
                  value={brand}
                  onChange={(e) => {
                    setBrand(e.target.value);
                    setIsBrandDropdownOpen(true);
                  }}
                  onFocus={() => setIsBrandDropdownOpen(true)}
                  placeholder="Brand or Category (Optional)"
                  className="w-full pl-12 pr-12 py-4 bg-white border border-zinc-200 rounded-2xl text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm text-sm"
                  disabled={isLoading}
                />
                {isDetecting && !brand.trim() && (
                  <div className="absolute right-4 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                  </div>
                )}
                
                <AnimatePresence>
                  {isBrandDropdownOpen && (visibleSavedMatrices.length > 0 || brandSuggestions.length > 0 || isSuggestingBrands) && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="absolute top-full left-0 w-full mt-2 bg-white border border-zinc-200 rounded-2xl shadow-lg z-20 max-h-80 overflow-y-auto"
                    >
                      {isSuggestingBrands && (
                        <div className="p-4 text-sm text-zinc-500 flex items-center gap-2 justify-center border-b border-zinc-100">
                          <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                          Finding suggestions...
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
                                  setBrand(suggestion);
                                  setIsBrandDropdownOpen(false);
                                }}
                                className="w-full text-left px-4 py-3 hover:bg-zinc-50 focus:outline-none focus:bg-zinc-50 rounded-xl transition-colors font-medium text-zinc-900"
                              >
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        </>
                      )}

                      {visibleSavedMatrices.length > 0 && (
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
                                  <span className="font-medium text-zinc-900">{sm.brand || 'General Audience'}</span>
                                  <span className="text-xs text-zinc-500">
                                    Audience: {sm.audience} 
                                    {sm.topicFocus && ` • Topic: ${sm.topicFocus}`} 
                                    {sm.sourcesType && sm.sourcesType.length > 0 && ` • Sources: ${sm.sourcesType.join(', ')}`} 
                                     • {new Date(sm.date).toLocaleDateString()}
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

              <div className="relative flex items-center w-full">
                <Target className="absolute left-4 w-5 h-5 text-zinc-400" />
                <input
                  type="text"
                  value={topicFocus}
                  onChange={(e) => setTopicFocus(e.target.value)}
                  placeholder="Topic Focus (Optional)"
                  className="w-full pl-12 pr-12 py-4 bg-white border border-zinc-200 rounded-2xl text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm text-sm"
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
                    'Scanning latest audience signals...',
                    'Synthesizing cultural tensions...',
                    'Ranking highest-potency insights...',
                    'Shaping strategist-ready output...',
                  ]}
                  className="text-xs whitespace-nowrap leading-none"
                  showProgress
                  progress={fakeProgress}
                />
              ) : (
                <>
                  <Sparkles className="w-5 h-5" /> Generate Insights
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

            <p className="subheader-copy text-xs text-zinc-400 text-center mt-2">
              AI models can make mistakes. Always double check your work. Remember to think critically.
            </p>
            
            {error && (
              <p className="text-red-500 text-sm mt-2">{error}</p>
            )}
          </motion.form>
        </div>

        {!matrix && !isLoading && visibleSavedMatrices.length > 0 && (
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
                    setBrand(sm.brand);
                    setAudience(sm.audience);
                    setSelectedGenerations(sm.generations || []);
                    setTopicFocus(sm.topicFocus || '');
                    setSourcesType(sm.sourcesType || []);
                    setMatrix(sm.matrix);
                    setMatrixMeta({ audience: sm.audience, brand: sm.brand, generations: sm.generations || [], topicFocus: sm.topicFocus, sourcesType: sm.sourcesType || [] });
                    window.scrollTo({ top: 0, behavior: 'smooth' });
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
                      {new Date(sm.date).toLocaleDateString()}
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
                      <Tag className="w-4 h-4" /> Context: {matrixMeta.brand}
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
                  {isGeneratingDeepDives && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-full text-sm font-medium text-indigo-700 shadow-sm">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Generating Deep Dives ({deepDiveProgress.current}/{deepDiveProgress.total})</span>
                    </div>
                  )}
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
                {matrixMeta.brand && <p className="text-xl text-zinc-600 mb-2">Context: {matrixMeta.brand}</p>}
                {matrixMeta.topicFocus && <p className="text-xl text-zinc-600 mb-2">Topic: {matrixMeta.topicFocus}</p>}
                {matrixMeta.sourcesType && matrixMeta.sourcesType.length > 0 && <p className="text-xl text-zinc-600 mb-2">Sources: {matrixMeta.sourcesType.join(', ')}</p>}
                <p className="text-zinc-500">Generated on {new Date().toLocaleDateString()}</p>
              </div>

              {/* Matrix Search Tool */}
              <div className="mb-10 bg-indigo-50 rounded-3xl p-6 md:p-8 border border-indigo-100 shadow-sm no-print">
                <h3 className="text-xl font-bold text-indigo-900 mb-4 flex items-center gap-2">
                  <Search className="w-6 h-6" /> Ask the Archaeologist
                </h3>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    value={matrixQuestion}
                    onChange={(e) => setMatrixQuestion(e.target.value)}
                    placeholder="Ask a question about this audience (e.g., what are their main anxieties?)"
                    className="flex-1 px-5 py-4 rounded-2xl border border-indigo-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-zinc-900 shadow-sm text-sm"
                    onKeyDown={(e) => e.key === 'Enter' && handleAskQuestion()}
                    disabled={isAskingQuestion}
                  />
                  <button
                    onClick={handleAskQuestion}
                    disabled={isAskingQuestion || !matrixQuestion.trim()}
                    className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-medium hover:bg-indigo-700 hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:ring-offset-2 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none transition-all flex items-center justify-center gap-2 shadow-sm"
                  >
                    {isAskingQuestion ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Ask'}
                  </button>
                </div>
                {matrixAnswer && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 p-6 bg-white rounded-2xl border border-indigo-100 text-zinc-700 shadow-sm leading-relaxed"
                  >
                    <div className="space-y-4">
                      {structuredMatrixAnswer.length > 0 ? (
                        structuredMatrixAnswer.map((section, index) => (
                          <div key={`ask-section-${index}`} className={section.title ? 'rounded-xl border border-zinc-200 bg-zinc-50 p-4' : ''}>
                            {section.title && (
                              <h4 className="text-sm font-semibold text-zinc-900 mb-2">{section.title}</h4>
                            )}
                            <p className="text-zinc-700 text-[15px] leading-7 whitespace-pre-wrap">
                              {section.text}
                              {section.labels.map((label) => (
                                <span key={`ask-label-${index}-${label}`} className={`inline-block ml-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded align-middle ${evidenceLabelChipClass(label)}`}>
                                  {label}
                                </span>
                              ))}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-zinc-700 text-[15px] leading-7 whitespace-pre-wrap">{matrixAnswer}</p>
                      )}
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Demographics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10 no-print">
                <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm text-center">
                  <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Average Age</div>
                  <div className="text-sm font-semibold text-zinc-900">{stripDemographicEvidenceMarkers(matrix.demographics.age)}</div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm text-center">
                  <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Race / Ethnicity</div>
                  <div className="text-sm font-semibold text-zinc-900">{stripDemographicEvidenceMarkers(matrix.demographics.race)}</div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm text-center">
                  <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Gender</div>
                  <div className="text-sm font-semibold text-zinc-900">{stripDemographicEvidenceMarkers(matrix.demographics.gender)}</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6 mb-6 px-2 no-print">
                <div className="flex items-center gap-2 text-sm text-zinc-600">
                  <Sparkles className="w-4 h-4 text-indigo-500" />
                  <span>Highly unique observation</span>
                </div>
                {matrixMeta?.hasUploadedDocuments && MATRIX_INSIGHT_KEYS.some((cat) =>
                  displayMatrix?.[cat]?.some((item) => item.isFromDocument)
                ) && (
                  <div className="flex items-center gap-2 text-sm text-zinc-600">
                    <FileText className="w-4 h-4 text-emerald-500" />
                    <span>Sourced from uploaded document</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-zinc-600">
                  <Target className="w-4 h-4 text-zinc-400" />
                  <span>Insights deep dive</span>
                </div>
              </div>

              <div className="mb-8 p-4 bg-zinc-50 border border-zinc-200 rounded-2xl no-print">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <h4 className="text-sm font-semibold text-zinc-900">Result Filters</h4>
                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedConfidenceFilters([]);
                        setSelectedEvidenceFilters([]);
                        setSelectedTrendStageFilters([]);
                        setSelectedSourceFilters([]);
                      }}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                    >
                      Clear All ({activeFilterCount})
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <div className="flex items-center gap-1.5 mb-2 group/tip relative">
                      <div className="text-[11px] uppercase tracking-wider text-zinc-500">Confidence Level</div>
                      <div className="relative flex items-center">
                        <Info className="w-3 h-3 text-zinc-400 cursor-default" />
                        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-xl bg-zinc-900 px-3 py-2 text-[11px] leading-relaxed text-white shadow-lg opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-50">
                          How strong &amp; reliable the evidence is for this observation. High = well-corroborated by recent sources. Low = weak or emerging signal.
                          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900" />
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {CONFIDENCE_FILTERS.map((level) => {
                        const selected = selectedConfidenceFilters.includes(level);
                        return (
                          <button
                            key={level}
                            type="button"
                            onClick={() =>
                              setSelectedConfidenceFilters((prev) =>
                                prev.includes(level) ? prev.filter((v) => v !== level) : [...prev, level]
                              )
                            }
                            className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                              selected
                                ? 'bg-zinc-900 text-white border-zinc-900'
                                : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300'
                            }`}
                          >
                            {level}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5 mb-2 group/tip relative">
                      <div className="text-[11px] uppercase tracking-wider text-zinc-500">Evidence Type</div>
                      <div className="relative flex items-center">
                        <Info className="w-3 h-3 text-zinc-400 cursor-default" />
                        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-xl bg-zinc-900 px-3 py-2 text-[11px] leading-relaxed text-white shadow-lg opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-50">
                          How the observation is being gathered. Known = directly observed fact. Inferred = pattern drawn from signals. Speculative = forward-looking or unverified hypothesis.
                          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900" />
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {EVIDENCE_FILTERS.map((label) => {
                        const selected = selectedEvidenceFilters.includes(label);
                        return (
                          <button
                            key={label}
                            type="button"
                            onClick={() =>
                              setSelectedEvidenceFilters((prev) =>
                                prev.includes(label) ? prev.filter((v) => v !== label) : [...prev, label]
                              )
                            }
                            className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                              selected
                                ? 'bg-zinc-900 text-white border-zinc-900'
                                : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5 mb-2 group/tip relative">
                      <div className="text-[11px] uppercase tracking-wider text-zinc-500">Trend Stage</div>
                      <div className="relative flex items-center">
                        <Info className="w-3 h-3 text-zinc-400 cursor-default" />
                        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-xl bg-zinc-900 px-3 py-2 text-[11px] leading-relaxed text-white shadow-lg opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-50">
                          Where this observation sits on the trend lifecycle. Peaking = mainstream adoption. Emerging = early wave. Declining = fading or being replaced.
                          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900" />
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {TREND_STAGE_FILTERS.map((stage) => {
                        const selected = selectedTrendStageFilters.includes(stage);
                        return (
                          <button
                            key={stage}
                            type="button"
                            onClick={() =>
                              setSelectedTrendStageFilters((prev) =>
                                prev.includes(stage) ? prev.filter((v) => v !== stage) : [...prev, stage]
                              )
                            }
                            className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                              selected
                                ? 'bg-zinc-900 text-white border-zinc-900'
                                : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300'
                            }`}
                          >
                            {stage}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5 mb-2 group/tip relative">
                      <div className="text-[11px] uppercase tracking-wider text-zinc-500">Sources</div>
                      <div className="relative flex items-center">
                        <Info className="w-3 h-3 text-zinc-400 cursor-default" />
                        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-xl bg-zinc-900 px-3 py-2 text-[11px] leading-relaxed text-white shadow-lg opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-50">
                          Filter insights by source tags attached to each result, including uploaded document-derived observations when available.
                          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900" />
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {sourceFilterOptions.map((source) => {
                        const selected = selectedSourceFilters.includes(source);
                        return (
                          <button
                            key={source}
                            type="button"
                            onClick={() =>
                              setSelectedSourceFilters((prev) =>
                                prev.includes(source) ? prev.filter((v) => v !== source) : [...prev, source]
                              )
                            }
                            className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                              selected
                                ? 'bg-zinc-900 text-white border-zinc-900'
                                : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300'
                            }`}
                          >
                            {source}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {!hasVisibleInsights && (
                <div className="mb-8 p-5 rounded-2xl border border-zinc-200 bg-white text-sm text-zinc-600 no-print">
                  No insights match the selected filters. Adjust or clear filters to repopulate results.
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
                <MatrixCard title="Moments" subtext="External forces shaping their behavior" items={displayMatrix?.moments || []} delay={0.1} highlightedInsights={highlightedInsights} onDeepDive={handleDeepDive} showDocumentInsights={Boolean(matrixMeta?.hasUploadedDocuments)} />
                <MatrixCard title="Beliefs" subtext="Values they’re operating from" items={displayMatrix?.beliefs || []} delay={0.2} highlightedInsights={highlightedInsights} onDeepDive={handleDeepDive} showDocumentInsights={Boolean(matrixMeta?.hasUploadedDocuments)} />
                <MatrixCard title="Tone" subtext="What & how they feel" items={displayMatrix?.tone || []} delay={0.3} highlightedInsights={highlightedInsights} onDeepDive={handleDeepDive} showDocumentInsights={Boolean(matrixMeta?.hasUploadedDocuments)} />
                <MatrixCard title="Language" subtext="How they communicate" items={displayMatrix?.language || []} delay={0.4} highlightedInsights={highlightedInsights} onDeepDive={handleDeepDive} onOpenVocabularyExtractor={() => setIsVocabularyOpen(true)} showDocumentInsights={Boolean(matrixMeta?.hasUploadedDocuments)} />
                <MatrixCard title="Behaviors" subtext="How they act/interact" items={displayMatrix?.behaviors || []} delay={0.5} highlightedInsights={highlightedInsights} onDeepDive={handleDeepDive} showDocumentInsights={Boolean(matrixMeta?.hasUploadedDocuments)} />
                <MatrixCard title="Contradictions" subtext="Emerging tensions or shift in values or behavior" items={displayMatrix?.contradictions || []} delay={0.6} highlightedInsights={highlightedInsights} onDeepDive={handleDeepDive} showDocumentInsights={Boolean(matrixMeta?.hasUploadedDocuments)} />
                <MatrixCard title="Community" subtext="Who people look to for identity & belonging" items={displayMatrix?.community || []} delay={0.7} highlightedInsights={highlightedInsights} onDeepDive={handleDeepDive} showDocumentInsights={Boolean(matrixMeta?.hasUploadedDocuments)} />
                <MatrixCard title="Influencers" subtext="People who are shaping their beliefs & behavior" items={displayMatrix?.influencers || []} delay={0.8} highlightedInsights={highlightedInsights} onDeepDive={handleDeepDive} showDocumentInsights={Boolean(matrixMeta?.hasUploadedDocuments)} />
              </div>

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
                          href={source.url} 
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

        {matrix && visibleSavedMatrices.length > 0 && (
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
                    {new Date(sm.date).toLocaleDateString()}
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
        <p className="copyright-copy text-[10px] text-zinc-400 mt-1">© 2026 Brand Atlas by The Kapalaran Group LLC | All rights reserved</p>
      </footer>
    </div>
  );
}

function MatrixCard({ title, subtext, items, delay, highlightedInsights = [], onDeepDive, onOpenVocabularyExtractor, showDocumentInsights = false }: { title: string; subtext: string; items: MatrixItem[]; delay: number; highlightedInsights?: string[]; onDeepDive?: (item: MatrixItem) => void; onOpenVocabularyExtractor?: () => void; showDocumentInsights?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const INITIAL_SHOW = 3;

  const confidenceChipClass = (confidence?: string) => {
    if (confidence === 'high') {
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    }
    if (confidence === 'low') {
      return 'bg-amber-50 text-amber-700 border border-amber-200';
    }
    return 'bg-zinc-100 text-zinc-600 border border-zinc-200';
  };

  const extractEvidenceLabels = (text: string): { cleanText: string; labels: Array<'known' | 'inferred' | 'speculative'> } => {
    const labels: Array<'known' | 'inferred' | 'speculative'> = [];
    const cleanText = text;

    if (/\[KNOWN\]|\bKNOWN\b\s*[:\-]?/i.test(cleanText)) labels.push('known');
    if (/\[INFERRED?\]|\bINFERRED?\b\s*[:\-]?/i.test(cleanText)) labels.push('inferred');
    if (/\[SPECULATIVE\]|\bSPECULATIVE\b\s*[:\-]?/i.test(cleanText)) labels.push('speculative');

    const stripped = cleanText
      .replace(/\[(KNOWN|INFERRED|INFERED|SPECULATIVE)\]\s*/gi, '')
      .replace(/\b(KNOWN|INFERRED|INFERED|SPECULATIVE)\b\s*[:\-]?\s*/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    return { cleanText: stripped, labels };
  };
  
  if (!items || items.length === 0) return null;
  
  const visibleItems = isExpanded ? items : items.slice(0, INITIAL_SHOW);
  const hasMoreItems = items.length > INITIAL_SHOW;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-shadow duration-300 break-inside-avoid print-break-inside-avoid w-full"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900 uppercase tracking-wider">{title}</h3>
        {title === 'Language' && onOpenVocabularyExtractor && (
          <button
            type="button"
            onClick={onOpenVocabularyExtractor}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-[11px] font-semibold hover:bg-indigo-100 transition-colors no-print"
          >
            <FileText className="w-3.5 h-3.5" /> Vocabulary Extractor
          </button>
        )}
      </div>
      <p className="subheader-copy text-xs text-zinc-500 mb-4">{subtext}</p>
      <ul className="space-y-3">
        <AnimatePresence>
          {visibleItems.map((item, index) => {
            const isHighlighted = highlightedInsights.includes(item.text);
            const { cleanText, labels } = extractEvidenceLabels(item.text);
            return (
              <motion.li
                key={index}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className={`text-sm leading-relaxed flex items-start p-3 rounded-xl transition-all duration-300 group relative ${
                  isHighlighted
                    ? 'ring-2 ring-indigo-500 bg-indigo-50 shadow-md transform scale-[1.02] z-10 text-indigo-950'
                    : item.isHighlyUnique 
                      ? 'bg-indigo-50/50 border border-indigo-100/50 text-indigo-950' 
                      : showDocumentInsights && item.isFromDocument
                        ? 'bg-emerald-50/30 border border-emerald-100/30 text-emerald-950'
                        : 'text-zinc-600 hover:bg-zinc-50'
                }`}
              >
                {(item.isHighlyUnique || (showDocumentInsights && item.isFromDocument)) && (
                  <span className="mr-3 mt-0.5 shrink-0 flex items-center gap-1.5">
                    {item.isHighlyUnique && <Sparkles className={`w-4 h-4 ${isHighlighted ? 'text-indigo-600' : 'text-indigo-500'}`} />}
                    {showDocumentInsights && item.isFromDocument && <FileText className={`w-4 h-4 ${isHighlighted ? 'text-indigo-600' : 'text-emerald-500'}`} />}
                  </span>
                )}
                <span className="flex-1 pr-8">
                  {cleanText}
                  {labels.map((label) => (
                    <span key={`${index}-${label}`} className={`inline-block ml-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded align-middle ${evidenceLabelChipClass(label)}`}>
                      {label}
                    </span>
                  ))}
                  {item.confidenceLevel && (
                    <span className={`inline-block ml-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded align-middle ${confidenceChipClass(item.confidenceLevel)}`}>
                      {item.confidenceLevel} confidence
                    </span>
                  )}
                  <span className="inline-block ml-2 align-middle">
                    <TrendLifecycleBadge stage={item.trendLifecycle} />
                  </span>
                  {item.sourceType && (
                    <span className="inline-block ml-2 px-1.5 py-0.5 bg-zinc-100 text-zinc-500 text-[10px] uppercase tracking-wider font-semibold rounded border border-zinc-200 align-middle">
                      {item.sourceType}
                    </span>
                  )}
                </span>
                {onDeepDive && (
                  <button
                    onClick={() => onDeepDive(item)}
                    className={`absolute right-2 top-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all no-print ${
                      item.deepDive 
                        ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100 opacity-100' 
                        : 'text-zinc-400 hover:text-indigo-600 hover:bg-indigo-100'
                    }`}
                    title={item.deepDive ? "View Deep Dive" : "Generate Deep Dive"}
                  >
                    {item.deepDive ? <Check className="w-4 h-4" /> : <Target className="w-4 h-4" />}
                  </button>
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      
      {hasMoreItems && (
        <motion.button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors duration-200"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <span>
            {isExpanded 
              ? `Show less (${INITIAL_SHOW}/${items.length})` 
              : `Show all ${items.length} items`}
          </span>
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="w-4 h-4" />
          </motion.div>
        </motion.button>
      )}
    </motion.div>
  );
}
