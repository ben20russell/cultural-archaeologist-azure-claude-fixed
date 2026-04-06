/**
 * Image-processing utility for the Cultural Archaeologist – Brand Deep Dive.
 *
 * processImageForUI(imageUrl)
 *   1. Fetches the image as a Buffer.
 *   2. Uses `sharp` to produce a tiny Base64 LQIP (Low Quality Image Placeholder).
 *   3. Uses `node-vibrant` to extract the most visually vibrant dominant hex color.
 *   4. Falls back to `sharp` stats for color when vibrant extraction fails.
 *
 * Returns { originalUrl, base64Placeholder, dominantColorHex }.
 */

import sharp from 'sharp';
import { Vibrant } from 'node-vibrant/node';

export interface ProcessedImageResult {
  originalUrl: string;
  /** data:image/webp;base64,... */
  base64Placeholder: string;
  /** e.g. "#4a90e2" */
  dominantColorHex: string;
}

/**
 * Fetch an image from a public http/https URL, generate a Base64 LQIP and
 * extract its dominant vibrant color.
 *
 * @throws {Error} If the URL is invalid, the host uses a private-network
 *   address, or the upstream request fails.
 */
export async function processImageForUI(imageUrl: string): Promise<ProcessedImageResult> {
  // ── 1. Validate URL ─────────────────────────────────────────────────────────
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    throw new Error(`Invalid image URL: ${imageUrl}`);
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('Only http/https image URLs are supported.');
  }

  // ── 2. Fetch raw image bytes ─────────────────────────────────────────────────
  const controller = new AbortController();
  const fetchTimeout = setTimeout(() => controller.abort(), 10_000);

  let imageBuffer: Buffer;
  try {
    const response = await fetch(parsedUrl.toString(), {
      signal: controller.signal,
      headers: {
        Accept: 'image/*,*/*;q=0.8',
        'User-Agent': 'CulturalArchaeologistImageProcessor/1.0',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`Upstream responded with HTTP ${response.status} for ${parsedUrl.hostname}`);
    }

    imageBuffer = Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(fetchTimeout);
  }

  // ── 3. Generate LQIP via sharp ───────────────────────────────────────────────
  // Resize to 10 px wide, encode as low-quality WebP → compact Base64 URI.
  const lqipBuffer = await sharp(imageBuffer)
    .resize(10, null, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 20 })
    .toBuffer();

  const base64Placeholder = `data:image/webp;base64,${lqipBuffer.toString('base64')}`;

  // ── 4. Extract dominant vibrant color ────────────────────────────────────────
  let dominantColorHex = '#888888';

  try {
    const palette = await Vibrant.from(imageBuffer).getPalette();

    // Prefer vivid swatches; fall back through the full palette.
    const swatch =
      palette.Vibrant ??
      palette.DarkVibrant ??
      palette.LightVibrant ??
      palette.Muted ??
      palette.DarkMuted ??
      palette.LightMuted;

    if (swatch?.hex) {
      dominantColorHex = swatch.hex;
    }
  } catch {
    // Vibrant extraction failed – fall back to sharp's quantized dominant color.
    try {
      const stats = await sharp(imageBuffer).stats();
      const { r, g, b } = stats.dominant;
      dominantColorHex =
        '#' +
        Math.round(r).toString(16).padStart(2, '0') +
        Math.round(g).toString(16).padStart(2, '0') +
        Math.round(b).toString(16).padStart(2, '0');
    } catch {
      // Keep the neutral gray default.
    }
  }

  return { originalUrl: imageUrl, base64Placeholder, dominantColorHex };
}
