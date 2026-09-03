import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandNavigator from './BrandNavigator';

const {
  generateBrandResearchMatrix,
  suggestBrands,
  suggestBrandWebsite,
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
  suggestBrandWebsite: vi.fn(),
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
  suggestBrandWebsite,
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

const { saveDesignExcavatorPrefill } = vi.hoisted(() => ({
  saveDesignExcavatorPrefill: vi.fn(),
}));

const { openWindowInNewTab } = vi.hoisted(() => ({
  openWindowInNewTab: vi.fn(),
}));

vi.mock('../services/design-excavator-prefill', () => ({
  saveDesignExcavatorPrefill,
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

const incompleteMatrix = {
  analysisObjective: 'test objective',
  ecosystemMethod: 'test method',
  results: [
    {
      brandName: 'Patagonia',
      highLevelSummary: 'N/A',
      brandMission: 'N/A',
      brandPositioning: {
        taglines: [],
        keyMessagesAndClaims: [],
        valueProposition: 'N/A',
        voiceAndTone: 'N/A',
      },
      keyOfferingsProductsServices: [],
      strategicMoatsStrengths: [],
      potentialThreatsWeaknesses: [],
      challenges: [],
      targetAudiences: [],
      recentCampaigns: [],
      keyMarketingChannels: [],
      socialMediaChannels: [],
      recentNews: [],
      sources: [],
    },
  ],
  sources: [],
};

const matrixWithResults = {
  analysisObjective: 'test objective',
  ecosystemMethod: 'test method',
  results: [
    {
      brandName: 'Patagonia',
      highLevelSummary: 'Purpose-first outdoor brand.',
      brandMission: 'Build the best product.',
      brandPositioning: {
        taglines: ['We’re in business to save our home planet'],
        keyMessagesAndClaims: ['Durability over disposable fashion'],
        valueProposition: 'Premium outdoor apparel with activism core',
        voiceAndTone: 'Principled and direct',
      },
      keyOfferingsProductsServices: ['Outerwear'],
      strategicMoatsStrengths: ['Brand trust'],
      potentialThreatsWeaknesses: ['Premium pricing'],
      challenges: ['Balancing premium pricing with category inflation pressure'],
      targetAudiences: [],
      recentCampaigns: ['Worn Wear'],
      keyMarketingChannels: ['Owned channels'],
      socialMediaChannels: [],
      recentNews: [],
      sources: [],
    },
  ],
  sources: [{ title: 'Patagonia newsroom', url: 'https://www.patagonia.com/stories/' }],
};

describe('BrandNavigator', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
    vi.clearAllMocks();
    openWindowInNewTab.mockReset();
    window.open = openWindowInNewTab as unknown as Window['open'];
    supabaseFrom.mockClear();
    supabaseInsert.mockClear();
    supabaseLimit.mockClear();
    suggestBrands.mockResolvedValue(['Nike', 'Adidas']);
    suggestBrandWebsite.mockResolvedValue(null);
    generateBrandResearchMatrix.mockResolvedValue(emptyMatrix);
    askMatrixQuestion.mockResolvedValue({ answer: 'ok', relevantInsights: [] });
    askBrandNavigatorQuestion.mockResolvedValue({ answer: 'web-backed answer', relevantSections: [], webHighlights: [] });
    generateDeepDive.mockResolvedValue({});
    generateDeepDivesBatch.mockResolvedValue([]);
  });

  it('uses brand chips and supports enter/comma/backspace/remove interactions', async () => {
    render(<BrandNavigator />);

    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

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

  it('resolves homepage website in the background and exposes it on chip hover metadata', async () => {
    suggestBrandWebsite.mockResolvedValue('https://www.nike.com/');

    render(<BrandNavigator />);
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Nike' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(suggestBrandWebsite).toHaveBeenCalledWith('Nike');
    });

    const chip = await screen.findByTestId('brand-chip-0');
    await waitFor(() => {
      expect(chip).toHaveAttribute('title', expect.stringContaining('https://www.nike.com/'));
    });
  });

  it('allows long brand chips to wrap so full names remain visible', async () => {
    render(<BrandNavigator />);

    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

    const brandsInput = await screen.findByTestId('brands-input');
    const longBrandName = 'Rivian Automotive and Electric Adventure Vehicles International';

    fireEvent.change(brandsInput, { target: { value: longBrandName } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });

    const chip = await screen.findByTestId('brand-chip-0');
    expect(chip).toHaveTextContent(longBrandName);
    expect(chip.className).toContain('whitespace-normal');
    expect(chip.className).toContain('break-words');
  });

  it('shows brand dropdown guidance on first character typed', async () => {
    render(<BrandNavigator />);

    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'N' } });

    expect(await screen.findByText('Type at least 2 characters for suggestions.')).toBeInTheDocument();
  });

  it('opens generation, sources, and upload hover explainers on field hover', async () => {
    render(<BrandNavigator />);

    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

    await screen.findByTestId('brand-generation-field');

    fireEvent.mouseEnter(screen.getByTestId('brand-generation-field'));
    const generationExplainerTooltip = screen.getByTestId('brand-generation-field-explainer-tooltip');
    expect(generationExplainerTooltip).toHaveTextContent(
      'Select one or more age groups to focus your analysis.'
    );
    expect(generationExplainerTooltip.className).toContain('bg-black');

    fireEvent.mouseLeave(screen.getByTestId('brand-generation-field'));
    await waitFor(() => {
      expect(screen.queryByTestId('brand-generation-field-explainer-tooltip')).not.toBeInTheDocument();
    });

    fireEvent.mouseEnter(screen.getByTestId('brand-sources-field'));
    expect(screen.getByTestId('brand-sources-field-explainer-tooltip')).toHaveTextContent(
      'Select the type of source(s) for your results. Source type adds context and specificity to observations.'
    );

    fireEvent.mouseLeave(screen.getByTestId('brand-sources-field'));
    await waitFor(() => {
      expect(screen.queryByTestId('brand-sources-field-explainer-tooltip')).not.toBeInTheDocument();
    });

    fireEvent.mouseEnter(screen.getByTestId('brand-upload-field'));
    expect(screen.getByTestId('brand-upload-field-explainer-tooltip')).toHaveTextContent(
      'Upload one or more documents to complement your analysis.'
    );

    fireEvent.mouseLeave(screen.getByTestId('brand-upload-field'));
    await waitFor(() => {
      expect(screen.queryByTestId('brand-upload-field-explainer-tooltip')).not.toBeInTheDocument();
    });
  });

  it('renders helper guidance text for audience, brands/category, and topic inputs', async () => {
    render(<BrandNavigator />);

    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

    await screen.findByTestId('brands-input');

    const audienceHelperText = screen.getByText('Add the audience you want to analyze.');
    const brandsHelperText = screen.getByText('Add one or more brands to analyze.');
    const topicHelperText = screen.getByText('Add a question or topic you want to explore.');

    expect(screen.getByTestId('brand-audience-guidance').className).toContain('items-start');
    expect(screen.getByTestId('brand-brands-guidance').className).toContain('items-start');
    expect(screen.getByTestId('brand-topic-guidance').className).toContain('items-start');
    expect(screen.getByTestId('brand-audience-guidance').className).toContain('text-left');
    expect(screen.getByTestId('brand-brands-guidance').className).toContain('text-left');
    expect(screen.getByTestId('brand-topic-guidance').className).toContain('text-left');
    expect(audienceHelperText.className).toContain('self-start');
    expect(brandsHelperText.className).toContain('self-start');
    expect(topicHelperText.className).toContain('self-start');
  });

  it('renders mobile helper guidance rows for generation, sources, and upload fields', async () => {
    render(<BrandNavigator />);

    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

    await screen.findByTestId('brand-generation-field');

    const generationMobileGuidance = screen.getByTestId('brand-generation-mobile-guidance');
    const sourcesMobileGuidance = screen.getByTestId('brand-sources-mobile-guidance');
    const uploadMobileGuidance = screen.getByTestId('brand-upload-mobile-guidance');

    expect(generationMobileGuidance.className).toContain('md:hidden');
    expect(sourcesMobileGuidance.className).toContain('md:hidden');
    expect(uploadMobileGuidance.className).toContain('md:hidden');
    expect(screen.getByTestId('brand-generation-mobile-guidance-inline').className).toContain('text-left');
    expect(screen.getByTestId('brand-sources-mobile-guidance-inline').className).toContain('text-left');
    expect(screen.getByTestId('brand-upload-mobile-guidance-inline').className).toContain('text-left');

    expect(generationMobileGuidance).toHaveTextContent('Select one or more age groups to focus your analysis.');
    expect(sourcesMobileGuidance).toHaveTextContent(
      'Select the type of source(s) for your results. Source type adds context and specificity to observations.'
    );
    expect(uploadMobileGuidance).toHaveTextContent('Upload one or more documents to complement your analysis.');
  });

  it('suppresses field hover explainers on mobile so inline guidance is the only tooltip source', async () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('max-width: 767px'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    try {
      render(<BrandNavigator />);
      fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

      await screen.findByTestId('brand-generation-field');

      fireEvent.mouseEnter(screen.getByTestId('brand-generation-field'));
      expect(screen.queryByTestId('brand-generation-field-explainer-tooltip')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('brand-generation-mobile-guidance-inline-trigger'));
      expect(screen.getByTestId('brand-generation-mobile-guidance-inline-tooltip')).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, 'matchMedia', { writable: true, value: originalMatchMedia });
    }
  });

  it('opens audience and topic guidance tooltips and closes with escape or outside click', async () => {
    render(<BrandNavigator />);

    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

    await screen.findByTestId('brands-input');

    fireEvent.click(screen.getByTestId('brand-audience-guidance-trigger'));
    const audienceGuidanceTooltip = screen.getByTestId('brand-audience-guidance-tooltip');
    expect(audienceGuidanceTooltip).toHaveTextContent(
      'The more specific the audience, the most specific the results. Examples: Gen Z women, AI tech professionals, Homebuyers.'
    );
    expect(audienceGuidanceTooltip.className).toContain('bg-black');

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('brand-audience-guidance-tooltip')).not.toBeInTheDocument();
    });

    expect(screen.queryByTestId('brand-brands-guidance-trigger')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('brand-topic-guidance-trigger'));
    expect(screen.getByTestId('brand-topic-guidance-tooltip')).toHaveTextContent(
      'Examples: Gen Z purchase behavior, post-workout rituals, why runners switch from Nike to Hoka.'
    );

    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(screen.queryByTestId('brand-topic-guidance-tooltip')).not.toBeInTheDocument();
    });
  });

  it('expands a detailed audience definition box from the audience icon and accepts long bullet lists', async () => {
    render(<BrandNavigator />);
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));
    await screen.findByTestId('audience-input');

    expect(screen.queryByTestId('brand-audience-detail-input')).not.toBeInTheDocument();

    const detailToggle = screen.getByTestId('brand-audience-detail-toggle');
    fireEvent.click(detailToggle);

    const detailInput = screen.getByTestId('brand-audience-detail-input');
    const longDetail = `${'Audience context line. '.repeat(30)}\n- Highly price sensitive\n- Learns from creators`;
    fireEvent.change(detailInput, { target: { value: longDetail } });

    expect(detailInput).toHaveValue(longDetail);

    fireEvent.click(detailToggle);
    expect(screen.queryByTestId('brand-audience-detail-input')).not.toBeInTheDocument();
  });

  it('uses the expanded audience definition in sourcing context for generation', async () => {
    render(<BrandNavigator />);
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Patagonia' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });

    fireEvent.change(screen.getByTestId('audience-input'), {
      target: { value: 'Outdoor enthusiasts' },
    });
    fireEvent.click(screen.getByTestId('brand-audience-detail-toggle'));
    fireEvent.change(screen.getByTestId('brand-audience-detail-input'), {
      target: { value: '- Actively repairs gear\n- Researches sustainability reports before purchasing' },
    });

    fireEvent.click(screen.getByRole('button', { name: /generate analysis/i }));

    await waitFor(() => {
      expect(generateBrandResearchMatrix).toHaveBeenCalled();
    });

    const sourcedAudience = generateBrandResearchMatrix.mock.calls[0]?.[0];
    expect(typeof sourcedAudience).toBe('string');
    expect(sourcedAudience).toContain('Outdoor enthusiasts');
    expect(sourcedAudience).toContain('Detailed Audience Definition');
    expect(sourcedAudience).toContain('Actively repairs gear');
  });

  it('supports keyboard shortcuts for bullets in expanded audience field', async () => {
    render(<BrandNavigator />);
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));
    await screen.findByTestId('audience-input');

    fireEvent.click(screen.getByTestId('brand-audience-detail-toggle'));
    const detailInput = screen.getByTestId('brand-audience-detail-input') as HTMLTextAreaElement;

    detailInput.focus();
    detailInput.setSelectionRange(0, 0);
    fireEvent.keyDown(detailInput, { key: '8', code: 'Digit8', ctrlKey: true, shiftKey: true });

    await waitFor(() => {
      expect(detailInput).toHaveValue('- ');
    });

    fireEvent.change(detailInput, { target: { value: '- Audience need state' } });
    detailInput.setSelectionRange(detailInput.value.length, detailInput.value.length);
    fireEvent.keyDown(detailInput, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(detailInput).toHaveValue('- Audience need state\n- ');
    });
  });

  it('falls back to local suggestions when API suggestions are empty', async () => {
    suggestBrands.mockResolvedValue([]);
    render(<BrandNavigator />);

    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Ni' } });

    expect(await screen.findByText('Nike')).toBeInTheDocument();
  });

  it('requires only brands for generate and treats audience as optional', async () => {
    render(<BrandNavigator />);

    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

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

  it('shows per-section refresh for incomplete results and runs a fresh search when clicked', async () => {
    generateBrandResearchMatrix
      .mockResolvedValueOnce(incompleteMatrix)
      .mockResolvedValueOnce(incompleteMatrix);

    render(<BrandNavigator />);
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Patagonia' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });

    fireEvent.click(screen.getByRole('button', { name: /generate analysis/i }));
    const refreshButton = await screen.findByTestId('brand-section-refresh-0-highLevelSummary');
    await waitFor(() => {
      expect(refreshButton).not.toBeDisabled();
    }, { timeout: 5000 });
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(generateBrandResearchMatrix).toHaveBeenCalledTimes(2);
    }, { timeout: 5000 });
  });

  it('renders mobile results navigation for all brand result components', async () => {
    generateBrandResearchMatrix.mockResolvedValueOnce(matrixWithResults);

    render(<BrandNavigator />);
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Patagonia' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: /generate analysis/i }));

    const mobileResultsNav = await screen.findByTestId('mobile-results-nav-brand');
    expect(mobileResultsNav).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Brand Q&A' })).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Patagonia' })).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Patagonia: Brand Mission' })).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Patagonia: Potential Challenges' })).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Sources' })).toBeInTheDocument();
  });

  it('renders a Show thinking dropdown for brand results that is closed by default', async () => {
    generateBrandResearchMatrix.mockResolvedValueOnce(matrixWithResults);

    render(<BrandNavigator />);

    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Patagonia' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });

    fireEvent.click(screen.getByRole('button', { name: /generate analysis/i }));

    const showThinkingDetails = await screen.findByTestId('brand-show-thinking-container');
    expect(showThinkingDetails).not.toHaveAttribute('open');

    fireEvent.click(screen.getByTestId('brand-show-thinking-summary'));

    expect(showThinkingDetails).toHaveAttribute('open');
    expect(
      screen.getByText('Used a RAG pipeline: retrieved high-signal brand/category sources, re-ranked for relevance, extracted structured positioning evidence, and generated recommendations grounded in cited inputs.')
    ).toBeInTheDocument();
  });

  it('opens research experience immediately when hash route targets brand navigator', async () => {
    window.history.pushState({}, '', '/#brand-navigator');
    render(<BrandNavigator />);

    expect(await screen.findByRole('button', { name: /generate analysis/i })).toBeInTheDocument();
  });

  it('uses a mobile hamburger for navigation links and keeps desktop top links at sm+', async () => {
    render(<BrandNavigator />);
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

    const mobileTopBar = await screen.findByTestId('mobile-top-bar');
    expect(mobileTopBar.className).toContain('fixed');
    expect(mobileTopBar.className).toContain('top-0');
    expect(mobileTopBar.className).toContain('translate-y-0');
    expect(within(mobileTopBar).getByText('Brand Navigator')).toBeInTheDocument();
    const mobileTitle = within(mobileTopBar).getByTestId('mobile-page-title');
    const mobileIcon = within(mobileTopBar).getByTestId('mobile-page-icon');
    const mobileHeading = within(mobileTopBar).getByTestId('mobile-page-heading');
    expect(mobileHeading.className).toContain('ml-auto');
    expect(mobileHeading.className).toContain('justify-end');
    expect(mobileTitle.className).toContain('text-right');
    expect(Boolean(mobileTitle.compareDocumentPosition(mobileIcon) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    const mobileSubcopy = screen.getByTestId('mobile-page-subcopy');
    expect(mobileSubcopy).toHaveTextContent('Audit any brand or competitive landscape.');
    expect(mobileSubcopy.className).toContain('bg-gradient-to-r');
    expect(mobileSubcopy.className).toContain('from-indigo-500');
    expect(mobileSubcopy.className).toContain('to-fuchsia-500');
    expect(mobileSubcopy.parentElement?.className).toContain('mt-[2px]');
    expect(mobileSubcopy.parentElement?.className).toContain('mb-[2px]');

    const mobileNavTrigger = await screen.findByTestId('mobile-nav-trigger');
    const actionContainer = await screen.findByTestId('top-action-buttons');
    expect(actionContainer.className).toContain('hidden');
    expect(actionContainer.className).toContain('sm:flex-row');
    expect(actionContainer.className).toContain('left-auto');

    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 160 });
    fireEvent.scroll(window);
    expect(mobileTopBar.className).toContain('-translate-y-full');

    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 20 });
    fireEvent.scroll(window);
    expect(mobileTopBar.className).toContain('translate-y-0');

    fireEvent.click(mobileNavTrigger);
    const mobileMenu = await screen.findByTestId('mobile-nav-menu');
    expect(mobileMenu.className).toContain('fixed');
    expect(mobileMenu.className).toContain('top-16');
    expect(mobileMenu.className).toContain('left-4');
    expect(mobileMenu.className).toContain('right-4');
    expect(within(mobileMenu).getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/?home=1');
    expect(within(mobileMenu).getByRole('link', { name: /cultural archaeologist/i })).toHaveAttribute('href', '/#cultural-archaeologist');
    expect(within(mobileMenu).getByRole('link', { name: /design excavator/i })).toHaveAttribute('href', '/#design-excavator');

    expect(within(actionContainer).getByRole('link', { name: /cultural archaeologist/i })).toHaveAttribute('href', '/#cultural-archaeologist');
    expect(within(actionContainer).getByRole('link', { name: /design excavator/i })).toHaveAttribute('href', '/#design-excavator');
  });

  it('renders mobile New Search as an icon button to the right of generate analysis', async () => {
    render(<BrandNavigator />);
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));
    const generateButton = await screen.findByRole('button', { name: /generate analysis/i });
    const newSearchButton = screen.getByTestId('new-search-below-generate');
    expect(newSearchButton).toHaveAccessibleName(/new search/i);
    expect(newSearchButton.className).toContain('sm:hidden');
    expect(Boolean(generateButton.compareDocumentPosition(newSearchButton) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it('left aligns text in the brand, audience, and topic inputs', async () => {
    render(<BrandNavigator />);
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

    const brandsInput = await screen.findByTestId('brands-input');
    const audienceInput = screen.getByTestId('audience-input');
    const topicInput = screen.getByPlaceholderText('Topic Focus (Optional)');

    expect(brandsInput.className).toContain('text-left');
    expect(brandsInput.className).toContain('placeholder:text-left');
    expect(audienceInput.className).toContain('text-left');
    expect(audienceInput.className).toContain('placeholder:text-left');
    expect(topicInput.className).toContain('text-left');
    expect(topicInput.className).toContain('placeholder:text-left');
  });

  it('vertically centers brand input when empty and keeps chip layout when populated', async () => {
    render(<BrandNavigator />);
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

    const brandsInput = await screen.findByTestId('brands-input');
    const brandsInputShell = screen.getByTestId('brands-input-shell');
    const brandInputFrame = screen.getByTestId('brand-input-frame');
    const audienceInput = screen.getByTestId('audience-input');
    const topicInput = screen.getByPlaceholderText('Topic Focus (Optional)');

    expect(brandInputFrame.className).toContain('h-14');
    expect(audienceInput.className).toContain('h-14');
    expect(topicInput.className).toContain('h-14');
    expect(brandsInputShell.className).toContain('items-center');
    expect(brandsInputShell.className).not.toContain('items-start');
    expect(brandsInputShell.className).toContain('h-14');

    fireEvent.change(brandsInput, { target: { value: 'Aesop' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });

    expect(await screen.findByTestId('brand-chip-0')).toBeInTheDocument();
    expect(brandsInputShell.className).toContain('items-start');
    expect(brandsInputShell.className).toContain('min-h-14');
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
          challenges: [
            'Premium pricing pressure from discount-heavy competitors',
            'Supply chain volatility across technical materials',
          ],
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
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Patagonia' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });

    fireEvent.click(await screen.findByRole('button', { name: /generate analysis/i }));

    expect(await screen.findByTestId('brand-result-section-high-level-summary')).toBeInTheDocument();
    expect(
      await screen.findByText(/Purpose-led outdoor brand with premium durability positioning/i, {}, { timeout: 5000 })
    ).toBeInTheDocument();

    const missionSection = screen.getByTestId('brand-result-section-brand-mission');
    expect(missionSection.className).toContain('h-fit');
    expect(missionSection.className).toContain('self-start');

    const positioningSection = screen.getByTestId('brand-result-section-brand-positioning');
    expect(within(positioningSection).getByText(/brand positioning \(existing\)/i)).toBeInTheDocument();
    expect(within(positioningSection).queryByText('(existing)')).not.toBeInTheDocument();

    const sectionsLayout = screen.getByTestId('brand-result-sections-layout');
    expect(sectionsLayout.className).toContain('lg:columns-2');
    expect(sectionsLayout.className).not.toContain('lg:grid-cols-2');
  });

  it('renders a Potential Challenges section and removes overlap with other result sections', async () => {
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
          keyOfferingsProductsServices: ['Repair program'],
          strategicMoatsStrengths: ['Vertical storytelling flywheel'],
          potentialThreatsWeaknesses: ['Rising customer acquisition costs in paid social'],
          challenges: [
            'Rising customer acquisition costs in paid social',
            'Supply chain volatility in technical fabrics',
            'Dependence on seasonal wholesale partners',
          ],
          targetAudiences: [],
          recentCampaigns: [],
          keyMarketingChannels: ['Paid social'],
          socialMediaChannels: [],
          recentNews: [],
          sources: [],
        },
      ],
      sources: [],
    });

    render(<BrandNavigator />);
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Patagonia' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });
    fireEvent.click(await screen.findByRole('button', { name: /generate analysis/i }));

    const challengesSection = await screen.findByTestId('brand-result-section-potential-challenges');
    const challengeItems = within(challengesSection).getAllByRole('listitem');
    expect(challengesSection).toBeInTheDocument();
    expect(challengeItems).toHaveLength(2);
    expect(within(challengesSection).getByText('Supply chain volatility in technical fabrics')).toBeInTheDocument();
    expect(within(challengesSection).queryByText('Rising customer acquisition costs in paid social')).not.toBeInTheDocument();
    expect(challengeItems[1]).toHaveTextContent('Business/macro challenge');
  });

  it('prioritizes brand/marketing/customer challenges and places a business-macro challenge at the bottom', async () => {
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
          keyOfferingsProductsServices: ['Repair services'],
          strategicMoatsStrengths: ['Loyal customer base'],
          potentialThreatsWeaknesses: ['Threat list item'],
          challenges: [
            'Margin pressure from inflation and higher borrowing costs',
            'Creative differentiation is weakening across paid social formats',
            'Retention performance is soft among younger audience cohorts',
          ],
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
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Patagonia' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });
    fireEvent.click(await screen.findByRole('button', { name: /generate analysis/i }));

    const challengesSection = await screen.findByTestId('brand-result-section-potential-challenges');
    const challengeItems = within(challengesSection).getAllByRole('listitem');
    expect(challengeItems).toHaveLength(3);
    expect(challengeItems[0]).toHaveTextContent('Creative differentiation is weakening across paid social formats');
    expect(challengeItems[1]).toHaveTextContent('Retention performance is soft among younger audience cohorts');
    expect(challengeItems[2]).toHaveTextContent('Margin pressure from inflation and higher borrowing costs');
  });

  it('adds an inferred business-macro challenge at the bottom when no macro item is provided', async () => {
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
          keyOfferingsProductsServices: ['Repair services'],
          strategicMoatsStrengths: ['Loyal customer base'],
          potentialThreatsWeaknesses: ['Threat list item'],
          challenges: [
            'Creative differentiation is weakening across paid social formats',
            'Retention performance is soft among younger audience cohorts',
          ],
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
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Patagonia' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });
    fireEvent.click(await screen.findByRole('button', { name: /generate analysis/i }));

    const challengesSection = await screen.findByTestId('brand-result-section-potential-challenges');
    const challengeItems = within(challengesSection).getAllByRole('listitem');
    expect(challengeItems).toHaveLength(3);
    expect(challengeItems[0]).toHaveTextContent('Creative differentiation is weakening across paid social formats');
    expect(challengeItems[1]).toHaveTextContent('Retention performance is soft among younger audience cohorts');
    expect(challengeItems[2]).toHaveTextContent('Business/macro challenge');
  });

  it('shows Analyze Visual Identity, prefills brands, and opens Design Excavator in a new top-level tab', async () => {
    generateBrandResearchMatrix.mockResolvedValue({
      analysisObjective: 'test objective',
      ecosystemMethod: 'test method',
      results: [
        {
          brandName: 'Delta',
          highLevelSummary: 'Summary A',
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
        {
          brandName: 'United Airlines',
          highLevelSummary: 'Summary B',
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
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Delta, United Airlines' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });
    fireEvent.click(await screen.findByRole('button', { name: /generate analysis/i }));

    const buttons = await screen.findAllByRole('button', { name: /analyze visual identity/i });
    fireEvent.click(buttons[0]);

    expect(saveDesignExcavatorPrefill).toHaveBeenCalledWith(
      expect.objectContaining({
        brands: [
          { name: 'Delta', website: '' },
          { name: 'United Airlines', website: '' },
        ],
      })
    );
    expect(saveDesignExcavatorPrefill.mock.calls[0]?.[0]).not.toHaveProperty('analysisObjective');
    expect(openWindowInNewTab).toHaveBeenCalledWith(
      `${window.location.origin}/#design-excavator`,
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('keeps the current Brand Navigator tab unchanged when popup is blocked', async () => {
    openWindowInNewTab.mockReturnValueOnce(null);

    generateBrandResearchMatrix.mockResolvedValue({
      analysisObjective: 'test objective',
      ecosystemMethod: 'test method',
      results: [
        {
          brandName: 'Delta',
          highLevelSummary: 'Summary A',
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
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Delta' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });
    fireEvent.click(await screen.findByRole('button', { name: /generate analysis/i }));

    const buttons = await screen.findAllByRole('button', { name: /analyze visual identity/i });
    fireEvent.click(buttons[0]);

    expect(saveDesignExcavatorPrefill).toHaveBeenCalledWith(
      expect.objectContaining({
        brands: [{ name: 'Delta', website: '' }],
      }),
    );
    expect(window.location.hash).toBe('');
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
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Patagonia' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });
    fireEvent.click(await screen.findByRole('button', { name: /generate analysis/i }));

    expect(await screen.findByText('Trusted sustainability guide')).toBeInTheDocument();
    expect(screen.queryByText(/\[INFERRED\]\s*Trusted sustainability guide/i)).not.toBeInTheDocument();

    const inferredBadges = screen.getAllByText('INFERRED');
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
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Emirates' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });
    fireEvent.click(await screen.findByRole('button', { name: /generate analysis/i }));

    expect(await screen.findByText(/premium long-haul carrier/i)).toBeInTheDocument();
    expect(screen.queryByText(/\[INFERRED\]/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\[INFERRED;/i)).not.toBeInTheDocument();

    const inferredBadges = screen.getAllByText('INFERRED');
    expect(inferredBadges.length).toBeGreaterThanOrEqual(2);
  });

  it('renders inferred chips as hyperlinks to evidence sources when available', async () => {
    generateBrandResearchMatrix.mockResolvedValue({
      analysisObjective: 'test objective',
      ecosystemMethod: 'test method',
      results: [
        {
          brandName: 'Emirates',
          highLevelSummary: 'Premium network carrier with strong global visibility. [INFERRED] Conversion efficiency focus is increasing.',
          brandMission: 'Mission statement is directionally consistent across channels. [INFERRED]',
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
          sources: [
            {
              title: 'Emirates investor relations',
              url: 'https://www.emirates.com/media-centre/',
            },
          ],
        },
      ],
      sources: [],
    });

    render(<BrandNavigator />);
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Emirates' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });
    fireEvent.click(await screen.findByRole('button', { name: /generate analysis/i }));

    const inferredLinks = await screen.findAllByRole('link', { name: /inferred evidence/i });
    expect(inferredLinks.length).toBeGreaterThanOrEqual(2);
    inferredLinks.forEach((link) => {
      const href = link.getAttribute('href') || '';
      expect(href.startsWith('https://www.emirates.com/media-centre/')).toBe(true);
      expect(href).toContain('#:~:text=');
    });
  });

  it('renders recent news headlines as external article links, ordered most recent first, with dates', async () => {
    const newerPublishedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const olderPublishedAt = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();

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
              publishedAt: olderPublishedAt,
            },
            {
              headline: 'Patagonia launches repair initiative',
              url: 'https://www.reuters.com/world/us/patagonia-launches-repair-initiative/',
              publishedAt: newerPublishedAt,
            },
          ],
          sources: [],
        },
      ],
      sources: [],
    });

    render(<BrandNavigator />);
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Patagonia' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });

    fireEvent.click(await screen.findByRole('button', { name: /generate analysis/i }));

    const recentNewsLinks = await waitFor(() => {
      const links = screen.getAllByRole('link').filter((link) => {
        const href = link.getAttribute('href');
        return href === 'https://www.reuters.com/world/us/patagonia-launches-repair-initiative/'
          || href === 'https://www.reuters.com/world/us/older-sustainability-update/';
      });
      expect(links).toHaveLength(2);
      return links;
    });

    expect(recentNewsLinks[0]).toHaveAttribute('href', 'https://www.reuters.com/world/us/patagonia-launches-repair-initiative/');
    expect(recentNewsLinks[0]).toHaveTextContent(/Patagonia launches repair initiative/i);
    expect(recentNewsLinks[0]).toHaveTextContent(`(${new Date(newerPublishedAt).toLocaleDateString()})`);

    expect(recentNewsLinks[1]).toHaveAttribute('href', 'https://www.reuters.com/world/us/older-sustainability-update/');
    expect(recentNewsLinks[1]).toHaveTextContent(/Older sustainability update/i);
    expect(recentNewsLinks[1]).toHaveTextContent(`(${new Date(olderPublishedAt).toLocaleDateString()})`);
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
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Patagonia' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });
    fireEvent.click(await screen.findByRole('button', { name: /generate analysis/i }));

    expect(await screen.findByText('Strength four')).toBeInTheDocument();
    expect(screen.queryByText('Strength five')).not.toBeInTheDocument();

    const showAllBtn = screen.getByRole('button', { name: /show all 6 items/i });
    expect(showAllBtn.className).toContain('text-sm');
    expect(showAllBtn.className).toContain('text-indigo-600');
    const showAllChevron = showAllBtn.querySelector('svg');
    expect(showAllChevron?.className.baseVal ?? '').toContain('w-4 h-4');
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
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

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
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

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
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

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
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

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
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Patagonia' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });

    fireEvent.click(await screen.findByRole('button', { name: /generate analysis/i }));

    const recentNewsSection = await screen.findByTestId('brand-result-section-recent-news');
    expect(
      within(recentNewsSection).getByText('No recent coverage found from news outlets or brand press pages.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /corporate source only/i })).not.toBeInTheDocument();
  });

  it('filters invalid sources so Sources & Research only renders external URLs', async () => {
    generateBrandResearchMatrix.mockResolvedValue({
      analysisObjective: 'test objective',
      ecosystemMethod: 'test method',
      results: [
        {
          brandName: 'Cadre AI',
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
          sources: [
            { title: 'Invalid source text', url: 'Cadre AI official website / product pages' },
          ],
        },
      ],
      sources: [
        { title: 'Another invalid source text', url: 'News validation should be performed via live search' },
        { title: 'Global valid source', url: 'https://www.linkedin.com/company/cadre-ai/' },
      ],
    });

    render(<BrandNavigator />);
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Cadre AI' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });
    fireEvent.click(await screen.findByRole('button', { name: /generate analysis/i }));

    await screen.findByText(/sources & research/i);
    expect(screen.queryByRole('link', { name: /invalid source text/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /another invalid source text/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /global valid source/i })).toHaveAttribute(
      'href',
      'https://www.linkedin.com/company/cadre-ai/'
    );
  });

  it('renders a brand logo to the left of brand copy in result cards using website-derived logo candidates', async () => {
    generateBrandResearchMatrix.mockResolvedValue({
      analysisObjective: 'test objective',
      ecosystemMethod: 'test method',
      results: [
        {
          brandName: 'Cadre AI',
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
          sources: [{ title: 'Cadre site', url: 'https://www.cadre.ai/' }],
        },
      ],
      sources: [],
    });

    render(<BrandNavigator />);
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Cadre AI' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });
    fireEvent.click(await screen.findByRole('button', { name: /generate analysis/i }));

    await screen.findByTestId('brand-result-identity-0');

    const identityGroup = screen.getByTestId('brand-result-identity-0');
    const logo = within(identityGroup).getByTestId('brand-result-logo-0') as HTMLImageElement;
    expect(logo).toBeInTheDocument();
    expect(logo.alt).toContain('Cadre AI');
    expect(logo.src.length).toBeGreaterThan(0);
    expect(within(identityGroup).queryByTestId('brand-result-logo-placeholder-0')).not.toBeInTheDocument();
  });

  it('falls back to initials placeholder when logo candidates are exhausted', async () => {
    generateBrandResearchMatrix.mockResolvedValue({
      analysisObjective: 'test objective',
      ecosystemMethod: 'test method',
      results: [
        {
          brandName: 'Cadre AI',
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
          sources: [{ title: 'Cadre site', url: 'https://www.cadre.ai/' }],
        },
      ],
      sources: [],
    });

    render(<BrandNavigator />);
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Cadre AI' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });
    fireEvent.click(await screen.findByRole('button', { name: /generate analysis/i }));

    const identityGroup = await screen.findByTestId('brand-result-identity-0');
    const logo = within(identityGroup).getByTestId('brand-result-logo-0') as HTMLImageElement;

    logo.dataset.fallbackChain = '';
    fireEvent.error(logo);

    expect(await within(identityGroup).findByTestId('brand-result-logo-placeholder-0')).toHaveTextContent('C');
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
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

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
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

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

  it('saves Brand Navigator results to the Brand_Navigator table with a custom_name', async () => {
    render(<BrandNavigator />);
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Patagonia' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });

    fireEvent.click(await screen.findByRole('button', { name: /generate analysis/i }));

    await waitFor(() => {
      expect(generateBrandResearchMatrix).toHaveBeenCalled();
      expect(supabaseFrom).toHaveBeenCalledWith('Brand_Navigator');
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
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

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
      fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

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
    fireEvent.click(screen.getByTestId('menu-page-card-brand-navigator'));

    const brandsInput = await screen.findByTestId('brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Patagonia' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });

    fireEvent.click(await screen.findByRole('button', { name: /generate analysis/i }));

    const missionSection = await screen.findByTestId('brand-result-section-brand-mission');
    expect(missionSection.className).toContain('cursor-default');
    expect(missionSection.className).not.toContain('cursor-pointer');
    fireEvent.click(missionSection);

    expect(screen.queryByRole('button', { name: /compare across brands/i })).not.toBeInTheDocument();
  });
});
