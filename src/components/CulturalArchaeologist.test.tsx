import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CulturalArchaeologist from './CulturalArchaeologist';
import {
  APP_AUDIENCE_HISTORY_MODES,
  getAudienceHistory,
  saveAudienceHistoryEntry,
} from '../services/audience-history';

const {
  generateCulturalMatrix,
  suggestBrands,
  askMatrixQuestion,
  generateDeepDive,
  generateDeepDivesBatch,
  generateAudienceSegmentation,
  exportBrandAtlasDocumentToPdf,
  exportBrandAtlasDocumentToPptx,
  supabaseFrom,
  supabaseInsert,
  supabaseUpdate,
  supabaseMaybeSingle,
  supabaseEq,
  supabaseLimit,
} = vi.hoisted(() => ({
  generateCulturalMatrix: vi.fn(),
  suggestBrands: vi.fn(),
  askMatrixQuestion: vi.fn(),
  generateDeepDive: vi.fn(),
  generateDeepDivesBatch: vi.fn(),
  generateAudienceSegmentation: vi.fn(),
  exportBrandAtlasDocumentToPdf: vi.fn(),
  exportBrandAtlasDocumentToPptx: vi.fn(),
  supabaseFrom: vi.fn(),
  supabaseInsert: vi.fn(),
  supabaseUpdate: vi.fn(),
  supabaseMaybeSingle: vi.fn(async () => ({ data: { id: 'saved-row-id' }, error: null })),
  supabaseEq: vi.fn(async () => ({ data: null, error: null })),
  supabaseLimit: vi.fn(async () => ({ data: [], error: null })),
}));

vi.mock('../services/azure-openai', () => ({
  generateCulturalMatrix,
  suggestBrands,
  askMatrixQuestion,
  generateDeepDive,
  generateDeepDivesBatch,
  generateAudienceSegmentation,
}));

