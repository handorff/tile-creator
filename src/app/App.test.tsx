import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('allows hiding and showing the pattern preview pane', () => {
    render(<App />);

    expect(screen.getByTestId('tiling-preview')).toBeInTheDocument();
    expect(screen.getByRole('separator', { name: 'Resize editor and preview panes' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide Pattern Preview' }));

    expect(screen.queryByTestId('tiling-preview')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('separator', { name: 'Resize editor and preview panes' })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show Pattern Preview' }));

    expect(screen.getByTestId('tiling-preview')).toBeInTheDocument();
    expect(screen.getByRole('separator', { name: 'Resize editor and preview panes' })).toBeInTheDocument();
  });
});
