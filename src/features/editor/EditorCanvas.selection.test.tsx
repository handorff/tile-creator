import { fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Primitive } from '../../types/model';
import { EditorCanvas } from './EditorCanvas';

const primitives: Primitive[] = [
  {
    id: 'line-1',
    kind: 'line',
    a: { x: 20, y: 20 },
    b: { x: 80, y: 20 },
    color: '#111111'
  },
  {
    id: 'circle-1',
    kind: 'circle',
    center: { x: 200, y: 200 },
    radius: 20,
    color: '#222222'
  }
];

describe('EditorCanvas selection', () => {
  it('adds and removes items with shift+click', async () => {
    if (!window.PointerEvent) {
      Object.defineProperty(window, 'PointerEvent', {
        value: MouseEvent,
        writable: true
      });
    }

    const onSelectionChange = vi.fn();
    const { container } = render(
      <EditorCanvas
        tile={{ shape: 'square', size: 100 }}
        primitives={primitives}
        activeTool="select"
        activeColor="#111111"
        zoom={1}
        onZoomChange={vi.fn()}
        onAddPrimitive={vi.fn()}
        onUpdatePrimitive={vi.fn()}
        splitSelectionLineId={null}
        onSplitLine={vi.fn()}
        onErasePrimitive={vi.fn()}
        onErasePrimitives={vi.fn()}
        onSelectionChange={onSelectionChange}
      />
    );

    const canvas = container.querySelector('svg');
    expect(canvas).not.toBeNull();
    if (!canvas) {
      return;
    }
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 700, 700));

    fireEvent.pointerDown(canvas, {
      clientX: 380,
      clientY: 370,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    });
    await waitFor(() => expect(onSelectionChange).toHaveBeenLastCalledWith(['line-1']));

    fireEvent.pointerDown(canvas, {
      clientX: 570,
      clientY: 550,
      button: 0,
      shiftKey: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    });
    await waitFor(() =>
      expect(onSelectionChange).toHaveBeenLastCalledWith(['line-1', 'circle-1'])
    );

    fireEvent.pointerDown(canvas, {
      clientX: 380,
      clientY: 370,
      button: 0,
      shiftKey: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    });
    await waitFor(() => expect(onSelectionChange).toHaveBeenLastCalledWith(['circle-1']));

    fireEvent.pointerDown(canvas, {
      clientX: 850,
      clientY: 850,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    });
    await waitFor(() => expect(onSelectionChange).toHaveBeenLastCalledWith([]));
  });

  it('splits the armed selected line when clicking a split point', async () => {
    if (!window.PointerEvent) {
      Object.defineProperty(window, 'PointerEvent', {
        value: MouseEvent,
        writable: true
      });
    }

    const onSplitLine = vi.fn();
    const { container } = render(
      <EditorCanvas
        tile={{ shape: 'square', size: 100 }}
        primitives={primitives}
        activeTool="select"
        activeColor="#111111"
        zoom={1}
        onZoomChange={vi.fn()}
        onAddPrimitive={vi.fn()}
        onUpdatePrimitive={vi.fn()}
        splitSelectionLineId="line-1"
        onSplitLine={onSplitLine}
        onErasePrimitive={vi.fn()}
        onErasePrimitives={vi.fn()}
        onSelectionChange={vi.fn()}
      />
    );

    const canvas = container.querySelector('svg');
    expect(canvas).not.toBeNull();
    if (!canvas) {
      return;
    }
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 700, 700));

    fireEvent.pointerDown(canvas, {
      clientX: 380,
      clientY: 370,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    });

    await waitFor(() => expect(onSplitLine).toHaveBeenCalledTimes(1));
    expect(onSplitLine).toHaveBeenCalledWith('line-1', expect.any(Object));
  });
});
