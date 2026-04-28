import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BrandDeepDivePage } from './VisualDesignExcavator';

const { generateBrandDeepDive, submitBrandDeepDivePrompt, suggestBrandWebsite } = vi.hoisted(() => ({
  generateBrandDeepDive: vi.fn(),
  submitBrandDeepDivePrompt: vi.fn(),
  suggestBrandWebsite: vi.fn(),
}));

vi.mock('../services/azure-openai', () => ({
  generateBrandDeepDive,
  submitBrandDeepDivePrompt,
  suggestBrandWebsite,
}));

const sampleReport = {
  analysisObjective: 'Compare premium skincare brands',
  ecosystemMethod: 'Reviewed official sites and public brand assets.',
  brandProfiles: [
    {
      brandName: 'Aesop',
      website: 'https://www.aesop.com',
      matchSource: 'name',
      logoImageUrl: null,
      sampleVisuals: [],
      logo: {
        mainLogo: 'Minimal serif wordmark',
        logoVariations: ['Stacked wordmark'],
        wordmarkLogotype: 'Uppercase serif wordmark',
        symbolsIcons: [],
      },
      colorPalette: {
        primaryColors: [],
        secondaryAccentColors: [],
        neutrals: [],
      },
      typography: {
        fontFamilies: ['Serif'],
        hierarchy: {
          h1: 'Serif display',
          h2: 'Serif subhead',
          body: 'Sans serif body',
        },
        usageRules: ['Sparse, editorial hierarchy'],
      },
      supportingVisualElements: {
        imageryStyle: ['Muted product photography'],
        icons: [],
        patternsTextures: [],
        shapes: [],
        dataVisualization: [],
      },
      consistencyAssessment: 'Consistent across touchpoints.',
      distinctivenessAssessment: 'Distinct through restraint.',
      sources: [{ title: 'Aesop', url: 'https://www.aesop.com' }],
    },
  ],
  crossBrandReadout: ['Shared minimalist codes in the category.'],
  strategicRecommendations: ['Lean into differentiated editorial cues.'],
  sources: [{ title: 'Aesop', url: 'https://www.aesop.com' }],
};

describe('BrandDeepDivePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    generateBrandDeepDive.mockResolvedValue(sampleReport);
    submitBrandDeepDivePrompt.mockResolvedValue({
      mode: 'rescan',
      answer: 'The report was rescanned and updated using your prompt. Review the refreshed results below.',
      report: sampleReport,
    });
    suggestBrandWebsite.mockResolvedValue(null);
  });

  it('removes the Scan & Fix button and routes corrective prompts through Ask', async () => {
    render(<BrandDeepDivePage onBack={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Brand 1 Name'), {
      target: { value: 'Aesop' },
    });
    fireEvent.change(
      screen.getByPlaceholderText('Visual Identity Objective (Required) e.g. Compare distinctiveness and consistency across premium skincare brands'),
      {
        target: { value: 'Compare premium skincare brands' },
      }
    );

    fireEvent.click(screen.getByRole('button', { name: /generate visual analysis/i }));

    await screen.findByText(/Ask About This Analysis/i);

    expect(screen.queryByRole('button', { name: /rescan/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('e.g. Which brand has the most distinct color system?'), {
      target: { value: 'The logo details look inaccurate. Please rescan and fix them.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^ask$/i }));

    await waitFor(() => {
      expect(submitBrandDeepDivePrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          brands: [{ name: 'Aesop', website: '' }],
          analysisObjective: 'Compare premium skincare brands',
          currentReport: sampleReport,
          prompt: 'The logo details look inaccurate. Please rescan and fix them.',
        })
      );
    });

    expect(
      await screen.findByText('The report was rescanned and updated using your prompt. Review the refreshed results below.')
    ).toBeInTheDocument();
  });

  it('falls back to larger logo assets instead of favicons', async () => {
    render(<BrandDeepDivePage onBack={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Brand 1 Name'), {
      target: { value: 'Aesop' },
    });
    fireEvent.change(
      screen.getByPlaceholderText('Visual Identity Objective (Required) e.g. Compare distinctiveness and consistency across premium skincare brands'),
      {
        target: { value: 'Compare premium skincare brands' },
      }
    );

    fireEvent.click(screen.getByRole('button', { name: /generate visual analysis/i }));

    const [logo] = await screen.findAllByAltText(/Aesop logo/i);
    expect(logo).toHaveAttribute('src', expect.stringContaining('www.aesop.com'));
    expect(logo.getAttribute('src')).not.toContain('logo.clearbit.com');

    fireEvent.error(logo);

    expect(logo).toHaveAttribute('src', expect.stringMatching(/logo\.png|logo\.svg|apple-touch-icon\.png|logo%2Epng|logo%2Esvg|apple-touch-icon%2Epng|apple-touch-icon%2Fpng/i));
    expect(logo.getAttribute('src')).not.toContain('google.com/s2/favicons');
  });

  it('shows Compare Across Brands popup when clicking a result box', async () => {
    render(<BrandDeepDivePage onBack={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Brand 1 Name'), {
      target: { value: 'Aesop' },
    });
    fireEvent.change(
      screen.getByPlaceholderText('Visual Identity Objective (Required) e.g. Compare distinctiveness and consistency across premium skincare brands'),
      {
        target: { value: 'Compare premium skincare brands' },
      }
    );

    fireEvent.click(screen.getByRole('button', { name: /generate visual analysis/i }));

    await screen.findByText(/Ask About This Analysis/i);
    fireEvent.click(screen.getByText('Typography'));

    const compareButton = await screen.findByRole('button', { name: /compare across brands/i });
    fireEvent.click(compareButton);

    expect(await screen.findByText('Typography Comparison')).toBeInTheDocument();
  });
});
