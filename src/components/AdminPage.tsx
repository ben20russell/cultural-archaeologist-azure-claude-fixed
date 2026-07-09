import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, Database, ExternalLink, FileText, Info, Loader2, Presentation, RefreshCw, Search, Shield, WandSparkles } from 'lucide-react';
import { motion } from 'motion/react';
import type { BrandDeepDiveReport, BrandResearchMatrix, CulturalMatrix, DeepDiveReport, MatrixItem, Source } from '../services/azure-openai';
import { supabase } from '../services/supabase-client';
import { SectionErrorBoundary } from './SectionErrorBoundary';
import { SourceLinkRow } from './SourceLinkRow';
import { toSafeExternalHref } from '../services/external-links';
import { normalizeAppError } from '../services/api-errors';
import { buildExportFileBase } from '../services/export-filenames';
import {
  type BrandAtlasExportDocument,
  exportBrandAtlasDocumentToPdf,
  exportBrandAtlasDocumentToPptx,
} from '../services/brand-atlas-themed-export';

type AdminMode = 'cultural' | 'brand' | 'design';

type AdminProject = {
  id: string;
  label: string;
  subtitle: string;
  createdAt: string;
  tableName: string;
  row: Record<string, unknown>;
};

type AdminModeConfig = {
  id: AdminMode;
  label: string;
  description: string;
  tableCandidates: string[];
  orderColumns: string[];
};

const MAX_PROJECTS = 200;

const MODE_CONFIGS: Record<AdminMode, AdminModeConfig> = {
  cultural: {
    id: 'cultural',
    label: 'Cultural Archaeologist',
    description: 'Load a cultural matrix row and recreate the report cards.',
    tableCandidates: ['Cultural_Archaeologist', 'CulturalArchaeologist', 'culturalarchaeologist', 'searches'],
    orderColumns: ['createdAt', 'created_at'],
  },
  brand: {
    id: 'brand',
    label: 'Brand Navigator',
    description: 'Load a brand navigator row and rebuild the brand comparison report.',
    tableCandidates: ['Brand_Navigator', 'brand_navigator', 'BrandNavigator', 'brandnavigator'],
    orderColumns: ['created_at', 'createdAt'],
  },
  design: {
    id: 'design',
    label: 'Design Excavator',
    description: 'Load a design excavator row and rebuild visual identity results.',
    tableCandidates: ['brandexcavator', 'BrandExcavator', 'Design_Excavator', 'brand_deep_dives'],
    orderColumns: ['created_at', 'createdAt'],
  },
};

type CulturalSectionKey =
  | 'moments'
  | 'beliefs'
  | 'behaviors'
  | 'contradictions'
  | 'tone'
  | 'language'
  | 'community'
  | 'influencers';

const CULTURAL_SECTIONS: Array<{ key: CulturalSectionKey; label: string }> = [
  { key: 'moments', label: 'Moments' },
  { key: 'beliefs', label: 'Beliefs' },
  { key: 'behaviors', label: 'Behaviors' },
  { key: 'contradictions', label: 'Contradictions' },
  { key: 'tone', label: 'Tone' },
  { key: 'language', label: 'Language' },
  { key: 'community', label: 'Community' },
  { key: 'influencers', label: 'Influencers' },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const parseJsonValue = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const toRecordValue = (value: unknown): Record<string, unknown> | null => {
  const parsed = parseJsonValue(value);
  return isRecord(parsed) ? parsed : null;
};

const toStringValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
};

const toStringList = (value: unknown): string[] => {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (typeof item === 'number' || typeof item === 'boolean') return String(item);
      if (isRecord(item)) {
        return toStringValue(item.text || item.title || item.headline || item.name).trim();
      }
      return '';
    })
    .filter(Boolean);
};

const toSourceList = (value: unknown): Source[] => {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => {
      const sourceRecord = toRecordValue(item);
      if (!sourceRecord) return null;
      const title = toStringValue(sourceRecord.title || sourceRecord.headline).trim();
      const url = toStringValue(sourceRecord.url).trim();
      if (!title && !url) return null;
      return {
        title: title || 'Source',
        url,
      };
    })
    .filter((item): item is Source => Boolean(item));
};

const normalizeDeepDiveReport = (value: unknown): DeepDiveReport | undefined => {
  const deepDiveRecord = toRecordValue(value);
  if (!deepDiveRecord) return undefined;

  const originationDate = toStringValue(deepDiveRecord.originationDate || deepDiveRecord.origination_date).trim();
  const relevance = toStringValue(deepDiveRecord.relevance).trim();
  const expandedContext = toStringValue(deepDiveRecord.expandedContext || deepDiveRecord.expanded_context).trim();
  const strategicImplications = toStringList(deepDiveRecord.strategicImplications || deepDiveRecord.strategic_implications);
  const realWorldExamples = toStringList(deepDiveRecord.realWorldExamples || deepDiveRecord.real_world_examples);
  const sources = toSourceList(deepDiveRecord.sources);

  if (!originationDate && !relevance && !expandedContext && strategicImplications.length === 0 && realWorldExamples.length === 0 && sources.length === 0) {
    return undefined;
  }

  return {
    originationDate: originationDate || 'Unknown date',
    relevance,
    expandedContext,
    strategicImplications,
    realWorldExamples,
    sources,
  };
};

const toConfidenceLevel = (value: unknown): MatrixItem['confidenceLevel'] | undefined => {
  const normalized = toStringValue(value).toLowerCase().trim();
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high') {
    return normalized;
  }
  return undefined;
};

const toTrendLifecycle = (value: unknown): MatrixItem['trendLifecycle'] | undefined => {
  const normalized = toStringValue(value).toLowerCase().trim();
  if (normalized === 'emerging' || normalized === 'peaking' || normalized === 'declining') {
    return normalized;
  }
  return undefined;
};

const normalizeMatrixItems = (value: unknown): MatrixItem[] => {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item) => {
      const itemRecord = toRecordValue(item);
      if (!itemRecord) return null;

      const deepDive = normalizeDeepDiveReport(itemRecord.deepDive || itemRecord.deep_dive);
      const text = toStringValue(itemRecord.text).trim();
      const sourceType = toStringValue(itemRecord.sourceType || itemRecord.source_type).trim();
      const backgroundWriteup = toStringValue(itemRecord.backgroundWriteup || itemRecord.background_writeup).trim();

      if (!text && !deepDive && !backgroundWriteup) {
        return null;
      }

      return {
        text: text || 'N/A',
        isHighlyUnique: Boolean(itemRecord.isHighlyUnique || itemRecord.is_highly_unique),
        isFromDocument: typeof itemRecord.isFromDocument === 'boolean'
          ? itemRecord.isFromDocument
          : (typeof itemRecord.is_from_document === 'boolean' ? itemRecord.is_from_document : undefined),
        sourceType: sourceType || undefined,
        confidenceLevel: toConfidenceLevel(itemRecord.confidenceLevel || itemRecord.confidence_level),
        trendLifecycle: toTrendLifecycle(itemRecord.trendLifecycle || itemRecord.trend_lifecycle),
        deepDive,
        backgroundWriteup: backgroundWriteup || undefined,
      } as MatrixItem;
    })
    .filter((item): item is MatrixItem => Boolean(item));
};

const toDateLabel = (value: unknown): string => {
  const raw = toStringValue(value);
  if (!raw) return 'Unknown date';

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleString();
};

const normalizeNewsItems = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (isRecord(item)) {
        const headline = toStringValue(item.headline || item.title).trim();
        const outlet = toStringValue(item.outlet).trim();
        return [headline, outlet ? `(${outlet})` : ''].filter(Boolean).join(' ');
      }
      return '';
    })
    .filter(Boolean);
};

type EvidenceTagLabel = 'known' | 'inferred' | 'speculative' | 'analogy';

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

const renderEvidenceChips = (labels: EvidenceTagLabel[], keyPrefix: string): React.ReactNode => {
  return labels.map((label, index) => (
    <span
      key={`${keyPrefix}-${label}-${index}`}
      data-testid={`admin-evidence-chip-${label}`}
      className={`inline-block ml-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded align-middle ${evidenceLabelChipClass(label)}`}
    >
      {label.toUpperCase()}
    </span>
  ));
};

const renderEvidenceInlineText = (value?: string | null, keyPrefix = 'inline'): React.ReactNode => {
  const parsed = extractEvidenceTags(value || '');
  const displayValue = parsed.cleanText || 'N/A';
  return (
    <>
      {displayValue}
      {renderEvidenceChips(parsed.labels, keyPrefix)}
    </>
  );
};

const cleanEvidenceText = (value?: string | null): string => {
  const parsed = extractEvidenceTags(value || '');
  return (parsed.cleanText || value || '').trim();
};

const hasCulturalPayloadSignals = (value: Record<string, unknown>): boolean => {
  const hasSections = CULTURAL_SECTIONS.some((section) => Array.isArray(parseJsonValue(value[section.key])));
  if (hasSections) return true;
  if (Boolean(toStringValue(value.sociological_analysis || value.sociologicalAnalysis).trim())) return true;
  if (toRecordValue(value.demographics)) return true;
  if (Array.isArray(parseJsonValue(value.sources))) return true;
  return false;
};

