import express from 'express';
import cors from 'cors';
import db, { initializeDB } from './db';
import nodemailer from 'nodemailer';
import { processImageForUI, type ProcessedImageResult } from './image-processing';
import { extractBrandImages, type BrandImagesResult } from './brand-images';

const app = express();
const PORT = 3001;

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

const feedbackRecipient = process.env.FEEDBACK_TO_EMAIL;
const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465;
const smtpFrom = process.env.SMTP_FROM || smtpUser || 'noreply@localhost';

const isValidEmail = (value: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

const sendFeedbackEmail = async (payload: {
  name?: string;
  email?: string;
  message: string;
  pageUrl?: string;
  userAgent?: string;
}) => {
  if (!feedbackRecipient || !smtpHost || !smtpUser || !smtpPass) {
    return {
      sent: false,
      reason: 'SMTP or recipient configuration is missing.',
    } as const;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  const escapedMessage = payload.message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br/>');

  await transporter.sendMail({
    from: smtpFrom,
    to: feedbackRecipient,
    subject: `New Feedback${payload.email ? ` from ${payload.email}` : ''}`,
    text: [
      'New feedback message received',
      '',
      `Name: ${payload.name || 'Not provided'}`,
      `Email: ${payload.email || 'Not provided'}`,
      `Page: ${payload.pageUrl || 'Not provided'}`,
      `User Agent: ${payload.userAgent || 'Not provided'}`,
      '',
      'Message:',
      payload.message,
    ].join('\n'),
    html: `
      <h2>New feedback message</h2>
      <p><strong>Name:</strong> ${payload.name || 'Not provided'}</p>
      <p><strong>Email:</strong> ${payload.email || 'Not provided'}</p>
      <p><strong>Page:</strong> ${payload.pageUrl || 'Not provided'}</p>
      <p><strong>User Agent:</strong> ${payload.userAgent || 'Not provided'}</p>
      <hr />
      <p>${escapedMessage}</p>
    `,
    replyTo: payload.email || undefined,
  });

  return {
    sent: true,
    reason: null,
  } as const;
};

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

// Initialize database
initializeDB();

// Save search results
app.post('/api/searches', (req, res) => {
  const { brand, audience, topicFocus, generations, sourcesType, results } = req.body;

  try {
    const stmt = db.prepare(`
      INSERT INTO searches (brand, audience, topicFocus, generations, sourcesType, results)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      brand || null,
      audience || null,
      topicFocus || null,
      JSON.stringify(generations || []),
      JSON.stringify(sourcesType || []),
      JSON.stringify(results)
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving search:', error);
    res.status(500).json({ error: 'Failed to save search' });
  }
});

// Get all searches
app.get('/api/searches', (_req, res) => {
  try {
    const searches = db.prepare('SELECT * FROM searches ORDER BY createdAt DESC LIMIT 100').all();
    
    // Parse JSON fields
    const parsed = searches.map((s: any) => ({
      ...s,
      generations: JSON.parse(s.generations || '[]'),
      sourcesType: JSON.parse(s.sourcesType || '[]'),
      results: JSON.parse(s.results)
    }));

    res.json(parsed);
  } catch (error) {
    console.error('Error fetching searches:', error);
    res.status(500).json({ error: 'Failed to fetch searches' });
  }
});

// Get single search by ID
app.get('/api/searches/:id', (req, res) => {
  try {
    const search = db.prepare('SELECT * FROM searches WHERE id = ?').get(req.params.id);
    
    if (!search) {
      return res.status(404).json({ error: 'Search not found' });
    }

    const parsed = {
      ...search,
      generations: JSON.parse((search as any).generations || '[]'),
      sourcesType: JSON.parse((search as any).sourcesType || '[]'),
      results: JSON.parse((search as any).results)
    };

    res.json(parsed);
  } catch (error) {
    console.error('Error fetching search:', error);
    res.status(500).json({ error: 'Failed to fetch search' });
  }
});

// Delete search
app.delete('/api/searches/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM searches WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting search:', error);
    res.status(500).json({ error: 'Failed to delete search' });
  }
});

app.post('/api/feedback', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  const pageUrl = typeof req.body?.pageUrl === 'string' ? req.body.pageUrl.trim() : '';

  if (!message) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  if (message.length > MAX_FEEDBACK_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `Message must be ${MAX_FEEDBACK_MESSAGE_LENGTH} characters or less.` });
  }

  if (name.length > MAX_FEEDBACK_NAME_LENGTH) {
    return res.status(400).json({ error: `Name must be ${MAX_FEEDBACK_NAME_LENGTH} characters or less.` });
  }

  if (email.length > MAX_FEEDBACK_EMAIL_LENGTH) {
    return res.status(400).json({ error: `Email must be ${MAX_FEEDBACK_EMAIL_LENGTH} characters or less.` });
  }

  if (email && !isValidEmail(email)) {
    return res.status(400).json({ error: 'Email format is invalid.' });
  }

  const userAgent = req.header('user-agent') || '';

  try {
    const stmt = db.prepare(`
      INSERT INTO feedback_messages (name, email, message, pageUrl, userAgent)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      name || null,
      email || null,
      message,
      pageUrl || null,
      userAgent || null,
    );

    let emailResult: { sent: boolean; reason: string | null } = { sent: false, reason: null };
    try {
      emailResult = await sendFeedbackEmail({
        name,
        email,
        message,
        pageUrl,
        userAgent,
      });
    } catch (emailError) {
      const reason = emailError instanceof Error ? emailError.message : 'Unknown email delivery error';
      emailResult = { sent: false, reason };
      console.error('Feedback email send failed:', reason);
    }

    return res.json({
      success: true,
      feedbackId: result.lastInsertRowid,
      emailSent: emailResult.sent,
      emailError: emailResult.sent ? null : emailResult.reason,
    });
  } catch (error) {
    console.error('Error saving feedback:', error);
    return res.status(500).json({ error: 'Failed to submit feedback.' });
  }
});

app.get('/api/feedback', (req, res) => {
  const requestedLimit = Number(req.query.limit || 100);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(500, requestedLimit))
    : 100;

  try {
    const feedback = db
      .prepare('SELECT * FROM feedback_messages ORDER BY createdAt DESC LIMIT ?')
      .all(limit);

    return res.json(feedback);
  } catch (error) {
    console.error('Error fetching feedback:', error);
    return res.status(500).json({ error: 'Failed to fetch feedback.' });
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
        'User-Agent': 'BrandArcheologistImageProxy/1.0',
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

app.listen(PORT, () => {
  console.log(`🗄️ Admin server running at http://localhost:${PORT}`);
  console.log(`📊 View searches at http://localhost:${PORT}/admin`);
  console.log(`🖼️ Image proxy running at http://localhost:${PORT}/api/image-proxy`);
});
