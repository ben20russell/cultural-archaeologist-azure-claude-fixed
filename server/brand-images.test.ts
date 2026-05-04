import { describe, expect, it } from 'vitest';
import { extractDesignTokensFromHtml } from './brand-images';

describe('extractDesignTokensFromHtml', () => {
  it('extracts unique CSS hex colors and font families with limits', () => {
    const html = `
      <style>
        :root {
          --brand-primary: #1a2b3c;
          --brand-accent: #ABC;
        }
        body { font-family: 'Avenir Next', Arial, sans-serif; color: #1a2b3c; }
        h1 { font-family: "GT America", Helvetica, sans-serif; }
      </style>
      <div style="background:#ff8800;">Hello</div>
    `;

    const result = extractDesignTokensFromHtml(html);

    expect(result.colors).toEqual(['#1A2B3C', '#ABC', '#FF8800']);
    expect(result.fonts).toEqual([
      'Avenir Next, Arial, sans-serif',
      'GT America, Helvetica, sans-serif',
    ]);
  });
});
