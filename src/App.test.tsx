import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';
import { describe, it, expect } from 'vitest';

describe('App Component', () => {
  it('renders the main heading', () => {
    render(<App />);
    expect(screen.getByText(/Cultural Archaeologist/i)).toBeInTheDocument();
  });

  it('has input fields for brand and audience', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /cultural archaeologist/i }));

    expect(screen.getByPlaceholderText(/Brand or Category/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Primary Audience/i)).toBeInTheDocument();
  });
});
