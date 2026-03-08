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

function storeProject(project: unknown): void {
  window.localStorage.setItem(
    'tile-creator-project-v1',
    JSON.stringify({
      version: 1,
      project,
      pattern: {
        columns: 4,
        rows: 3
      }
    })
  );
}

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

  it('toggles the pattern bounds rectangle in the preview', () => {
    const { container } = render(<App />);

    expect(container.querySelector('.preview-canvas .pattern-bounds')).toBeNull();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Draw pattern bounds' }));

    const boundsRect = container.querySelector('.preview-canvas .pattern-bounds');
    expect(boundsRect).not.toBeNull();
    expect(boundsRect).toHaveAttribute('stroke', '#1f2937');
  });

  it('opens a new tile modal and creates a hexagonal tile', async () => {
    storeProject({
      tile: { shape: 'square', size: 120 },
      primitives: [
        {
          id: 'line-1',
          kind: 'line',
          a: { x: 0, y: 0 },
          b: { x: 40, y: 0 },
          color: '#111111',
          strokeWidth: 2
        }
      ],
      activeTool: 'line',
      activeColor: '#111111',
      activeStrokeWidth: 2,
      history: {
        past: [],
        future: []
      }
    });

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'New Tile' }));

    expect(screen.getByRole('dialog', { name: 'Choose Tile Shape' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hexagonal' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Choose Tile Shape' })).not.toBeInTheDocument()
    );

    const stored = JSON.parse(window.localStorage.getItem('tile-creator-project-v1') ?? '{}');
    expect(stored.project.tile.shape).toBe('hex-pointy');
    expect(stored.project.primitives).toHaveLength(0);
    expect(screen.queryByText('Started a new hexagonal tile.')).toBeNull();
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

  it('selects only visible colors with Command+A', async () => {
    storeProject({
      tile: { shape: 'square', size: 120 },
      primitives: [
        {
          id: 'line-visible',
          kind: 'line',
          a: { x: 0, y: 0 },
          b: { x: 40, y: 0 },
          color: '#111111',
          strokeWidth: 2
        },
        {
          id: 'line-hidden',
          kind: 'line',
          a: { x: 0, y: 20 },
          b: { x: 40, y: 20 },
          color: '#222222',
          strokeWidth: 2
        }
      ],
      activeTool: 'select',
      activeColor: '#111111',
      activeStrokeWidth: 2,
      history: {
        past: [],
        future: []
      }
    });

    const { container } = render(<App />);

    fireEvent.click(screen.getByTestId('visibility-off-#222222'));
    fireEvent.keyDown(window, { key: 'a', metaKey: true });

    await waitFor(() => expect(container.querySelectorAll('.selected-primitive')).toHaveLength(1));

    fireEvent.keyDown(window, { key: 'Delete' });
    fireEvent.click(screen.getByTestId('visibility-on-#222222'));

    await waitFor(() => expect(container.querySelectorAll('.editor-canvas line')).toHaveLength(9));
    expect(
      [...container.querySelectorAll('.editor-canvas line')].every(
        (line) => line.getAttribute('stroke') === '#222222'
      )
    ).toBe(true);
  });

  it('creates offsets, allows immediate distance edits, and clears the editor when deselected', async () => {
    storeProject({
      tile: { shape: 'square', size: 120 },
      primitives: [
        {
          id: 'line-1',
          kind: 'line',
          a: { x: 0, y: 0 },
          b: { x: 40, y: 0 },
          color: '#111111',
          strokeWidth: 2
        },
        {
          id: 'line-2',
          kind: 'line',
          a: { x: 40, y: 0 },
          b: { x: 40, y: 40 },
          color: '#111111',
          strokeWidth: 2
        }
      ],
      activeTool: 'select',
      activeColor: '#111111',
      activeStrokeWidth: 2,
      history: {
        past: [],
        future: []
      }
    });

    const { container } = render(<App />);
    const canvas = container.querySelector('svg.editor-canvas');
    expect(canvas).not.toBeNull();
    if (!canvas) {
      return;
    }

    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 700, 700));

    fireEvent.keyDown(window, { key: 'a', metaKey: true });
    await waitFor(() => expect(container.querySelectorAll('.selected-primitive')).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: 'Offset' }));

    await waitFor(() => expect(container.querySelectorAll('.selected-primitive')).toHaveLength(4));
    expect(screen.getByTestId('offset-distance')).toHaveValue(12);

    const afterCreate = JSON.parse(window.localStorage.getItem('tile-creator-project-v1') ?? '{}');
    expect(afterCreate.project.primitives).toHaveLength(6);
    const createdOffset = afterCreate.project.primitives.find(
      (primitive: { id: string; kind: string; a?: { y: number } }) =>
        primitive.id.startsWith('line-') &&
        primitive.kind === 'line' &&
        primitive.a?.y === 12
    );
    expect(createdOffset).toBeTruthy();

    fireEvent.change(screen.getByTestId('offset-distance'), { target: { value: '6' } });
    fireEvent.blur(screen.getByTestId('offset-distance'));

    await waitFor(() => expect(screen.getByTestId('offset-distance')).toHaveValue(6));

    const afterEdit = JSON.parse(window.localStorage.getItem('tile-creator-project-v1') ?? '{}');
    expect(afterEdit.project.primitives).toHaveLength(6);
    const editedOffset = afterEdit.project.primitives.find(
      (primitive: { id: string; kind: string; a?: { y: number } }) =>
        primitive.kind === 'line' && primitive.a?.y === 6
    );
    expect(editedOffset).toBeTruthy();

    fireEvent.pointerDown(canvas, {
      clientX: 850,
      clientY: 850,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    });
    fireEvent.pointerUp(canvas, {
      clientX: 850,
      clientY: 850,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    });

    await waitFor(() => expect(screen.queryByTestId('offset-distance')).not.toBeInTheDocument());
  });
});
