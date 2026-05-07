import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandNavigator from './BrandNavigator';

const {
  generateBrandResearchMatrix,
  suggestBrands,
  askMatrixQuestion,
  askBrandNavigatorQuestion,
  generateDeepDive,
  generateDeepDivesBatch,
  supabaseFrom,
  supabaseInsert,
  supabaseLimit,
} = vi.hoisted(() => ({
  generateBrandResearchMatrix: vi.fn(),
  suggestBrands: vi.fn(),
  askMatrixQuestion: vi.fn(),
  askBrandNavigatorQuestion: vi.fn(),
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
  askBrandNavigatorQuestion,
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
    askBrandNavigatorQuestion.mockResolvedValue({ answer: 'web-backed answer', relevantSections: [], webHighlights: [] });
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
    expect(sectionsLayout.className).toContain('lg:grid-cols-2');
  });

  it('renders inferred labels as Cultural Archaeologist-style chips in brand audience fields', async () => {
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
          targetAudiences: [
            {
              audience: 'Outdoor enthusiasts',
              priority: '[INFERRED] Primary',
              inferredRoleToConsumers: '[INFERRED] Trusted sustainability guide',
              functionalBenefits: ['[INFERRED] Durable performance in varied weather'],
              emotionalBenefits: ['[INFERRED] Alignment with environmental values'],
            },
          ],
          recentCampaigns: [],
          keyMarketingChannels: [],
          socialMediaChannels: [],
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

    expect(await screen.findByText('Trusted sustainability guide')).toBeInTheDocument();
    expect(screen.queryByText(/\[INFERRED\]\s*Trusted sustainability guide/i)).not.toBeInTheDocument();

    const inferredBadges = screen.getAllByText('inferred');
    expect(inferredBadges.length).toBeGreaterThan(0);
    expect(inferredBadges[0].className).toContain('bg-emerald-50');
    expect(inferredBadges[0].className).toContain('text-emerald-700');
    expect(inferredBadges[0].className).toContain('border-emerald-200');
  });

  it('converts inferred markers in summary and mission text into chips, including malformed bracket markers', async () => {
    generateBrandResearchMatrix.mockResolvedValue({
      analysisObjective: 'test objective',
      ecosystemMethod: 'test method',
      results: [
        {
          brandName: 'Emirates',
          highLevelSummary:
            'Emirates is a premium long-haul carrier. [INFERRED] In 2024-2026, the brand posture likely emphasizes premium demand capture.',
          brandMission:
            'To connect people globally through premium service. [INFERRED; the canonical statement could vary by source.]',
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
          sources: [],
        },
      ],
      sources: [],
    });

    render(<BrandNavigator />);
    fireEvent.click(screen.getByRole('button', { name: /brand navigator/i }));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Emirates' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });
    fireEvent.click(await screen.findByRole('button', { name: /generate analysis/i }));

    expect(await screen.findByText(/premium long-haul carrier/i)).toBeInTheDocument();
    expect(screen.queryByText(/\[INFERRED\]/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\[INFERRED;/i)).not.toBeInTheDocument();

    const inferredBadges = screen.getAllByText('inferred');
    expect(inferredBadges.length).toBeGreaterThanOrEqual(2);
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

  it('supports show-all-items behavior for long brand result lists', async () => {
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
          strategicMoatsStrengths: [
            'Strength one',
            'Strength two',
            'Strength three',
            'Strength four',
            'Strength five',
            'Strength six',
          ],
          potentialThreatsWeaknesses: [],
          targetAudiences: [],
          recentCampaigns: [],
          keyMarketingChannels: [],
          socialMediaChannels: [],
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

    expect(await screen.findByText('Strength four')).toBeInTheDocument();
    expect(screen.queryByText('Strength five')).not.toBeInTheDocument();

    const showAllBtn = screen.getByRole('button', { name: /show all 6 items/i });
    fireEvent.click(showAllBtn);

    expect(await screen.findByText('Strength five')).toBeInTheDocument();
    expect(await screen.findByText('Strength six')).toBeInTheDocument();
  });

  it('keeps valid mainstream recent news links even when publishedAt is missing', async () => {
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
              headline: 'Patagonia announces new supply-chain commitments',
              url: 'https://www.reuters.com/world/us/patagonia-announces-new-supply-chain-commitments/',
              publishedAt: null,
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

    const link = await screen.findByRole('link', { name: /patagonia announces new supply-chain commitments/i });
    expect(link).toHaveAttribute('href', 'https://www.reuters.com/world/us/patagonia-announces-new-supply-chain-commitments/');
  });

  it('includes valid non-top-list news outlets when they have article coverage', async () => {
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
              headline: 'Patagonia expands retail footprint',
              url: 'https://www.foxnews.com/lifestyle/patagonia-expands-retail-footprint',
              publishedAt: '2026-03-10T10:00:00.000Z',
              outlet: 'Fox News',
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

    const link = await screen.findByRole('link', { name: /patagonia expands retail footprint/i });
    expect(link).toHaveAttribute('href', 'https://www.foxnews.com/lifestyle/patagonia-expands-retail-footprint');
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

  it('filters out social media links that point to homepages or non-brand pages', async () => {
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
            { channel: 'Instagram', url: 'https://www.instagram.com/' },
            { channel: 'Instagram', url: 'https://www.instagram.com/anotherbrand/' },
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

    const links = await screen.findAllByTestId(/social-link-0-/);
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', 'https://www.instagram.com/patagonia/');
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
    expect(
      within(recentNewsSection).getByText('No recent coverage found from news outlets or brand press pages.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /corporate source only/i })).not.toBeInTheDocument();
  });

  it('does not display social media links in recent news', async () => {
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
              headline: 'Patagonia on X',
              url: 'https://x.com/patagonia/status/12345',
              publishedAt: new Date().toISOString(),
              outlet: 'X',
            },
            {
              headline: 'Patagonia expands retail footprint',
              url: 'https://www.foxnews.com/lifestyle/patagonia-expands-retail-footprint',
              publishedAt: new Date().toISOString(),
              outlet: 'Fox News',
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

    expect(await screen.findByRole('link', { name: /patagonia expands retail footprint/i }))
      .toHaveAttribute('href', 'https://www.foxnews.com/lifestyle/patagonia-expands-retail-footprint');
    expect(screen.queryByRole('link', { name: /patagonia on x/i })).not.toBeInTheDocument();
  });

  it('supports Brand Navigator follow-up AI search and highlights grounded sections', async () => {
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
          sources: [],
        },
      ],
      sources: [],
    });

    askBrandNavigatorQuestion.mockResolvedValue({
      answer: 'Patagonia is leaning into repair-led circularity messaging.',
      relevantSections: ['brandMission'],
      webHighlights: ['Reuters: Patagonia expands repair services in 2026.'],
    });

    render(<BrandNavigator />);
    fireEvent.click(screen.getByRole('button', { name: /brand navigator/i }));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Patagonia' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });
    fireEvent.click(await screen.findByRole('button', { name: /generate analysis/i }));

    fireEvent.change(await screen.findByTestId('brand-qa-input'), {
      target: { value: 'What is their current strategic narrative?' },
    });
    fireEvent.click(screen.getByTestId('brand-qa-submit'));

    expect(await screen.findByText(/repair-led circularity messaging/i)).toBeInTheDocument();
    expect(await screen.findByText(/Reuters: Patagonia expands repair services in 2026\./i)).toBeInTheDocument();
    expect(screen.getByText('Brand Mission')).toBeInTheDocument();

    const missionSection = screen.getByTestId('brand-result-section-brand-mission');
    expect(missionSection.className).toContain('ring-2');
    expect(askBrandNavigatorQuestion).toHaveBeenCalled();
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

  it('shows compare-across-brands option when clicking a result section and more than one brand is analyzed', async () => {
    generateBrandResearchMatrix.mockResolvedValue({
      analysisObjective: 'test objective',
      ecosystemMethod: 'test method',
      results: [
        {
          brandName: 'Patagonia',
          highLevelSummary: 'Summary A',
          brandMission: 'Mission A',
          brandPositioning: {
            taglines: [],
            keyMessagesAndClaims: [],
            valueProposition: 'Value A',
            voiceAndTone: 'Tone A',
          },
          keyOfferingsProductsServices: [],
          strategicMoatsStrengths: [],
          potentialThreatsWeaknesses: [],
          targetAudiences: [],
          recentCampaigns: [],
          keyMarketingChannels: [],
          socialMediaChannels: [],
          recentNews: [],
          sources: [],
        },
        {
          brandName: 'Nike',
          highLevelSummary: 'Summary B',
          brandMission: 'Mission B',
          brandPositioning: {
            taglines: [],
            keyMessagesAndClaims: [],
            valueProposition: 'Value B',
            voiceAndTone: 'Tone B',
          },
          keyOfferingsProductsServices: [],
          strategicMoatsStrengths: [],
          potentialThreatsWeaknesses: [],
          targetAudiences: [],
          recentCampaigns: [],
          keyMarketingChannels: [],
          socialMediaChannels: [],
          recentNews: [],
          sources: [],
        },
      ],
      sources: [],
    });

    render(<BrandNavigator />);
    fireEvent.click(screen.getByRole('button', { name: /brand navigator/i }));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Patagonia, Nike' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });

    fireEvent.click(await screen.findByRole('button', { name: /generate analysis/i }));

    const missionSections = await screen.findAllByTestId('brand-result-section-brand-mission');
    fireEvent.click(missionSections[0]);

    expect(await screen.findByRole('button', { name: /compare across brands/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /compare across brands/i }));

    expect(await screen.findByText(/Compare Across Brands:\s*Brand mission/i)).toBeInTheDocument();
  });

  it('scrolls to compare panel when compare across brands is selected', async () => {
    const scrollIntoViewMock = vi.fn();
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    generateBrandResearchMatrix.mockResolvedValue({
      analysisObjective: 'test objective',
      ecosystemMethod: 'test method',
      results: [
        {
          brandName: 'Patagonia',
          highLevelSummary: 'Summary A',
          brandMission: 'Mission A',
          brandPositioning: {
            taglines: [],
            keyMessagesAndClaims: [],
            valueProposition: 'Value A',
            voiceAndTone: 'Tone A',
          },
          keyOfferingsProductsServices: [],
          strategicMoatsStrengths: [],
          potentialThreatsWeaknesses: [],
          targetAudiences: [],
          recentCampaigns: [],
          keyMarketingChannels: [],
          socialMediaChannels: [],
          recentNews: [],
          sources: [],
        },
        {
          brandName: 'Nike',
          highLevelSummary: 'Summary B',
          brandMission: 'Mission B',
          brandPositioning: {
            taglines: [],
            keyMessagesAndClaims: [],
            valueProposition: 'Value B',
            voiceAndTone: 'Tone B',
          },
          keyOfferingsProductsServices: [],
          strategicMoatsStrengths: [],
          potentialThreatsWeaknesses: [],
          targetAudiences: [],
          recentCampaigns: [],
          keyMarketingChannels: [],
          socialMediaChannels: [],
          recentNews: [],
          sources: [],
        },
      ],
      sources: [],
    });

    try {
      render(<BrandNavigator />);
      fireEvent.click(screen.getByRole('button', { name: /brand navigator/i }));

      const brandsInput = await screen.findByTestId('brands-input');
      fireEvent.change(brandsInput, { target: { value: 'Patagonia, Nike' } });
      fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });

      fireEvent.click(await screen.findByRole('button', { name: /generate analysis/i }));

      const missionSections = await screen.findAllByTestId('brand-result-section-brand-mission');
      fireEvent.click(missionSections[0]);

      fireEvent.click(await screen.findByRole('button', { name: /compare across brands/i }));

      expect(await screen.findByTestId('compare-across-brands-panel')).toBeInTheDocument();
      await waitFor(() => {
        expect(scrollIntoViewMock).toHaveBeenCalled();
      });
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it('does not show compare-across-brands option when only one brand is analyzed', async () => {
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

    const missionSection = await screen.findByTestId('brand-result-section-brand-mission');
    fireEvent.click(missionSection);

    expect(screen.queryByRole('button', { name: /compare across brands/i })).not.toBeInTheDocument();
  });
});
