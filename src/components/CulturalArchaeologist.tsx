import { getUserTelemetry } from '../services/telemetry';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { Search, Loader2, Sparkles, FileText, Presentation, ExternalLink, Info, Tag, Users, Filter, ChevronDown, Check, Clock, Trash2, Target, Upload, X, RefreshCw, Calendar, Activity, Palette, ArrowLeft, Menu, Shield } from 'lucide-react';
import { CompassRoseIcon } from './icons/CompassRoseIcon';
import { CulturalMatrix, MatrixItem, UploadedFile, DeepDiveReport, CulturalRerunFilters, AudienceSegmentationReport } from '../services/azure-openai';
import { generateCulturalMatrix, suggestBrands, askMatrixQuestion, generateDeepDive, generateDeepDivesBatch, generateAudienceSegmentation } from '../services/azure-openai';
import { SplashGrid } from './SplashGrid';
import { BrandDeepDivePage } from './DesignExcavator';
import { TrendLifecycleBadge } from './TrendLifecycleBadge';
import { ProgressiveLoader } from './ProgressiveLoader';
import { Accordion } from './Accordion';
import { FeedbackChatWidget } from './FeedbackChatWidget';
import { navigateToHashRoute, navigateToHomeDashboard } from '../services/navigation';
import { normalizeExternalHttpUrl, toSafeExternalHref } from '../services/external-links';
import { clearCulturalPrefill, readCulturalPrefill, saveCulturalPrefill } from '../services/cultural-prefill';
import {
  BRAND_SUGGESTION_DEBOUNCE_MS,
  getLocalBrandSuggestions,
  normalizeBrandTokens,
  parseBrandsInput,
} from '../services/brand-input';
import pptxgen from 'pptxgenjs';
import { supabase } from '../services/supabase-client';
import { runUserAction } from '../services/user-actions';
import { normalizeAppError } from '../services/api-errors';
import { logger } from '../services/logger';
import { SectionErrorBoundary } from './SectionErrorBoundary';
import { RecentResultsLibrary } from './RecentResultsLibrary';
import MenuPage, { type MenuPageCard } from './MenuPage';
import {
  APP_RECENT_RESULTS_MODES,
  saveRecentResult,
  type RecentResultRecord,
} from '../services/recent-results-storage';
import {
  APP_AUDIENCE_HISTORY_MODES,
  getAudienceHistory,
  saveAudienceHistoryEntry,
} from '../services/audience-history';
import { SourceLinkRow } from './SourceLinkRow';
import { MobileTwoLineSubcopy } from './MobileTwoLineSubcopy';
import { MobileResultsNav } from './MobileResultsNav';
import { ShowThinkingDropdown } from './ShowThinkingDropdown';
import { SPLASH_GLOBE_STATIC_PROPS } from './splashGlobeDefaults';
import AdminPage from './AdminPage';
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
import {
  hasMatrixDeepDiveContent,
  normalizeSavedMatrixRecord,
  normalizeSavedMatrixRecords,
  type SavedMatrixRecord,
} from '../services/cultural-saved-projects';

type SavedMatrix = SavedMatrixRecord;

type MatrixMetaState = {
  audience: string;
  brand: string;
  generations: string[];
  topicFocus?: string;
  sourcesType?: string[];
  hasUploadedDocuments?: boolean;
};

type CulturalRecentResult = RecentResultRecord & {
  savedMatrix?: SavedMatrix;
  matrix?: CulturalMatrix;
  matrixMeta?: MatrixMetaState;
  savedRowId?: string;
};

interface MatrixContext {
  audience: string;
  brand: string;
  generations: string[];
  topicFocus?: string;
}

interface DeepDivePersistenceContext {
  tableName: string;
  rowId: string;
}

interface OAuthTokenResponse {
  access_token: string;
  error?: string;
}

type UserTelemetry = {
  device: string;
  location: string;
  ip_address: string;
};

type MatrixInsightKey =
  | 'moments'
  | 'beliefs'
  | 'behaviors'
  | 'contradictions'
  | 'tone'
  | 'language'
  | 'community'
  | 'influencers';

type ConfidenceLevelFilter = 'low' | 'medium' | 'high';
type EvidenceLabelFilter = 'known' | 'inferred' | 'speculative';
type EvidenceTagLabel = EvidenceLabelFilter | 'analogy';
type TrendStageFilter = 'emerging' | 'peaking' | 'declining';
type ResultsTab = 'insights' | 'segmentation';
type SegmentationCustomInfoMap = Record<number, string>;
type SegmentationWorkspaceSnapshot = {
  matrix: CulturalMatrix;
  matrixMeta: MatrixMetaState;
  isSegmentationAuthorized?: boolean;
  selectedConfidenceFilters: ConfidenceLevelFilter[];
  selectedEvidenceFilters: EvidenceLabelFilter[];
  selectedTrendStageFilters: TrendStageFilter[];
  selectedSourceFilters: string[];
  showHighlyUniqueOnly: boolean;
  createdAt: string;
};

type SegmentationWorkspaceMemoryStore = Record<string, SegmentationWorkspaceSnapshot>;
type SegmentationWorkspaceWindow = Window & {
  __culturalSegmentationWorkspaceSnapshots?: SegmentationWorkspaceMemoryStore;
};
type SegmentRerunContextState = {
  audience: string;
  promptContext: string;
};

const MATRIX_INSIGHT_KEYS: MatrixInsightKey[] = [
  'moments',
  'beliefs',
  'behaviors',
  'contradictions',
  'tone',
  'language',
  'community',
  'influencers',
];

const CONFIDENCE_FILTERS: ConfidenceLevelFilter[] = ['high', 'medium', 'low'];
const EVIDENCE_FILTERS: EvidenceLabelFilter[] = ['known', 'inferred', 'speculative'];
const CULTURAL_ARCHAEOLOGIST_TABLE = 'Cultural_Archaeologist';
const CULTURAL_ARCHAEOLOGIST_TABLE_CANDIDATES = [CULTURAL_ARCHAEOLOGIST_TABLE, 'CulturalArchaeologist', 'searches'] as const;
const TREND_STAGE_FILTERS: TrendStageFilter[] = ['peaking', 'emerging', 'declining'];
const CULTURAL_ARCHAEOLOGIST_SHOW_THINKING_TEXT = 'Applied retrieval-grounded synthesis: collected language, behavior, and community artifacts, clustered recurring motifs and tensions, and generated a structured cultural map with source-grounded claims.';
const RESULTS_COMPLETE_SOUND_ID: CompletionSoundId = 'classic-chime';
const RESULTS_FILTERS_EXPLAINER_COPY = 'Results Filters add more context to your observation results and help discern how mainstream or niche a trend might be. For example, a result with High confidence, Known and Peaking is more likely to be a mainstream and familiar trend. A result with Low confidence, Speculative and Emerging likely requires further explanation through an Insight Deep Dive, but could lead to a break out trend.';
const SEGMENTATION_PASSWORD = 'segment2026';
const SEGMENTATION_PASSWORD_SUPPORT_COPY = 'Contact Your Administrator for More Information.';
const ADMIN_PASSWORD = 'brandatlas2026';
const ADMIN_AUTH_STORAGE_KEY = 'brand_atlas_admin_authorized';
const ADMIN_PASSWORD_SUPPORT_COPY = 'Contact Your Administrator for More Information.';
const DEFAULT_SEGMENTATION_TARGET_COUNT = 4;
const MIN_SEGMENTATION_TARGET_COUNT = 1;
const MAX_SEGMENTATION_TARGET_COUNT = 6;
const SEGMENTATION_WORKSPACE_QUERY_PARAM = 'segmentation_workspace';
const SEGMENTATION_WORKSPACE_STORAGE_PREFIX = 'cultural_segmentation_workspace:';
const SEGMENTATION_WORKSPACE_MEMORY_KEY = '__culturalSegmentationWorkspaceSnapshots';

const clampSegmentationTargetCount = (value: number): number => {
  if (!Number.isFinite(value)) {
    return DEFAULT_SEGMENTATION_TARGET_COUNT;
  }
  return Math.max(MIN_SEGMENTATION_TARGET_COUNT, Math.min(MAX_SEGMENTATION_TARGET_COUNT, Math.round(value)));
};

const buildSegmentationCustomizationInstructions = (
  segmentation: AudienceSegmentationReport | null,
  customInfoByIndex: SegmentationCustomInfoMap
): string[] => {
  if (!segmentation || !Array.isArray(segmentation.segments)) {
    return [];
  }

  return segmentation.segments
    .map((segment, index) => {
      const customInfo = (customInfoByIndex[index] || '').trim();
      if (!customInfo) return '';
      const segmentLabel = (segment.name || '').trim() || `Segment ${index + 1}`;
      return `Segment ${index + 1} (${segmentLabel}): ${customInfo}`;
    })
    .filter((line): line is string => line.length > 0);
};

const buildSegmentRerunPromptContext = (
  segment: AudienceSegmentationReport['segments'][number],
  segmentIndex: number
): string => {
  const segmentName = (segment.name || '').trim() || `Segment ${segmentIndex + 1}`;
  const archetype = (segment.archetype || '').trim();
  const profile = (segment.profile || '').trim();
  const demographicsSnippet = (segment.demographicsSnippet || '').trim();
  const keySignals = Array.isArray(segment.keySignals)
    ? segment.keySignals.map((signal) => (signal || '').trim()).filter(Boolean)
    : [];
  const messagingApproach = (segment.messagingApproach || '').trim();

  return [
    `Segment ${segmentIndex + 1} (${segmentName})`,
    `Prevalence: ${segment.prevalencePct}%`,
    archetype ? `Archetype: ${archetype}` : '',
    profile ? `Profile: ${profile}` : '',
    demographicsSnippet ? `Demographics: ${demographicsSnippet}` : '',
    keySignals.length > 0 ? `Key Signals: ${keySignals.join('; ')}` : '',
    messagingApproach ? `Messaging Approach: ${messagingApproach}` : '',
  ].filter(Boolean).join(' | ');
};

const buildTopicFocusWithBackgroundSegmentContext = (topicFocusValue: string, segmentPromptContext: string): string => {
  const cleanedTopicFocus = (topicFocusValue || '').trim();
  const cleanedSegmentPromptContext = (segmentPromptContext || '').trim();
  if (!cleanedSegmentPromptContext) {
    return cleanedTopicFocus;
  }

  const backgroundSegmentDirective = `Segment Context (background, do not rename audience): ${cleanedSegmentPromptContext}`;
  return [cleanedTopicFocus, backgroundSegmentDirective]
    .filter(Boolean)
    .join(' | ');
};

const sortSegmentationByPrevalence = (segmentation: AudienceSegmentationReport): AudienceSegmentationReport => {
  const sortedSegments = [...segmentation.segments].sort((left, right) => right.prevalencePct - left.prevalencePct);
  return {
    ...segmentation,
    segments: sortedSegments,
  };
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

const isMissingResultTextValue = (value?: string | null): boolean => {
  const normalized = (value || '').trim().toLowerCase();
  return normalized.length === 0 || normalized === 'n/a' || normalized === 'na' || normalized === 'data unavailable';
};

const isMatrixItemMissing = (item?: MatrixItem | null): boolean => {
  if (!item) return true;
  const cleaned = (item.text || '')
    .replace(/\[(KNOWN|INFERRED|INFERED|SPECULATIVE)\]\s*/gi, '')
    .replace(/\b(KNOWN|INFERRED|INFERED|SPECULATIVE)\b\s*[:\-]?\s*/gi, '')
    .trim();
  return isMissingResultTextValue(cleaned);
};

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
  return (value || '').trim().toLowerCase(); // already safe
};

const shouldHideSourceTypeChip = (sourceType?: string): boolean => {
  const normalized = normalizeSourceTypeValue(sourceType);
  if (!normalized) return true;
  return normalized.includes('provided corpus');
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

const normalizeMatrixItemText = (value?: string): string => {
  return (value || '').trim().toLowerCase();
};

const toSupabaseRowId = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const matchesMatrixItemFilters = (item: MatrixItem, filters?: CulturalRerunFilters): boolean => {
  if (!filters) return true;

  if (filters.confidenceLevels && filters.confidenceLevels.length > 0) {
    const confidence = (item.confidenceLevel || 'medium') as ConfidenceLevelFilter;
    if (!filters.confidenceLevels.includes(confidence)) {
      return false;
    }
  }

  if (filters.evidenceTypes && filters.evidenceTypes.length > 0) {
    const labels = extractEvidenceLabelsFromText(item.text);
    const hasEvidenceMatch = labels.some((label) => filters.evidenceTypes!.includes(label));
    if (!hasEvidenceMatch) {
      return false;
    }
  }

  if (filters.trendStages && filters.trendStages.length > 0) {
    const stage = normalizeTrendStage(item.trendLifecycle);
    if (!filters.trendStages.includes(stage)) {
      return false;
    }
  }

  if (filters.sourceTypes && filters.sourceTypes.length > 0) {
    const mappedSource = mapInsightSourceToSearchSource(item.sourceType);
    if (!mappedSource || !filters.sourceTypes.includes(mappedSource)) {
      return false;
    }
  }

  return true;
};

const mergeRerunMatrixIntoExisting = (
  existingMatrix: CulturalMatrix,
  rerunMatrix: CulturalMatrix,
  rerunFilters?: CulturalRerunFilters
): CulturalMatrix => {
  const hasActiveRerunFilters = Boolean(
    rerunFilters &&
      (
        (rerunFilters.confidenceLevels || []).length > 0 ||
        (rerunFilters.evidenceTypes || []).length > 0 ||
        (rerunFilters.trendStages || []).length > 0 ||
        (rerunFilters.sourceTypes || []).length > 0
      )
  );
  const pickDemographicValue = (rerunValue?: string | null, existingValue?: string | null): string | null => {
    const cleanedExistingValue = stripDemographicEvidenceMarkers(existingValue);
    const cleanedRerunValue = stripDemographicEvidenceMarkers(rerunValue);
    if (hasActiveRerunFilters && cleanedExistingValue) {
      return existingValue ?? null;
    }
    if (cleanedRerunValue) {
      return rerunValue ?? null;
    }
    return existingValue ?? null;
  };

  const merged: CulturalMatrix = {
    ...existingMatrix,
    demographics: {
      age: pickDemographicValue(rerunMatrix.demographics?.age, existingMatrix.demographics?.age),
      race: pickDemographicValue(rerunMatrix.demographics?.race, existingMatrix.demographics?.race),
      gender: pickDemographicValue(rerunMatrix.demographics?.gender, existingMatrix.demographics?.gender),
    },
    sociological_analysis: rerunMatrix.sociological_analysis || existingMatrix.sociological_analysis,
    vocabulary: rerunMatrix.vocabulary || existingMatrix.vocabulary,
    sources: Array.from(
      new Map(
        [...(existingMatrix.sources || []), ...(rerunMatrix.sources || [])]
          .filter((source) => (source?.url || '').trim().length > 0)
          .map((source) => [source.url.trim().toLowerCase(), source] as const)
      ).values()
    ),
  };

  MATRIX_INSIGHT_KEYS.forEach((key) => {
    const existingItems = existingMatrix[key] || [];
    const matchingRerunItems = (rerunMatrix[key] || []).filter((item) => matchesMatrixItemFilters(item, rerunFilters));
    const mergedItems: MatrixItem[] = [...existingItems];
    const seen = new Set(existingItems.map((item) => normalizeMatrixItemText(item.text)));

    matchingRerunItems.forEach((item) => {
      const normalizedText = normalizeMatrixItemText(item.text);
      if (!normalizedText || seen.has(normalizedText)) {
        return;
      }
      seen.add(normalizedText);
      mergedItems.push(item);
    });

    merged[key] = mergedItems;
  });

  return merged;
};

const stripDemographicEvidenceMarkers = (value: string | null | undefined): string => {
  if (!value) return '';

  const cleaned = value
    .replace(/\[(KNOWN|INFERRED|INFERED|SPECULATIVE)\]\s*/gi, '')
    .replace(/\b(KNOWN|INFERRED|INFERED|SPECULATIVE)\b\s*[:\-]?\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Remove trailing delimiter artifacts that frequently appear in model outputs,
  // e.g. "18-34 /" or "Female." after marker stripping.
  return cleaned
    .replace(/\s*[/|,;:]+\s*$/, '')
    .replace(/\s*[.]+\s*$/, '')
    .trim();
};

const DEMOGRAPHIC_FALLBACK_TEXT = 'Data unavailable';

const formatDemographicDisplayValue = (value: string | null | undefined): string => {
  const cleaned = stripDemographicEvidenceMarkers(value);
  return cleaned || DEMOGRAPHIC_FALLBACK_TEXT;
};

const extractEvidenceTags = (value: string): { cleanText: string; labels: EvidenceTagLabel[] } => {
  if (!value) {
    return { cleanText: '', labels: [] };
  }

  const labels: EvidenceTagLabel[] = [];
  const markerPattern = /\[(KNOWN|INFERRED|INFERED|SPECULATIVE|ANALOGY)\]|\b(KNOWN|INFERRED|INFERED|SPECULATIVE|ANALOGY)\b(?=\s*[:\-]|\s*$|\.)/g;
  let match: RegExpExecArray | null = markerPattern.exec(value);

  while (match) {
    const rawLabel = (match[1] || match[2] || '').toLowerCase(); // already safe
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

type RealWorldExampleSourceLink = {
  title: string;
  url: string;
};

type NormalizedRealWorldExampleEntry = {
  text: string;
  sourceLink: RealWorldExampleSourceLink | null;
};

const REAL_WORLD_EXAMPLE_URL_PATTERN = /(https?:\/\/[^\s)]+|www\.[^\s)]+)/i;
const REAL_WORLD_EXAMPLE_PLACEHOLDER_SOURCE_PATTERN = /\b(provided[-\s]+evidence[-\s]+digest|evidence[-\s]+digest|source[-\s]+digest|provided\s+context)\b/i;

const isPlaceholderRealWorldExampleSourceValue = (value?: string | null): boolean => {
  const normalized = (value || '').trim();
  if (!normalized) return false;
  return REAL_WORLD_EXAMPLE_PLACEHOLDER_SOURCE_PATTERN.test(normalized);
};

const normalizeRealWorldExampleSourceUrl = (rawUrl?: string | null): string | null => {
  if (!rawUrl || isPlaceholderRealWorldExampleSourceValue(rawUrl)) return null;
  const normalized = normalizeExternalHttpUrl(rawUrl);
  if (!normalized) return null;

  try {
    const hostname = new URL(normalized).hostname.toLowerCase();
    if (!hostname || !hostname.includes('.')) {
      return null;
    }
  } catch {
    return null;
  }

  return normalized;
};

const deriveSourceTitleFromUrl = (url: string): string => {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, '');
    return hostname || 'Source link';
  } catch {
    return 'Source link';
  }
};

const extractInlineSourceLinkFromText = (value: string): RealWorldExampleSourceLink | null => {
  const inlineMatch = value.match(REAL_WORLD_EXAMPLE_URL_PATTERN);
  if (!inlineMatch?.[1]) return null;
  const normalizedUrl = normalizeRealWorldExampleSourceUrl(inlineMatch[1]);
  if (!normalizedUrl) return null;
  return {
    title: deriveSourceTitleFromUrl(normalizedUrl),
    url: normalizedUrl,
  };
};

const normalizeRealWorldExampleEntry = (
  example: DeepDiveReport['realWorldExamples'][number]
): NormalizedRealWorldExampleEntry => {
  if (typeof example === 'string') {
    const text = example.trim();
    return {
      text,
      sourceLink: extractInlineSourceLinkFromText(text),
    };
  }

  const text = (example?.text || '').trim();
  const sourceUrl = normalizeRealWorldExampleSourceUrl(example?.sourceUrl || undefined);
  const sourceTitle = isPlaceholderRealWorldExampleSourceValue(example?.sourceTitle || '')
    ? ''
    : (example?.sourceTitle || '').trim();

  return {
    text,
    sourceLink: sourceUrl
      ? {
          title: sourceTitle || deriveSourceTitleFromUrl(sourceUrl),
          url: sourceUrl,
        }
      : null,
  };
};

const normalizeDeepDiveSourceLinks = (
  sources?: DeepDiveReport['sources']
): RealWorldExampleSourceLink[] => {
  return (sources || [])
    .map((source) => {
      const sourceUrl = normalizeRealWorldExampleSourceUrl(source?.url || undefined);
      if (!sourceUrl) return null;
      const sourceTitle = isPlaceholderRealWorldExampleSourceValue(source?.title || '')
        ? ''
        : (source?.title || '').trim();

      return {
        title: sourceTitle || deriveSourceTitleFromUrl(sourceUrl),
        url: sourceUrl,
      };
    })
    .filter((source): source is RealWorldExampleSourceLink => Boolean(source));
};

type AskAnswerSection = {
  title?: string;
  sentences: Array<{
    text: string;
    labels: EvidenceTagLabel[];
  }>;
};

const splitIntoAskAnswerSentences = (value: string): string[] => {
  if (!value || !value.trim()) return [];
  const normalized = value.replace(/\r\n/g, '\n').replace(/\n+/g, ' ').trim();
  if (!normalized) return [];
  const parts = normalized
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [normalized];
};

const constrainSentenceEvidenceLabels = (labels: EvidenceTagLabel[]): EvidenceTagLabel[] => {
  if (labels.length <= 1) return labels;
  // Keep exactly one evidence chip per sentence to avoid contradictory multi-tagging.
  return [labels[0]];
};

const parseAskAnswerSentences = (value: string): AskAnswerSection['sentences'] => {
  const sentenceParts = splitIntoAskAnswerSentences(value);
  return sentenceParts
    .map((sentence) => {
      const parsed = extractEvidenceTags(sentence);
      return {
        text: parsed.cleanText,
        labels: constrainSentenceEvidenceLabels(parsed.labels),
      };
    })
    .filter((sentence) => sentence.text);
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
      return {
        title: optionMatch[1],
        sentences: parseAskAnswerSentences(optionMatch[2].trim()),
      };
    }

    return {
      sentences: parseAskAnswerSentences(chunk),
    };
  }).filter((section) => section.sentences.length > 0);
};

