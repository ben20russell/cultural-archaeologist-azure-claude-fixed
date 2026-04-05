import { AzureOpenAI } from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { fetchAudienceContext } from '../../../lib/grounding';
import { GENERATE_MULTI_SHOT_EXAMPLES } from './multishot-examples';

type GenerateRequestBody = {
  audience?: string;
  prompt?: string;
};

const CulturalArchetypeSchema = z.object({
  category: z.enum(['Belief', 'Fear', 'Interest']),
  title: z.string().max(50),
  description: z.string().min(20),
}).strict();

const CulturalArchetypeResponseSchema = z.object({
  archetypes: z.array(CulturalArchetypeSchema).min(3).max(18),
}).strict();

type CulturalArchetypeResponse = z.infer<typeof CulturalArchetypeResponseSchema>;

const CULTURAL_ARCHETYPE_JSON_SCHEMA = zodToJsonSchema(CulturalArchetypeResponseSchema as any, {
  name: 'cultural_archetype_response',
  target: 'openApi3',
  $refStrategy: 'none',
}) as Record<string, unknown>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getRequiredEnv(name: 'AZURE_OPENAI_API_KEY' | 'AZURE_OPENAI_ENDPOINT'): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getAzureClient(): AzureOpenAI {
  return new AzureOpenAI({
    apiKey: getRequiredEnv('AZURE_OPENAI_API_KEY'),
    endpoint: getRequiredEnv('AZURE_OPENAI_ENDPOINT'),
    apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview',
  });
}

function getDeploymentName(): string {
  return process.env.AZURE_OPENAI_DEPLOYMENT_NAME?.trim() || 'gpt-4o';
}

function getPrimaryDeploymentName(): string {
  return process.env.AZURE_OPENAI_PRIMARY_DEPLOYMENT_NAME?.trim() || 'gpt-5.4';
}

function getFallbackDeploymentName(): string {
  return process.env.AZURE_OPENAI_FALLBACK_DEPLOYMENT_NAME?.trim() || 'gpt-4o-mini';
}

const PRIMARY_TIMEOUT_MS = 30000;

function parseRequestBody(input: unknown): { audience: string; prompt: string } {
  if (!input || typeof input !== 'object') {
    throw new Error('Request body must be a JSON object.');
  }

  const body = input as GenerateRequestBody;
  const audience = typeof body.audience === 'string' ? body.audience.trim() : '';
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';

  if (!audience) {
    throw new Error('audience is required.');
  }

  return {
    audience,
    prompt: prompt || `Generate psychological insights for the following audience: ${audience}.`,
  };
}

function extractJsonText(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (item && typeof item === 'object' && 'type' in item && (item as { type?: string }).type === 'text') {
          return (item as { text?: string }).text || '';
        }

        if (item && typeof item === 'object' && 'text' in item) {
          return String((item as { text?: unknown }).text || '');
        }

        return '';
      })
      .join('')
      .trim();
  }

  return '';
}

function parseStructuredArchetypeResponse(output: string): CulturalArchetypeResponse {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(output);
  } catch {
    throw new Error('OpenAI returned invalid JSON.');
  }

  const validated = CulturalArchetypeResponseSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new Error(`OpenAI response failed schema validation: ${validated.error.message}`);
  }

  return validated.data;
}

async function generateStructuredArchetypes(
  client: AzureOpenAI,
  model: string,
  messages: ChatCompletionMessageParam[],
  timeoutMs = PRIMARY_TIMEOUT_MS,
): Promise<CulturalArchetypeResponse> {
  const completion = await Promise.race([
    client.chat.completions.create({
      model,
      temperature: 0.3,
      messages,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'cultural_archetype_response',
          strict: true,
          schema: CULTURAL_ARCHETYPE_JSON_SCHEMA,
        },
      },
    }),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`PRIMARY_TIMEOUT_${timeoutMs}ms`)), timeoutMs);
    }),
  ]);

  const output = extractJsonText(completion.choices[0]?.message?.content);
  if (!output) {
    throw new Error('OpenAI returned an empty structured response.');
  }

  return parseStructuredArchetypeResponse(output);
}

