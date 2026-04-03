import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Accordion } from './Accordion';

describe('Accordion', () => {
  const items = [
    { id: 'one', title: 'First Section', content: <p>First content</p> },
    { id: 'two', title: 'Second Section', content: <p>Second content</p> },
    { id: 'three', title: 'Third Section', content: <p>Third content</p> },
  ];

  it('opens only the first section by default', () => {
    render(<Accordion items={items} />);

    expect(screen.getByText('First content')).toBeInTheDocument();
    expect(screen.getByText('Second content')).not.toBeVisible();
    expect(screen.getByText('Third content')).not.toBeVisible();
  });

  it('toggles sections and keeps only one open at a time', () => {
    render(<Accordion items={items} />);

    fireEvent.click(screen.getByRole('button', { name: /second section/i }));
    expect(screen.getByText('Second content')).toBeInTheDocument();
    expect(screen.getByText('First content')).not.toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /second section/i }));
    expect(screen.getByText('Second content')).not.toBeVisible();
  });
});