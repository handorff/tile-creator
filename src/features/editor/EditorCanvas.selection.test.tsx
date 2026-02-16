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
        activeStrokeWidth={2}
        zoom={1}
        onZoomChange={vi.fn()}
        onAddPrimitive={vi.fn()}
        onUpdatePrimitive={vi.fn()}
        splitSelectionPrimitiveId={null}
        onSplitLine={vi.fn()}
        onSplitCircle={vi.fn()}
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
        activeStrokeWidth={2}
        zoom={1}
        onZoomChange={vi.fn()}
        onAddPrimitive={vi.fn()}
        onUpdatePrimitive={vi.fn()}
        splitSelectionPrimitiveId="line-1"
        onSplitLine={onSplitLine}
        onSplitCircle={vi.fn()}
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

  it('splits the armed selected circle after two clicks', async () => {
    if (!window.PointerEvent) {
      Object.defineProperty(window, 'PointerEvent', {
        value: MouseEvent,
        writable: true
      });
    }

    const onSplitCircle = vi.fn();
    const { container } = render(
      <EditorCanvas
        tile={{ shape: 'square', size: 100 }}
        primitives={primitives}
        activeTool="select"
        activeColor="#111111"
        activeStrokeWidth={2}
        zoom={1}
        onZoomChange={vi.fn()}
        onAddPrimitive={vi.fn()}
        onUpdatePrimitive={vi.fn()}
        splitSelectionPrimitiveId="circle-1"
        onSplitLine={vi.fn()}
        onSplitCircle={onSplitCircle}
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
      clientX: 570,
      clientY: 550,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    });

    fireEvent.pointerDown(canvas, {
      clientX: 595,
      clientY: 525,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    });

    await waitFor(() => expect(onSplitCircle).toHaveBeenCalledTimes(1));
    expect(onSplitCircle).toHaveBeenCalledWith('circle-1', expect.any(Object), expect.any(Object));
  });

  it('selects and edits an arc with handle drag', async () => {
    if (!window.PointerEvent) {
      Object.defineProperty(window, 'PointerEvent', {
        value: MouseEvent,
        writable: true
      });
    }

    const onSelectionChange = vi.fn();
    const onUpdatePrimitive = vi.fn();
    const { container } = render(
      <EditorCanvas
        tile={{ shape: 'square', size: 100 }}
        primitives={[
          {
            id: 'arc-1',
            kind: 'arc',
            center: { x: 200, y: 200 },
            start: { x: 220, y: 200 },
            end: { x: 200, y: 220 },
            clockwise: true,
            largeArc: false,
            color: '#111111'
          }
        ]}
        activeTool="select"
        activeColor="#111111"
        activeStrokeWidth={2}
        zoom={1}
        onZoomChange={vi.fn()}
        onAddPrimitive={vi.fn()}
        onUpdatePrimitive={onUpdatePrimitive}
        splitSelectionPrimitiveId={null}
        onSplitLine={vi.fn()}
        onSplitCircle={vi.fn()}
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
      clientX: 570,
      clientY: 550,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    });
    await waitFor(() => expect(onSelectionChange).toHaveBeenLastCalledWith(['arc-1']));

    fireEvent.pointerDown(canvas, {
      clientX: 570,
      clientY: 550,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    });
    fireEvent.pointerMove(canvas, {
      clientX: 590,
      clientY: 545,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    });
    fireEvent.pointerUp(canvas, {
      clientX: 590,
      clientY: 545,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    });

    await waitFor(() => expect(onUpdatePrimitive).toHaveBeenCalledTimes(1));
    expect(onUpdatePrimitive).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'arc-1',
        kind: 'arc'
      })
    );
  });

  it('adds an arc after center/start/end clicks', async () => {
    if (!window.PointerEvent) {
      Object.defineProperty(window, 'PointerEvent', {
        value: MouseEvent,
        writable: true
      });
    }

    const onAddPrimitive = vi.fn();
    const { container } = render(
      <EditorCanvas
        tile={{ shape: 'square', size: 100 }}
        primitives={[]}
        activeTool="arc"
        activeColor="#111111"
        activeStrokeWidth={2}
        zoom={1}
        onZoomChange={vi.fn()}
        onAddPrimitive={onAddPrimitive}
        onUpdatePrimitive={vi.fn()}
        splitSelectionPrimitiveId={null}
        onSplitLine={vi.fn()}
        onSplitCircle={vi.fn()}
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
      clientX: 350,
      clientY: 350,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    });
    fireEvent.pointerUp(canvas, {
      clientX: 350,
      clientY: 350,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    });
    fireEvent.pointerDown(canvas, {
      clientX: 450,
      clientY: 350,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    });
    fireEvent.pointerUp(canvas, {
      clientX: 450,
      clientY: 350,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    });
    fireEvent.pointerDown(canvas, {
      clientX: 350,
      clientY: 250,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    });
    fireEvent.pointerUp(canvas, {
      clientX: 350,
      clientY: 250,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    });

    await waitFor(() => expect(onAddPrimitive).toHaveBeenCalledTimes(1));
    expect(onAddPrimitive).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'arc',
        color: '#111111'
      })
    );
  });

  it('cancels arc draft on Escape without adding a primitive', async () => {
    if (!window.PointerEvent) {
      Object.defineProperty(window, 'PointerEvent', {
        value: MouseEvent,
        writable: true
      });
    }

    const onAddPrimitive = vi.fn();
    const { container } = render(
      <EditorCanvas
        tile={{ shape: 'square', size: 100 }}
        primitives={[]}
        activeTool="arc"
        activeColor="#111111"
        activeStrokeWidth={2}
        zoom={1}
        onZoomChange={vi.fn()}
        onAddPrimitive={onAddPrimitive}
        onUpdatePrimitive={vi.fn()}
        splitSelectionPrimitiveId={null}
        onSplitLine={vi.fn()}
        onSplitCircle={vi.fn()}
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
      clientX: 350,
      clientY: 350,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    });
    fireEvent.pointerUp(canvas, {
      clientX: 350,
      clientY: 350,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    });
    fireEvent.pointerDown(canvas, {
      clientX: 450,
      clientY: 350,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    });
    fireEvent.pointerUp(canvas, {
      clientX: 450,
      clientY: 350,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    });

    fireEvent.keyDown(window, { key: 'Escape' });

    fireEvent.pointerDown(canvas, {
      clientX: 350,
      clientY: 250,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    });
    fireEvent.pointerUp(canvas, {
      clientX: 350,
      clientY: 250,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    });

    await waitFor(() => expect(onAddPrimitive).toHaveBeenCalledTimes(0));
  });
});
