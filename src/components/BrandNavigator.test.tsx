import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandNavigator from './BrandNavigator';

const {
  generateBrandResearchMatrix,
  suggestBrands,
  askMatrixQuestion,
  generateDeepDive,
  generateDeepDivesBatch,
  supabaseFrom,
  supabaseInsert,
  supabaseLimit,
} = vi.hoisted(() => ({
  generateBrandResearchMatrix: vi.fn(),
  suggestBrands: vi.fn(),
  askMatrixQuestion: vi.fn(),
  generateDeepDive: vi.fn(),
  generateDeepDivesBatch: vi.fn(),
  supabaseFrom: vi.fn(),
  supabaseInsert: vi.fn(async () => ({ data: null, error: null })),
  supabaseLimit: vi.fn(async () => ({ data: [], error: null })),
}));

vi.mock('../services/azure-openai', () => ({
  generateBrandResearchMatrix,
  suggestBrands,
  askMatrixQuestion,
  generateDeepDive,
  generateDeepDivesBatch,
}));

vi.mock('../services/telemetry', () => ({
  getUserTelemetry: vi.fn().mockResolvedValue({
    device: 'test-device',
    location: 'test-location',
    ip_address: '127.0.0.1',
  }),
}));

vi.mock('../services/supabase-client', () => ({
  supabase: {
    from: supabaseFrom.mockImplementation(() => {
      const builder: any = {};
      builder.select = vi.fn(() => builder);
      builder.order = vi.fn(() => builder);
      builder.limit = supabaseLimit;
      builder.insert = supabaseInsert;
      builder.delete = vi.fn(() => builder);
      builder.eq = vi.fn(async () => ({ data: null, error: null }));
      return builder;
    }),
  },
}));

vi.mock('./SplashGrid', () => ({ SplashGrid: () => null }));
vi.mock('./DesignExcavator', () => ({ BrandDeepDivePage: () => null }));
vi.mock('./TrendLifecycleBadge', () => ({ TrendLifecycleBadge: () => null }));
vi.mock('./ProgressiveLoader', () => ({ ProgressiveLoader: () => <span>Loading</span> }));
vi.mock('./Accordion', () => ({ Accordion: () => null }));
vi.mock('./FeedbackChatWidget', () => ({ FeedbackChatWidget: () => null }));

const emptyMatrix = {
  analysisObjective: 'test objective',
  ecosystemMethod: 'test method',
  results: [],
  sources: [],
};