const evidenceLabelChipClass = (label: EvidenceTagLabel): string => {
  if (label === 'analogy') {
    return 'bg-zinc-100 text-zinc-600 border border-zinc-200';
  }
  return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
};

const sanitizeDemographics = (demographics: { age?: string | null; race?: string | null; gender?: string | null }) => ({
  age: formatDemographicDisplayValue(demographics.age),
  race: formatDemographicDisplayValue(demographics.race),
  gender: formatDemographicDisplayValue(demographics.gender),
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

const MAX_CULTURAL_AUDIENCE_INPUT_LENGTH = 180;
const MAX_CULTURAL_BRAND_INPUT_LENGTH = 120;
const MAX_CULTURAL_TOPIC_INPUT_LENGTH = 180;
const CULTURAL_AUDIENCE_GUIDANCE_HELPER = 'Add the audience you want to analyze.';
const CULTURAL_AUDIENCE_GUIDANCE_TOOLTIP = 'The more specific your audience, the more specific your results. Examples: Gen Z women, AI tech professionals, Homebuyers.';
const CULTURAL_BRANDS_GUIDANCE_HELPER = 'Add one or more brands or a category.';
const CULTURAL_BRANDS_GUIDANCE_TOOLTIP = 'This will help you analyze the interesection of audience and brand/category. Examples: Nike, Adidas, Hoka or categories like premium skincare, energy drinks, athleisure. Press Enter to add each.';
const CULTURAL_TOPIC_GUIDANCE_HELPER = 'Add a question or topic you want to explore.';
const CULTURAL_TOPIC_GUIDANCE_TOOLTIP = 'Examples: Gen Z purchase behavior, post-workout rituals, why runners switch from Nike to Hoka.';
const CULTURAL_GENERATION_FILTER_EXPLAINER_TOOLTIP = 'Select one or more age groups to focus your analysis.';
const CULTURAL_SOURCES_FILTER_EXPLAINER_TOOLTIP = 'Select the type of source(s) for your results. Source type adds context and specificity to observations.';
const CULTURAL_UPLOAD_DOCUMENTS_EXPLAINER_TOOLTIP = 'Upload one or more documents to complement your analysis.';

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

const buildSegmentationWorkspaceStorageKey = (workspaceId: string): string => {
  return `${SEGMENTATION_WORKSPACE_STORAGE_PREFIX}${workspaceId}`;
};

const isSegmentationWorkspaceSnapshot = (value: unknown): value is SegmentationWorkspaceSnapshot => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<SegmentationWorkspaceSnapshot>;
  return Boolean(candidate.matrix && candidate.matrixMeta);
};

const persistSegmentationWorkspaceSnapshotToMemory = (
  targetWindow: Window | null | undefined,
  workspaceId: string,
  snapshot: SegmentationWorkspaceSnapshot
): boolean => {
  if (!targetWindow) {
    return false;
  }

  try {
    const typedWindow = targetWindow as SegmentationWorkspaceWindow;
    const existingStore = typedWindow[SEGMENTATION_WORKSPACE_MEMORY_KEY];
    const memoryStore: SegmentationWorkspaceMemoryStore =
      existingStore && typeof existingStore === 'object'
        ? existingStore
        : {};
    memoryStore[workspaceId] = snapshot;
    typedWindow[SEGMENTATION_WORKSPACE_MEMORY_KEY] = memoryStore;
    return true;
  } catch (error) {
    console.warn('Failed to persist segmentation workspace snapshot in memory:', error);
    return false;
  }
};

const readSegmentationWorkspaceSnapshotFromMemory = (
  targetWindow: Window | null | undefined,
  workspaceId: string
): SegmentationWorkspaceSnapshot | null => {
  if (!targetWindow) {
    return null;
  }

  try {
    const typedWindow = targetWindow as SegmentationWorkspaceWindow;
    const memoryStore = typedWindow[SEGMENTATION_WORKSPACE_MEMORY_KEY];
    if (!memoryStore || typeof memoryStore !== 'object') {
      return null;
    }
    const snapshotCandidate = memoryStore[workspaceId];
    if (!isSegmentationWorkspaceSnapshot(snapshotCandidate)) {
      return null;
    }
    return snapshotCandidate;
  } catch (error) {
    console.warn('Failed to read segmentation workspace snapshot from memory:', error);
    return null;
  }
};

const removeSegmentationWorkspaceSnapshotFromMemory = (
  targetWindow: Window | null | undefined,
  workspaceId: string
): void => {
  if (!targetWindow) {
    return;
  }

  try {
    const typedWindow = targetWindow as SegmentationWorkspaceWindow;
    const memoryStore = typedWindow[SEGMENTATION_WORKSPACE_MEMORY_KEY];
    if (!memoryStore || typeof memoryStore !== 'object' || !memoryStore[workspaceId]) {
      return;
    }
    delete memoryStore[workspaceId];
  } catch (error) {
    console.warn('Failed to remove segmentation workspace snapshot from memory:', error);
  }
};

const readSegmentationWorkspaceOpenerWindow = (): Window | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    if (!window.opener || window.opener.closed) {
      return null;
    }
    return window.opener;
  } catch (error) {
    console.warn('Failed to access segmentation workspace opener window:', error);
    return null;
  }
};

const persistSegmentationWorkspaceSnapshot = (
  workspaceId: string,
  snapshot: SegmentationWorkspaceSnapshot
): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  const serializedSnapshot = JSON.stringify(snapshot);
  let didPersistToLocalStorage = false;

  try {
    window.localStorage.setItem(buildSegmentationWorkspaceStorageKey(workspaceId), serializedSnapshot);
    didPersistToLocalStorage = true;
  } catch (error) {
    console.warn('Failed to persist segmentation workspace snapshot:', error);
  }

  const didPersistToMemory = persistSegmentationWorkspaceSnapshotToMemory(window, workspaceId, snapshot);
  console.log('[CulturalArchaeologist] Segmentation workspace snapshot persistence status.', {
    workspaceId,
    didPersistToLocalStorage,
    didPersistToMemory,
    snapshotSizeBytes: serializedSnapshot.length,
  });
  return didPersistToLocalStorage || didPersistToMemory;
};

const readSegmentationWorkspaceSnapshot = (workspaceId: string): SegmentationWorkspaceSnapshot | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawSnapshot = window.localStorage.getItem(buildSegmentationWorkspaceStorageKey(workspaceId));
    if (!rawSnapshot) {
      console.log('[CulturalArchaeologist] No segmentation workspace snapshot found in localStorage.', { workspaceId });
    } else {
      const parsed = JSON.parse(rawSnapshot);
      if (isSegmentationWorkspaceSnapshot(parsed)) {
        console.log('[CulturalArchaeologist] Loaded segmentation workspace snapshot from localStorage.', { workspaceId });
        return parsed;
      }
      console.log('[CulturalArchaeologist] Ignoring invalid segmentation workspace snapshot from localStorage.', { workspaceId });
    }
  } catch (error) {
    console.warn('Failed to read segmentation workspace snapshot:', error);
  }

  const windowMemorySnapshot = readSegmentationWorkspaceSnapshotFromMemory(window, workspaceId);
  if (windowMemorySnapshot) {
    console.log('[CulturalArchaeologist] Loaded segmentation workspace snapshot from current tab memory.', { workspaceId });
    return windowMemorySnapshot;
  }

  const openerWindow = readSegmentationWorkspaceOpenerWindow();
  const openerMemorySnapshot = readSegmentationWorkspaceSnapshotFromMemory(openerWindow, workspaceId);
  if (openerMemorySnapshot) {
    const mirroredIntoCurrentWindow = persistSegmentationWorkspaceSnapshotToMemory(window, workspaceId, openerMemorySnapshot);
    console.log('[CulturalArchaeologist] Loaded segmentation workspace snapshot from opener tab memory.', {
      workspaceId,
      mirroredIntoCurrentWindow,
    });
    return openerMemorySnapshot;
  }

  console.log('[CulturalArchaeologist] Segmentation workspace snapshot was not found in any storage layer.', { workspaceId });
  return null;
};