function isRetryablePrimaryError(error: unknown): boolean {
  const e = error as { status?: number; code?: number | string; message?: string };
  const status = typeof e?.status === 'number' ? e.status : null;
  const code = typeof e?.code === 'number' ? e.code : Number(e?.code);
  const message = (e?.message || '').toLowerCase();

  if (status === 429 || status === 500) return true;
  if (code === 429 || code === 500) return true;
  if (message.includes('429') || message.includes('500')) return true;
  if (message.includes('timeout') || message.includes('primary_timeout_')) return true;
  if (message.includes('length') || message.includes('context_length') || message.includes('max token')) return true;
  if (message.includes('safety') || message.includes('content filter') || message.includes('content_filter')) return true;

  return false;
}

export async function POST(request: Request): Promise<Response> {
  let body: { audience: string; prompt: string };

  try {
    const rawBody = await request.json();
    body = parseRequestBody(rawBody);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON payload.';
    const status = message === 'Invalid JSON payload.' ? 400 : 400;
    return jsonResponse({ success: false, error: message }, status);
  }

  let groundingContext = '';
  let groundingWarning: string | null = null;

  try {
    groundingContext = await fetchAudienceContext(body.audience);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Grounding failed.';
    console.error('[generate] Bing grounding failed:', message);
    groundingWarning = message;
  }

  try {
    const client = getAzureClient();
    const systemPrompt = [
      'You are a cultural strategy analyst who produces evidence-led cultural archetypes.',
      'Return only data that matches the provided schema.',
      'Every archetype must be highly specific to the audience and grounded in observable cultural nuance.',
      'category must be one of Belief, Fear, or Interest.',
      'title must be concise and under 50 characters.',
      'description must be concrete, culturally specific, and at least 20 characters long.',
      groundingContext
        ? `Base your output heavily on the following real-time cultural data: ${groundingContext}.`
        : 'If real-time cultural data is unavailable, be explicit about uncertainty and avoid unsupported claims.',
    ].join(' ');

    const baseMessages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...GENERATE_MULTI_SHOT_EXAMPLES,
      { role: 'user', content: body.prompt },
    ];

    const primaryModel = getPrimaryDeploymentName();
    const fallbackModel = getFallbackDeploymentName();

    let structuredOutput: CulturalArchetypeResponse;
    let modelUsed = primaryModel;
    let fallbackTriggered = false;
    let fallbackReason: string | null = null;

    try {
      structuredOutput = await generateStructuredArchetypes(client, primaryModel, baseMessages, PRIMARY_TIMEOUT_MS);
    } catch (primaryError) {
      if (!isRetryablePrimaryError(primaryError)) {
        throw primaryError;
      }

      fallbackTriggered = true;
      fallbackReason = primaryError instanceof Error ? primaryError.message : 'Primary model failed.';
      modelUsed = fallbackModel;

      const fallbackMessages: ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: [
            'You are a cultural strategy analyst producing concise but specific cultural archetypes.',
            'Use plain language and concrete cultural detail.',
            'Keep outputs faithful to the schema and avoid fluff.',
            groundingContext
              ? `Use this real-time context: ${groundingContext}`
              : 'If context is limited, state only high-confidence observations.',
          ].join(' '),
        },
        {
          role: 'user',
          content: `Audience: ${body.audience}. ${body.prompt}`,
        },
      ];

      structuredOutput = await generateStructuredArchetypes(client, fallbackModel, fallbackMessages, 20000);
    }

    return jsonResponse({
      success: true,
      audience: body.audience,
      groundingContext,
      groundingWarning,
      modelUsed,
      fallbackTriggered,
      fallbackReason,
      data: structuredOutput,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown generation error.';
    const safeMessage = message.includes('AZURE_OPENAI_API_KEY') || message.includes('AZURE_OPENAI_ENDPOINT')
      ? 'Azure OpenAI credentials are misconfigured.'
      : message;

    return jsonResponse({
      success: false,
      error: safeMessage,
      groundingWarning,
    }, 500);
  }
}