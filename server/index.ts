import express from 'express';
import cors from 'cors';
import db, { initializeDB } from './db';

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

app.listen(PORT, () => {
  console.log(`🗄️ Admin server running at http://localhost:${PORT}`);
  console.log(`📊 View searches at http://localhost:${PORT}/admin`);
  console.log(`🖼️ Image proxy running at http://localhost:${PORT}/api/image-proxy`);
});
