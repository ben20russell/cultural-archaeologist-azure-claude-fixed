import OpenAI from 'openai';

const MODEL_NAME = 'dall-e-3';

const EDITORIAL_CYBERSPACE_STYLE = [
  'Aesthetic lock: Editorial Cyberspace.',
  'Sleek, abstract digital excavation scene.',
  'Dark OLED background with bioluminescent cyan and amber highlights.',
  'Premium cinematic 3D render quality with subtle depth and atmospheric haze.',
  'Glassmorphism panels and faint data particles floating in space.',
  'No typography, no logos, no watermarks, no legible text of any kind.',
  'Elegant composition, high contrast, premium art direction.',
  'The visual style constraints above are mandatory and must override stylistic drift.',
].join(' ');

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY environment variable.');
  }
  return new OpenAI({ apiKey });
}

/**
 * Generates a persona image URL with a hard style lock around the user insight.
 */
export async function generateVibeLockedPersonaImage(insightDescription: string): Promise<string> {
  const trimmedInsight = (insightDescription || '').trim();
  if (!trimmedInsight) {
    throw new Error('insightDescription is required.');
  }

  const systemPrompt = [
    'You are an elite visual direction engine for brand anthropology.',
    EDITORIAL_CYBERSPACE_STYLE,
    'Do not output textual overlays inside the image.',
  ].join(' ');

  const injectedPrompt = [
    systemPrompt,
    `Subject insight to visualize: ${trimmedInsight}.`,
    'Render one cohesive scene consistent with the style lock.',
  ].join(' ');

  try {
    const client = getOpenAIClient();
    const response = await client.images.generate({
      model: MODEL_NAME,
      prompt: injectedPrompt,
      size: '1024x1024',
    });

    const url = response.data?.[0]?.url;
    if (!url) {
      throw new Error('Image generation returned no URL.');
    }

    return url;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown OpenAI image generation error';
    throw new Error(`Failed to generate vibe-locked persona image: ${message}`);
  }
}