const removeSegmentationWorkspaceSnapshot = (workspaceId: string): void => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(buildSegmentationWorkspaceStorageKey(workspaceId));
  } catch (error) {
    console.warn('Failed to remove segmentation workspace snapshot:', error);
  }

  removeSegmentationWorkspaceSnapshotFromMemory(window, workspaceId);
  const openerWindow = readSegmentationWorkspaceOpenerWindow();
  removeSegmentationWorkspaceSnapshotFromMemory(openerWindow, workspaceId);
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
  helperTextClassName = 'text-zinc-500',
}: InputGuidanceProps) => {
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const guidanceRef = useRef<HTMLDivElement | null>(null);
  const tooltipId = `${baseTestId}-tooltip`;

  const openTooltip = useCallback((reason: string) => {
    setIsTooltipOpen((wasOpen) => {
      if (!wasOpen) {
        console.log('[CulturalArchaeologist] Input guidance tooltip opened.', { guidanceId: baseTestId, reason });
      }
      return true;
    });
  }, [baseTestId]);

  const closeTooltip = useCallback((reason: string) => {
    setIsTooltipOpen((wasOpen) => {
      if (wasOpen) {
        console.log('[CulturalArchaeologist] Input guidance tooltip closed.', { guidanceId: baseTestId, reason });
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
    <div data-testid={baseTestId} className="mt-2 ml-2 inline-flex items-start gap-1.5 text-xs text-left">
      <span className={`self-start leading-tight text-left ${helperTextClassName}`}>{helperText}</span>
      <div
        ref={guidanceRef}
        className="relative inline-flex items-center"
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
          className="inline-flex items-center justify-center rounded-full p-0.5 text-zinc-400 hover:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
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

type FieldHoverExplainerProps = {
  tooltipLabel: string;
  tooltipText: string;
  baseTestId: string;
  suppressTooltip?: boolean;
  disableOnMobile?: boolean;
  children: React.ReactNode;
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
        console.log('[CulturalArchaeologist] Field explainer tooltip opened.', {
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
        console.log('[CulturalArchaeologist] Field explainer tooltip closed.', {
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

export default function CulturalArchaeologist() {
  const SPLASH_DURATION_MS = 3000;
  const resolveExperienceFromLocation = (): 'research' | 'brand' | 'admin' | null => {
    if (typeof window === 'undefined') return null;

    const pathname = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();

    if (pathname === '/admin' || hash === '#admin') {
      return 'admin';
    }

    if (
      pathname === '/design-excavator' ||
      hash === '#design-excavator' ||
      pathname === '/visual-design-excavator' ||
      hash === '#visual-design-excavator'
    ) {
      return 'brand';
    }

    if (pathname === '/cultural-archaeologist' || hash === '#cultural-archaeologist') {
      return 'research';
    }

    return null;
  };
  const shouldSkipSplashForLocation = (): boolean => {
    if (typeof window === 'undefined') return false;
    const skipSplashToHome = new URLSearchParams(window.location.search).get('home') === '1';
    return skipSplashToHome || resolveExperienceFromLocation() !== null;
  };
  const initialExperience = resolveExperienceFromLocation();
  // Instantly skip splash in test environments
  const [showSplash, setShowSplash] = useState(() => {
    if (shouldSkipSplashForLocation()) {
      return false;
    }
    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test') {
      return false;
    }
    return true;
  });
  const [isSplashHeld, setIsSplashHeld] = useState(false);
  const [isSplashManualMode, setIsSplashManualMode] = useState(false);
  const [activeExperience, setActiveExperience] = useState<'research' | 'brand' | 'admin' | null>(initialExperience);
  const [hasOpenedBrand, setHasOpenedBrand] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isMobileTopBarVisible, setIsMobileTopBarVisible] = useState(true);
  const lastMobileScrollYRef = useRef(0);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [brandInput, setBrandInput] = useState('');
  const [audience, setAudience] = useState('');
  const [audienceDetail, setAudienceDetail] = useState('');
  const [savedAudiencesByIp, setSavedAudiencesByIp] = useState<string[]>([]);
  const [isAudienceHistoryOpen, setIsAudienceHistoryOpen] = useState(false);
  const [userTelemetry, setUserTelemetry] = useState<UserTelemetry | null>(null);
  const userTelemetryRef = useRef<UserTelemetry | null>(null);
  const [isAudienceDetailOpen, setIsAudienceDetailOpen] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [brandSuggestions, setBrandSuggestions] = useState<string[]>([]);
  const [isSuggestingBrands, setIsSuggestingBrands] = useState(false);
  const [hasQuotaError, setHasQuotaError] = useState(false);
  
  const [selectedGenerations, setSelectedGenerations] = useState<string[]>([]);
  const [isGenerationDropdownOpen, setIsGenerationDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const [topicFocus, setTopicFocus] = useState('');
  const [segmentRerunContext, setSegmentRerunContext] = useState<SegmentRerunContextState | null>(null);
  const [sourcesType, setSourcesType] = useState<string[]>([]);
  const [isSourcesDropdownOpen, setIsSourcesDropdownOpen] = useState(false);
  const sourcesDropdownRef = useRef<HTMLDivElement>(null);
  const segmentationTabPanelRef = useRef<HTMLDivElement>(null);
  
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [matrixQuestion, setMatrixQuestion] = useState('');
  const [matrixAnswer, setMatrixAnswer] = useState('');
  const [isAskingQuestion, setIsAskingQuestion] = useState(false);
  const [highlightedInsights, setHighlightedInsights] = useState<string[]>([]);
  
  const [deepDiveInsight, setDeepDiveInsight] = useState<MatrixItem | null>(null);
  const [deepDiveCategory, setDeepDiveCategory] = useState<string | null>(null);
  const [deepDiveResult, setDeepDiveResult] = useState<DeepDiveReport | null>(null);
  const [isDeepDiveLoading, setIsDeepDiveLoading] = useState(false);
  const [activeResultsTab, setActiveResultsTab] = useState<ResultsTab>('insights');
  const [isSegmentationAuthorized, setIsSegmentationAuthorized] = useState(false);
  const [isSegmentationLoading, setIsSegmentationLoading] = useState(false);
  const [segmentationResult, setSegmentationResult] = useState<AudienceSegmentationReport | null>(null);
  const [originalSegmentationResult, setOriginalSegmentationResult] = useState<AudienceSegmentationReport | null>(null);
  const [hasPromptRefinedSegmentation, setHasPromptRefinedSegmentation] = useState(false);
  const [segmentationTargetCount, setSegmentationTargetCount] = useState<number>(DEFAULT_SEGMENTATION_TARGET_COUNT);
  const [segmentationCustomInfoByIndex, setSegmentationCustomInfoByIndex] = useState<SegmentationCustomInfoMap>({});
  const [segmentationError, setSegmentationError] = useState<string | null>(null);
  const [segmentationPasswordInput, setSegmentationPasswordInput] = useState('');
  const [segmentationPasswordError, setSegmentationPasswordError] = useState<string | null>(null);
  const [isSegmentationPasswordPopoutOpen, setIsSegmentationPasswordPopoutOpen] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminPasswordError, setAdminPasswordError] = useState<string | null>(null);
  const [isAdminPasswordPopoutOpen, setIsAdminPasswordPopoutOpen] = useState(false);
  const [isAdminAuthorized, setIsAdminAuthorized] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    try {
      return window.localStorage.getItem(ADMIN_AUTH_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [shouldAutoScrollToSegmentationWorkspace, setShouldAutoScrollToSegmentationWorkspace] = useState(false);
  const [isVocabularyOpen, setIsVocabularyOpen] = useState(false);
  
  const [savedMatrices, setSavedMatrices] = useState<SavedMatrix[]>([]);
  const [resolvedCulturalTable, setResolvedCulturalTable] = useState<string>(CULTURAL_ARCHAEOLOGIST_TABLE);
  const [isBrandDropdownOpen, setIsBrandDropdownOpen] = useState(false);
  const audienceHistoryRef = useRef<HTMLDivElement>(null);
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
  const [showGoogleAuthModal, setShowGoogleAuthModal] = useState(false);
  const [matrix, setMatrix] = useState<CulturalMatrix | null>(null);
  const [matrixMeta, setMatrixMeta] = useState<MatrixMetaState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [suggestionsRetryNonce, setSuggestionsRetryNonce] = useState(0);
  const [fileReadErrors, setFileReadErrors] = useState<string[]>([]);
  const [exportError, setExportError] = useState<{ type: 'pptx' | 'pdf'; message: string } | null>(null);
  const normalizedBrands = useMemo(() => normalizeBrandTokens(selectedBrands), [selectedBrands]);
  const brandInputQuery = brandInput.trim();

  const [isGeneratingDeepDives, setIsGeneratingDeepDives] = useState(false);
  const [deepDiveProgress, setDeepDiveProgress] = useState({ current: 0, total: 0 });
  const [isInsightDeepDivesButtonHovered, setIsInsightDeepDivesButtonHovered] = useState(false);
  const [deepDivePersistenceContext, setDeepDivePersistenceContext] = useState<DeepDivePersistenceContext | null>(null);

  const [selectedConfidenceFilters, setSelectedConfidenceFilters] = useState<ConfidenceLevelFilter[]>([]);
  const [selectedEvidenceFilters, setSelectedEvidenceFilters] = useState<EvidenceLabelFilter[]>([]);
  const [selectedTrendStageFilters, setSelectedTrendStageFilters] = useState<TrendStageFilter[]>([]);
  const [selectedSourceFilters, setSelectedSourceFilters] = useState<string[]>([]);
  const [showHighlyUniqueOnly, setShowHighlyUniqueOnly] = useState(false);
  const [isResultsFiltersHeadingTooltipOpen, setIsResultsFiltersHeadingTooltipOpen] = useState(false);
  const resultsFiltersHeadingTooltipRef = useRef<HTMLDivElement | null>(null);
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

  const resolveTelemetryForSession = useCallback(async (): Promise<UserTelemetry> => {
    if (userTelemetryRef.current) {
      return userTelemetryRef.current;
    }

    const resolvedTelemetry = await getUserTelemetry();
    userTelemetryRef.current = resolvedTelemetry;
    setUserTelemetry(resolvedTelemetry);
    console.log('[CulturalArchaeologist] Resolved telemetry for session.', {
      device: resolvedTelemetry.device,
      location: resolvedTelemetry.location,
      hasIpAddress: Boolean((resolvedTelemetry.ip_address || '').trim()),
    });
    return resolvedTelemetry;
  }, []);

  const filteredAudienceHistory = useMemo(() => {
    const query = (audience || '').trim().toLowerCase();
    return savedAudiencesByIp
      .filter((entry) => {
        const normalizedEntry = (entry || '').trim().toLowerCase();
        if (!normalizedEntry) {
          return false;
        }
        if (!query) {
          return true;
        }
        if (normalizedEntry === query) {
          return false;
        }
        return normalizedEntry.includes(query);
      })
      .slice(0, 8);
  }, [audience, savedAudiencesByIp]);

  const openResultsFiltersHeadingTooltip = useCallback((reason: string) => {
    setIsResultsFiltersHeadingTooltipOpen((wasOpen) => {
      if (!wasOpen) {
        console.log('[CulturalArchaeologist] Results filters heading tooltip opened.', { reason });
      }
      return true;
    });
  }, []);

  const closeResultsFiltersHeadingTooltip = useCallback((reason: string) => {
    setIsResultsFiltersHeadingTooltipOpen((wasOpen) => {
      if (wasOpen) {
        console.log('[CulturalArchaeologist] Results filters heading tooltip closed.', { reason });
      }
      return false;
    });
  }, []);

  useEffect(() => {
    if (!isResultsFiltersHeadingTooltipOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const eventTarget = event.target as Node | null;
      if (!eventTarget || !resultsFiltersHeadingTooltipRef.current) return;
      if (!resultsFiltersHeadingTooltipRef.current.contains(eventTarget)) {
        closeResultsFiltersHeadingTooltip('outside-click');
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeResultsFiltersHeadingTooltip('escape');
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
  }, [closeResultsFiltersHeadingTooltip, isResultsFiltersHeadingTooltipOpen]);

  useEffect(() => {
    let cancelled = false;

    const loadAudienceHistoryForCurrentIp = async () => {
      try {
        const telemetryForHistory = userTelemetry ?? await resolveTelemetryForSession();
        if (cancelled) {
          return;
        }
        const history = getAudienceHistory(
          APP_AUDIENCE_HISTORY_MODES.CULTURAL_ARCHAEOLOGIST,
          telemetryForHistory.ip_address
        );
        setSavedAudiencesByIp(history);
        console.log('[CulturalArchaeologist] Loaded IP-gated audience history.', {
          ipAddress: (telemetryForHistory.ip_address || '').trim() || 'missing',
          count: history.length,
        });
      } catch (error) {
        console.warn('[CulturalArchaeologist] Failed to load IP-gated audience history.', error);
        if (!cancelled) {
          setSavedAudiencesByIp([]);
        }
      }
    };

    void loadAudienceHistoryForCurrentIp();

    return () => {
      cancelled = true;
    };
  }, [resolveTelemetryForSession, userTelemetry]);

  const activeRerunFilters = useMemo<CulturalRerunFilters>(() => ({
    confidenceLevels: [...selectedConfidenceFilters],
    evidenceTypes: [...selectedEvidenceFilters],
    trendStages: [...selectedTrendStageFilters],
    sourceTypes: [...selectedSourceFilters],
  }), [selectedConfidenceFilters, selectedEvidenceFilters, selectedTrendStageFilters, selectedSourceFilters]);

  const filteredMatrix = useMemo(() => {
    if (!matrix) {
      return null;
    }

    const nextMatrix: CulturalMatrix = { ...matrix };
    MATRIX_INSIGHT_KEYS.forEach((key) => {
      nextMatrix[key] = (matrix[key] || []).filter((item) => {
        if (!matchesMatrixItemFilters(item, activeRerunFilters)) {
          return false;
        }
        if (showHighlyUniqueOnly && !item.isHighlyUnique) {
          return false;
        }
        return true;
      });
    });

    return nextMatrix;
  }, [matrix, activeRerunFilters, showHighlyUniqueOnly]);

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
    selectedSourceFilters.length +
    (showHighlyUniqueOnly ? 1 : 0);
  const hasActiveResultFilters = activeFilterCount > 0;
  const displayMatrix = filteredMatrix || matrix;
  const isInsightsTabActive = activeResultsTab === 'insights';
  const isSegmentationTabActive = activeResultsTab === 'segmentation';
  const hasVisibleInsights =
    !!displayMatrix && MATRIX_INSIGHT_KEYS.some((key) => (displayMatrix[key] || []).length > 0);
  const segmentationCustomizationInstructions = useMemo(
    () => buildSegmentationCustomizationInstructions(segmentationResult, segmentationCustomInfoByIndex),
    [segmentationResult, segmentationCustomInfoByIndex]
  );
  const hasSegmentationCustomizationInstructions = segmentationCustomizationInstructions.length > 0;
  const structuredMatrixAnswer = useMemo(() => structureAskAnswer(matrixAnswer), [matrixAnswer]);
  const culturalResultNavItems = useMemo(() => {
    if (!matrix) {
      return [];
    }

    const baseItems = [
      { id: 'cultural-results-ask', label: 'Audience Q&A' },
      { id: 'cultural-results-demographics', label: 'Demographics' },
      { id: 'cultural-results-filters', label: 'Filters' },
      { id: 'cultural-result-section-moments', label: 'Moments' },
      { id: 'cultural-result-section-beliefs', label: 'Beliefs' },
      { id: 'cultural-result-section-behaviors', label: 'Behaviors' },
      { id: 'cultural-result-section-contradictions', label: 'Contradictions' },
      { id: 'cultural-result-section-tone', label: 'Tone' },
      { id: 'cultural-result-section-language', label: 'Language' },
      { id: 'cultural-result-section-community', label: 'Community' },
      { id: 'cultural-result-section-influencers', label: 'Influencers' },
    ];

    if (matrix.sources && matrix.sources.length > 0) {
      baseItems.push({ id: 'cultural-results-sources', label: 'Sources' });
    }

    return baseItems;
  }, [matrix]);

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

  const applyDeepDivePersistenceFromRowId = (
    rowIdValue: string | number | null | undefined
  ): string | null => {
    const savedRowId = toSupabaseRowId(rowIdValue);
    setDeepDivePersistenceContext(
      savedRowId
        ? {
            tableName: resolvedCulturalTable,
            rowId: savedRowId,
          }
        : null
    );
    return savedRowId;
  };

  const applySavedMatrixSelection = (
    sm: SavedMatrix,
    shouldScroll = false,
    options?: { skipRecentTracking?: boolean; recentResultId?: string }
  ) => {
    resetSegmentationWorkspace('insights');
    const parsedBrands = parseBrandsInput(sm.brand || '');
    if (parsedBrands.length > 1) {
      setSelectedBrands(parsedBrands);
      setBrandInput('');
    } else {
      setSelectedBrands([]);
      setBrandInput(sm.brand || '');
    }

    setAudience(sm.audience);
    setAudienceDetail('');
    setIsAudienceDetailOpen(false);
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

    const persistedRowId = applyDeepDivePersistenceFromRowId(sm.id);

    if (!options?.skipRecentTracking) {
      const recentItem: CulturalRecentResult = {
        id: options?.recentResultId || sm.id,
        title: (sm.customName || sm.brand || 'Saved Cultural Result').trim(),
        description: `Audience: ${(sm.audience || 'Not specified').trim()}`,
        savedMatrix: sm,
        savedRowId: persistedRowId || undefined,
      };
      console.log('[CulturalArchaeologist] Tracking recently viewed saved matrix.', {
        id: recentItem.id,
        savedRowId: recentItem.savedRowId || null,
        title: recentItem.title,
      });
      saveRecentResult(APP_RECENT_RESULTS_MODES.CULTURAL_ARCHAEOLOGIST, recentItem);
      setRecentResultsRefreshNonce((prev) => prev + 1);
    }

    if (shouldScroll) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const hydrateSavedProjectFromSupabase = async (
    savedRowIdValue: string | null | undefined,
    options?: { recentResultId?: string; shouldScroll?: boolean }
  ) => {
    const savedRowId = toSupabaseRowId(savedRowIdValue);
    if (!savedRowId) {
      console.log('[CulturalArchaeologist] Skipping saved-project hydration because row id is unavailable.', {
        savedRowIdValue: savedRowIdValue || null,
      });
      return;
    }

    console.log('[CulturalArchaeologist] Reloading saved project from Supabase to restore original deep dives.', {
      tableName: resolvedCulturalTable,
      rowId: savedRowId,
    });

    try {
      const { data, error } = await supabase
        .from(resolvedCulturalTable)
        .select('*')
        .eq('id', savedRowId)
        .maybeSingle();

      if (error) {
        logger.warn('Failed to reload saved cultural project from Supabase', error);
        return;
      }

      const normalizedSavedMatrix = normalizeSavedMatrixRecord(data);
      if (!normalizedSavedMatrix) {
        console.log('[CulturalArchaeologist] Saved-project hydration returned no normalizable matrix payload.', {
          tableName: resolvedCulturalTable,
          rowId: savedRowId,
        });
        return;
      }

      const hadDeepDivesBeforeReload = hasMatrixDeepDiveContent(matrix);
      const hasDeepDivesAfterReload = hasMatrixDeepDiveContent(normalizedSavedMatrix.matrix);
      console.log('[CulturalArchaeologist] Saved-project hydration complete.', {
        rowId: savedRowId,
        hadDeepDivesBeforeReload,
        hasDeepDivesAfterReload,
      });

      applySavedMatrixSelection(
        normalizedSavedMatrix,
        Boolean(options?.shouldScroll),
        { recentResultId: options?.recentResultId }
      );
      setSavedMatrices((prev) =>
        prev.map((entry) =>
          String(entry.id) === String(savedRowId)
            ? normalizedSavedMatrix
            : entry
        )
      );

      if (!hadDeepDivesBeforeReload && hasDeepDivesAfterReload) {
        setToast('Loaded saved insight deep dives.');
      }
    } catch (error) {
      logger.warn('Unexpected error while reloading saved cultural project from Supabase', error);
    }
  };

  const loadSavedMatrix = (sm: SavedMatrix, shouldScroll = false, recentResultId?: string) => {
    console.log('[CulturalArchaeologist] Loading saved matrix and resetting segmentation tab state.', {
      id: sm.id,
      recentResultId: recentResultId || null,
      shouldScroll,
      hasLocalDeepDives: hasMatrixDeepDiveContent(sm.matrix),
    });

    applySavedMatrixSelection(sm, shouldScroll, { recentResultId });
    void hydrateSavedProjectFromSupabase(sm.id, {
      recentResultId: recentResultId || sm.id,
      shouldScroll: false,
    });
  };

  const applyRecentResultMatrixSelection = (
    item: CulturalRecentResult,
    shouldScroll = true
  ) => {
    if (!item.matrix || !item.matrixMeta) {
      return;
    }

    resetSegmentationWorkspace('insights');
    const savedRowId = applyDeepDivePersistenceFromRowId(item.savedRowId);
    setMatrix(item.matrix);
    setMatrixMeta(item.matrixMeta);

    if (shouldScroll) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    if (savedRowId) {
      void hydrateSavedProjectFromSupabase(savedRowId, {
        recentResultId: String(item.id),
        shouldScroll: false,
      });
    }
  };

  const deepDiveDragControls = useDragControls();
  const reportRef = useRef<HTMLDivElement>(null);
  const splashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const splashStartedAtRef = useRef<number | null>(null);
  const splashRemainingMsRef = useRef<number>(SPLASH_DURATION_MS);

  useEffect(() => {
    const syncExperienceFromLocation = () => {
      const nextExperience = resolveExperienceFromLocation();
      const shouldSkipSplash = shouldSkipSplashForLocation();
      logger.debug('Syncing experience from location', {
        pathname: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
        nextExperience,
        shouldSkipSplash,
      });
      if (shouldSkipSplash) {
        setShowSplash(false);
      }
      setActiveExperience(nextExperience);
    };

    window.addEventListener('hashchange', syncExperienceFromLocation);
    window.addEventListener('popstate', syncExperienceFromLocation);

    return () => {
      window.removeEventListener('hashchange', syncExperienceFromLocation);
      window.removeEventListener('popstate', syncExperienceFromLocation);
    };
  }, []);

  useEffect(() => {
    if (activeExperience === 'brand') {
      setHasOpenedBrand(true);
    }
  }, [activeExperience]);

  useEffect(() => {
    if (activeExperience !== 'admin') {
      setIsAdminPasswordPopoutOpen(false);
      return;
    }

    if (isAdminAuthorized) {
      setIsAdminPasswordPopoutOpen(false);
      return;
    }

    console.log('[CulturalArchaeologist] Admin route is locked; opening password popout.');
    setIsAdminPasswordPopoutOpen(true);
    setAdminPasswordInput('');
    setAdminPasswordError(null);
  }, [activeExperience, isAdminAuthorized]);

  useEffect(() => {
    let prefillAudience = '';
    let prefillBrand = '';
    let prefillTopic = '';
    let prefillSegmentContext = '';

    if (typeof window !== 'undefined') {
      const query = new URLSearchParams(window.location.search);
      prefillAudience = (query.get('ca_audience') || '').trim();
      prefillBrand = (query.get('ca_brand') || '').trim();
      prefillTopic = (query.get('ca_topic') || '').trim();

      if (prefillAudience || prefillBrand || prefillTopic) {
        query.delete('ca_audience');
        query.delete('ca_brand');
        query.delete('ca_topic');
        const nextSearch = query.toString();
        const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
        window.history.replaceState({}, '', nextUrl);
      }
    }

    const prefill = readCulturalPrefill();
    if (!prefillAudience && !prefillBrand && !prefillTopic && prefill) {
      prefillAudience = (prefill.audience || '').trim();
      prefillBrand = (prefill.brand || '').trim();
      prefillTopic = (prefill.topicFocus || '').trim();
      prefillSegmentContext = (prefill.segmentContext || '').trim();
    }

    if (!prefillAudience && !prefillBrand && !prefillTopic && !prefillSegmentContext) {
      return;
    }

    if (prefillAudience) {
      setAudience(prefillAudience);
      setAudienceDetail('');
      setIsAudienceDetailOpen(false);
    }

    if (prefillBrand) {
      const parsedBrands = parseBrandsInput(prefillBrand);
      if (parsedBrands.length > 0) {
        setSelectedBrands(parsedBrands);
        setBrandInput('');
      } else {
        setSelectedBrands([]);
        setBrandInput(prefillBrand);
      }
    }

    if (prefillTopic) {
      setTopicFocus(prefillTopic);
    }
    if (prefillAudience && prefillSegmentContext) {
      setSegmentRerunContext({
        audience: prefillAudience,
        promptContext: prefillSegmentContext,
      });
    }

    clearCulturalPrefill();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const query = new URLSearchParams(window.location.search);
    const workspaceId = (query.get(SEGMENTATION_WORKSPACE_QUERY_PARAM) || '').trim();
    if (!workspaceId) {
      return;
    }

    console.log('[CulturalArchaeologist] Hydrating segmentation workspace from URL.', { workspaceId });
    const snapshot = readSegmentationWorkspaceSnapshot(workspaceId);

    query.delete(SEGMENTATION_WORKSPACE_QUERY_PARAM);
    const nextSearch = query.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', nextUrl);

    if (!snapshot) {
      console.log('[CulturalArchaeologist] Segmentation workspace snapshot missing or invalid.', { workspaceId });
      setToast('Could not load segmentation workspace. Please reopen it from your results.');
      return;
    }

    const parsedBrands = parseBrandsInput(snapshot.matrixMeta.brand || '');
    if (parsedBrands.length > 1) {
      setSelectedBrands(parsedBrands);
      setBrandInput('');
    } else {
      setSelectedBrands([]);
      setBrandInput(snapshot.matrixMeta.brand || '');
    }

    setAudience(snapshot.matrixMeta.audience || '');
    setAudienceDetail('');
    setIsAudienceDetailOpen(false);
    setSelectedGenerations(snapshot.matrixMeta.generations || []);
    setTopicFocus(snapshot.matrixMeta.topicFocus || '');
    setSourcesType(snapshot.matrixMeta.sourcesType || []);
    setMatrix(snapshot.matrix);
    setMatrixMeta(snapshot.matrixMeta);
    setSelectedConfidenceFilters(snapshot.selectedConfidenceFilters || []);
    setSelectedEvidenceFilters(snapshot.selectedEvidenceFilters || []);
    setSelectedTrendStageFilters(snapshot.selectedTrendStageFilters || []);
    setSelectedSourceFilters(snapshot.selectedSourceFilters || []);
    setShowHighlyUniqueOnly(Boolean(snapshot.showHighlyUniqueOnly));
    setMatrixQuestion('');
    setMatrixAnswer('');
    setHighlightedInsights([]);
    setDeepDivePersistenceContext(null);
    setActiveResultsTab('segmentation');
    const hydratedSegmentationAccess = Boolean(snapshot.isSegmentationAuthorized);
    setIsSegmentationAuthorized(hydratedSegmentationAccess);
    setIsSegmentationLoading(false);
    setSegmentationResult(null);
    setOriginalSegmentationResult(null);
    setHasPromptRefinedSegmentation(false);
    setSegmentationTargetCount(DEFAULT_SEGMENTATION_TARGET_COUNT);
    setSegmentationCustomInfoByIndex({});
    setSegmentationError(null);
    setSegmentationPasswordInput('');
    setSegmentationPasswordError(null);
    setIsSegmentationPasswordPopoutOpen(false);
    setShouldAutoScrollToSegmentationWorkspace(true);
    removeSegmentationWorkspaceSnapshot(workspaceId);
    console.log('[CulturalArchaeologist] Segmentation workspace hydrated and activated.', {
      workspaceId,
      audience: snapshot.matrixMeta.audience,
      hydratedSegmentationAccess,
    });
  }, []);

  // Auto-hide splash screen after 3 seconds, with press-and-hold pause.
  useEffect(() => {
    // Instantly dismiss splash in test env
    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test') {
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
      if (audienceHistoryRef.current && !audienceHistoryRef.current.contains(event.target as Node)) {
        setIsAudienceHistoryOpen(false);
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
      const orderColumns = ['createdAt', 'created_at'];
      console.log('[CulturalArchaeologist] Loading saved matrices from Supabase.', {
        tableCandidates: CULTURAL_ARCHAEOLOGIST_TABLE_CANDIDATES,
        orderColumns,
      });

      for (const tableName of CULTURAL_ARCHAEOLOGIST_TABLE_CANDIDATES) {
        for (const orderColumn of orderColumns) {
          const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .order(orderColumn, { ascending: false })
            .limit(20);

          if (!error) {
            const normalizedSavedMatrices = normalizeSavedMatrixRecords(Array.isArray(data) ? data : []);
            console.log('[CulturalArchaeologist] Loaded saved matrices from Supabase.', {
              tableName,
              orderColumn,
              count: Array.isArray(data) ? data.length : 0,
              normalizedCount: normalizedSavedMatrices.length,
            });
            setResolvedCulturalTable(tableName);
            setSavedMatrices(normalizedSavedMatrices);
            return;
          }

          console.log('[CulturalArchaeologist] Supabase saved-matrix load attempt failed.', {
            tableName,
            orderColumn,
            errorCode: error?.code,
            errorMessage: error?.message,
            errorHint: error?.hint,
          });
        }
      }

      setSavedMatrices([]);
      setSaveWarning('Could not load saved reports. Confirm table name, RLS policies, and refresh.');
    };
    fetchSavedMatrices();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeoutId = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timeoutId);
  }, [toast]);

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
      logger.debug('Committed cultural brand chip', { trimmed, count: updated.length });
      return updated;
    });
    setBrandInput('');
    return true;
  };

  const removeBrandChip = (brandToRemove: string) => {
    setSelectedBrands((prev) => {
      const updated = prev.filter((item) => item !== brandToRemove);
      logger.debug('Removed cultural brand chip', { brandToRemove, count: updated.length });
      return updated;
    });
  };

  // Fetch brand suggestions as user types.
  useEffect(() => {
    if (hasQuotaError) return;

    const activeQuery = brandInput.trim();
    if (!activeQuery || activeQuery.length < 2) {
      setBrandSuggestions(prev => prev.length === 0 ? prev : []);
      setIsSuggestingBrands(false);
      return;
    }

    // Don't suggest if the brand matches an existing saved search exactly.
    if (visibleSavedMatrices.some(sm => (sm.brand || '').toLowerCase() === activeQuery.toLowerCase())) {
      setBrandSuggestions(prev => prev.length === 0 ? prev : []);
      setIsSuggestingBrands(false);
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
            actionName: 'cultural-brand-suggestions',
            action: async () => suggestBrands(activeQuery),
            onError: (normalized) => {
              setSuggestionsError(normalized.message);
              setToast('Failed to get brand suggestions. Please try again.');
              if (normalized.kind === 'quota') {
                setHasQuotaError(true);
              }
            },
          });
        } catch {
          suggestions = [];
        }

        const apiSuggestions = Array.isArray(suggestions) ? suggestions : [];
        if (apiSuggestions.length > 0 && !cancelled) {
          setBrandSuggestions(apiSuggestions);
        }
      } catch (outerErr) {
        logger.error('Unexpected error in brand suggestion effect:', outerErr);
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
  }, [brandInput, visibleSavedMatrices, hasQuotaError, suggestionsRetryNonce]);

  const resetSegmentationWorkspace = (nextTab: ResultsTab = 'insights') => {
    console.log('[CulturalArchaeologist] Resetting segmentation workspace state.', { nextTab });
    setActiveResultsTab(nextTab);
    setIsSegmentationAuthorized(false);
    setIsSegmentationLoading(false);
    setSegmentationResult(null);
    setOriginalSegmentationResult(null);
    setHasPromptRefinedSegmentation(false);
    setSegmentationTargetCount(DEFAULT_SEGMENTATION_TARGET_COUNT);
    setSegmentationCustomInfoByIndex({});
    setSegmentationError(null);
    setSegmentationPasswordInput('');
    setSegmentationPasswordError(null);
    setIsSegmentationPasswordPopoutOpen(false);
    setShouldAutoScrollToSegmentationWorkspace(false);
  };

  const handleReset = () => {
    setSelectedBrands([]);
    setBrandInput('');
    setAudience('');
    setAudienceDetail('');
    setIsAudienceDetailOpen(false);
    setTopicFocus('');
    setSegmentRerunContext(null);
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
    setSaveWarning(null);
    setSuggestionsError(null);
    setSuggestionsRetryNonce(0);
    setFileReadErrors([]);
    setExportError(null);
    setDeepDivePersistenceContext(null);
    resetSegmentationWorkspace('insights');
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

  const runCulturalMatrixGeneration = async ({
    audienceValue,
    audienceDetailValue,
    brandContextValue,
    generationsValue,
    topicFocusValue,
    segmentPromptContextValue,
    filesValue,
    sourcesTypeValue,
    rerunFilters,
    actionName,
  }: {
    audienceValue: string;
    audienceDetailValue?: string;
    brandContextValue: string;
    generationsValue: string[];
    topicFocusValue: string;
    segmentPromptContextValue?: string;
    filesValue: UploadedFile[];
    sourcesTypeValue: string[];
    rerunFilters?: CulturalRerunFilters;
    actionName: string;
  }) => {
    setFakeProgress(5);
    setIsLoading(true);
    const searchStart = Date.now();
    setError(null);
    setSaveWarning(null);
    setExportError(null);
    setFileReadErrors([]);
    setShowValidation(false);
    setMatrixQuestion('');
    setMatrixAnswer('');
    setHighlightedInsights([]);
    resetSegmentationWorkspace('insights');
    const hasUploadedDocuments = filesValue.length > 0;
    try {
      const effectiveAudienceValue = buildDetailedAudiencePrompt(audienceValue, audienceDetailValue || '');
      const effectiveTopicFocusValue = buildTopicFocusWithBackgroundSegmentContext(topicFocusValue, segmentPromptContextValue || '');
      console.log('[CulturalArchaeologist] Starting matrix generation request.', {
        actionName,
        audienceValue,
        audienceDetailLength: (audienceDetailValue || '').trim().length,
        effectiveAudienceLength: effectiveAudienceValue.length,
        brandContextValue,
        generationsValue,
        topicFocusValue,
        hasBackgroundSegmentContext: Boolean((segmentPromptContextValue || '').trim()),
        sourcesTypeValue,
        rerunFilters,
      });
      const result = await runUserAction({
        actionName,
        action: () => generateCulturalMatrix(
          effectiveAudienceValue,
          brandContextValue,
          generationsValue,
          effectiveTopicFocusValue,
          filesValue,
          sourcesTypeValue,
          rerunFilters
        ),
        onError: (normalized) => setError(normalized.message),
      });
      const nextMatrix =
        actionName === 'rerun-cultural-matrix' && matrix
          ? mergeRerunMatrixIntoExisting(matrix, result, rerunFilters)
          : result;
      setMatrix(nextMatrix);
      setMatrixMeta({
        audience: audienceValue,
        brand: brandContextValue,
        generations: generationsValue,
        topicFocus: topicFocusValue,
        sourcesType: sourcesTypeValue,
        hasUploadedDocuments,
      });
      const telemetryForSession = userTelemetry ?? await resolveTelemetryForSession();
      const ipAddressForAudienceHistory = (telemetryForSession.ip_address || '').trim();
      if (ipAddressForAudienceHistory) {
        const nextAudienceHistory = saveAudienceHistoryEntry(
          APP_AUDIENCE_HISTORY_MODES.CULTURAL_ARCHAEOLOGIST,
          ipAddressForAudienceHistory,
          audienceValue
        );
        setSavedAudiencesByIp(nextAudienceHistory);
        console.log('[CulturalArchaeologist] Updated IP-gated audience history after generation.', {
          ipAddress: ipAddressForAudienceHistory,
          audience: audienceValue,
          nextCount: nextAudienceHistory.length,
        });
      } else {
        console.log('[CulturalArchaeologist] Skipped audience history save because IP address is unavailable.', {
          audience: audienceValue,
        });
      }
      const generatedRecentId = `generated:${brandContextValue.toLowerCase()}|${audienceValue.toLowerCase()}|${topicFocusValue.toLowerCase()}`;
      const generatedRecentItem: CulturalRecentResult = {
        id: generatedRecentId,
        title: (brandContextValue || 'Generated Cultural Analysis').trim(),
        description: `Audience: ${(audienceValue || 'Not specified').trim()}`,
        matrix: nextMatrix,
        matrixMeta: {
          audience: audienceValue,
          brand: brandContextValue,
          generations: generationsValue,
          topicFocus: topicFocusValue,
          sourcesType: sourcesTypeValue,
          hasUploadedDocuments,
        },
      };
      console.log('[CulturalArchaeologist] Tracking generated result in recent results library.', {
        id: generatedRecentId,
        title: generatedRecentItem.title,
      });
      saveRecentResult(APP_RECENT_RESULTS_MODES.CULTURAL_ARCHAEOLOGIST, generatedRecentItem);
      setRecentResultsRefreshNonce((prev) => prev + 1);
      setDeepDivePersistenceContext(null);

      let persistedSupabaseRowId: string | null = null;
      try {
        const { device, location, ip_address } = telemetryForSession;
        const { data: insertedRow, error: saveError } = await supabase
          .from(resolvedCulturalTable)
          .insert([
            {
              brand: brandContextValue || null,
              audience: audienceValue,
              topicFocus: topicFocusValue || null,
              generations: generationsValue,
              sourcesType: sourcesTypeValue,
              results: nextMatrix,
              device,
              location,
              ip_address,
            },
          ])
          .select('id')
          .maybeSingle();
        if (saveError) {
          throw saveError;
        }

        const insertedRowId = toSupabaseRowId((insertedRow as { id?: unknown } | null | undefined)?.id);
        persistedSupabaseRowId = insertedRowId;
        console.log('[CulturalArchaeologist] Saved initial report row to Supabase.', {
          table: resolvedCulturalTable,
          insertedRowId,
        });
        if (!insertedRowId) {
          console.log('[CulturalArchaeologist] Supabase insert succeeded without a readable row id. Deep dives will remain local only.', {
            table: resolvedCulturalTable,
          });
        } else {
          applyDeepDivePersistenceFromRowId(insertedRowId);
          const generatedSavedMatrix: SavedMatrix = {
            id: insertedRowId,
            date: new Date().toISOString(),
            brand: brandContextValue,
            audience: audienceValue,
            generations: generationsValue,
            topicFocus: topicFocusValue,
            sourcesType: sourcesTypeValue,
            hasUploadedDocuments,
            matrix: nextMatrix,
          };
          const generatedRecentSavedItem: CulturalRecentResult = {
            ...generatedRecentItem,
            savedRowId: insertedRowId,
            savedMatrix: generatedSavedMatrix,
          };
          console.log('[CulturalArchaeologist] Updating generated recent result with saved project row id.', {
            id: generatedRecentSavedItem.id,
            savedRowId: insertedRowId,
          });
          saveRecentResult(APP_RECENT_RESULTS_MODES.CULTURAL_ARCHAEOLOGIST, generatedRecentSavedItem);
          setRecentResultsRefreshNonce((prev) => prev + 1);
        }
      } catch (saveErr) {
        logger.warn('Failed to save cultural search to Supabase', saveErr);
        setSaveWarning('Insights generated, but this report could not be saved right now.');
      }

      await playCompletionSound(RESULTS_COMPLETE_SOUND_ID);

      runBackgroundDeepDives(nextMatrix, {
        audience: effectiveAudienceValue,
        brand: brandContextValue,
        generations: generationsValue,
        topicFocus: topicFocusValue,
      }, persistedSupabaseRowId ? {
        tableName: resolvedCulturalTable,
        rowId: persistedSupabaseRowId,
      } : undefined);
    } catch (err: unknown) {
      const normalized = normalizeAppError(err);
      logger.error('Failed to generate cultural report', { err, normalized });
      setError(normalized.message || 'Failed to generate cultural archaeologist report. Please try again.');
    } finally {
      const searchEnd = Date.now();
      const duration = searchEnd - searchStart;
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
    const brandTokensForGenerate = pendingBrand && !normalizedBrands.some((item) => item.toLowerCase() === pendingBrand.toLowerCase())
      ? [...normalizedBrands, pendingBrand]
      : normalizedBrands;
    const brandContext = brandTokensForGenerate.join(', ');

    if (pendingBrand) {
      setSelectedBrands(brandTokensForGenerate);
      setBrandInput('');
    }

    setShowValidation(true);
    if (!audience.trim()) return;
    const shouldApplySegmentRerunContext = Boolean(
      segmentRerunContext &&
      segmentRerunContext.promptContext.trim() &&
      audience.trim().toLowerCase() === segmentRerunContext.audience.trim().toLowerCase()
    );
    await runCulturalMatrixGeneration({
      actionName: 'generate-cultural-matrix',
      audienceValue: audience,
      audienceDetailValue: audienceDetail,
      brandContextValue: brandContext,
      generationsValue: selectedGenerations,
      topicFocusValue: topicFocus,
      segmentPromptContextValue: shouldApplySegmentRerunContext ? segmentRerunContext?.promptContext : undefined,
      filesValue: files,
      sourcesTypeValue: sourcesType,
    });
  };

  const handleRerunAnalysis = async () => {
    if (!hasActiveResultFilters || isLoading) return;
    const rerunAudience = (matrixMeta?.audience || audience || '').trim();
    if (!rerunAudience) return;

    const rerunBrand = matrixMeta?.brand ?? normalizedBrands.join(', ');
    const rerunGenerations = matrixMeta?.generations ?? selectedGenerations;
    const rerunTopic = matrixMeta?.topicFocus ?? topicFocus;
    const rerunSources = matrixMeta?.sourcesType ?? sourcesType;
    console.log('[CulturalArchaeologist] Triggering filtered rerun analysis.', {
      rerunAudience,
      rerunBrand,
      rerunGenerations,
      rerunTopic,
      rerunSources,
      activeRerunFilters,
    });
    const shouldApplySegmentRerunContext = Boolean(
      segmentRerunContext &&
      segmentRerunContext.promptContext.trim() &&
      rerunAudience.toLowerCase() === segmentRerunContext.audience.trim().toLowerCase()
    );
    await runCulturalMatrixGeneration({
      actionName: 'rerun-cultural-matrix',
      audienceValue: rerunAudience,
      audienceDetailValue: audienceDetail,
      brandContextValue: rerunBrand,
      generationsValue: rerunGenerations,
      topicFocusValue: rerunTopic,
      segmentPromptContextValue: shouldApplySegmentRerunContext ? segmentRerunContext?.promptContext : undefined,
      filesValue: files,
      sourcesTypeValue: rerunSources,
      rerunFilters: activeRerunFilters,
    });
  };

  const handleRefreshCulturalSection = async (category: MatrixInsightKey, categoryTitle: string) => {
    if (!matrix) return;
    const rerunAudience = (matrixMeta?.audience || audience || '').trim();
    if (!rerunAudience) return;

    const rerunBrand = matrixMeta?.brand ?? normalizedBrands.join(', ');
    const rerunGenerations = matrixMeta?.generations ?? selectedGenerations;
    const baseTopic = matrixMeta?.topicFocus ?? topicFocus;
    const rerunTopic = [baseTopic, `Refresh focus: ${categoryTitle}`]
      .filter((value) => (value || '').trim().length > 0)
      .join(' | ');
    const rerunSources = matrixMeta?.sourcesType ?? sourcesType;

    console.log('[CulturalArchaeologist] Running section refresh search for incomplete results.', {
      category,
      categoryTitle,
      rerunAudience,
      rerunBrand,
      rerunGenerations,
      rerunTopic,
      rerunSources,
    });
    setToast(`Refreshing ${categoryTitle}...`);
    const shouldApplySegmentRerunContext = Boolean(
      segmentRerunContext &&
      segmentRerunContext.promptContext.trim() &&
      rerunAudience.toLowerCase() === segmentRerunContext.audience.trim().toLowerCase()
    );

    await runCulturalMatrixGeneration({
      actionName: `refresh-cultural-matrix-${category}`,
      audienceValue: rerunAudience,
      audienceDetailValue: audienceDetail,
      brandContextValue: rerunBrand,
      generationsValue: rerunGenerations,
      topicFocusValue: rerunTopic,
      segmentPromptContextValue: shouldApplySegmentRerunContext ? segmentRerunContext?.promptContext : undefined,
      filesValue: files,
      sourcesTypeValue: rerunSources,
    });
  };

  const runBackgroundDeepDives = async (
    currentMatrix: CulturalMatrix,
    context: MatrixContext,
    persistenceContext?: DeepDivePersistenceContext,
  ) => {
    setIsGeneratingDeepDives(true);
    console.log('[CulturalArchaeologist] Starting background deep-dive generation.', {
      hasPersistenceContext: Boolean(persistenceContext?.rowId),
      persistenceTable: persistenceContext?.tableName || null,
      persistenceRowId: persistenceContext?.rowId || null,
    });
    
    const categories = MATRIX_INSIGHT_KEYS;
    
    let totalItems = 0;
    categories.forEach(cat => {
      if (Array.isArray(currentMatrix[cat])) {
        totalItems += (currentMatrix[cat] as MatrixItem[]).length;
      }
    });
    
    setDeepDiveProgress({ current: 0, total: totalItems });
    let completed = 0;

    let updatedMatrix: CulturalMatrix;
    try {
      updatedMatrix = structuredClone(currentMatrix);
    } catch (cloneError) {
      console.warn('[CulturalArchaeologist] structuredClone failed for deep-dive generation. Falling back to JSON clone.', cloneError);
      updatedMatrix = JSON.parse(JSON.stringify(currentMatrix)) as CulturalMatrix;
    }

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
          if (prev.length === 0) {
            return prev;
          }

          const targetRowId = toSupabaseRowId(persistenceContext?.rowId);
          let didUpdateAnyEntry = false;
          const updated = prev.map((entry, index) => {
            const shouldUpdateEntry = targetRowId
              ? String(entry.id) === targetRowId
              : index === 0;
            if (!shouldUpdateEntry) {
              return entry;
            }
            didUpdateAnyEntry = true;
            return {
              ...entry,
              matrix: { ...updatedMatrix },
            };
          });

          if (!didUpdateAnyEntry && prev.length > 0) {
            updated[0] = {
              ...updated[0],
              matrix: { ...updatedMatrix },
            };
          }

          if (!persistSavedMatrices(updated)) {
            setToast('Deep dives updated, but local save failed in this browser.');
          }

          return updated;
        });

        if (persistenceContext?.rowId) {
          try {
            console.log('[CulturalArchaeologist] Persisting deep-dive updates to Supabase.', {
              tableName: persistenceContext.tableName,
              rowId: persistenceContext.rowId,
              category,
              completed,
              totalItems,
            });
            const { error: updateError } = await supabase
              .from(persistenceContext.tableName)
              .update({ results: updatedMatrix })
              .eq('id', persistenceContext.rowId);

            if (updateError) {
              logger.warn('Failed to persist cultural deep-dive results update to Supabase', updateError);
              setSaveWarning('Deep dives generated, but syncing them to Supabase failed.');
            } else {
              console.log('[CulturalArchaeologist] Persisted deep-dive updates to Supabase.', {
                tableName: persistenceContext.tableName,
                rowId: persistenceContext.rowId,
                category,
              });
            }
          } catch (updateErr) {
            logger.warn('Unexpected error while updating deep-dive results in Supabase', updateErr);
            setSaveWarning('Deep dives generated, but syncing them to Supabase failed.');
          }
        }
      } catch (err) {
        console.error(`Failed to generate deep dives for ${category}:`, err);
        // Continue with other categories even if one fails
      }
    }
    
    console.log('[CulturalArchaeologist] Background deep-dive generation complete.', {
      completed,
      totalItems,
    });
    if (totalItems > 0 && completed >= totalItems) {
      console.log('[CulturalArchaeologist] Showing deep-dive completion toast.');
      setToast('Insight deep dives are complete');
    }
    setIsGeneratingDeepDives(false);
  };

  const handleRefreshAllDeepDives = async () => {
    console.log('[CulturalArchaeologist] Insight Deep Dives control clicked.', {
      hasMatrix: Boolean(matrix),
      hasMatrixMeta: Boolean(matrixMeta),
      isGeneratingDeepDives,
      activeResultsTab,
    });
    setActiveResultsTab('insights');

    if (!matrix || !matrixMeta) {
      console.log('[CulturalArchaeologist] Insight deep-dive refresh skipped due to missing matrix context.');
      return;
    }

    if (isGeneratingDeepDives) {
      console.log('[CulturalArchaeologist] Insight deep-dive refresh skipped because generation is already in progress.');
      setToast('Insight deep dives are already refreshing.');
      return;
    }

    const totalItems = MATRIX_INSIGHT_KEYS.reduce((count, category) => {
      const items = matrix[category] as MatrixItem[] | undefined;
      return count + (Array.isArray(items) ? items.length : 0);
    }, 0);

    if (totalItems === 0) {
      console.log('[CulturalArchaeologist] Insight deep-dive refresh skipped because no insights are available.');
      setToast('No insights available to refresh yet.');
      return;
    }

    console.log('[CulturalArchaeologist] Starting manual refresh for all insight deep dives.', {
      totalItems,
      persistenceTable: deepDivePersistenceContext?.tableName || null,
      persistenceRowId: deepDivePersistenceContext?.rowId || null,
    });
    setToast('Refreshing insight deep dives...');

    await runBackgroundDeepDives(
      matrix,
      {
        audience: buildDetailedAudiencePrompt(matrixMeta.audience || audience, audienceDetail),
        brand: matrixMeta.brand || '',
        generations: matrixMeta.generations || [],
        topicFocus: matrixMeta.topicFocus,
      },
      deepDivePersistenceContext || undefined,
    );
  };

  const handleAskQuestion = async () => {
    if (!matrix || !matrixQuestion.trim()) return;

    if (isSegmentationTabActive && isSegmentationAuthorized) {
      const refinementPrompt = matrixQuestion.trim();
      setIsAskingQuestion(true);
      setMatrixAnswer('');
      setHighlightedInsights([]);
      try {
        await runSegmentationAnalysis(displayMatrix || matrix, { refinementPrompt });
        console.log('[CulturalArchaeologist] Segmentation refined via Ask prompt.', {
          refinementPrompt,
        });
        setToast('Segmentation updated from prompt.');
      } finally {
        setIsAskingQuestion(false);
      }
      return;
    }

    setIsAskingQuestion(true);
    try {
      const audienceForSourcing = buildDetailedAudiencePrompt(matrixMeta?.audience || audience, audienceDetail);
      const result = await runUserAction({
        actionName: 'ask-cultural-question',
        action: () =>
          askMatrixQuestion(matrix, matrixQuestion, {
            audience: audienceForSourcing,
            brand: matrixMeta?.brand,
            topicFocus: matrixMeta?.topicFocus,
            generations: matrixMeta?.generations,
            sourcesType: matrixMeta?.sourcesType,
          }),
      });
      setMatrixAnswer(result.answer);
      setHighlightedInsights(result.relevantInsights || []);
    } catch (err) {
      const normalized = normalizeAppError(err);
      logger.error('Failed to answer cultural question', { err, normalized });
      setMatrixAnswer(
        normalized.kind === 'quota'
          ? 'Quota limit reached. Please check billing and try again.'
          : "Sorry, I couldn't answer that question right now."
      );
    } finally {
      setIsAskingQuestion(false);
    }
  };

  const handleDeepDive = async (item: MatrixItem, category: string) => {
    if (!matrixMeta) return;
    setDeepDiveInsight(item);
    setDeepDiveCategory(category);
    if (item.deepDive) {
      setDeepDiveResult(item.deepDive);
      return;
    }
    setDeepDiveResult(null);
    setIsDeepDiveLoading(true);
    try {
      const result = await generateDeepDive(item, {
        audience: buildDetailedAudiencePrompt(matrixMeta.audience || audience, audienceDetail),
        brand: matrixMeta.brand,
        generations: matrixMeta.generations,
        topicFocus: matrixMeta.topicFocus,
      });
      if (!result || typeof result !== 'object') throw new Error('No deep dive result');
      setDeepDiveResult(result);
    } catch (err) {
      setToast("Failed to generate deep dive. Please try again.");
      setDeepDiveInsight(null);
      setDeepDiveCategory(null);
    } finally {
      setIsDeepDiveLoading(false);
    }
  };

  const launchSegmentationWorkspaceTab = (segmentationAccessGranted = false) => {
    if (!matrix || !matrixMeta) {
      console.log('[CulturalArchaeologist] Segmentation workspace tab launch skipped because matrix context is missing.');
      return;
    }
    if (typeof window === 'undefined') {
      console.log('[CulturalArchaeologist] Segmentation workspace tab launch skipped because window is unavailable.');
      return;
    }
    const workspaceId = `seg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const snapshot: SegmentationWorkspaceSnapshot = {
      matrix,
      matrixMeta,
      isSegmentationAuthorized: segmentationAccessGranted,
      selectedConfidenceFilters: [...selectedConfidenceFilters],
      selectedEvidenceFilters: [...selectedEvidenceFilters],
      selectedTrendStageFilters: [...selectedTrendStageFilters],
      selectedSourceFilters: [...selectedSourceFilters],
      showHighlyUniqueOnly,
      createdAt: new Date().toISOString(),
    };
    const didPersistSnapshot = persistSegmentationWorkspaceSnapshot(workspaceId, snapshot);
    if (!didPersistSnapshot) {
      setToast('Could not open segmentation workspace in a new tab. Please try again.');
      console.log('[CulturalArchaeologist] Segmentation workspace snapshot persistence failed.', { workspaceId });
      return;
    }

    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set(SEGMENTATION_WORKSPACE_QUERY_PARAM, workspaceId);
    nextUrl.hash = '#cultural-archaeologist';
    console.log('[CulturalArchaeologist] Opening segmentation workspace in a new browser tab.', {
      workspaceId,
      targetUrl: nextUrl.toString(),
    });
    const openedTab = window.open(nextUrl.toString(), '_blank');
    if (!openedTab) {
      setToast('Popup blocked. Allow popups to open segmentation in a new tab.');
      console.log('[CulturalArchaeologist] Browser blocked opening segmentation workspace tab.', { workspaceId });
    }
  };

  const openSegmentAudienceRerunTab = (
    segment: AudienceSegmentationReport['segments'][number],
    segmentIndex: number
  ) => {
    const segmentAudience = (segment.name || '').trim();
    if (!segmentAudience) {
      console.log('[CulturalArchaeologist] Segment rerun tab launch skipped because segment audience is empty.', {
        segmentIndex,
        segmentName: segment.name,
      });
      return;
    }
    if (typeof window === 'undefined') {
      console.log('[CulturalArchaeologist] Segment rerun tab launch skipped because window is unavailable.', {
        segmentIndex,
        segmentAudience,
      });
      return;
    }

    const brandFromContext = (matrixMeta?.brand || '').trim();
    const topicFromContext = (matrixMeta?.topicFocus || '').trim();
    const segmentContext = buildSegmentRerunPromptContext(segment, segmentIndex);

    saveCulturalPrefill({
      audience: segmentAudience,
      brand: brandFromContext,
      topicFocus: topicFromContext,
      segmentContext,
    });

    const params = new URLSearchParams({ home: '1' });
    params.set('ca_audience', segmentAudience);
    if (brandFromContext) {
      params.set('ca_brand', brandFromContext);
    }
    if (topicFromContext) {
      params.set('ca_topic', topicFromContext);
    }

    const targetUrl = `${window.location.origin}/?${params.toString()}#cultural-archaeologist`;
    console.log('[CulturalArchaeologist] Opening segment rerun analysis tab.', {
      segmentIndex,
      segmentAudience,
      segmentContextLength: segmentContext.length,
      brandFromContext,
      topicFromContext,
      targetUrl,
    });
    const openedTab = window.open(targetUrl, '_blank', 'noopener,noreferrer');
    if (!openedTab) {
      setToast('Popup blocked. Allow popups to open the segment rerun tab.');
      console.log('[CulturalArchaeologist] Browser blocked opening segment rerun analysis tab.', {
        segmentIndex,
        segmentAudience,
      });
    }
  };

  const openSegmentationTab = () => {
    if (!matrix || !matrixMeta) {
      console.log('[CulturalArchaeologist] Segmentation password popout skipped because matrix context is missing.');
      return;
    }
    if (activeResultsTab === 'segmentation') {
      console.log('[CulturalArchaeologist] Segmentation tab is already active in this browser tab.');
      return;
    }

    console.log('[CulturalArchaeologist] Opening segmentation password popout.');
    setSegmentationPasswordInput('');
    setSegmentationPasswordError(null);
    setIsSegmentationPasswordPopoutOpen(true);
  };

  const handleSegmentationPopoutSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const candidatePassword = segmentationPasswordInput.trim();
    const isValidPassword = candidatePassword === SEGMENTATION_PASSWORD;

    console.log('[CulturalArchaeologist] Segmentation popout password submitted.', {
      passwordLength: candidatePassword.length,
      isValidPassword,
    });

    if (!isValidPassword) {
      setSegmentationPasswordError('Incorrect password. Please try again.');
      return;
    }

    setIsSegmentationPasswordPopoutOpen(false);
    setSegmentationPasswordInput('');
    setSegmentationPasswordError(null);
    launchSegmentationWorkspaceTab(true);
  };

  const closeAdminPasswordPopout = () => {
    console.log('[CulturalArchaeologist] Closing admin password popout.');
    setIsAdminPasswordPopoutOpen(false);
    setAdminPasswordInput('');
    setAdminPasswordError(null);
  };

  const handleAdminPasswordSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const candidatePassword = adminPasswordInput.trim();
    const isValidPassword = candidatePassword === ADMIN_PASSWORD;

    console.log('[CulturalArchaeologist] Admin password submitted.', {
      passwordLength: candidatePassword.length,
      isValidPassword,
    });

    if (!isValidPassword) {
      setAdminPasswordError('Incorrect password. Please try again.');
      return;
    }

    try {
      window.localStorage.setItem(ADMIN_AUTH_STORAGE_KEY, '1');
    } catch (storageError) {
      console.warn('[CulturalArchaeologist] Failed to persist admin auth state to localStorage.', storageError);
    }

    setIsAdminAuthorized(true);
    setAdminPasswordInput('');
    setAdminPasswordError(null);
    setIsAdminPasswordPopoutOpen(false);
  };

  const runSegmentationAnalysis = async (
    matrixForSegmentation: CulturalMatrix,
    options?: { refinementPrompt?: string }
  ) => {
    if (!matrixMeta) {
      console.log('[CulturalArchaeologist] Segmentation generation skipped because matrix metadata is missing.');
      return;
    }

    const refinementPrompt = (options?.refinementPrompt || '').trim();
    const hasRefinementPrompt = refinementPrompt.length > 0;
    const normalizedTargetSegmentCount = clampSegmentationTargetCount(segmentationTargetCount);
    const segmentCustomizationDirectives = [...segmentationCustomizationInstructions];
    const audienceForSegmentation = buildDetailedAudiencePrompt(matrixMeta.audience || audience, audienceDetail);
    const originalSegmentationCandidate = hasRefinementPrompt
      ? (originalSegmentationResult || segmentationResult)
      : null;
    const segmentationTopicFocus = [
      (matrixMeta.topicFocus || '').trim(),
      refinementPrompt ? `Segmentation refinement request: ${refinementPrompt}` : '',
    ].filter(Boolean).join(' | ');

    console.log('[CulturalArchaeologist] Running segmentation analysis from tab.', {
      audience: matrixMeta.audience,
      audienceForSegmentationLength: audienceForSegmentation.length,
      brand: matrixMeta.brand,
      generations: matrixMeta.generations,
      topicFocus: segmentationTopicFocus,
      refinementPrompt,
      targetSegmentCount: normalizedTargetSegmentCount,
      segmentCustomizationCount: segmentCustomizationDirectives.length,
      confidenceFilters: selectedConfidenceFilters,
      evidenceFilters: selectedEvidenceFilters,
      trendStageFilters: selectedTrendStageFilters,
      sourceFilters: selectedSourceFilters,
      showHighlyUniqueOnly,
    });
    if (!hasRefinementPrompt) {
      console.log('[CulturalArchaeologist] Clearing refined segmentation state before non-refinement run.');
      setOriginalSegmentationResult(null);
      setHasPromptRefinedSegmentation(false);
    } else {
      console.log('[CulturalArchaeologist] Segmentation refinement run detected.', {
        hasOriginalSegmentationCandidate: Boolean(originalSegmentationCandidate),
      });
    }
    setIsSegmentationLoading(true);
    setSegmentationResult(null);
    setSegmentationError(null);

    try {
      const result = await runUserAction({
        actionName: 'generate-audience-segmentation',
        action: () =>
          generateAudienceSegmentation(matrixForSegmentation, {
            audience: audienceForSegmentation,
            brand: matrixMeta.brand,
            topicFocus: segmentationTopicFocus,
            generations: matrixMeta.generations,
            sourcesType: matrixMeta.sourcesType,
            targetSegmentCount: normalizedTargetSegmentCount,
            segmentCustomizations: segmentCustomizationDirectives,
          }),
      });
      const sortedResult = sortSegmentationByPrevalence(result);
      console.log('[CulturalArchaeologist] Sorted segmentation result by prevalence percentage.', {
        beforeOrder: result.segments.map((segment) => `${segment.name}:${segment.prevalencePct}`),
        afterOrder: sortedResult.segments.map((segment) => `${segment.name}:${segment.prevalencePct}`),
      });
      setSegmentationResult(sortedResult);
      if (hasRefinementPrompt && originalSegmentationCandidate) {
        setOriginalSegmentationResult(sortSegmentationByPrevalence(originalSegmentationCandidate));
        setHasPromptRefinedSegmentation(true);
        console.log('[CulturalArchaeologist] Stored original segmentation result for revert action.');
      } else if (hasRefinementPrompt) {
        setOriginalSegmentationResult(null);
        setHasPromptRefinedSegmentation(false);
        console.log('[CulturalArchaeologist] No original segmentation result available for revert action after refinement.');
      } else {
        setOriginalSegmentationResult(null);
        setHasPromptRefinedSegmentation(false);
      }
      console.log('[CulturalArchaeologist] Audience segmentation generated from tab.', {
        segments: result.segments.length,
      });
    } catch (err) {
      const normalized = normalizeAppError(err);
      console.error('[CulturalArchaeologist] Failed to generate audience segmentation.', { err, normalized });
      const fallbackMessage = 'Could not generate segmentation right now. Please retry in a moment.';
      const normalizedMessage = (normalized.message || '').trim();
      setSegmentationError(
        normalized.kind === 'quota'
          ? 'Quota limit reached. Please check billing and try again.'
          : normalizedMessage && normalizedMessage.toLowerCase() !== 'something went wrong. please try again.'
            ? normalizedMessage
            : fallbackMessage
      );
    } finally {
      setIsSegmentationLoading(false);
    }
  };

  const handleRevertToOriginalSegments = () => {
    if (!originalSegmentationResult) {
      console.log('[CulturalArchaeologist] Original segmentation revert requested, but no baseline result exists.');
      return;
    }
    console.log('[CulturalArchaeologist] Reverting to original segmentation result from before prompt refinement.');
    setSegmentationResult(sortSegmentationByPrevalence(originalSegmentationResult));
    setOriginalSegmentationResult(null);
    setHasPromptRefinedSegmentation(false);
    setSegmentationError(null);
    setToast('Reverted to original segments.');
  };

  const handleSegmentationPasswordSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const candidatePassword = segmentationPasswordInput.trim();
    const isValidPassword = candidatePassword === SEGMENTATION_PASSWORD;

    console.log('[CulturalArchaeologist] Segmentation password submitted.', {
      passwordLength: candidatePassword.length,
      isValidPassword,
    });

    if (!isValidPassword) {
      setSegmentationPasswordError('Incorrect password. Please try again.');
      return;
    }

    if (!matrix) {
      console.log('[CulturalArchaeologist] Segmentation generation skipped after password because matrix is missing.');
      return;
    }

    setIsSegmentationAuthorized(true);
    setSegmentationPasswordInput('');
    setSegmentationPasswordError(null);
    void runSegmentationAnalysis(displayMatrix || matrix);
  };

  const handleSegmentationTargetCountChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.target.value;
    const parsed = Number.parseInt(rawValue, 10);
    const nextCount = clampSegmentationTargetCount(Number.isNaN(parsed) ? DEFAULT_SEGMENTATION_TARGET_COUNT : parsed);
    console.log('[CulturalArchaeologist] Segmentation target segment count changed.', {
      rawValue,
      parsedValue: Number.isNaN(parsed) ? null : parsed,
      nextCount,
    });
    setSegmentationTargetCount(nextCount);
  };

  const handleSegmentationCustomInfoChange = (segmentIndex: number, value: string) => {
    console.log('[CulturalArchaeologist] Segmentation custom info changed for segment.', {
      segmentIndex,
      valueLength: value.length,
    });
    setSegmentationCustomInfoByIndex((previous) => ({
      ...previous,
      [segmentIndex]: value,
    }));
  };

  const handleApplySegmentationCustomization = async () => {
    if (!matrix || !isSegmentationAuthorized || isSegmentationLoading) {
      console.log('[CulturalArchaeologist] Segmentation customization apply skipped.', {
        hasMatrix: Boolean(matrix),
        isSegmentationAuthorized,
        isSegmentationLoading,
      });
      return;
    }
    console.log('[CulturalArchaeologist] Applying segmentation customization settings.', {
      targetSegmentCount: segmentationTargetCount,
      segmentCustomizationCount: segmentationCustomizationInstructions.length,
    });
    await runSegmentationAnalysis(displayMatrix || matrix);
  };

  const handleRerunSegmentation = async () => {
    if (!matrix || !isSegmentationAuthorized || isSegmentationLoading) return;
    console.log('[CulturalArchaeologist] Triggering segmentation rerun with active filters.', {
      confidenceFilters: selectedConfidenceFilters,
      evidenceFilters: selectedEvidenceFilters,
      trendStageFilters: selectedTrendStageFilters,
      sourceFilters: selectedSourceFilters,
      showHighlyUniqueOnly,
      targetSegmentCount: segmentationTargetCount,
      segmentCustomizationCount: segmentationCustomizationInstructions.length,
    });
    await runSegmentationAnalysis(displayMatrix || matrix);
  };

  useEffect(() => {
    if (!isSegmentationTabActive || !isSegmentationAuthorized || !matrix || !matrixMeta) {
      return;
    }
    if (isSegmentationLoading || segmentationResult || segmentationError) {
      return;
    }

    console.log('[CulturalArchaeologist] Auto-running segmentation analysis for authorized segmentation tab.');
    void runSegmentationAnalysis(displayMatrix || matrix);
  }, [
    displayMatrix,
    isSegmentationAuthorized,
    isSegmentationLoading,
    isSegmentationTabActive,
    matrix,
    matrixMeta,
    segmentationError,
    segmentationResult,
  ]);

  useEffect(() => {
    if (!shouldAutoScrollToSegmentationWorkspace || !isSegmentationTabActive || typeof window === 'undefined') {
      return;
    }

    let attemptsRemaining = 8;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const attemptScroll = () => {
      const target = segmentationTabPanelRef.current;
      if (!target) {
        attemptsRemaining -= 1;
        if (attemptsRemaining <= 0) {
          console.log('[CulturalArchaeologist] Segmentation workspace target not found for auto-scroll.');
          setShouldAutoScrollToSegmentationWorkspace(false);
          return;
        }
        timeoutId = setTimeout(attemptScroll, 40);
        return;
      }

      console.log('[CulturalArchaeologist] Auto-scrolling to segmentation workspace section.');
      try {
        target.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      } catch (error) {
        console.warn('Failed to auto-scroll segmentation workspace into view:', error);
      }
      setShouldAutoScrollToSegmentationWorkspace(false);
    };

    attemptScroll();

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isSegmentationTabActive, shouldAutoScrollToSegmentationWorkspace]);

  const renderSegmentationEvidenceText = (value: string, keyPrefix: string) => {
    const parsed = extractEvidenceTags(value || '');
    return (
      <span>
        {parsed.cleanText}
        {parsed.labels.map((label) => (
          <span
            key={`${keyPrefix}-${label}`}
            data-testid={`segmentation-evidence-chip-${label}`}
            className={`inline-block ml-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded align-middle ${evidenceLabelChipClass(label)}`}
          >
            {label}
          </span>
        ))}
      </span>
    );
  };

  const buildSegmentationDemographicsFallback = (): string => {
    const age = formatDemographicDisplayValue(matrix?.demographics?.age);
    const race = formatDemographicDisplayValue(matrix?.demographics?.race);
    const gender = formatDemographicDisplayValue(matrix?.demographics?.gender);
    const parts = [
      age !== DEMOGRAPHIC_FALLBACK_TEXT ? `Age: ${age}` : '',
      race !== DEMOGRAPHIC_FALLBACK_TEXT ? `Race/Ethnicity: ${race}` : '',
      gender !== DEMOGRAPHIC_FALLBACK_TEXT ? `Gender: ${gender}` : '',
    ].filter(Boolean);

    if (parts.length === 0) {
      return 'Demographic composition unavailable for this segment.';
    }
    return parts.join(' | ');
  };

  const renderSegmentationTabContent = () => {
    if (!matrix) {
      return null;
    }

    return (
      <div
        ref={segmentationTabPanelRef}
        data-testid="segmentation-tab-panel"
        className="mb-8 rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-zinc-900">Audience Segmentation</h3>
              <p className="text-sm text-zinc-500">Regression-style segmentation into up to 6 audience archetypes based on the filtered dataset.</p>
            </div>
          </div>
          {segmentationResult && hasPromptRefinedSegmentation && (
            <button
              type="button"
              data-testid="segmentation-revert-original-button"
              onClick={handleRevertToOriginalSegments}
              aria-label="Original Segments"
              className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50/70 px-2.5 py-1.5 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-50 hover:text-indigo-900"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Original Segments
            </button>
          )}
        </div>

        {isSegmentationAuthorized && (
          <div
            className="mb-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 sm:p-5"
            data-testid="segmentation-customization-controls"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="w-full sm:max-w-[220px]">
                <label htmlFor="segmentation-segment-count-input" className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Segment Count
                </label>
                <input
                  id="segmentation-segment-count-input"
                  data-testid="segmentation-segment-count-input"
                  type="number"
                  min={MIN_SEGMENTATION_TARGET_COUNT}
                  max={MAX_SEGMENTATION_TARGET_COUNT}
                  step={1}
                  value={segmentationTargetCount}
                  onChange={handleSegmentationTargetCountChange}
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-300"
                />
                <p className="mt-1 text-xs text-zinc-500">Choose between {MIN_SEGMENTATION_TARGET_COUNT} and {MAX_SEGMENTATION_TARGET_COUNT} segments.</p>
              </div>
              <button
                type="button"
                data-testid="segmentation-apply-customization-button"
                onClick={() => {
                  void handleApplySegmentationCustomization();
                }}
                disabled={isSegmentationLoading}
                className="inline-flex items-center justify-center rounded-lg border border-indigo-600 bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700 hover:border-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Update Segments
              </button>
            </div>
            {hasSegmentationCustomizationInstructions ? (
              <p className="mt-3 text-xs text-zinc-600" data-testid="segmentation-customization-summary">
                Applying custom guidance to {segmentationCustomizationInstructions.length} segment{segmentationCustomizationInstructions.length === 1 ? '' : 's'}.
              </p>
            ) : (
              <p className="mt-3 text-xs text-zinc-500">
                Add custom details to any segment card below, then click Update Segments.
              </p>
            )}
          </div>
        )}

        {!isSegmentationAuthorized ? (
          <div data-testid="segmentation-password-panel" className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 sm:p-5">
            <form onSubmit={handleSegmentationPasswordSubmit} className="space-y-4">
              <div>
                <label htmlFor="segmentation-password-input" className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Password
                </label>
                <input
                  id="segmentation-password-input"
                  data-testid="segmentation-password-input"
                  type="password"
                  value={segmentationPasswordInput}
                  onChange={(event) => {
                    console.log('[CulturalArchaeologist] Segmentation password input changed.', {
                      passwordLength: event.target.value.length,
                    });
                    setSegmentationPasswordInput(event.target.value);
                    if (segmentationPasswordError) {
                      setSegmentationPasswordError(null);
                    }
                  }}
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-300"
                  placeholder="Enter segmentation password"
                  autoFocus
                />
              </div>

              {segmentationPasswordError && (
                <p data-testid="segmentation-password-error" className="text-sm text-rose-600">
                  {segmentationPasswordError}
                </p>
              )}

              <p className="text-xs text-zinc-500">{SEGMENTATION_PASSWORD_SUPPORT_COPY}</p>

              <div className="flex items-center justify-end">
                <button
                  type="submit"
                  data-testid="segmentation-password-submit-button"
                  className="inline-flex items-center rounded-lg border border-indigo-600 bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 hover:border-indigo-700"
                >
                  Continue
                </button>
              </div>
            </form>
          </div>
        ) : isSegmentationLoading ? (
          <div className="flex flex-col items-center justify-center py-12" data-testid="segmentation-loading-state">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-4" />
            <p className="text-zinc-500 animate-pulse">Running regression analysis across all audience signals...</p>
          </div>
        ) : segmentationError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4" data-testid="segmentation-error-state">
            <h4 className="text-sm font-semibold text-rose-800 mb-1">Segmentation unavailable</h4>
            <p className="text-sm text-rose-700">{segmentationError}</p>
            <button
              type="button"
              data-testid="retry-segmentation-button"
              onClick={() => {
                void runSegmentationAnalysis(displayMatrix || matrix);
              }}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        ) : segmentationResult ? (
          <div className="space-y-4" data-testid="segmentation-result-state">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <h4 className="text-sm font-semibold text-zinc-900 mb-2">Regression Summary</h4>
              <p className="text-sm text-zinc-700">
                {renderSegmentationEvidenceText(segmentationResult.regressionSummary, 'segmentation-regression-summary')}
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <h4 className="text-sm font-semibold text-amber-800 mb-2">Confidence Notes</h4>
              <p className="text-sm text-amber-800">
                {renderSegmentationEvidenceText(segmentationResult.confidenceNotes, 'segmentation-confidence-notes')}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {segmentationResult.segments.map((segment, index) => {
                const demographicsSnippet = (segment.demographicsSnippet || '').trim() || buildSegmentationDemographicsFallback();
                const segmentCustomInfo = segmentationCustomInfoByIndex[index] || '';
                if (!(segment.demographicsSnippet || '').trim()) {
                  console.log('[CulturalArchaeologist] Using segmentation demographics fallback for segment.', {
                    segmentIndex: index,
                    segmentName: segment.name,
                    demographicsSnippet,
                  });
                }

                return (
                  <div
                    key={`${segment.name}-${index}`}
                    className="rounded-2xl border border-zinc-200 bg-white p-4"
                    data-testid={`segmentation-segment-card-${index + 1}`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Segment {index + 1}</p>
                        <h4 className="text-base font-semibold text-zinc-900">{segment.name}</h4>
                      </div>
                      <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                        {segment.prevalencePct}%
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 mb-2">
                      {renderSegmentationEvidenceText(segment.archetype, `segmentation-segment-${index}-archetype`)}
                    </p>
                    <p className="text-sm text-zinc-700 mb-3">
                      {renderSegmentationEvidenceText(segment.profile, `segmentation-segment-${index}-profile`)}
                    </p>
                    <div className="mb-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Demographics</p>
                      <p className="text-sm text-zinc-700" data-testid={`segmentation-segment-demographics-${index + 1}`}>
                        {renderSegmentationEvidenceText(demographicsSnippet, `segmentation-segment-${index}-demographics`)}
                      </p>
                    </div>
                    <div className="mb-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Key Signals</p>
                      <ul className="list-disc pl-5 space-y-1">
                        {segment.keySignals.map((signal, signalIndex) => (
                          <li key={`${segment.name}-signal-${signalIndex}`} className="text-sm text-zinc-700">
                            {renderSegmentationEvidenceText(signal, `segmentation-segment-${index}-signal-${signalIndex}`)}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Messaging Approach</p>
                      <p className="text-sm text-zinc-700">
                        {renderSegmentationEvidenceText(segment.messagingApproach, `segmentation-segment-${index}-messaging`)}
                      </p>
                    </div>
                    <div className="mt-3">
                      <label
                        htmlFor={`segmentation-segment-custom-input-${index + 1}`}
                        className="text-xs font-semibold uppercase tracking-wider text-zinc-500"
                      >
                        Custom Segment Info
                      </label>
                      <textarea
                        id={`segmentation-segment-custom-input-${index + 1}`}
                        data-testid={`segmentation-segment-custom-input-${index + 1}`}
                        value={segmentCustomInfo}
                        onChange={(event) => {
                          handleSegmentationCustomInfoChange(index, event.target.value);
                        }}
                        rows={3}
                        placeholder="Add custom context to refine this segment..."
                        className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-300"
                      />
                    </div>
                    <div className="mt-4 border-t border-zinc-100 pt-3">
                      <button
                        type="button"
                        data-testid={`segmentation-rerun-analysis-among-segment-button-${index + 1}`}
                        onClick={() => {
                          openSegmentAudienceRerunTab(segment, index);
                        }}
                        className="inline-flex items-center rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                      >
                        Rerun Analysis Among Segment
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
            Enter the password above to run segmentation on this audience.
          </div>
        )}
      </div>
    );
  };

  const deleteSavedMatrix = async (id: string) => {
    await supabase.from(resolvedCulturalTable).delete().eq('id', id);
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
    let processed = 0;
    const total = selectedFiles.length;

    const finalize = () => {
      if (processed < total) return;
      if (newFiles.length > 0) {
        setFiles((prev) => [...prev, ...newFiles]);
      }
      if (failedFiles.length > 0) {
        setFileReadErrors((prev) => [...prev, ...failedFiles]);
        setToast('Some files could not be read.');
      }
    };

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const payload = event.target?.result;
          if (typeof payload !== 'string' || !payload.includes(',')) {
            throw new Error('Malformed file payload');
          }
          const base64String = payload.split(',')[1];
          if (!base64String) throw new Error('File read error');
          newFiles.push({
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            data: base64String
          });
        } catch (err) {
          failedFiles.push(file.name);
          logger.warn('Failed reading uploaded file', { fileName: file.name, err });
        } finally {
          processed += 1;
          finalize();
        }
      };
      reader.onerror = () => {
        failedFiles.push(file.name);
        processed += 1;
        finalize();
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
    ], { shape: pres.ShapeType.roundRect, x: 1, y: boxY, w: 2, h: 0.8, fill: { color: "FFFFFF" }, line: { color: "E4E4E7", width: 1 }, align: "center", valign: "middle" });
    
    slide.addText([
      { text: "RACE / ETHNICITY\n", options: { fontSize: 10, color: "A1A1AA", bold: true } },
      { text: cleanDemographics.race, options: { fontSize: 14, color: "18181B", bold: true } }
    ], { shape: pres.ShapeType.roundRect, x: 3.15, y: boxY, w: 2, h: 0.8, fill: { color: "FFFFFF" }, line: { color: "E4E4E7", width: 1 }, align: "center", valign: "middle" });
    
    slide.addText([
      { text: "GENDER\n", options: { fontSize: 10, color: "A1A1AA", bold: true } },
      { text: cleanDemographics.gender, options: { fontSize: 14, color: "18181B", bold: true } }
    ], { shape: pres.ShapeType.roundRect, x: 5.3, y: boxY, w: 2, h: 0.8, fill: { color: "FFFFFF" }, line: { color: "E4E4E7", width: 1 }, align: "center", valign: "middle" });
    
    const categories = [
      { title: 'Moments', data: matrix.moments },
      { title: 'Beliefs', data: matrix.beliefs },
      { title: 'Behaviors', data: matrix.behaviors },
      { title: 'Contradictions', data: matrix.contradictions },
      { title: 'Tone', data: matrix.tone },
      { title: 'Language', data: matrix.language },
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
          const examplesText = d.deepDive.realWorldExamples
            .map((example) => {
              const normalizedExample = normalizeRealWorldExampleEntry(example);
              if (!normalizedExample.text) return '';
              if (!normalizedExample.sourceLink) {
                return `• ${normalizedExample.text}`;
              }
              return `• ${normalizedExample.text}\n  Source: ${normalizedExample.sourceLink.title} - ${normalizedExample.sourceLink.url}`;
            })
            .filter(Boolean)
            .join('\n');
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

  const buildCulturalExportDocument = (): BrandAtlasExportDocument | null => {
    if (!matrix || !matrixMeta) return null;
    const cleanDemographics = sanitizeDemographics(matrix.demographics);
    const sections = [
      { title: 'Moments', data: matrix.moments },
      { title: 'Beliefs', data: matrix.beliefs },
      { title: 'Behaviors', data: matrix.behaviors },
      { title: 'Contradictions', data: matrix.contradictions },
      { title: 'Tone', data: matrix.tone },
      { title: 'Language', data: matrix.language },
      { title: 'Community', data: matrix.community },
      { title: 'Influencers', data: matrix.influencers },
    ].map((section) => ({
      title: section.title,
      cards: section.data.flatMap((item, index) => {
        const insightCard = {
          title: `Insight ${index + 1}`,
          lines: [
            item.text,
            `Confidence: ${(item.confidenceLevel || 'medium').toUpperCase()}`,
            item.sourceType ? `Source Type: ${item.sourceType}` : '',
          ].filter(Boolean),
        };

        if (!item.deepDive) {
          return [insightCard];
        }

        const deepDive = item.deepDive;
        const deepDiveLines = [
          deepDive.expandedContext ? `Expanded Context: ${deepDive.expandedContext}` : '',
          deepDive.relevance ? `Relevance: ${deepDive.relevance}` : '',
          deepDive.originationDate ? `Originated: ${deepDive.originationDate}` : '',
          ...(deepDive.strategicImplications || []).map((implication, implicationIndex) =>
            `Strategic Implication ${implicationIndex + 1}: ${implication}`
          ),
          ...(deepDive.realWorldExamples || []).map((example, exampleIndex) => {
            const normalizedExample = normalizeRealWorldExampleEntry(example);
            if (!normalizedExample.text) return '';
            if (!normalizedExample.sourceLink) {
              return `Real-World Example ${exampleIndex + 1}: ${normalizedExample.text}`;
            }
            return `Real-World Example ${exampleIndex + 1}: ${normalizedExample.text} | Source: ${normalizedExample.sourceLink.title} - ${normalizedExample.sourceLink.url}`;
          }),
        ].filter(Boolean);

        if (deepDiveLines.length === 0) {
          return [insightCard];
        }

        return [
          insightCard,
          {
            title: `Insight ${index + 1} Deep Dive`,
            lines: deepDiveLines,
          },
        ];
      }),
    }));

    if ((matrix.sources || []).length > 0) {
      sections.push({
        title: 'Sources',
        cards: (matrix.sources || []).slice(0, 24).map((source) => ({
          title: source.title,
          lines: [source.url],
        })),
      });
    }

    return {
      reportTitle: 'Cultural Archaeologist',
      reportSubtitle: 'Brand Atlas Cultural Lens Report',
      audience: matrixMeta.audience || 'N/A',
      contextLines: [
        matrixMeta.brand ? `Context: ${matrixMeta.brand}` : '',
        matrixMeta.topicFocus ? `Topic: ${matrixMeta.topicFocus}` : '',
        matrixMeta.sourcesType?.length ? `Sources: ${matrixMeta.sourcesType.join(', ')}` : '',
        `Demographics: Age ${cleanDemographics.age} | Race ${cleanDemographics.race} | Gender ${cleanDemographics.gender}`,
      ].filter(Boolean),
      sections,
    };
  };

  const buildSegmentationExportDocument = (): BrandAtlasExportDocument | null => {
    if (!matrixMeta || !segmentationResult) return null;
    const cleanDemographics = sanitizeDemographics(matrix?.demographics || {});
    const cleanEvidenceText = (value: string): string => extractEvidenceTags(value || '').cleanText || value || '';

    const sectionCards = segmentationResult.segments.map((segment, index) => {
      const demographicsSnippet = (segment.demographicsSnippet || '').trim();
      return {
        title: `Segment ${index + 1}: ${segment.name} (${segment.prevalencePct}%)`,
        lines: [
          `Archetype: ${cleanEvidenceText(segment.archetype)}`,
          `Profile: ${cleanEvidenceText(segment.profile)}`,
          `Demographics: ${cleanEvidenceText(demographicsSnippet || `Age: ${cleanDemographics.age} | Race/Ethnicity: ${cleanDemographics.race} | Gender: ${cleanDemographics.gender}`)}`,
          `Key Signals: ${(segment.keySignals || []).map((signal) => cleanEvidenceText(signal)).filter(Boolean).join('; ')}`,
          `Messaging Approach: ${cleanEvidenceText(segment.messagingApproach)}`,
        ].filter(Boolean),
      };
    });

    const sections: BrandAtlasExportDocument['sections'] = [
      {
        title: 'Segmentation Summary',
        cards: [
          {
            title: 'Regression Summary',
            lines: [cleanEvidenceText(segmentationResult.regressionSummary)],
          },
          {
            title: 'Confidence Notes',
            lines: [cleanEvidenceText(segmentationResult.confidenceNotes)],
          },
        ],
      },
      {
        title: 'Audience Segments',
        cards: sectionCards,
      },
    ];

    const matrixSources = matrix?.sources ?? [];

    if (matrixSources.length > 0) {
      sections.push({
        title: 'Sources',
        cards: matrixSources.slice(0, 24).map((source) => ({
          title: source.title,
          lines: [source.url],
        })),
      });
    }

    return {
      reportTitle: 'Audience Segmentation Workspace',
      reportSubtitle: 'Regression-Style Audience Archetypes',
      audience: matrixMeta.audience || 'N/A',
      contextLines: [
        matrixMeta.brand ? `Context: ${matrixMeta.brand}` : '',
        matrixMeta.topicFocus ? `Topic: ${matrixMeta.topicFocus}` : '',
        matrixMeta.sourcesType?.length ? `Sources: ${matrixMeta.sourcesType.join(', ')}` : '',
      ].filter(Boolean),
      sections,
    };
  };

  const exportToPPTX = async () => {
    if (!matrixMeta) return;
    const isSegmentationExport = isSegmentationTabActive;
    const fileBase = buildExportFileBase(
      matrixMeta.audience,
      isSegmentationExport ? 'Audience_Segmentation' : 'Cultural_Archaeologist'
    );
    const exportDocument = isSegmentationExport ? buildSegmentationExportDocument() : buildCulturalExportDocument();
    if (!exportDocument) {
      const message = isSegmentationExport
        ? 'No segmentation results available to export yet. Run segmentation first.'
        : 'No cultural analysis results available to export yet.';
      setExportError({ type: 'pptx', message });
      setToast(message);
      return;
    }
    console.log('[CulturalArchaeologist] Starting PPTX export.', {
      isSegmentationExport,
      audience: matrixMeta.audience,
      sections: exportDocument.sections.length,
    });
    setExportError(null);
    setIsExporting(true);
    setToast('Generating PPTX...');
    try {
      await runUserAction({
        actionName: isSegmentationExport ? 'export-segmentation-pptx-themed' : 'export-cultural-pptx-themed',
        action: async () => {
          await exportBrandAtlasDocumentToPptx(
            exportDocument,
            isSegmentationExport
              ? `${fileBase}_Audience_Segmentation.pptx`
              : `${fileBase}_Cultural_Archaeologist.pptx`
          );
          return true;
        },
      });
      setToast(isSegmentationExport ? 'Segmentation PPTX exported successfully!' : 'PPTX exported successfully!');
    } catch (err) {
      const normalized = normalizeAppError(err);
      const detail = getExportErrorDetail(err);
      logger.error('Failed to export PPTX', { err, normalized, isSegmentationExport });
      setExportError({ type: 'pptx', message: detail ? `Failed to export PPTX: ${detail}` : (normalized.message || 'Failed to export PPTX.') });
      setToast('Failed to export PPTX.');
    } finally {
      setIsExporting(false);
    }
  };

  const exportToPDF = async () => {
    if (!matrixMeta) return;
    const isSegmentationExport = isSegmentationTabActive;
    const fileBase = buildExportFileBase(
      matrixMeta.audience,
      isSegmentationExport ? 'Audience_Segmentation' : 'Cultural_Archaeologist'
    );
    const exportDocument = isSegmentationExport ? buildSegmentationExportDocument() : buildCulturalExportDocument();
    if (!exportDocument) {
      const message = isSegmentationExport
        ? 'No segmentation results available to export yet. Run segmentation first.'
        : 'No cultural analysis results available to export yet.';
      setExportError({ type: 'pdf', message });
      setToast(message);
      return;
    }
    console.log('[CulturalArchaeologist] Starting PDF export.', {
      isSegmentationExport,
      audience: matrixMeta.audience,
      sections: exportDocument.sections.length,
    });
    setExportError(null);
    setIsExporting(true);
    setToast('Generating PDF...');
    try {
      await exportBrandAtlasDocumentToPdf(
        exportDocument,
        isSegmentationExport
          ? `${fileBase}_Audience_Segmentation.pdf`
          : `${fileBase}_Cultural_Archaeologist.pdf`
      );
      setToast(isSegmentationExport ? 'Segmentation PDF exported successfully!' : 'PDF exported successfully!');
    } catch (err) {
      const normalized = normalizeAppError(err);
      const detail = getExportErrorDetail(err);
      logger.error('Failed to export PDF', { err, normalized, isSegmentationExport });
      setExportError({
        type: 'pdf',
        message: detail ? `Failed to generate PDF: ${detail}` : (normalized.message || 'Failed to generate PDF.'),
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

  const menuPageCards: MenuPageCard[] = [
    {
      id: 'cultural-archaeologist',
      title: 'Cultural Archaeologist',
      description: 'Generate sharper insights about any audience through a cultural lens.',
      bullets: ['Audience research', 'Strategy development', 'Campaign & content ideation', 'Creative briefs', 'Pitches'],
      icon: <Search className="w-4 h-4" />,
      href: '/#cultural-archaeologist',
      onClick: () => navigateToHashRoute('cultural-archaeologist'),
      bulletsMarginClassName: 'mt-4',
    },
    {
      id: 'brand-navigator',
      title: 'Brand Navigator',
      description: 'Audit multiple brands to compare positionings, messages, campaigns, etc.',
      bullets: ['Brand audits & competitive analysis', 'Opportunity space identification', 'Messaging development', 'Creative briefs', 'Pitches'],
      icon: <CompassRoseIcon className="w-4 h-4" />,
      href: '/#brand-navigator',
      onClick: () => navigateToHashRoute('brand-navigator'),
      bulletsMarginClassName: 'mt-4',
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
        'align-super ml-3 inline-block px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold tracking-wide border border-indigo-200',
      bulletsMarginClassName: 'mt-4',
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

      <main
        className={`relative z-10 flex-1 w-full ${activeExperience === 'research' ? 'max-w-[calc(100vw-3rem)]' : 'max-w-6xl'} mx-auto px-6 ${activeExperience === null ? 'py-6 md:py-10' : 'py-16 md:py-24'}`}
      >
        {activeExperience === null && (
          <MenuPage
            subtitle="Start with cultural research, run a brand audit, or jump into a visual identity analysis."
            sectionClassName="max-w-6xl"
            cardsGridClassName="grid grid-cols-1 md:grid-cols-3 gap-8 items-start"
            cards={menuPageCards}
          />
        )}

        {(activeExperience === 'brand' || hasOpenedBrand) && (
          <div className={activeExperience === 'brand' ? '' : 'hidden'}>
            <BrandDeepDivePage onBack={() => navigateToHomeDashboard()} />
          </div>
        )}

        {activeExperience === 'admin' && (
          <SectionErrorBoundary title="Admin Console">
            {isAdminAuthorized ? (
              <AdminPage onBack={() => navigateToHomeDashboard()} />
            ) : (
              <section className="mx-auto max-w-2xl rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
                <p className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-zinc-700">
                  <Shield className="h-3.5 w-3.5" />
                  Restricted
                </p>
                <h2 className="mt-4 text-2xl font-semibold text-zinc-900">Admin Access Required</h2>
                <p className="mt-2 text-sm text-zinc-600">
                  Enter the admin password to access Supabase row reconstruction tools.
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    data-testid="admin-open-password-popout-button"
                    onClick={() => {
                      console.log('[CulturalArchaeologist] Re-opening admin password popout from locked admin screen.');
                      setIsAdminPasswordPopoutOpen(true);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    <Shield className="h-4 w-4" />
                    Enter Password
                  </button>
                  <button
                    type="button"
                    data-testid="admin-back-to-home-button"
                    onClick={() => navigateToHomeDashboard()}
                    className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Home
                  </button>
                </div>
              </section>
            )}
          </SectionErrorBoundary>
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
                  <p data-testid="mobile-page-title" className="truncate text-right text-sm font-semibold text-zinc-900">Cultural Archaeologist</p>
                  <div data-testid="mobile-page-icon" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-indigo-600">
                    <Search className="h-4 w-4" />
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
                  Deep dive into any culture or audience.
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
                href="/#brand-navigator"
                onClick={(event) => handlePrimaryLinkNavigation(event, () => navigateToHashRoute('brand-navigator'))}
                className="inline-flex h-10 w-full items-center justify-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm border border-zinc-200 text-zinc-700 rounded-full font-medium leading-none hover:bg-zinc-50 hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-500/50 focus:ring-offset-1 transition-all shadow-sm text-sm sm:w-auto"
              >
                <CompassRoseIcon className="w-4 h-4" /> Brand Navigator
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
              data-testid="cultural-toast"
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

        {/* Segmentation Password Popout */}
        <AnimatePresence>
          {isSegmentationPasswordPopoutOpen && (
            <motion.div
              data-testid="segmentation-password-popout"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/50 p-4 sm:p-6 flex items-center justify-center"
              onClick={(event) => {
                if (event.target !== event.currentTarget) return;
                console.log('[CulturalArchaeologist] Closing segmentation password popout from backdrop click.');
                setIsSegmentationPasswordPopoutOpen(false);
                setSegmentationPasswordInput('');
                setSegmentationPasswordError(null);
              }}
            >
              <motion.div
                data-testid="segmentation-password-popout-dialog"
                initial={{ scale: 0.96, opacity: 0, y: 16 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.96, opacity: 0, y: 16 }}
                className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6 shadow-2xl relative"
              >
                <button
                  type="button"
                  data-testid="segmentation-password-popout-close-button"
                  onClick={() => {
                    console.log('[CulturalArchaeologist] Closing segmentation password popout from close button.');
                    setIsSegmentationPasswordPopoutOpen(false);
                    setSegmentationPasswordInput('');
                    setSegmentationPasswordError(null);
                  }}
                  className="absolute top-4 right-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-500/40"
                  aria-label="Close segmentation password popout"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="mb-4 pr-8">
                  <h3 className="text-lg font-semibold text-zinc-900">Segmentation Access</h3>
                  <p className="mt-1 text-sm text-zinc-500">
                    Enter the password to open segmentation in a new tab.
                  </p>
                </div>

                <form onSubmit={handleSegmentationPopoutSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="segmentation-password-popout-input" className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      Password
                    </label>
                    <input
                      id="segmentation-password-popout-input"
                      data-testid="segmentation-password-popout-input"
                      type="password"
                      value={segmentationPasswordInput}
                      onChange={(event) => {
                        console.log('[CulturalArchaeologist] Segmentation popout password input changed.', {
                          passwordLength: event.target.value.length,
                        });
                        setSegmentationPasswordInput(event.target.value);
                        if (segmentationPasswordError) {
                          setSegmentationPasswordError(null);
                        }
                      }}
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-300"
                      placeholder="Enter segmentation password"
                      autoFocus
                    />
                  </div>

                  {segmentationPasswordError && (
                    <p data-testid="segmentation-password-popout-error" className="text-sm text-rose-600">
                      {segmentationPasswordError}
                    </p>
                  )}

                  <p className="text-xs text-zinc-500">{SEGMENTATION_PASSWORD_SUPPORT_COPY}</p>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      data-testid="segmentation-password-popout-cancel-button"
                      onClick={() => {
                        console.log('[CulturalArchaeologist] Closing segmentation password popout from cancel button.');
                        setIsSegmentationPasswordPopoutOpen(false);
                        setSegmentationPasswordInput('');
                        setSegmentationPasswordError(null);
                      }}
                      className="inline-flex items-center rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      data-testid="segmentation-password-popout-submit-button"
                      className="inline-flex items-center rounded-lg border border-indigo-600 bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 hover:border-indigo-700"
                    >
                      Continue
                    </button>
                  </div>
                </form>
              </motion.div>
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
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setDeepDiveInsight(null);
                  setDeepDiveCategory(null);
                }
              }}
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
                  onClick={() => {
                    setDeepDiveInsight(null);
                    setDeepDiveCategory(null);
                  }}
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
                    <div className="flex flex-col items-start gap-2">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 text-xs font-medium text-zinc-700 border border-zinc-200">
                        <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                        Originated: {deepDiveResult.originationDate}
                      </div>
                    </div>
                  )}
                </div>

                {!isDeepDiveLoading && deepDiveResult && (
                  <div className="w-full mb-6">
                    <div className="flex items-start gap-1.5 px-3 py-2 rounded-lg bg-emerald-50 text-xs font-medium text-emerald-800 border border-emerald-100 w-full text-left">
                      <Activity className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{deepDiveResult.relevance}</span>
                    </div>
                  </div>
                )}

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

                {deepDiveCategory === 'Influencers' && (
                  <div className="bg-rose-50 rounded-xl p-4 mb-8 border border-rose-100" data-testid="influencer-score-definitions">
                    <h4 className="font-bold text-zinc-900 mb-2">Influencer Scores</h4>
                    <p className="text-zinc-700 text-sm mb-2"><strong>Scores:</strong> Resonance: high. Relevance: high. Penetration: medium.</p>
                    <p className="text-zinc-700 text-sm"><strong>Resonance:</strong> how quickly the creator is gaining momentum and attention.</p>
                    <p className="text-zinc-700 text-sm"><strong>Relevance:</strong> how tightly the creator fits this audience niche and can drive action.</p>
                    <p className="text-zinc-700 text-sm"><strong>Penetration:</strong> how broadly visible the creator is across relevant channels.</p>
                  </div>
                )}

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
                                Real World Examples
                              </>
                            ),
                            content: (
                              <ul className="space-y-3">
                                {deepDiveResult.realWorldExamples.map((ex, i) => {
                                  const normalizedExample = normalizeRealWorldExampleEntry(ex);
                                  const parsedExample = extractEvidenceTags(normalizedExample.text);
                                  const exampleSourceLink = normalizedExample.sourceLink;
                                  return (
                                  <li key={i} className="text-zinc-700 text-sm">
                                    <div className="flex flex-col gap-2">
                                      <span>
                                        {parsedExample.cleanText}
                                        {parsedExample.labels.map((label) => (
                                          <span key={`real-world-${i}-${label}`} className={`inline-block ml-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded align-middle ${evidenceLabelChipClass(label)}`}>
                                            {label}
                                          </span>
                                        ))}
                                      </span>
                                      {exampleSourceLink && (
                                        <a
                                          data-testid={`deep-dive-real-world-source-link-mobile-${i}`}
                                          href={toSafeExternalHref(exampleSourceLink.url)}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex w-fit items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 hover:underline"
                                        >
                                          <ExternalLink className="w-3 h-3" />
                                          <span>{exampleSourceLink.title}</span>
                                        </a>
                                      )}
                                    </div>
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
                                        <span
                                          key={`strategic-mobile-${i}-${label}`}
                                          data-testid={`deep-dive-strategic-chip-mobile-${i}-${label}`}
                                          className={`inline-block ml-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded align-middle ${evidenceLabelChipClass(label)}`}
                                        >
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
                          ...(normalizeDeepDiveSourceLinks(deepDiveResult.sources).length > 0
                            ? [
                                {
                                  id: 'deep-dive-sources',
                                  title: 'Sources',
                                  content: (
                                    <div className="flex flex-wrap gap-2">
                                      {normalizeDeepDiveSourceLinks(deepDiveResult.sources).map((source, i) => (
                                        <a
                                          key={i}
                                          href={toSafeExternalHref(source.url)}
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
                          Real World Examples
                        </h4>
                        <ul className="space-y-3">
                          {deepDiveResult.realWorldExamples.map((ex, i) => {
                            const normalizedExample = normalizeRealWorldExampleEntry(ex);
                            const parsedExample = extractEvidenceTags(normalizedExample.text);
                            const exampleSourceLink = normalizedExample.sourceLink;
                            return (
                              <li key={i} className="text-zinc-700 text-sm">
                                <div className="flex flex-col gap-2">
                                  <span>
                                    {parsedExample.cleanText}
                                    {parsedExample.labels.map((label) => (
                                      <span key={`real-world-desktop-${i}-${label}`} className={`inline-block ml-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded align-middle ${evidenceLabelChipClass(label)}`}>
                                        {label}
                                      </span>
                                    ))}
                                  </span>
                                  {exampleSourceLink && (
                                    <a
                                      data-testid={`deep-dive-real-world-source-link-desktop-${i}`}
                                      href={toSafeExternalHref(exampleSourceLink.url)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex w-fit items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 hover:underline"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                      <span>{exampleSourceLink.title}</span>
                                    </a>
                                  )}
                                </div>
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
                                      <span
                                        key={`strategic-desktop-${i}-${label}`}
                                        data-testid={`deep-dive-strategic-chip-desktop-${i}-${label}`}
                                        className={`inline-block ml-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded align-middle ${evidenceLabelChipClass(label)}`}
                                      >
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

                      {normalizeDeepDiveSourceLinks(deepDiveResult.sources).length > 0 && (
                        <section className="pt-6 border-t border-zinc-100">
                          <h4 className="text-sm font-bold text-zinc-900 mb-3">Sources</h4>
                          <div className="flex flex-wrap gap-2">
                            {normalizeDeepDiveSourceLinks(deepDiveResult.sources).map((source, i) => (
                              <a
                                key={i}
                                href={toSafeExternalHref(source.url)}
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

        <div className="mb-16 flex flex-col items-center text-center no-print pt-6 sm:pt-14">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="hidden sm:block"
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
            className={`w-full max-w-4xl mt-4 sm:mt-10 relative flex flex-col gap-4 pb-24 sm:pb-0 ${isResearchControlsMinimized ? 'hidden' : ''}`}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              <div className="relative flex flex-col w-full self-start" ref={audienceHistoryRef}>
                <div data-testid="cultural-audience-field" className="relative flex items-center w-full h-14">
                  <button
                    type="button"
                    data-testid="cultural-audience-detail-toggle"
                    aria-label="Toggle detailed audience definition"
                    aria-expanded={isAudienceDetailOpen}
                    onClick={() => {
                      setIsAudienceDetailOpen((wasOpen) => {
                        const nextOpen = !wasOpen;
                        console.log('[CulturalArchaeologist] Audience detail input toggled.', { isOpen: nextOpen });
                        return nextOpen;
                      });
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                  >
                    <ChevronDown className={`w-5 h-5 transition-transform ${isAudienceDetailOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <input
                    type="text"
                    value={audience}
                    onChange={(e) => {
                      const nextAudience = e.target.value.slice(0, MAX_CULTURAL_AUDIENCE_INPUT_LENGTH);
                      setAudience(nextAudience);
                      if (savedAudiencesByIp.length > 0) {
                        setIsAudienceHistoryOpen(true);
                      }
                      if (
                        segmentRerunContext &&
                        nextAudience.trim().toLowerCase() !== segmentRerunContext.audience.trim().toLowerCase()
                      ) {
                        setSegmentRerunContext(null);
                      }
                      if (showValidation) setShowValidation(false);
                    }}
                    onFocus={() => {
                      if (filteredAudienceHistory.length > 0) {
                        setIsAudienceHistoryOpen(true);
                      }
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                      }
                    }}
                    placeholder="Primary Audience (Required) *"
                    className={`w-full h-14 pl-4 pr-20 py-0 bg-white border ${showValidation && !audience.trim() ? 'border-red-500 focus:ring-red-500/20 focus:border-red-500' : 'border-zinc-200 focus:ring-indigo-500/20 focus:border-indigo-500'} rounded-2xl text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 transition-all shadow-sm text-sm`}
                    disabled={isLoading}
                    required
                  />
                  {isDetecting && !audience.trim() && (
                    <div className="absolute right-12 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                    </div>
                  )}
                </div>
                <AnimatePresence>
                  {isAudienceHistoryOpen && filteredAudienceHistory.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.15 }}
                      data-testid="cultural-audience-history-dropdown"
                      className="absolute top-full left-0 z-20 mt-2 w-full overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg"
                    >
                      <div className="border-b border-zinc-100 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                        Previous Audiences
                      </div>
                      <div className="max-h-56 overflow-y-auto p-2">
                        {filteredAudienceHistory.map((savedAudience, index) => (
                          <button
                            key={`${savedAudience}-${index}`}
                            type="button"
                            data-testid={`cultural-audience-history-item-${index}`}
                            onClick={() => {
                              console.log('[CulturalArchaeologist] Applied saved audience from IP-gated history.', {
                                audience: savedAudience,
                                index,
                              });
                              setAudience(savedAudience);
                              setIsAudienceHistoryOpen(false);
                            }}
                            className="w-full rounded-xl px-3 py-2 text-left text-sm text-zinc-800 transition-colors hover:bg-zinc-50 focus:bg-zinc-50 focus:outline-none"
                          >
                            {savedAudience}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                {showValidation && !audience.trim() && (
                  <span className="text-red-500 text-sm mt-1 ml-2 text-left">Audience is required to generate insights.</span>
                )}
                {isAudienceDetailOpen && (
                  <div data-testid="cultural-audience-detail-box" className="mt-2 ml-2">
                    <textarea
                      id="cultural-audience-detail-input"
                      data-testid="cultural-audience-detail-input"
                      value={audienceDetail}
                      onChange={(event) => {
                        setAudienceDetail(event.target.value);
                      }}
                      onKeyDown={(event) => {
                        handleTextareaBulletShortcuts(event, {
                          value: audienceDetail,
                          onValueChange: setAudienceDetail,
                          logPrefix: 'CulturalArchaeologist',
                        });
                      }}
                      placeholder={`Add more audience details.\n- Demographics\n- Motivations\n- Behaviors`}
                      className="w-full min-h-[128px] rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-y"
                      disabled={isLoading}
                    />
                  </div>
                )}
                <InputGuidance
                  baseTestId="cultural-audience-guidance"
                  helperText={CULTURAL_AUDIENCE_GUIDANCE_HELPER}
                  helperTextClassName="text-zinc-400"
                  tooltipLabel="Primary audience input guidance"
                  tooltipText={CULTURAL_AUDIENCE_GUIDANCE_TOOLTIP}
                />
              </div>
              
              <div className="relative flex flex-col w-full self-start" ref={brandDropdownRef}>
                <div data-testid="cultural-brands-field" className={`relative flex w-full ${normalizedBrands.length > 0 ? 'min-h-14 items-start' : 'h-14 items-center'} bg-white border border-zinc-200 rounded-2xl text-zinc-900 focus-within:outline-none focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all shadow-sm text-sm`}>
                  <Tag className={`absolute left-4 w-5 h-5 text-zinc-400 ${normalizedBrands.length > 0 ? 'top-4' : 'top-1/2 -translate-y-1/2'}`} />
                  <div
                    data-testid="cultural-brands-input-shell"
                    className={`w-full ${normalizedBrands.length > 0 ? 'min-h-14 py-2 items-start' : 'h-14 py-0 items-center'} pl-12 pr-10 flex gap-2 flex-wrap`}
                  >
                    {normalizedBrands.map((brandChip, chipIndex) => (
                      <span
                        key={`${brandChip}-${chipIndex}`}
                        data-testid={`cultural-brand-chip-${chipIndex}`}
                        className="inline-flex max-w-full items-start gap-1 rounded-full bg-zinc-100 text-zinc-800 border border-zinc-200 px-3 py-1 text-xs font-medium whitespace-normal break-words"
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
                      data-testid="cultural-brands-input"
                      type="text"
                      value={brandInput}
                      onChange={(e) => {
                        setBrandInput(e.target.value.slice(0, MAX_CULTURAL_BRAND_INPUT_LENGTH));
                        setIsBrandDropdownOpen(true);
                      }}
                      onFocus={() => setIsBrandDropdownOpen(true)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault();
                          commitBrandInput(brandInput);
                          return;
                        }

                        if (e.key === 'Backspace' && !brandInput.trim() && normalizedBrands.length > 0) {
                          e.preventDefault();
                          const lastBrand = normalizedBrands[normalizedBrands.length - 1];
                          removeBrandChip(lastBrand);
                        }
                      }}
                      placeholder={normalizedBrands.length > 0 ? 'Add more brands or category' : 'Brands or Category (Optional)'}
                      className={`bg-transparent text-zinc-900 text-left placeholder:text-left placeholder-zinc-400 focus:outline-none ${normalizedBrands.length > 0 ? 'flex-1 min-w-[140px] py-1 pr-1' : 'w-full min-w-0 h-10 leading-10 pr-0'}`}
                      disabled={isLoading}
                    />
                  </div>
                  {isDetecting && !brandInput.trim() && (
                    <div className="absolute right-4 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                    </div>
                  )}
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
                        <div className="px-4 py-3 text-xs text-amber-700 bg-amber-50 border-b border-amber-100 flex items-center justify-between gap-3">
                          <span>{suggestionsError}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setSuggestionsError(null);
                              setHasQuotaError(false);
                              setSuggestionsRetryNonce((prev) => prev + 1);
                            }}
                            className="text-amber-800 font-medium hover:underline"
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
                <InputGuidance
                  baseTestId="cultural-brands-guidance"
                  helperText={CULTURAL_BRANDS_GUIDANCE_HELPER}
                  helperTextClassName="text-zinc-400"
                  tooltipLabel="Brand or category input guidance"
                  tooltipText={CULTURAL_BRANDS_GUIDANCE_TOOLTIP}
                />
              </div>

              <div className="relative flex flex-col w-full self-start">
                <div data-testid="cultural-topic-field" className="relative flex items-center w-full h-14">
                  <Target className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                  <input
                    type="text"
                    value={topicFocus}
                    onChange={(e) => setTopicFocus(e.target.value.slice(0, MAX_CULTURAL_TOPIC_INPUT_LENGTH))}
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
                <InputGuidance
                  baseTestId="cultural-topic-guidance"
                  helperText={CULTURAL_TOPIC_GUIDANCE_HELPER}
                  helperTextClassName="text-zinc-400"
                  tooltipLabel="Topic input guidance"
                  tooltipText={CULTURAL_TOPIC_GUIDANCE_TOOLTIP}
                />
              </div>
            </div>

            {/* Filters Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
              <FieldHoverExplainer
                baseTestId="cultural-generation-field-explainer"
                tooltipLabel="Generation filter explainer"
                tooltipText={CULTURAL_GENERATION_FILTER_EXPLAINER_TOOLTIP}
                suppressTooltip={isGenerationDropdownOpen}
                disableOnMobile
              >
                <div className="relative flex flex-col w-full self-start" ref={dropdownRef}>
                  <button
                    data-testid="cultural-generation-field"
                    type="button"
                    onClick={() => setIsGenerationDropdownOpen(!isGenerationDropdownOpen)}
                    className="w-full h-14 flex items-center justify-between px-4 py-0 bg-white border border-zinc-200 rounded-2xl text-zinc-700 hover:bg-zinc-50 hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:ring-offset-1 transition-all shadow-sm text-sm"
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
                  <div data-testid="cultural-generation-mobile-guidance" className="md:hidden">
                    <InputGuidance
                      baseTestId="cultural-generation-mobile-guidance-inline"
                      helperText={CULTURAL_GENERATION_FILTER_EXPLAINER_TOOLTIP}
                      helperTextClassName="text-zinc-400"
                      tooltipLabel="Generation filter explainer"
                      tooltipText={CULTURAL_GENERATION_FILTER_EXPLAINER_TOOLTIP}
                    />
                  </div>
                </div>
              </FieldHoverExplainer>

              <FieldHoverExplainer
                baseTestId="cultural-sources-field-explainer"
                tooltipLabel="Sources filter explainer"
                tooltipText={CULTURAL_SOURCES_FILTER_EXPLAINER_TOOLTIP}
                suppressTooltip={isSourcesDropdownOpen}
                disableOnMobile
              >
                <div className="relative flex flex-col w-full self-start" ref={sourcesDropdownRef}>
                  <button
                    data-testid="cultural-sources-field"
                    type="button"
                    onClick={() => setIsSourcesDropdownOpen(!isSourcesDropdownOpen)}
                    className="w-full h-14 flex items-center justify-between px-4 py-0 bg-white border border-zinc-200 rounded-2xl text-zinc-700 hover:bg-zinc-50 hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:ring-offset-1 transition-all shadow-sm text-sm"
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
                  <div data-testid="cultural-sources-mobile-guidance" className="md:hidden">
                    <InputGuidance
                      baseTestId="cultural-sources-mobile-guidance-inline"
                      helperText={CULTURAL_SOURCES_FILTER_EXPLAINER_TOOLTIP}
                      helperTextClassName="text-zinc-400"
                      tooltipLabel="Sources filter explainer"
                      tooltipText={CULTURAL_SOURCES_FILTER_EXPLAINER_TOOLTIP}
                    />
                  </div>
                </div>
              </FieldHoverExplainer>

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
                <FieldHoverExplainer
                  baseTestId="cultural-upload-field-explainer"
                  tooltipLabel="Upload documents explainer"
                  tooltipText={CULTURAL_UPLOAD_DOCUMENTS_EXPLAINER_TOOLTIP}
                  disableOnMobile
                >
                  <button
                    data-testid="cultural-upload-field"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading}
                    className="w-full h-14 relative flex items-center bg-white border border-dashed border-zinc-300 rounded-2xl text-zinc-600 hover:bg-zinc-50 hover:border-indigo-300 hover:text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:ring-offset-1 transition-all shadow-sm text-sm"
                  >
                    <Upload className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                    <span className="w-full pl-12 pr-4 py-0 text-left block truncate">
                      {files.length > 0
                        ? files.map(f => f.name).join(', ')
                        : 'Upload Documents (Optional)'}
                    </span>
                  </button>
                </FieldHoverExplainer>
                <div data-testid="cultural-upload-mobile-guidance" className="md:hidden">
                  <InputGuidance
                    baseTestId="cultural-upload-mobile-guidance-inline"
                    helperText={CULTURAL_UPLOAD_DOCUMENTS_EXPLAINER_TOOLTIP}
                    helperTextClassName="text-zinc-400"
                    tooltipLabel="Upload documents explainer"
                    tooltipText={CULTURAL_UPLOAD_DOCUMENTS_EXPLAINER_TOOLTIP}
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
                  <p className="mt-2 text-xs text-amber-700">
                    Some files could not be read: {Array.from(new Set(fileReadErrors)).slice(0, 4).join(', ')}
                  </p>
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
                      'Scanning latest audience signals...',
                      'Synthesizing cultural tensions...',
                      'Ranking highest-potency insights...',
                      'Shaping strategist-ready output...',
                    ]}
                    className="text-xs whitespace-nowrap leading-none"
                    showProgress
                    progress={fakeProgress}
                    averageDurationMs={4000}
                  />
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" /> Generate Insights
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
              Powered by OpenAI's GPT-5.4.
            </p>
            <RecentResultsLibrary<CulturalRecentResult>
              mode={APP_RECENT_RESULTS_MODES.CULTURAL_ARCHAEOLOGIST}
              title="Recent Projects"
              refreshNonce={recentResultsRefreshNonce}
              onSelectItem={(item) => {
                console.log('[CulturalArchaeologist] Recent result selected.', { id: item.id, title: item.title });
                if (item.savedMatrix) {
                  loadSavedMatrix(item.savedMatrix, true, String(item.id));
                  return;
                }
                applyRecentResultMatrixSelection(item, true);
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
              <div className="text-amber-700 text-sm mt-2 flex items-center gap-2">
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
                    const parsedBrands = parseBrandsInput(sm.brand || '');
                    if (parsedBrands.length > 1) {
                      setSelectedBrands(parsedBrands);
                      setBrandInput('');
                    } else {
                      setSelectedBrands([]);
                      setBrandInput(sm.brand || '');
                    }
                    setAudience(sm.audience);
                    setAudienceDetail('');
                    setIsAudienceDetailOpen(false);
                    setSelectedGenerations(sm.generations || []);
                    setTopicFocus(sm.topicFocus || '');
                    setSourcesType(sm.sourcesType || []);
                    resetSegmentationWorkspace('insights');
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
            <SectionErrorBoundary title="Cultural Results">
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
                <div className="flex flex-nowrap items-center gap-3 whitespace-nowrap">
                  {isGeneratingDeepDives && (
                    <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-full text-sm font-medium text-indigo-700 shadow-sm">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Building Insight Deep Dives ({deepDiveProgress.current}/{deepDiveProgress.total})</span>
                    </div>
                  )}
                  <button onClick={exportToPPTX} className="shrink-0 flex items-center gap-2 px-4 py-2 bg-white border border-zinc-200 rounded-full text-sm font-medium text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-500/50 focus:ring-offset-1 transition-all shadow-sm">
                    <Presentation className="w-4 h-4" /> PPTX <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-500 border border-indigo-100">Beta</span>
                  </button>
                  <button onClick={exportToPDF} className="shrink-0 flex items-center gap-2 px-4 py-2 bg-white border border-zinc-200 rounded-full text-sm font-medium text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-500/50 focus:ring-offset-1 transition-all shadow-sm">
                    <FileText className="w-4 h-4" /> PDF <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-500 border border-indigo-100">Beta</span>
                  </button>
                </div>
              </div>
              {(saveWarning || exportError) && (
                <div className="mb-6 space-y-2">
                  {saveWarning && <p className="text-amber-700 text-sm">{saveWarning}</p>}
                  {exportError && (
                    <div className="text-amber-700 text-sm flex items-center gap-2">
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

              {/* Print Title (Only visible when printing) */}
              <div className="hidden print:block mb-10">
                <h1 className="text-4xl font-bold text-zinc-900 mb-2">Audience: {matrixMeta.audience}</h1>
                {matrixMeta.brand && <p className="text-xl text-zinc-600 mb-2">Context: {matrixMeta.brand}</p>}
                {matrixMeta.topicFocus && <p className="text-xl text-zinc-600 mb-2">Topic: {matrixMeta.topicFocus}</p>}
                {matrixMeta.sourcesType && matrixMeta.sourcesType.length > 0 && <p className="text-xl text-zinc-600 mb-2">Sources: {matrixMeta.sourcesType.join(', ')}</p>}
                <p className="text-zinc-500">Generated on {new Date().toLocaleDateString()}</p>
              </div>

              {/* Matrix Search Tool */}
              <ShowThinkingDropdown
                methodologyText={CULTURAL_ARCHAEOLOGIST_SHOW_THINKING_TEXT}
                testIdPrefix="cultural-show-thinking"
              />
              <MobileResultsNav
                testId="mobile-results-nav-culture"
                items={culturalResultNavItems}
              />
              <div id="cultural-results-ask" className="mb-10 bg-indigo-50 rounded-3xl p-6 md:p-8 border border-indigo-100 shadow-sm no-print">
                <h3 className="text-xl font-bold text-indigo-900 mb-4 flex items-center gap-2">
                  <Search className="w-6 h-6" /> Ask the Archaeologist
                </h3>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    value={matrixQuestion}
                    onChange={(e) => setMatrixQuestion(e.target.value.slice(0, 400))}
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
                    data-testid="ask-answer-card"
                    className="mt-6 p-6 bg-white rounded-2xl border border-indigo-100 text-zinc-700 shadow-sm leading-relaxed"
                  >
                    <div className="space-y-4">
                      {structuredMatrixAnswer.length > 0 ? (
                        structuredMatrixAnswer.map((section, index) => (
                          <div key={`ask-section-${index}`} className={section.title ? 'rounded-xl border border-zinc-200 bg-zinc-50 p-4' : ''}>
                            {section.title && (
                              <h4 className="text-sm font-semibold text-zinc-900 mb-2">{section.title}</h4>
                            )}
                            <div className="text-zinc-700 text-[15px] leading-7 whitespace-pre-wrap">
                              {section.sentences.map((sentence, sentenceIndex) => (
                                <span
                                  key={`ask-sentence-${index}-${sentenceIndex}`}
                                  data-testid={`ask-answer-sentence-${index}-${sentenceIndex}`}
                                  className="inline"
                                >
                                  {sentence.text}
                                  {sentence.labels.map((label) => (
                                    <span
                                      key={`ask-label-${index}-${sentenceIndex}-${label}`}
                                      data-testid={`ask-answer-chip-${index}-${sentenceIndex}-${label}`}
                                      className={`inline-flex items-center h-[18px] ml-2 px-1.5 leading-none text-[10px] uppercase tracking-wider font-semibold rounded-md align-middle ${evidenceLabelChipClass(label)}`}
                                    >
                                      {label}
                                    </span>
                                  ))}
                                  {sentenceIndex < section.sentences.length - 1 ? ' ' : ''}
                                </span>
                              ))}
                            </div>
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
              <div id="cultural-results-demographics" className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10 no-print">
                <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm text-center">
                  <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Average Age</div>
                  <div className="text-sm font-semibold text-zinc-900">{formatDemographicDisplayValue(matrix.demographics.age)}</div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm text-center">
                  <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Race / Ethnicity</div>
                  <div className="text-sm font-semibold text-zinc-900">{formatDemographicDisplayValue(matrix.demographics.race)}</div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm text-center">
                  <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Gender</div>
                  <div className="text-sm font-semibold text-zinc-900">{formatDemographicDisplayValue(matrix.demographics.gender)}</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6 mb-6 px-2 no-print">
                <button
                  type="button"
                  data-testid="highly-unique-filter-button"
                  aria-pressed={showHighlyUniqueOnly}
                  onClick={() => {
                    const nextValue = !showHighlyUniqueOnly;
                    console.log('[CulturalArchaeologist] Toggled highly unique filter.', { enabled: nextValue });
                    setShowHighlyUniqueOnly(nextValue);
                  }}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    showHighlyUniqueOnly
                      ? 'border-indigo-200 bg-white text-indigo-700'
                      : 'border-transparent bg-transparent text-zinc-600 hover:border-transparent'
                  }`}
                >
                  <Sparkles className={`w-4 h-4 ${showHighlyUniqueOnly ? 'text-indigo-600' : 'text-indigo-500'}`} />
                  <span>Highly Unique Observation</span>
                </button>
                {matrixMeta?.hasUploadedDocuments && MATRIX_INSIGHT_KEYS.some((cat) =>
                  displayMatrix?.[cat]?.some((item) => item.isFromDocument)
                ) && (
                  <div className="flex items-center gap-2 text-sm text-zinc-600">
                    <FileText className="w-4 h-4 text-emerald-500" />
                    <span>Sourced from uploaded document</span>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    data-testid="insight-deep-dives-button"
                    aria-pressed={activeResultsTab === 'insights'}
                    onMouseEnter={() => setIsInsightDeepDivesButtonHovered(true)}
                    onMouseLeave={() => setIsInsightDeepDivesButtonHovered(false)}
                    onFocus={() => setIsInsightDeepDivesButtonHovered(true)}
                    onBlur={() => setIsInsightDeepDivesButtonHovered(false)}
                    onClick={() => {
                      void handleRefreshAllDeepDives();
                    }}
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors ${
                      activeResultsTab === 'insights'
                        ? 'text-zinc-900'
                        : 'text-zinc-600 hover:text-zinc-800'
                    }`}
                  >
                    {isInsightDeepDivesButtonHovered || isGeneratingDeepDives ? (
                      <RefreshCw
                        data-testid="insight-deep-dives-icon-refresh"
                        className={`w-4 h-4 ${isGeneratingDeepDives ? 'animate-spin' : ''} ${activeResultsTab === 'insights' ? 'text-zinc-700' : 'text-zinc-400'}`}
                      />
                    ) : (
                      <Target
                        data-testid="insight-deep-dives-icon-target"
                        className={`w-4 h-4 ${activeResultsTab === 'insights' ? 'text-zinc-700' : 'text-zinc-400'}`}
                      />
                    )}
                    <span>Insight Deep Dives</span>
                  </button>
                  <button
                    type="button"
                    data-testid="audience-segmentation-button"
                    aria-pressed={activeResultsTab === 'segmentation'}
                    onClick={openSegmentationTab}
                    disabled={!matrix}
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      activeResultsTab === 'segmentation'
                        ? 'text-indigo-700'
                        : 'text-zinc-600 hover:text-indigo-700'
                    }`}
                  >
                    {isSegmentationLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-700" />
                    ) : (
                      <Users className={`w-4 h-4 ${activeResultsTab === 'segmentation' ? 'text-indigo-700' : 'text-zinc-500'}`} />
                    )}
                    <span>Segmentation</span>
                  </button>
                </div>
              </div>

              <div id="cultural-results-filters" className="mb-8 p-4 pb-14 bg-zinc-50 border border-zinc-200 rounded-2xl no-print relative">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div className="flex flex-col items-start gap-1">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-sm font-semibold text-zinc-900">Results Filters</h4>
                      <div
                        ref={resultsFiltersHeadingTooltipRef}
                        className="relative inline-flex items-center"
                        onMouseEnter={() => openResultsFiltersHeadingTooltip('hover')}
                        onMouseLeave={() => closeResultsFiltersHeadingTooltip('mouse-leave')}
                      >
                        <button
                          type="button"
                          data-testid="results-filters-heading-tooltip-trigger"
                          onClick={() =>
                            isResultsFiltersHeadingTooltipOpen
                              ? closeResultsFiltersHeadingTooltip('click-toggle-close')
                              : openResultsFiltersHeadingTooltip('click-toggle-open')
                          }
                          onFocus={() => openResultsFiltersHeadingTooltip('focus')}
                          onBlur={(event) => {
                            const nextFocusedTarget = event.relatedTarget as Node | null;
                            if (!nextFocusedTarget || !resultsFiltersHeadingTooltipRef.current?.contains(nextFocusedTarget)) {
                              closeResultsFiltersHeadingTooltip('blur');
                            }
                          }}
                          className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-zinc-300 text-[10px] font-semibold leading-none text-zinc-500 hover:text-zinc-700 hover:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                          aria-label="Results Filters quick definition"
                          aria-expanded={isResultsFiltersHeadingTooltipOpen}
                          aria-describedby={isResultsFiltersHeadingTooltipOpen ? 'results-filters-heading-tooltip' : undefined}
                        >
                          ?
                        </button>
                        {isResultsFiltersHeadingTooltipOpen && (
                          <div
                            id="results-filters-heading-tooltip"
                            role="tooltip"
                            data-testid="results-filters-heading-tooltip"
                            className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-72 -translate-x-1/2 rounded-xl bg-black px-3 py-2 text-[11px] leading-relaxed text-white shadow-lg"
                          >
                            {RESULTS_FILTERS_EXPLAINER_COPY}
                            <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedConfidenceFilters([]);
                        setSelectedEvidenceFilters([]);
                        setSelectedTrendStageFilters([]);
                        setSelectedSourceFilters([]);
                        setShowHighlyUniqueOnly(false);
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
                        <span
                          data-testid="results-filter-confidence-tooltip-trigger"
                          aria-hidden="true"
                          className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-zinc-300 text-[9px] font-semibold leading-none text-zinc-500 cursor-default"
                        >
                          ?
                        </span>
                        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-xl bg-black px-3 py-2 text-[11px] leading-relaxed text-white shadow-lg opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-50">
                          How strong &amp; reliable the evidence is for this observation. High = well-corroborated by recent sources. Low = weak or emerging signal.
                          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black" />
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
                        <span
                          data-testid="results-filter-evidence-tooltip-trigger"
                          aria-hidden="true"
                          className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-zinc-300 text-[9px] font-semibold leading-none text-zinc-500 cursor-default"
                        >
                          ?
                        </span>
                        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-xl bg-black px-3 py-2 text-[11px] leading-relaxed text-white shadow-lg opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-50">
                          How the observation is being gathered. Known = directly observed fact. Inferred = pattern drawn from signals or repeated behavior/language. Speculative = forward-looking or unverified hypothesis.
                          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black" />
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
                        <span
                          data-testid="results-filter-trend-stage-tooltip-trigger"
                          aria-hidden="true"
                          className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-zinc-300 text-[9px] font-semibold leading-none text-zinc-500 cursor-default"
                        >
                          ?
                        </span>
                        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-xl bg-black px-3 py-2 text-[11px] leading-relaxed text-white shadow-lg opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-50">
                          Where this observation sits on the trend lifecycle. Peaking = mainstream adoption. Emerging = early wave. Declining = fading or being replaced.
                          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black" />
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
                        <span
                          data-testid="results-filter-sources-tooltip-trigger"
                          aria-hidden="true"
                          className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-zinc-300 text-[9px] font-semibold leading-none text-zinc-500 cursor-default"
                        >
                          ?
                        </span>
                        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-xl bg-black px-3 py-2 text-[11px] leading-relaxed text-white shadow-lg opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-50">
                          Filter insights by source tags attached to each result, including uploaded document-derived observations when available.
                          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black" />
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
                {hasActiveResultFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      if (isSegmentationTabActive) {
                        void handleRerunSegmentation();
                        return;
                      }
                      void handleRerunAnalysis();
                    }}
                    disabled={isInsightsTabActive ? isLoading : isSegmentationLoading || !isSegmentationAuthorized}
                    data-testid={isSegmentationTabActive ? 'rerun-segmentation-button' : 'rerun-analysis-button'}
                    className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-700 hover:border-zinc-400 hover:text-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className={`w-3 h-3 ${(isInsightsTabActive ? isLoading : isSegmentationLoading) ? 'animate-spin' : ''}`} />
                    {isSegmentationTabActive ? 'Rerun Segmentation' : 'Rerun Analysis'}
                  </button>
                )}
              </div>

              {isInsightsTabActive ? (
                <>
                  {!hasVisibleInsights && (
                    <div className="mb-8 p-5 rounded-2xl border border-zinc-200 bg-white text-sm text-zinc-600 no-print">
                      No insights match the selected filters. Adjust or clear filters to repopulate results.
                    </div>
                  )}

                  <div
                    data-testid="matrix-cards-layout"
                    className="grid grid-cols-1 gap-6 justify-center sm:grid-cols-[repeat(auto-fit,minmax(19rem,19rem))]"
                  >
                    <MatrixCard title="Moments" sectionKey="moments" sectionAnchorId="cultural-result-section-moments" subtext="External forces shaping their behavior" items={displayMatrix?.moments || []} delay={0.1} highlightedInsights={highlightedInsights} onDeepDive={handleDeepDive} showDocumentInsights={Boolean(matrixMeta?.hasUploadedDocuments)} showRefresh={(displayMatrix?.moments || []).length === 0 || (displayMatrix?.moments || []).every((item) => isMatrixItemMissing(item))} isRefreshing={isLoading} onRefresh={() => { void handleRefreshCulturalSection('moments', 'Moments'); }} />
                    <MatrixCard title="Beliefs" sectionKey="beliefs" sectionAnchorId="cultural-result-section-beliefs" subtext="Values they’re operating from" items={displayMatrix?.beliefs || []} delay={0.2} highlightedInsights={highlightedInsights} onDeepDive={handleDeepDive} showDocumentInsights={Boolean(matrixMeta?.hasUploadedDocuments)} showRefresh={(displayMatrix?.beliefs || []).length === 0 || (displayMatrix?.beliefs || []).every((item) => isMatrixItemMissing(item))} isRefreshing={isLoading} onRefresh={() => { void handleRefreshCulturalSection('beliefs', 'Beliefs'); }} />
                    <MatrixCard title="Behaviors" sectionKey="behaviors" sectionAnchorId="cultural-result-section-behaviors" subtext="How they act/interact" items={displayMatrix?.behaviors || []} delay={0.3} highlightedInsights={highlightedInsights} onDeepDive={handleDeepDive} showDocumentInsights={Boolean(matrixMeta?.hasUploadedDocuments)} showRefresh={(displayMatrix?.behaviors || []).length === 0 || (displayMatrix?.behaviors || []).every((item) => isMatrixItemMissing(item))} isRefreshing={isLoading} onRefresh={() => { void handleRefreshCulturalSection('behaviors', 'Behaviors'); }} />
                    <MatrixCard title="Contradictions" sectionKey="contradictions" sectionAnchorId="cultural-result-section-contradictions" subtext="Emerging tensions or shift in values or behavior" items={displayMatrix?.contradictions || []} delay={0.4} highlightedInsights={highlightedInsights} onDeepDive={handleDeepDive} showDocumentInsights={Boolean(matrixMeta?.hasUploadedDocuments)} showRefresh={(displayMatrix?.contradictions || []).length === 0 || (displayMatrix?.contradictions || []).every((item) => isMatrixItemMissing(item))} isRefreshing={isLoading} onRefresh={() => { void handleRefreshCulturalSection('contradictions', 'Contradictions'); }} />
                    <MatrixCard title="Tone" sectionKey="tone" sectionAnchorId="cultural-result-section-tone" subtext="What & how they feel" items={displayMatrix?.tone || []} delay={0.5} highlightedInsights={highlightedInsights} onDeepDive={handleDeepDive} showDocumentInsights={Boolean(matrixMeta?.hasUploadedDocuments)} showRefresh={(displayMatrix?.tone || []).length === 0 || (displayMatrix?.tone || []).every((item) => isMatrixItemMissing(item))} isRefreshing={isLoading} onRefresh={() => { void handleRefreshCulturalSection('tone', 'Tone'); }} />
                    <MatrixCard title="Language" sectionKey="language" sectionAnchorId="cultural-result-section-language" subtext="How they communicate" items={displayMatrix?.language || []} delay={0.6} highlightedInsights={highlightedInsights} onDeepDive={handleDeepDive} onOpenVocabularyExtractor={() => setIsVocabularyOpen(true)} showDocumentInsights={Boolean(matrixMeta?.hasUploadedDocuments)} showRefresh={(displayMatrix?.language || []).length === 0 || (displayMatrix?.language || []).every((item) => isMatrixItemMissing(item))} isRefreshing={isLoading} onRefresh={() => { void handleRefreshCulturalSection('language', 'Language'); }} />
                    <MatrixCard title="Community" sectionKey="community" sectionAnchorId="cultural-result-section-community" subtext="Who people look to for identity & belonging" items={displayMatrix?.community || []} delay={0.7} highlightedInsights={highlightedInsights} onDeepDive={handleDeepDive} showDocumentInsights={Boolean(matrixMeta?.hasUploadedDocuments)} showRefresh={(displayMatrix?.community || []).length === 0 || (displayMatrix?.community || []).every((item) => isMatrixItemMissing(item))} isRefreshing={isLoading} onRefresh={() => { void handleRefreshCulturalSection('community', 'Community'); }} />
                    <MatrixCard title="Influencers" sectionKey="influencers" sectionAnchorId="cultural-result-section-influencers" subtext="People who are shaping their beliefs & behavior" items={displayMatrix?.influencers || []} delay={0.8} highlightedInsights={highlightedInsights} onDeepDive={handleDeepDive} showDocumentInsights={Boolean(matrixMeta?.hasUploadedDocuments)} showRefresh={(displayMatrix?.influencers || []).length === 0 || (displayMatrix?.influencers || []).every((item) => isMatrixItemMissing(item))} isRefreshing={isLoading} onRefresh={() => { void handleRefreshCulturalSection('influencers', 'Influencers'); }} />
                  </div>

                  {/* Sources Section */}
                  {matrix.sources && matrix.sources.length > 0 && (
                    <motion.div
                      id="cultural-results-sources"
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
                </>
              ) : (
                renderSegmentationTabContent()
              )}
              </motion.div>
            </SectionErrorBoundary>
          )}
        </AnimatePresence>

        {matrix && (
          <div className="w-full mt-14 mb-20 no-print">
            <RecentResultsLibrary<CulturalRecentResult>
              mode={APP_RECENT_RESULTS_MODES.CULTURAL_ARCHAEOLOGIST}
              title="Recent Projects"
              refreshNonce={recentResultsRefreshNonce}
              onSelectItem={(item) => {
                console.log('[CulturalArchaeologist] Recent result selected.', { id: item.id, title: item.title });
                if (item.savedMatrix) {
                  loadSavedMatrix(item.savedMatrix, true, String(item.id));
                  return;
                }
                applyRecentResultMatrixSelection(item, true);
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
                  resetSegmentationWorkspace('insights');
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
        {!showSplash && (
          <FeedbackChatWidget
            showAdminShortcut={activeExperience === null}
            adminHref="/#admin"
            onAdminNavigate={() => navigateToHashRoute('admin')}
          />
        )}
      </main>

      <AnimatePresence>
        {isAdminPasswordPopoutOpen && (
          <motion.div
            data-testid="admin-password-popout"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[95] bg-black/50 p-4 sm:p-6 flex items-center justify-center"
            onClick={(event) => {
              if (event.target !== event.currentTarget) return;
              closeAdminPasswordPopout();
            }}
          >
            <motion.div
              data-testid="admin-password-popout-dialog"
              initial={{ scale: 0.96, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 16 }}
              className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6 shadow-2xl relative"
            >
              <button
                type="button"
                data-testid="admin-password-popout-close-button"
                onClick={closeAdminPasswordPopout}
                className="absolute top-4 right-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-500/40"
                aria-label="Close admin password popout"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="mb-4 pr-8">
                <h3 className="text-lg font-semibold text-zinc-900">Admin Access</h3>
                <p className="mt-1 text-sm text-zinc-500">
                  Enter the password to open the admin console.
                </p>
              </div>

              <form onSubmit={handleAdminPasswordSubmit} className="space-y-4">
                <div>
                  <label htmlFor="admin-password-popout-input" className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Password
                  </label>
                  <input
                    id="admin-password-popout-input"
                    data-testid="admin-password-popout-input"
                    type="password"
                    value={adminPasswordInput}
                    onChange={(event) => {
                      console.log('[CulturalArchaeologist] Admin password input changed.', {
                        passwordLength: event.target.value.length,
                      });
                      setAdminPasswordInput(event.target.value);
                      if (adminPasswordError) {
                        setAdminPasswordError(null);
                      }
                    }}
                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-300"
                    placeholder="Enter admin password"
                    autoFocus
                  />
                </div>

                {adminPasswordError && (
                  <p data-testid="admin-password-popout-error" className="text-sm text-rose-600">
                    {adminPasswordError}
                  </p>
                )}

                <p className="text-xs text-zinc-500">{ADMIN_PASSWORD_SUPPORT_COPY}</p>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    data-testid="admin-password-popout-cancel-button"
                    onClick={closeAdminPasswordPopout}
                    className="inline-flex items-center rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    data-testid="admin-password-popout-submit-button"
                    className="inline-flex items-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                  >
                    Unlock Admin
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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

function MatrixCard({
  title,
  sectionKey,
  sectionAnchorId,
  subtext,
  items,
  delay,
  highlightedInsights = [],
  onDeepDive,
  onOpenVocabularyExtractor,
  showDocumentInsights = false,
  showRefresh = false,
  isRefreshing = false,
  onRefresh,
}: {
  title: string;
  sectionKey: MatrixInsightKey;
  sectionAnchorId?: string;
  subtext: string;
  items: MatrixItem[];
  delay: number;
  highlightedInsights?: string[];
  onDeepDive?: (item: MatrixItem, category: string) => void;
  onOpenVocabularyExtractor?: () => void;
  showDocumentInsights?: boolean;
  showRefresh?: boolean;
  isRefreshing?: boolean;
  onRefresh?: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const INITIAL_SHOW = 3;
  const cardTestId = `matrix-card-${title.toLowerCase().replace(/\s+/g, '-')}`;

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

  const renderInsightText = (text: string) => {
    if (title === 'Contradictions') {
      const normalized = text
        .replace(/\s+(What they do:)/gi, '\n\n$1')
        .replace(/\s+(Tension:)/gi, '\n\n$1');

      const paragraphs = normalized
        .split(/\n{2,}/)
        .map((segment) => segment.trim())
        .filter(Boolean);

      if (paragraphs.length > 1) {
        return paragraphs.map((paragraph, idx) => (
          <React.Fragment key={`contradiction-line-${idx}`}>
            {(() => {
              const labelMatch = paragraph.match(/^(What they say:|What they do:|Tension:)\s*/i);
              if (!labelMatch) return paragraph;
              const label = labelMatch[1];
              const body = paragraph.slice(labelMatch[0].length).trimStart();
              return (
                <>
                  <strong>{label}</strong>
                  {body ? ` ${body}` : ''}
                </>
              );
            })()}
            {idx < paragraphs.length - 1 ? (
              <>
                <br />
                <br />
              </>
            ) : null}
          </React.Fragment>
        ));
      }
    }

    if (title !== 'Tone') return text;

    const match = text.match(/archetype spectrum:\s*/i);
    if (!match || typeof match.index !== 'number') return text;

    const prefix = text.slice(0, match.index).trimEnd();
    const label = text.slice(match.index, match.index + match[0].length);
    const suffix = text.slice(match.index + match[0].length).trimStart();

    return [
      prefix,
      <br key="tone-archetype-break-1" />,
      <br key="tone-archetype-break-2" />,
      <strong key="tone-archetype-label">{label}</strong>,
      suffix ? ` ${suffix}` : '',
    ];
  };
  
  const safeItems = items || [];
  const hasItems = safeItems.length > 0;
  const visibleItems = isExpanded ? safeItems : safeItems.slice(0, INITIAL_SHOW);
  const hasMoreItems = safeItems.length > INITIAL_SHOW;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      data-testid={cardTestId}
      id={sectionAnchorId}
      className="inline-block w-full mb-6 bg-white p-6 rounded-3xl border border-zinc-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-shadow duration-300 break-inside-avoid print-break-inside-avoid"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2">
          <h3 className="text-sm font-semibold text-zinc-900 uppercase tracking-wider">{title}</h3>
          {showRefresh && onRefresh ? (
            <button
              type="button"
              data-testid={`matrix-card-refresh-${sectionKey}`}
              onClick={onRefresh}
              className="relative z-10 pointer-events-auto inline-flex items-center justify-center p-1.5 text-zinc-400 hover:text-zinc-600 cursor-pointer focus:outline-none"
              title={`Refresh ${title}`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          ) : null}
        </div>
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
      {hasItems ? (
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
                  <span className={`flex-1 pr-8 ${title === 'Contradictions' ? 'whitespace-pre-line' : ''}`}>
                    {renderInsightText(cleanText)}
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
                    {item.sourceType && !shouldHideSourceTypeChip(item.sourceType) && (
                      <span className="inline-block ml-2 px-1.5 py-0.5 bg-zinc-100 text-zinc-500 text-[10px] uppercase tracking-wider font-semibold rounded border border-zinc-200 align-middle">
                        {item.sourceType}
                      </span>
                    )}
                  </span>
                  {onDeepDive && (
                    <button
                      onClick={() => onDeepDive(item, title)}
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
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-5 text-sm text-zinc-500">
          No results for this insight category yet.
        </div>
      )}
      
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
