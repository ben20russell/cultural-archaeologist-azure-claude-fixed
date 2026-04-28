import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { beforeEach, describe, it, expect, vi } from 'vitest';

const {
  suggestBrandsMock,
  generateCulturalMatrixMock,
} = vi.hoisted(() => ({
  suggestBrandsMock: vi.fn(),
  generateCulturalMatrixMock: vi.fn(),
}));

// Mock azure-openai service for async flows
vi.mock('./services/azure-openai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./services/azure-openai')>();
  return {
    ...actual,
    suggestBrands: suggestBrandsMock,
    generateCulturalMatrix: generateCulturalMatrixMock,
  };
});

describe('App Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    suggestBrandsMock.mockResolvedValue(['Nike', 'Nestle']);
    generateCulturalMatrixMock.mockResolvedValue({
      demographics: { age: '', race: '', gender: '' },
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
    });
  });

  async function waitForSplashToDisappear() {
    // Wait for splash screen to be fully unmounted (not in DOM)
    await waitFor(() => {
      return screen.queryByTestId('splash-screen') === null;
    }, { timeout: 3000 });
  }

  it('renders the main heading', async () => {
    render(<App />);
    await waitForSplashToDisappear();
    // Click the experience button to show main form
    fireEvent.click(screen.getByText(/Cultural Archaeologist/i));
    expect(screen.getByPlaceholderText(/Brand or Category \(Optional\)/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Primary Audience \(Required\) \*/i)).toBeInTheDocument();
  });

  it('shows brand suggestions as user types', async () => {
    render(<App />);
    await waitForSplashToDisappear();
    fireEvent.click(screen.getByText(/Cultural Archaeologist/i));
    const brandInput = screen.getByPlaceholderText(/Brand or Category \(Optional\)/i);
    fireEvent.change(brandInput, { target: { value: 'N' } });
    fireEvent.change(brandInput, { target: { value: 'Ni' } });
    await waitFor(() => expect(screen.getByText('Suggestions')).toBeInTheDocument());
    expect(screen.getByText('Nike')).toBeInTheDocument();
  });

  it('captures topic focus input', async () => {
    render(<App />);
    await waitForSplashToDisappear();
    fireEvent.click(screen.getByText(/Cultural Archaeologist/i));
    const topicInput = screen.getByPlaceholderText(/Topic Focus \(Optional\)/i);
    fireEvent.change(topicInput, { target: { value: 'Sneakers' } });
    expect(screen.getByDisplayValue('Sneakers')).toBeInTheDocument();
  });

  it('shows validation error if audience is empty on generate', async () => {
    render(<App />);
    await waitForSplashToDisappear();
    fireEvent.click(screen.getByText(/Cultural Archaeologist/i));
    const generateBtn = screen.getByRole('button', { name: /generate/i });
    fireEvent.click(generateBtn);
    expect(await screen.findByText(/Audience is required/i)).toBeInTheDocument();
  });

  it('shows loading state when generating', async () => {
    generateCulturalMatrixMock.mockImplementation(() => new Promise(() => {}));
    render(<App />);
    await waitForSplashToDisappear();
    fireEvent.click(screen.getByText(/Cultural Archaeologist/i));
    fireEvent.change(screen.getByPlaceholderText(/Primary Audience/i), { target: { value: 'Gen Z' } });
    const generateBtn = screen.getByRole('button', { name: /generate insights/i });
    fireEvent.click(generateBtn);
    expect(await screen.findByText(/Scanning latest audience signals/i)).toBeInTheDocument();
  });

  it('shows error toast if brand suggestion fails', async () => {
    suggestBrandsMock.mockRejectedValueOnce(new Error('API error'));
    render(<App />);
    await waitForSplashToDisappear();
    fireEvent.click(screen.getByText(/Cultural Archaeologist/i));
    const brandInput = screen.getByPlaceholderText(/Brand or Category/i);
    fireEvent.change(brandInput, { target: { value: 'Ni' } });
    await waitFor(() => expect(screen.getByText(/Failed to get brand suggestions/i)).toBeInTheDocument());
  });

  it('stacks the top action buttons on mobile to add spacing', async () => {
    render(<App />);
    await waitForSplashToDisappear();
    fireEvent.click(screen.getByText(/Cultural Archaeologist/i));

    const actionBar = screen.getByRole('button', { name: /visual design excavator/i }).parentElement;

    expect(actionBar).toHaveClass('flex-col');
    expect(actionBar).toHaveClass('gap-3');
    expect(actionBar).toHaveClass('sm:flex-row');
  });
});