const normalizeCulturalMatrix = (row: Record<string, unknown>): CulturalMatrix | null => {
  const matrixCandidate = (() => {
    const matrixRecord = toRecordValue(row.matrix);
    const matrixNestedResults = matrixRecord ? toRecordValue(matrixRecord.results) : null;
    if (matrixNestedResults && hasCulturalPayloadSignals(matrixNestedResults)) return matrixNestedResults;
    if (matrixRecord && hasCulturalPayloadSignals(matrixRecord)) return matrixRecord;

    const resultsRecord = toRecordValue(row.results);
    const resultsNestedMatrix = resultsRecord ? toRecordValue(resultsRecord.matrix) : null;
    if (resultsNestedMatrix && hasCulturalPayloadSignals(resultsNestedMatrix)) return resultsNestedMatrix;
    if (resultsRecord && hasCulturalPayloadSignals(resultsRecord)) return resultsRecord;

    return hasCulturalPayloadSignals(row) ? row : null;
  })();

  if (!isRecord(matrixCandidate)) return null;

  const demographicsSource = toRecordValue(matrixCandidate.demographics) || {};
  const matrix: CulturalMatrix = {
    demographics: {
      age: toStringValue(demographicsSource.age) || null,
      race: toStringValue(demographicsSource.race) || null,
      gender: toStringValue(demographicsSource.gender) || null,
    },
    sociological_analysis: toStringValue(matrixCandidate.sociological_analysis || matrixCandidate.sociologicalAnalysis),
    moments: normalizeMatrixItems(matrixCandidate.moments),
    beliefs: normalizeMatrixItems(matrixCandidate.beliefs),
    tone: normalizeMatrixItems(matrixCandidate.tone),
    language: normalizeMatrixItems(matrixCandidate.language),
    behaviors: normalizeMatrixItems(matrixCandidate.behaviors),
    contradictions: normalizeMatrixItems(matrixCandidate.contradictions),
    community: normalizeMatrixItems(matrixCandidate.community),
    influencers: normalizeMatrixItems(matrixCandidate.influencers),
    sources: toSourceList(matrixCandidate.sources),
  };

  const hasAnyContent = CULTURAL_SECTIONS.some((section) => (matrix[section.key] as unknown[]).length > 0)
    || Boolean(matrix.sociological_analysis)
    || matrix.sources.length > 0;

  if (!hasAnyContent) {
    return null;
  }

  return matrix;
};

const normalizeBrandMatrix = (row: Record<string, unknown>): BrandResearchMatrix | null => {
  const matrixCandidate = (isRecord(row.matrix) ? row.matrix : null)
    || (isRecord(row.results) ? row.results : null)
    || row;

  if (!isRecord(matrixCandidate)) return null;

  const results = Array.isArray(matrixCandidate.results) ? matrixCandidate.results : [];
  const normalizedResults = results
    .map((result) => {
      if (!isRecord(result)) return null;
      const positioning = isRecord(result.brandPositioning) ? result.brandPositioning : {};
      return {
        brandName: toStringValue(result.brandName || result.brand || result.name),
        highLevelSummary: toStringValue(result.highLevelSummary),
        brandMission: toStringValue(result.brandMission),
        brandPositioning: {
          taglines: toStringList(positioning.taglines),
          keyMessagesAndClaims: toStringList(positioning.keyMessagesAndClaims),
          valueProposition: toStringValue(positioning.valueProposition),
          voiceAndTone: toStringValue(positioning.voiceAndTone),
        },
        keyOfferingsProductsServices: toStringList(result.keyOfferingsProductsServices),
        strategicMoatsStrengths: toStringList(result.strategicMoatsStrengths),
        potentialThreatsWeaknesses: toStringList(result.potentialThreatsWeaknesses),
        targetAudiences: Array.isArray(result.targetAudiences)
          ? result.targetAudiences
              .map((audience) => {
                if (!isRecord(audience)) return null;
                return {
                  audience: toStringValue(audience.audience),
                  priority: toStringValue(audience.priority),
                  inferredRoleToConsumers: toStringValue(audience.inferredRoleToConsumers),
                  functionalBenefits: toStringList(audience.functionalBenefits),
                  emotionalBenefits: toStringList(audience.emotionalBenefits),
                };
              })
              .filter(Boolean)
          : [],
        recentCampaigns: toStringList(result.recentCampaigns),
        keyMarketingChannels: toStringList(result.keyMarketingChannels),
        socialMediaChannels: Array.isArray(result.socialMediaChannels)
          ? result.socialMediaChannels
              .map((channel) => {
                if (!isRecord(channel)) return null;
                const url = toStringValue(channel.url);
                return {
                  channel: toStringValue(channel.channel) || 'Social',
                  url,
                };
              })
              .filter((channel): channel is { channel: string; url: string } => Boolean(channel))
          : [],
        recentNews: normalizeNewsItems(result.recentNews),
        sources: toSourceList(result.sources),
      };
    })
    .filter(Boolean);

  if (!normalizedResults.length) {
    return null;
  }

  return {
    analysisObjective: toStringValue(matrixCandidate.analysisObjective),
    ecosystemMethod: toStringValue(matrixCandidate.ecosystemMethod),
    results: normalizedResults,
    sources: toSourceList(matrixCandidate.sources),
  };
};

const normalizeDesignReport = (row: Record<string, unknown>): BrandDeepDiveReport | null => {
  const reportCandidate = (isRecord(row.report) ? row.report : null)
    || (isRecord(row.matrix) ? row.matrix : null)
    || (isRecord(row.results) ? row.results : null)
    || row;

  if (!isRecord(reportCandidate)) return null;

  const profiles = Array.isArray(reportCandidate.brandProfiles) ? reportCandidate.brandProfiles : [];
  const normalizedProfiles = profiles
    .map((profile) => {
      if (!isRecord(profile)) return null;
      const logo = isRecord(profile.logo) ? profile.logo : {};
      const colorPalette = isRecord(profile.colorPalette) ? profile.colorPalette : {};
      const typography = isRecord(profile.typography) ? profile.typography : {};
      const hierarchy = isRecord(typography.hierarchy) ? typography.hierarchy : {};
      const supporting = isRecord(profile.supportingVisualElements) ? profile.supportingVisualElements : {};
      return {
        brandName: toStringValue(profile.brandName || profile.brand || profile.name),
        website: toStringValue(profile.website),
        sampleVisuals: Array.isArray(profile.sampleVisuals)
          ? profile.sampleVisuals
              .map((visual) => {
                if (!isRecord(visual)) return null;
                const title = toStringValue(visual.title || visual.label);
                const url = toStringValue(visual.url);
                if (!title && !url) return null;
                return { title: title || 'Visual', url };
              })
              .filter((visual): visual is { title: string; url: string } => Boolean(visual))
          : [],
        logo: {
          mainLogo: toStringValue(logo.mainLogo),
          logoVariations: toStringList(logo.logoVariations),
          wordmarkLogotype: toStringValue(logo.wordmarkLogotype),
          symbolsIcons: toStringList(logo.symbolsIcons),
        },
        colorPalette: {
          primaryColors: Array.isArray(colorPalette.primaryColors) ? colorPalette.primaryColors as BrandDeepDiveReport['brandProfiles'][number]['colorPalette']['primaryColors'] : [],
          secondaryAccentColors: Array.isArray(colorPalette.secondaryAccentColors)
            ? colorPalette.secondaryAccentColors as BrandDeepDiveReport['brandProfiles'][number]['colorPalette']['secondaryAccentColors']
            : [],
          neutrals: Array.isArray(colorPalette.neutrals) ? colorPalette.neutrals as BrandDeepDiveReport['brandProfiles'][number]['colorPalette']['neutrals'] : [],
        },
        typography: {
          fontFamilies: toStringList(typography.fontFamilies),
          hierarchy: {
            h1: toStringValue(hierarchy.h1),
            h2: toStringValue(hierarchy.h2),
            body: toStringValue(hierarchy.body),
          },
          usageRules: toStringList(typography.usageRules),
        },
        supportingVisualElements: {
          imageryStyle: toStringList(supporting.imageryStyle),
          icons: toStringList(supporting.icons),
          patternsTextures: toStringList(supporting.patternsTextures),
          shapes: toStringList(supporting.shapes),
          dataVisualization: toStringList(supporting.dataVisualization),
        },
        consistencyAssessment: toStringValue(profile.consistencyAssessment),
        distinctivenessAssessment: toStringValue(profile.distinctivenessAssessment),
        sources: toSourceList(profile.sources),
      };
    })
    .filter(Boolean);

  if (!normalizedProfiles.length) {
    return null;
  }

  return {
    analysisObjective: toStringValue(reportCandidate.analysisObjective),
    ecosystemMethod: toStringValue(reportCandidate.ecosystemMethod),
    brandProfiles: normalizedProfiles,
    crossBrandReadout: toStringList(reportCandidate.crossBrandReadout),
    strategicRecommendations: toStringList(reportCandidate.strategicRecommendations),
    sources: toSourceList(reportCandidate.sources),
  };
};

