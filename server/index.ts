import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
// Removed nodemailer and googleapis (no email/Google Sheets)
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchAudienceContext } from '../lib/grounding.js';
import { fetchSubredditQuotes } from '../lib/fetchSubredditQuotes.js';
import { processImageForUI, type ProcessedImageResult } from './image-processing';
import { extractBrandImages, type BrandImagesResult } from './brand-images';
import { extractBrandWebContext, type BrandWebContextResult } from './brand-web-context';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load local env for backend runtime (Vite does not inject these into Node process.env).
dotenv.config({ path: path.resolve(__dirname, '../.env.local'), quiet: true });
dotenv.config({ quiet: true });

const app = express();
const parsedPort = Number(process.env.PORT || 3001);
const PORT = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const IMAGE_CACHE_TTL_MS = 15 * 60 * 1000;
const IMAGE_CACHE_MAX_ITEMS = 300;

type CachedImage = {
  body: Buffer;
  contentType: string;
  etag: string;
  expiresAt: number;
};

const imageCache = new Map<string, CachedImage>();

const MAX_FEEDBACK_NAME_LENGTH = 120;
const MAX_FEEDBACK_EMAIL_LENGTH = 254;
const MAX_FEEDBACK_MESSAGE_LENGTH = 4000;

// Removed all email/Google Sheets env and helpers

const isValidEmail = (value: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

// Removed all Google Sheets and email logic for feedback

const isDisallowedHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase();
  if (!host) return true;
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return true;
  return false;
};

const cleanupImageCache = () => {
  const now = Date.now();
  for (const [key, cached] of imageCache.entries()) {
    if (cached.expiresAt <= now) {
      imageCache.delete(key);
    }
  }

  while (imageCache.size > IMAGE_CACHE_MAX_ITEMS) {
    const oldestKey = imageCache.keys().next().value;
    if (!oldestKey) break;
    imageCache.delete(oldestKey);
  }
};

const respondWithCachedImage = (res: express.Response, cached: CachedImage, ifNoneMatch?: string) => {
  if (ifNoneMatch && ifNoneMatch === cached.etag) {
    res.status(304).end();
    return;
  }

  res.setHeader('Content-Type', cached.contentType);
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
  res.setHeader('ETag', cached.etag);
  res.send(cached.body);
};


// 1. Initialize Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Missing Supabase environment variables!");
}
const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');



