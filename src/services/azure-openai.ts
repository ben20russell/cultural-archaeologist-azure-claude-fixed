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
import { isLikelyArticleUrl, isTopMainstreamNewsUrl, TOP_MAINSTREAM_NEWS_HOSTS } from './news-outlets';

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
  valueProposition: string;
  voiceAndTone: string;
}

export interface BrandResearchResult {
  brandName: string;
  highLevelSummary: string;
  brandMission: string;
  brandPositioning: BrandResearchPositioning;
  keyOfferingsProductsServices: string[];
  strategicMoatsStrengths: string[];
  potentialThreatsWeaknesses: string[];
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

export interface DeepDiveReport {
  originationDate: string;
  relevance: string;
  expandedContext: string;
  strategicImplications: string[];
  realWorldExamples: string[];
  sources: Source[];
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
};

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
  const details = error as RetryableDeploymentError | undefined;
  const status = details?.status;
  const code = (details?.code || '').toLowerCase();
  const message = (details?.message || '').toLowerCase();

  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return true;
  }

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
        });
      }

      return response;
    } catch (error) {
      lastError = error;
      console.error('[azure-openai] Deployment call failed:', {
        deployment,
        status: (error as RetryableDeploymentError)?.status,
        code: (error as RetryableDeploymentError)?.code,
        message: (error as RetryableDeploymentError)?.message,
      });

      if (!hasAnotherDeployment || !shouldRetryWithAlternateDeployment(error)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Azure OpenAI call failed for all deployments.');
}

// Zod schemas for structured outputs
const DeepDiveReportSchema = z.object({
  originationDate: z.string(),
  relevance: z.string(),
  expandedContext: z.string(),
  strategicImplications: z.array(z.string()),
  realWorldExamples: z.array(z.string()),
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
  consolidatedSummary: z.string().describe('A concise summary that preserves every material claim from the full counter-argument and weaknesses.'),
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
];

type ValidatedNewsItem = {
  headline: string;
  url: string;
  publishedAt?: string | null;
  outlet?: string | null;
};

const normalizeIsoDate = (value?: string | null): string | null => {
  const trimmed = (value || '').trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

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

  return {
    headline: ((candidate.headline || candidate.title || '') || '').trim() || undefined,
    url: normalizeExternalHttpUrl(candidate.url || undefined) || undefined,
    publishedAt: candidate.publishedAt || null,
    outlet: (candidate.outlet || '').trim() || null,
  };
};

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

function scoreEvidenceDomain(url: string): { quality: 'authoritative' | 'mainstream' | 'behavioral' | 'community' | 'unknown'; weight: number } {
  const hostname = getHostname(url);
  if (!hostname) return { quality: 'unknown', weight: 0.5 };
  if (/reddit\.com$/i.test(hostname)) return { quality: 'behavioral', weight: 0.85 };
  if (AUTHORITATIVE_DOMAIN_PATTERNS.some((pattern) => pattern.test(hostname))) return { quality: 'authoritative', weight: 1.3 };
  if (/quora\.com$|discord\.com$|facebook\.com$|x\.com$|twitter\.com$/i.test(hostname)) return { quality: 'community', weight: 0.7 };
  return { quality: 'mainstream', weight: 1.0 };
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
  const maxRetries = params.maxRetries ?? 2;
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

      if (params.qualityGate && !params.qualityGate(parsed)) {
        if (attempt < maxRetries) {
          continue;
        }
      }

      updateSessionBrief(params.mode, parsed);
      return parsed;
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) {
        break;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Structured call failed after retries.');
}

async function createTargetedSubQueries(topic: string, mode: SessionMode): Promise<string[]> {
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

  return plan.queries.map((query) => query.trim()).filter(Boolean).slice(0, 5);
}

async function gatherEvidenceForTopic(topic: string, mode: SessionMode): Promise<string> {
  const queries = await createTargetedSubQueries(topic, mode);
  if (!queries.length) return 'Evidence digest unavailable.';

  // Fetch real backend search results in parallel; do not ask the model to invent URLs.
  const searchPromises = queries.map(async (query) => {
    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) return '';
      const data = await res.json();
      return `Query: ${query}\nResults:\n${data.context}`;
    } catch {
      return '';
    }
  });

  const searchResults = await Promise.all(searchPromises);
  const digest = searchResults.filter(Boolean).join('\n\n');

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
- consolidatedSummary: a shorter, consolidated summary of counterArgument + keyWeaknesses that preserves all material claims (no omissions).`,
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

function summarizeDevilsAdvocateLens(devil: z.infer<typeof DevilsAdvocateSchema>): string {
  const full = formatDevilsAdvocateLens(devil);
  if (full.length <= 320) return full;

  const sentenceBreak = full.slice(0, 320).match(/^(.+?[.!?])\s/);
  if (sentenceBreak?.[1]) return sentenceBreak[1].trim();

  return `${full.slice(0, 317).trim()}...`;
}

function buildDevilsAdvocateBackgroundWriteup(devil: z.infer<typeof DevilsAdvocateSchema>): string {
  const counter = devil.counterArgument?.replace(/\s+/g, ' ').trim();
  const weaknesses = (devil.keyWeaknesses || [])
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const consolidated = devil.consolidatedSummary?.replace(/\s+/g, ' ').trim();

  const sections = [
    counter ? `Counter-argument: ${counter}` : '',
    weaknesses.length > 0 ? `Key weaknesses: ${weaknesses.join(' | ')}` : '',
    consolidated ? `Consolidated summary: ${consolidated}` : '',
  ].filter(Boolean);

  return sections.join('\n');
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

function sanitizeDeepDiveReport(report: DeepDiveReport): DeepDiveReport {
  return {
    ...report,
    sources: sanitizeSources(report.sources),
    strategicImplications: (report.strategicImplications || []).map((item) => item.trim()).filter(Boolean),
    realWorldExamples: (report.realWorldExamples || []).map((item) => item.trim()).filter(Boolean),
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

function isOfficialSourceForWebsite(sourceUrl?: string | null, websiteUrl?: string | null): boolean {
  const sourceHost = getHostname(sourceUrl);
  const websiteHost = getHostname(websiteUrl);
  if (!sourceHost || !websiteHost) return false;
  return sourceHost === websiteHost || sourceHost.endsWith(`.${websiteHost}`) || websiteHost.endsWith(`.${sourceHost}`);
}

function sanitizeBrandDeepDiveReport(report: BrandDeepDiveReport): BrandDeepDiveReport {
  const stripLabels = (text: string): string =>
    text
      .replace(/\[(KNOWN|INFERRED|INFERED|SPECULATIVE)\]\s*/gi, '')
      .replace(/\b(KNOWN|INFERRED|INFERED|SPECULATIVE)\b\s*[:\-]?\s*/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
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

      const sanitizeColors = (colors: BrandColorSpec[] = []): BrandColorSpec[] =>
        colors
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

      const verifiedPrimaryColors = sanitizeColors(profile.colorPalette?.primaryColors || []);
      const verifiedAccentColors = sanitizeColors(profile.colorPalette?.secondaryAccentColors || []);
      const verifiedNeutrals = sanitizeColors(profile.colorPalette?.neutrals || []);

      const consistencyAssessment = (profile.consistencyAssessment || 'Not provided').trim();
      const verificationSuffix = 'Color values were not fully verifiable from official same-domain sources and should be treated as directional.';
      const hasAnyColorData =
        verifiedPrimaryColors.length > 0 || verifiedAccentColors.length > 0 || verifiedNeutrals.length > 0;

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
          mainLogo: stripLabels(profile.logo?.mainLogo || ''),
          wordmarkLogotype: stripLabels(profile.logo?.wordmarkLogotype || ''),
          logoVariations: stripListLabels(profile.logo?.logoVariations || []),
          symbolsIcons: stripListLabels(profile.logo?.symbolsIcons || []),
        },
        typography: {
          fontFamilies: stripListLabels(profile.typography?.fontFamilies || []),
          hierarchy: {
            h1: stripLabels(profile.typography?.hierarchy?.h1 || ''),
            h2: stripLabels(profile.typography?.hierarchy?.h2 || ''),
            body: stripLabels(profile.typography?.hierarchy?.body || ''),
          },
          usageRules: stripListLabels(profile.typography?.usageRules || []),
        },
        supportingVisualElements: {
          imageryStyle: stripListLabels(profile.supportingVisualElements?.imageryStyle || []),
          icons: stripListLabels(profile.supportingVisualElements?.icons || []),
          patternsTextures: stripListLabels(profile.supportingVisualElements?.patternsTextures || []),
          shapes: stripListLabels(profile.supportingVisualElements?.shapes || []),
          dataVisualization: stripListLabels(profile.supportingVisualElements?.dataVisualization || []),
        },
        colorPalette: {
          primaryColors: verifiedPrimaryColors,
          secondaryAccentColors: verifiedAccentColors,
          neutrals: verifiedNeutrals,
        },
        consistencyAssessment: stripLabels(
          hasOfficialBrandSource || !hasAnyColorData
            ? consistencyAssessment
            : `${consistencyAssessment} ${verificationSuffix}`
        ),
        distinctivenessAssessment: stripLabels(profile.distinctivenessAssessment || ''),
        sources: profileSources,
      };
    }),
  };
}

function sanitizeCulturalMatrix(matrix: CulturalMatrix, hasUploadedDocuments: boolean): CulturalMatrix {
  const stripEvidenceMarkers = (value: string): string =>
    value
      .replace(/\[(KNOWN|INFERRED|INFERED|SPECULATIVE)\]\s*/gi, '')
      .replace(/\b(KNOWN|INFERRED|INFERED|SPECULATIVE)\b\s*[:\-]?\s*/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

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

  return {
    ...matrix,
    demographics: {
      age: stripEvidenceMarkers(matrix.demographics?.age || ''),
      race: stripEvidenceMarkers(matrix.demographics?.race || ''),
      gender: stripEvidenceMarkers(matrix.demographics?.gender || ''),
    },
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
    sources: sanitizeSources(matrix.sources),
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

  const prompt = `You are a senior brand design strategist and visual identity analyst.

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
    const devilsAdvocate = await runDevilsAdvocatePass(topicSummary, normalized, 'brand');
    normalized.strategicRecommendations = [
      ...normalized.strategicRecommendations,
      `[KNOWN] Devil's advocate: ${devilsAdvocate.counterArgument}`,
      ...devilsAdvocate.keyWeaknesses.map((item) => `[INFERRED] Weakness to monitor: ${item}`),
    ].slice(0, 14);
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

  const prompt = `You are a senior brand design strategist and visual identity analyst.

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

export async function generateDeepDive(
  insight: MatrixItem,
  context: { audience: string; brand: string; generations: string[]; topicFocus?: string }
): Promise<DeepDiveReport> {
  const evidenceDigest = await gatherEvidenceForTopic(`Deep dive on insight: ${insight.text}`, 'cultural');

  const prompt = `You are an expert Cultural Archaeologist and Brand Strategist.
  I am providing you with a specific cultural insight about the following audience:
  Audience: ${context.audience}
  Brand Context: ${context.brand}
  Generations: ${context.generations.join(', ')}
  ${context.topicFocus ? `Topic Focus: ${context.topicFocus}` : ''}
  
  Insight: "${insight.text}"
  
  Please provide a deep dive into this specific insight to help me build strategies.
  First internally work through competing interpretations before finalizing output.

  Evidence digest:\n${evidenceDigest}

  ${RESEARCH_ACCURACY_PROTOCOL}`;

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
  sanitized.strategicImplications = [
    ...sanitized.strategicImplications,
    `[INFERRED] Devil's advocate: ${devil.counterArgument}`,
    ...devil.keyWeaknesses.slice(0, 2).map((item) => `[SPECULATIVE] Risk check: ${item}`),
  ];
  updateSessionBrief('cultural', sanitized);
  return sanitized;
}