describe('BrandNavigator', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
    vi.clearAllMocks();
    supabaseFrom.mockClear();
    supabaseInsert.mockClear();
    supabaseLimit.mockClear();
    suggestBrands.mockResolvedValue(['Nike', 'Adidas']);
    generateBrandResearchMatrix.mockResolvedValue(emptyMatrix);
    askMatrixQuestion.mockResolvedValue({ answer: 'ok', relevantInsights: [] });
    generateDeepDive.mockResolvedValue({});
    generateDeepDivesBatch.mockResolvedValue([]);
  });

  it('uses brand chips and supports enter/comma/backspace/remove interactions', async () => {
    render(<BrandNavigator />);

    fireEvent.click(screen.getByRole('button', { name: /brand navigator/i }));

    const brandsInput = await screen.findByTestId('brands-input');

    fireEvent.change(brandsInput, { target: { value: 'Ni' } });

    await waitFor(() => {
      expect(screen.getByText('Suggestions')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Nike' }));
    expect(await screen.findByTestId('brand-chip-0')).toHaveTextContent('Nike');

    fireEvent.change(screen.getByTestId('brands-input'), { target: { value: 'Adidas' } });
    fireEvent.keyDown(screen.getByTestId('brands-input'), { key: ',', code: 'Comma' });

    expect(await screen.findByTestId('brand-chip-1')).toHaveTextContent('Adidas');

    fireEvent.keyDown(screen.getByTestId('brands-input'), { key: 'Backspace', code: 'Backspace' });
    await waitFor(() => {
      expect(screen.queryByTestId('brand-chip-1')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /remove nike/i }));
    await waitFor(() => {
      expect(screen.queryByTestId('brand-chip-0')).not.toBeInTheDocument();
    });
  });

  it('shows brand dropdown guidance on first character typed', async () => {
    render(<BrandNavigator />);

    fireEvent.click(screen.getByRole('button', { name: /brand navigator/i }));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'N' } });

    expect(await screen.findByText('Type at least 2 characters for suggestions.')).toBeInTheDocument();
  });

  it('falls back to local suggestions when API suggestions are empty', async () => {
    suggestBrands.mockResolvedValue([]);
    render(<BrandNavigator />);

    fireEvent.click(screen.getByRole('button', { name: /brand navigator/i }));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Ni' } });

    expect(await screen.findByText('Nike')).toBeInTheDocument();
  });

  it('requires only brands for generate and treats audience as optional', async () => {
    render(<BrandNavigator />);

    fireEvent.click(screen.getByRole('button', { name: /brand navigator/i }));

    const generateButton = await screen.findByRole('button', { name: /generate analysis/i });
    fireEvent.click(generateButton);

    expect(await screen.findByText(/at least one brand is required/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Primary Audience (Optional)')).toBeInTheDocument();

    const brandsInput = screen.getByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Patagonia' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });

    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(generateBrandResearchMatrix).toHaveBeenCalledWith('', [{ name: 'Patagonia', website: '' }], [], '', [], []);
    });
  });

  it('opens research experience immediately when hash route targets brand navigator', async () => {
    window.history.pushState({}, '', '/#brand-navigator');
    render(<BrandNavigator />);

    expect(await screen.findByRole('button', { name: /generate analysis/i })).toBeInTheDocument();
  });

  it('renders high-level summary for each brand result', async () => {
    generateBrandResearchMatrix.mockResolvedValue({
      analysisObjective: 'test objective',
      ecosystemMethod: 'test method',
      results: [
        {
          brandName: 'Patagonia',
          highLevelSummary: 'Purpose-led outdoor brand with premium durability positioning.',
          brandMission: 'Save our home planet.',
          brandPositioning: {
            taglines: ['We’re in business to save our home planet'],
            keyMessagesAndClaims: ['Built to last'],
            valueProposition: 'Durable gear that aligns with environmental values.',
            voiceAndTone: 'Direct and principled',
          },
          keyOfferingsProductsServices: ['Outerwear'],
          strategicMoatsStrengths: ['Brand trust'],
          potentialThreatsWeaknesses: ['Premium pricing pressure'],
          targetAudiences: [],
          recentCampaigns: [],
          keyMarketingChannels: [],
          socialMediaChannels: [],
          sources: [],
        },
      ],
      sources: [],
    });

    render(<BrandNavigator />);
    fireEvent.click(screen.getByRole('button', { name: /brand navigator/i }));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Patagonia' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });

    fireEvent.click(await screen.findByRole('button', { name: /generate analysis/i }));

    expect(await screen.findByText(/high-level summary/i)).toBeInTheDocument();
    expect(
      await screen.findByText('Purpose-led outdoor brand with premium durability positioning.')
    ).toBeInTheDocument();

    const missionSection = screen.getByTestId('brand-result-section-brand-mission');
    expect(missionSection.className).toContain('h-fit');
    expect(missionSection.className).toContain('self-start');

    const sectionsLayout = screen.getByTestId('brand-result-sections-layout');
    expect(sectionsLayout.className).toContain('lg:columns-2');
  });

  it('renders recent news headlines as external article links, ordered most recent first, with dates', async () => {
    generateBrandResearchMatrix.mockResolvedValue({
      analysisObjective: 'test objective',
      ecosystemMethod: 'test method',
      results: [
        {
          brandName: 'Patagonia',
          highLevelSummary: 'Summary',
          brandMission: 'Mission',
          brandPositioning: {
            taglines: [],
            keyMessagesAndClaims: [],
            valueProposition: 'Value',
            voiceAndTone: 'Tone',
          },
          keyOfferingsProductsServices: [],
          strategicMoatsStrengths: [],
          potentialThreatsWeaknesses: [],
          targetAudiences: [],
          recentCampaigns: [],
          keyMarketingChannels: [],
          socialMediaChannels: [],
          recentNews: [
            {
              headline: 'Older sustainability update',
              url: 'https://www.reuters.com/world/us/older-sustainability-update/',
              publishedAt: '2026-01-12T10:00:00.000Z',
            },
            {
              headline: 'Patagonia launches repair initiative',
              url: 'https://www.reuters.com/world/us/patagonia-launches-repair-initiative/',
              publishedAt: '2026-02-14T09:00:00.000Z',
            },
          ],
          sources: [],
        },
      ],
      sources: [],
    });

    render(<BrandNavigator />);
    fireEvent.click(screen.getByRole('button', { name: /brand navigator/i }));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Patagonia' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });

    fireEvent.click(await screen.findByRole('button', { name: /generate analysis/i }));

    const firstHeadlineLink = await screen.findByRole('link', { name: /patagonia launches repair initiative/i });
    expect(firstHeadlineLink).toHaveAttribute('href', 'https://www.reuters.com/world/us/patagonia-launches-repair-initiative/');
    expect(firstHeadlineLink).toHaveTextContent('(2/14/2026)');

    const secondHeadlineLink = await screen.findByRole('link', { name: /older sustainability update/i });
    expect(secondHeadlineLink).toHaveAttribute('href', 'https://www.reuters.com/world/us/older-sustainability-update/');
    expect(secondHeadlineLink).toHaveTextContent('(1/12/2026)');

    const orderedLinks = screen.getAllByTestId(/news-link-0-/);
    expect(orderedLinks[0]).toHaveTextContent('Patagonia launches repair initiative');
    expect(orderedLinks[1]).toHaveTextContent('Older sustainability update');
  });

  it('filters out social media links that do not match the declared channel', async () => {
    generateBrandResearchMatrix.mockResolvedValue({
      analysisObjective: 'test objective',
      ecosystemMethod: 'test method',
      results: [
        {
          brandName: 'Patagonia',
          highLevelSummary: 'Summary',
          brandMission: 'Mission',
          brandPositioning: {
            taglines: [],
            keyMessagesAndClaims: [],
            valueProposition: 'Value',
            voiceAndTone: 'Tone',
          },
          keyOfferingsProductsServices: [],
          strategicMoatsStrengths: [],
          potentialThreatsWeaknesses: [],
          targetAudiences: [],
          recentCampaigns: [],
          keyMarketingChannels: [],
          socialMediaChannels: [
            { channel: 'Instagram', url: 'https://www.instagram.com/patagonia/' },
            { channel: 'LinkedIn', url: 'https://www.instagram.com/not-linkedin/' },
          ],
          recentNews: [],
          sources: [],
        },
      ],
      sources: [],
    });

    render(<BrandNavigator />);
    fireEvent.click(screen.getByRole('button', { name: /brand navigator/i }));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Patagonia' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });

    fireEvent.click(await screen.findByRole('button', { name: /generate analysis/i }));

    expect(await screen.findByRole('link', { name: /instagram/i })).toHaveAttribute('href', 'https://www.instagram.com/patagonia/');
    expect(screen.queryByRole('link', { name: /linkedin/i })).not.toBeInTheDocument();
  });

  it('does not use generic sources as recent news headlines', async () => {
    generateBrandResearchMatrix.mockResolvedValue({
      analysisObjective: 'test objective',
      ecosystemMethod: 'test method',
      results: [
        {
          brandName: 'Patagonia',
          highLevelSummary: 'Summary',
          brandMission: 'Mission',
          brandPositioning: {
            taglines: [],
            keyMessagesAndClaims: [],
            valueProposition: 'Value',
            voiceAndTone: 'Tone',
          },
          keyOfferingsProductsServices: [],
          strategicMoatsStrengths: [],
          potentialThreatsWeaknesses: [],
          targetAudiences: [],
          recentCampaigns: [],
          keyMarketingChannels: [],
          socialMediaChannels: [],
          recentNews: [],
          sources: [{ title: 'Corporate source only', url: 'https://example.com/source-only' }],
        },
      ],
      sources: [],
    });

    render(<BrandNavigator />);
    fireEvent.click(screen.getByRole('button', { name: /brand navigator/i }));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Patagonia' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });

    fireEvent.click(await screen.findByRole('button', { name: /generate analysis/i }));

    const recentNewsHeader = await screen.findByText(/recent news/i);
    const recentNewsSection = recentNewsHeader.closest('div');
    expect(recentNewsSection).toBeTruthy();
    if (!recentNewsSection) {
      throw new Error('Expected recent news section container.');
    }
    expect(within(recentNewsSection).getByText('N/A')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /corporate source only/i })).not.toBeInTheDocument();
  });

  it('saves Brand Navigator results to the BrandNavigator table with a custom_name', async () => {
    render(<BrandNavigator />);
    fireEvent.click(screen.getByRole('button', { name: /brand navigator/i }));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Patagonia' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });

    fireEvent.click(await screen.findByRole('button', { name: /generate analysis/i }));

    await waitFor(() => {
      expect(generateBrandResearchMatrix).toHaveBeenCalled();
      expect(supabaseFrom).toHaveBeenCalledWith('BrandNavigator');
      expect(supabaseInsert).toHaveBeenCalled();
    });

    const firstInsertPayload = (supabaseInsert as any).mock.calls[0]?.[0]?.[0];
    expect(firstInsertPayload).toBeDefined();
    if (!firstInsertPayload) {
      throw new Error('Expected first supabase insert payload.');
    }
    expect(firstInsertPayload.custom_name).toMatch(/^BN\|/);
    expect(firstInsertPayload.brand).toBe('Patagonia');
    expect(firstInsertPayload.matrix).toEqual(emptyMatrix);
  });
});