const resolveProjectLabel = (mode: AdminMode, row: Record<string, unknown>): string => {
  const customName = toStringValue(row.custom_name || row.customName).trim();
  if (customName) return customName;

  if (mode === 'cultural') {
    const audience = toStringValue(row.audience).trim();
    const brand = toStringValue(row.brand).trim();
    return [brand, audience ? `Audience: ${audience}` : ''].filter(Boolean).join(' • ') || 'Untitled Cultural Report';
  }

  if (mode === 'brand') {
    const matrix = normalizeBrandMatrix(row);
    const names = (matrix?.results || []).map((result) => result.brandName).filter(Boolean);
    return names.join(' vs ') || toStringValue(row.brand).trim() || 'Untitled Brand Report';
  }

  const report = normalizeDesignReport(row);
  const names = (report?.brandProfiles || []).map((profile) => profile.brandName).filter(Boolean);
  return names.join(' vs ') || 'Untitled Design Report';
};

const resolveProjectSubtitle = (mode: AdminMode, row: Record<string, unknown>): string => {
  if (mode === 'cultural') {
    return toStringValue(row.audience).trim() || 'Cultural report';
  }
  if (mode === 'brand') {
    return toStringValue(row.analysisObjective).trim() || 'Brand Navigator report';
  }
  return toStringValue(row.analysis_objective || row.analysisObjective).trim() || 'Design Excavator report';
};

const renderSimpleList = (items: string[], emptyLabel = 'No data available yet.', keyPrefix = 'list') => {
  if (!items.length) {
    return <p className="text-sm text-zinc-500">{emptyLabel}</p>;
  }

  return (
    <ul className="list-disc pl-5 space-y-1 text-sm text-zinc-700">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="leading-relaxed">
          {renderEvidenceInlineText(item, `${keyPrefix}-${index}`)}
        </li>
      ))}
    </ul>
  );
};

