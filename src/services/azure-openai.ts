// Utility: Detailed error logger for debugging and resilience
export function logDetailedError(error: unknown, context?: string) {
  if (typeof window !== 'undefined' && window.console) {
    // Browser environment
    console.error('[Agent Error]', context || '', error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
      console.error('Message:', error.message);
      if ((error as any).cause) {
        console.error('Cause:', (error as any).cause);
      }
    } else if (typeof error === 'object' && error !== null) {
      try {
        console.error('Error details:', JSON.stringify(error, null, 2));
      } catch {}
    }
  } else {
    // Node or unknown
    // eslint-disable-next-line no-console
    console.error('[Agent Error]', context || '', error);
    if (error instanceof Error) {
      // eslint-disable-next-line no-console
      console.error('Stack:', error.stack);
      // eslint-disable-next-line no-console
      console.error('Message:', error.message);
      if ((error as any).cause) {
        // eslint-disable-next-line no-console
        console.error('Cause:', (error as any).cause);
      }
    } else if (typeof error === 'object' && error !== null) {
      try {
        // eslint-disable-next-line no-console
        console.error('Error details:', JSON.stringify(error, null, 2));
      } catch {}
    }
  }
}

const CONTRADICTION_SUFFIX_METADATA_PATTERN = /\s*(?:known|inferred|speculative)[\w\s-]*confidence[\w\s-]*(?:emerging|peaking|declining)[\w\s/-]*$/i;

const cleanContradictionSegment = (value: string): string => value
  .replace(/\bDataset\s*[AB]\b\s*[:\-]?\s*/gi, '')
  .replace(CONTRADICTION_SUFFIX_METADATA_PATTERN, '')
  .replace(/\s{2,}/g, ' ')
  .replace(/^[;,\s]+|[;,\s]+$/g, '')
  .trim();

export function formatContradictionNarrative(text: string): string {
  const raw = String(text || '').trim();
  if (!raw) return 'What they say: Stated intent unavailable.\n\nWhat they do: Behavioral signal unavailable.\n\nTension: Additional evidence needed.';

  const normalized = raw
    .replace(/\bDataset\s*A\s*(says|shows|indicates)?\b/gi, 'What they say')
    .replace(/\bDataset\s*B\s*(says|shows|indicates)?\b/gi, 'What they do')
    .replace(/\r\n/g, '\n');

  const sayMatch = normalized.match(/what they say\s*:\s*([\s\S]*?)(?:\n|what they do\s*:|tension\s*:|$)/i)
    || normalized.match(/belief(?:s)?(?:\s*\(.*?\))?\s*:\s*([\s\S]*?)(?:\n|behavior(?:s|al)?(?:\s*\(.*?\))?\s*:|what they do\s*:|tension\s*:|$)/i);
  const doMatch = normalized.match(/what they do\s*:\s*([\s\S]*?)(?:\n|tension\s*:|$)/i)
    || normalized.match(/behavior(?:s|al)?(?:\s*\(.*?\))?\s*:\s*([\s\S]*?)(?:\n|tension\s*:|$)/i);
  const tensionMatch = normalized.match(/tension\s*:\s*([\s\S]*?)$/i)
    || normalized.match(/the tension is that\s*([\s\S]*?)$/i);

  let whatTheySay = cleanContradictionSegment(sayMatch?.[1] || '');
  let whatTheyDo = cleanContradictionSegment(doMatch?.[1] || '');
  let tension = cleanContradictionSegment(tensionMatch?.[1] || '');

  if (!whatTheySay || !whatTheyDo) {
    const splitMatch = normalized.match(/^([\s\S]*?)\b(?:but|however|while|yet)\b([\s\S]*?)(?:;\s*(?:the\s+)?tension\s+is\s+that\s*([\s\S]*))?$/i);
    if (splitMatch) {
      whatTheySay = whatTheySay || cleanContradictionSegment(splitMatch[1] || '');
      whatTheyDo = whatTheyDo || cleanContradictionSegment(splitMatch[2] || '');
      tension = tension || cleanContradictionSegment(splitMatch[3] || '');
    }
  }

  if (!whatTheySay) whatTheySay = 'Stated intent unavailable.';
  if (!whatTheyDo) whatTheyDo = cleanContradictionSegment(normalized) || 'Behavioral signal unavailable.';
  if (!tension) tension = 'Gap between stated intent and sustained behavior.';

  return `What they say: ${whatTheySay}\n\nWhat they do: ${whatTheyDo}\n\nTension: ${tension}`;
}

function normalizeContradictionItems(items: MatrixItem[]): MatrixItem[] {
  return (items || []).map((item) => ({
    ...item,
    text: formatContradictionNarrative(item.text),
  }));
}

import { AzureOpenAI } from "openai";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { buildBrandWebsiteContextPrompt, fetchBrandWebsiteContext } from './brand-web-context';
import { normalizeExternalHttpUrl, sanitizeApiBaseUrl } from './external-links';
import { isLikelyArticleUrl, isSocialMediaUrl } from './news-outlets';

export interface MatrixItem {
  text: string;
  isHighlyUnique: boolean;
  isFromDocument?: boolean | null;
  sourceType?: string;
  confidenceLevel?: 'low' | 'medium' | 'high';
  trendLifecycle?: 'emerging' | 'peaking' | 'declining';
  deepDive?: DeepDiveReport;
  backgroundWriteup?: string;
}

export interface UploadedFile {
  name: string;
  mimeType: string;
  data: string;
}

export interface Source {
  title: string;
  url: string;
}

export interface Demographics {
  age?: string | null;
  race?: string | null;
  gender?: string | null;
}

export interface CulturalMatrix {
  demographics: Demographics;
  sociological_analysis: string;
  moments: MatrixItem[];
  beliefs: MatrixItem[];
  tone: MatrixItem[];
  language: MatrixItem[];
  behaviors: MatrixItem[];
  contradictions: MatrixItem[];
  community: MatrixItem[];
  influencers: MatrixItem[];
  vocabulary?: {
    wordsTheyUse: string[];
    wordsToAvoid: string[];
  };
  sources: Source[];
}

export interface CulturalRerunFilters {
  confidenceLevels?: Array<'low' | 'medium' | 'high'>;
  evidenceTypes?: Array<'known' | 'inferred' | 'speculative'>;
  trendStages?: Array<'emerging' | 'peaking' | 'declining'>;
  sourceTypes?: string[];
}

export interface AudienceSegmentArchetype {
  name: string;
  archetype: string;
  profile: string;
  demographicsSnippet: string;
  prevalencePct: number;
  keySignals: string[];
  messagingApproach: string;
}

export interface AudienceSegmentationReport {
  regressionSummary: string;
  confidenceNotes: string;
  segments: AudienceSegmentArchetype[];
}

export interface BrandResearchAudience {
  audience: string;
  priority: string;
  inferredRoleToConsumers: string;
  functionalBenefits: string[];
  emotionalBenefits: string[];
}

export interface BrandResearchPositioning {
  taglines: string[];
  keyMessagesAndClaims: string[];
  valueProposition?: string | null;
  voiceAndTone: string;
}

export interface BrandResearchResult {
  brandName: string;
  highLevelSummary: string;
  brandMission?: string | null;
  brandPositioning: BrandResearchPositioning;
  keyOfferingsProductsServices: string[];
  strategicMoatsStrengths: string[];
  potentialThreatsWeaknesses: string[];
  challenges?: string[];
  targetAudiences: BrandResearchAudience[];
  recentCampaigns: string[];
  keyMarketingChannels: string[];
  socialMediaChannels: { channel: string; url: string }[];
  recentNews: Array<
    string | {
      headline?: string | null;
      title?: string | null;
      url?: string | null;
      publishedAt?: string | null;
      outlet?: string | null;
    }
  >;
  sources: Source[];
}

export interface BrandResearchMatrix {
  analysisObjective: string;
  ecosystemMethod: string;
  results: BrandResearchResult[];
  sources: Source[];
}

type BrandWebsiteAnchor = {
  brand: string;
  website?: string | null;
};

export interface DeepDiveReport {
  originationDate: string;
  relevance: string;
  expandedContext: string;
  strategicImplications: string[];
  realWorldExamples: Array<DeepDiveRealWorldExample | string>;
  sources: Source[];
}

export interface DeepDiveRealWorldExample {
  text: string;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
}

export interface BrandDeepDiveReport {
  analysisObjective: string;
  ecosystemMethod: string;
  brandProfiles: BrandVisualIdentityProfile[];
  crossBrandReadout: string[];
  strategicRecommendations: string[];
  sources: { title: string; url: string }[];
}

export interface BrandVisualIdentityProfile {
  brandName: string;
  website?: string | null;
  matchSource?: 'name' | 'domain' | 'index' | 'none';
  logoImageUrl?: string | null;
  sampleVisuals: { title: string; url: string }[];
  logo: {
    mainLogo: string;
    logoVariations: string[];
    wordmarkLogotype: string;
    symbolsIcons: string[];
  };
  colorPalette: {
    primaryColors: BrandColorSpec[];
    secondaryAccentColors: BrandColorSpec[];
    neutrals: BrandColorSpec[];
  };
  typography: {
    fontFamilies: string[];
    hierarchy: {
      h1: string;
      h2: string;
      body: string;
    };
    usageRules: string[];
  };
  supportingVisualElements: {
    imageryStyle: string[];
    icons: string[];
    patternsTextures: string[];
    shapes: string[];
    dataVisualization: string[];
  };
  consistencyAssessment: string;
  distinctivenessAssessment: string;
  sources: { title: string; url: string }[];
}

export interface BrandColorSpec {
  name: string;
  hex: string;
  rgb?: string | null;
  cmyk?: string | null;
  pantone?: string | null;
  usage?: string | null;
}

function getAzureAI() {
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-02-15-preview";
  
  if (!apiKey || !endpoint) {
    console.warn("Missing Azure OpenAI credentials. Please set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT.");
  }

  return new AzureOpenAI({
    apiKey: apiKey || "dummy-key",
    endpoint: endpoint || "https://dummy-endpoint.openai.azure.com/",
    apiVersion: apiVersion,
    dangerouslyAllowBrowser: true // Required if calling directly from the browser
  });
}

const getDeploymentName = () => process.env.AZURE_OPENAI_DEPLOYMENT_NAME || "gpt-4o";

type RetryableDeploymentError = {
  status?: number;
  code?: string;
  message?: string;
  errno?: string;
  cause?: unknown;
};

export const STREAM_RETRY_MAX_RETRIES = 5;
const STREAM_RETRY_BASE_DELAY_MS = 500;
const STREAM_RETRY_MAX_DELAY_MS = 20_000;
const STREAM_RETRY_JITTER_RATIO = 0.2;

const normalizeDeploymentName = (value?: string): string => (value || '').trim();

export function getDeploymentCandidatesFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const candidates = [
    normalizeDeploymentName(env.AZURE_OPENAI_PRIMARY_DEPLOYMENT_NAME),
    normalizeDeploymentName(env.AZURE_OPENAI_DEPLOYMENT_NAME),
    normalizeDeploymentName(env.AZURE_OPENAI_FALLBACK_DEPLOYMENT_NAME),
    'gpt-4o',
  ].filter(Boolean);

  return Array.from(new Set(candidates));
}

export function shouldRetryWithAlternateDeployment(error: unknown): boolean {
  if (isTransientOpenAIRequestError(error)) {
    return true;
  }

  const details = error as RetryableDeploymentError | undefined;
  const status = details?.status;
  const code = (details?.code || '').toLowerCase();
  const message = (details?.message || '').toLowerCase();

  if (status === 400) {
    if (
      code === 'invalid_prompt' ||
      code === 'content_filter' ||
      message.includes('policy') ||
      message.includes('content filter') ||
      message.includes('invalid prompt')
    ) {
      return true;
    }
  }

  return false;
}

const normalizeRetryCode = (value?: string): string => (value || '').toLowerCase().trim();

function getNestedCauseMessage(error: RetryableDeploymentError | undefined): string {
  if (!error || !error.cause || typeof error.cause !== 'object') {
    return '';
  }
  const causeRecord = error.cause as { message?: string };
  return (causeRecord.message || '').toLowerCase();
}

export function isTransientOpenAIRequestError(error: unknown): boolean {
  const details = error as RetryableDeploymentError | undefined;
  const status = details?.status;

  if (status === 408 || status === 409 || status === 429 || (typeof status === 'number' && status >= 500 && status <= 599)) {
    return true;
  }

  const code = normalizeRetryCode(details?.code) || normalizeRetryCode(details?.errno);
  const message = (details?.message || '').toLowerCase();
  const causeMessage = getNestedCauseMessage(details);
  const combined = `${code} ${message} ${causeMessage}`;

  const transientSignals = [
    'stream disconnected before completion',
    'response.failed',
    'timeout',
    'timed out',
    'socket hang up',
    'network',
    'econnreset',
    'econnrefused',
    'etimedout',
    'enotfound',
    'ehostunreach',
  ];

  return transientSignals.some((signal) => combined.includes(signal));
}

export function computeRetryDelayMs(attempt: number, randomValue: number = Math.random()): number {
  const safeAttempt = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 0;
  const baseDelay = Math.min(STREAM_RETRY_BASE_DELAY_MS * (2 ** safeAttempt), STREAM_RETRY_MAX_DELAY_MS);
  const normalizedRandom = Math.min(1, Math.max(0, randomValue));
  const jitterMultiplier = 1 + ((normalizedRandom * 2) - 1) * STREAM_RETRY_JITTER_RATIO;
  const jitteredDelay = Math.round(baseDelay * jitterMultiplier);
  return Math.max(0, Math.min(STREAM_RETRY_MAX_DELAY_MS, jitteredDelay));
}

async function waitForRetryDelay(delayMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

function getOrderedDeployments(modelTier: ModelTier): string[] {
  const initialDeployment = getDeploymentName();
  const deployments = getDeploymentCandidatesFromEnv();
  const coreDeployment = normalizeDeploymentName(process.env.AZURE_OPENAI_CORE_DEPLOYMENT_NAME);

  if (modelTier === 'core') {
    return Array.from(
      new Set([
        coreDeployment,
        normalizeDeploymentName(process.env.AZURE_OPENAI_PRIMARY_DEPLOYMENT_NAME),
        initialDeployment,
        ...deployments,
      ].map((value) => value.trim()).filter(Boolean))
    );
  }

  return Array.from(
    new Set([
      initialDeployment,
      ...deployments,
    ].map((value) => value.trim()).filter(Boolean))
  );
}

async function createChatCompletionWithFallback(
  requestParams: Omit<ChatCompletionCreateParamsNonStreaming, 'model'>,
  modelTier: ModelTier = 'default'
): Promise<ChatCompletion> {
  const client = getAzureAI();
  const orderedDeployments = getOrderedDeployments(modelTier);
  const initialDeployment = orderedDeployments[0] || getDeploymentName();

  let lastError: unknown;

  for (let attempt = 0; attempt <= STREAM_RETRY_MAX_RETRIES; attempt += 1) {
    let sawRetryableError = false;

    for (let index = 0; index < orderedDeployments.length; index += 1) {
      const deployment = orderedDeployments[index];
      const hasAnotherDeployment = index < orderedDeployments.length - 1;

      try {
        const response = await client.chat.completions.create({
          ...requestParams,
          model: deployment,
        });

        if (deployment !== initialDeployment) {
          console.warn('[azure-openai] Recovered by switching deployment:', {
            from: initialDeployment,
            to: deployment,
            attempt: attempt + 1,
          });
        }

        return response;
      } catch (error) {
        lastError = error;
        const retryable = shouldRetryWithAlternateDeployment(error);
        sawRetryableError = sawRetryableError || retryable;

        console.error('[azure-openai] Deployment call failed:', {
          deployment,
          attempt: attempt + 1,
          maxAttempts: STREAM_RETRY_MAX_RETRIES + 1,
          status: (error as RetryableDeploymentError)?.status,
          code: (error as RetryableDeploymentError)?.code,
          message: (error as RetryableDeploymentError)?.message,
          retryable,
          hasAnotherDeployment,
        });

        if (!retryable) {
          throw error;
        }

        if (hasAnotherDeployment) {
          console.log('[azure-openai] Retrying on alternate deployment within same attempt.', {
            failedDeployment: deployment,
            nextDeployment: orderedDeployments[index + 1],
            attempt: attempt + 1,
          });
          continue;
        }
      }
    }

    if (!sawRetryableError || attempt >= STREAM_RETRY_MAX_RETRIES) {
      break;
    }

    const delayMs = computeRetryDelayMs(attempt);
    console.log('[azure-openai] Retrying request after transient failure.', {
      attempt: attempt + 1,
      nextAttempt: attempt + 2,
      delayMs,
      maxAttempts: STREAM_RETRY_MAX_RETRIES + 1,
    });
    await waitForRetryDelay(delayMs);
  }

  throw lastError instanceof Error ? lastError : new Error('Azure OpenAI call failed for all deployments.');
}

// Zod schemas for structured outputs
const DeepDiveRealWorldExampleSchema = z.object({
  text: z.string(),
  sourceTitle: z.string().nullable(),
  sourceUrl: z.string().nullable(),
});

const DeepDiveReportSchema = z.object({
  originationDate: z.string(),
  relevance: z.string(),
  expandedContext: z.string(),
  strategicImplications: z.array(z.string()),
  realWorldExamples: z.array(DeepDiveRealWorldExampleSchema),
  sources: z.array(z.object({
    title: z.string(),
    url: z.string()
  }))
});

const BrandColorSpecSchema = z.object({
  name: z.string(),
  hex: z.string(),
  rgb: z.string().nullable(),
  cmyk: z.string().nullable(),
  pantone: z.string().nullable(),
  usage: z.string().nullable(),
});

const BrandDeepDiveReportSchema = z.object({
  analysisObjective: z.string(),
  ecosystemMethod: z.string(),
  brandProfiles: z.array(
    z.object({
      brandName: z.string(),
      website: z.string().nullable(),
      logoImageUrl: z.string().nullable(),
      sampleVisuals: z.array(
        z.object({
          title: z.string(),
          url: z.string(),
        })
      ),
      logo: z.object({
        mainLogo: z.string(),
        logoVariations: z.array(z.string()),
        wordmarkLogotype: z.string(),
        symbolsIcons: z.array(z.string()),
      }),
      colorPalette: z.object({
        primaryColors: z.array(BrandColorSpecSchema),
        secondaryAccentColors: z.array(BrandColorSpecSchema),
        neutrals: z.array(BrandColorSpecSchema),
      }),
      typography: z.object({
        fontFamilies: z.array(z.string()),
        hierarchy: z.object({
          h1: z.string(),
          h2: z.string(),
          body: z.string(),
        }),
        usageRules: z.array(z.string()),
      }),
      supportingVisualElements: z.object({
        imageryStyle: z.array(z.string()),
        icons: z.array(z.string()),
        patternsTextures: z.array(z.string()),
        shapes: z.array(z.string()),
        dataVisualization: z.array(z.string()),
      }),
      consistencyAssessment: z.string(),
      distinctivenessAssessment: z.string(),
      sources: z.array(
        z.object({
          title: z.string(),
          url: z.string(),
        })
      ),
    })
  ),
  crossBrandReadout: z.array(z.string()),
  strategicRecommendations: z.array(z.string()),
  sources: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
    })
  ),
});

const BrandDeepDiveFallbackSchema = z.object({
  analysisObjective: z.string().nullable(),
  ecosystemMethod: z.string().nullable(),
  brandProfiles: z.array(
    z.object({
      brandName: z.string().nullable(),
      website: z.string().nullable(),
      logoImageUrl: z.string().nullable(),
      sampleVisuals: z.array(z.object({ title: z.string(), url: z.string() })).nullable(),
      logo: z.object({
        mainLogo: z.string().nullable(),
        logoVariations: z.array(z.string()).nullable(),
        wordmarkLogotype: z.string().nullable(),
        symbolsIcons: z.array(z.string()).nullable(),
      }).nullable(),
      colorPalette: z.object({
        primaryColors: z.array(BrandColorSpecSchema).nullable(),
        secondaryAccentColors: z.array(BrandColorSpecSchema).nullable(),
        neutrals: z.array(BrandColorSpecSchema).nullable(),
      }).nullable(),
      typography: z.object({
        fontFamilies: z.array(z.string()).nullable(),
        hierarchy: z.object({
          h1: z.string().nullable(),
          h2: z.string().nullable(),
          body: z.string().nullable(),
        }).nullable(),
        usageRules: z.array(z.string()).nullable(),
      }).nullable(),
      supportingVisualElements: z.object({
        imageryStyle: z.array(z.string()).nullable(),
        icons: z.array(z.string()).nullable(),
        patternsTextures: z.array(z.string()).nullable(),
        shapes: z.array(z.string()).nullable(),
        dataVisualization: z.array(z.string()).nullable(),
      }).nullable(),
      consistencyAssessment: z.string().nullable(),
      distinctivenessAssessment: z.string().nullable(),
      sources: z.array(z.object({ title: z.string(), url: z.string() })).nullable(),
    })
  ).nullable(),
  crossBrandReadout: z.array(z.string()).nullable(),
  strategicRecommendations: z.array(z.string()).nullable(),
  sources: z.array(z.object({ title: z.string(), url: z.string() })).nullable(),
});

