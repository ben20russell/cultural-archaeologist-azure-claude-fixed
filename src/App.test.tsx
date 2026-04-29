import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { describe, it, expect, vi } from 'vitest';

// Mock azure-openai service for async flows
vi.mock('./services/azure-openai', async () => {
  const actual = await vi.importActual<typeof import('./services/azure-openai')>('./services/azure-openai');
  return {
    ...actual,
    suggestBrands: vi.fn().mockResolvedValue(['Nike', 'Nestle']),
  };
});

describe('App Component', () => {
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

  it('has input fields for brand and audience', async () => {
    render(<App />);
    await waitForSplashToDisappear();
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

  it('keeps topic input editable', async () => {
    render(<App />);
    await waitForSplashToDisappear();
    fireEvent.click(screen.getByText(/Cultural Archaeologist/i));
    const topicInput = screen.getByPlaceholderText(/Topic Focus \(Optional\)/i);
    fireEvent.change(topicInput, { target: { value: 'Sneakers' } });
    await waitFor(() => expect(screen.getByDisplayValue('Sneakers')).toBeInTheDocument());
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
    // Mock generateCulturalMatrix to delay
    const azure = await import('./services/azure-openai');
    vi.spyOn(azure, 'generateCulturalMatrix').mockImplementation(() => new Promise(() => {}));
    render(<App />);
    await waitForSplashToDisappear();
    fireEvent.click(screen.getByText(/Cultural Archaeologist/i));
    fireEvent.change(screen.getByPlaceholderText(/Primary Audience/i), { target: { value: 'Gen Z' } });
    const generateBtn = screen.getByRole('button', { name: /generate/i });
    fireEvent.click(generateBtn);
    expect(screen.getByText(/Scanning latest audience signals|Synthesizing cultural tensions|Ranking highest-potency insights|Shaping strategist-ready output/i)).toBeInTheDocument();
  });

  it('shows error toast if brand suggestion fails', async () => {
    const { suggestBrands } = await import('./services/azure-openai');
    vi.mocked(suggestBrands).mockRejectedValueOnce(new Error('API error'));
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

    const actionBar = screen.getByRole('button', { name: /design excavator/i }).parentElement;

    expect(actionBar).toHaveClass('flex-col');
    expect(actionBar).toHaveClass('gap-3');
    expect(actionBar).toHaveClass('sm:flex-row');
  });
});