const renderCulturalMatrixItems = (items: MatrixItem[], keyPrefix: string) => {
  if (!items.length) {
    return <p className="text-sm text-zinc-500">No insights in this section yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {items.map((item, index) => {
        const parsed = extractEvidenceTags(item.text || '');
        const displayValue = parsed.cleanText || 'N/A';
        const confidence = (item.confidenceLevel || '').trim();
        const sourceType = (item.sourceType || '').trim();
        const trendLifecycle = (item.trendLifecycle || '').trim();

        return (
          <li key={`${keyPrefix}-${index}`} className="rounded-xl border border-zinc-200 bg-white p-3 shadow-[0_1px_4px_-3px_rgba(0,0,0,0.15)]">
            <p className="text-sm text-zinc-700 leading-relaxed">
              {displayValue}
              {renderEvidenceChips(parsed.labels, `${keyPrefix}-evidence-${index}`)}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {confidence && (
                <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                  Confidence: {confidence}
                </span>
              )}
              {trendLifecycle && (
                <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
                  Trend: {trendLifecycle}
                </span>
              )}
              {sourceType && (
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                  Source: {sourceType}
                </span>
              )}
              {item.isHighlyUnique && (
                <span className="inline-flex items-center rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fuchsia-700">
                  Highly Unique
                </span>
              )}
            </div>

            {(item.deepDive || item.backgroundWriteup) && (
              <details
                className="group mt-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3"
                data-testid={`admin-cultural-deep-dive-collapsible-${keyPrefix}-${index}`}
                onToggle={(event) => {
                  const nextOpen = event.currentTarget.open;
                  console.log('[AdminPage] Toggling cultural insight deep dive.', {
                    keyPrefix,
                    index,
                    nextOpen,
                  });
                }}
              >
                <summary
                  data-testid={`admin-cultural-deep-dive-toggle-${keyPrefix}-${index}`}
                  className="flex cursor-pointer list-none items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-wider text-indigo-700 [&::-webkit-details-marker]:hidden"
                >
                  <span>Insight Deep Dive</span>
                  <ChevronDown className="h-3.5 w-3.5 text-indigo-500 transition-transform duration-200 ease-out group-open:rotate-180" />
                </summary>

                <div className="mt-3">
                  {item.deepDive?.originationDate && (
                    <p className="mt-1 text-xs text-zinc-600">
                      <span className="font-medium">Originated:</span> {item.deepDive.originationDate}
                    </p>
                  )}

                  {item.deepDive?.relevance && (
                    <p className="mt-2 text-sm text-zinc-700 leading-relaxed">
                      <span className="font-medium">Relevance:</span> {renderEvidenceInlineText(item.deepDive.relevance, `${keyPrefix}-deep-relevance-${index}`)}
                    </p>
                  )}

                  {item.deepDive?.expandedContext && (
                    <div className="mt-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Expanded Context</p>
                      <p className="mt-1 text-sm text-zinc-700 leading-relaxed">
                        {renderEvidenceInlineText(item.deepDive.expandedContext, `${keyPrefix}-deep-context-${index}`)}
                      </p>
                    </div>
                  )}

                  {item.backgroundWriteup && (
                    <div className="mt-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Background Writeup</p>
                      <p className="mt-1 text-sm text-zinc-700 leading-relaxed">
                        {renderEvidenceInlineText(item.backgroundWriteup, `${keyPrefix}-deep-background-${index}`)}
                      </p>
                    </div>
                  )}

                  {(item.deepDive?.realWorldExamples || []).length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Real World Examples</p>
                      <div className="mt-1">
                        {renderSimpleList(
                          (item.deepDive?.realWorldExamples || []).map((example) => (typeof example === 'string' ? example : example.text)),
                          'No examples listed.',
                          `${keyPrefix}-deep-examples-${index}`
                        )}
                      </div>
                    </div>
                  )}

                  {(item.deepDive?.strategicImplications || []).length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Strategic Implications</p>
                      <div className="mt-1">{renderSimpleList(item.deepDive?.strategicImplications || [], 'No implications listed.', `${keyPrefix}-deep-implications-${index}`)}</div>
                    </div>
                  )}

                  {(item.deepDive?.sources || []).length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Sources</p>
                      <div className="mt-1">{renderSources(item.deepDive?.sources || [])}</div>
                    </div>
                  )}
                </div>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
};

const renderSources = (sources: Source[]) => {
  if (!sources.length) {
    return <p className="text-sm text-zinc-500">No sources attached to this row.</p>;
  }

  return (
    <ul className="space-y-2">
      {sources.map((source, index) => (
        <SourceLinkRow key={`${source.url}-${index}`} index={index} title={source.title} url={source.url} />
      ))}
    </ul>
  );
};

const renderSourcesSection = (sources: Source[], sectionId: string) => {
  return (
    <motion.div
      id={sectionId}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.15 }}
      className="mt-2 p-6 bg-zinc-50 rounded-3xl border border-zinc-200 print-break-inside-avoid"
    >
      <h3 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
        <Info className="w-5 h-5 text-zinc-400" />
        Sources & Research
      </h3>
      {renderSources(sources)}
    </motion.div>
  );
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

export default function AdminPage({ onBack }: { onBack?: () => void }) {
  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<AdminMode>('cultural');
  const [activeTableName, setActiveTableName] = useState<string>('');
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [projectSearchQuery, setProjectSearchQuery] = useState('');
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [isRowIdPanelOpen, setIsRowIdPanelOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<Record<string, unknown> | null>(null);
  const [rowIdInput, setRowIdInput] = useState('');
  const [jsonRowInput, setJsonRowInput] = useState('');
  const [isJsonPanelOpen, setIsJsonPanelOpen] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isLoadingRow, setIsLoadingRow] = useState(false);
  const [isExportingPptx, setIsExportingPptx] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportError, setExportError] = useState<{ type: 'pptx' | 'pdf'; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const projectsLoadRequestRef = useRef(0);

  const modeConfig = MODE_CONFIGS[mode];

  const preview = useMemo(() => {
    if (!selectedRow) {
      return null;
    }

    if (mode === 'cultural') {
      return {
        type: 'cultural' as const,
        data: normalizeCulturalMatrix(selectedRow),
      };
    }

    if (mode === 'brand') {
      return {
        type: 'brand' as const,
        data: normalizeBrandMatrix(selectedRow),
      };
    }

    return {
      type: 'design' as const,
      data: normalizeDesignReport(selectedRow),
    };
  }, [mode, selectedRow]);

  const filteredProjects = useMemo(() => {
    const normalizedQuery = projectSearchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return projects;
    }

    return projects.filter((project) => {
      const searchableText = `${project.label} ${project.subtitle} ${project.createdAt} ${project.id}`.toLowerCase();
      return searchableText.includes(normalizedQuery);
    });
  }, [projectSearchQuery, projects]);

  const loadProjects = useCallback(async () => {
    const requestId = projectsLoadRequestRef.current + 1;
    projectsLoadRequestRef.current = requestId;

    console.log('[AdminPage] Loading projects list.', {
      mode,
      tableCandidates: modeConfig.tableCandidates,
      orderColumns: modeConfig.orderColumns,
    });

    setIsLoadingProjects(true);
    setError(null);

    try {
      for (const tableName of modeConfig.tableCandidates) {
        for (const orderColumn of modeConfig.orderColumns) {
          const { data, error: queryError } = await supabase
            .from(tableName)
            .select('*')
            .order(orderColumn, { ascending: false })
            .limit(MAX_PROJECTS);

          if (!queryError && Array.isArray(data)) {
            if (projectsLoadRequestRef.current !== requestId) {
              console.log('[AdminPage] Ignoring stale project load result.', {
                mode,
                tableName,
                requestId,
                latestRequestId: projectsLoadRequestRef.current,
              });
              return;
            }
            console.log('[AdminPage] Loaded projects from Supabase table.', {
              mode,
              tableName,
              orderColumn,
              count: data.length,
            });

            const nextProjects: AdminProject[] = data.map((row) => {
              const record = (row || {}) as Record<string, unknown>;
              const id = toStringValue(record.id) || `project-${Math.random().toString(36).slice(2, 10)}`;
              return {
                id,
                tableName,
                createdAt: toDateLabel(record.created_at || record.createdAt || record.date),
                label: resolveProjectLabel(mode, record),
                subtitle: resolveProjectSubtitle(mode, record),
                row: record,
              };
            });

            setActiveTableName(tableName);
            setProjects(nextProjects);
            setProjectSearchQuery('');
            setSelectedProjectId('');
            setSelectedRow(null);
            return;
          }

          console.log('[AdminPage] Project list query attempt failed.', {
            mode,
            tableName,
            orderColumn,
            errorCode: queryError?.code,
            errorMessage: queryError?.message,
          });
        }
      }

      if (projectsLoadRequestRef.current !== requestId) {
        return;
      }
      setActiveTableName('');
      setProjects([]);
      setError('Could not load rows from the configured table names. Confirm table name and RLS policies, or paste a row JSON directly.');
    } finally {
      if (projectsLoadRequestRef.current === requestId) {
        setIsLoadingProjects(false);
      }
    }
  }, [mode, modeConfig.orderColumns, modeConfig.tableCandidates]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    const handleDocumentPointerDown = (event: MouseEvent) => {
      if (!projectDropdownRef.current) {
        return;
      }

      if (!projectDropdownRef.current.contains(event.target as Node)) {
        setIsProjectDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentPointerDown);
    return () => {
      document.removeEventListener('mousedown', handleDocumentPointerDown);
    };
  }, []);

  const handleProjectChange = (projectId: string) => {
    console.log('[AdminPage] Project selected from dropdown.', { mode, projectId });
    setSelectedProjectId(projectId);
    const project = projects.find((item) => item.id === projectId);
    if (!project) {
      setSelectedRow(null);
      return;
    }

    setProjectSearchQuery(`${project.label} • ${project.createdAt}`);
    setIsProjectDropdownOpen(false);
    setRowIdInput(project.id);
    setSelectedRow(project.row);
    setError(null);
  };

  const handleProjectSearchInputChange = (value: string) => {
    console.log('[AdminPage] Updating project search query.', {
      mode,
      query: value,
    });
    setProjectSearchQuery(value);
    setIsProjectDropdownOpen(true);

    const trimmed = value.trim();
    if (!trimmed) {
      setSelectedProjectId('');
      setSelectedRow(null);
      return;
    }

    const matchedById = projects.find((project) => project.id === trimmed);
    if (matchedById) {
      handleProjectChange(matchedById.id);
    }
  };

  const loadById = async () => {
    const trimmedId = rowIdInput.trim();
    if (!trimmedId) {
      setError('Enter a row ID before loading.');
      return;
    }

    console.log('[AdminPage] Loading row by ID.', {
      mode,
      trimmedId,
      preferredTable: activeTableName,
    });

    setIsLoadingRow(true);
    setError(null);

    const tableSearchOrder = [activeTableName, ...modeConfig.tableCandidates].filter(Boolean);

    try {
      for (const tableName of tableSearchOrder) {
        const { data, error: queryError } = await supabase
          .from(tableName)
          .select('*')
          .eq('id', trimmedId)
          .limit(1);

        if (!queryError && Array.isArray(data) && data.length > 0 && isRecord(data[0])) {
          console.log('[AdminPage] Loaded row by ID.', {
            mode,
            tableName,
            trimmedId,
          });

          const resolvedRow = data[0] as Record<string, unknown>;
          setActiveTableName(tableName);
          setSelectedRow(resolvedRow);
          setSelectedProjectId(toStringValue(resolvedRow.id));
          return;
        }

        console.log('[AdminPage] Row-by-ID query attempt failed or empty.', {
          mode,
          tableName,
          trimmedId,
          hasQueryError: Boolean(queryError),
          errorMessage: queryError?.message,
        });
      }

      setError('No row found for that ID in the configured table candidates. Try selecting a project from the dropdown, verify the ID, or paste row JSON.');
    } finally {
      setIsLoadingRow(false);
    }
  };

  const renderFromPastedJson = () => {
    const trimmed = jsonRowInput.trim();
    if (!trimmed) {
      setError('Paste a Supabase row JSON object first.');
      return;
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (!isRecord(parsed)) {
        setError('Parsed JSON must be an object that represents one table row.');
        return;
      }

      console.log('[AdminPage] Rendering report from pasted JSON row.', {
        mode,
        parsedKeys: Object.keys(parsed),
      });

      setSelectedRow(parsed);
      const parsedId = toStringValue(parsed.id);
      if (parsedId) {
        setRowIdInput(parsedId);
        setSelectedProjectId(parsedId);
      }
      setError(null);
    } catch (jsonError) {
      console.log('[AdminPage] Failed to parse pasted JSON row.', {
        mode,
        message: jsonError instanceof Error ? jsonError.message : String(jsonError),
      });
      setError('Invalid JSON. Paste a full row object copied from Supabase and try again.');
    }
  };

  const exportDocument = useMemo<BrandAtlasExportDocument | null>(() => {
    if (!preview?.data) {
      return null;
    }

    const toLines = (values: Array<string | null | undefined>, max?: number): string[] => {
      const normalized = values
        .map((value) => cleanEvidenceText(value || ''))
        .filter(Boolean);
      return typeof max === 'number' ? normalized.slice(0, max) : normalized;
    };

    if (preview.type === 'cultural') {
      const audience = toStringValue(selectedRow?.audience || selectedRow?.demographic || selectedRow?.custom_name).trim() || 'N/A';
      const sections: BrandAtlasExportDocument['sections'] = CULTURAL_SECTIONS
        .map((section) => {
          const items = Array.isArray(preview.data[section.key]) ? preview.data[section.key] : [];
          const cards = items
            .map((item, index) => ({
              title: `Insight ${index + 1}`,
              lines: toLines([
                item.text,
                item.confidenceLevel ? `Confidence: ${item.confidenceLevel.toUpperCase()}` : '',
                item.sourceType ? `Source Type: ${item.sourceType}` : '',
                item.trendLifecycle ? `Trend Stage: ${item.trendLifecycle}` : '',
                item.deepDive?.originationDate ? `Origination Date: ${item.deepDive.originationDate}` : '',
                item.deepDive?.relevance ? `Relevance: ${item.deepDive.relevance}` : '',
                item.deepDive?.expandedContext ? `Context: ${item.deepDive.expandedContext}` : '',
                item.backgroundWriteup ? `Background: ${item.backgroundWriteup}` : '',
                ...((item.deepDive?.realWorldExamples || []).map((example) => `Real-World Example: ${example}`)),
                ...((item.deepDive?.strategicImplications || []).map((implication) => `Strategic Implication: ${implication}`)),
                ...((item.deepDive?.sources || []).map((source) => `Deep-dive Source: ${source.title}: ${source.url}`)),
              ]),
            }))
            .filter((card) => card.lines.length > 0);

          return {
            title: section.label,
            cards,
          };
        })
        .filter((section) => section.cards.length > 0);

      if ((preview.data.sources || []).length > 0) {
        sections.push({
          title: 'Sources',
          cards: (preview.data.sources || []).map((source) => ({
            title: cleanEvidenceText(source.title || 'Source'),
            lines: toLines([source.url]),
          })),
        });
      }

      return {
        reportTitle: 'Cultural Archaeologist',
        reportSubtitle: 'Brand Atlas Cultural Lens Report',
        audience,
        contextLines: toLines([
          toStringValue(selectedRow?.brand || selectedRow?.context).trim() ? `Context: ${toStringValue(selectedRow?.brand || selectedRow?.context).trim()}` : '',
          toStringValue(selectedRow?.topic_focus || selectedRow?.topicFocus).trim() ? `Topic: ${toStringValue(selectedRow?.topic_focus || selectedRow?.topicFocus).trim()}` : '',
          preview.data.sociological_analysis ? `Summary: ${preview.data.sociological_analysis}` : '',
        ]),
        sections,
      };
    }

    if (preview.type === 'brand') {
      const brandNames = preview.data.results.map((result) => cleanEvidenceText(result.brandName)).filter(Boolean);
      const sections: BrandAtlasExportDocument['sections'] = preview.data.results.map((result, index) => {
        const cards: BrandAtlasExportDocument['sections'][number]['cards'] = [
          { title: 'High-level Summary', lines: toLines([result.highLevelSummary]) },
          { title: 'Brand Mission', lines: toLines([result.brandMission]) },
          {
            title: 'Brand Positioning',
            lines: toLines([
              result.brandPositioning.valueProposition ? `Value Proposition: ${result.brandPositioning.valueProposition}` : '',
              result.brandPositioning.voiceAndTone ? `Voice & Tone: ${result.brandPositioning.voiceAndTone}` : '',
              ...(result.brandPositioning.taglines || []).map((tagline) => `Tagline: ${tagline}`),
              ...(result.brandPositioning.keyMessagesAndClaims || []).map((claim) => `Claim: ${claim}`),
            ]),
          },
          { title: 'Offerings', lines: toLines(result.keyOfferingsProductsServices || []) },
          { title: 'Strategic Moats', lines: toLines(result.strategicMoatsStrengths || []) },
          { title: 'Potential Threats', lines: toLines(result.potentialThreatsWeaknesses || []) },
          {
            title: 'Target Audiences',
            lines: (result.targetAudiences || [])
              .map((audience) => cleanEvidenceText(`${audience.audience || 'Audience'} (${audience.priority || 'N/A'}): ${audience.inferredRoleToConsumers || 'N/A'}`))
              .filter(Boolean),
          },
          { title: 'Recent Campaigns', lines: toLines(result.recentCampaigns || []) },
          { title: 'Key Marketing Channels', lines: toLines(result.keyMarketingChannels || []) },
          {
            title: 'Social Media Channels',
            lines: (result.socialMediaChannels || [])
              .map((channel) => cleanEvidenceText(`${channel.channel}: ${channel.url}`))
              .filter(Boolean),
          },
          { title: 'Recent News', lines: toLines(normalizeNewsItems(result.recentNews as unknown)) },
        ].filter((card) => card.lines.length > 0);

        if ((result.sources || []).length > 0) {
          cards.push({
            title: 'Sources',
            lines: (result.sources || [])
              .map((source) => cleanEvidenceText(`${source.title}: ${source.url}`))
              .filter(Boolean),
          });
        }

        return {
          title: cleanEvidenceText(result.brandName) || `Brand ${index + 1}`,
          cards,
        };
      }).filter((section) => section.cards.length > 0);

      if ((preview.data.sources || []).length > 0) {
        sections.push({
          title: 'Global Sources',
          cards: (preview.data.sources || []).map((source) => ({
            title: cleanEvidenceText(source.title || 'Source'),
            lines: toLines([source.url]),
          })),
        });
      }

      return {
        reportTitle: 'Brand Navigator',
        reportSubtitle: 'Brand Atlas Competitive Audit',
        audience: toStringValue(selectedRow?.audience || selectedRow?.custom_name).trim() || 'N/A',
        contextLines: toLines([
          brandNames.length > 0 ? `Brands: ${brandNames.join(' vs ')}` : '',
          toStringValue(selectedRow?.topic_focus || selectedRow?.topicFocus || preview.data.analysisObjective).trim()
            ? `Topic: ${toStringValue(selectedRow?.topic_focus || selectedRow?.topicFocus || preview.data.analysisObjective).trim()}`
            : '',
        ]),
        sections,
      };
    }

    const designLeadNames = preview.data.brandProfiles
      .map((profile) => cleanEvidenceText(profile.brandName))
      .filter(Boolean);
    const designSections: BrandAtlasExportDocument['sections'] = preview.data.brandProfiles.map((profile, index) => {
      const cards: BrandAtlasExportDocument['sections'][number]['cards'] = [
        {
          title: 'Logos & Visuals',
          lines: toLines([
            profile.logo.mainLogo ? `Main Logo: ${profile.logo.mainLogo}` : '',
            profile.logo.wordmarkLogotype ? `Wordmark: ${profile.logo.wordmarkLogotype}` : '',
            ...(profile.sampleVisuals || []).map((visual) => `Visual: ${visual.title || visual.url}`),
          ]),
        },
        {
          title: 'Logo System',
          lines: toLines([
            ...(profile.logo.logoVariations || []).map((variation) => `Variation: ${variation}`),
            ...(profile.logo.symbolsIcons || []).map((symbol) => `Symbol/Icon: ${symbol}`),
          ]),
        },
        {
          title: 'Color Palette',
          lines: [
            ...(profile.colorPalette.primaryColors || []).map((color) => cleanEvidenceText(`Primary: ${color.name || 'Color'} (${color.hex || 'N/A'})`)),
            ...(profile.colorPalette.secondaryAccentColors || []).map((color) => cleanEvidenceText(`Accent: ${color.name || 'Color'} (${color.hex || 'N/A'})`)),
            ...(profile.colorPalette.neutrals || []).map((color) => cleanEvidenceText(`Neutral: ${color.name || 'Color'} (${color.hex || 'N/A'})`)),
          ].filter(Boolean),
        },
        {
          title: 'Typography',
          lines: toLines([
            ...(profile.typography.fontFamilies || []).map((family) => `Font Family: ${family}`),
            profile.typography.hierarchy.h1 ? `H1: ${profile.typography.hierarchy.h1}` : '',
            profile.typography.hierarchy.h2 ? `H2: ${profile.typography.hierarchy.h2}` : '',
            profile.typography.hierarchy.body ? `Body: ${profile.typography.hierarchy.body}` : '',
            ...(profile.typography.usageRules || []).map((rule) => `Rule: ${rule}`),
          ]),
        },
        {
          title: 'Supporting Visual Elements',
          lines: toLines([
            ...(profile.supportingVisualElements.imageryStyle || []).map((value) => `Imagery: ${value}`),
            ...(profile.supportingVisualElements.icons || []).map((value) => `Icons: ${value}`),
            ...(profile.supportingVisualElements.patternsTextures || []).map((value) => `Pattern/Texture: ${value}`),
            ...(profile.supportingVisualElements.shapes || []).map((value) => `Shapes: ${value}`),
            ...(profile.supportingVisualElements.dataVisualization || []).map((value) => `Data Visualization: ${value}`),
          ]),
        },
        {
          title: 'Assessments',
          lines: toLines([
            profile.consistencyAssessment ? `Consistency: ${profile.consistencyAssessment}` : '',
            profile.distinctivenessAssessment ? `Distinctiveness: ${profile.distinctivenessAssessment}` : '',
          ]),
        },
      ].filter((card) => card.lines.length > 0);

      if ((profile.sources || []).length > 0) {
        cards.push({
          title: 'Sources',
          lines: (profile.sources || [])
            .map((source) => cleanEvidenceText(`${source.title}: ${source.url}`))
            .filter(Boolean),
        });
      }

      return {
        title: cleanEvidenceText(profile.brandName) || `Brand ${index + 1}`,
        cards,
      };
    }).filter((section) => section.cards.length > 0);

    if ((preview.data.crossBrandReadout || []).length > 0 || (preview.data.strategicRecommendations || []).length > 0) {
      designSections.push({
        title: 'Cross-Brand Readout',
        cards: [
          {
            title: 'Opportunity Spaces',
            lines: toLines(preview.data.crossBrandReadout || []),
          },
          {
            title: 'Strategic Recommendations',
            lines: toLines(preview.data.strategicRecommendations || []),
          },
        ].filter((card) => card.lines.length > 0),
      });
    }

    if ((preview.data.sources || []).length > 0) {
      designSections.push({
        title: 'Global Sources',
        cards: (preview.data.sources || []).map((source) => ({
          title: cleanEvidenceText(source.title || 'Source'),
          lines: toLines([source.url]),
        })),
      });
    }

    return {
      reportTitle: 'Design Excavator',
      reportSubtitle: 'Brand Atlas Visual Identity Audit',
      audience: toStringValue(selectedRow?.audience || selectedRow?.custom_name).trim() || 'N/A',
      contextLines: toLines([
        designLeadNames.length > 0 ? `Brands: ${designLeadNames.join(' vs ')}` : '',
        toStringValue(selectedRow?.analysis_objective || selectedRow?.analysisObjective || preview.data.analysisObjective).trim()
          ? `Objective: ${toStringValue(selectedRow?.analysis_objective || selectedRow?.analysisObjective || preview.data.analysisObjective).trim()}`
          : '',
      ]),
      sections: designSections,
    };
  }, [preview, selectedRow]);

  const getExportFileBase = (): string => {
    const fallbackBase = `Admin_${modeConfig.label.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}`;
    if (!preview?.data) {
      return fallbackBase;
    }

    if (preview.type === 'cultural') {
      const audience = toStringValue(selectedRow?.audience || selectedRow?.demographic || selectedRow?.custom_name);
      return buildExportFileBase(audience, fallbackBase);
    }

    if (preview.type === 'brand') {
      const leadBrand = preview.data.results[0]?.brandName || toStringValue(selectedRow?.brand || selectedRow?.custom_name);
      return buildExportFileBase(leadBrand, fallbackBase);
    }

    const leadBrand = preview.data.brandProfiles[0]?.brandName || toStringValue(selectedRow?.brand || selectedRow?.custom_name);
    return buildExportFileBase(leadBrand, fallbackBase);
  };

  const getExportSuffix = (): string => {
    if (preview?.type === 'cultural') return 'Cultural_Archaeologist';
    if (preview?.type === 'brand') return 'Brand_Navigator';
    return 'Design_Excavator';
  };

  const exportToPptx = async () => {
    if (!preview?.data || !exportDocument) {
      console.log('[AdminPage] Blocked PPTX export because no export document is available.', {
        hasPreviewData: Boolean(preview?.data),
        hasExportDocument: Boolean(exportDocument),
      });
      setExportError({ type: 'pptx', message: 'No parsed results are available to export yet. Load a valid row first.' });
      return;
    }

    setExportError(null);
    setIsExportingPptx(true);
    const fileName = `${getExportFileBase()}_${getExportSuffix()}.pptx`;
    console.log('[AdminPage] Starting themed admin PPTX export.', {
      mode,
      fileName,
      sectionCount: exportDocument.sections.length,
    });

    try {
      await exportBrandAtlasDocumentToPptx(exportDocument, fileName);
      console.log('[AdminPage] Themed admin PPTX export completed.', { mode, fileName });
    } catch (err) {
      const normalized = normalizeAppError(err);
      const detail = getExportErrorDetail(err);
      console.log('[AdminPage] Admin PPTX export failed.', {
        mode,
        message: normalized.message,
        detail,
      });
      setExportError({
        type: 'pptx',
        message: detail ? `Failed to export PPTX: ${detail}` : (normalized.message || 'Failed to export PPTX. Please retry.'),
      });
    } finally {
      setIsExportingPptx(false);
    }
  };

  const exportToPdf = async () => {
    if (!preview?.data || !exportDocument) {
      console.log('[AdminPage] Blocked PDF export because no export document is available.', {
        hasPreviewData: Boolean(preview?.data),
        hasExportDocument: Boolean(exportDocument),
      });
      setExportError({ type: 'pdf', message: 'No parsed results are available to export yet. Load a valid row first.' });
      return;
    }

    setExportError(null);
    setIsExportingPdf(true);
    const fileName = `${getExportFileBase()}_${getExportSuffix()}.pdf`;
    console.log('[AdminPage] Starting themed admin PDF export.', {
      mode,
      fileName,
      sectionCount: exportDocument.sections.length,
    });

    try {
      await exportBrandAtlasDocumentToPdf(exportDocument, fileName);
      console.log('[AdminPage] Themed admin PDF export completed.', { mode, fileName });
    } catch (err) {
      const normalized = normalizeAppError(err);
      const detail = getExportErrorDetail(err);
      console.log('[AdminPage] Admin PDF export failed.', {
        mode,
        message: normalized.message,
        detail,
      });
      setExportError({
        type: 'pdf',
        message: detail ? `Failed to export PDF: ${detail}` : (normalized.message || 'Failed to export PDF. Please retry.'),
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div data-testid="admin-console" className="w-full">
      <section className="rounded-3xl border border-zinc-200 bg-white p-5 md:p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-indigo-700">
              <Shield className="h-3.5 w-3.5" />
              Admin Console
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900">Report Reconstructor</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Load by row ID, pick from created projects, or paste a full row JSON to recreate report boxes.
            </p>
          </div>
          {onBack && (
            <button
              type="button"
              data-testid="admin-back-button"
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </button>
          )}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4 lg:col-span-1">
            <label htmlFor="admin-mode-select" className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Report Type
            </label>
            <select
              id="admin-mode-select"
              data-testid="admin-mode-select"
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
              value={mode}
              onChange={(event) => {
                const nextMode = event.target.value as AdminMode;
                console.log('[AdminPage] Changing mode.', { from: mode, to: nextMode });
                setMode(nextMode);
                setProjectSearchQuery('');
                setIsProjectDropdownOpen(false);
                setSelectedProjectId('');
                setSelectedRow(null);
                setError(null);
              }}
            >
              {Object.values(MODE_CONFIGS).map((config) => (
                <option key={config.id} value={config.id}>{config.label}</option>
              ))}
            </select>
            <p className="mt-2 text-xs text-zinc-500">{modeConfig.description}</p>

            <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Connected Table</p>
              <p data-testid="admin-active-table" className="mt-1 text-sm font-medium text-zinc-800">
                {activeTableName || 'No table resolved'}
              </p>
              <button
                type="button"
                data-testid="admin-refresh-projects-button"
                onClick={() => {
                  void loadProjects();
                }}
                disabled={isLoadingProjects}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
              >
                {isLoadingProjects ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Refresh Projects
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4 lg:col-span-2">
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label htmlFor="admin-project-select" className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Projects
                </label>
                <div ref={projectDropdownRef} className="mt-1 relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                  <input
                    id="admin-project-select"
                    data-testid="admin-project-select"
                    type="text"
                    role="combobox"
                    aria-expanded={isProjectDropdownOpen}
                    aria-controls="admin-project-options-listbox"
                    value={projectSearchQuery}
                    onFocus={() => setIsProjectDropdownOpen(true)}
                    onChange={(event) => handleProjectSearchInputChange(event.target.value)}
                    placeholder="Search projects and pick from dropdown"
                    className="w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 py-2 text-sm text-zinc-900"
                  />
                  {isProjectDropdownOpen && (
                    <div
                      id="admin-project-options-listbox"
                      data-testid="admin-project-options-listbox"
                      role="listbox"
                      className="absolute z-20 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-lg"
                    >
                      {filteredProjects.length > 0 ? (
                        filteredProjects.map((project) => (
                          <button
                            key={`${project.tableName}-${project.id}`}
                            type="button"
                            data-testid={`admin-project-option-${project.id}`}
                            role="option"
                            onClick={() => handleProjectChange(project.id)}
                            className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-50"
                          >
                            {project.label} • {project.createdAt}
                          </button>
                        ))
                      ) : (
                        <p data-testid="admin-project-no-results" className="px-2.5 py-2 text-sm text-zinc-500">
                          No matching projects found.
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  {isLoadingProjects
                    ? 'Loading project list...'
                    : `${filteredProjects.length} of ${projects.length} row(s) shown from ${activeTableName || 'table candidates'}.`}
                </p>
                <div className="mt-3 rounded-xl border border-zinc-200 bg-white">
                  <button
                    type="button"
                    data-testid="admin-row-id-toggle-button"
                    aria-expanded={isRowIdPanelOpen}
                    onClick={() => {
                      const nextOpen = !isRowIdPanelOpen;
                      console.log('[AdminPage] Toggling row ID loader panel.', {
                        nextOpen,
                      });
                      setIsRowIdPanelOpen(nextOpen);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                  >
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      Load by Row ID
                    </span>
                    <ChevronDown className={`h-4 w-4 text-zinc-400 transition-transform ${isRowIdPanelOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isRowIdPanelOpen && (
                    <div data-testid="admin-row-id-panel" className="border-t border-zinc-200 px-3 pb-3 pt-2">
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          id="admin-row-id-input"
                          data-testid="admin-row-id-input"
                          type="text"
                          value={rowIdInput}
                          onChange={(event) => setRowIdInput(event.target.value)}
                          placeholder="Paste row id"
                          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
                        />
                        <button
                          type="button"
                          data-testid="admin-load-by-id-button"
                          onClick={() => {
                            void loadById();
                          }}
                          disabled={isLoadingRow}
                          className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                        >
                          {isLoadingRow ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                          Load
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-zinc-200 bg-white">
              <button
                type="button"
                data-testid="admin-json-toggle-button"
                aria-expanded={isJsonPanelOpen}
                onClick={() => {
                  const nextOpen = !isJsonPanelOpen;
                  console.log('[AdminPage] Toggling pasted JSON panel.', {
                    nextOpen,
                  });
                  setIsJsonPanelOpen(nextOpen);
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
              >
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Paste Full Supabase Row JSON
                </span>
                <ChevronDown className={`h-4 w-4 text-zinc-400 transition-transform ${isJsonPanelOpen ? 'rotate-180' : ''}`} />
              </button>

              {isJsonPanelOpen && (
                <div data-testid="admin-json-panel" className="border-t border-zinc-200 px-3 pb-3 pt-2">
                  <textarea
                    id="admin-json-row-input"
                    data-testid="admin-json-row-input"
                    value={jsonRowInput}
                    onChange={(event) => setJsonRowInput(event.target.value)}
                    placeholder='{"id":"...","matrix":{...}}'
                    rows={7}
                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-800"
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-xs text-zinc-500">Recovery option: if table access fails, you can still paste a row JSON and render it locally.</p>
                    <button
                      type="button"
                      data-testid="admin-render-json-button"
                      onClick={renderFromPastedJson}
                      className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
                    >
                      <WandSparkles className="h-4 w-4" />
                      Render JSON
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div data-testid="admin-error-message" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {error}
          </div>
        )}
      </section>

      <SectionErrorBoundary title="Admin Report Preview">
        <section data-testid="admin-report-preview" className="mt-6 rounded-3xl border border-zinc-200 bg-white p-5 md:p-6 shadow-sm">
          {selectedRow && preview?.data && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/70 px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Download Full Reconstructed Results</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="admin-export-pptx-button"
                  onClick={() => {
                    void exportToPptx();
                  }}
                  disabled={isExportingPptx || isExportingPdf}
                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                >
                  {isExportingPptx ? <Loader2 className="h-4 w-4 animate-spin" /> : <Presentation className="h-4 w-4" />}
                  {isExportingPptx ? 'Exporting PPTX...' : 'Export PPTX'}
                </button>
                <button
                  type="button"
                  data-testid="admin-export-pdf-button"
                  onClick={() => {
                    void exportToPdf();
                  }}
                  disabled={isExportingPptx || isExportingPdf}
                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                >
                  {isExportingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  {isExportingPdf ? 'Exporting PDF...' : 'Export PDF'}
                </button>
              </div>
            </div>
          )}

          {exportError && (
            <div data-testid="admin-export-error" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <p>{exportError.message}</p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  data-testid="admin-export-retry-button"
                  onClick={() => {
                    if (exportError.type === 'pptx') {
                      void exportToPptx();
                      return;
                    }
                    void exportToPdf();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-100 px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-200"
                >
                  Retry Export
                </button>
                <p className="text-xs text-amber-700">Recovery option: confirm the preview is loaded and try exporting again.</p>
              </div>
            </div>
          )}

          <div data-testid="admin-export-capture-root" data-export-capture-root="1">
          {!selectedRow && (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
              <Database className="mx-auto h-6 w-6 text-zinc-400" />
              <p className="mt-2 text-sm font-medium text-zinc-700">No report row loaded yet.</p>
              <p className="mt-1 text-xs text-zinc-500">Select a project, load by row ID, or paste a row JSON to recreate report boxes.</p>
            </div>
          )}

          {selectedRow && preview?.type === 'cultural' && preview.data && (
            <div data-testid="admin-preview-cultural" className="space-y-5">
              <div className="rounded-3xl border border-indigo-100 bg-indigo-50 p-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Sociological Analysis</p>
                <p className="mt-2 whitespace-pre-line text-sm text-indigo-900 leading-relaxed">
                  {renderEvidenceInlineText(preview.data.sociological_analysis || 'No summary available.', 'cultural-summary')}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Average Age</p>
                  <p className="mt-1 text-sm text-zinc-700">{renderEvidenceInlineText(preview.data.demographics.age || 'Data unavailable', 'cultural-age')}</p>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Race</p>
                  <p className="mt-1 text-sm text-zinc-700">{renderEvidenceInlineText(preview.data.demographics.race || 'Data unavailable', 'cultural-race')}</p>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Gender</p>
                  <p className="mt-1 text-sm text-zinc-700">{renderEvidenceInlineText(preview.data.demographics.gender || 'Data unavailable', 'cultural-gender')}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {CULTURAL_SECTIONS.map((section) => {
                  const rawItems = Array.isArray(preview.data[section.key]) ? (preview.data[section.key] as MatrixItem[]) : [];

                  return (
                    <div key={section.key} className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-5 shadow-[0_1px_6px_-3px_rgba(0,0,0,0.08)]">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{section.label}</p>
                      <div className="mt-3">{renderCulturalMatrixItems(rawItems, `cultural-${section.key}`)}</div>
                    </div>
                  );
                })}
              </div>

              {renderSourcesSection(preview.data.sources || [], 'cultural-results-sources')}
            </div>
          )}

          {selectedRow && preview?.type === 'brand' && preview.data && (
            <div data-testid="admin-preview-brand" className="space-y-6">
              <div className="rounded-3xl border border-indigo-100 bg-indigo-50 p-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Analysis Objective</p>
                <p className="mt-1 text-sm text-indigo-900">{renderEvidenceInlineText(preview.data.analysisObjective || 'No analysis objective provided.', 'brand-objective')}</p>
              </div>

              {preview.data.results.map((result, index) => (
                <section
                  key={`${result.brandName}-${index}`}
                  id={`brand-results-brand-${index}`}
                  className="bg-zinc-50/60 p-6 rounded-3xl border border-zinc-200 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]"
                >
                  <h3 className="text-xl font-semibold text-zinc-900">{result.brandName || `Brand ${index + 1}`}</h3>

                  <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="admin-brand-sections-grid">
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">High-level summary</p>
                      <p className="mt-2 text-sm text-zinc-700">{renderEvidenceInlineText(result.highLevelSummary || 'N/A', `brand-${index}-summary`)}</p>
                    </div>

                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Brand mission</p>
                      <p className="mt-2 text-sm text-zinc-700">{renderEvidenceInlineText(result.brandMission || 'N/A', `brand-${index}-mission`)}</p>
                    </div>

                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5 lg:col-span-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Brand positioning</p>
                      <div className="mt-2 space-y-2">
                        <div>
                          <p className="text-xs font-medium text-zinc-600">Taglines</p>
                          {renderSimpleList(result.brandPositioning.taglines || [], 'No taglines listed.', `brand-${index}-taglines`)}
                        </div>
                        <div>
                          <p className="text-xs font-medium text-zinc-600">Key messages and claims</p>
                          {renderSimpleList(result.brandPositioning.keyMessagesAndClaims || [], 'No key messages listed.', `brand-${index}-messages`)}
                        </div>
                        <p className="text-sm text-zinc-700"><span className="font-medium">Value proposition:</span> {renderEvidenceInlineText(result.brandPositioning.valueProposition || 'N/A', `brand-${index}-value`)}</p>
                        <p className="text-sm text-zinc-700"><span className="font-medium">Voice and tone:</span> {renderEvidenceInlineText(result.brandPositioning.voiceAndTone || 'N/A', `brand-${index}-voice`)}</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Key offerings/products/services</p>
                      <div className="mt-2">{renderSimpleList(result.keyOfferingsProductsServices || [], 'No offerings listed.', `brand-${index}-offerings`)}</div>
                    </div>

                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Strategic moats (strengths)</p>
                      <div className="mt-2">{renderSimpleList(result.strategicMoatsStrengths || [], 'No strengths listed.', `brand-${index}-strengths`)}</div>
                    </div>

                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Potential threats (weaknesses)</p>
                      <div className="mt-2">{renderSimpleList(result.potentialThreatsWeaknesses || [], 'No weaknesses listed.', `brand-${index}-weaknesses`)}</div>
                    </div>

                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Recent campaigns</p>
                      <div className="mt-2">{renderSimpleList(result.recentCampaigns || [], 'No campaigns listed.', `brand-${index}-campaigns`)}</div>
                    </div>

                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Key marketing channels</p>
                      <div className="mt-2">{renderSimpleList(result.keyMarketingChannels || [], 'No channels listed.', `brand-${index}-channels`)}</div>
                    </div>

                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Social media channels</p>
                      {result.socialMediaChannels.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {result.socialMediaChannels.map((channel, channelIndex) => (
                            <a
                              key={`${channel.url}-${channelIndex}`}
                              href={toSafeExternalHref(channel.url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-2.5 py-1 rounded-full transition-colors"
                            >
                              <ExternalLink className="w-3 h-3" />
                              {channel.channel}
                            </a>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-zinc-500">No social channels listed.</p>
                      )}
                    </div>

                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Recent news</p>
                      <div className="mt-2">{renderSimpleList(normalizeNewsItems(result.recentNews as unknown), 'No recent news in this row.', `brand-${index}-news`)}</div>
                    </div>

                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5 lg:col-span-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Target audiences</p>
                      {result.targetAudiences.length > 0 ? (
                        <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                          {result.targetAudiences.map((audience, audienceIndex) => (
                            <div key={`${audience.audience}-${audienceIndex}`} className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
                              <p><span className="font-medium">Audience:</span> {renderEvidenceInlineText(audience.audience || 'N/A', `brand-${index}-audience-${audienceIndex}`)}</p>
                              <p><span className="font-medium">Priority:</span> {renderEvidenceInlineText(audience.priority || 'N/A', `brand-${index}-priority-${audienceIndex}`)}</p>
                              <p><span className="font-medium">Role to consumers:</span> {renderEvidenceInlineText(audience.inferredRoleToConsumers || 'N/A', `brand-${index}-role-${audienceIndex}`)}</p>
                              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Functional benefits</p>
                              {renderSimpleList(audience.functionalBenefits || [], 'No functional benefits listed.', `brand-${index}-functional-${audienceIndex}`)}
                              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Emotional benefits</p>
                              {renderSimpleList(audience.emotionalBenefits || [], 'No emotional benefits listed.', `brand-${index}-emotional-${audienceIndex}`)}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-zinc-500">No target audiences listed.</p>
                      )}
                    </div>

                    {result.sources.length > 0 && (
                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5 lg:col-span-2" data-testid={`admin-brand-sources-${index}`}>
                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Sources & Research</p>
                        <div className="mt-2">{renderSources(result.sources)}</div>
                      </div>
                    )}
                  </div>
                </section>
              ))}

              {renderSourcesSection(preview.data.sources || [], 'brand-results-sources')}
            </div>
          )}

          {selectedRow && preview?.type === 'design' && preview.data && (
            <div data-testid="admin-preview-design" className="space-y-6">
              <div className="rounded-3xl border border-indigo-100 bg-indigo-50 p-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Analysis Objective</p>
                <p className="mt-1 text-sm text-indigo-900">{renderEvidenceInlineText(preview.data.analysisObjective || 'No analysis objective provided.', 'design-objective')}</p>
              </div>

              {preview.data.brandProfiles.map((profile, index) => (
                <section key={`${profile.brandName}-${index}`} id={`design-results-brand-${index}`} className="bg-white rounded-3xl border border-zinc-200 p-6 space-y-6 shadow-sm w-full">
                  <h3 className="text-xl font-semibold text-zinc-900">{profile.brandName || `Brand ${index + 1}`}</h3>
                  {profile.website && (
                    <a
                      href={toSafeExternalHref(profile.website)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex text-xs text-zinc-500 hover:text-indigo-700"
                    >
                      {profile.website}
                    </a>
                  )}

                  <div className="mt-4 space-y-4">
                    <div id={`design-results-brand-${index}-logos-visuals`} className="bg-zinc-50 rounded-2xl border border-zinc-100 p-4 mb-4">
                      <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">Logos & Visuals</p>
                      <p className="mt-2 text-sm text-zinc-700"><span className="font-medium">Main logo:</span> {renderEvidenceInlineText(profile.logo.mainLogo || 'N/A', `design-${index}-main-logo`)}</p>
                      <p className="mt-1 text-sm text-zinc-700"><span className="font-medium">Wordmark:</span> {renderEvidenceInlineText(profile.logo.wordmarkLogotype || 'N/A', `design-${index}-wordmark`)}</p>
                      <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Sample visuals</p>
                      {profile.sampleVisuals.length > 0 ? (
                        <ul className="mt-2 space-y-2">
                          {profile.sampleVisuals.map((source, sourceIndex) => (
                            <li key={`${source.url}-${sourceIndex}`} className="text-sm text-zinc-700">
                              <a
                                href={toSafeExternalHref(source.url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-indigo-700 hover:text-indigo-900 hover:underline"
                              >
                                <ExternalLink className="w-3 h-3 mt-0.5 shrink-0" />
                                <span>{renderEvidenceInlineText(source.title || source.url, `design-${index}-sample-${sourceIndex}`)}</span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm text-zinc-500">No sample visuals listed.</p>
                      )}
                    </div>

                    <div id={`design-results-brand-${index}-logo-system`} className="bg-zinc-50 rounded-2xl border border-zinc-100 p-4 mb-4">
                      <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Logo System</p>
                      <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Logo variations</p>
                      <div className="mt-2">{renderSimpleList(profile.logo.logoVariations || [], 'No logo variations listed.', `design-${index}-logo-variations`)}</div>
                      <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Symbols & icons</p>
                      <div className="mt-2">{renderSimpleList(profile.logo.symbolsIcons || [], 'No symbols/icons listed.', `design-${index}-logo-symbols`)}</div>
                    </div>

                    <div id={`design-results-brand-${index}-color-palette`} className="bg-zinc-50 rounded-2xl border border-zinc-100 p-4 mb-4">
                      <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Color Palette</p>
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                        {([
                          { label: 'Primary Colors', colors: profile.colorPalette.primaryColors || [] },
                          { label: 'Accent Colors', colors: profile.colorPalette.secondaryAccentColors || [] },
                          { label: 'Neutrals', colors: profile.colorPalette.neutrals || [] },
                        ] as const).map((group) => (
                          <div key={group.label} className="rounded-xl border border-zinc-200 bg-white p-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{group.label}</p>
                            {group.colors.length > 0 ? (
                              <ul className="mt-2 space-y-2">
                                {group.colors.map((color, colorIndex) => (
                                  <li key={`${group.label}-${colorIndex}`} className="flex items-start gap-2 text-sm text-zinc-700">
                                    <span className="inline-flex h-4 w-4 rounded-full border border-zinc-300" style={{ backgroundColor: color.hex || '#FFFFFF' }} />
                                    <span>
                                      {(color.name || 'Color')} ({color.hex || 'N/A'})
                                      {renderEvidenceChips(extractEvidenceTags(color.name || '').labels, `design-${index}-${group.label}-color-${colorIndex}`)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="mt-2 text-sm text-zinc-500">No colors listed.</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div id={`design-results-brand-${index}-typography`} className="bg-zinc-50 rounded-2xl border border-zinc-100 p-4 mb-4">
                      <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Typography</p>
                      <p className="mt-2 text-sm text-zinc-700">
                        <span className="font-medium">Font families:</span>{' '}
                        {(profile.typography.fontFamilies || []).length > 0 ? (
                          (profile.typography.fontFamilies || []).map((family, familyIndex) => (
                            <span key={`${family}-${familyIndex}`} className="inline">
                              {familyIndex > 0 ? ', ' : ''}
                              {renderEvidenceInlineText(family, `design-${index}-family-${familyIndex}`)}
                            </span>
                          ))
                        ) : (
                          'N/A'
                        )}
                      </p>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-sm text-zinc-700">
                        <p><span className="font-medium">H1:</span> {renderEvidenceInlineText(profile.typography.hierarchy.h1 || 'N/A', `design-${index}-h1`)}</p>
                        <p><span className="font-medium">H2:</span> {renderEvidenceInlineText(profile.typography.hierarchy.h2 || 'N/A', `design-${index}-h2`)}</p>
                        <p><span className="font-medium">Body:</span> {renderEvidenceInlineText(profile.typography.hierarchy.body || 'N/A', `design-${index}-body`)}</p>
                      </div>
                      <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Usage rules</p>
                      <div className="mt-2">{renderSimpleList(profile.typography.usageRules || [], 'No typography usage rules listed.', `design-${index}-usage-rules`)}</div>
                    </div>

                    <div id={`design-results-brand-${index}-supporting-visual-elements`} className="bg-zinc-50 rounded-2xl border border-zinc-100 p-4 mb-4">
                      <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Supporting Visual Elements</p>
                      <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Imagery style</p>
                          {renderSimpleList(profile.supportingVisualElements.imageryStyle || [], 'No imagery style listed.', `design-${index}-imagery`)}
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Icons</p>
                          {renderSimpleList(profile.supportingVisualElements.icons || [], 'No icon notes listed.', `design-${index}-icons`)}
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Patterns & textures</p>
                          {renderSimpleList(profile.supportingVisualElements.patternsTextures || [], 'No patterns listed.', `design-${index}-patterns`)}
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Shapes</p>
                          {renderSimpleList(profile.supportingVisualElements.shapes || [], 'No shape notes listed.', `design-${index}-shapes`)}
                        </div>
                      </div>
                    </div>

                    {profile.sources.length > 0 && (
                      <div id={`design-results-brand-${index}-sources`} className="bg-zinc-50 rounded-2xl border border-zinc-100 p-4 mb-4" data-testid={`admin-design-sources-${index}`}>
                        <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Sources & Research</p>
                        <div className="mt-2">{renderSources(profile.sources)}</div>
                      </div>
                    )}
                  </div>
                </section>
              ))}

              {(preview.data.crossBrandReadout.length > 0 || preview.data.strategicRecommendations.length > 0) && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <section id="design-results-opportunity" className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700">Opportunity Spaces</p>
                    <div className="mt-2">{renderSimpleList(preview.data.crossBrandReadout || [], 'No opportunity spaces listed.', 'design-opportunity')}</div>
                  </section>
                  <section id="design-results-strategic" className="rounded-2xl border border-zinc-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Strategic Recommendations</p>
                    <div className="mt-2">{renderSimpleList(preview.data.strategicRecommendations || [], 'No recommendations listed.', 'design-strategic')}</div>
                  </section>
                </div>
              )}

              {renderSourcesSection(preview.data.sources || [], 'design-results-sources')}
            </div>
          )}

          {selectedRow && preview && !preview.data && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <p className="font-semibold">This row could not be parsed into a {MODE_CONFIGS[mode].label} report.</p>
              <p className="mt-1">Recovery options: switch report type, try a different row ID, or paste a full row JSON that includes the report payload fields.</p>
            </div>
          )}
          </div>
        </section>
      </SectionErrorBoundary>
    </div>
  );
}
