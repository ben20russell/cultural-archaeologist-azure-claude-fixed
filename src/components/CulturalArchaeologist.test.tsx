import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CulturalArchaeologist from './CulturalArchaeologist';

const {
  generateCulturalMatrix,
  suggestBrands,
  askMatrixQuestion,
  generateDeepDive,
  generateDeepDivesBatch,
  supabaseFrom,
  supabaseInsert,
  supabaseLimit,
} = vi.hoisted(() => ({
  generateCulturalMatrix: vi.fn(),
  suggestBrands: vi.fn(),
  askMatrixQuestion: vi.fn(),
  generateDeepDive: vi.fn(),
  generateDeepDivesBatch: vi.fn(),
  supabaseFrom: vi.fn(),
  supabaseInsert: vi.fn(async () => ({ data: null, error: null })),
  supabaseLimit: vi.fn(async () => ({ data: [], error: null })),
}));

vi.mock('../services/azure-openai', () => ({
  generateCulturalMatrix,
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
vi.mock('./RecentResultsLibrary', () => ({ RecentResultsLibrary: () => null }));

const mockMatrix = {
  demographics: {
    age: null,
    race: null,
    gender: null,
    income: null,
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

describe('CulturalArchaeologist', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/#cultural-archaeologist');
    vi.clearAllMocks();
    suggestBrands.mockResolvedValue(['Nike', 'Adidas']);
    generateCulturalMatrix.mockResolvedValue(mockMatrix);
    askMatrixQuestion.mockResolvedValue({ answer: 'ok', relevantInsights: [] });
    generateDeepDive.mockResolvedValue({});
    generateDeepDivesBatch.mockResolvedValue([]);
  });

  it('shows rerun button only when at least one result filter is selected', async () => {
    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    expect(await screen.findByText('Result Filters')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /generate insights/i })).not.toBeDisabled();
    });
    expect(screen.queryByTestId('rerun-analysis-button')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /high/i }));

    expect(await screen.findByTestId('rerun-analysis-button')).toBeInTheDocument();
  });

  it('reruns analysis with active filter constraints while keeping current filter behavior', async () => {
    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    expect(await screen.findByText('Result Filters')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /generate insights/i })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /high/i }));
    fireEvent.click(screen.getByRole('button', { name: /known/i }));

    const rerunButton = await screen.findByTestId('rerun-analysis-button');
    expect(rerunButton).not.toBeDisabled();
    fireEvent.click(rerunButton);

    await waitFor(() => {
      expect(generateCulturalMatrix).toHaveBeenCalledTimes(2);
    });

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
});