export async function generateDeepDivesBatch(
  insights: MatrixItem[],
  context: { audience: string; brand: string; generations: string[]; topicFocus?: string }
): Promise<DeepDiveReport[]> {
  const prompt = `You are an expert Cultural Archaeologist and Brand Strategist.
  I am providing you with a list of specific cultural insights about the following audience:
  Audience: ${context.audience}
  Brand Context: ${context.brand}
  Generations: ${context.generations.join(', ')}
  ${context.topicFocus ? `Topic Focus: ${context.topicFocus}` : ''}
  
  Insights:
  ${insights.map((insight, index) => `${index + 1}. "${insight.text}"`).join('\n')}
  
  Please provide a deep dive into EACH of these specific insights to help me build strategies.

  ${RESEARCH_ACCURACY_PROTOCOL}`;

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

const BrandDeepDiveAnswerSchema = z.object({
  answer: z.string(),
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

export async function askMatrixQuestion(matrix: CulturalMatrix, question: string): Promise<{ answer: string, relevantInsights: string[] }> {
  const parsed = await runStructuredCall({
    schema: MatrixAnswerSchema,
    schemaName: 'matrix_answer',
    mode: 'matrix-qa',
    outputType: 'analysis',
    messages: [
      {
        role: 'system',
        content: composeSystemPrompt("You are an expert analyst. Answer using ONLY the provided matrix data. Do not invent facts. If the data is insufficient, explicitly say so. Provide a clear answer, and list the exact 'text' of relevant insights from the data.", 'matrix-qa'),
      },
      { role: 'user', content: `Data:\n\n${JSON.stringify(matrix)}\n\nQuestion: "${question}"` },
    ],
    qualityGate: (result) => !isThinStructuredPayload(result),
  });

  updateSessionBrief('matrix-qa', parsed);
  return parsed;
}

export async function askBrandDeepDiveQuestion(
  report: BrandDeepDiveReport,
  question: string
): Promise<{ answer: string }> {
  const parsed = await runStructuredCall({
    schema: BrandDeepDiveAnswerSchema,
    schemaName: 'brand_deep_dive_answer',
    mode: 'brand-qa',
    outputType: 'analysis',
    messages: [
      {
        role: 'system',
        content: composeSystemPrompt('You are an expert brand strategist and design analyst. Answer using ONLY the provided brand deep dive report data. Do not invent facts. If the report does not contain enough information, explicitly say so. Provide a concise, direct answer.', 'brand-qa'),
      },
      {
        role: 'user',
        content: `Data:\n\n${JSON.stringify(report)}\n\nQuestion: "${question}"`,
      },
    ],
    qualityGate: (result) => !isThinStructuredPayload(result),
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

  const answer = await askBrandDeepDiveQuestion(input.currentReport, normalizedPrompt);
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
    age: z.string().nullable().describe("Return null if no specific statistical evidence is found."),
    race: z.string().nullable().describe("Return null if no specific statistical evidence is found."),
    gender: z.string().nullable().describe("Return null if no specific statistical evidence is found.")
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
      brandMission: z.string(),
      brandPositioning: z.object({
        taglines: z.array(z.string()),
        keyMessagesAndClaims: z.array(z.string()),
        valueProposition: z.string(),
        voiceAndTone: z.string(),
      }),
      keyOfferingsProductsServices: z.array(z.string()),
      strategicMoatsStrengths: z.array(z.string()),
      potentialThreatsWeaknesses: z.array(z.string()),
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
    age: z.string(),
    race: z.string(),
    gender: z.string(),
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

export async function generateCulturalMatrix(audience: string, brand?: string, generations?: string[], topicFocus?: string, files?: UploadedFile[], sourcesType?: string[]): Promise<CulturalMatrix> {
  const contextStr = brand ? ` in the context of the brand/category: "${brand}"` : "";
  const topicStr = topicFocus ? `\n\nCRITICAL: You MUST focus all your insights specifically on the topic of "${topicFocus}". Only show results relevant to this topic.` : "";
  const generationStr = generations && generations.length > 0
    ? `\n\nCRITICAL: You MUST restrict your research and insights ONLY to the following generations: ${generations.join(', ')}.`
    : "";
  const hasUploadedDocuments = Boolean(files && files.length > 0);
  const filesStr = files && files.length > 0
    ? `\n\nI have attached some documents. Please use the information from these documents to help generate the results, in addition to your general knowledge and internet search. If an insight is derived from the attached documents, please set isFromDocument to true.`
    : "";
  const sourcesTypeStr = sourcesType && sourcesType.length > 0
    ? `\n\nCRITICAL: You MUST restrict your sources and insights to be derived primarily from ${sourcesType.join(', ')} sources. Adjust your tone, findings, and the specific cultural signals you highlight to reflect the unique perspective, narratives, and biases of these media types.`
    : "";

  const systemInstruction = composeSystemPrompt(
    'You are an expert cultural strategist and marketer. Your goal is to provide deep, accurate, and actionable cultural insights for the requested audience based on recent data. Highlight results that are extremely unique to this audience by setting isHighlyUnique to true (comparing them against demographic peers who are NOT involved in this specific brand, industry, or topic). Before listing the final artifacts, you MUST write a two-paragraph sociological_analysis explaining the socio-economic, historical, and cultural forces shaping this specific audience, and use that summary to derive the final data points. Do not expose private chain-of-thought; provide only the concise sociological summary in the sociological_analysis field.',
    'cultural'
  );

  const evidenceDigest = await gatherEvidenceForTopic(
    `Audience: ${audience}; Brand: ${brand || 'n/a'}; Topic: ${topicFocus || 'n/a'}; Generations: ${(generations || []).join(', ') || 'n/a'}`,
    'cultural'
  );
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

  const prompt = `Generate a comprehensive cultural archaeologist report for the following audience: "${audience}"${contextStr}.${topicStr}${generationStr}${filesStr}${sourcesTypeStr}
    
    Ensure the research and context are recent (from the last couple of years, 2024-2026).
    CRITICAL: For each category, provide at least 6-10 highly detailed and specific insights to ensure a rich and comprehensive report.
    CRITICAL: Within each category, you MUST order the observations by "potency" (i.e., the frequency and strength of the cultural signal), with the most potent observations first.
    CRITICAL: You are acting as a senior marketing strategist. The ideas and insights you bring MUST be new, exciting, contrarian, and something the client has likely never heard before. Avoid mainstream consensus and obvious observations. Focus on "weak signals", emerging fringe behaviors, counter-intuitive trends, and deep psychological drivers that are not widely discussed.
    CRITICAL: Each insight must include confidenceLevel = low | medium | high based on evidence quality and recency.
    CRITICAL: Each insight must include trendLifecycle = emerging | peaking | declining based on your assessment of where the signal sits on an S-curve right now.
    
    Categorize the insights into:
    - MOMENTS: Context of the time. What external forces are shaping behaviour right now? (Current events, Social climate, Trends)
    - BELIEFS: What they believe. What external forces are shaping behaviour right now? (Beliefs, Values, Myths, Perceptions)
    - TONE: What they feel and how they feel that is unique (Attitude, Emotions, Personality, Outlook)
    - LANGUAGE: How they communicate (Vernacular, Symbols, Codes, Visuals)
    - BEHAVIORS: How they act/interact. What signals, symbols, or rituals carry meaning? (Actions, Customs, Rituals, Ceremonies)
    - CONTRADICTIONS: What tensions or shifts are emerging in values or behaviors?
    - COMMUNITY: Who do people look to for identity or belonging?
    - INFLUENCERS: People who are shaping their beliefs & behavior.

    Also provide a Vocabulary Extractor for copywriters with:
    - wordsTheyUse: common words and terms this audience naturally uses.
    - wordsToAvoid: words that feel inauthentic, corporate, or off-tone for this audience.
    
    Also provide a rough demographic breakdown (age, race, gender) for this audience in the context of the brand/category.

    Evidence digest (quality and date weighted):
    ${evidenceDigest}
    ${redditVerbatim}`;

  // Note: Azure OpenAI does not have a built-in "googleSearch" tool like Gemini.
  // To achieve similar web-grounding, you would need to implement an external search tool
  // (like Bing Search API) and use OpenAI's function calling to fetch results.
  // For this template, we rely on the model's internal knowledge.

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

  const interpretationPrompt = `Using the extracted raw signals below, produce the final Cultural Matrix with high specificity and explicit uncertainty labeling.

Raw signals:
${JSON.stringify(rawSignals)}

Rules:
- Add a required sociological_analysis field before the category arrays. It must be exactly two paragraphs.
- In sociological_analysis, summarize the socio-economic, historical, and cultural forces shaping the audience and use that summary to derive the final matrix.
- Keep each category 6-10 items when evidence supports it.
- Use confidenceLevel rigorously.
- Use trendLifecycle rigorously for each insight.
- Label uncertain language in text fields with [KNOWN], [INFERRED], [SPECULATIVE].
- For vocabulary lists, keep entries concise and practical for immediate copywriting use.
- Ensure sources remain credible and recent, flagging stale evidence when necessary.`;

  const interpretedMatrix = await runStructuredCall({
    schema: CulturalMatrixSchema,
    schemaName: 'cultural_matrix',
    mode: 'cultural',
    outputType: 'analysis',
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: interpretationPrompt },
    ],
    qualityGate: (payload) => !isThinStructuredPayload(payload),
    maxRetries: 3,
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

  const sanitized = sanitizeCulturalMatrix(interpretedMatrix, hasUploadedDocuments);
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

  const urlsToScrape = brands.map((b) => b.website).filter(Boolean) as string[];
  let firstPartyContext = '';

  if (urlsToScrape.length > 0) {
    console.log('[brand-research] Skipping precision index in browser runtime to avoid Node-only dependencies.', {
      urlsToScrapeCount: urlsToScrape.length,
    });
  }

  const prompt = `Generate a brand intelligence report for the following brands: ${brandContext}.${audienceStr}${topicStr}${generationStr}${filesStr}${sourcesTypeStr}

Requirements:
- Use the same research rigor: recent evidence (2024-2026), explicit uncertainty handling, and source grounding.
- Return one complete result object per brand in "results".
- Each brand result must include:
  1) highLevelSummary (2-4 sentence executive summary of strategy, positioning, and market posture)
  2) brandMission
  3) brandPositioning:
     - taglines
     - keyMessagesAndClaims
     - valueProposition
     - voiceAndTone
  4) keyOfferingsProductsServices
  5) strategicMoatsStrengths
  6) potentialThreatsWeaknesses
  7) targetAudiences:
     - audience
     - priority
     - inferredRoleToConsumers
     - functionalBenefits
     - emotionalBenefits
  8) recentCampaigns
  9) keyMarketingChannels
  10) socialMediaChannels with channel and full URL
  11) recentNews as actual recent brand/company article headlines from major mainstream media outlets, each with:
     - headline
     - full article URL
     - publishedAt (ISO date if available)
     - outlet
- Include at least 3 recentNews items per brand when credible coverage exists.
- Only include recentNews items published within the last 6 months.
- recentNews must be ordered most recent first.
- For recentNews, only use this strict top-50 mainstream media allowlist (domains): ${TOP_MAINSTREAM_NEWS_HOSTS.join(', ')}.
- Keep entries concise and specific (no vague filler).
- Provide sources at both the per-brand level and global level.

Evidence digest (quality and date weighted):
${evidenceDigest}

${firstPartyContext ? `\nFirst-party website excerpts:\n${firstPartyContext}` : ''}

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

  return filterRecentNewsToTopMainstream(report);
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

      if (!headline || !normalizedUrl || !publishedAt) continue;
      if (!isTopMainstreamNewsUrl(normalizedUrl)) continue;
      if (!isLikelyArticleUrl(normalizedUrl)) continue;
      if (!isWithinLastSixMonths(publishedAt)) continue;

      const dedupeKey = normalizedUrl.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      normalizedNews.push({
        headline,
        url: normalizedUrl,
        publishedAt,
        outlet,
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
