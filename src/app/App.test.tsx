import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const buildAnimatedGifMock = vi.fn();
const downloadBlobMock = vi.fn();

vi.mock('../features/export/exportGif', () => ({
  buildAnimatedGif: (...args: unknown[]) => buildAnimatedGifMock(...args)
}));

vi.mock('../utils/download', async () => {
  const actual = await vi.importActual<typeof import('../utils/download')>('../utils/download');
  return {
    ...actual,
    downloadBlob: (...args: unknown[]) => downloadBlobMock(...args)
  };
});

import { App } from './App';

describe('App', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    window.localStorage.clear();
    buildAnimatedGifMock.mockReset();
    downloadBlobMock.mockReset();
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

  it('renders animated gif export button', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: 'Export Animated GIF' })).toBeInTheDocument();
  });

  it('renders button to open the preset gallery modal', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: 'Open Gallery' })).toBeInTheDocument();
  });

  it('disables gif export button while exporting and shows success message', async () => {
    let resolveExport: ((blob: Blob) => void) | undefined;
    buildAnimatedGifMock.mockReturnValue(
      new Promise<Blob>((resolve) => {
        resolveExport = resolve;
      })
    );

    render(<App />);

    const exportButton = screen.getByRole('button', { name: 'Export Animated GIF' });
    fireEvent.click(exportButton);

    expect(exportButton).toBeDisabled();
    expect(screen.getByText('Exporting animated GIF...')).toBeInTheDocument();

    resolveExport?.(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/gif' }));

    await waitFor(() => expect(exportButton).not.toBeDisabled());
    expect(downloadBlobMock).toHaveBeenCalledWith('tile-history.gif', expect.any(Blob));
    expect(screen.getByText('Exported animated GIF.')).toBeInTheDocument();
  });

  it('shows gif export failure message and re-enables button', async () => {
    buildAnimatedGifMock.mockRejectedValue(new Error('GIF export failed.'));

    render(<App />);

    const exportButton = screen.getByRole('button', { name: 'Export Animated GIF' });
    fireEvent.click(exportButton);

    await waitFor(() => expect(exportButton).not.toBeDisabled());
    expect(downloadBlobMock).not.toHaveBeenCalled();
    expect(screen.getByText('GIF export failed.')).toBeInTheDocument();
  });
});
