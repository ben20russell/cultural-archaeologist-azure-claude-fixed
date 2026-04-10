import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
// Removed nodemailer and googleapis (no email/Google Sheets)
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { processImageForUI, type ProcessedImageResult } from './image-processing';
import { extractBrandImages, type BrandImagesResult } from './brand-images';

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


// --- 2. SEARCH ROUTES ---
app.post('/api/searches', async (req, res) => {
  const { brand, audience, topicFocus, generations, sourcesType, results } = req.body;
  try {
    const { error } = await supabase.from('searches').insert([
      {
        brand: brand || null,
        audience: audience || null,
        topicFocus: topicFocus || null,
        generations: generations || [],
        sourcesType: sourcesType || [],
        results: results
      }
    ]);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving search:', error);
    res.status(500).json({ error: 'Failed to save search' });
  }
});

app.get('/api/searches', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('searches')
      .select('*')
      .order('createdAt', { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching searches:', error);
    res.status(500).json({ error: 'Failed to fetch searches' });
  }
});

app.get('/api/searches/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('searches')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Search not found' });
    res.json(data);
  } catch (error) {
    console.error('Error fetching search:', error);
    res.status(500).json({ error: 'Failed to fetch search' });
  }
});

app.delete('/api/searches/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('searches').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting search:', error);
    res.status(500).json({ error: 'Failed to delete search' });
  }
});



// --- 3. FEEDBACK ROUTE ---
app.post('/api/feedback', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  const pageUrl = typeof req.body?.pageUrl === 'string' ? req.body.pageUrl.trim() : '';
  const userAgent = req.header('user-agent') || '';

  if (!message) return res.status(400).json({ error: 'Message is required.' });

  try {
    const { data, error } = await supabase.from('feedback_messages').insert([
      {
        name: name || null,
        email: email || null,
        message: message,
        page_url: pageUrl || null,
        user_agent: userAgent || null
      }
    ]).select();

    if (error) throw error;
    return res.json({
      success: true,
      feedbackId: data[0].id,
    });
  } catch (error) {
    console.error('Error saving feedback:', error);
    return res.status(500).json({ error: 'Failed to submit feedback.' });
  }
});

app.get('/api/feedback', async (req, res) => {
  const requestedLimit = Number(req.query.limit || 100);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(500, requestedLimit)) : 100;

  try {
    const { data, error } = await supabase
      .from('feedback_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return res.json(data);
  } catch (error) {
    console.error('Error fetching feedback:', error);
    return res.status(500).json({ error: 'Failed to fetch feedback.' });
  }
});

// --- 4. VISUAL DEEP DIVES ROUTES ---
app.post('/api/deep-dives', async (req, res) => {
  const { brand, audience, topic_focus, generations, sources_type, results } = req.body;
  try {
    const { error } = await supabase.from('visual_deep_dives').insert([
      {
        brand: brand || null,
        audience: audience || null,
        topic_focus: topic_focus || null,
        generations: generations || [],
        sources_type: sources_type || [],
        results: results
      }
    ]);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving deep dive:', error);
    res.status(500).json({ error: 'Failed to save deep dive' });
  }
});

app.get('/api/deep-dives', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('visual_deep_dives')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching deep dives:', error);
    res.status(500).json({ error: 'Failed to fetch deep dives' });
  }
});

app.get('/api/deep-dives/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('visual_deep_dives')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Deep dive not found' });
    res.json(data);
  } catch (error) {
    console.error('Error fetching deep dive:', error);
    res.status(500).json({ error: 'Failed to fetch deep dive' });
  }
});

app.delete('/api/deep-dives/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('visual_deep_dives').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting deep dive:', error);
    res.status(500).json({ error: 'Failed to delete deep dive' });
  }
});

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

const server = app.listen(PORT, () => {
  console.log(`🗄️ Admin server running at http://localhost:${PORT}`);
  console.log(`📊 View searches at http://localhost:${PORT}/admin`);
  console.log(`🖼️ Image proxy running at http://localhost:${PORT}/api/image-proxy`);

  const missingGoogleConfig = getMissingGoogleSheetsConfig();
  if (missingGoogleConfig.length > 0) {
    console.warn(
      `[feedback] Google Sheets feedback sync is disabled. Missing env vars: ${missingGoogleConfig.join(', ')}`,
    );
  } else {
    console.log('[feedback] Google Sheets feedback sync is configured.');
  }
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[startup] Port ${PORT} is already in use. Stop the existing process or choose a different port.`);
    process.exit(1);
  }

  console.error('[startup] Failed to start server:', error.message);
  process.exit(1);
});