const RESEARCH_ACCURACY_PROTOCOL = `
Accuracy protocol (must follow):
- Prioritize high-credibility sources: first-party brand properties, reputable industry publishers, recognized research institutions.
- Use the most recent evidence available (favor 2024-2026) and avoid stale claims unless historically relevant.
- Do not fabricate sources, URLs, dates, statistics, or examples.
- If confidence is low, state uncertainty explicitly and keep language conservative.
- Ensure every strategic claim is grounded in observable signals from reliable sources.
`;

const UNCERTAINTY_PROTOCOL = `
Uncertainty protocol (must follow):
- Explicitly distinguish known data, inferred patterns, and speculative trends.
- Use labels in narrative fields where appropriate: [KNOWN], [INFERRED], [SPECULATIVE].
- Do not present speculative statements as verified facts.
`;

const BRAND_UNCERTAINTY_PROTOCOL = `
Uncertainty protocol (must follow):
- Explicitly distinguish known data, inferred patterns, and speculative trends.
- Do not present speculative statements as verified facts.
`;

const ANALOGICAL_REASONING_PROTOCOL = `
Analogical reasoning protocol:
- Connect present signals to at least one historical or cross-industry parallel.
- Explain why the analogy is relevant and where it breaks.
`;

type SessionMode = 'cultural' | 'brand' | 'matrix-qa' | 'brand-qa';
type OutputType = 'json-metadata' | 'analysis' | 'creative';
type ModelTier = 'default' | 'core';

function getApiBaseUrl(): string {
  const configured = (((import.meta as any).env?.VITE_API_BASE_URL as string) || '').trim();
  if (configured) {
    const sanitized = sanitizeApiBaseUrl(configured);
    console.log('[azure-openai] Resolved API base URL.', { configured, sanitized });
    return sanitized;
  }

  // In browsers, default to same-origin so deployments do not accidentally call localhost.
  if (typeof window !== 'undefined') {
    return '';
  }

  // In non-browser runtimes, keep localhost fallback for local server-side workflows.
  return 'http://localhost:3001';
}

function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const baseUrl = getApiBaseUrl();

  if (baseUrl) {
    return new URL(normalizedPath, baseUrl).toString();
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return new URL(normalizedPath, window.location.origin).toString();
  }

  return new URL(normalizedPath, 'http://localhost:3001').toString();
}

const sessionResearchBrief = new Map<SessionMode, string>();

const SubQueryPlanSchema = z.object({
  queries: z.array(z.string()).min(4).max(5),
});

const EvidenceItemSchema = z.object({
  query: z.string(),
  title: z.string(),
  url: z.string(),
  publishedAt: z.string().nullable(),
  summary: z.string(),
  sourceType: z.enum(['authoritative', 'mainstream', 'behavioral', 'community', 'unknown']),
});

const EvidenceBundleSchema = z.object({
  evidence: z.array(EvidenceItemSchema),
});

const DevilsAdvocateSchema = z.object({
  counterArgument: z.string(),
  keyWeaknesses: z.array(z.string()),
  consolidatedSummary: z.string().describe('A concise, display-ready summary of the highest-impact counterpoint and risks (target 1-2 sentences, <=220 characters when possible).'),
});

const QUARTERLY_MACRO_SUMMARY: Record<string, string> = {
  Q1: 'Planning cycles reset after year-end, budget certainty improves, and consumers often rebalance spending after holiday peaks.',
  Q2: 'Execution pressure increases as teams operationalize annual plans, with stronger focus on conversion efficiency and channel performance.',
  Q3: 'Late-year strategy shaping begins; brand teams test narratives and differentiation before peak seasonal competition.',
  Q4: 'Peak commercial intensity compresses attention and pricing dynamics; signal velocity rises while noise and promotional distortion increase.',
};

const AUTHORITATIVE_DOMAIN_PATTERNS = [
  /\.(gov|edu)(\.|$)/i,
  /statista\.com$/i,
  /mckinsey\.com$/i,
  /deloitte\.com$/i,
  /gartner\.com$/i,
  /forrester\.com$/i,
  /nielsen\.com$/i,
  /kantar\.com$/i,
  /adweek\.com$/i,
  /wsj\.com$/i,
  /ft\.com$/i,
  /reuters\.com$/i,
  /bloomberg\.com$/i,
  /sec\.gov$/i,
  /seekingalpha\.com$/i,
  /thedrum\.com$/i,
  /campaignlive\.com$/i,
  /prweek\.com$/i,
  /g2\.com$/i,
  /capterra\.com$/i,
];

type ValidatedNewsItem = {
  headline: string;
  url: string;
  publishedAt?: string | null;
  outlet?: string | null;
};

const deriveHeadlineFromUrl = (url?: string | null): string => {
  const safeUrl = normalizeExternalHttpUrl(url);
  if (!safeUrl) return '';
  try {
    const parsed = new URL(safeUrl);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const lastSegment = segments[segments.length - 1] || '';
    if (!lastSegment) return '';
    const withoutExtension = lastSegment.replace(/\.(html?|php|aspx?)$/i, '');
    const cleaned = decodeURIComponent(withoutExtension)
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return '';
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  } catch {
    return '';
  }
};

const normalizeIsoDate = (value?: string | null): string | null => {
  const trimmed = (value || '').trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const normalizeBrandLookupKey = (value?: string | null): string =>
  (value || '').trim().toLowerCase();

const isMissingBrandMissionValue = (value?: string | null): boolean => {
  const normalized = (value || '').trim().toLowerCase();
  return normalized.length === 0 || normalized === 'n/a' || normalized === 'na' || normalized === 'data unavailable';
};

const extractDomainHint = (website?: string | null): string => {
  const normalized = normalizeExternalHttpUrl(website || '');
  if (!normalized) return '';
  try {
    return new URL(normalized).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
};

const firstSentence = (value?: string | null): string => {
  const trimmed = (value || '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^(.{1,280}?[.!?])(?:\s|$)/);
  return (match?.[1] || trimmed).trim();
};

export function applyBrandMissionFallbacks(
  report: BrandResearchMatrix,
  websiteTargets: BrandWebsiteAnchor[] = []
): BrandResearchMatrix {
  const websiteByBrand = new Map<string, string>();
  websiteTargets.forEach((item) => {
    const key = normalizeBrandLookupKey(item.brand);
    if (!key) return;
    const website = (item.website || '').trim();
    if (!websiteByBrand.has(key) && website) {
      websiteByBrand.set(key, website);
    }
  });

  return {
    ...report,
    results: (report.results || []).map((brandResult) => {
      if (!isMissingBrandMissionValue(brandResult.brandMission)) {
        return brandResult;
      }

      const key = normalizeBrandLookupKey(brandResult.brandName);
      const domainHint = extractDomainHint(websiteByBrand.get(key));
      const candidateBase =
        firstSentence(brandResult.brandPositioning?.valueProposition)
        || firstSentence(brandResult.highLevelSummary)
        || firstSentence(brandResult.brandPositioning?.keyMessagesAndClaims?.[0])
        || firstSentence(brandResult.keyOfferingsProductsServices?.[0]);

      const fallbackMission = candidateBase
        ? `[INFERRED] ${candidateBase}${domainHint ? ` (guided by ${domainHint})` : ''}`
        : `[INFERRED] Mission not explicitly stated; inferred from first-party brand messaging${domainHint ? ` on ${domainHint}` : ''}.`;

      return {
        ...brandResult,
        brandMission: fallbackMission,
      };
    }),
  };
}

const compareNewsByMostRecent = (a: ValidatedNewsItem, b: ValidatedNewsItem): number => {
  const aTime = normalizeIsoDate(a.publishedAt) ? new Date(normalizeIsoDate(a.publishedAt)!).getTime() : 0;
  const bTime = normalizeIsoDate(b.publishedAt) ? new Date(normalizeIsoDate(b.publishedAt)!).getTime() : 0;
  return bTime - aTime;
};

const isWithinLastSixMonths = (value?: string | null): boolean => {
  const normalized = normalizeIsoDate(value);
  if (!normalized) return false;
  const publishedTime = new Date(normalized).getTime();
  if (Number.isNaN(publishedTime)) return false;

  const now = Date.now();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  return publishedTime >= sixMonthsAgo.getTime() && publishedTime <= now;
};

type RawRecentNewsCandidate =
  | string
  | {
    headline?: string | null;
    title?: string | null;
    url?: string | null;
    publishedAt?: string | null;
    outlet?: string | null;
  };

const NEWS_MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/i;
const NEWS_URL_PATTERN = /(https?:\/\/[^\s)]+|www\.[^\s)]+)/i;
const EVIDENCE_URL_PATTERN = /(https?:\/\/[^\s|)]+|www\.[^\s|)]+)/gi;

export function extractUrlsFromEvidenceDigest(evidenceDigest: string): string[] {
  const matches = evidenceDigest.match(EVIDENCE_URL_PATTERN) || [];
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const match of matches) {
    const normalized = normalizeExternalHttpUrl(match);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(normalized);
  }

  return deduped;
}

const normalizeRawRecentNewsCandidate = (candidate: RawRecentNewsCandidate): {
  headline?: string;
  url?: string;
  publishedAt?: string | null;
  outlet?: string | null;
} => {
  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (!trimmed) return {};

    const markdownMatch = trimmed.match(NEWS_MARKDOWN_LINK_PATTERN);
    if (markdownMatch) {
      return {
        headline: (markdownMatch[1] || '').trim(),
        url: normalizeExternalHttpUrl(markdownMatch[2]) || undefined,
      };
    }

    const urlMatch = trimmed.match(NEWS_URL_PATTERN);
    if (urlMatch) {
      const rawUrl = urlMatch[1];
      const headline = trimmed.replace(rawUrl, '').trim().replace(/^[-:|•\s]+/, '');
      return {
        headline: headline || 'Article',
        url: normalizeExternalHttpUrl(rawUrl) || undefined,
      };
    }

    return { headline: trimmed };
  }

  const normalizedUrl = normalizeExternalHttpUrl(candidate.url || undefined) || undefined;
  const normalizedHeadline = ((candidate.headline || candidate.title || '') || '').trim();
  const inferredHeadline = normalizedHeadline || deriveHeadlineFromUrl(normalizedUrl);

  return {
    headline: inferredHeadline || undefined,
    url: normalizedUrl,
    publishedAt: candidate.publishedAt || null,
    outlet: (candidate.outlet || '').trim() || null,
  };
};

const SOURCE_TITLE_BLOCKLIST = /^(source|sources|reference|references|citation|citations|link|links)\b/i;

export function deriveRecentNewsFromSources(
  sources: Array<{ title?: string | null; url?: string | null }> | undefined,
  limit = 6
): ValidatedNewsItem[] {
  const items: ValidatedNewsItem[] = [];
  const seen = new Set<string>();

  for (const source of sources || []) {
    const normalizedUrl = normalizeExternalHttpUrl(source.url || undefined);
    if (!normalizedUrl || !isLikelyArticleUrl(normalizedUrl) || isSocialMediaUrl(normalizedUrl)) continue;

    const rawTitle = (source.title || '').trim();
    if (!rawTitle || SOURCE_TITLE_BLOCKLIST.test(rawTitle)) continue;

    const normalizedPublishedAt = normalizeIsoDate(rawTitle);
    const hostname = getHostname(normalizedUrl);
    const outlet = hostname ? hostname.replace(/^www\./, '') : null;
    const dedupeKey = normalizedUrl.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    items.push({
      headline: rawTitle,
      url: normalizedUrl,
      publishedAt: normalizedPublishedAt || null,
      outlet,
    });
  }

  items.sort(compareNewsByMostRecent);
  return items.slice(0, Math.max(1, limit));
}

function outputTemperature(outputType: OutputType): number {
  if (outputType === 'json-metadata') return 0.2;
  if (outputType === 'analysis') return 0.7;
  return 0.9;
}

function getDynamicContextBlock(): string {
  const now = new Date();
  const monthLabel = now.toLocaleString('en-US', { month: 'long' });
  const yearLabel = now.getFullYear();
  const month = now.getMonth() + 1;
  const quarter = month <= 3 ? 'Q1' : month <= 6 ? 'Q2' : month <= 9 ? 'Q3' : 'Q4';
  const macro = QUARTERLY_MACRO_SUMMARY[quarter] || QUARTERLY_MACRO_SUMMARY.Q1;

  return `Dynamic context:\n- Current month/year: ${monthLabel} ${yearLabel}\n- Current quarter: ${quarter}\n- Quarterly macro environment: ${macro}`;
}

function getSessionBrief(mode: SessionMode): string {
  const brief = sessionResearchBrief.get(mode)?.trim();
  if (!brief) return 'Session Research Brief: (empty)';
  return `Session Research Brief:\n${brief}`;
}

function summarizeForBrief(payload: unknown): string {
  try {
    if (typeof payload !== 'object' || payload === null) {
      return String(payload).slice(0, 320);
    }

    const candidate = payload as any;
    if (Array.isArray(candidate.brandProfiles)) {
      const names = candidate.brandProfiles.map((p: any) => p.brandName).filter(Boolean).slice(0, 6).join(', ');
      return `Brand set analyzed: ${names || 'n/a'}. Recommendations: ${(candidate.strategicRecommendations || []).slice(0, 2).join(' | ')}`.slice(0, 500);
    }

    if (Array.isArray(candidate.moments) && Array.isArray(candidate.beliefs)) {
      return `Cultural matrix generated with ${candidate.moments.length} moments, ${candidate.beliefs.length} beliefs, and ${Array.isArray(candidate.sources) ? candidate.sources.length : 0} sources.`;
    }

    if (Array.isArray(candidate.reports)) {
      return `Deep dive batch generated for ${candidate.reports.length} insights.`;
    }

    if (typeof candidate.answer === 'string') {
      return `Answered prompt: ${candidate.answer.slice(0, 260)}`;
    }

    return JSON.stringify(candidate).slice(0, 500);
  } catch {
    return 'Summary unavailable.';
  }
}

function updateSessionBrief(mode: SessionMode, payload: unknown): void {
  const existing = sessionResearchBrief.get(mode) || '';
  const timestamp = new Date().toISOString();
  const nextLine = `- [${timestamp}] ${summarizeForBrief(payload)}`;
  const merged = `${existing}\n${nextLine}`.trim();
  sessionResearchBrief.set(mode, merged.slice(-4000));
}

function composeSystemPrompt(baseInstruction: string, mode: SessionMode): string {
  const uncertaintyProtocol = (mode === 'brand' || mode === 'brand-qa')
    ? BRAND_UNCERTAINTY_PROTOCOL
    : UNCERTAINTY_PROTOCOL;
  return [
    baseInstruction,
    RESEARCH_ACCURACY_PROTOCOL,
    uncertaintyProtocol,
    ANALOGICAL_REASONING_PROTOCOL,
    getDynamicContextBlock(),
    getSessionBrief(mode),
  ].join('\n\n');
}

function monthsOld(dateValue?: string | null): number | null {
  if (!dateValue) return null;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return null;

  const now = new Date();
  const yearDiff = now.getFullYear() - parsed.getFullYear();
  const monthDiff = now.getMonth() - parsed.getMonth();
  return yearDiff * 12 + monthDiff;
}

export function scoreEvidenceDomain(url: string): { quality: 'authoritative' | 'mainstream' | 'behavioral' | 'community' | 'unknown'; weight: number } {
  const hostname = getHostname(url);
  if (!hostname) return { quality: 'unknown', weight: 0.5 };
  if (/reddit\.com$|trustpilot\.com$|g2\.com$|capterra\.com$/i.test(hostname)) return { quality: 'behavioral', weight: 0.9 };
  if (AUTHORITATIVE_DOMAIN_PATTERNS.some((pattern) => pattern.test(hostname))) return { quality: 'authoritative', weight: 1.3 };
  if (/quora\.com$|discord\.com$|facebook\.com$|x\.com$|twitter\.com$|glassdoor\.com$/i.test(hostname)) return { quality: 'community', weight: 0.7 };
  return { quality: 'mainstream', weight: 1.0 };
}

function extractPrimaryBrandFromTopic(topic: string): string {
  const normalized = (topic || '').trim();
  if (!normalized) return 'brand';

  const brandsMatch = normalized.match(/Brands?:\s*([^;|]+)/i);
  if (brandsMatch?.[1]) {
    const primary = brandsMatch[1].split(',')[0]?.trim();
    if (primary) return primary.replace(/\([^)]*\)/g, '').trim() || 'brand';
  }

  const deepDiveMatch = normalized.match(/brand deep dive for\s+(.+?)(?:\s+\|\s+objective:|$)/i);
  if (deepDiveMatch?.[1]) {
    const primary = deepDiveMatch[1].split(',')[0]?.trim();
    if (primary) return primary.replace(/\([^)]*\)/g, '').trim() || 'brand';
  }

  const objectiveMatch = normalized.match(/objective:\s*([^|;]+)/i);
  if (objectiveMatch?.[1]) {
    const words = objectiveMatch[1].trim().split(/\s+/);
    if (words.length > 0 && words[0]) return words[0];
  }

  const fallback = normalized.split(/\s+/)[0]?.trim();
  return fallback || 'brand';
}

function extractPrimaryCorporateDomainFromTopic(topic: string): string | null {
  const normalized = (topic || '').trim();
  if (!normalized) return null;

  const urlMatch = normalized.match(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/i);
  if (urlMatch?.[1]) {
    return urlMatch[1].replace(/^www\./i, '').toLowerCase();
  }

  const bareDomainMatch = normalized.match(/\(([a-z0-9.-]+\.[a-z]{2,})\)/i);
  if (bareDomainMatch?.[1]) {
    return bareDomainMatch[1].replace(/^www\./i, '').toLowerCase();
  }

  return null;
}

