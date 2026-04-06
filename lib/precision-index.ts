import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

const FETCH_TIMEOUT_MS = 12000;

export type PrecisionIndexEntry = {
  sourceUrl: string;
  title: string;
  cleanMarkdown: string;
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function toMarkdown(html: string): string {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });

  return normalizeWhitespace(turndown.turndown(html));
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'CulturalArchaeologistPrecisionIndexer/1.0',
      },
      redirect: 'follow',
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      throw new Error(`Unsupported content type: ${contentType || 'unknown'}`);
    }

    return await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out');
    }

    const message = error instanceof Error ? error.message : 'Unknown fetch error';
    throw new Error(message);
  } finally {
    clearTimeout(timeout);
  }
}

function extractReadableContent(sourceUrl: string, html: string): { title: string; markdown: string } {
  const dom = new JSDOM(html, { url: sourceUrl });
  const readability = new Readability(dom.window.document);
  const article = readability.parse();

  const title = normalizeWhitespace(article?.title || dom.window.document.title || sourceUrl);

  if (article?.content) {
    const markdown = toMarkdown(article.content);
    if (markdown) {
      return { title, markdown };
    }
  }

  // If Readability cannot identify a usable article, fallback to document body conversion.
  const fallbackHtml = dom.window.document.body?.innerHTML || '';
  const fallbackMarkdown = toMarkdown(fallbackHtml);
  return {
    title,
    markdown: fallbackMarkdown || 'Content extraction succeeded but produced no readable body text.',
  };
}

export async function createPrecisionIndex(urls: string[]): Promise<PrecisionIndexEntry[]> {
  const normalizedUrls = Array.from(
    new Set((urls || []).map((url) => (typeof url === 'string' ? url.trim() : '')).filter(Boolean)),
  );

  const results = await Promise.all(
    normalizedUrls.map(async (sourceUrl): Promise<PrecisionIndexEntry> => {
      try {
        const html = await fetchHtml(sourceUrl);
        const { title, markdown } = extractReadableContent(sourceUrl, html);

        return {
          sourceUrl,
          title,
          cleanMarkdown: markdown,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown indexing error';
        return {
          sourceUrl,
          title: `Unavailable content from ${sourceUrl}`,
          cleanMarkdown: `Failed to index this source cleanly. Reason: ${message}`,
        };
      }
    }),
  );

  return results;
}