app.get('/api/image-proxy', async (req, res) => {
  const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;

  if (!rawUrl || typeof rawUrl !== 'string') {
    return res.status(400).json({ error: 'Missing url query parameter.' });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid url parameter.' });
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return res.status(400).json({ error: 'Only http/https image URLs are allowed.' });
  }

  if (isDisallowedHost(parsedUrl.hostname)) {
    return res.status(403).json({ error: 'Host is not allowed.' });
  }

  cleanupImageCache();

  const cacheKey = parsedUrl.toString();
  const cached = imageCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return respondWithCachedImage(res, cached, req.header('if-none-match'));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(cacheKey, {
      signal: controller.signal,
      headers: {
        Accept: 'image/*,*/*;q=0.8',
        'User-Agent': 'BrandArchaeologistImageProxy/1.0',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Upstream returned ${response.status}.` });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    const body = Buffer.from(arrayBuffer);

    const cacheEntry: CachedImage = {
      body,
      contentType,
      etag: `"${Buffer.from(`${cacheKey}:${body.length}:${contentType}`).toString('base64').slice(0, 27)}"`,
      expiresAt: Date.now() + IMAGE_CACHE_TTL_MS,
    };

    imageCache.set(cacheKey, cacheEntry);
    cleanupImageCache();

    return respondWithCachedImage(res, cacheEntry, req.header('if-none-match'));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown proxy error';
    return res.status(502).json({ error: `Failed to fetch image: ${message}` });
  } finally {
    clearTimeout(timeout);
  }
});

// ── Processed-image cache (LQIP + dominant color) ───────────────────────────
const PROCESSED_IMAGE_CACHE_TTL_MS = 30 * 60 * 1_000; // 30 min
const processedImageCache = new Map<string, { result: ProcessedImageResult; expiresAt: number }>();

app.get('/api/process-image', async (req, res) => {
  const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;

  if (!rawUrl || typeof rawUrl !== 'string') {
    return res.status(400).json({ error: 'Missing url query parameter.' });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid url parameter.' });
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return res.status(400).json({ error: 'Only http/https image URLs are allowed.' });
  }

  if (isDisallowedHost(parsedUrl.hostname)) {
    return res.status(403).json({ error: 'Host is not allowed.' });
  }

  const cacheKey = parsedUrl.toString();
  const cached = processedImageCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json(cached.result);
  }

  try {
    const result = await processImageForUI(cacheKey);
    processedImageCache.set(cacheKey, { result, expiresAt: Date.now() + PROCESSED_IMAGE_CACHE_TTL_MS });
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(502).json({ error: `Failed to process image: ${message}` });
  }
});

// ── Brand images (logo + hero) ───────────────────────────────────────────
const BRAND_IMAGES_CACHE_TTL_MS = 30 * 60 * 1_000; // 30 min
const brandImagesCache = new Map<string, { result: BrandImagesResult; expiresAt: number }>();
const BRAND_WEB_CONTEXT_CACHE_TTL_MS = 15 * 60 * 1_000; // 15 min
const brandWebContextCache = new Map<string, { result: BrandWebContextResult; expiresAt: number }>();

app.get('/api/brand-images', async (req, res) => {
  const rawDomain = Array.isArray(req.query.domain) ? req.query.domain[0] : req.query.domain;

  if (!rawDomain || typeof rawDomain !== 'string') {
    return res.status(400).json({ error: 'Missing domain query parameter.' });
  }

  let parsedUrl: URL;
  try {
    const withProtocol = /^https?:\/\//i.test(rawDomain.trim())
      ? rawDomain.trim()
      : `https://${rawDomain.trim()}`;
    parsedUrl = new URL(withProtocol);
  } catch {
    return res.status(400).json({ error: 'Invalid domain parameter.' });
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return res.status(400).json({ error: 'Only http/https domains are allowed.' });
  }

  if (isDisallowedHost(parsedUrl.hostname)) {
    return res.status(403).json({ error: 'Host is not allowed.' });
  }

  const cacheKey = parsedUrl.hostname;
  const cached = brandImagesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json(cached.result);
  }

  try {
    const result = await extractBrandImages(parsedUrl.hostname);
    brandImagesCache.set(cacheKey, { result, expiresAt: Date.now() + BRAND_IMAGES_CACHE_TTL_MS });
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(502).json({ error: `Failed to extract brand images: ${message}` });
  }
});

// ── Brand web context (homepage + corporate pages) ───────────────────────────
app.get('/api/brand-web-context', async (req, res) => {
  const rawTarget = Array.isArray(req.query.target) ? req.query.target[0] : req.query.target;
  const rawBrand = Array.isArray(req.query.brand) ? req.query.brand[0] : req.query.brand;

  if (!rawTarget || typeof rawTarget !== 'string') {
    return res.status(400).json({ error: 'Missing target query parameter.' });
  }

  let parsedUrl: URL;
  try {
    const withProtocol = /^https?:\/\//i.test(rawTarget.trim())
      ? rawTarget.trim()
      : `https://${rawTarget.trim()}`;
    parsedUrl = new URL(withProtocol);
  } catch {
    return res.status(400).json({ error: 'Invalid target parameter.' });
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return res.status(400).json({ error: 'Only http/https targets are allowed.' });
  }

  if (isDisallowedHost(parsedUrl.hostname)) {
    return res.status(403).json({ error: 'Host is not allowed.' });
  }

  const cacheKey = `${(rawBrand || '').toString().trim().toLowerCase()}::${parsedUrl.toString().toLowerCase()}`;
  const cached = brandWebContextCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json(cached.result);
  }

  try {
    const result = await extractBrandWebContext(parsedUrl.toString(), typeof rawBrand === 'string' ? rawBrand : '');
    brandWebContextCache.set(cacheKey, { result, expiresAt: Date.now() + BRAND_WEB_CONTEXT_CACHE_TTL_MS });
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(502).json({ error: `Failed to extract brand web context: ${message}` });
  }
});

app.get('/api/search', async (req, res) => {
  const query = req.query.q as string;
  if (!query) return res.status(400).json({ error: 'Missing query' });
  try {
    const context = await fetchAudienceContext(query);
    res.json({ context });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reddit', async (req, res) => {
  const subreddit = req.query.subreddit as string;
  if (!subreddit) return res.status(400).json({ error: 'Missing subreddit' });
  try {
    const quotes = await fetchSubredditQuotes(subreddit);
    res.json({ quotes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`🗄️ Admin server running at http://localhost:${PORT}`);
  console.log(`📊 View searches at http://localhost:${PORT}/admin`);
  console.log(`🖼️ Image proxy running at http://localhost:${PORT}/api/image-proxy`);
  console.log('[feedback] Google Sheets feedback sync is disabled in this build.');
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[startup] Port ${PORT} is already in use. Stop the existing process or choose a different port.`);
    process.exit(1);
  }

  console.error('[startup] Failed to start server:', error.message);
  process.exit(1);
});