function inferCorporateDomainFromBrandName(brandName: string): string | null {
  const token = (brandName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
  if (!token) return null;
  return `${token}.com`;
}

export function buildBrandModeSubQueries(topic: string): string[] {
  const safeBrand = extractPrimaryBrandFromTopic(topic);
  const primaryDomain = extractPrimaryCorporateDomainFromTopic(topic) || inferCorporateDomainFromBrandName(safeBrand);
  const domainFilter = primaryDomain ? `site:${primaryDomain}` : '';
  const guidelineQuery = [
    `"${safeBrand}"`,
    domainFilter,
    '("brand guidelines" OR "brand guideline" OR "brand identity" OR "visual identity" OR "style guide")',
  ]
    .filter(Boolean)
    .join(' ');

  return [
    guidelineQuery,
    `"${safeBrand}" (site:sec.gov OR site:seekingalpha.com OR "investor relations" OR "annual report")`,
    `"${safeBrand}" campaign OR positioning (site:adweek.com OR site:thedrum.com OR site:campaignlive.com OR site:prweek.com)`,
    `"${safeBrand}" ("CMO" OR "CEO" OR "Chief Marketing Officer") interview OR strategy`,
    `"${safeBrand}" reviews weaknesses OR complaints (site:g2.com OR site:trustpilot.com OR site:reddit.com)`,
  ];
}

export function resolveBrandEvidenceMode(
  evidenceDigest: string,
  websiteGroundingContext: string
): 'strict' | 'inferred-fallback' {
  const hasEvidenceDigest = (evidenceDigest || '').trim() !== '' && evidenceDigest !== 'Evidence digest unavailable.';
  const hasWebsiteGrounding = (websiteGroundingContext || '').trim().length > 0;
  return hasEvidenceDigest || hasWebsiteGrounding ? 'strict' : 'inferred-fallback';
}

export function buildBrandEvidenceRulesBlock(
  evidenceMode: 'strict' | 'inferred-fallback'
): string {
  return evidenceMode === 'strict'
    ? `- CRITICAL EVIDENCE RULES:
  - Prioritize the "Evidence digest" and "GROUNDING CONTEXT FROM OFFICIAL BRAND/CORPORATE WEBSITES".
  - If a specific piece of information (like mission statement, recent campaigns, strategic moat) is NOT explicitly in those sections, you may infer cautiously using pre-trained knowledge, but MUST label it with [INFERRED].
  - Do NOT fabricate precise metrics, direct quotes, or fake campaigns. If uncertain and no safe inference exists, return null or an empty array.`
    : `- EVIDENCE BACKEND STATUS: Live evidence digest is unavailable right now.
  - Use best-effort strategic analysis grounded in broadly known brand signals.
  - Label uncertain points with [INFERRED] and avoid fabricated precision.
  - Do not leave core sections empty just because the digest is unavailable.
  - Prefer directional insights over "N/A" placeholders when a reasonable inference exists.
  - Keep uncertainty explicit and conservative.`;
}

function filterAndWeightEvidence(items: z.infer<typeof EvidenceItemSchema>[]): string {
  const scored = items
    .map((item) => {
      const domainScore = scoreEvidenceDomain(item.url);
      const ageMonths = monthsOld(item.publishedAt);
      const stale12Penalty = ageMonths !== null && ageMonths > 12 ? 0.55 : 1;
      const stale18Flag = ageMonths !== null && ageMonths > 18;
      const weight = domainScore.weight * stale12Penalty;

      return {
        ...item,
        sourceType: domainScore.quality,
        weight,
        stale18Flag,
        ageMonths,
      };
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 18);

  return scored
    .map((item, idx) => {
      const staleTag = item.stale18Flag ? ' [POTENTIALLY STALE >18M]' : '';
      const dateTag = item.publishedAt ? `date=${item.publishedAt}` : 'date=unknown';
      return `${idx + 1}. (${item.sourceType}; weight=${item.weight.toFixed(2)}; ${dateTag}) ${item.title} | ${item.url}${staleTag}\n   summary: ${item.summary}`;
    })
    .join('\n');
}

async function runStructuredCall<T extends z.ZodTypeAny>(params: {
  schema: T;
  schemaName: string;
  messages: ChatCompletionMessageParam[];
  mode: SessionMode;
  outputType: OutputType;
  modelTier?: ModelTier;
  qualityGate?: (parsed: z.infer<T>) => boolean;
  maxRetries?: number;
}): Promise<z.infer<T>> {
  const maxRetries = params.maxRetries ?? STREAM_RETRY_MAX_RETRIES;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await createChatCompletionWithFallback({
        temperature: outputTemperature(params.outputType),
        messages: params.messages,
        response_format: zodResponseFormat(params.schema, params.schemaName),
      }, params.modelTier || 'default');

      const text = response.choices[0].message.content || '{}';
      const parsed = params.schema.parse(JSON.parse(text));

      const qualityDecision = evaluateQualityGateDecision(parsed, params.qualityGate, attempt, maxRetries);
      if (qualityDecision === 'retry') {
        if (attempt < maxRetries) {
          const delayMs = computeRetryDelayMs(attempt);
          console.log('[azure-openai] Structured quality gate requested retry.', {
            schemaName: params.schemaName,
            attempt: attempt + 1,
            nextAttempt: attempt + 2,
            delayMs,
            maxAttempts: maxRetries + 1,
          });
          await waitForRetryDelay(delayMs);
        }
        continue;
      }
      if (qualityDecision === 'fail') {
        lastError = new Error(
          `Structured response failed quality gate for schema "${params.schemaName}" after ${maxRetries + 1} attempt(s).`
        );
        break;
      }

      updateSessionBrief(params.mode, parsed);
      return parsed;
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) {
        break;
      }
      if (isTransientOpenAIRequestError(error)) {
        const delayMs = computeRetryDelayMs(attempt);
        console.log('[azure-openai] Structured call retrying after transient error.', {
          schemaName: params.schemaName,
          attempt: attempt + 1,
          nextAttempt: attempt + 2,
          delayMs,
          maxAttempts: maxRetries + 1,
          status: (error as RetryableDeploymentError)?.status,
          code: (error as RetryableDeploymentError)?.code,
          message: (error as RetryableDeploymentError)?.message,
        });
        await waitForRetryDelay(delayMs);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Structured call failed after retries.');
}

export function evaluateQualityGateDecision<T>(
  parsed: T,
  qualityGate: ((parsed: T) => boolean) | undefined,
  attempt: number,
  maxRetries: number
): 'accept' | 'retry' | 'fail' {
  if (!qualityGate) {
    return 'accept';
  }
  if (qualityGate(parsed)) {
    return 'accept';
  }
  if (attempt < maxRetries) {
    return 'retry';
  }
  return 'fail';
}

export function normalizeMatrixTerminology(value: string): string {
  if (!value) return '';

  return value
    .replace(/\bthe matrix\b/gi, 'the cultural analysis')
    .replace(/\bthis matrix\b/gi, 'this cultural analysis')
    .replace(/\bour matrix\b/gi, 'our cultural analysis')
    .replace(/\bmatrix\b/gi, 'cultural analysis')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function buildMatrixQuestionSearchTopic(
  question: string,
  context?: { audience?: string; brand?: string; topicFocus?: string; generations?: string[]; sourcesType?: string[] }
): string {
  const contextParts = [
    context?.audience ? `Audience: ${context.audience}` : '',
    context?.brand ? `Brand: ${context.brand}` : '',
    context?.topicFocus ? `Topic Focus: ${context.topicFocus}` : '',
    context?.generations && context.generations.length > 0 ? `Generations: ${context.generations.join(', ')}` : '',
    context?.sourcesType && context.sourcesType.length > 0 ? `Source Emphasis: ${context.sourcesType.join(', ')}` : '',
  ].filter(Boolean);

  return `${contextParts.join(' | ')} | Question: ${question}`.trim();
}

export function buildBrandDeepDiveQuestionSearchTopic(
  question: string,
  context?: { brands?: string[]; analysisObjective?: string; targetAudience?: string; timeHorizon?: string }
): string {
  const contextParts = [
    context?.brands && context.brands.length > 0 ? `Brands: ${context.brands.join(', ')}` : '',
    context?.analysisObjective ? `Objective: ${context.analysisObjective}` : '',
    context?.targetAudience ? `Audience: ${context.targetAudience}` : '',
    context?.timeHorizon ? `Time Horizon: ${context.timeHorizon}` : '',
  ].filter(Boolean);

  return `${contextParts.join(' | ')} | Question: ${question}`.trim();
}

async function createTargetedSubQueries(topic: string, mode: SessionMode): Promise<string[]> {
  const normalizedTopic = topic.trim();
  const prependPrimaryQuery = (queries: string[]): string[] => {
    const merged = [normalizedTopic, ...queries]
      .map((query) => query.trim())
      .filter(Boolean);
    return Array.from(new Set(merged)).slice(0, 5);
  };

  if (mode === 'brand') {
    const finalQueries = buildBrandModeSubQueries(topic);
    console.log('[brand-research] Using hardcoded strategic sub-queries', { topic, queries: finalQueries });
    return prependPrimaryQuery(finalQueries);
  }

  const plan = await runStructuredCall({
    schema: SubQueryPlanSchema,
    schemaName: 'sub_query_plan',
    mode,
    outputType: 'json-metadata',
    messages: [
      {
        role: 'system',
        content: composeSystemPrompt('Generate 4-5 targeted sub-queries for multi-angle evidence gathering.', mode),
      },
      {
        role: 'user',
        content: `Topic:\n${topic}\n\nReturn 4-5 concise sub-queries that cover macro context, consumer behavior, category competitors, and weak signals.`,
      },
    ],
  });

  return prependPrimaryQuery(plan.queries);
}

type EvidenceIntent = 'general' | 'behaviors';

async function gatherEvidenceForTopic(topic: string, mode: SessionMode, intent: EvidenceIntent = 'general'): Promise<string> {
  const queries = await createTargetedSubQueries(topic, mode);
  if (!queries.length) return 'Evidence digest unavailable.';

  // Fetch real backend search results in parallel; do not ask the model to invent URLs.
  const searchErrors: string[] = [];
  const searchPromises = queries.map(async (query) => {
    try {
      const searchUrl = new URL(buildApiUrl('/api/search'));
      searchUrl.searchParams.set('q', query);
      searchUrl.searchParams.set('provider', 'google');
      if (intent === 'behaviors') {
        searchUrl.searchParams.set('mode', 'behaviors');
      }
      const res = await fetch(searchUrl.toString());
      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          const payload = await res.json();
          message = payload?.error || payload?.message || message;
        } catch {
          try {
            const text = await res.text();
            message = text || message;
          } catch {
            // keep fallback message
          }
        }
        const compact = `[search:${mode}] ${query} -> ${message}`;
        searchErrors.push(compact);
        console.warn('[evidence] Search request failed', { mode, query, status: res.status, message });
        return '';
      }
      const data = await res.json();
      return `Query: ${query}\nResults:\n${data.context}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown search fetch error';
      const compact = `[search:${mode}] ${query} -> ${message}`;
      searchErrors.push(compact);
      console.warn('[evidence] Search request threw', { mode, query, message });
      return '';
    }
  });

  const searchResults = await Promise.all(searchPromises);
  const digest = searchResults.filter(Boolean).join('\n\n');
  if (!digest && searchErrors.length > 0) {
    console.warn('[evidence] Evidence digest unavailable after search failures.', {
      mode,
      failureCount: searchErrors.length,
      failures: searchErrors.slice(0, 3),
    });
  }

  return digest ? digest.slice(0, 15000) : 'Evidence digest unavailable.';
}

function isThinStructuredPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return true;
  const candidate = payload as any;

  if (Array.isArray(candidate.brandProfiles)) {
    const recommendationCount = (candidate.strategicRecommendations || []).length;
    const profileDepth = candidate.brandProfiles.reduce((sum: number, profile: any) => {
      const score =
        (profile?.sampleVisuals?.length || 0) +
        (profile?.colorPalette?.primaryColors?.length || 0) +
        (profile?.typography?.usageRules?.length || 0);
      return sum + score;
    }, 0);
    return candidate.brandProfiles.length === 0 || recommendationCount < 2 || profileDepth < 4;
  }

  if (Array.isArray(candidate.moments)) {
    const categories = [candidate.moments, candidate.beliefs, candidate.tone, candidate.language, candidate.behaviors, candidate.contradictions, candidate.community, candidate.influencers];
    return categories.some((arr) => !Array.isArray(arr) || arr.length < 4);
  }

  if (typeof candidate.answer === 'string') {
    return candidate.answer.trim().length < 60;
  }

  return false;
}

async function runDevilsAdvocatePass(topic: string, draft: unknown, mode: SessionMode): Promise<z.infer<typeof DevilsAdvocateSchema>> {
  return runStructuredCall({
    schema: DevilsAdvocateSchema,
    schemaName: 'devils_advocate',
    mode,
    outputType: 'analysis',
    modelTier: 'core',
    messages: [
      {
        role: 'system',
        content: composeSystemPrompt('Steelman the opposing interpretation and identify weaknesses in the analysis.', mode),
      },
      {
        role: 'user',
        content: `Topic:\n${topic}\n\nDraft analysis:\n${JSON.stringify(draft).slice(0, 12000)}\n\nReturn:
- counterArgument: a full steelman counter-argument.
- keyWeaknesses: the most important weaknesses.
- consolidatedSummary: a concise, display-ready summary of the strongest counterpoint + top risks (target 1-2 sentences and <=220 characters when possible).`,
      },
    ],
  });
}

export function formatDevilsAdvocateLens(devil: z.infer<typeof DevilsAdvocateSchema>): string {
  const consolidated = devil.consolidatedSummary?.replace(/\s+/g, ' ').trim();
  if (consolidated) return consolidated;

  const normalizedCounter = devil.counterArgument?.replace(/\s+/g, ' ').trim();
  if (normalizedCounter) return normalizedCounter;

  return 'Alternative interpretation not available.';
}

function compactDisplayLine(value: string, maxChars: number): string {
  const normalized = (value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';

  const safeMaxChars = Math.max(40, maxChars);
  if (normalized.length <= safeMaxChars) return normalized;

  const sentenceBreak = normalized.slice(0, safeMaxChars).match(/^(.+?[.!?])(?:\s|$)/);
  if (sentenceBreak?.[1]) return sentenceBreak[1].trim();

  return `${normalized.slice(0, safeMaxChars - 3).trim()}...`;
}

function summarizeDevilsAdvocateLens(devil: z.infer<typeof DevilsAdvocateSchema>, maxChars = 160): string {
  return compactDisplayLine(formatDevilsAdvocateLens(devil), maxChars);
}

export function buildDeepDiveDevilsAdvocateImplications(devil: z.infer<typeof DevilsAdvocateSchema>): string[] {
  const devilSummary = summarizeDevilsAdvocateLens(devil, 220);
  const weaknessLines = (devil.keyWeaknesses || [])
    .map((item) => compactDisplayLine(item, 170))
    .filter(Boolean)
    .slice(0, 2)
    .map((item) => `[SPECULATIVE] Risk check: ${item}`);

  return [
    `[INFERRED] Devil's advocate: ${devilSummary || 'Alternative interpretation not available.'}`,
    ...weaknessLines,
  ];
}

function buildDevilsAdvocateBackgroundWriteup(devil: z.infer<typeof DevilsAdvocateSchema>): string {
  const summary = summarizeDevilsAdvocateLens(devil);
  const weaknesses = (devil.keyWeaknesses || [])
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const primaryWeakness = weaknesses[0] || '';
  if (summary && primaryWeakness) return `Counterpoint: ${summary}\nRisk check: ${primaryWeakness}`;
  if (summary) return `Counterpoint: ${summary}`;
  if (primaryWeakness) return `Risk check: ${primaryWeakness}`;
  return 'Counterpoint unavailable.';
}

function normalizeHttpsUrl(rawUrl?: string | null): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    if (!parsed.hostname || !parsed.hostname.includes('.')) return null;
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function sanitizeSources(sources?: { title: string; url: string }[] | null): { title: string; url: string }[] {
  const seen = new Set<string>();
  return (sources || [])
    .map((source) => {
      const url = normalizeHttpsUrl(source.url);
      if (!url) return null;
      const title = (source.title || '').trim() || 'Untitled source';
      return { title, url };
    })
    .filter((source): source is { title: string; url: string } => Boolean(source))
    .filter((source) => {
      if (seen.has(source.url)) return false;
      seen.add(source.url);
      return true;
    });
}

function sanitizeSourcesWithAllowlist(
  sources: { title: string; url: string }[] | null | undefined,
  allowedEvidenceUrls: string[]
): { title: string; url: string }[] {
  const sanitized = sanitizeSources(sources);
  const allowlist = new Set(
    (allowedEvidenceUrls || [])
      .map((item) => normalizeExternalHttpUrl(item))
      .filter((item): item is string => Boolean(item))
      .map((item) => item.toLowerCase())
  );

  if (!allowlist.size) return [];

  return sanitized.filter((source) => allowlist.has(source.url.toLowerCase()));
}

function sanitizeDeepDiveRealWorldExamples(
  examples?: Array<DeepDiveRealWorldExample | string> | null
): DeepDiveRealWorldExample[] {
  const sanitizedExamples = (examples || [])
    .map((example) => {
      if (typeof example === 'string') {
        const text = example.trim();
        if (!text) return null;
        const inlineSourceUrl = extractUrlsFromEvidenceDigest(text)[0] || null;
        const sourceUrl = inlineSourceUrl ? normalizeExternalHttpUrl(inlineSourceUrl) : null;
        return {
          text,
          sourceTitle: sourceUrl ? deriveHeadlineFromUrl(sourceUrl) : null,
          sourceUrl: sourceUrl || null,
        };
      }

      const text = (example?.text || '').trim();
      if (!text) return null;
      const sourceUrl = normalizeExternalHttpUrl(example?.sourceUrl || undefined) || null;
      const sourceTitle = sourceUrl
        ? ((example?.sourceTitle || '').trim() || deriveHeadlineFromUrl(sourceUrl))
        : null;

      return {
        text,
        sourceTitle,
        sourceUrl,
      };
    })
    .filter(Boolean);

  return sanitizedExamples as DeepDiveRealWorldExample[];
}

function sanitizeDeepDiveReport(report: DeepDiveReport): DeepDiveReport {
  return {
    ...report,
    sources: sanitizeSources(report.sources),
    strategicImplications: (report.strategicImplications || []).map((item) => item.trim()).filter(Boolean),
    realWorldExamples: sanitizeDeepDiveRealWorldExamples(report.realWorldExamples),
  };
}

function isValidHexColor(value?: string | null): boolean {
  if (!value) return false;
  return /^#?[0-9a-fA-F]{3}$|^#?[0-9a-fA-F]{6}$|^#?[0-9a-fA-F]{8}$/.test(value.trim());
}

function normalizeHexColor(value?: string | null): string | null {
  if (!isValidHexColor(value)) return null;
  const trimmed = value!.trim().replace('#', '').toUpperCase();
  if (trimmed.length === 3) {
    return `#${trimmed
      .split('')
      .map((char) => `${char}${char}`)
      .join('')}`;
  }

  if (trimmed.length === 8) {
    return `#${trimmed.slice(0, 6)}`;
  }

  return `#${trimmed}`;
}

function hexToRgb(value: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeHexColor(value);
  if (!normalized) return null;
  const raw = normalized.replace('#', '');
  if (raw.length !== 6) return null;
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  if ([r, g, b].some((channel) => Number.isNaN(channel))) return null;
  return { r, g, b };
}

function colorDistance(a: string, b: string): number {
  const aRgb = hexToRgb(a);
  const bRgb = hexToRgb(b);
  if (!aRgb || !bRgb) return Number.POSITIVE_INFINITY;
  const dr = aRgb.r - bRgb.r;
  const dg = aRgb.g - bRgb.g;
  const db = aRgb.b - bRgb.b;
  return Math.sqrt((dr * dr) + (dg * dg) + (db * db));
}

function isOfficialSourceForWebsite(sourceUrl?: string | null, websiteUrl?: string | null): boolean {
  const sourceHost = getHostname(sourceUrl);
  const websiteHost = getHostname(websiteUrl);
  if (!sourceHost || !websiteHost) return false;
  return sourceHost === websiteHost || sourceHost.endsWith(`.${websiteHost}`) || websiteHost.endsWith(`.${sourceHost}`);
}

function sanitizeBrandDeepDiveReport(report: BrandDeepDiveReport): BrandDeepDiveReport {
  const stripLabels = (text: string): string =>
    text
      .replace(/\[(KNOWN)\]\s*/gi, '')
      .replace(/\b(KNOWN)\b\s*[:\-]?\s*/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  const ensureInferredLabel = (text: string): string => {
    const trimmed = stripLabels(text);
    if (!trimmed) return trimmed;
    if (/\[(INFERRED|INFERED)\]/i.test(trimmed)) return trimmed;
    return `[INFERRED] ${trimmed}`;
  };
  const stripListLabels = (items: string[]): string[] => items.map(stripLabels);

  return {
    ...report,
    analysisObjective: stripLabels(report.analysisObjective || ''),
    ecosystemMethod: stripLabels(report.ecosystemMethod || ''),
    crossBrandReadout: stripListLabels(report.crossBrandReadout || []),
    strategicRecommendations: stripListLabels(report.strategicRecommendations || []),
    sources: sanitizeSources(report.sources),
    brandProfiles: (report.brandProfiles || []).map((profile) => {
      const normalizedWebsite = normalizeHttpsUrl(profile.website) || profile.website || null;
      const profileSources = sanitizeSources(profile.sources);
      const hasOfficialBrandSource = profileSources.some((source) =>
        isOfficialSourceForWebsite(source.url, normalizedWebsite)
      );

      const sanitizeColors = (
        colors: BrandColorSpec[] = [],
        options?: { max?: number; minDistance?: number }
      ): BrandColorSpec[] => {
        const normalized = colors
          .map((color) => {
            const hex = normalizeHexColor(color.hex);
            if (!hex) return null;
            return {
              ...color,
              name: (color.name || 'Color').trim(),
              hex,
            };
          })
          .filter((color): color is BrandColorSpec => Boolean(color));

        const dedupedByHex = Array.from(
          new Map(normalized.map((color) => [color.hex, color])).values()
        );

        const distanceThreshold = Math.max(0, Number(options?.minDistance || 0));
        const similarityFiltered = distanceThreshold > 0
          ? dedupedByHex.filter((color, index, all) => {
              const hasEarlierSimilar = all.slice(0, index).some((existing) => colorDistance(existing.hex, color.hex) < distanceThreshold);
              return !hasEarlierSimilar;
            })
          : dedupedByHex;

        const max = Math.max(1, Number(options?.max || similarityFiltered.length));
        return similarityFiltered.slice(0, max);
      };

      const verifiedPrimaryColors = sanitizeColors(profile.colorPalette?.primaryColors || [], { max: 5, minDistance: 18 });
      const verifiedAccentColors = sanitizeColors(profile.colorPalette?.secondaryAccentColors || [], { max: 3, minDistance: 28 });
      const verifiedNeutrals = sanitizeColors(profile.colorPalette?.neutrals || [], { max: 5, minDistance: 12 });

      const consistencyAssessment = (profile.consistencyAssessment || 'Not provided').trim();
      const verificationSuffix = '[INFERRED] Color values were not fully verifiable from official same-domain sources and should be treated as directional/estimated.';
      const hasAnyColorData =
        verifiedPrimaryColors.length > 0 || verifiedAccentColors.length > 0 || verifiedNeutrals.length > 0;
      const shouldMarkInferred = !hasOfficialBrandSource;

      return {
        ...profile,
        website: normalizedWebsite,
        logoImageUrl: (() => {
          const candidate = normalizeHttpsUrl(profile.logoImageUrl) || null;
          if (!candidate) return null;
          return isOfficialSourceForWebsite(candidate, normalizedWebsite) ? candidate : null;
        })(),
        sampleVisuals: (profile.sampleVisuals || [])
          .map((visual) => {
            const url = normalizeHttpsUrl(visual.url);
            if (!url) return null;
            return { title: (visual.title || 'Visual').trim(), url };
          })
          .filter((visual): visual is { title: string; url: string } => Boolean(visual)),
        logo: {
          mainLogo: shouldMarkInferred ? ensureInferredLabel(profile.logo?.mainLogo || '') : stripLabels(profile.logo?.mainLogo || ''),
          wordmarkLogotype: shouldMarkInferred ? ensureInferredLabel(profile.logo?.wordmarkLogotype || '') : stripLabels(profile.logo?.wordmarkLogotype || ''),
          logoVariations: shouldMarkInferred
            ? (profile.logo?.logoVariations || []).map((item) => ensureInferredLabel(item))
            : stripListLabels(profile.logo?.logoVariations || []),
          symbolsIcons: shouldMarkInferred
            ? (profile.logo?.symbolsIcons || []).map((item) => ensureInferredLabel(item))
            : stripListLabels(profile.logo?.symbolsIcons || []),
        },
        typography: {
          fontFamilies: shouldMarkInferred
            ? (profile.typography?.fontFamilies || []).map((item) => ensureInferredLabel(item))
            : stripListLabels(profile.typography?.fontFamilies || []),
          hierarchy: {
            h1: shouldMarkInferred ? ensureInferredLabel(profile.typography?.hierarchy?.h1 || '') : stripLabels(profile.typography?.hierarchy?.h1 || ''),
            h2: shouldMarkInferred ? ensureInferredLabel(profile.typography?.hierarchy?.h2 || '') : stripLabels(profile.typography?.hierarchy?.h2 || ''),
            body: shouldMarkInferred ? ensureInferredLabel(profile.typography?.hierarchy?.body || '') : stripLabels(profile.typography?.hierarchy?.body || ''),
          },
          usageRules: shouldMarkInferred
            ? (profile.typography?.usageRules || []).map((item) => ensureInferredLabel(item))
            : stripListLabels(profile.typography?.usageRules || []),
        },
        supportingVisualElements: {
          imageryStyle: shouldMarkInferred
            ? (profile.supportingVisualElements?.imageryStyle || []).map((item) => ensureInferredLabel(item))
            : stripListLabels(profile.supportingVisualElements?.imageryStyle || []),
          icons: shouldMarkInferred
            ? (profile.supportingVisualElements?.icons || []).map((item) => ensureInferredLabel(item))
            : stripListLabels(profile.supportingVisualElements?.icons || []),
          patternsTextures: shouldMarkInferred
            ? (profile.supportingVisualElements?.patternsTextures || []).map((item) => ensureInferredLabel(item))
            : stripListLabels(profile.supportingVisualElements?.patternsTextures || []),
          shapes: shouldMarkInferred
            ? (profile.supportingVisualElements?.shapes || []).map((item) => ensureInferredLabel(item))
            : stripListLabels(profile.supportingVisualElements?.shapes || []),
          dataVisualization: shouldMarkInferred
            ? (profile.supportingVisualElements?.dataVisualization || []).map((item) => ensureInferredLabel(item))
            : stripListLabels(profile.supportingVisualElements?.dataVisualization || []),
        },
        colorPalette: {
          primaryColors: verifiedPrimaryColors,
          secondaryAccentColors: verifiedAccentColors,
          neutrals: verifiedNeutrals,
        },
        consistencyAssessment: (shouldMarkInferred ? ensureInferredLabel : stripLabels)(
          hasOfficialBrandSource || !hasAnyColorData
            ? consistencyAssessment
            : `${consistencyAssessment} ${verificationSuffix}`
        ),
        distinctivenessAssessment: shouldMarkInferred
          ? ensureInferredLabel(profile.distinctivenessAssessment || '')
          : stripLabels(profile.distinctivenessAssessment || ''),
        sources: profileSources,
      };
    }),
  };
}

const DEMOGRAPHIC_NUMERIC_SIGNAL = /(\d{1,3}(?:\.\d+)?\s?%|\b\d{2}\s*[-–]\s*\d{2}\b|\$\s?\d[\d,]*(?:\.\d+)?\b|\bmedian\b|\bmean\b)/i;
const DEMOGRAPHIC_DIRECTIONAL_SIGNAL = /(skew|majority|plurality|mostly|predominantly|over-?index|under-?index|concentrat|dominant|leans?\s+(male|female|women|men|non-binary)|youth-leaning)/i;
const DEMOGRAPHIC_TOPIC_SIGNAL = /(age|young|youth|teen|adult|older|senior|gen\s?[xyz]|millennial|boomer|male|female|women|men|non-binary|gender|race|ethnic|black|white|latino|latina|latinx|hispanic|asian)/i;
const DEMOGRAPHIC_STAT_CONTEXT_SIGNAL = /(audience|sample|respondent|survey|population|cohort|users?|consumers?|households?)/i;

export function sanitizeDemographicClaim(value?: string | null): string | null {
  const raw = (value || '').trim();
  if (!raw) return null;

  const stripped = raw
    .replace(/\[(KNOWN|INFERRED|INFERED|SPECULATIVE)\]\s*/gi, '')
    .replace(/\b(KNOWN|INFERRED|INFERED|SPECULATIVE)\b\s*[:\-]?\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!stripped) return null;

  const hasKnownMarker = /\[(KNOWN)\]|\bKNOWN\b/i.test(raw);
  const hasInferredMarker = /\[(INFERRED|INFERED)\]|\b(INFERRED|INFERED)\b/i.test(raw);
  const hasSpeculativeMarker = /\[(SPECULATIVE)\]|\bSPECULATIVE\b/i.test(raw);
  const hasNumericSignal = DEMOGRAPHIC_NUMERIC_SIGNAL.test(stripped);
  const hasDirectionalSignal = DEMOGRAPHIC_DIRECTIONAL_SIGNAL.test(stripped);
  const hasDemographicTopicSignal = DEMOGRAPHIC_TOPIC_SIGNAL.test(stripped);
  const hasDemographicStatContextSignal = DEMOGRAPHIC_STAT_CONTEXT_SIGNAL.test(stripped);
  const hasUsefulDemographicSignal = hasNumericSignal || hasDirectionalSignal || hasDemographicStatContextSignal || hasDemographicTopicSignal;
  const hasTopicOrNumericAnchor = hasDemographicTopicSignal || hasNumericSignal;

  if (hasSpeculativeMarker) return null;
  if (hasKnownMarker && hasUsefulDemographicSignal && hasTopicOrNumericAnchor) return stripped;
  if (hasInferredMarker && hasUsefulDemographicSignal && hasTopicOrNumericAnchor) return stripped;
  if (!hasKnownMarker && !hasInferredMarker && hasUsefulDemographicSignal && hasTopicOrNumericAnchor) return stripped;
  if (!hasDemographicTopicSignal) return null;
  return null;
}

function sanitizeDemographicWithInferenceFallback(value?: string | null): string | null {
  const direct = sanitizeDemographicClaim(value);
  if (direct) return direct;

  const raw = (value || '').trim();
  if (!raw) return null;
  const inferredAttempt = sanitizeDemographicClaim(`[INFERRED] ${raw}`);
  return inferredAttempt;
}

function sanitizeCulturalMatrix(
  matrix: CulturalMatrix,
  hasUploadedDocuments: boolean,
  allowedEvidenceUrls: string[] = []
): CulturalMatrix {
  const stripEvidenceMarkers = (value?: string | null): string =>
    (value || '')
      .replace(/\[(KNOWN|INFERRED|INFERED|SPECULATIVE)\]\s*/gi, '')
      .replace(/\b(KNOWN|INFERRED|INFERED|SPECULATIVE)\b\s*[:\-]?\s*/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  const normalizeDemographic = (value?: string | null): string | null => {
    return sanitizeDemographicWithInferenceFallback(value);
  };

  const fallbackLifecycle = (confidence?: MatrixItem['confidenceLevel']): 'emerging' | 'peaking' | 'declining' => {
    if (confidence === 'high') return 'peaking';
    if (confidence === 'low') return 'emerging';
    return 'declining';
  };

  const normalizeItemConfidence = (item: MatrixItem): MatrixItem => ({
    ...item,
    isFromDocument: hasUploadedDocuments ? item.isFromDocument === true : false,
    confidenceLevel:
      item.confidenceLevel === 'low' || item.confidenceLevel === 'high' || item.confidenceLevel === 'medium'
        ? item.confidenceLevel
        : 'medium',
    trendLifecycle:
      item.trendLifecycle === 'emerging' || item.trendLifecycle === 'peaking' || item.trendLifecycle === 'declining'
        ? item.trendLifecycle
        : fallbackLifecycle(item.confidenceLevel),
  });

  const sanitizedDemographics = {
    age: normalizeDemographic(matrix.demographics?.age),
    gender: normalizeDemographic(matrix.demographics?.gender),
    race: normalizeDemographic(matrix.demographics?.race),
  };

  console.log('[cultural-matrix] Demographics sanitization summary', {
    hasUploadedDocuments,
    evidenceUrlCount: allowedEvidenceUrls.length,
    raw: matrix.demographics || null,
    sanitized: sanitizedDemographics,
  });

  return {
    ...matrix,
    demographics: sanitizedDemographics,
    sociological_analysis: stripEvidenceMarkers(matrix.sociological_analysis || ''),
    moments: (matrix.moments || []).map(normalizeItemConfidence),
    beliefs: (matrix.beliefs || []).map(normalizeItemConfidence),
    tone: (matrix.tone || []).map(normalizeItemConfidence),
    language: (matrix.language || []).map(normalizeItemConfidence),
    behaviors: (matrix.behaviors || []).map(normalizeItemConfidence),
    contradictions: (matrix.contradictions || []).map(normalizeItemConfidence),
    community: (matrix.community || []).map(normalizeItemConfidence),
    influencers: (matrix.influencers || []).map(normalizeItemConfidence),
    vocabulary: {
      wordsTheyUse: (matrix.vocabulary?.wordsTheyUse || [])
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 20),
      wordsToAvoid: (matrix.vocabulary?.wordsToAvoid || [])
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 20),
    },
    sources: sanitizeSourcesWithAllowlist(matrix.sources, allowedEvidenceUrls),
  };
}

function normalizeKey(value?: string | null): string {
  return (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getHostname(value?: string | null): string {
  if (!value) return '';
  try {
    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return new URL(withProtocol).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function normalizeBrandDeepDiveReport(
  parsed: z.infer<typeof BrandDeepDiveFallbackSchema>,
  fallbackBrands: { name: string; website?: string }[],
  fallbackObjective: string
): BrandDeepDiveReport {
  const sourceProfiles = parsed.brandProfiles || [];
  const remainingProfiles = [...sourceProfiles];

  const alignedProfiles = fallbackBrands.map((brand, idx) => {
    const targetNameKey = normalizeKey(brand.name);
    const targetHost = getHostname(brand.website);
    let matchedBy: 'name' | 'domain' | 'index' | 'none' = 'none';

    let matchedIndex = remainingProfiles.findIndex((profile) => {
      const profileNameKey = normalizeKey(profile.brandName);
      return profileNameKey === targetNameKey || profileNameKey.includes(targetNameKey) || targetNameKey.includes(profileNameKey);
    });
    if (matchedIndex >= 0) {
      matchedBy = 'name';
    }

    if (matchedIndex < 0 && targetHost) {
      matchedIndex = remainingProfiles.findIndex((profile) => getHostname(profile.website) === targetHost);
      if (matchedIndex >= 0) {
        matchedBy = 'domain';
      }
    }

    if (matchedIndex < 0 && idx < remainingProfiles.length) {
      matchedIndex = idx;
      matchedBy = 'index';
    }

    if (matchedIndex < 0 || matchedIndex >= remainingProfiles.length) {
      return null;
    }

    const [matched] = remainingProfiles.splice(matchedIndex, 1);
    return { brand, matched, matchedBy };
  });

  return {
    analysisObjective: parsed.analysisObjective || fallbackObjective,
    ecosystemMethod:
      parsed.ecosystemMethod ||
      "Brand website ecosystem analysis was conducted using available first-party digital touchpoints.",
    brandProfiles: fallbackBrands.map((brand, idx) => {
      const resolved = alignedProfiles[idx]?.matched;
      const matchedBy = alignedProfiles[idx]?.matchedBy || 'none';
      const profile = resolved || null;
      return {
      brandName: brand.name || profile?.brandName || `Brand ${idx + 1}`,
      website: brand.website || profile?.website || null,
      matchSource: matchedBy,
      logoImageUrl: profile?.logoImageUrl || null,
      sampleVisuals: profile?.sampleVisuals || [],
      logo: {
        mainLogo: profile?.logo?.mainLogo || "Not provided",
        logoVariations: profile?.logo?.logoVariations || [],
        wordmarkLogotype: profile?.logo?.wordmarkLogotype || "Not provided",
        symbolsIcons: profile?.logo?.symbolsIcons || [],
      },
      colorPalette: {
        primaryColors: profile?.colorPalette?.primaryColors || [],
        secondaryAccentColors: profile?.colorPalette?.secondaryAccentColors || [],
        neutrals: profile?.colorPalette?.neutrals || [],
      },
      typography: {
        fontFamilies: profile?.typography?.fontFamilies || [],
        hierarchy: {
          h1: profile?.typography?.hierarchy?.h1 || "Not provided",
          h2: profile?.typography?.hierarchy?.h2 || "Not provided",
          body: profile?.typography?.hierarchy?.body || "Not provided",
        },
        usageRules: profile?.typography?.usageRules || [],
      },
      supportingVisualElements: {
        imageryStyle: profile?.supportingVisualElements?.imageryStyle || [],
        icons: profile?.supportingVisualElements?.icons || [],
        patternsTextures: profile?.supportingVisualElements?.patternsTextures || [],
        shapes: profile?.supportingVisualElements?.shapes || [],
        dataVisualization: profile?.supportingVisualElements?.dataVisualization || [],
      },
      consistencyAssessment: profile?.consistencyAssessment || "Not provided",
      distinctivenessAssessment: profile?.distinctivenessAssessment || "Not provided",
      sources: profile?.sources || [],
    };}),
    crossBrandReadout: parsed.crossBrandReadout || [],
    strategicRecommendations: parsed.strategicRecommendations || [],
    sources: parsed.sources || [],
  };
}

type ScrapedBrandDesignTokens = {
  brandName: string;
  website: string;
  colors: string[];
  fonts: string[];
  logoUrl?: string | null;
  heroImageUrl?: string | null;
  screenshotUrl?: string | null;
  liveTypography?: {
    h1: string[];
    h2: string[];
    h3: string[];
    p: string[];
    body: string[];
  } | null;
};

function buildWebsiteScreenshotUrl(websiteUrl: string): string | null {
  const normalized = normalizeHttpsUrl(websiteUrl);
  if (!normalized) return null;
  return `https://image.thum.io/get/width/1920/noanimate/${normalized}`;
}

async function fetchDesignTokensForBrand(brandName: string, website?: string): Promise<ScrapedBrandDesignTokens | null> {
  const trimmedWebsite = (website || '').trim();
  if (!trimmedWebsite) return null;

  try {
    const baseUrl = getApiBaseUrl();
    const normalizedWebsiteUrl = normalizeHttpsUrl(trimmedWebsite) || trimmedWebsite;
    const fetchTokens = async (path: string) => {
      const response = await fetch(`${baseUrl}${path}?domain=${encodeURIComponent(trimmedWebsite)}`);
      if (!response.ok) return null;
      return await response.json() as {
        logoUrl?: string | null;
        heroImageUrl?: string | null;
        designTokens?: {
          colors?: string[];
          fonts?: string[];
        } | null;
      };
    };
    const fetchTypography = async () => {
      const response = await fetch(
        `${baseUrl}/api/extract-typography?url=${encodeURIComponent(normalizedWebsiteUrl)}&maxSamplesPerTag=3`
      );
      if (!response.ok) return null;
      const payload = await response.json() as {
        success?: boolean;
        typography?: {
          h1?: Array<{
            fontFamily?: string;
            fontWeight?: string;
            fontSize?: string;
            lineHeight?: string;
            color?: string;
          }>;
          h2?: Array<{
            fontFamily?: string;
            fontWeight?: string;
            fontSize?: string;
            lineHeight?: string;
            color?: string;
          }>;
          h3?: Array<{
            fontFamily?: string;
            fontWeight?: string;
            fontSize?: string;
            lineHeight?: string;
            color?: string;
          }>;
          p?: Array<{
            fontFamily?: string;
            fontWeight?: string;
            fontSize?: string;
            lineHeight?: string;
            color?: string;
          }>;
          body?: Array<{
            fontFamily?: string;
            fontWeight?: string;
            fontSize?: string;
            lineHeight?: string;
            color?: string;
          }>;
        };
      };
      if (!payload.success || !payload.typography) return null;

      const serializeTypographyStyle = (style: {
        fontFamily?: string;
        fontWeight?: string;
        fontSize?: string;
        lineHeight?: string;
        color?: string;
      }): string => {
        const family = (style.fontFamily || '').trim();
        const weight = (style.fontWeight || '').trim();
        const size = (style.fontSize || '').trim();
        const lineHeight = (style.lineHeight || '').trim();
        const color = (style.color || '').trim();
        return `font-family=${family || 'N/A'}; font-weight=${weight || 'N/A'}; font-size=${size || 'N/A'}; line-height=${lineHeight || 'N/A'}; color=${color || 'N/A'}`;
      };

      const dedupeAndSerialize = (styles: Array<{
        fontFamily?: string;
        fontWeight?: string;
        fontSize?: string;
        lineHeight?: string;
        color?: string;
      }> = []): string[] => Array.from(
        new Set(
          styles
            .map((style) => serializeTypographyStyle(style))
            .filter(Boolean)
        )
      ).slice(0, 3);

      return {
        h1: dedupeAndSerialize(payload.typography.h1 || []),
        h2: dedupeAndSerialize(payload.typography.h2 || []),
        h3: dedupeAndSerialize(payload.typography.h3 || []),
        p: dedupeAndSerialize(payload.typography.p || []),
        body: dedupeAndSerialize(payload.typography.body || []),
      };
    };

    const payload = await fetchTokens('/api/brand-images');
    const fallbackPayload = payload && (
      (payload.designTokens?.colors?.length || 0) > 0 ||
      (payload.designTokens?.fonts?.length || 0) > 0
    )
      ? null
      : await fetchTokens('/api/brand-images-legacy');
    const activePayload = fallbackPayload || payload;
    if (!activePayload) return null;

    const colors = Array.from(
      new Set(
        (activePayload.designTokens?.colors || [])
          .map((value) => normalizeHexColor(value))
          .filter((value): value is string => Boolean(value))
      )
    ).slice(0, 15);

    const fonts = Array.from(
      new Set(
        (activePayload.designTokens?.fonts || [])
          .map((value) => (value || '').trim())
          .filter(Boolean)
      )
    ).slice(0, 5);
    const liveTypography = await fetchTypography();

    return {
      brandName,
      website: trimmedWebsite,
      colors,
      fonts,
      logoUrl: normalizeHttpsUrl(activePayload.logoUrl || '') || null,
      heroImageUrl: normalizeHttpsUrl(activePayload.heroImageUrl || '') || null,
      screenshotUrl: buildWebsiteScreenshotUrl(trimmedWebsite),
      liveTypography,
    };
  } catch (error) {
    console.warn('[brand-deep-dive] Failed to fetch scraped design tokens.', { brandName, website: trimmedWebsite, error });
    return null;
  }
}

function buildHardDesignTokensBlock(tokens: ScrapedBrandDesignTokens[]): string {
  if (!tokens.length) {
    return `HARD DESIGN TOKENS (Scraped directly from website CSS):
- Not available for the selected brands.`;
  }

  return [
    'HARD DESIGN TOKENS (Scraped directly from website CSS):',
    ...tokens.map((token, index) => {
      const colors = token.colors.length ? token.colors.join(', ') : 'Not available';
      const fonts = token.fonts.length ? token.fonts.join(', ') : 'Not available';
      const visualUrls = [
        token.logoUrl,
        token.heroImageUrl,
        token.screenshotUrl,
      ].filter((value): value is string => Boolean(value));
      const visuals = visualUrls.length ? visualUrls.join(', ') : 'Not available';
      return `${index + 1}. ${token.brandName} (${token.website})\n   - Available Colors: ${colors}\n   - Available Fonts: ${fonts}\n   - Available Visual URLs: ${visuals}`;
    }),
  ].join('\n');
}

export function buildHardDesignTokenRulesBlock(hasHardTokens: boolean): string {
  if (hasHardTokens) {
    return `CRITICAL RULE:
- Prioritize "HARD DESIGN TOKENS" for hex codes and typography whenever a direct token match exists.
- If a specific field has no matching hard token, you may provide a best-estimate value from direct first-party visual evidence.
- Any non-token value must be explicitly labeled [INFERRED] and described as estimated/unverified.
- Do not fabricate precision when confidence is low.`;
  }

  return `CRITICAL RULE:
- No hard design tokens were successfully scraped in this run.
- You may still provide best-estimate HEX values and font families based on direct visible evidence from first-party brand surfaces.
- Any inferred token must be clearly described as estimated/unverified in adjacent narrative fields.
- Do not fabricate precision when confidence is low.`;
}

export function buildLiveTypographyEvidenceBlock(tokens: ScrapedBrandDesignTokens[]): string {
  if (!tokens.length) {
    return `LIVE TYPOGRAPHY EVIDENCE (Computed styles via Playwright):
- Not available for the selected brands.`;
  }

  return [
    'LIVE TYPOGRAPHY EVIDENCE (Computed styles via Playwright):',
    ...tokens.map((token, index) => {
      const h1 = token.liveTypography?.h1?.length ? token.liveTypography.h1.join(' | ') : 'Not available';
      const h2 = token.liveTypography?.h2?.length ? token.liveTypography.h2.join(' | ') : 'Not available';
      const h3 = token.liveTypography?.h3?.length ? token.liveTypography.h3.join(' | ') : 'Not available';
      const p = token.liveTypography?.p?.length ? token.liveTypography.p.join(' | ') : 'Not available';
      return `${index + 1}. ${token.brandName} (${token.website})\n   - h1: ${h1}\n   - h2: ${h2}\n   - h3: ${h3}\n   - p/body: ${p}`;
    }),
  ].join('\n');
}

export async function generateBrandDeepDive(input: {
  brands: { name: string; website?: string }[];
  analysisObjective: string;
  targetAudience?: string;
  timeHorizon?: string;
}): Promise<BrandDeepDiveReport> {
  const cappedBrands = input.brands.slice(0, 6);
  const brandList = cappedBrands
    .map((brand, idx) => `${idx + 1}. ${brand.name}${brand.website ? ` (${brand.website})` : ''}`)
    .join("\n");

  const topicSummary = `Brand deep dive for ${cappedBrands.map((brand) => brand.name).join(', ')} | objective: ${input.analysisObjective}`;
  const evidenceDigest = await gatherEvidenceForTopic(topicSummary, 'brand');
  const scrapedDesignTokenList = (
    await Promise.all(cappedBrands.map((brand) => fetchDesignTokensForBrand(brand.name, brand.website)))
  ).filter((item): item is ScrapedBrandDesignTokens => Boolean(item));
  console.log('[brand-deep-dive] Scraped hard design tokens.', {
    brandCount: cappedBrands.length,
    tokenCount: scrapedDesignTokenList.length,
    tokens: scrapedDesignTokenList,
  });
  const hardDesignTokensBlock = buildHardDesignTokensBlock(scrapedDesignTokenList);
  const hardDesignTokenRulesBlock = buildHardDesignTokenRulesBlock(scrapedDesignTokenList.length > 0);
  const liveTypographyEvidenceBlock = buildLiveTypographyEvidenceBlock(scrapedDesignTokenList);

  const prompt = `You are a senior brand design strategist and visual identity analyst.

${hardDesignTokensBlock}

${hardDesignTokenRulesBlock}

${liveTypographyEvidenceBlock}

Analyze up to 6 brands by assessing their visual identity systems using this framework:
1) Logo (primary mark, variations, wordmark/logotype, symbols/icons)
2) Color Palette (primary, secondary/accent, neutrals, technical values: HEX/RGB/CMYK/Pantone where inferable)
3) Typography (font families, hierarchy for H1/H2/body, usage rules)
4) Supporting Visual Elements (imagery style, icons, patterns/textures, shapes, data visualization style)

Brands to assess:
${brandList}

Analysis Objective: ${input.analysisObjective}
Target Audience: ${input.targetAudience || "Not specified"}
Time Horizon: ${input.timeHorizon || "6-12 months"}

Research guidance:
- First, search the brand's official corporate/company website for a public "Brand Guidelines" (or similar "Brand Identity"/"Style Guide") page and treat it as the source of truth for brand identity when available.
- If no official guidelines page exists, fall back to the broader current methodology across the website ecosystem and other credible sources.
- Prioritize each brand's full website ecosystem (homepage, product pages, campaign pages, blog/editorial, about, investor/newsroom, design system/style guide if public).
- Use public first-party sources where possible.
- If a value cannot be confirmed with high confidence (for example CMYK/Pantone), mark uncertainty in text and avoid fabricating precision.
- For logo analysis, document usage across multiple website environments (for example: header/nav, footer, product UI, campaign/landing modules, social preview assets, favicon/app icon, dark vs light backgrounds), not just the top-of-page header.

Output requirements:
- Return a profile for each brand listed.
- Keep insights concrete, specific, and directly tied to observed visual identity choices.
- Include a cross-brand readout that highlights patterns, white space, and differentiation opportunities.
- Provide strategic recommendations for visual identity direction across the set.
- Include image URLs when available:
  - logoImageUrl: direct URL for the current or most representative logo lockup from the brand's own website/domain (or brand-controlled CDN). Do not use third-party logo APIs.
  - sampleVisuals: 2-4 direct image URLs (homepage hero, campaign visual, product visual, etc.) with short titles.
- Prefer stable, first-party image URLs. If no reliable direct image URL is available, return null for logoImageUrl and an empty sampleVisuals list.
- For colorPalette values, prefer exact HEX values verified on official same-domain sources when available.
- Do not over-index on one campaign/gradient image. Prioritize recurring brand-system colors seen across persistent surfaces (header/nav, buttons, product UI, docs/help, footer, app UI).
- Keep color lists tight and strategic. Target roughly: primary (2-5), accent (1-3), neutrals (2-5). Avoid returning many near-duplicate shades from a single gradient.
- For typography fields (font families + hierarchy), prioritize LIVE TYPOGRAPHY EVIDENCE computed from rendered page styles when available.
- If same-domain verification is unavailable, still provide best-estimate HEX values inferred from observable brand visuals and mark usage clearly as estimated/unverified.
- In logo.logoVariations and logo.symbolsIcons, include concrete environment context notes (where and how marks are deployed across the site ecosystem).

Evidence digest (weighted for source quality and recency):
${evidenceDigest}

${RESEARCH_ACCURACY_PROTOCOL}`;

  try {
    const parsedStrict = await runStructuredCall({
      schema: BrandDeepDiveReportSchema,
      schemaName: 'brand_deep_dive_report',
      mode: 'brand',
      outputType: 'analysis',
      messages: [
        {
          role: 'system',
          content: composeSystemPrompt('You are a senior brand design strategist and visual identity analyst.', 'brand'),
        },
        { role: 'user', content: prompt },
      ],
      qualityGate: (parsed) => !isThinStructuredPayload(parsed),
    });

    const normalizedStrict = BrandDeepDiveFallbackSchema.parse(parsedStrict);
    const normalized = sanitizeBrandDeepDiveReport(normalizeBrandDeepDiveReport(normalizedStrict, cappedBrands, input.analysisObjective));
    updateSessionBrief('brand', normalized);
    return normalized;
  } catch (strictError) {
    console.warn("Strict structured response failed for brand deep dive, retrying with fallback schema:", strictError);

    const parsedFallback = await runStructuredCall({
      schema: BrandDeepDiveFallbackSchema,
      schemaName: 'brand_deep_dive_report_fallback',
      mode: 'brand',
      outputType: 'analysis',
      messages: [
        {
          role: 'system',
          content: composeSystemPrompt('You are a senior brand design strategist and visual identity analyst.', 'brand'),
        },
        { role: 'user', content: prompt },
      ],
      qualityGate: (parsed) => !isThinStructuredPayload(parsed),
      maxRetries: 3,
    });

    const normalized = sanitizeBrandDeepDiveReport(normalizeBrandDeepDiveReport(parsedFallback, cappedBrands, input.analysisObjective));
    updateSessionBrief('brand', normalized);
    return normalized;
  }
}

export async function regenerateBrandDeepDiveWithFeedback(input: {
  brands: { name: string; website?: string }[];
  analysisObjective: string;
  targetAudience?: string;
  timeHorizon?: string;
  currentReport: BrandDeepDiveReport;
  feedback: string;
}): Promise<BrandDeepDiveReport> {
  const cappedBrands = input.brands.slice(0, 6);
  const brandList = cappedBrands
    .map((brand, idx) => `${idx + 1}. ${brand.name}${brand.website ? ` (${brand.website})` : ''}`)
    .join("\n");

  const topicSummary = `Brand deep dive rescan for ${cappedBrands.map((brand) => brand.name).join(', ')} | objective: ${input.analysisObjective}`;
  const evidenceDigest = await gatherEvidenceForTopic(`${topicSummary} | feedback: ${input.feedback}`, 'brand');
  const scrapedDesignTokenList = (
    await Promise.all(cappedBrands.map((brand) => fetchDesignTokensForBrand(brand.name, brand.website)))
  ).filter((item): item is ScrapedBrandDesignTokens => Boolean(item));
  console.log('[brand-deep-dive] Scraped hard design tokens for regeneration.', {
    brandCount: cappedBrands.length,
    tokenCount: scrapedDesignTokenList.length,
    tokens: scrapedDesignTokenList,
  });
  const hardDesignTokensBlock = buildHardDesignTokensBlock(scrapedDesignTokenList);
  const hardDesignTokenRulesBlock = buildHardDesignTokenRulesBlock(scrapedDesignTokenList.length > 0);
  const liveTypographyEvidenceBlock = buildLiveTypographyEvidenceBlock(scrapedDesignTokenList);

  const prompt = `You are a senior brand design strategist and visual identity analyst.

${hardDesignTokensBlock}

${hardDesignTokenRulesBlock}

${liveTypographyEvidenceBlock}

Re-audit and correct the brand deep dive below. Treat the feedback as a request to rescan the listed brand websites and fix inaccuracies.

Brands to assess:
${brandList}

Analysis Objective: ${input.analysisObjective}
Target Audience: ${input.targetAudience || "Not specified"}
Time Horizon: ${input.timeHorizon || "6-12 months"}

User feedback about what looks inaccurate:
${input.feedback}

Current report to correct:
${JSON.stringify(input.currentReport, null, 2)}

Correction requirements:
- Return a fully updated complete report, not a partial patch.
- First, search each brand's official corporate/company website for a public "Brand Guidelines" (or similar "Brand Identity"/"Style Guide") page and treat it as the source of truth when available.
- If no official guidelines page exists, fall back to the broader current methodology across the website ecosystem and other credible sources.
- Re-check the brand website ecosystem and prioritize first-party same-domain sources.
- Correct any likely inaccuracies in logos, colors, typography, imagery descriptions, and strategic conclusions.
- If a value cannot be verified confidently from official or credible sources, remove the precision instead of guessing.
- Keep sources current, high-credibility, and non-duplicative.
- Preserve useful accurate material from the current report when it remains supportable.
- For logo analysis, include usage across multiple website environments (header/nav, footer, product UI, campaign modules, social previews, favicon/app icon, dark/light contexts) instead of only top-of-page observations.

Output requirements:
- Return a profile for each brand listed.
- Keep insights concrete, specific, and directly tied to observed visual identity choices.
- Include a cross-brand readout that highlights patterns, white space, and differentiation opportunities.
- Provide strategic recommendations for visual identity direction across the set.
- Include image URLs when available:
  - logoImageUrl: direct URL for the current or most representative logo lockup from the brand's own website/domain (or brand-controlled CDN). Do not use third-party logo APIs.
  - sampleVisuals: 2-4 direct image URLs (homepage hero, campaign visual, product visual, etc.) with short titles.
- Prefer stable, first-party image URLs. If no reliable direct image URL is available, return null for logoImageUrl and an empty sampleVisuals list.
- For colorPalette values, prefer exact HEX values verified on official same-domain sources when available.
- Do not over-index on one campaign/gradient image. Prioritize recurring brand-system colors seen across persistent surfaces (header/nav, buttons, product UI, docs/help, footer, app UI).
- Keep color lists tight and strategic. Target roughly: primary (2-5), accent (1-3), neutrals (2-5). Avoid returning many near-duplicate shades from a single gradient.
- For typography fields (font families + hierarchy), prioritize LIVE TYPOGRAPHY EVIDENCE computed from rendered page styles when available.
- If same-domain verification is unavailable, still provide best-estimate HEX values inferred from observable brand visuals and mark usage clearly as estimated/unverified.
- In logo.logoVariations and logo.symbolsIcons, include concrete environment context notes (where and how marks are deployed across the site ecosystem).

Evidence digest (weighted for source quality and recency):
${evidenceDigest}

${RESEARCH_ACCURACY_PROTOCOL}`;

  try {
    const parsedStrict = await runStructuredCall({
      schema: BrandDeepDiveReportSchema,
      schemaName: 'brand_deep_dive_report_regenerated',
      mode: 'brand',
      outputType: 'analysis',
      messages: [
        {
          role: 'system',
          content: composeSystemPrompt('You are a senior brand design strategist and visual identity analyst correcting a prior audit.', 'brand'),
        },
        { role: 'user', content: prompt },
      ],
      qualityGate: (parsed) => !isThinStructuredPayload(parsed),
      maxRetries: 3,
    });

    const normalizedStrict = BrandDeepDiveFallbackSchema.parse(parsedStrict);
    const normalized = sanitizeBrandDeepDiveReport(normalizeBrandDeepDiveReport(normalizedStrict, cappedBrands, input.analysisObjective));
    updateSessionBrief('brand', normalized);
    return normalized;
  } catch (strictError) {
    console.warn("Strict structured response failed for regenerated brand deep dive, retrying with fallback schema:", strictError);

    const parsedFallback = await runStructuredCall({
      schema: BrandDeepDiveFallbackSchema,
      schemaName: 'brand_deep_dive_report_regenerated_fallback',
      mode: 'brand',
      outputType: 'analysis',
      messages: [
        {
          role: 'system',
          content: composeSystemPrompt('You are a senior brand design strategist and visual identity analyst correcting a prior audit.', 'brand'),
        },
        { role: 'user', content: prompt },
      ],
      qualityGate: (parsed) => !isThinStructuredPayload(parsed),
      maxRetries: 3,
    });

    const normalized = sanitizeBrandDeepDiveReport(normalizeBrandDeepDiveReport(parsedFallback, cappedBrands, input.analysisObjective));
    updateSessionBrief('brand', normalized);
    return normalized;
  }
}

type InsightDeepDivePromptParams = {
  audience: string;
  providedContext: string;
  brandContext?: string;
  generations?: string[];
  topicFocus?: string;
};

function buildInsightDeepDiveContextHeader(params: InsightDeepDivePromptParams & { deepDiveFocus: string }): string {
  const generationsLabel = (params.generations || []).filter(Boolean).join(', ');
  return `You are an expert Cultural Archaeologist and Brand Strategist.
Target Audience: "${params.audience}"
Deep Dive Focus: "${params.deepDiveFocus}"
${params.brandContext ? `Brand Context: ${params.brandContext}` : ''}
${generationsLabel ? `Generations: ${generationsLabel}` : ''}
${params.topicFocus ? `Topic Focus: ${params.topicFocus}` : ''}
Provided Context: ${params.providedContext}`;
}

const DUAL_LANE_MACRO_SINGLE_BLOCK = `Methodology: Dual-Lane Macro (only)

Lane 1 - Breaking (last 7 days):
- Extract short-horizon shifts and emerging signals relevant to this insight.
- Prioritize recent evidence from the provided context.

Lane 2 - Structural (annual + macro):
- Extract durable, macro-level forces shaping the same insight over longer cycles.
- Prioritize recurring and corroborated patterns in the provided context.

Execution requirements:
- Synthesize BOTH lanes into one coherent deep dive report.
- In expandedContext, clearly separate breaking vs structural signal.
- In strategicImplications, include at least one implication tied to each lane.
- If one lane is weak, explicitly state that limitation instead of filling with speculation.
- First internally work through competing interpretations before finalizing output.`;

const DUAL_LANE_MACRO_BATCH_BLOCK = `Methodology: Dual-Lane Macro (only)

Lane 1 - Breaking (last 7 days):
- For EACH insight, identify near-term shifts from the provided context.

Lane 2 - Structural (annual + macro):
- For EACH insight, identify durable macro drivers from the provided context.

Execution requirements:
- Apply both lanes independently for EACH insight report.
- Keep each report balanced: breaking + structural perspective.
- If a lane is weak for a specific insight, explicitly note the limitation rather than inventing detail.`;

const DEEP_DIVE_REAL_WORLD_EXAMPLE_CITATION_PROTOCOL = `Real World Examples citation protocol (must follow):
- For EACH realWorldExamples item, provide a text field plus sourceTitle and sourceUrl fields.
- The sourceUrl must directly support that specific bullet and must come from the Evidence Digest.
- Do not assign a source to a bullet unless the source clearly substantiates that exact claim.
- If a bullet cannot be supported by a specific source URL, revise or remove the bullet instead of guessing.`;

export function buildInsightDeepDivePrompt(params: InsightDeepDivePromptParams & { deepDiveFocus: string }): string {
  return `${buildInsightDeepDiveContextHeader(params)}

${DUAL_LANE_MACRO_SINGLE_BLOCK}

${DEEP_DIVE_REAL_WORLD_EXAMPLE_CITATION_PROTOCOL}

${RESEARCH_ACCURACY_PROTOCOL}`;
}

export function buildInsightDeepDiveBatchPrompt(params: InsightDeepDivePromptParams & {
  insights: string[];
}): string {
  const header = buildInsightDeepDiveContextHeader({
    ...params,
    deepDiveFocus: params.insights.join(' | '),
  });
  return `${header}

Insights:
${params.insights.map((insight, index) => `${index + 1}. "${insight}"`).join('\n')}

${DUAL_LANE_MACRO_BATCH_BLOCK}

${DEEP_DIVE_REAL_WORLD_EXAMPLE_CITATION_PROTOCOL}

${RESEARCH_ACCURACY_PROTOCOL}`;
}

export async function generateDeepDive(
  insight: MatrixItem,
  context: { audience: string; brand: string; generations: string[]; topicFocus?: string }
): Promise<DeepDiveReport> {
  const evidenceDigest = await gatherEvidenceForTopic(`Deep dive on insight: ${insight.text}`, 'cultural');

  const prompt = buildInsightDeepDivePrompt({
    audience: context.audience,
    deepDiveFocus: insight.text,
    providedContext: evidenceDigest,
    brandContext: context.brand,
    generations: context.generations,
    topicFocus: context.topicFocus,
  });

  const parsed = await runStructuredCall({
    schema: DeepDiveReportSchema,
    schemaName: 'deep_dive_report',
    mode: 'cultural',
    outputType: 'analysis',
    messages: [
      {
        role: 'system',
        content: composeSystemPrompt('You are an expert Cultural Archaeologist and Brand Strategist.', 'cultural'),
      },
      { role: 'user', content: prompt },
    ],
    qualityGate: (result) => !isThinStructuredPayload(result),
    maxRetries: 3,
  });

  const devil = await runDevilsAdvocatePass(`Deep dive: ${insight.text}`, parsed, 'cultural');
  const sanitized = sanitizeDeepDiveReport(parsed);
  const summarizedDevilsAdvocate = buildDeepDiveDevilsAdvocateImplications(devil);
  console.log('[deep-dive] Added summarized devil\'s advocate implications.', {
    insight: insight.text,
    appendedCount: summarizedDevilsAdvocate.length,
    summaryPreview: summarizedDevilsAdvocate[0],
  });
  sanitized.strategicImplications = [
    ...sanitized.strategicImplications,
    ...summarizedDevilsAdvocate,
  ];
  updateSessionBrief('cultural', sanitized);
  return sanitized;
}

export async function generateDeepDivesBatch(
  insights: MatrixItem[],
  context: { audience: string; brand: string; generations: string[]; topicFocus?: string }
): Promise<DeepDiveReport[]> {
  const evidenceDigest = await gatherEvidenceForTopic(
    `Deep dive batch on insights: ${insights.map((item) => item.text).join(' | ')}`,
    'cultural'
  );
  const prompt = buildInsightDeepDiveBatchPrompt({
    audience: context.audience,
    insights: insights.map((item) => item.text),
    providedContext: evidenceDigest,
    brandContext: context.brand,
    generations: context.generations,
    topicFocus: context.topicFocus,
  });

  const parsed = await runStructuredCall({
    schema: z.object({ reports: z.array(DeepDiveReportSchema) }),
    schemaName: 'deep_dive_reports',
    mode: 'cultural',
    outputType: 'analysis',
    messages: [
      {
        role: 'system',
        content: composeSystemPrompt('You are an expert Cultural Archaeologist and Brand Strategist.', 'cultural'),
      },
      { role: 'user', content: prompt },
    ],
    qualityGate: (result) => Array.isArray(result.reports) && result.reports.length >= Math.max(1, Math.floor(insights.length * 0.6)),
  });

  const reports = (parsed.reports || []).map((report: DeepDiveReport) => sanitizeDeepDiveReport(report));
  updateSessionBrief('cultural', { reports });
  return reports;
}

const MatrixAnswerSchema = z.object({
  answer: z.string(),
  relevantInsights: z.array(z.string())
});

const AudienceSegmentArchetypeSchema = z.object({
  name: z.string(),
  archetype: z.string(),
  profile: z.string(),
  demographicsSnippet: z.string(),
  prevalencePct: z.number().min(1).max(100),
  keySignals: z.array(z.string()).min(2).max(5),
  messagingApproach: z.string(),
});

const AudienceSegmentationReportSchema = z.object({
  regressionSummary: z.string(),
  confidenceNotes: z.string(),
  segments: z.array(AudienceSegmentArchetypeSchema).min(1).max(6),
});

const BrandDeepDiveAnswerSchema = z.object({
  answer: z.string(),
});

const BrandNavigatorSectionKeySchema = z.enum([
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
]);

const BrandNavigatorAnswerSchema = z.object({
  answer: z.string(),
  relevantSections: z.array(BrandNavigatorSectionKeySchema),
  webHighlights: z.array(z.string()),
});

export type BrandDeepDivePromptResult =
  | { mode: "answer"; answer: string }
  | { mode: "rescan"; answer: string; report: BrandDeepDiveReport };

function looksLikeBrandDeepDiveCorrectionPrompt(prompt: string): boolean {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) return false;

  const directRescanPatterns = [
    /\brescan\b/,
    /\bscan again\b/,
    /\bre-?audit\b/,
    /\brecheck\b/,
    /\bcheck again\b/,
    /\brefresh\b.*\b(report|results|audit)\b/,
    /\bupdate\b.*\b(report|results|audit)\b/,
    /\bfix\b.*\b(report|results|audit|analysis|colors?|typography|logo|imagery)\b/,
    /\bcorrect\b.*\b(report|results|audit|analysis|colors?|typography|logo|imagery)\b/,
    /\bverify\b.*\b(report|results|audit|analysis|colors?|typography|logo|imagery)\b/,
  ];

  const issuePatterns = [
    /\b(report|results|audit|analysis|colors?|typography|logo|imagery)\b.*\b(wrong|incorrect|inaccurate|outdated|missing|off)\b/,
    /\b(wrong|incorrect|inaccurate|outdated|missing|off)\b.*\b(report|results|audit|analysis|colors?|typography|logo|imagery)\b/,
  ];

  return [...directRescanPatterns, ...issuePatterns].some((pattern) => pattern.test(normalized));
}

export async function askMatrixQuestion(
  matrix: CulturalMatrix,
  question: string,
  context?: { audience?: string; brand?: string; topicFocus?: string; generations?: string[]; sourcesType?: string[] }
): Promise<{ answer: string, relevantInsights: string[] }> {
  const searchTopic = buildMatrixQuestionSearchTopic(question, context);
  const evidenceDigest = await gatherEvidenceForTopic(searchTopic, 'matrix-qa');

  const parsed = await runStructuredCall({
    schema: MatrixAnswerSchema,
    schemaName: 'matrix_answer',
    mode: 'matrix-qa',
    outputType: 'analysis',
    messages: [
      {
        role: 'system',
        content: composeSystemPrompt("You are an expert analyst. Use BOTH the provided cultural analysis data and the web evidence digest to answer. Keep the answer as succinct as possible while still complete. Do not invent facts. If evidence is insufficient, explicitly say so. List the exact 'text' of relevant insights from the data. Never refer to the results as 'the matrix'; always call it 'the cultural analysis'.", 'matrix-qa'),
      },
      {
        role: 'user',
        content: `Cultural Analysis Data:\n\n${JSON.stringify(matrix)}\n\nWeb Evidence Digest:\n${evidenceDigest}\n\nQuestion: "${question}"\n\nReturn:\n1) answer: succinct but complete\n2) relevantInsights: exact "text" values from the cultural analysis data that ground the answer`,
      },
    ],
    qualityGate: (result) => !isThinStructuredPayload(result),
  });

  const normalized = {
    ...parsed,
    answer: normalizeMatrixTerminology(parsed.answer),
  };

  updateSessionBrief('matrix-qa', normalized);
  return normalized;
}

export async function generateAudienceSegmentation(
  matrix: CulturalMatrix,
  context?: {
    audience?: string;
    brand?: string;
    topicFocus?: string;
    generations?: string[];
    sourcesType?: string[];
    targetSegmentCount?: number;
    segmentCustomizations?: string[];
  }
): Promise<AudienceSegmentationReport> {
  const requestedSegmentCount = Math.max(1, Math.min(6, Math.round(context?.targetSegmentCount || 4)));
  const segmentCustomizations = (context?.segmentCustomizations || [])
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const audienceLabel = (context?.audience || 'Current audience').trim();
  const contextParts = [
    context?.audience ? `Audience: ${context.audience}` : '',
    context?.brand ? `Brand context: ${context.brand}` : '',
    context?.topicFocus ? `Topic focus: ${context.topicFocus}` : '',
    context?.generations?.length ? `Generations: ${context.generations.join(', ')}` : '',
    context?.sourcesType?.length ? `Sources: ${context.sourcesType.join(', ')}` : '',
    `Requested segment count: ${requestedSegmentCount}`,
    segmentCustomizations.length > 0
      ? `Segment customizations:\n${segmentCustomizations.map((line) => `- ${line}`).join('\n')}`
      : '',
  ].filter(Boolean);
  const contextBlock = contextParts.length > 0 ? contextParts.join('\n') : 'No additional context provided.';
  const evidenceDigest = await gatherEvidenceForTopic(`Audience segmentation analysis for ${audienceLabel}`, 'cultural');

  console.log('[azure-openai] Generating audience segmentation report.', {
    audience: audienceLabel,
    hasBrand: Boolean(context?.brand),
    generationsCount: context?.generations?.length || 0,
    requestedSegmentCount,
    segmentCustomizationsCount: segmentCustomizations.length,
  });

  const segmentationSchema = AudienceSegmentationReportSchema.extend({
    segments: z.array(AudienceSegmentArchetypeSchema).length(requestedSegmentCount),
  });

  const parsed = await runStructuredCall({
    schema: segmentationSchema,
    schemaName: 'audience_segmentation_report',
    mode: 'cultural',
    outputType: 'analysis',
    messages: [
      {
        role: 'system',
        content: composeSystemPrompt(
          `You are an expert audience scientist. Run a regression-style segmentation analysis over the provided cultural analysis data. Create exactly ${requestedSegmentCount} clearly distinct audience segments/archetypes.`,
          'cultural'
        ),
      },
      {
        role: 'user',
        content: `Context:\n${contextBlock}\n\nCultural Analysis Data:\n${JSON.stringify(matrix)}\n\nWeb Evidence Digest:\n${evidenceDigest}\n\nReturn JSON fields:\n- regressionSummary: concise explanation of the strongest predictive drivers.\n- confidenceNotes: limitations, caveats, and confidence statement.\n- segments: exactly ${requestedSegmentCount} entries where each entry includes:\n  - name\n  - archetype\n  - profile\n  - demographicsSnippet (one concise line describing likely age/gender/race composition for that segment; if inferred, use directional language)\n  - prevalencePct (integer from 1-100)\n  - keySignals (2-5 concrete signals)\n  - messagingApproach\n\nRequirements:\n- Segments must be mutually distinct and grounded in the provided data.\n- Treat this as directional regression-style clustering, not deterministic individual prediction.\n- Honor the requested segment count exactly.\n- If segment customizations are present in Context, apply them to the corresponding segments.\n- prevalencePct values should sum to approximately 100.`,
      },
    ],
    qualityGate: (result) =>
      Array.isArray(result.segments) &&
      result.segments.length === requestedSegmentCount &&
      !isThinStructuredPayload(result),
    maxRetries: 3,
  });

  const normalizedSegments = parsed.segments.map((segment) => ({
    ...segment,
    name: segment.name.trim(),
    archetype: segment.archetype.trim(),
    profile: segment.profile.trim(),
    demographicsSnippet: segment.demographicsSnippet.trim(),
    messagingApproach: segment.messagingApproach.trim(),
    keySignals: segment.keySignals.map((signal) => signal.trim()).filter((signal) => signal.length > 0),
    prevalencePct: Math.max(1, Math.min(100, Math.round(segment.prevalencePct))),
  }));

  const normalized: AudienceSegmentationReport = {
    regressionSummary: parsed.regressionSummary.trim(),
    confidenceNotes: parsed.confidenceNotes.trim(),
    segments: normalizedSegments,
  };

  updateSessionBrief('cultural', { audienceSegmentation: normalized });
  return normalized;
}

export async function askBrandDeepDiveQuestion(
  report: BrandDeepDiveReport,
  question: string,
  context?: { brands?: string[]; analysisObjective?: string; targetAudience?: string; timeHorizon?: string }
): Promise<{ answer: string }> {
  const searchTopic = buildBrandDeepDiveQuestionSearchTopic(question, context);
  const evidenceDigest = await gatherEvidenceForTopic(searchTopic, 'brand-qa');

  const parsed = await runStructuredCall({
    schema: BrandDeepDiveAnswerSchema,
    schemaName: 'brand_deep_dive_answer',
    mode: 'brand-qa',
    outputType: 'analysis',
    messages: [
      {
        role: 'system',
        content: composeSystemPrompt('You are an expert brand strategist and design analyst. Answer using the provided brand deep dive report data plus web evidence digest. Do not invent facts. If evidence is insufficient, explicitly say so. Provide a concise, direct answer.', 'brand-qa'),
      },
      {
        role: 'user',
        content: `Brand Deep Dive Report Data:\n\n${JSON.stringify(report)}\n\nWeb Evidence Digest:\n${evidenceDigest}\n\nQuestion: "${question}"`,
      },
    ],
    qualityGate: (result) => !isThinStructuredPayload(result),
  });

  updateSessionBrief('brand-qa', parsed);
  return parsed;
}

export async function askBrandNavigatorQuestion(
  report: BrandResearchMatrix,
  question: string,
  context?: { audience?: string; brand?: string; topicFocus?: string }
): Promise<{
  answer: string;
  relevantSections: Array<
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
    | 'recentNews'
  >;
  webHighlights: string[];
}> {
  const contextParts = [
    context?.audience ? `Audience: ${context.audience}` : '',
    context?.brand ? `Brands: ${context.brand}` : '',
    context?.topicFocus ? `Topic Focus: ${context.topicFocus}` : '',
  ].filter(Boolean);
  const searchTopic = `${contextParts.join(' | ')} | Question: ${question}`.trim();
  const evidenceDigest = await gatherEvidenceForTopic(searchTopic, 'brand-qa');

  const parsed = await runStructuredCall({
    schema: BrandNavigatorAnswerSchema,
    schemaName: 'brand_navigator_answer',
    mode: 'brand-qa',
    outputType: 'analysis',
    messages: [
      {
        role: 'system',
        content: composeSystemPrompt(
          'You are an expert brand strategist. Answer using the provided Brand Navigator report plus web evidence digest. Cite where the answer is grounded by selecting relevant report sections and short web highlights.',
          'brand-qa',
        ),
      },
      {
        role: 'user',
        content: `Brand Navigator Report Data:\n${JSON.stringify(report)}\n\nWeb Evidence Digest:\n${evidenceDigest}\n\nQuestion: "${question}"\n\nReturn:\n1) answer: concise but complete\n2) relevantSections: list of section keys where answer is grounded\n3) webHighlights: 2-5 short bullet-sized highlights from web evidence`,
      },
    ],
    qualityGate: (result) =>
      !isThinStructuredPayload(result) &&
      Array.isArray(result.relevantSections),
  });

  updateSessionBrief('brand-qa', parsed);
  return parsed;
}

export async function submitBrandDeepDivePrompt(input: {
  brands: { name: string; website?: string }[];
  analysisObjective: string;
  targetAudience?: string;
  timeHorizon?: string;
  currentReport: BrandDeepDiveReport;
  prompt: string;
}): Promise<BrandDeepDivePromptResult> {
  const normalizedPrompt = input.prompt.trim();
  if (!normalizedPrompt) {
    throw new Error("Prompt is required.");
  }

  if (looksLikeBrandDeepDiveCorrectionPrompt(normalizedPrompt)) {
    const nextReport = await regenerateBrandDeepDiveWithFeedback({
      brands: input.brands,
      analysisObjective: input.analysisObjective,
      targetAudience: input.targetAudience,
      timeHorizon: input.timeHorizon,
      currentReport: input.currentReport,
      feedback: normalizedPrompt,
    });

    return {
      mode: "rescan",
      answer: "The report was rescanned and updated using your prompt. Review the refreshed results below.",
      report: nextReport,
    };
  }

  const answer = await askBrandDeepDiveQuestion(input.currentReport, normalizedPrompt, {
    brands: input.brands.map((brand) => brand.name).filter(Boolean),
    analysisObjective: input.analysisObjective,
    targetAudience: input.targetAudience,
    timeHorizon: input.timeHorizon,
  });
  return {
    mode: "answer",
    answer: answer.answer,
  };
}

const SuggestBrandsSchema = z.object({
  brands: z.array(z.string())
});

const SuggestBrandWebsiteSchema = z.object({
  website: z.string().nullable(),
});

export async function suggestBrandWebsite(brandName: string): Promise<string | null> {
  const normalized = brandName.trim();
  if (!normalized) return null;

  try {
    const response = await createChatCompletionWithFallback({
      messages: [
        {
          role: "system",
          content:
            "Return only the most likely official homepage URL for the given brand as structured output. Prefer the canonical top-level domain. If uncertain, return null.",
        },
        {
          role: "user",
          content: `Brand name: ${normalized}`,
        },
      ],
      response_format: zodResponseFormat(SuggestBrandWebsiteSchema, "suggest_brand_website"),
    });

    const text = response.choices[0].message.content || "{}";
    const parsed = JSON.parse(text) as { website?: string | null };
    if (!parsed.website) return null;

    const value = parsed.website.trim();
    if (!value) return null;

    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;

    try {
      const parsed = new URL(withProtocol);
      // Require a plausible hostname to avoid filling malformed values that block form submission.
      if (!parsed.hostname || !parsed.hostname.includes('.')) {
        return null;
      }
      return parsed.toString();
    } catch {
      return null;
    }
  } catch (error) {
    console.error("Failed to suggest brand website:", error);
    return null;
  }
}

export async function suggestBrands(partialName: string): Promise<string[]> {
  if (!partialName || partialName.length < 2) return [];
  try {
    const response = await createChatCompletionWithFallback({
      messages: [
        { role: "user", content: `Suggest 5 well-known brands, categories, or companies that match or start with the partial name: "${partialName}".` }
      ],
      response_format: zodResponseFormat(SuggestBrandsSchema, "suggest_brands"),
    });
    const text = response.choices[0].message.content || "{}";
    const parsed = JSON.parse(text);
    return parsed.brands || [];
  } catch (e) {
    console.error("Error suggesting brands:", e);
    return [];
  }
}

const AutoPopulateSchema = z.object({
  brand: z.string().nullable(),
  audience: z.string().nullable(),
  topicFocus: z.string().nullable()
});

export async function autoPopulateFields(
  brand: string,
  audience: string,
  topicFocus: string
): Promise<{ brand?: string, audience?: string, topicFocus?: string }> {
  const response = await createChatCompletionWithFallback({
    messages: [
      { role: "user", content: `Given the following partial information about a marketing or cultural strategy:
Brand or Category: ${brand || "(empty)"}
Primary Audience: ${audience || "(empty)"}
Topic Focus: ${topicFocus || "(empty)"}

Please infer the missing fields based on the provided fields. 
Only include the keys for the fields that were originally "(empty)".
Keep the inferred values concise (1-5 words).` }
    ],
    response_format: zodResponseFormat(AutoPopulateSchema, "auto_populate"),
  });

  const text = response.choices[0].message.content || "{}";
  return JSON.parse(text);
}

const MatrixItemSchema = z.object({
  text: z.string(),
  isHighlyUnique: z.boolean().describe("Set to true ONLY if this insight is extremely unique to this specific audience/group when compared against a baseline audience of the same average age, race/ethnicity, and gender breakdown, but OUTSIDE of the specific brand, industry, or topic being analyzed."),
  sourceType: z.string().describe("The type of source this insight was derived from (e.g., 'Mainstream', 'Niche/Fringe', 'Topic-Specific', 'Alternative Media', 'Academic', 'Social Media', etc.)"),
  confidenceLevel: z.enum(['low', 'medium', 'high']).describe("Confidence in this specific insight based on evidence quality and recency. Use 'high' when strongly corroborated by reliable recent sources, 'medium' when plausible with partial support, and 'low' when signal is weak or emerging."),
  trendLifecycle: z.enum(['emerging', 'peaking', 'declining']).describe("Position of this signal on the trend lifecycle S-curve. Use 'emerging' for early signals, 'peaking' for high adoption, and 'declining' for fading or replacement signals."),
  isFromDocument: z.boolean().nullable().describe("Set to true if this insight was derived from the attached documents.")
});

const SourceSchema = z.object({
  title: z.string(),
  url: z.string()
});

const CulturalMatrixSchema = z.object({
  demographics: z.object({
    age: z.string().nullable().describe("Age range for this audience. Use exact figures when available; otherwise infer from credible cultural signals and label inferred values with [INFERRED]."),
    race: z.string().nullable().describe("Race/ethnicity composition. Use exact figures when available; otherwise infer from credible cultural signals and label inferred values with [INFERRED]."),
    gender: z.string().nullable().describe("Gender composition. Use exact figures when available; otherwise infer from credible cultural signals and label inferred values with [INFERRED].")
  }),
  sociological_analysis: z.string().describe("A concise two-paragraph sociological summary of the socio-economic, historical, and cultural forces shaping this audience."),
  moments: z.array(MatrixItemSchema),
  beliefs: z.array(MatrixItemSchema),
  tone: z.array(MatrixItemSchema),
  language: z.array(MatrixItemSchema),
  behaviors: z.array(MatrixItemSchema),
  contradictions: z.array(MatrixItemSchema),
  community: z.array(MatrixItemSchema),
  influencers: z.array(MatrixItemSchema),
  vocabulary: z.object({
    wordsTheyUse: z.array(z.string()),
    wordsToAvoid: z.array(z.string()),
  }),
  sources: z.array(SourceSchema)
});

const BrandResearchAudienceSchema = z.object({
  audience: z.string(),
  priority: z.string(),
  inferredRoleToConsumers: z.string(),
  functionalBenefits: z.array(z.string()),
  emotionalBenefits: z.array(z.string()),
});

const BrandResearchMatrixSchema = z.object({
  analysisObjective: z.string(),
  ecosystemMethod: z.string(),
  results: z.array(
    z.object({
      brandName: z.string(),
      highLevelSummary: z.string(),
      brandMission: z.string().nullable().describe("Prefer exact mission wording when explicitly available. If not explicit, infer a concise mission from first-party website/about messaging and prepend [INFERRED]. Return null only when no credible first-party signal exists."),
      brandPositioning: z.object({
        taglines: z.array(z.string()),
        keyMessagesAndClaims: z.array(z.string()),
        valueProposition: z.string().nullable().describe("Return null if not found in evidence."),
        voiceAndTone: z.string(),
      }),
      keyOfferingsProductsServices: z.array(z.string()),
      strategicMoatsStrengths: z.array(z.string()),
      potentialThreatsWeaknesses: z.array(z.string()),
      challenges: z.array(z.string()).default([]).describe('Greatest challenges currently facing the brand/company. Keep concise, specific, and low-overlap with other sections.'),
      targetAudiences: z.array(BrandResearchAudienceSchema),
      recentCampaigns: z.array(z.string()),
      keyMarketingChannels: z.array(z.string()),
      socialMediaChannels: z.array(
        z.object({
          channel: z.string(),
          url: z.string(),
        })
      ),
      recentNews: z.array(
        z.union([
          z.string(),
          z.object({
            headline: z.string().nullable().optional(),
            title: z.string().nullable().optional(),
            url: z.string().nullable().optional(),
            publishedAt: z.string().nullable().optional(),
            outlet: z.string().nullable().optional(),
          }),
        ])
      ).default([]),
      sources: z.array(SourceSchema),
    })
  ),
  sources: z.array(SourceSchema),
});

const CulturalRawSignalsSchema = z.object({
  demographics: z.object({
    age: z.string().nullable(),
    race: z.string().nullable(),
    gender: z.string().nullable(),
  }),
  moments: z.array(z.string()),
  beliefs: z.array(z.string()),
  tone: z.array(z.string()),
  language: z.array(z.string()),
  behaviors: z.array(z.string()),
  contradictions: z.array(z.string()),
  community: z.array(z.string()),
  influencers: z.array(z.string()),
  sources: z.array(SourceSchema),
});

const CULTURAL_MATRIX_CATEGORY_KEYS = [
  'moments',
  'beliefs',
  'tone',
  'language',
  'behaviors',
  'contradictions',
  'community',
  'influencers',
] as const;

type CulturalMatrixCategoryKey = (typeof CULTURAL_MATRIX_CATEGORY_KEYS)[number];

type CulturalMatrixCategoryPromises = Record<CulturalMatrixCategoryKey, Promise<MatrixItem[]>>;

type CulturalMatrixGenerationContext = {
  audience: string;
  brand?: string;
  generations?: string[];
  topicFocus?: string;
  sourcesType?: string[];
  normalizedRerunFilters: CulturalRerunFilters;
  systemInstruction: string;
  evidenceDigest: string;
  behaviorEvidenceDigest?: string;
  allowedEvidenceUrlList: string;
  rawSignals: z.infer<typeof CulturalRawSignalsSchema>;
  stabilizedBeliefsForContradictions?: MatrixItem[];
  stabilizedBehaviorsForContradictions?: MatrixItem[];
};

const CulturalMatrixCategoryResultSchema = z.object({
  items: z.array(MatrixItemSchema),
  sources: z.array(SourceSchema).default([]),
});

const CulturalMatrixMetaSchema = z.object({
  demographics: z.object({
    age: z.string().nullable(),
    race: z.string().nullable(),
    gender: z.string().nullable(),
  }),
  sociological_analysis: z.string(),
  vocabulary: z.object({
    wordsTheyUse: z.array(z.string()),
    wordsToAvoid: z.array(z.string()),
  }),
  sources: z.array(SourceSchema),
});

const CULTURAL_CATEGORY_PROMPT_LABELS: Record<CulturalMatrixCategoryKey, string> = {
  moments: 'MOMENTS: Context of the time. What external forces are shaping behaviour right now? (Current events, social climate, trends)',
  beliefs: 'BELIEFS: Core values and perceptions, emphasizing stabilized consensus over fleeting controversy.',
  tone: 'TONE: What they feel and how they feel that is unique. (Attitude, emotions, personality, outlook)',
  language: 'LANGUAGE: How they communicate. (Vernacular, symbols, codes, visuals)',
  behaviors: 'BEHAVIORS: How they act/interact and what rituals carry meaning. (Actions, customs, rituals, ceremonies)',
  contradictions: 'CONTRADICTIONS: What tensions or shifts are emerging in values or behaviors?',
  community: 'COMMUNITY: Who do people look to for identity or belonging?',
  influencers: 'INFLUENCERS: People shaping their beliefs and behavior.',
};

export function buildCategoryRoleBlock(category: CulturalMatrixCategoryKey): string {
  if (category === 'moments') {
    return `
Role:
You are a Macro-Economic Trend Analyst.

Moments mandate:
- Analyze the provided Evidence Digest.
- Extract 6-10 Moments from the Evidence Digest.
- You MUST provide a balanced mix of:
  1) breaking, highly up-to-date cultural shifts from the last 7 days, and
  2) recurring, structural macro-economic forces.
- Layer in some psychological beliefs only when they are clearly tied to macro-forces.
- Primarily focus on hard macro-forces over soft speculation.`;
  }

  if (category === 'beliefs') {
    return `
Role:
You are a Digital Anthropologist.

Beliefs mandate:
- Analyze the raw, unfiltered Reddit discussion verbatim from the source data and evidence context.
- Extract 6-10 BELIEFS (core values and perceptions).
- Focus on stabilized, highly-corroborated consensus from the past several months.
- Ignore fleeting daily controversies or highly recent outrage.
- When applicable, include at least 1 recent topic and explicitly mark it as "Recent".`;
  }

  if (category === 'tone') {
    return `
Role:
You are a Psychographic Profiler.

Tone mandate:
- Analyze the provided social media comment corpus and evidence digest.
- Perform lexical sentiment analysis to determine the sustained emotional baseline of this audience over the past several months.
- Use the same stabilized, multi-month Evidence Digest standard used for BELIEFS.
- Ignore breaking-news/API recency spikes and reactive daily outrage so the tone does not mirror the 24-hour news cycle.
- Extract 6-10 Tone insights and map each insight to an archetype spectrum (for example: Stable vs Reactive, Hopeful vs Cynical, Guarded vs Expressive).`;
  }

  if (category === 'behaviors') {
    return `
Role:
You are a Behavioral Scientist.

Behavior mandate:
- Read the provided evidence digest.
- Temporal need: up-to-date but not most recent.
- Enhance interpretation for stabilized rituals (routine, habit, guide), not passing viral TikTok challenges.
- Extract 6-10 Behaviors.
- There are two distinct areas of focus:
  1) Consistent: Established, sustained actions, purchasing habits, and regular rituals.
  2) Recent: Passing fads, trends, and highly recent viral challenges.
- Balance the final results with what they do consistently and what they do recently.`;
  }

  if (category === 'contradictions') {
    return `
Role:
You are a Cultural Critic.

Contradictions mandate:
- Temporal need: up-to-date but not most recent.
- Use Dataset A (Card 2: what this audience says they believe) and Dataset B (Card 5: how this audience actually behaves).
- Contrast established, stated intent against sustained actual behavior over the last year to find hypocrisies and tensions.
- Explicitly cross-reference Dataset A and Dataset B in every contradiction so outputs are not generated from thin air.
- Double-check dataset integrity before producing contradictions.
- Extract 6-10 Contradictions or emerging tensions.
- Include an "Evidence Type" marker in each contradiction text (for example: [KNOWN], [INFERRED], [SPECULATIVE]).
- Final output text must use this exact narrative structure:
  "What they say: ..."
  "What they do: ..."
  "Tension: ..."
- Do NOT mention "Dataset A" or "Dataset B" in the final user-facing contradiction text.`;
  }

  if (category === 'community') {
    return `
Role:
You are a Network Graph Analyst.

Community mandate:
- Review the provided community evidence.
- Extract 6-10 Community identity anchors.
- You MUST provide a "barbell" mix:
  1) foundational, long-standing hubs (legacy forums/groups/people), and
  2) highly up-to-date, rapidly emerging micro-communities (fast-growing private channels, rising individual voice) from roughly the last 30 days.
- Use Bing/Reddit-informed evidence to balance foundational hubs with breakout micro-communities.
- Even if you have difficulty verifying the exact name/topic of a micro-community, fallback to identify the location of the community (for example: Reddit, Discord, Substack).`;
  }

  if (category === 'influencers') {
    return `
Role:
You are an Influencer Marketing Strategist.

Influencer mandate:
- Review the provided evidence.
- Temporal need: range of highly up-to-date to longer standing.
- Extract 6-10 Influencers.
- You MUST provide a "barbell" mix:
  1) 3-4 established, legacy authorities, and
  2) 3-4 breakout, high-velocity micro-creators making waves right now.
- Evaluate each influencer using this framework:
  1) Resonance (growth speed),
  2) Relevance (niche fit), and
  3) Penetration (visibility).
- If a Social Blade integration is available, query both:
  1) "Top Followers" (long standing), and
  2) "Highest 30-Day Growth" (up-to-date).
- Hallucination risk is high for current breakout names. If you are struggling to identify or assign a name, say so explicitly and avoid inventing names.`;
  }

  return '';
}

function buildRerunFiltersInstructionForCategory(rerunFilters?: CulturalRerunFilters): string {
  const confidenceLevels = rerunFilters?.confidenceLevels || [];
  const evidenceTypes = rerunFilters?.evidenceTypes || [];
  const trendStages = rerunFilters?.trendStages || [];
  const sourceTypes = rerunFilters?.sourceTypes || [];
  const hasFilters = confidenceLevels.length > 0 || evidenceTypes.length > 0 || trendStages.length > 0 || sourceTypes.length > 0;

  if (!hasFilters) return 'No filtered rerun constraints are active.';

  return `Filtered rerun constraints:
- confidenceLevel must be one of: ${confidenceLevels.join(', ') || 'any'}
- evidence marker in text must include one of: ${evidenceTypes.join(', ') || 'any'}
- trendLifecycle must be one of: ${trendStages.join(', ') || 'any'}
- sourceType should map to one of: ${sourceTypes.join(', ') || 'any'}`;
}

async function generateMatrixCategoryItems(
  context: CulturalMatrixGenerationContext,
  category: CulturalMatrixCategoryKey
): Promise<MatrixItem[]> {
  const contextStr = context.brand ? ` in the context of the brand/category: "${context.brand}"` : '';
  const topicStr = context.topicFocus ? `\nTopic focus: "${context.topicFocus}".` : '';
  const generationStr = context.generations && context.generations.length > 0
    ? `\nGeneration constraint: ${context.generations.join(', ')}.`
    : '';
  const sourcesTypeStr = context.sourcesType && context.sourcesType.length > 0
    ? `\nSource-type emphasis: ${context.sourcesType.join(', ')}.`
    : '';
  const categoryRoleBlock = buildCategoryRoleBlock(category);
  const categoryEvidenceDigest = category === 'behaviors' && context.behaviorEvidenceDigest
    ? context.behaviorEvidenceDigest
    : category === 'contradictions' && context.behaviorEvidenceDigest
      ? `${context.evidenceDigest}\n\nBehavior-focused stabilized evidence digest:\n${context.behaviorEvidenceDigest}`
    : context.evidenceDigest;
  const contradictionsDatasetABlock = category === 'contradictions'
    ? `
Internal reference input A (Card 2: Stated beliefs, stabilized; do not quote label):
${JSON.stringify(
  (context.stabilizedBeliefsForContradictions && context.stabilizedBeliefsForContradictions.length > 0
    ? context.stabilizedBeliefsForContradictions
    : (context.rawSignals.beliefs || []).map((text) => ({ text }))),
  null,
  2
)}

Internal reference input B (Card 5: Behavioral data, stabilized; do not quote label):
${JSON.stringify(
  (context.stabilizedBehaviorsForContradictions && context.stabilizedBehaviorsForContradictions.length > 0
    ? context.stabilizedBehaviorsForContradictions
    : (context.rawSignals.behaviors || []).map((text) => ({ text }))),
  null,
  2
)}` : '';
  const prompt = `Generate only the ${category.toUpperCase()} matrix category for audience "${context.audience}"${contextStr}.${topicStr}${generationStr}${sourcesTypeStr}

Category definition:
${CULTURAL_CATEGORY_PROMPT_LABELS[category]}
${categoryRoleBlock}

Raw signals for ${category}:
${JSON.stringify(context.rawSignals[category] || [])}

Full raw signal context:
${JSON.stringify(context.rawSignals)}

Evidence digest (quality and date weighted):
${categoryEvidenceDigest}

${contradictionsDatasetABlock}

Allowed source URLs from Evidence Digest (exact strings only):
${context.allowedEvidenceUrlList}

Rules:
- Return 6-10 items when evidence supports it. If evidence is weak, return fewer.
- Do not fabricate facts, statistics, URLs, dates, or sources.
- Use confidenceLevel rigorously: low | medium | high.
- Use trendLifecycle rigorously: emerging | peaking | declining.
- Use [KNOWN], [INFERRED], or [SPECULATIVE] labels in each item text where applicable.
- Keep the list sorted by potency (highest signal strength first).
- ${buildRerunFiltersInstructionForCategory(context.normalizedRerunFilters)}

Return JSON shape:
{
  "items": MatrixItem[],
  "sources": Source[]
}`;

  const parsed = await runStructuredCall({
    schema: CulturalMatrixCategoryResultSchema,
    schemaName: `cultural_matrix_${category}`,
    mode: 'cultural',
    outputType: 'analysis',
    messages: [
      { role: 'system', content: context.systemInstruction },
      { role: 'user', content: prompt },
    ],
    qualityGate: (payload) => !isThinStructuredPayload(payload),
    maxRetries: 2,
  });

  return parsed.items || [];
}

async function generateMoments(context: CulturalMatrixGenerationContext): Promise<MatrixItem[]> {
  return generateMatrixCategoryItems(context, 'moments');
}

async function generateBeliefs(context: CulturalMatrixGenerationContext): Promise<MatrixItem[]> {
  return generateMatrixCategoryItems(context, 'beliefs');
}

async function generateTone(context: CulturalMatrixGenerationContext): Promise<MatrixItem[]> {
  return generateMatrixCategoryItems(context, 'tone');
}

async function generateLanguage(context: CulturalMatrixGenerationContext): Promise<MatrixItem[]> {
  return generateMatrixCategoryItems(context, 'language');
}

async function generateBehaviors(context: CulturalMatrixGenerationContext): Promise<MatrixItem[]> {
  return generateMatrixCategoryItems(context, 'behaviors');
}

async function generateContradictions(context: CulturalMatrixGenerationContext): Promise<MatrixItem[]> {
  const items = await generateMatrixCategoryItems(context, 'contradictions');
  return normalizeContradictionItems(items);
}

async function generateCommunity(context: CulturalMatrixGenerationContext): Promise<MatrixItem[]> {
  return generateMatrixCategoryItems(context, 'community');
}

async function generateInfluencers(context: CulturalMatrixGenerationContext): Promise<MatrixItem[]> {
  return generateMatrixCategoryItems(context, 'influencers');
}

async function generateCulturalMatrixMeta(context: CulturalMatrixGenerationContext): Promise<z.infer<typeof CulturalMatrixMetaSchema>> {
  const contextStr = context.brand ? ` in the context of the brand/category: "${context.brand}"` : '';
  const topicStr = context.topicFocus ? `\nTopic focus: "${context.topicFocus}".` : '';
  const generationStr = context.generations && context.generations.length > 0
    ? `\nGeneration constraint: ${context.generations.join(', ')}.`
    : '';
  const sourcesTypeStr = context.sourcesType && context.sourcesType.length > 0
    ? `\nSource-type emphasis: ${context.sourcesType.join(', ')}.`
    : '';

  const prompt = `Generate the non-category cultural matrix metadata for audience "${context.audience}"${contextStr}.${topicStr}${generationStr}${sourcesTypeStr}

Raw signals:
${JSON.stringify(context.rawSignals)}

Evidence digest (quality and date weighted):
${context.evidenceDigest}

Allowed source URLs from Evidence Digest (exact strings only):
${context.allowedEvidenceUrlList}

Rules:
- sociological_analysis must be exactly two concise paragraphs.
- Demographics may be inferred when exact statistics are unavailable, but inferred values must be labeled [INFERRED].
- Do not fabricate URLs or sources.
- vocabulary lists must be practical, concise, and immediately useful for copywriters.

Return JSON shape:
{
  "demographics": { "age": string | null, "race": string | null, "gender": string | null },
  "sociological_analysis": string,
  "vocabulary": { "wordsTheyUse": string[], "wordsToAvoid": string[] },
  "sources": Source[]
}`;

  return runStructuredCall({
    schema: CulturalMatrixMetaSchema,
    schemaName: 'cultural_matrix_meta',
    mode: 'cultural',
    outputType: 'analysis',
    messages: [
      { role: 'system', content: context.systemInstruction },
      { role: 'user', content: prompt },
    ],
    qualityGate: (payload) => !isThinStructuredPayload(payload),
    maxRetries: 2,
  });
}

export async function resolveMatrixCategoryResultsWithFallback(
  categoryPromises: CulturalMatrixCategoryPromises
): Promise<Record<CulturalMatrixCategoryKey, MatrixItem[]>> {
  const entries = await Promise.all(
    CULTURAL_MATRIX_CATEGORY_KEYS.map(async (category) => {
      try {
        const items = await categoryPromises[category];
        console.log(`[cultural-matrix] Category "${category}" generated.`, { itemCount: items.length });
        return [category, items] as [CulturalMatrixCategoryKey, MatrixItem[]];
      } catch (error) {
        logDetailedError(error, `[cultural-matrix] Category "${category}" failed; applying empty-array fallback.`);
        return [category, []] as [CulturalMatrixCategoryKey, MatrixItem[]];
      }
    })
  );

  return entries.reduce((acc, [category, items]) => {
    acc[category] = items;
    return acc;
  }, {} as Record<CulturalMatrixCategoryKey, MatrixItem[]>);
}

export async function generateCulturalMatrix(
  audience: string,
  brand?: string,
  generations?: string[],
  topicFocus?: string,
  files?: UploadedFile[],
  sourcesType?: string[],
  rerunFilters?: CulturalRerunFilters
): Promise<CulturalMatrix> {
  const contextStr = brand ? ` in the context of the brand/category: "${brand}"` : "";
  const topicStr = topicFocus ? `\n\nCRITICAL: You MUST focus all your insights specifically on the topic of "${topicFocus}". Only show results relevant to this topic.` : "";
  const generationStr = generations && generations.length > 0
    ? `\n\nCRITICAL: You MUST restrict your research and insights ONLY to the following generations: ${generations.join(', ')}.`
    : "";
  const hasUploadedDocuments = Boolean(files && files.length > 0);
  const filesStr = files && files.length > 0
    ? `\n\nI have attached some documents. Please use ONLY the information from these documents and the provided Evidence Digest. If an insight is derived from the attached documents, please set isFromDocument to true.`
    : "";
  const sourcesTypeStr = sourcesType && sourcesType.length > 0
    ? `\n\nCRITICAL: You MUST restrict your sources and insights to be derived primarily from ${sourcesType.join(', ')} sources. Adjust your tone, findings, and the specific cultural signals you highlight to reflect the unique perspective, narratives, and biases of these media types.`
    : "";
  const normalizedRerunFilters: CulturalRerunFilters = {
    confidenceLevels: Array.from(new Set((rerunFilters?.confidenceLevels || []).map((item) => item.trim().toLowerCase() as 'low' | 'medium' | 'high')))
      .filter((item) => item === 'low' || item === 'medium' || item === 'high'),
    evidenceTypes: Array.from(new Set((rerunFilters?.evidenceTypes || []).map((item) => item.trim().toLowerCase() as 'known' | 'inferred' | 'speculative')))
      .filter((item) => item === 'known' || item === 'inferred' || item === 'speculative'),
    trendStages: Array.from(new Set((rerunFilters?.trendStages || []).map((item) => item.trim().toLowerCase() as 'emerging' | 'peaking' | 'declining')))
      .filter((item) => item === 'emerging' || item === 'peaking' || item === 'declining'),
    sourceTypes: Array.from(new Set((rerunFilters?.sourceTypes || []).map((item) => item.trim()).filter(Boolean))),
  };
  const rerunConfidenceLevels = normalizedRerunFilters.confidenceLevels || [];
  const rerunEvidenceTypes = normalizedRerunFilters.evidenceTypes || [];
  const rerunTrendStages = normalizedRerunFilters.trendStages || [];
  const rerunSourceTypes = normalizedRerunFilters.sourceTypes || [];
  const hasRerunFilters =
    rerunConfidenceLevels.length > 0 ||
    rerunEvidenceTypes.length > 0 ||
    rerunTrendStages.length > 0 ||
    rerunSourceTypes.length > 0;
  const rerunFiltersStr = hasRerunFilters
    ? `\n\nCRITICAL FILTERED RERUN MODE:
    This is a rerun targeted to the currently selected filters.
    Return as many matching insights as can be supported by credible evidence.
    If evidence is insufficient, return fewer insights. Never fabricate to fill quota.
    Enforce these filters on every matrix item:
    - confidenceLevel must be one of: ${rerunConfidenceLevels.join(', ') || 'any'}
    - evidence marker in text must include one of: ${rerunEvidenceTypes.join(', ') || 'any'}
    - trendLifecycle must be one of: ${rerunTrendStages.join(', ') || 'any'}
    - sourceType should map to one of: ${rerunSourceTypes.join(', ') || 'any'}`
    : "";
  console.log('[cultural-matrix] Filtered rerun settings', {
    hasRerunFilters,
    normalizedRerunFilters,
  });

  const systemInstruction = composeSystemPrompt(
    'You are an expert cultural strategist and marketer. Your goal is to provide deep, accurate, and actionable cultural insights for the requested audience based on recent data. Highlight results that are extremely unique to this audience by setting isHighlyUnique to true (comparing them against demographic peers who are NOT involved in this specific brand, industry, or topic). Before listing the final artifacts, you MUST write a two-paragraph sociological_analysis explaining the socio-economic, historical, and cultural forces shaping this specific audience, and use that summary to derive the final data points. Do not expose private chain-of-thought; provide only the concise sociological summary in the sociological_analysis field.',
    'cultural'
  );

  const evidenceDigest = await gatherEvidenceForTopic(
    `Audience: ${audience}; Brand: ${brand || 'n/a'}; Topic: ${topicFocus || 'n/a'}; Generations: ${(generations || []).join(', ') || 'n/a'}`,
    'cultural'
  );
  const behaviorEvidenceDigest = await gatherEvidenceForTopic(
    `Audience: ${audience}; Brand: ${brand || 'n/a'}; Topic: ${topicFocus || 'n/a'}; Focus: routines habits guides behavioral rituals; Generations: ${(generations || []).join(', ') || 'n/a'}`,
    'cultural',
    'behaviors'
  );
  const allowedEvidenceUrls = extractUrlsFromEvidenceDigest(evidenceDigest);
  const allowedBehaviorEvidenceUrls = extractUrlsFromEvidenceDigest(behaviorEvidenceDigest);
  const mergedAllowedEvidenceUrls = Array.from(new Set([...allowedEvidenceUrls, ...allowedBehaviorEvidenceUrls]));
  const allowedEvidenceUrlList = mergedAllowedEvidenceUrls.length > 0
    ? mergedAllowedEvidenceUrls.map((url, idx) => `${idx + 1}. ${url}`).join('\n')
    : 'No source URLs were provided in the Evidence Digest.';
  console.log('[cultural-matrix] Extracted evidence URL allowlist.', {
    allowlistCount: mergedAllowedEvidenceUrls.length,
    allowlist: mergedAllowedEvidenceUrls,
  });
  let redditVerbatim = "";
  try {
    // Naive subreddit guess based on the first word of the audience
    const subredditGuess = audience.split(' ')[0].replace(/[^a-zA-Z0-9]/g, '');
    if (subredditGuess) {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/reddit?subreddit=${encodeURIComponent(subredditGuess)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.quotes && data.quotes.length > 0) {
          redditVerbatim = `\n\nRaw Social Listening Verbatim (Reddit):\n${data.quotes.join('\n')}`;
        }
      }
    }
  } catch (e) {
    console.warn("Could not fetch Reddit verbatim:", e);
  }

  const prompt = `Generate a comprehensive cultural archaeologist report for the following audience: "${audience}"${contextStr}.${topicStr}${generationStr}${filesStr}${sourcesTypeStr}${rerunFiltersStr}
    
    Ensure the research and context are recent (from the last couple of years, 2024-2026).
    CRITICAL: For each category, provide at least 6-10 highly detailed and specific insights to ensure a rich and comprehensive report.
    CRITICAL: Within each category, you MUST order the observations by "potency" (i.e., the frequency and strength of the cultural signal), with the most potent observations first.
    CRITICAL: You are acting as a senior marketing strategist. The ideas and insights you bring MUST be new, exciting, contrarian, and something the client has likely never heard before. Avoid mainstream consensus and obvious observations. Focus on "weak signals", emerging fringe behaviors, counter-intuitive trends, and deep psychological drivers that are not widely discussed.
    CRITICAL: Each insight must include confidenceLevel = low | medium | high based on evidence quality and recency.
    CRITICAL: Each insight must include trendLifecycle = emerging | peaking | declining based on your assessment of where the signal sits on an S-curve right now.
    
    Categorize the insights into:
    - MOMENTS: Context of the time. What external forces are shaping behaviour right now? (Current events, Social climate, Trends)
    - BELIEFS: Core values and perceptions anchored in stabilized consensus from the past several months, not daily outrage. Include at least 1 "Recent" topic when applicable.
    - TONE: What they feel and how they feel that is unique (Attitude, Emotions, Personality, Outlook)
    - LANGUAGE: How they communicate (Vernacular, Symbols, Codes, Visuals)
    - BEHAVIORS: How they act/interact. What signals, symbols, or rituals carry meaning? (Actions, Customs, Rituals, Ceremonies)
    - CONTRADICTIONS: What tensions or shifts are emerging in values or behaviors?
    - COMMUNITY: Who do people look to for identity or belonging?
    - INFLUENCERS: People who are shaping their beliefs & behavior.

    Also provide a Vocabulary Extractor for copywriters with:
    - wordsTheyUse: common words and terms this audience naturally uses.
    - wordsToAvoid: words that feel inauthentic, corporate, or off-tone for this audience.
    
    Also provide a demographic breakdown (age, race/ethnicity, gender).
    Prefer exact statistics when available, but you may infer demographics from credible cultural signals when exact splits are unavailable.

    SOURCE GROUNDING:
    Every claim in the demographics and behavior sections MUST be grounded in the provided Evidence Digest.
    Do NOT invent URLs or sources. If you quote a source, you must use the exact URL provided in the Evidence Digest.
    If a demographic value is inferred rather than statistically proven, label it with [INFERRED].

    Evidence digest (quality and date weighted):
    ${evidenceDigest}
    
    Allowed source URLs from Evidence Digest (exact strings only):
    ${allowedEvidenceUrlList}
    ${redditVerbatim}`;

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemInstruction },
    { role: "user", content: prompt }
  ];

  // Add file contents if any (Azure OpenAI supports base64 images, but for documents, 
  // you typically extract text and append it to the prompt)
  if (files && files.length > 0) {
    const fileContents = files.map(f => `File: ${f.name}\nContent: ${f.data}`).join("\n\n");
    messages.push({ role: "user", content: `Attached Documents:\n${fileContents}` });
  }

  const rawSignals = await runStructuredCall({
    schema: CulturalRawSignalsSchema,
    schemaName: 'cultural_raw_signals',
    mode: 'cultural',
    outputType: 'analysis',
    messages,
    qualityGate: (payload) => !isThinStructuredPayload(payload),
    maxRetries: 3,
  });

  const generationContext: CulturalMatrixGenerationContext = {
    audience,
    brand,
    generations,
    topicFocus,
    sourcesType,
    normalizedRerunFilters,
    systemInstruction,
    evidenceDigest,
    behaviorEvidenceDigest,
    allowedEvidenceUrlList,
    rawSignals,
  };

  const categoryResults = await resolveMatrixCategoryResultsWithFallback({
    moments: generateMoments(generationContext),
    beliefs: generateBeliefs(generationContext),
    tone: generateTone(generationContext),
    language: generateLanguage(generationContext),
    behaviors: generateBehaviors(generationContext),
    contradictions: Promise.resolve([]),
    community: generateCommunity(generationContext),
    influencers: generateInfluencers(generationContext),
  });
  let contradictionItems: MatrixItem[] = [];
  try {
    contradictionItems = await generateContradictions({
      ...generationContext,
      stabilizedBeliefsForContradictions: categoryResults.beliefs,
      stabilizedBehaviorsForContradictions: categoryResults.behaviors,
    });
    console.log('[cultural-matrix] Contradictions generated from stabilized beliefs/behaviors cross-reference.', {
      beliefCount: categoryResults.beliefs.length,
      behaviorCount: categoryResults.behaviors.length,
      contradictionCount: contradictionItems.length,
    });
  } catch (error) {
    logDetailedError(error, '[cultural-matrix] Contradictions generation failed after stabilized cross-reference; applying empty-array fallback.');
  }

  const meta = await generateCulturalMatrixMeta(generationContext).catch((error) => {
    logDetailedError(error, '[cultural-matrix] Metadata generation failed; applying safe defaults.');
    return {
      demographics: {
        age: null,
        race: null,
        gender: null,
      },
      sociological_analysis: '',
      vocabulary: {
        wordsTheyUse: [],
        wordsToAvoid: [],
      },
      sources: [],
    };
  });

  const interpretedMatrix: CulturalMatrix = {
    demographics: meta.demographics,
    sociological_analysis: meta.sociological_analysis,
    moments: categoryResults.moments,
    beliefs: categoryResults.beliefs,
    tone: categoryResults.tone,
    language: categoryResults.language,
    behaviors: categoryResults.behaviors,
    contradictions: contradictionItems,
    community: categoryResults.community,
    influencers: categoryResults.influencers,
    vocabulary: meta.vocabulary,
    sources: sanitizeSources([...(meta.sources || []), ...(rawSignals.sources || [])]),
  };

  const backfillDemographicField = (
    interpretedValue?: string | null,
    rawValue?: string | null
  ): string | null => {
    const interpretedSanitized = sanitizeDemographicWithInferenceFallback(interpretedValue);
    if (interpretedSanitized) return interpretedValue || interpretedSanitized;

    const rawSanitized = sanitizeDemographicWithInferenceFallback(rawValue);
    if (rawSanitized) {
      return /\[(KNOWN|INFERRED|INFERED|SPECULATIVE)\]/i.test(rawValue || '')
        ? (rawValue || rawSanitized)
        : `[INFERRED] ${rawSanitized}`;
    }
    return interpretedValue || null;
  };

  interpretedMatrix.demographics = {
    age: backfillDemographicField(interpretedMatrix.demographics?.age, rawSignals.demographics?.age),
    race: backfillDemographicField(interpretedMatrix.demographics?.race, rawSignals.demographics?.race),
    gender: backfillDemographicField(interpretedMatrix.demographics?.gender, rawSignals.demographics?.gender),
  };
  console.log('[cultural-matrix] Demographic backfill check', {
    interpretedDemographics: interpretedMatrix.demographics,
    rawSignalDemographics: rawSignals.demographics || null,
  });

  const devil = await runDevilsAdvocatePass(`Cultural matrix for ${audience}`, interpretedMatrix, 'cultural');
  interpretedMatrix.contradictions = [
    ...interpretedMatrix.contradictions,
    {
      text: `[SPECULATIVE] Devil's advocate lens: ${summarizeDevilsAdvocateLens(devil)}`,
      isHighlyUnique: false,
      sourceType: 'Methodological challenge',
      confidenceLevel: 'low' as const,
      trendLifecycle: 'emerging' as const,
      isFromDocument: false,
      backgroundWriteup: buildDevilsAdvocateBackgroundWriteup(devil),
    },
  ].slice(0, 10);

  const sanitized = sanitizeCulturalMatrix(interpretedMatrix, hasUploadedDocuments, allowedEvidenceUrls);
  updateSessionBrief('cultural', sanitized);
  return sanitized;
}

export async function generateBrandResearchMatrix(
  audience: string,
  brands: { name: string; website?: string }[],
  generations?: string[],
  topicFocus?: string,
  files?: UploadedFile[],
  sourcesType?: string[]
): Promise<BrandResearchMatrix> {
  const sanitizedBrandTargets = Array.from(
    new Map(
      (brands || [])
        .map((brand) => ({
          name: (brand?.name || '').trim(),
          website: (brand?.website || '').trim(),
        }))
        .filter((brand) => Boolean(brand.name))
        .map((brand) => [brand.name.toLowerCase(), brand] as const)
    ).values()
  );
  const sanitizedBrands = sanitizedBrandTargets.map((brand) => brand.name);
  const brandContext = sanitizedBrands.join(', ');
  const topicStr = topicFocus ? `\n\nCRITICAL: Focus all findings on the topic "${topicFocus}".` : '';
  const audienceStr = audience?.trim() ? `\n\nPrimary audience context: "${audience.trim()}".` : '';
  const generationStr = generations && generations.length > 0
    ? `\n\nCRITICAL: Restrict findings to these generations when evidence is available: ${generations.join(', ')}.`
    : '';
  const filesStr = files && files.length > 0
    ? `\n\nUse attached documents as supporting evidence alongside broader research.`
    : '';
  const sourcesTypeStr = sourcesType && sourcesType.length > 0
    ? `\n\nCRITICAL: Prioritize sources from: ${sourcesType.join(', ')}.`
    : '';

  const systemInstruction = composeSystemPrompt(
    'You are an expert brand strategist. Use rigorous, recent, evidence-based research and produce structured competitive brand intelligence.',
    'brand'
  );

  const websiteTargets = await Promise.all(
    sanitizedBrandTargets.map(async (brandTarget) => {
      const guessedWebsite = brandTarget.website || await suggestBrandWebsite(brandTarget.name);
      return {
        brand: brandTarget.name,
        website: guessedWebsite,
      };
    })
  );

  const websiteContexts = (
    await Promise.all(
      websiteTargets
        .filter((item) => Boolean(item.website))
        .map(async (item) => {
          try {
            return await fetchBrandWebsiteContext(item.brand, item.website!);
          } catch (error) {
            console.error('[brand-research] Failed to fetch website grounding context', {
              brand: item.brand,
              website: item.website,
              error,
            });
            return null;
          }
        })
    )
  ).filter((item): item is NonNullable<typeof item> => Boolean(item));

  console.log('[brand-research] Website grounding summary', {
    brandCount: sanitizedBrands.length,
    groundedBrands: websiteContexts.length,
    domains: websiteContexts.map((item) => item.website),
  });

  const websiteGroundingContext = buildBrandWebsiteContextPrompt(websiteContexts);

  const evidenceDigest = await gatherEvidenceForTopic(
    `Brands: ${brandContext}; Audience: ${audience || 'n/a'}; Topic: ${topicFocus || 'n/a'}; Generations: ${(generations || []).join(', ') || 'n/a'}`,
    'brand'
  );
  const evidenceMode = resolveBrandEvidenceMode(evidenceDigest, websiteGroundingContext);
  const evidenceRulesBlock = buildBrandEvidenceRulesBlock(evidenceMode);
  if (evidenceMode === 'inferred-fallback') {
    console.warn('[brand-research] Falling back to inferred mode because evidence digest and website grounding are unavailable.');
  }

  const brandWebsiteGuide = websiteTargets
    .filter((target) => Boolean((target.website || '').trim()))
    .map((target) => `- ${target.brand}: ${target.website}`)
    .join('\n');
  const websiteGuideStr = brandWebsiteGuide
    ? `\n\nBrand website anchors (use these URLs as the primary entity guide, especially for mission extraction):\n${brandWebsiteGuide}`
    : '';

  const prompt = `Generate a brand intelligence report for the following brands: ${brandContext}.${audienceStr}${topicStr}${generationStr}${filesStr}${sourcesTypeStr}${websiteGuideStr}

Requirements:
- Use the same research rigor: recent evidence (2024-2026), explicit uncertainty handling, and source grounding.
- For "strategicMoatsStrengths" and "potentialThreatsWeaknesses", heavily weigh financial filings, investor relations data, and aggregate review data. Look past marketing fluff to find actual business realities.
- For "brandPositioning" and "targetAudiences", prioritize quotes and strategies mentioned by executives in interviews or trade press.
${evidenceRulesBlock}
- Return one complete result object per brand in "results".
- Each brand result must include:
  1) highLevelSummary (2-4 sentence executive summary of strategy, positioning, and market posture)
  2) brandMission:
     - Use explicit mission text when found.
     - If exact mission is not explicitly stated, infer from first-party website/about language and prepend [INFERRED].
     - Do not leave null unless no credible first-party signal exists.
  3) brandPositioning:
     - taglines
     - keyMessagesAndClaims
     - valueProposition
     - voiceAndTone
  4) keyOfferingsProductsServices
  5) strategicMoatsStrengths
  6) potentialThreatsWeaknesses
  7) challenges:
     - answer: "What are the greatest challenges facing the brand/company?"
     - make brand, marketing, and audience/customer challenges the majority of items.
     - include at least one business/macro challenge (for example inflation, regulation, financing/cost-of-capital, or broader economic pressure).
     - place business/macro challenge items at the bottom of the list.
     - keep overlap with other sections limited (do not repeat near-identical lines from moats, threats, campaigns, channels, or positioning).
  8) targetAudiences:
     - audience
     - priority
     - inferredRoleToConsumers
     - functionalBenefits
     - emotionalBenefits
  9) recentCampaigns
  10) keyMarketingChannels
  11) socialMediaChannels with channel and full URL
  12) recentNews as actual recent brand/company article headlines from credible news outlets, each with:
     - headline
     - full article URL
     - publishedAt (ISO date if available)
     - outlet
- Include at least 3 recentNews items per brand when credible coverage exists.
- Prefer recentNews items published within the last 6 months.
- recentNews must be ordered most recent first.
- Keep entries concise and specific (no vague filler).
- Provide sources at both the per-brand level and global level.

Evidence digest (quality and date weighted):
${evidenceDigest}

${websiteGroundingContext ? `\n${websiteGroundingContext}` : ''}`;

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemInstruction },
    { role: 'user', content: prompt },
  ];

  if (files && files.length > 0) {
    const fileContents = files.map((f) => `File: ${f.name}\nContent: ${f.data}`).join('\n\n');
    messages.push({ role: 'user', content: `Attached Documents:\n${fileContents}` });
  }

  const report = await runStructuredCall({
    schema: BrandResearchMatrixSchema,
    schemaName: 'brand_research_matrix',
    mode: 'brand',
    outputType: 'analysis',
    messages,
    qualityGate: (payload) => Array.isArray(payload.results) && payload.results.length >= Math.max(1, sanitizedBrands.length),
    maxRetries: 3,
  });

  const withNormalizedNews = filterRecentNewsToTopMainstream(report);
  const withMissionFallbacks = applyBrandMissionFallbacks(withNormalizedNews, websiteTargets);
  return reduceChallengeOverlapInBrandMatrix(withMissionFallbacks);
}

const BRAND_SECTION_OVERLAP_STOPWORDS = new Set([
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

const normalizeBrandSectionTextForOverlap = (value: string): string => {
  return value
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
};

const tokenizeBrandSectionForOverlap = (value: string): string[] => {
  return normalizeBrandSectionTextForOverlap(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !BRAND_SECTION_OVERLAP_STOPWORDS.has(token));
};

const containsChallengeTerm = (value: string, terms: string[]): boolean => {
  const normalized = normalizeBrandSectionTextForOverlap(value);
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

const hasHighBrandSectionOverlap = (candidate: string, reference: string): boolean => {
  const normalizedCandidate = normalizeBrandSectionTextForOverlap(candidate);
  const normalizedReference = normalizeBrandSectionTextForOverlap(reference);
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

  const candidateTokens = tokenizeBrandSectionForOverlap(candidate);
  const referenceTokens = tokenizeBrandSectionForOverlap(reference);
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

const collectNonChallengeLinesForBrandResult = (brandResult: BrandResearchResult): string[] => {
  const positioning = brandResult.brandPositioning || {
    taglines: [],
    keyMessagesAndClaims: [],
    valueProposition: null,
    voiceAndTone: '',
  };
  const targetAudienceLines = (brandResult.targetAudiences || []).flatMap((entry) => [
    entry.audience,
    entry.priority,
    entry.inferredRoleToConsumers,
    ...(entry.functionalBenefits || []),
    ...(entry.emotionalBenefits || []),
  ]);
  const socialLines = (brandResult.socialMediaChannels || []).flatMap((entry) => [
    entry.channel,
    entry.url,
    `${entry.channel || ''} ${entry.url || ''}`.trim(),
  ]);
  const recentNewsLines = (brandResult.recentNews || []).flatMap((entry) => {
    if (typeof entry === 'string') {
      return [entry];
    }
    return [
      (entry.headline || entry.title || '').trim(),
      (entry.url || '').trim(),
    ];
  });

  return [
    brandResult.highLevelSummary || '',
    brandResult.brandMission || '',
    ...(positioning.taglines || []),
    ...(positioning.keyMessagesAndClaims || []),
    positioning.valueProposition || '',
    positioning.voiceAndTone || '',
    ...(brandResult.keyOfferingsProductsServices || []),
    ...(brandResult.strategicMoatsStrengths || []),
    ...(brandResult.potentialThreatsWeaknesses || []),
    ...targetAudienceLines,
    ...(brandResult.recentCampaigns || []),
    ...(brandResult.keyMarketingChannels || []),
    ...socialLines,
    ...recentNewsLines,
  ]
    .map((value) => (value || '').trim())
    .filter((value) => value.length > 0);
};

function reduceChallengeOverlapInBrandMatrix(report: BrandResearchMatrix): BrandResearchMatrix {
  const normalizedResults = (report.results || []).map((brandResult) => {
    const rawChallenges = (brandResult.challenges || [])
      .map((value) => (value || '').trim())
      .filter((value) => value.length > 0);
    if (rawChallenges.length === 0) {
      return {
        ...brandResult,
        challenges: [],
      };
    }

    const otherSectionLines = collectNonChallengeLinesForBrandResult(brandResult);
    const filteredChallenges: string[] = [];

    rawChallenges.forEach((challenge) => {
      const overlapsOtherSection = otherSectionLines.some((line) => hasHighBrandSectionOverlap(challenge, line));
      if (overlapsOtherSection) {
        return;
      }

      const overlapsKeptChallenge = filteredChallenges.some((line) => hasHighBrandSectionOverlap(challenge, line));
      if (overlapsKeptChallenge) {
        return;
      }

      filteredChallenges.push(challenge);
    });

    const normalizedChallenges = filteredChallenges.length > 0
      ? filteredChallenges
      : rawChallenges.filter(
        (challenge, index, list) =>
          list.findIndex((entry) => hasHighBrandSectionOverlap(entry, challenge)) === index
      ).slice(0, 1);

    return {
      ...brandResult,
      challenges: prioritizeChallengesForMixAndOrder(normalizedChallenges),
    };
  });

  return {
    ...report,
    results: normalizedResults,
  };
}

function filterRecentNewsToTopMainstream(report: BrandResearchMatrix): BrandResearchMatrix {
  const normalizedResults = (report.results || []).map((brandResult) => {
    const seen = new Set<string>();
    const normalizedNews: ValidatedNewsItem[] = [];

    for (const candidate of brandResult.recentNews || []) {
      const normalizedCandidate = normalizeRawRecentNewsCandidate(candidate as RawRecentNewsCandidate);
      const headline = (normalizedCandidate.headline || '').trim();
      const normalizedUrl = normalizeExternalHttpUrl(normalizedCandidate.url);
      const publishedAt = normalizeIsoDate(normalizedCandidate.publishedAt);
      const outlet = (normalizedCandidate.outlet || '').trim() || null;

      if (!headline || !normalizedUrl) continue;
      if (!isLikelyArticleUrl(normalizedUrl) || isSocialMediaUrl(normalizedUrl)) continue;
      if (publishedAt && !isWithinLastSixMonths(publishedAt)) continue;

      const dedupeKey = normalizedUrl.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      normalizedNews.push({
        headline,
        url: normalizedUrl,
        publishedAt: publishedAt || null,
        outlet,
      });
    }

    if (normalizedNews.length === 0) {
      const sourceFallback = deriveRecentNewsFromSources(brandResult.sources);
      sourceFallback.forEach((item) => {
        const dedupeKey = item.url.toLowerCase();
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);
        normalizedNews.push(item);
      });
      console.log('[brand-research] recentNews fallback from sources applied', {
        brandName: brandResult.brandName,
        fallbackCount: sourceFallback.length,
      });
    }

    normalizedNews.sort(compareNewsByMostRecent);

    return {
      ...brandResult,
      recentNews: normalizedNews.slice(0, 8),
    };
  });

  return {
    ...report,
    results: normalizedResults,
  };
}

// Re-export types for convenience
