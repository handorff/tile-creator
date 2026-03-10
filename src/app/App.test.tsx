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

  it('renders the preview zoom control below pattern options and updates the preview viewBox', () => {
    render(<App />);

    const optionsHeading = screen.getByRole('heading', { name: 'Pattern options' });
    const zoomHeading = screen.getByRole('heading', { name: 'Preview Zoom' });
    const exportHeading = screen.getByRole('heading', { name: 'Export' });

    expect(optionsHeading.compareDocumentPosition(zoomHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(zoomHeading.compareDocumentPosition(exportHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );

    const preview = screen.getByTestId('tiling-preview');
    const initialViewBox = preview.getAttribute('viewBox');

    fireEvent.change(screen.getByTestId('pattern-preview-zoom'), { target: { value: '2' } });

    expect(screen.getByText('2.0x')).toBeInTheDocument();
    expect(preview.getAttribute('viewBox')).not.toBe(initialViewBox);
  });

  it('allows panning the pattern preview by dragging the canvas', async () => {
    render(<App />);

    const preview = screen.getByTestId('tiling-preview');
    Object.defineProperty(preview, 'getBoundingClientRect', {
      configurable: true,
      value: vi.fn(() => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 400,
        bottom: 300,
        width: 400,
        height: 300,
        toJSON: () => ({})
      }))
    });

    const initialViewBox = preview.getAttribute('viewBox');

    fireEvent.pointerDown(preview, {
      clientX: 120,
      clientY: 100,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    });

    await waitFor(() => expect(preview).toHaveClass('panning'));

    fireEvent.pointerMove(preview, {
      clientX: 180,
      clientY: 140,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    });

    await waitFor(() => expect(preview.getAttribute('viewBox')).not.toBe(initialViewBox));

    fireEvent.pointerUp(preview, {
      clientX: 180,
      clientY: 140,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    });
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
    expect(screen.queryByRole('dialog', { name: 'Choose Tile Shape' })).not.toBeInTheDocument();
  });

  it('renders animated gif export button', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: 'Export Animated GIF' })).toBeInTheDocument();
  });

  it('renders button to open the preset gallery modal', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: 'Open Gallery' })).toBeInTheDocument();
  });

  it('disables gif export button while exporting and re-enables it after success', async () => {
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

    resolveExport?.(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/gif' }));

    await waitFor(() => expect(exportButton).not.toBeDisabled());
    expect(downloadBlobMock).toHaveBeenCalledWith('tile-history.gif', expect.any(Blob));
  });

  it('re-enables gif export button when export fails', async () => {
    buildAnimatedGifMock.mockRejectedValue(new Error('GIF export failed.'));

    render(<App />);

    const exportButton = screen.getByRole('button', { name: 'Export Animated GIF' });
    fireEvent.click(exportButton);

    await waitFor(() => expect(exportButton).not.toBeDisabled());
    expect(downloadBlobMock).not.toHaveBeenCalled();
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
    expect(screen.getByTestId('offset-distance')).toHaveValue('12');

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

    await waitFor(() => {
      const movedPreview = Array.from(container.querySelectorAll('.selected-primitive')).some((element) => {
        if (element.tagName.toLowerCase() !== 'line') {
          return false;
        }

        return element.getAttribute('y1') === '6' && element.getAttribute('y2') === '6';
      });

      expect(movedPreview).toBe(true);
    });

    const beforeCommit = JSON.parse(window.localStorage.getItem('tile-creator-project-v1') ?? '{}');
    const uncommittedOffset = beforeCommit.project.primitives.find(
      (primitive: { id: string; kind: string; a?: { y: number } }) =>
        primitive.kind === 'line' && primitive.a?.y === 6
    );
    expect(uncommittedOffset).toBeFalsy();

    fireEvent.blur(screen.getByTestId('offset-distance'));

    await waitFor(() => expect(screen.getByTestId('offset-distance')).toHaveValue('6'));

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

  it('creates radial spokes, previews count changes, and clears the editor when deselected', async () => {
    storeProject({
      tile: { shape: 'square', size: 120 },
      primitives: [
        {
          id: 'circle-1',
          kind: 'circle',
          center: { x: 0, y: 0 },
          radius: 40,
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
    await waitFor(() => expect(container.querySelectorAll('.selected-primitive')).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: 'Radial Split' }));

    await waitFor(() => expect(container.querySelectorAll('.selected-primitive')).toHaveLength(8));
    expect(screen.getByTestId('radial-split-count')).toHaveValue('8');

    const afterCreate = JSON.parse(window.localStorage.getItem('tile-creator-project-v1') ?? '{}');
    expect(afterCreate.project.primitives).toHaveLength(9);
    const createdSpokes = afterCreate.project.primitives.filter(
      (primitive: { kind: string; id: string }) => primitive.kind === 'line'
    );
    expect(createdSpokes).toHaveLength(8);

    fireEvent.change(screen.getByTestId('radial-split-count'), { target: { value: '6' } });

    await waitFor(() => expect(container.querySelectorAll('.selected-primitive')).toHaveLength(6));

    const beforeCommit = JSON.parse(window.localStorage.getItem('tile-creator-project-v1') ?? '{}');
    const uncommittedSpokes = beforeCommit.project.primitives.filter(
      (primitive: { kind: string }) => primitive.kind === 'line'
    );
    expect(uncommittedSpokes).toHaveLength(8);

    fireEvent.blur(screen.getByTestId('radial-split-count'));

    await waitFor(() => expect(screen.getByTestId('radial-split-count')).toHaveValue('6'));

    const afterEdit = JSON.parse(window.localStorage.getItem('tile-creator-project-v1') ?? '{}');
    expect(afterEdit.project.primitives).toHaveLength(7);
    const editedSpokes = afterEdit.project.primitives.filter(
      (primitive: { kind: string }) => primitive.kind === 'line'
    );
    expect(editedSpokes).toHaveLength(6);

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

    await waitFor(() => expect(screen.queryByTestId('radial-split-count')).not.toBeInTheDocument());
  });
});
