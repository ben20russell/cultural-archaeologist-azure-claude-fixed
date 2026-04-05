import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const DEFAULT_EMPTY_ARTICLE_TEXT = 'No article content provided.';
const DEFAULT_EMPTY_COMMENT_TEXT = 'No social comment content provided.';

export const SYNTHESIS_SYSTEM_PROMPT = [
  'You are a master synthesizer.',
  'Read the massive dataset provided within the <cultural_data> tags.',
  'You must cross-reference claims made in the <document> tags with the actual behaviors shown in the <social_listening_verbatim> tags.',
  'Base your final insights ONLY on overlapping patterns found in both.',
].join(' ');

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeInput(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
}

export function buildSynthesisContext(articles: string[], socialComments: string[]): string {
  const safeArticles = (articles || []).map((item) => normalizeInput(item)).filter(Boolean);
  const safeComments = (socialComments || []).map((item) => normalizeInput(item)).filter(Boolean);

  const articlesXml =
    safeArticles.length > 0
      ? safeArticles
          .map((article, index) => `    <document id="${index + 1}">${escapeXml(article)}</document>`)
          .join('\n')
      : `    <document id="1">${escapeXml(DEFAULT_EMPTY_ARTICLE_TEXT)}</document>`;

  const commentsXml =
    safeComments.length > 0
      ? safeComments
          .map((comment, index) => `    <comment id="${index + 1}">${escapeXml(comment)}</comment>`)
          .join('\n')
      : `    <comment id="1">${escapeXml(DEFAULT_EMPTY_COMMENT_TEXT)}</comment>`;

  return [
    '<cultural_data>',
    '  <documents>',
    articlesXml,
    '  </documents>',
    '  <social_listening_verbatim>',
    commentsXml,
    '  </social_listening_verbatim>',
    '</cultural_data>',
  ].join('\n');
}

export function buildSynthesisMessages(articles: string[], socialComments: string[]): ChatCompletionMessageParam[] {
  const culturalDataContext = buildSynthesisContext(articles, socialComments);

  return [
    {
      role: 'system',
      content: SYNTHESIS_SYSTEM_PROMPT,
    },
    {
      role: 'user',
      content: culturalDataContext,
    },
  ];
}