vi.mock('../services/brand-atlas-themed-export', () => ({
  exportBrandAtlasDocumentToPdf,
  exportBrandAtlasDocumentToPptx,
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
      builder.insert = supabaseInsert.mockImplementation(() => builder);
      builder.update = supabaseUpdate.mockImplementation(() => builder);
      builder.maybeSingle = supabaseMaybeSingle;
      builder.delete = vi.fn(() => builder);
      builder.eq = supabaseEq;
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
vi.mock('./RecentResultsLibrary', () => ({ RecentResultsLibrary: () => null }));

const mockMatrix = {
  demographics: {
    age: null,
    race: null,
    gender: null,
  },
  sociological_analysis: 'Two paragraph analysis.\n\nSecond paragraph.',
  moments: [
    {
      text: '[KNOWN] First signal',
      isHighlyUnique: false,
      sourceType: 'Mainstream',
      confidenceLevel: 'high' as const,
      trendLifecycle: 'peaking' as const,
    },
  ],
  beliefs: [],
  tone: [],
  language: [],
  behaviors: [],
  contradictions: [],
  community: [],
  influencers: [],
  sources: [{ title: 'Reuters', url: 'https://www.reuters.com/example' }],
};

const incompleteMatrix = {
  demographics: {
    age: null,
    race: null,
    gender: null,
  },
  sociological_analysis: '',
  moments: [],
  beliefs: [],
  tone: [],
  language: [],
  behaviors: [],
  contradictions: [],
  community: [],
  influencers: [],
  sources: [],
};

const SEGMENTATION_WORKSPACE_STORAGE_PREFIX = 'cultural_segmentation_workspace:';
const SEGMENTATION_WORKSPACE_MEMORY_KEY = '__culturalSegmentationWorkspaceSnapshots';

const createSegmentationWorkspaceSnapshot = (overrides: Record<string, unknown> = {}) => ({
  matrix: mockMatrix,
  matrixMeta: {
    audience: 'Gen Z sneaker culture',
    brand: '',
    generations: [],
    topicFocus: '',
    sourcesType: [],
    hasUploadedDocuments: false,
  },
  selectedConfidenceFilters: [],
  selectedEvidenceFilters: [],
  selectedTrendStageFilters: [],
  selectedSourceFilters: [],
  showHighlyUniqueOnly: false,
  createdAt: '2026-05-29T00:00:00.000Z',
  ...overrides,
});

const createSegmentationReport = (segmentNames: string[]) => ({
  regressionSummary: 'Regression signals show distinct motivation clusters.',
  confidenceNotes: 'Directional segmentation based on cultural signal strength.',
  segments: segmentNames.map((name, index) => ({
    name,
    archetype: `${name} archetype`,
    profile: `${name} profile`,
    demographicsSnippet: `${name} demographics`,
    prevalencePct: Math.max(1, 100 - index * 5),
    keySignals: [`${name} signal 1`, `${name} signal 2`],
    messagingApproach: `${name} messaging`,
  })),
});

describe('CulturalArchaeologist', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/#cultural-archaeologist');
    window.localStorage.clear();
    vi.clearAllMocks();
    suggestBrands.mockResolvedValue(['Nike', 'Adidas']);
    generateCulturalMatrix.mockResolvedValue(mockMatrix);
    askMatrixQuestion.mockResolvedValue({ answer: 'ok', relevantInsights: [] });
    generateDeepDive.mockResolvedValue({});
    generateDeepDivesBatch.mockResolvedValue([]);
    generateAudienceSegmentation.mockResolvedValue({
      regressionSummary: 'Regression signals show distinct motivation clusters.',
      confidenceNotes: 'Directional segmentation based on cultural signal strength.',
      segments: [
        {
          name: 'Status Signal Chasers',
          archetype: 'Aspirational trend adopters',
          profile: 'Visibility-forward shoppers who seek social proof and novelty.',
          demographicsSnippet: 'Skews 18-29 with multicultural urban concentration and slight women over-index.',
          prevalencePct: 28,
          keySignals: ['Tracks drop culture', 'Shares purchases socially'],
          messagingApproach: 'Lead with scarcity and social currency.',
        },
        {
          name: 'Performance Pragmatists',
          archetype: 'Utility-maximizing planners',
          profile: 'Value measurable comfort, durability, and price-performance.',
          demographicsSnippet: 'Broad 25-44 mix with balanced gender split and suburban household representation.',
          prevalencePct: 24,
          keySignals: ['Compares specs and reviews', 'Waits for strategic buys'],
          messagingApproach: 'Anchor on proof, longevity, and value.',
        },
        {
          name: 'Identity Curators',
          archetype: 'Self-expression seekers',
          profile: 'Use brand choices to communicate niche identity and belonging.',
          demographicsSnippet: 'Younger 18-34 audience with strong creator-economy and women/non-binary participation.',
          prevalencePct: 20,
          keySignals: ['Follows micro-communities', 'Picks symbolic brand codes'],
          messagingApproach: 'Highlight identity language and community affinity.',
        },
        {
          name: 'Ethical Evaluators',
          archetype: 'Values-led decision makers',
          profile: 'Prioritize sustainability and brand transparency.',
          demographicsSnippet: 'Ages 24-40 with educated metro clusters and mixed-gender values-led households.',
          prevalencePct: 16,
          keySignals: ['Researches sourcing practices', 'Penalizes performative claims'],
          messagingApproach: 'Show traceable commitments and accountability.',
        },
      ],
    });
    exportBrandAtlasDocumentToPdf.mockResolvedValue(undefined);
    exportBrandAtlasDocumentToPptx.mockResolvedValue(undefined);
  });

  it('gates admin route behind password popout and unlocks admin console with correct password', async () => {
    window.history.pushState({}, '', '/?home=1#admin');
    render(<CulturalArchaeologist />);

    expect(await screen.findByTestId('admin-password-popout')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('admin-password-popout-input'), {
      target: { value: 'wrong-password' },
    });
    fireEvent.click(screen.getByTestId('admin-password-popout-submit-button'));
    expect(await screen.findByTestId('admin-password-popout-error')).toHaveTextContent('Incorrect password');

    fireEvent.change(screen.getByTestId('admin-password-popout-input'), {
      target: { value: 'brandatlas2026' },
    });
    fireEvent.click(screen.getByTestId('admin-password-popout-submit-button'));

    expect(await screen.findByTestId('admin-console')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByTestId('admin-password-popout')).not.toBeInTheDocument();
    });
  });

  it('shows rerun button only when at least one result filter is selected', async () => {
    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    expect(await screen.findByText(/Results? Filters/i, {}, { timeout: 3000 })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /generate insights/i })).not.toBeDisabled();
    });
    expect(screen.queryByTestId('rerun-analysis-button')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^high$/i }));

    expect(await screen.findByTestId('rerun-analysis-button')).toBeInTheDocument();
    expect(supabaseFrom).toHaveBeenCalledWith('Cultural_Archaeologist');
  });

  it('shows results filter explainer copy in the heading tooltip and hides the how filtering link', async () => {
    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    expect(await screen.findByText(/Results? Filters/i, {}, { timeout: 3000 })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('results-filters-heading-tooltip-trigger'));
    const resultsFiltersHeadingTooltip = screen.getByTestId('results-filters-heading-tooltip');
    expect(resultsFiltersHeadingTooltip).toHaveTextContent(
      'Results Filters add more context to your observation results and help discern how mainstream or niche a trend might be.'
    );
    expect(resultsFiltersHeadingTooltip.className).toContain('bg-black');
    expect(screen.queryByTestId('results-filters-how-filtering-works-link')).not.toBeInTheDocument();
  });

  it('opens segmentation in a new browser tab and persists workspace context', async () => {
    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const segmentationButton = await screen.findByTestId('audience-segmentation-button');
    fireEvent.click(segmentationButton);

    expect(await screen.findByTestId('segmentation-password-popout')).toBeInTheDocument();
    expect(openSpy).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('segmentation-password-popout-input'), {
      target: { value: 'wrong-password' },
    });
    fireEvent.click(screen.getByTestId('segmentation-password-popout-submit-button'));

    expect(await screen.findByText('Incorrect password. Please try again.')).toBeInTheDocument();
    expect(openSpy).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('segmentation-password-popout-input'), {
      target: { value: 'segment2026' },
    });
    fireEvent.click(screen.getByTestId('segmentation-password-popout-submit-button'));

    expect(openSpy).toHaveBeenCalledTimes(1);
    const [rawUrl, rawTarget] = openSpy.mock.calls[0];
    expect(rawTarget).toBe('_blank');
    const openedUrl = new URL(String(rawUrl), window.location.origin);
    expect(openedUrl.hash).toBe('#cultural-archaeologist');
    const workspaceId = openedUrl.searchParams.get('segmentation_workspace');
    expect(workspaceId).toBeTruthy();
    const persistedWorkspaceRaw = window.localStorage.getItem(
      `${SEGMENTATION_WORKSPACE_STORAGE_PREFIX}${workspaceId}`
    );
    expect(persistedWorkspaceRaw).toBeTruthy();
    const persistedWorkspace = JSON.parse(persistedWorkspaceRaw || '{}');
    expect(persistedWorkspace.matrixMeta?.audience).toBe('Gen Z sneaker culture');
    expect(persistedWorkspace.isSegmentationAuthorized).toBe(true);
    expect(persistedWorkspace.selectedConfidenceFilters).toEqual([]);
    expect(screen.queryByTestId('segmentation-tab-panel')).not.toBeInTheDocument();
    expect(generateAudienceSegmentation).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByTestId('segmentation-password-popout')).not.toBeInTheDocument();
    });
    openSpy.mockRestore();
  });

  it('opens segmentation in a new browser tab when localStorage quota is exceeded by using in-memory fallback', async () => {
    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    const originalSetItem = window.localStorage.setItem;
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key: string, value: string) {
      if (String(key).startsWith(SEGMENTATION_WORKSPACE_STORAGE_PREFIX)) {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    });

    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => ({ closed: false } as Window));
    const segmentationButton = await screen.findByTestId('audience-segmentation-button');
    fireEvent.click(segmentationButton);

    fireEvent.change(await screen.findByTestId('segmentation-password-popout-input'), {
      target: { value: 'segment2026' },
    });
    fireEvent.click(screen.getByTestId('segmentation-password-popout-submit-button'));

    expect(openSpy).toHaveBeenCalledTimes(1);
    const [rawUrl] = openSpy.mock.calls[0];
    const openedUrl = new URL(String(rawUrl), window.location.origin);
    const workspaceId = openedUrl.searchParams.get('segmentation_workspace');
    expect(workspaceId).toBeTruthy();
    expect(window.localStorage.getItem(`${SEGMENTATION_WORKSPACE_STORAGE_PREFIX}${workspaceId}`)).toBeNull();
    const memoryStore = (window as unknown as Record<string, unknown>)[SEGMENTATION_WORKSPACE_MEMORY_KEY] as Record<string, unknown> | undefined;
    expect(memoryStore?.[workspaceId as string]).toBeTruthy();
    expect(screen.queryByText('Could not open segmentation workspace in a new tab. Please try again.')).not.toBeInTheDocument();

    delete (window as unknown as Record<string, unknown>)[SEGMENTATION_WORKSPACE_MEMORY_KEY];
    setItemSpy.mockRestore();
    openSpy.mockRestore();
  });

  it('hydrates segmentation workspace from opener memory fallback when localStorage snapshot is unavailable', async () => {
    const workspaceId = 'workspace-opener-memory-fallback';
    const openerWindowStore: Record<string, unknown> = {
      [workspaceId]: createSegmentationWorkspaceSnapshot({ isSegmentationAuthorized: true }),
    };
    const openerWindowMock = {
      closed: false,
      [SEGMENTATION_WORKSPACE_MEMORY_KEY]: openerWindowStore,
    } as unknown as Window;

    const originalOpenerDescriptor = Object.getOwnPropertyDescriptor(window, 'opener');
    Object.defineProperty(window, 'opener', {
      configurable: true,
      value: openerWindowMock,
    });

    try {
      window.history.pushState({}, '', `/?segmentation_workspace=${workspaceId}#cultural-archaeologist`);

      render(<CulturalArchaeologist />);
      expect(await screen.findByTestId('segmentation-tab-panel')).toBeInTheDocument();
      expect(screen.queryByTestId('segmentation-password-panel')).not.toBeInTheDocument();
      expect(await screen.findByTestId('segmentation-result-state')).toBeInTheDocument();

      const currentWindowStore = (window as unknown as Record<string, unknown>)[SEGMENTATION_WORKSPACE_MEMORY_KEY] as Record<string, unknown> | undefined;
      expect(currentWindowStore?.[workspaceId]).toBeUndefined();
      expect(openerWindowStore[workspaceId]).toBeUndefined();
      expect(window.localStorage.getItem(`${SEGMENTATION_WORKSPACE_STORAGE_PREFIX}${workspaceId}`)).toBeNull();
    } finally {
      delete (window as unknown as Record<string, unknown>)[SEGMENTATION_WORKSPACE_MEMORY_KEY];
      if (originalOpenerDescriptor) {
        Object.defineProperty(window, 'opener', originalOpenerDescriptor);
      } else {
        Object.defineProperty(window, 'opener', { configurable: true, value: null });
      }
    }
  });

  it('renders KNOWN/INFERRED/SPECULATIVE markers as evidence chips in workspace segmentation tab', async () => {
    generateAudienceSegmentation.mockResolvedValueOnce({
      regressionSummary: '[KNOWN] Regression signals show distinct motivation clusters.',
      confidenceNotes: '[SPECULATIVE] Directional segmentation based on cultural signal strength.',
      segments: [
        {
          name: 'Status Signal Chasers',
          archetype: '[INFERRED] Aspirational trend adopters',
          profile: '[KNOWN] Visibility-forward shoppers who seek social proof and novelty.',
          demographicsSnippet: '[KNOWN] 18-29, women-leaning, multicultural urban cores.',
          prevalencePct: 28,
          keySignals: ['[KNOWN] Tracks drop culture', '[INFERRED] Shares purchases socially'],
          messagingApproach: '[SPECULATIVE] Lead with scarcity and social currency.',
        },
        {
          name: 'Performance Pragmatists',
          archetype: 'Utility-maximizing planners',
          profile: 'Value measurable comfort, durability, and price-performance.',
          demographicsSnippet: '25-44 balanced gender mix in suburban and hybrid-worker households.',
          prevalencePct: 24,
          keySignals: ['Compares specs and reviews', 'Waits for strategic buys'],
          messagingApproach: 'Anchor on proof, longevity, and value.',
        },
        {
          name: 'Identity Curators',
          archetype: 'Self-expression seekers',
          profile: 'Use brand choices to communicate niche identity and belonging.',
          demographicsSnippet: '18-34, creator-led communities, women/non-binary over-index.',
          prevalencePct: 20,
          keySignals: ['Follows micro-communities', 'Picks symbolic brand codes'],
          messagingApproach: 'Highlight identity language and community affinity.',
        },
        {
          name: 'Ethical Evaluators',
          archetype: 'Values-led decision makers',
          profile: 'Prioritize sustainability and brand transparency.',
          demographicsSnippet: '24-40, college-educated metros, mixed-gender values-led purchasers.',
          prevalencePct: 16,
          keySignals: ['Researches sourcing practices', 'Penalizes performative claims'],
          messagingApproach: 'Show traceable commitments and accountability.',
        },
      ],
    });

    const workspaceId = 'workspace-evidence-chips';
    window.localStorage.setItem(
      `${SEGMENTATION_WORKSPACE_STORAGE_PREFIX}${workspaceId}`,
      JSON.stringify(createSegmentationWorkspaceSnapshot({ isSegmentationAuthorized: true }))
    );
    window.history.pushState({}, '', `/?segmentation_workspace=${workspaceId}#cultural-archaeologist`);

    render(<CulturalArchaeologist />);
    expect(await screen.findByTestId('segmentation-tab-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('segmentation-password-panel')).not.toBeInTheDocument();
    expect(await screen.findByText('Regression signals show distinct motivation clusters.')).toBeInTheDocument();
    expect((await screen.findAllByText('Demographics')).length).toBeGreaterThan(0);
    expect(await screen.findByText('18-29, women-leaning, multicultural urban cores.')).toBeInTheDocument();
    expect((await screen.findAllByTestId('segmentation-evidence-chip-known')).length).toBeGreaterThan(0);
    expect((await screen.findAllByTestId('segmentation-evidence-chip-inferred')).length).toBeGreaterThan(0);
    expect((await screen.findAllByTestId('segmentation-evidence-chip-speculative')).length).toBeGreaterThan(0);
  });

  it('reruns segmentation with current selected filters in workspace segmentation tab', async () => {
    const workspaceId = 'workspace-filter-rerun';
    window.localStorage.setItem(
      `${SEGMENTATION_WORKSPACE_STORAGE_PREFIX}${workspaceId}`,
      JSON.stringify(
        createSegmentationWorkspaceSnapshot({
          isSegmentationAuthorized: true,
          matrix: {
            ...mockMatrix,
            moments: [
              {
                text: '[KNOWN] High confidence signal',
                isHighlyUnique: false,
                sourceType: 'Mainstream',
                confidenceLevel: 'high' as const,
                trendLifecycle: 'peaking' as const,
              },
              {
                text: '[KNOWN] Low confidence signal',
                isHighlyUnique: false,
                sourceType: 'Mainstream',
                confidenceLevel: 'low' as const,
                trendLifecycle: 'emerging' as const,
              },
            ],
          },
        })
      )
    );
    window.history.pushState({}, '', `/?segmentation_workspace=${workspaceId}#cultural-archaeologist`);

    render(<CulturalArchaeologist />);
    expect(await screen.findByTestId('segmentation-tab-panel')).toBeInTheDocument();
    await screen.findByTestId('segmentation-result-state');

    fireEvent.click(screen.getByRole('button', { name: /^high$/i }));
    fireEvent.click(await screen.findByTestId('rerun-segmentation-button'));

    await waitFor(() => {
      expect(generateAudienceSegmentation).toHaveBeenCalledTimes(2);
    });
    const latestMatrixArg = generateAudienceSegmentation.mock.calls[1]?.[0];
    expect(latestMatrixArg?.moments).toHaveLength(1);
    expect(latestMatrixArg?.moments?.[0]?.text).toContain('High confidence signal');
  });

  it('lets users set a target segment count and caps it at 6 before rerunning segmentation', async () => {
    const workspaceId = 'workspace-segmentation-count-control';
    window.localStorage.setItem(
      `${SEGMENTATION_WORKSPACE_STORAGE_PREFIX}${workspaceId}`,
      JSON.stringify(createSegmentationWorkspaceSnapshot({ isSegmentationAuthorized: true }))
    );
    window.history.pushState({}, '', `/?segmentation_workspace=${workspaceId}#cultural-archaeologist`);

    render(<CulturalArchaeologist />);
    expect(await screen.findByTestId('segmentation-tab-panel')).toBeInTheDocument();
    await screen.findByTestId('segmentation-result-state');

    const segmentCountInput = await screen.findByTestId('segmentation-segment-count-input');
    fireEvent.change(segmentCountInput, { target: { value: '7' } });
    expect(segmentCountInput).toHaveValue(6);

    fireEvent.click(await screen.findByTestId('segmentation-apply-customization-button'));

    await waitFor(() => {
      expect(generateAudienceSegmentation).toHaveBeenCalledTimes(2);
    });
    const latestSegmentationContextArg = generateAudienceSegmentation.mock.calls[1]?.[1];
    expect(latestSegmentationContextArg?.targetSegmentCount).toBe(6);
  });

  it('applies custom per-segment information and updates segmentation with those instructions', async () => {
    const workspaceId = 'workspace-segmentation-custom-info';
    generateAudienceSegmentation.mockReset();
    generateAudienceSegmentation
      .mockResolvedValueOnce(
        createSegmentationReport([
          'Status Signal Chasers',
          'Performance Pragmatists',
          'Identity Curators',
          'Ethical Evaluators',
        ])
      )
      .mockResolvedValueOnce(
        createSegmentationReport([
          'Status Signal Chasers - Updated',
          'Performance Pragmatists',
          'Identity Curators',
          'Ethical Evaluators',
        ])
      );

    window.localStorage.setItem(
      `${SEGMENTATION_WORKSPACE_STORAGE_PREFIX}${workspaceId}`,
      JSON.stringify(createSegmentationWorkspaceSnapshot({ isSegmentationAuthorized: true }))
    );
    window.history.pushState({}, '', `/?segmentation_workspace=${workspaceId}#cultural-archaeologist`);

    render(<CulturalArchaeologist />);
    expect(await screen.findByTestId('segmentation-tab-panel')).toBeInTheDocument();
    await screen.findByTestId('segmentation-result-state');

    fireEvent.change(await screen.findByTestId('segmentation-segment-custom-input-1'), {
      target: { value: 'Make this segment more value-conscious and promo-sensitive.' },
    });
    fireEvent.click(await screen.findByTestId('segmentation-apply-customization-button'));

    await waitFor(() => {
      expect(generateAudienceSegmentation).toHaveBeenCalledTimes(2);
    });
    const latestSegmentationContextArg = generateAudienceSegmentation.mock.calls[1]?.[1];
    expect(Array.isArray(latestSegmentationContextArg?.segmentCustomizations)).toBe(true);
    expect(latestSegmentationContextArg?.segmentCustomizations?.[0]).toContain('Segment 1');
    expect(latestSegmentationContextArg?.segmentCustomizations?.[0]).toContain('value-conscious and promo-sensitive');
    expect(await screen.findByText('Status Signal Chasers - Updated')).toBeInTheDocument();
  });

  it('orders segments by descending prevalence after segment updates change percentages', async () => {
    const workspaceId = 'workspace-segmentation-sort-by-prevalence';
    generateAudienceSegmentation.mockReset();
    generateAudienceSegmentation
      .mockResolvedValueOnce({
        regressionSummary: 'Initial segmentation summary.',
        confidenceNotes: 'Initial segmentation confidence notes.',
        segments: [
          {
            name: 'Segment Alpha',
            archetype: 'Alpha archetype',
            profile: 'Alpha profile',
            demographicsSnippet: 'Alpha demographics',
            prevalencePct: 35,
            keySignals: ['Alpha signal 1', 'Alpha signal 2'],
            messagingApproach: 'Alpha messaging',
          },
          {
            name: 'Segment Beta',
            archetype: 'Beta archetype',
            profile: 'Beta profile',
            demographicsSnippet: 'Beta demographics',
            prevalencePct: 30,
            keySignals: ['Beta signal 1', 'Beta signal 2'],
            messagingApproach: 'Beta messaging',
          },
          {
            name: 'Segment Gamma',
            archetype: 'Gamma archetype',
            profile: 'Gamma profile',
            demographicsSnippet: 'Gamma demographics',
            prevalencePct: 20,
            keySignals: ['Gamma signal 1', 'Gamma signal 2'],
            messagingApproach: 'Gamma messaging',
          },
          {
            name: 'Segment Delta',
            archetype: 'Delta archetype',
            profile: 'Delta profile',
            demographicsSnippet: 'Delta demographics',
            prevalencePct: 15,
            keySignals: ['Delta signal 1', 'Delta signal 2'],
            messagingApproach: 'Delta messaging',
          },
        ],
      })
      .mockResolvedValueOnce({
        regressionSummary: 'Updated segmentation summary.',
        confidenceNotes: 'Updated segmentation confidence notes.',
        segments: [
          {
            name: 'Segment Alpha',
            archetype: 'Alpha archetype',
            profile: 'Alpha profile',
            demographicsSnippet: 'Alpha demographics',
            prevalencePct: 18,
            keySignals: ['Alpha signal 1', 'Alpha signal 2'],
            messagingApproach: 'Alpha messaging',
          },
          {
            name: 'Segment Beta',
            archetype: 'Beta archetype',
            profile: 'Beta profile',
            demographicsSnippet: 'Beta demographics',
            prevalencePct: 41,
            keySignals: ['Beta signal 1', 'Beta signal 2'],
            messagingApproach: 'Beta messaging',
          },
          {
            name: 'Segment Gamma',
            archetype: 'Gamma archetype',
            profile: 'Gamma profile',
            demographicsSnippet: 'Gamma demographics',
            prevalencePct: 27,
            keySignals: ['Gamma signal 1', 'Gamma signal 2'],
            messagingApproach: 'Gamma messaging',
          },
          {
            name: 'Segment Delta',
            archetype: 'Delta archetype',
            profile: 'Delta profile',
            demographicsSnippet: 'Delta demographics',
            prevalencePct: 14,
            keySignals: ['Delta signal 1', 'Delta signal 2'],
            messagingApproach: 'Delta messaging',
          },
        ],
      });

    window.localStorage.setItem(
      `${SEGMENTATION_WORKSPACE_STORAGE_PREFIX}${workspaceId}`,
      JSON.stringify(createSegmentationWorkspaceSnapshot({ isSegmentationAuthorized: true }))
    );
    window.history.pushState({}, '', `/?segmentation_workspace=${workspaceId}#cultural-archaeologist`);

    render(<CulturalArchaeologist />);
    expect(await screen.findByTestId('segmentation-tab-panel')).toBeInTheDocument();
    await screen.findByTestId('segmentation-result-state');

    fireEvent.click(await screen.findByTestId('segmentation-apply-customization-button'));

    await waitFor(() => {
      expect(generateAudienceSegmentation).toHaveBeenCalledTimes(2);
    });

    const firstSegmentCard = await screen.findByTestId('segmentation-segment-card-1');
    const secondSegmentCard = await screen.findByTestId('segmentation-segment-card-2');
    const thirdSegmentCard = await screen.findByTestId('segmentation-segment-card-3');
    const fourthSegmentCard = await screen.findByTestId('segmentation-segment-card-4');

    expect(within(firstSegmentCard).getByText('Segment Beta')).toBeInTheDocument();
    expect(within(secondSegmentCard).getByText('Segment Gamma')).toBeInTheDocument();
    expect(within(thirdSegmentCard).getByText('Segment Alpha')).toBeInTheDocument();
    expect(within(fourthSegmentCard).getByText('Segment Delta')).toBeInTheDocument();
  });

  it('uses Ask the Archaeologist prompt to refine segmentation when segmentation tab is active', async () => {
    const workspaceId = 'workspace-ask-refine-segmentation';
    window.localStorage.setItem(
      `${SEGMENTATION_WORKSPACE_STORAGE_PREFIX}${workspaceId}`,
      JSON.stringify(createSegmentationWorkspaceSnapshot({ isSegmentationAuthorized: true }))
    );
    window.history.pushState({}, '', `/?segmentation_workspace=${workspaceId}#cultural-archaeologist`);

    render(<CulturalArchaeologist />);
    expect(await screen.findByTestId('segmentation-tab-panel')).toBeInTheDocument();
    await screen.findByTestId('segmentation-result-state');

    const askInput = await screen.findByPlaceholderText(/Ask a question about this audience/i);
    fireEvent.change(askInput, { target: { value: 'Refine segments to separate budget-driven shoppers from convenience-driven shoppers.' } });
    fireEvent.click(screen.getByRole('button', { name: /^ask$/i }));

    await waitFor(() => {
      expect(generateAudienceSegmentation).toHaveBeenCalledTimes(2);
    });
    expect(askMatrixQuestion).not.toHaveBeenCalled();

    const latestSegmentationContextArg = generateAudienceSegmentation.mock.calls[1]?.[1];
    expect(latestSegmentationContextArg?.topicFocus).toContain('Segmentation refinement request');
    expect(latestSegmentationContextArg?.topicFocus).toContain('budget-driven shoppers');
  });

  it('opens a rerun-in-segment tab with segment audience prefilled from a segmentation card', async () => {
    const workspaceId = 'workspace-segment-rerun-prefill';
    window.localStorage.setItem(
      `${SEGMENTATION_WORKSPACE_STORAGE_PREFIX}${workspaceId}`,
      JSON.stringify(
        createSegmentationWorkspaceSnapshot({
          isSegmentationAuthorized: true,
          matrixMeta: {
            audience: 'Gen Z sneaker culture',
            brand: 'Nike',
            generations: [],
            topicFocus: 'Streetwear positioning',
            sourcesType: [],
            hasUploadedDocuments: false,
          },
        })
      )
    );
    window.history.pushState({}, '', `/?segmentation_workspace=${workspaceId}#cultural-archaeologist`);

    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => ({ closed: false } as Window));

    render(<CulturalArchaeologist />);
    expect(await screen.findByTestId('segmentation-tab-panel')).toBeInTheDocument();
    await screen.findByTestId('segmentation-result-state');

    fireEvent.click(await screen.findByTestId('segmentation-rerun-analysis-among-segment-button-1'));

    expect(openSpy).toHaveBeenCalledTimes(1);
    const [rawUrl, rawTarget] = openSpy.mock.calls[0];
    expect(rawTarget).toBe('_blank');
    const openedUrl = new URL(String(rawUrl), window.location.origin);
    expect(openedUrl.hash).toBe('#cultural-archaeologist');
    expect(openedUrl.searchParams.get('home')).toBe('1');
    expect(openedUrl.searchParams.get('ca_audience')).toBe('Status Signal Chasers');
    expect(openedUrl.searchParams.get('ca_brand')).toBe('Nike');
    expect(openedUrl.searchParams.get('ca_topic')).toBe('Streetwear positioning');
    openSpy.mockRestore();
  });

  it('keeps segment name in the audience field and injects full segment context into rerun prompt background', async () => {
    window.localStorage.setItem(
      'cultural_archaeologist_prefill_payload',
      JSON.stringify({
        audience: 'Status Signal Chasers',
        brand: 'Nike',
        topicFocus: 'Streetwear positioning',
        segmentContext:
          'Segment 1 (Status Signal Chasers) | Prevalence: 28% | Archetype: Aspirational trend adopters | Profile: Visibility-forward shoppers who seek social proof and novelty. | Demographics: Skews 18-29 with multicultural urban concentration and slight women over-index. | Key Signals: Tracks drop culture; Shares purchases socially | Messaging Approach: Lead with scarcity and social currency.',
      })
    );

    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    const topicInput = await screen.findByPlaceholderText('Topic Focus (Optional)');
    expect((audienceInput as HTMLInputElement).value).toBe('Status Signal Chasers');
    expect((topicInput as HTMLInputElement).value).toBe('Streetwear positioning');

    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    await waitFor(() => {
      expect(generateCulturalMatrix).toHaveBeenCalledTimes(1);
    });
    const firstGenerateCall = generateCulturalMatrix.mock.calls[0];
    expect(firstGenerateCall[0]).toBe('Status Signal Chasers');
    expect(firstGenerateCall[3]).toContain('Streetwear positioning');
    expect(firstGenerateCall[3]).toContain('Segment Context (background, do not rename audience)');
    expect(firstGenerateCall[3]).toContain('Aspirational trend adopters');
    expect(firstGenerateCall[3]).toContain('Lead with scarcity and social currency.');
  });

  it('shows an Original Segments anchor after Ask refinement and restores the original segmentation when clicked', async () => {
    const workspaceId = 'workspace-segmentation-revert-original';
    generateAudienceSegmentation
      .mockResolvedValueOnce({
        regressionSummary: 'Original segmentation summary.',
        confidenceNotes: 'Original segmentation confidence notes.',
        segments: [
          {
            name: 'Original Segment Alpha',
            archetype: 'Original archetype',
            profile: 'Original profile narrative.',
            demographicsSnippet: 'Original demographic snapshot.',
            prevalencePct: 52,
            keySignals: ['Original signal 1', 'Original signal 2'],
            messagingApproach: 'Original messaging approach.',
          },
        ],
      })
      .mockResolvedValueOnce({
        regressionSummary: 'Refined segmentation summary.',
        confidenceNotes: 'Refined segmentation confidence notes.',
        segments: [
          {
            name: 'Refined Segment Omega',
            archetype: 'Refined archetype',
            profile: 'Refined profile narrative.',
            demographicsSnippet: 'Refined demographic snapshot.',
            prevalencePct: 48,
            keySignals: ['Refined signal 1', 'Refined signal 2'],
            messagingApproach: 'Refined messaging approach.',
          },
        ],
      });

    window.localStorage.setItem(
      `${SEGMENTATION_WORKSPACE_STORAGE_PREFIX}${workspaceId}`,
      JSON.stringify(createSegmentationWorkspaceSnapshot({ isSegmentationAuthorized: true }))
    );
    window.history.pushState({}, '', `/?segmentation_workspace=${workspaceId}#cultural-archaeologist`);

    render(<CulturalArchaeologist />);
    expect(await screen.findByTestId('segmentation-tab-panel')).toBeInTheDocument();
    await screen.findByTestId('segmentation-result-state');
    expect(screen.getByText('Original Segment Alpha')).toBeInTheDocument();
    expect(screen.queryByTestId('segmentation-revert-original-button')).not.toBeInTheDocument();

    const askInput = await screen.findByPlaceholderText(/Ask a question about this audience/i);
    fireEvent.change(askInput, { target: { value: 'Refine for two sharper behavioral cohorts.' } });
    fireEvent.click(screen.getByRole('button', { name: /^ask$/i }));

    await waitFor(() => {
      expect(generateAudienceSegmentation).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText('Refined Segment Omega')).toBeInTheDocument();
    const originalSegmentsButton = await screen.findByTestId('segmentation-revert-original-button');
    expect(originalSegmentsButton).toHaveTextContent(/Original Segments/i);

    fireEvent.click(originalSegmentsButton);

    await waitFor(() => {
      expect(screen.getByText('Original Segment Alpha')).toBeInTheDocument();
    });
    expect(screen.queryByText('Refined Segment Omega')).not.toBeInTheDocument();
    expect(screen.queryByTestId('segmentation-revert-original-button')).not.toBeInTheDocument();
  });

  it('auto-scrolls to the segmentation workspace when a workspace tab opens', async () => {
    const workspaceId = 'workspace-autoscroll';
    window.localStorage.setItem(
      `${SEGMENTATION_WORKSPACE_STORAGE_PREFIX}${workspaceId}`,
      JSON.stringify(createSegmentationWorkspaceSnapshot({ isSegmentationAuthorized: true }))
    );
    window.history.pushState({}, '', `/?segmentation_workspace=${workspaceId}#cultural-archaeologist`);

    const originalScrollIntoView = window.HTMLElement.prototype.scrollIntoView;
    const scrollIntoViewSpy = vi.fn();
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: scrollIntoViewSpy,
    });

    try {
      render(<CulturalArchaeologist />);
      expect(await screen.findByTestId('segmentation-tab-panel')).toBeInTheDocument();
      await waitFor(() => {
        expect(scrollIntoViewSpy).toHaveBeenCalled();
      });
    } finally {
      Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        writable: true,
        value: originalScrollIntoView,
      });
    }
  });

  it('filters results to only highly unique observations when the highly unique filter is selected', async () => {
    generateCulturalMatrix.mockResolvedValueOnce({
      ...mockMatrix,
      moments: [
        {
          text: '[KNOWN] Highly unique signal',
          isHighlyUnique: true,
          sourceType: 'Mainstream',
          confidenceLevel: 'high' as const,
          trendLifecycle: 'peaking' as const,
        },
        {
          text: '[KNOWN] General signal',
          isHighlyUnique: false,
          sourceType: 'Mainstream',
          confidenceLevel: 'high' as const,
          trendLifecycle: 'peaking' as const,
        },
      ],
    });

    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    expect(await screen.findByText('Highly unique signal')).toBeInTheDocument();
    expect(await screen.findByText('General signal')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /highly unique observation/i }));

    expect(await screen.findByText('Highly unique signal')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('General signal')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /highly unique observation/i }));

    expect(await screen.findByText('General signal')).toBeInTheDocument();
  });

  it('shows per-section refresh for incomplete results and reruns a fresh search when clicked', async () => {
    generateCulturalMatrix
      .mockResolvedValueOnce(incompleteMatrix)
      .mockResolvedValueOnce(mockMatrix);

    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    const refreshButton = await screen.findByTestId('matrix-card-refresh-moments');
    await waitFor(() => {
      expect(refreshButton).not.toBeDisabled();
    });
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(generateCulturalMatrix).toHaveBeenCalledTimes(2);
    });
  });

  it('swaps the insight deep dives icon on hover and refreshes all deep dives on click', async () => {
    generateDeepDivesBatch.mockReset();
    generateDeepDivesBatch
      .mockResolvedValueOnce([
        {
          originationDate: '2026-06-02',
          relevance: 'Initial',
          expandedContext: 'Initial deep dive context.',
          strategicImplications: ['Initial implication'],
          realWorldExamples: ['Initial example'],
          sources: [{ title: 'Initial Source', url: 'https://example.com/initial' }],
        },
      ])
      .mockResolvedValueOnce([
        {
          originationDate: '2026-06-11',
          relevance: 'Refreshed',
          expandedContext: 'Refreshed deep dive context.',
          strategicImplications: ['Refreshed implication'],
          realWorldExamples: ['Refreshed example'],
          sources: [{ title: 'Refreshed Source', url: 'https://example.com/refreshed' }],
        },
      ]);

    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    expect(await screen.findByText('Insight deep dives are complete')).toBeInTheDocument();
    expect(generateDeepDivesBatch).toHaveBeenCalledTimes(1);

    const deepDiveButton = await screen.findByTestId('insight-deep-dives-button');
    expect(screen.getByTestId('insight-deep-dives-icon-target')).toBeInTheDocument();
    expect(screen.queryByTestId('insight-deep-dives-icon-refresh')).not.toBeInTheDocument();

    fireEvent.mouseEnter(deepDiveButton);
    expect(screen.getByTestId('insight-deep-dives-icon-refresh')).toBeInTheDocument();
    expect(screen.queryByTestId('insight-deep-dives-icon-target')).not.toBeInTheDocument();

    fireEvent.click(deepDiveButton);

    await waitFor(() => {
      expect(generateDeepDivesBatch).toHaveBeenCalledTimes(2);
    });
    const refreshedItems = generateDeepDivesBatch.mock.calls[1]?.[0];
    expect(Array.isArray(refreshedItems)).toBe(true);
    expect(refreshedItems).toHaveLength(1);
    expect(refreshedItems?.[0]?.text).toContain('First signal');

    fireEvent.mouseLeave(deepDiveButton);
    expect(screen.getByTestId('insight-deep-dives-icon-target')).toBeInTheDocument();
  });

  it('persists deep dives back into Supabase results JSONB after background generation completes', async () => {
    generateDeepDivesBatch.mockResolvedValueOnce([
      {
        originationDate: '2026-06-02',
        relevance: 'High',
        expandedContext: 'Deep dive context from batch generation.',
        strategicImplications: ['Implication one'],
        realWorldExamples: ['Example one'],
        sources: [{ title: 'Example Source', url: 'https://example.com' }],
      },
    ]);

    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    await waitFor(() => {
      expect(supabaseUpdate).toHaveBeenCalled();
    });

    const latestUpdatePayload = supabaseUpdate.mock.calls.at(-1)?.[0] as { results?: any } | undefined;
    expect(latestUpdatePayload?.results?.moments?.[0]?.deepDive?.expandedContext).toBe(
      'Deep dive context from batch generation.'
    );
    expect(supabaseEq).toHaveBeenCalledWith('id', 'saved-row-id');
  });

  it('shows a completion toast when background deep-dive generation finishes', async () => {
    generateDeepDivesBatch.mockResolvedValueOnce([
      {
        originationDate: '2026-06-02',
        relevance: 'High',
        expandedContext: 'Deep dive context from batch generation.',
        strategicImplications: ['Implication one'],
        realWorldExamples: ['Example one'],
        sources: [{ title: 'Example Source', url: 'https://example.com' }],
      },
    ]);

    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    expect(await screen.findByText('Insight deep dives are complete')).toBeInTheDocument();
  });

  it('includes insight deep-dive content in both PDF and PPTX themed export payloads', async () => {
    generateDeepDivesBatch.mockResolvedValueOnce([
      {
        originationDate: '2026-06-02',
        relevance: 'High relevance for purchase intent framing.',
        expandedContext: 'Deep dive context from batch generation.',
        strategicImplications: ['Prioritize confidence-building social proof at launch.'],
        realWorldExamples: ['Competing title bundles creator clips with demo missions.'],
        sources: [{ title: 'Example Source', url: 'https://example.com' }],
      },
    ]);

    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    expect(await screen.findByText('Insight deep dives are complete')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /pdf/i }));
    await waitFor(() => {
      expect(exportBrandAtlasDocumentToPdf).toHaveBeenCalledTimes(1);
    });

    const pdfDocument = exportBrandAtlasDocumentToPdf.mock.calls[0]?.[0] as any;
    const pdfMomentsSection = pdfDocument.sections.find((section: any) => section.title === 'Moments');
    const pdfDeepDiveCard = pdfMomentsSection.cards.find((card: any) => card.title === 'Insight 1 Deep Dive');
    expect(pdfDeepDiveCard.lines).toEqual(expect.arrayContaining([
      'Expanded Context: Deep dive context from batch generation.',
      'Relevance: High relevance for purchase intent framing.',
      'Originated: 2026-06-02',
      'Strategic Implication 1: Prioritize confidence-building social proof at launch.',
      'Real-World Example 1: Competing title bundles creator clips with demo missions. | Source: Example Source - https://example.com/',
    ]));

    fireEvent.click(screen.getByRole('button', { name: /pptx/i }));
    await waitFor(() => {
      expect(exportBrandAtlasDocumentToPptx).toHaveBeenCalledTimes(1);
    });

    const pptxDocument = exportBrandAtlasDocumentToPptx.mock.calls[0]?.[0] as any;
    const pptxMomentsSection = pptxDocument.sections.find((section: any) => section.title === 'Moments');
    const pptxDeepDiveCard = pptxMomentsSection.cards.find((card: any) => card.title === 'Insight 1 Deep Dive');
    expect(pptxDeepDiveCard.lines).toEqual(expect.arrayContaining([
      'Expanded Context: Deep dive context from batch generation.',
      'Relevance: High relevance for purchase intent framing.',
      'Originated: 2026-06-02',
      'Strategic Implication 1: Prioritize confidence-building social proof at launch.',
      'Real-World Example 1: Competing title bundles creator clips with demo missions. | Source: Example Source - https://example.com/',
    ]));
  });

  it('renders mobile results navigation for all cultural result sections', async () => {
    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    const mobileResultsNav = await screen.findByTestId('mobile-results-nav-culture');
    expect(mobileResultsNav).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Audience Q&A' })).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Demographics' })).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Filters' })).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Moments' })).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Beliefs' })).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Tone' })).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Language' })).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Behaviors' })).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Contradictions' })).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Community' })).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Influencers' })).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Sources' })).toBeInTheDocument();
  });

  it('renders a Show thinking dropdown for cultural results that is closed by default', async () => {
    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    const showThinkingDetails = await screen.findByTestId('cultural-show-thinking-container');
    expect(showThinkingDetails).not.toHaveAttribute('open');

    fireEvent.click(screen.getByTestId('cultural-show-thinking-summary'));

    expect(showThinkingDetails).toHaveAttribute('open');
    expect(
      screen.getByText('Applied retrieval-grounded synthesis: collected language, behavior, and community artifacts, clustered recurring motifs and tensions, and generated a structured cultural map with source-grounded claims.')
    ).toBeInTheDocument();
  });

  it('uses a mobile hamburger for navigation links and keeps desktop top links at sm+', async () => {
    render(<CulturalArchaeologist />);

    const mobileTopBar = await screen.findByTestId('mobile-top-bar');
    expect(mobileTopBar.className).toContain('fixed');
    expect(mobileTopBar.className).toContain('top-0');
    expect(mobileTopBar.className).toContain('translate-y-0');
    expect(within(mobileTopBar).getByText('Cultural Archaeologist')).toBeInTheDocument();
    const mobileTitle = within(mobileTopBar).getByTestId('mobile-page-title');
    const mobileIcon = within(mobileTopBar).getByTestId('mobile-page-icon');
    const mobileHeading = within(mobileTopBar).getByTestId('mobile-page-heading');
    expect(mobileHeading.className).toContain('ml-auto');
    expect(mobileHeading.className).toContain('justify-end');
    expect(mobileTitle.className).toContain('text-right');
    expect(Boolean(mobileTitle.compareDocumentPosition(mobileIcon) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(screen.getByTestId('mobile-page-subcopy')).toHaveTextContent('Deep dive into any culture or audience.');

    const mobileNavTrigger = await screen.findByTestId('mobile-nav-trigger');
    const actionContainer = await screen.findByTestId('top-action-buttons');
    expect(actionContainer.className).toContain('hidden');
    expect(actionContainer.className).toContain('sm:flex-row');
    expect(actionContainer.className).toContain('left-auto');

    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 180 });
    fireEvent.scroll(window);
    expect(mobileTopBar.className).toContain('-translate-y-full');

    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 40 });
    fireEvent.scroll(window);
    expect(mobileTopBar.className).toContain('translate-y-0');

    fireEvent.click(mobileNavTrigger);

    const mobileMenu = await screen.findByTestId('mobile-nav-menu');
    expect(mobileMenu.className).toContain('fixed');
    expect(mobileMenu.className).toContain('top-16');
    expect(mobileMenu.className).toContain('left-4');
    expect(mobileMenu.className).toContain('right-4');
    expect(within(mobileMenu).getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/?home=1');
    expect(within(mobileMenu).getByRole('link', { name: /brand navigator/i })).toHaveAttribute('href', '/#brand-navigator');
    expect(within(mobileMenu).getByRole('link', { name: /design excavator/i })).toHaveAttribute('href', '/#design-excavator');

    expect(within(actionContainer).getByRole('link', { name: /brand navigator/i })).toHaveAttribute('href', '/#brand-navigator');
    expect(within(actionContainer).getByRole('link', { name: /design excavator/i })).toHaveAttribute('href', '/#design-excavator');
  });

  it('renders mobile New Search as an icon button to the right of generate insights', async () => {
    render(<CulturalArchaeologist />);
    const generateButton = await screen.findByRole('button', { name: /generate insights/i });
    const newSearchButton = screen.getByTestId('new-search-below-generate');
    expect(newSearchButton).toHaveAccessibleName(/new search/i);
    expect(newSearchButton.className).toContain('sm:hidden');
    expect(Boolean(generateButton.compareDocumentPosition(newSearchButton) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it('reruns analysis with active filter constraints while keeping current filter behavior', async () => {
    generateCulturalMatrix
      .mockResolvedValueOnce(mockMatrix)
      .mockResolvedValueOnce({
        ...mockMatrix,
        moments: [
          {
            text: '[KNOWN] New signal from rerun',
            isHighlyUnique: false,
            sourceType: 'Mainstream',
            confidenceLevel: 'high' as const,
            trendLifecycle: 'peaking' as const,
          },
        ],
      });

    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    expect(await screen.findByText(/Results? Filters/i, {}, { timeout: 3000 })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /generate insights/i })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /^high$/i }));
    fireEvent.click(screen.getByRole('button', { name: /known/i }));

    const rerunButton = await screen.findByTestId('rerun-analysis-button');
    expect(rerunButton).not.toBeDisabled();
    fireEvent.click(rerunButton);

    await waitFor(() => {
      expect(generateCulturalMatrix).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByText('First signal')).toBeInTheDocument();
    expect(await screen.findByText('New signal from rerun')).toBeInTheDocument();

    expect(generateCulturalMatrix).toHaveBeenNthCalledWith(
      2,
      'Gen Z sneaker culture',
      '',
      [],
      '',
      [],
      [],
      {
        confidenceLevels: ['high'],
        evidenceTypes: ['known'],
        trendStages: [],
        sourceTypes: [],
      }
    );
  });

  it('renders demographic cards from known and inferred values', async () => {
    generateCulturalMatrix.mockResolvedValueOnce({
      ...mockMatrix,
      demographics: {
        age: '[KNOWN] 18-34',
        race: '[INFERRED] Multi-ethnic urban cohorts',
        gender: '[INFERRED] Women and non-binary skew',
      },
    });

    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    await screen.findByText('Average Age', {}, { timeout: 3000 });
    expect(await screen.findByText('18-34', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText('Multi-ethnic urban cohorts')).toBeInTheDocument();
    expect(screen.getByText('Women and non-binary skew')).toBeInTheDocument();
  });

  it('shows demographic fallback copy when fields are null', async () => {
    generateCulturalMatrix.mockResolvedValueOnce({
      ...mockMatrix,
      demographics: {
        age: null,
        race: null,
        gender: null,
      },
    });

    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    expect(await screen.findByText('Average Age', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText('Race / Ethnicity')).toBeInTheDocument();
    expect(screen.getByText('Gender')).toBeInTheDocument();
    expect(screen.getAllByText('Data unavailable')).toHaveLength(3);
  });

  it('preserves existing demographics when rerun returns blanks', async () => {
    generateCulturalMatrix
      .mockResolvedValueOnce({
        ...mockMatrix,
        demographics: {
          age: '[KNOWN] 18-34',
          race: '[INFERRED] Multi-ethnic urban cohorts',
          gender: '[INFERRED] Women and non-binary skew',
        },
      })
      .mockResolvedValueOnce({
        ...mockMatrix,
        demographics: {
          age: '[KNOWN] 25-44',
          race: '[INFERRED] Suburban white-majority cohorts',
          gender: '[INFERRED] Men skew',
        },
        moments: [
          {
            text: '[KNOWN] New signal from rerun',
            isHighlyUnique: false,
            sourceType: 'Mainstream',
            confidenceLevel: 'high' as const,
            trendLifecycle: 'peaking' as const,
          },
        ],
      });

    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    expect(await screen.findByText(/Results? Filters/i, {}, { timeout: 3000 })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /generate insights/i })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /^high$/i }));
    fireEvent.click(screen.getByRole('button', { name: /known/i }));

    const rerunButton = await screen.findByTestId('rerun-analysis-button');
    expect(rerunButton).not.toBeDisabled();
    fireEvent.click(rerunButton);

    await waitFor(() => {
      expect(generateCulturalMatrix).toHaveBeenCalledTimes(2);
    });

    expect(screen.getByText('18-34')).toBeInTheDocument();
    expect(screen.getByText('Multi-ethnic urban cohorts')).toBeInTheDocument();
    expect(screen.getByText('Women and non-binary skew')).toBeInTheDocument();
  });

  it('uses fixed-width responsive columns for matrix cards so wider windows add columns without stretching cards', async () => {
    render(<CulturalArchaeologist />);

    const main = screen.getByRole('main');
    expect(main.className).toContain('max-w-[calc(100vw-3rem)]');
    expect(main.className).not.toContain('max-w-6xl');

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    const layout = await screen.findByTestId('matrix-cards-layout');
    expect(layout.className).toContain('grid');
    expect(layout.className).toContain('grid-cols-1');
    expect(layout.className).toContain('sm:grid-cols-[repeat(auto-fit,minmax(19rem,19rem))]');
    expect(layout.className).toContain('justify-center');
    expect(layout.className).not.toContain('minmax(19rem,1fr)');
    expect(layout.className).not.toContain('md:grid-cols-2');
    expect(layout.className).not.toContain('lg:grid-cols-3');
    expect(layout.className).not.toContain('columns-1');
  });

  it('shows previous audiences for the same IP in the audience field and allows reuse', async () => {
    saveAudienceHistoryEntry(
      APP_AUDIENCE_HISTORY_MODES.CULTURAL_ARCHAEOLOGIST,
      '127.0.0.1',
      'Gen Z sneaker culture'
    );
    saveAudienceHistoryEntry(
      APP_AUDIENCE_HISTORY_MODES.CULTURAL_ARCHAEOLOGIST,
      '127.0.0.1',
      'Millennial home buyers'
    );
    saveAudienceHistoryEntry(
      APP_AUDIENCE_HISTORY_MODES.CULTURAL_ARCHAEOLOGIST,
      '10.0.0.7',
      'Should not appear'
    );

    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *') as HTMLInputElement;
    fireEvent.focus(audienceInput);

    const audienceDropdown = await screen.findByTestId('cultural-audience-history-dropdown');
    expect(within(audienceDropdown).getByText('Gen Z sneaker culture')).toBeInTheDocument();
    expect(within(audienceDropdown).getByText('Millennial home buyers')).toBeInTheDocument();
    expect(within(audienceDropdown).queryByText('Should not appear')).not.toBeInTheDocument();

    fireEvent.click(within(audienceDropdown).getByRole('button', { name: 'Millennial home buyers' }));
    expect(audienceInput.value).toBe('Millennial home buyers');
  });

  it('saves generated audience values into IP-gated audience history', async () => {
    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Creator-led skincare buyers' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    expect(await screen.findByText(/Results? Filters/i, {}, { timeout: 3000 })).toBeInTheDocument();

    await waitFor(() => {
      expect(
        getAudienceHistory(
          APP_AUDIENCE_HISTORY_MODES.CULTURAL_ARCHAEOLOGIST,
          '127.0.0.1'
        )
      ).toContain('Creator-led skincare buyers');
    });
  });

  it('uses a wrapping brand chip input shell like Brand Navigator', () => {
    render(<CulturalArchaeologist />);

    const shell = screen.getByTestId('cultural-brands-input-shell');
    expect(shell.className).toContain('flex-wrap');
    expect(shell.className).toContain('h-14');
  });

  it('vertically centers audience, brand, and topic field text in empty state', () => {
    render(<CulturalArchaeologist />);

    const audienceField = screen.getByTestId('cultural-audience-field');
    const brandsField = screen.getByTestId('cultural-brands-field');
    const topicField = screen.getByTestId('cultural-topic-field');
    const brandsShell = screen.getByTestId('cultural-brands-input-shell');

    expect(audienceField.className).toContain('items-center');
    expect(brandsField.className).toContain('items-center');
    expect(topicField.className).toContain('items-center');
    expect(brandsShell.className).toContain('items-center');

    const audienceInput = screen.getByPlaceholderText('Primary Audience (Required) *');
    const brandInput = screen.getByTestId('cultural-brands-input');
    const topicInput = screen.getByPlaceholderText('Topic Focus (Optional)');

    expect(audienceInput.className).toContain('py-0');
    expect(audienceInput.className).not.toContain('pt-4');
    expect(topicInput.className).toContain('py-0');
    expect(topicInput.className).not.toContain('pt-4');
    expect(brandInput.className).toContain('leading-10');
  });

  it('keeps all primary field boxes at the same base height', () => {
    render(<CulturalArchaeologist />);

    const audienceField = screen.getByTestId('cultural-audience-field');
    const brandsField = screen.getByTestId('cultural-brands-field');
    const brandsShell = screen.getByTestId('cultural-brands-input-shell');
    const topicField = screen.getByTestId('cultural-topic-field');
    const generationField = screen.getByTestId('cultural-generation-field');
    const sourcesField = screen.getByTestId('cultural-sources-field');
    const uploadField = screen.getByTestId('cultural-upload-field');

    expect(audienceField.className).toContain('h-14');
    expect(audienceField.className).toContain('items-center');
    expect(brandsField.className).toContain('h-14');
    expect(brandsShell.className).toContain('h-14');
    expect(brandsShell.className).toContain('items-center');
    expect(topicField.className).toContain('h-14');
    expect(topicField.className).toContain('items-center');
    expect(generationField.className).toContain('h-14');
    expect(generationField.className).toContain('items-center');
    expect(sourcesField.className).toContain('h-14');
    expect(sourcesField.className).toContain('items-center');
    expect(uploadField.className).toContain('h-14');
    expect(uploadField.className).toContain('items-center');
  });

  it('vertically centers generation, sources, and upload control text', () => {
    render(<CulturalArchaeologist />);

    const generationField = screen.getByTestId('cultural-generation-field');
    const sourcesField = screen.getByTestId('cultural-sources-field');
    const uploadField = screen.getByTestId('cultural-upload-field');

    expect(generationField.className).toContain('items-center');
    expect(generationField.className).toContain('py-0');
    expect(generationField.className).not.toContain('pt-3');

    expect(sourcesField.className).toContain('items-center');
    expect(sourcesField.className).toContain('py-0');
    expect(sourcesField.className).not.toContain('pt-3');

    expect(uploadField.className).toContain('items-center');
    expect(uploadField.className).not.toContain('items-start');
  });

  it('renders helper guidance text for audience, brands/category, and topic inputs', () => {
    render(<CulturalArchaeologist />);

    const audienceHelperText = screen.getByText('Add the audience you want to analyze.');
    const brandsHelperText = screen.getByText('Add one or more brands or a category.');
    const topicHelperText = screen.getByText('Add a question or topic you want to explore.');

    expect(screen.getByTestId('cultural-audience-guidance').className).toContain('items-start');
    expect(screen.getByTestId('cultural-brands-guidance').className).toContain('items-start');
    expect(screen.getByTestId('cultural-topic-guidance').className).toContain('items-start');
    expect(screen.getByTestId('cultural-audience-guidance').className).toContain('text-left');
    expect(screen.getByTestId('cultural-brands-guidance').className).toContain('text-left');
    expect(screen.getByTestId('cultural-topic-guidance').className).toContain('text-left');
    expect(audienceHelperText.className).toContain('self-start');
    expect(brandsHelperText.className).toContain('self-start');
    expect(topicHelperText.className).toContain('self-start');
    expect(screen.getByTestId('cultural-audience-guidance')).toHaveTextContent('Add the audience you want to analyze.');
    expect(screen.getByTestId('cultural-brands-guidance')).toHaveTextContent('Add one or more brands or a category.');
    expect(screen.getByTestId('cultural-topic-guidance')).toHaveTextContent('Add a question or topic you want to explore.');
  });

  it('renders mobile helper guidance rows for generation, sources, and upload fields', () => {
    render(<CulturalArchaeologist />);

    const generationMobileGuidance = screen.getByTestId('cultural-generation-mobile-guidance');
    const sourcesMobileGuidance = screen.getByTestId('cultural-sources-mobile-guidance');
    const uploadMobileGuidance = screen.getByTestId('cultural-upload-mobile-guidance');

    expect(generationMobileGuidance.className).toContain('md:hidden');
    expect(sourcesMobileGuidance.className).toContain('md:hidden');
    expect(uploadMobileGuidance.className).toContain('md:hidden');
    expect(screen.getByTestId('cultural-generation-mobile-guidance-inline').className).toContain('text-left');
    expect(screen.getByTestId('cultural-sources-mobile-guidance-inline').className).toContain('text-left');
    expect(screen.getByTestId('cultural-upload-mobile-guidance-inline').className).toContain('text-left');

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
      render(<CulturalArchaeologist />);

      fireEvent.mouseEnter(screen.getByTestId('cultural-generation-field'));
      expect(screen.queryByTestId('cultural-generation-field-explainer-tooltip')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('cultural-generation-mobile-guidance-inline-trigger'));
      expect(screen.getByTestId('cultural-generation-mobile-guidance-inline-tooltip')).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, 'matchMedia', { writable: true, value: originalMatchMedia });
    }
  });

  it('opens guidance tooltips and closes with escape or outside click', async () => {
    render(<CulturalArchaeologist />);

    fireEvent.click(screen.getByTestId('cultural-audience-guidance-trigger'));
    const audienceGuidanceTooltip = screen.getByTestId('cultural-audience-guidance-tooltip');
    expect(audienceGuidanceTooltip).toHaveTextContent(
      'The more specific your audience, the more specific your results. Examples: Gen Z women, AI tech professionals, Homebuyers.'
    );
    expect(audienceGuidanceTooltip.className).toContain('bg-black');

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('cultural-audience-guidance-tooltip')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('cultural-brands-guidance-trigger'));
    expect(screen.getByTestId('cultural-brands-guidance-tooltip')).toHaveTextContent(
      'This will help you analyze the interesection of audience and brand/category. Examples: Nike, Adidas, Hoka or categories like premium skincare, energy drinks, athleisure. Press Enter to add each.'
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('cultural-brands-guidance-tooltip')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('cultural-topic-guidance-trigger'));
    expect(screen.getByTestId('cultural-topic-guidance-tooltip')).toHaveTextContent(
      'Examples: Gen Z purchase behavior, post-workout rituals, why runners switch from Nike to Hoka.'
    );

    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(screen.queryByTestId('cultural-topic-guidance-tooltip')).not.toBeInTheDocument();
    });

    fireEvent.mouseEnter(screen.getByTestId('cultural-generation-field'));
    const generationFieldExplainerTooltip = screen.getByTestId('cultural-generation-field-explainer-tooltip');
    expect(generationFieldExplainerTooltip).toHaveTextContent(
      'Select one or more age groups to focus your analysis.'
    );
    expect(generationFieldExplainerTooltip.className).toContain('bg-black');

    fireEvent.mouseLeave(screen.getByTestId('cultural-generation-field'));
    await waitFor(() => {
      expect(screen.queryByTestId('cultural-generation-field-explainer-tooltip')).not.toBeInTheDocument();
    });

    fireEvent.mouseEnter(screen.getByTestId('cultural-sources-field'));
    expect(screen.getByTestId('cultural-sources-field-explainer-tooltip')).toHaveTextContent(
      'Select the type of source(s) for your results. Source type adds context and specificity to observations.'
    );

    fireEvent.mouseLeave(screen.getByTestId('cultural-sources-field'));
    await waitFor(() => {
      expect(screen.queryByTestId('cultural-sources-field-explainer-tooltip')).not.toBeInTheDocument();
    });

    fireEvent.mouseEnter(screen.getByTestId('cultural-upload-field'));
    expect(screen.getByTestId('cultural-upload-field-explainer-tooltip')).toHaveTextContent(
      'Upload one or more documents to complement your analysis.'
    );

    fireEvent.mouseLeave(screen.getByTestId('cultural-upload-field'));
    await waitFor(() => {
      expect(screen.queryByTestId('cultural-upload-field-explainer-tooltip')).not.toBeInTheDocument();
    });
  });

  it('expands a detailed audience definition box from the audience icon and accepts long bullet lists', () => {
    render(<CulturalArchaeologist />);

    expect(screen.queryByTestId('cultural-audience-detail-input')).not.toBeInTheDocument();

    const detailToggle = screen.getByTestId('cultural-audience-detail-toggle');
    fireEvent.click(detailToggle);

    const detailInput = screen.getByTestId('cultural-audience-detail-input');
    const longDetail = `${'Primary audience persona details. '.repeat(30)}\n- Shops by peer validation\n- Values sustainability`;
    fireEvent.change(detailInput, { target: { value: longDetail } });

    expect(detailInput).toHaveValue(longDetail);

    fireEvent.click(detailToggle);
    expect(screen.queryByTestId('cultural-audience-detail-input')).not.toBeInTheDocument();
  });

  it('uses the expanded audience definition in sourcing context for generation', async () => {
    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });

    fireEvent.click(screen.getByTestId('cultural-audience-detail-toggle'));
    fireEvent.change(screen.getByTestId('cultural-audience-detail-input'), {
      target: { value: '- Prioritizes peer validation\n- Values niche drops over mass trends' },
    });

    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    await waitFor(() => {
      expect(generateCulturalMatrix).toHaveBeenCalled();
    });

    const sourcedAudience = generateCulturalMatrix.mock.calls[0]?.[0];
    expect(typeof sourcedAudience).toBe('string');
    expect(sourcedAudience).toContain('Gen Z sneaker culture');
    expect(sourcedAudience).toContain('Detailed Audience Definition');
    expect(sourcedAudience).toContain('Prioritizes peer validation');
  });

  it('supports keyboard shortcuts for bullets in expanded audience field', async () => {
    render(<CulturalArchaeologist />);

    fireEvent.click(screen.getByTestId('cultural-audience-detail-toggle'));
    const detailInput = screen.getByTestId('cultural-audience-detail-input') as HTMLTextAreaElement;

    detailInput.focus();
    detailInput.setSelectionRange(0, 0);
    fireEvent.keyDown(detailInput, { key: '8', code: 'Digit8', ctrlKey: true, shiftKey: true });

    await waitFor(() => {
      expect(detailInput).toHaveValue('- ');
    });

    fireEvent.change(detailInput, { target: { value: '- First signal' } });
    detailInput.setSelectionRange(detailInput.value.length, detailInput.value.length);
    fireEvent.keyDown(detailInput, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(detailInput).toHaveValue('- First signal\n- ');
    });
  });

  it('keeps brand chip entry and topic input behavior working with guidance UI', async () => {
    render(<CulturalArchaeologist />);

    const brandsInput = screen.getByTestId('cultural-brands-input');
    fireEvent.change(brandsInput, { target: { value: 'Nike' } });
    fireEvent.keyDown(brandsInput, { key: 'Enter', code: 'Enter' });
    expect(await screen.findByTestId('cultural-brand-chip-0')).toHaveTextContent('Nike');

    const topicInput = screen.getByPlaceholderText('Topic Focus (Optional)');
    fireEvent.change(topicInput, { target: { value: 'Sneakers' } });
    expect(screen.getByDisplayValue('Sneakers')).toBeInTheDocument();
  });

  it('uses the same show-all button text/icon size and color as Brand Navigator', async () => {
    generateCulturalMatrix.mockResolvedValueOnce({
      ...mockMatrix,
      moments: [
        { text: '[KNOWN] First signal', isHighlyUnique: false, sourceType: 'Mainstream', confidenceLevel: 'high' as const, trendLifecycle: 'peaking' as const },
        { text: '[KNOWN] Second signal', isHighlyUnique: false, sourceType: 'Mainstream', confidenceLevel: 'high' as const, trendLifecycle: 'peaking' as const },
        { text: '[KNOWN] Third signal', isHighlyUnique: false, sourceType: 'Mainstream', confidenceLevel: 'high' as const, trendLifecycle: 'peaking' as const },
        { text: '[KNOWN] Fourth signal', isHighlyUnique: false, sourceType: 'Mainstream', confidenceLevel: 'high' as const, trendLifecycle: 'peaking' as const },
        { text: '[KNOWN] Fifth signal', isHighlyUnique: false, sourceType: 'Mainstream', confidenceLevel: 'high' as const, trendLifecycle: 'peaking' as const },
      ],
    });

    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    await screen.findByText('First signal', {}, { timeout: 3000 });
    const showAllBtn = await screen.findByRole('button', { name: /show all 5 items/i }, { timeout: 3000 });
    expect(showAllBtn.className).toContain('text-sm');
    expect(showAllBtn.className).toContain('text-indigo-600');
    const showAllChevron = showAllBtn.querySelector('svg');
    expect(showAllChevron?.className.baseVal ?? '').toContain('w-4 h-4');
  });

  it('keeps demographics visible when result filters narrow or remove visible insights', async () => {
    generateCulturalMatrix.mockResolvedValueOnce({
      ...mockMatrix,
      demographics: {
        age: '[KNOWN] 18-34',
        race: '[INFERRED] Multi-ethnic urban cohorts',
        gender: '[INFERRED] Women and non-binary skew',
      },
      moments: [
        {
          text: '[KNOWN] First signal',
          isHighlyUnique: false,
          sourceType: 'Mainstream',
          confidenceLevel: 'high' as const,
          trendLifecycle: 'peaking' as const,
        },
      ],
    });

    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    await screen.findByText('Average Age', {}, { timeout: 3000 });
    expect(await screen.findByText('18-34', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText('Multi-ethnic urban cohorts')).toBeInTheDocument();
    expect(screen.getByText('Women and non-binary skew')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /declining/i }));
    expect(await screen.findByText(/No insights match the selected filters/i)).toBeInTheDocument();

    expect(screen.getByText('18-34')).toBeInTheDocument();
    expect(screen.getByText('Multi-ethnic urban cohorts')).toBeInTheDocument();
    expect(screen.getByText('Women and non-binary skew')).toBeInTheDocument();
  });

  it('renders evidence type chips in deep-dive strategic implications', async () => {
    generateCulturalMatrix.mockResolvedValueOnce({
      ...mockMatrix,
      moments: [
        {
          text: 'First signal',
          isHighlyUnique: false,
          sourceType: 'Mainstream',
          confidenceLevel: 'high' as const,
          trendLifecycle: 'peaking' as const,
        },
      ],
    });
    generateDeepDive.mockResolvedValueOnce({
      originationDate: '2026-05-11',
      relevance: 'High relevance to current market shifts.',
      expandedContext: '[KNOWN] Expanded context detail',
      strategicImplications: [
        '[KNOWN] Product and brand messaging should separate augmentation from substitution clearly.',
        '[INFERRED] Creative tooling preferences suggest appetite for guided automation experiences.',
        '[SPECULATIVE] Regulatory shifts could force a faster move toward transparent model disclosures.',
      ],
      realWorldExamples: ['[INFERRED] Example detail'],
      sources: [{ title: 'Reuters', url: 'https://www.reuters.com/example' }],
    });

    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    const deepDiveButton = await screen.findByTitle('Generate Deep Dive');
    fireEvent.click(deepDiveButton);

    const strategicHeading = await screen.findByText('Strategic Implications');
    const strategicSection = strategicHeading.closest('section');
    expect(strategicSection).not.toBeNull();
    expect(screen.getByText('Product and brand messaging should separate augmentation from substitution clearly.')).toBeInTheDocument();
    expect(screen.queryByText(/\[KNOWN\]|\[INFERRED\]|\[SPECULATIVE\]/i)).not.toBeInTheDocument();
    expect(within(strategicSection as HTMLElement).getAllByText(/^known$/i).length).toBeGreaterThan(0);
    expect(within(strategicSection as HTMLElement).getAllByText(/^inferred$/i).length).toBeGreaterThan(0);
    expect(within(strategicSection as HTMLElement).getAllByText(/^speculative$/i).length).toBeGreaterThan(0);
  });

  it('shows an active source link beside each deep-dive real world example', async () => {
    generateCulturalMatrix.mockResolvedValueOnce({
      ...mockMatrix,
      moments: [
        {
          text: 'First signal',
          isHighlyUnique: false,
          sourceType: 'Mainstream',
          confidenceLevel: 'high' as const,
          trendLifecycle: 'peaking' as const,
        },
      ],
    });
    generateDeepDive.mockResolvedValueOnce({
      originationDate: '2026-05-11',
      relevance: 'High relevance to current market shifts.',
      expandedContext: '[KNOWN] Expanded context detail',
      strategicImplications: ['[KNOWN] Strategic implication detail'],
      realWorldExamples: [
        '[KNOWN] Reuters Example One creator co-sign drove launch-day sell-through.',
        '[INFERRED] Reuters Example Two challenge format lifted conversion for this drop.',
      ],
      sources: [
        { title: 'Reuters Example One', url: 'https://www.reuters.com/example-one' },
        { title: 'Reuters Example Two', url: 'https://www.reuters.com/example-two' },
      ],
    });

    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    const deepDiveButton = await screen.findByTitle('Generate Deep Dive');
    fireEvent.click(deepDiveButton);

    const exampleOneSourceLink = await screen.findByTestId('deep-dive-real-world-source-link-desktop-0');
    const exampleTwoSourceLink = await screen.findByTestId('deep-dive-real-world-source-link-desktop-1');

    expect(exampleOneSourceLink).toHaveAttribute('href', expect.stringContaining('https://www.reuters.com/example-one'));
    expect(exampleTwoSourceLink).toHaveAttribute('href', expect.stringContaining('https://www.reuters.com/example-two'));
    expect(exampleOneSourceLink).toHaveTextContent('Reuters Example One');
    expect(exampleTwoSourceLink).toHaveTextContent('Reuters Example Two');
  });

  it('does not attach a real-world example link when source matching is ambiguous', async () => {
    generateCulturalMatrix.mockResolvedValueOnce({
      ...mockMatrix,
      moments: [
        {
          text: 'First signal',
          isHighlyUnique: false,
          sourceType: 'Mainstream',
          confidenceLevel: 'high' as const,
          trendLifecycle: 'peaking' as const,
        },
      ],
    });
    generateDeepDive.mockResolvedValueOnce({
      originationDate: '2026-05-11',
      relevance: 'High relevance to current market shifts.',
      expandedContext: '[KNOWN] Expanded context detail',
      strategicImplications: ['[KNOWN] Strategic implication detail'],
      realWorldExamples: [
        '[KNOWN] Audience engagement around this behavior keeps accelerating.',
        '[INFERRED] Purchase intent increased after a social sharing spike.',
      ],
      sources: [
        { title: 'Reuters Example One', url: 'https://www.reuters.com/example-one' },
        { title: 'Reuters Example Two', url: 'https://www.reuters.com/example-two' },
      ],
    });

    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    const deepDiveButton = await screen.findByTitle('Generate Deep Dive');
    fireEvent.click(deepDiveButton);

    await screen.findByText('Real World Examples');
    expect(screen.queryByTestId('deep-dive-real-world-source-link-desktop-0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('deep-dive-real-world-source-link-desktop-1')).not.toBeInTheDocument();
  });

  it('attaches ask-answer evidence chips to the specific sentence they belong to', async () => {
    askMatrixQuestion.mockResolvedValueOnce({
      answer: '[KNOWN] Gen Z is using AI pragmatically in school and work contexts. [INFERRED] Direct cross-generation preference claims are not supported by this data.',
      relevantInsights: [],
    });

    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    const askInput = await screen.findByPlaceholderText(/Ask a question about this audience/i);
    fireEvent.change(askInput, { target: { value: 'Does Gen Z like AI more than other generations?' } });
    fireEvent.click(screen.getByRole('button', { name: /^ask$/i }));

    const askCard = await screen.findByTestId('ask-answer-card');
    const sentenceOne = within(askCard).getByTestId('ask-answer-sentence-0-0');
    const sentenceTwo = within(askCard).getByTestId('ask-answer-sentence-0-1');

    expect(sentenceOne).toHaveTextContent('Gen Z is using AI pragmatically in school and work contexts.');
    expect(within(sentenceOne).getByText(/^known$/i)).toBeInTheDocument();
    expect(within(sentenceOne).queryByText(/^inferred$/i)).not.toBeInTheDocument();

    expect(sentenceTwo).toHaveTextContent('Direct cross-generation preference claims are not supported by this data.');
    expect(within(sentenceTwo).getByText(/^inferred$/i)).toBeInTheDocument();
    expect(within(sentenceTwo).queryByText(/^known$/i)).not.toBeInTheDocument();
  });

  it('does not show methodology comparison launchers in the research view navigation', async () => {
    render(<CulturalArchaeologist />);

    expect(screen.queryByTestId('open-methodology-comparison-inline-button')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /methodology compare/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('open-tone-methodology-comparison-inline-button')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /tone method compare/i })).not.toBeInTheDocument();
  });
});
