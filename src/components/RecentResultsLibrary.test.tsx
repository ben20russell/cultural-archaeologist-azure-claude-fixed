import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_RECENT_RESULTS_MODES,
  clearRecentResults,
  saveRecentResult,
} from '../services/recent-results-storage';
import { RecentResultsLibrary } from './RecentResultsLibrary';

type MockResult = {
  id: string;
  title: string;
  description: string;
};

describe('RecentResultsLibrary', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders recently viewed items and handles item selection', () => {
    saveRecentResult<MockResult>(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR, {
      id: '1',
      title: 'Result One',
      description: 'First description',
    });

    const onSelect = vi.fn();

    render(
      <RecentResultsLibrary<MockResult>
        mode={APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR}
        title="Recent Projects"
        onSelectItem={onSelect}
      />
    );

    expect(screen.getByText('Recent Projects')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /result one/i }));

    expect(onSelect).toHaveBeenCalledWith({
      id: '1',
      title: 'Result One',
      description: 'First description',
    });
  });

  it('clears mode history when clear button is clicked', () => {
    saveRecentResult<MockResult>(APP_RECENT_RESULTS_MODES.DESIGN_EXCAVATOR, {
      id: '2',
      title: 'Result Two',
      description: 'Second description',
    });

    render(
      <RecentResultsLibrary<MockResult>
        mode={APP_RECENT_RESULTS_MODES.DESIGN_EXCAVATOR}
        onSelectItem={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /clear history/i }));

    expect(clearRecentResults).toBeDefined();
    expect(screen.queryByText('Result Two')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recent-results-library')).not.toBeInTheDocument();
  });

  it('does not render when there are no recent projects', () => {
    render(
      <RecentResultsLibrary<MockResult>
        mode={APP_RECENT_RESULTS_MODES.CULTURAL_ARCHAEOLOGIST}
        onSelectItem={vi.fn()}
      />
    );

    expect(screen.queryByTestId('recent-results-library')).not.toBeInTheDocument();
  });
});
