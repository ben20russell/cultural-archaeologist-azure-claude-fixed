import { z } from 'zod';

export const CulturalArchetypeSchema = z.object({
  category: z.enum(['Belief', 'Fear', 'Interest']),
  title: z.string().max(50),
  description: z.string().min(20),
});

export const GenerateArchetypesSuccessSchema = z.object({
  success: z.literal(true),
  audience: z.string(),
  groundingContext: z.string(),
  groundingWarning: z.string().nullable(),
  data: z.object({
    archetypes: z.array(CulturalArchetypeSchema),
  }),
});

export const GenerateArchetypesErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  groundingWarning: z.string().nullable().optional(),
});

export const GenerateArchetypesResponseSchema = z.union([
  GenerateArchetypesSuccessSchema,
  GenerateArchetypesErrorSchema,
]);

export type CulturalArchetype = z.infer<typeof CulturalArchetypeSchema>;
export type GenerateArchetypesSuccess = z.infer<typeof GenerateArchetypesSuccessSchema>;
export type GenerateArchetypesError = z.infer<typeof GenerateArchetypesErrorSchema>;
export type GenerateArchetypesResponse = z.infer<typeof GenerateArchetypesResponseSchema>;

export function parseGenerateArchetypesResponse(payload: unknown): GenerateArchetypesResponse {
  const parsed = GenerateArchetypesResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`Invalid /api/generate response shape: ${parsed.error.message}`);
  }
  return parsed.data;
}

export async function generateArchetypes(params: {
  audience: string;
  prompt?: string;
}): Promise<GenerateArchetypesSuccess> {
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audience: params.audience,
      prompt: params.prompt,
    }),
  });

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new Error('The generate endpoint returned invalid JSON.');
  }

  const parsed = parseGenerateArchetypesResponse(raw);

  if (!response.ok) {
    if ('error' in parsed) {
      throw new Error(parsed.error);
    }
    throw new Error(`HTTP ${response.status}`);
  }

  if ('error' in parsed) {
    throw new Error(parsed.error);
  }

  return parsed;
}