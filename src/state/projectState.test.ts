import { describe, expect, it } from 'vitest';
import { initialProjectState, projectReducer } from './projectState';

describe('project reducer', () => {
  it('adds primitive and stores history snapshot', () => {
    const state = projectReducer(initialProjectState, {
      type: 'add-primitive',
      primitive: {
        id: 'line-1',
        kind: 'line',
        a: { x: 0, y: 0 },
        b: { x: 10, y: 10 },
        color: '#111'
      }
    });

    expect(state.primitives).toHaveLength(1);
    expect(state.history.past).toHaveLength(1);
    expect(state.history.past[0].description).toBe('Add line');
    expect(state.history.future).toHaveLength(0);
  });

  it('adds multiple primitives in one action and undoes together', () => {
    const state = projectReducer(initialProjectState, {
      type: 'add-primitives',
      primitives: [
        {
          id: 'line-1',
          kind: 'line',
          a: { x: 0, y: 0 },
          b: { x: 10, y: 10 },
          color: '#111'
        },
        {
          id: 'line-2',
          kind: 'line',
          a: { x: 0, y: 10 },
          b: { x: 10, y: 0 },
          color: '#222'
        }
      ]
    });

    expect(state.primitives).toHaveLength(2);
    expect(state.history.past).toHaveLength(1);

    const undone = projectReducer(state, { type: 'undo' });
    expect(undone.primitives).toHaveLength(0);
  });

  it('erases primitive', () => {
    const withPrimitive = projectReducer(initialProjectState, {
      type: 'add-primitive',
      primitive: {
        id: 'line-1',
        kind: 'line',
        a: { x: 0, y: 0 },
        b: { x: 10, y: 10 },
        color: '#111'
      }
    });

    const erased = projectReducer(withPrimitive, {
      type: 'erase-primitive',
      id: 'line-1'
    });

    expect(erased.primitives).toHaveLength(0);
  });

  it('erases multiple primitives in one action and undoes together', () => {
    const one = projectReducer(initialProjectState, {
      type: 'add-primitive',
      primitive: {
        id: 'line-1',
        kind: 'line',
        a: { x: 0, y: 0 },
        b: { x: 10, y: 10 },
        color: '#111'
      }
    });
    const two = projectReducer(one, {
      type: 'add-primitive',
      primitive: {
        id: 'line-2',
        kind: 'line',
        a: { x: 0, y: 10 },
        b: { x: 10, y: 0 },
        color: '#222'
      }
    });
    const three = projectReducer(two, {
      type: 'add-primitive',
      primitive: {
        id: 'line-3',
        kind: 'line',
        a: { x: 5, y: 0 },
        b: { x: 5, y: 10 },
        color: '#333'
      }
    });

    const erased = projectReducer(three, {
      type: 'erase-primitives',
      ids: ['line-1', 'line-2']
    });

    expect(erased.primitives.map((primitive) => primitive.id)).toEqual(['line-3']);

    const undone = projectReducer(erased, { type: 'undo' });
    expect(undone.primitives.map((primitive) => primitive.id)).toEqual([
      'line-1',
      'line-2',
      'line-3'
    ]);
  });

  it('undo restores previous primitives', () => {
    const one = projectReducer(initialProjectState, {
      type: 'add-primitive',
      primitive: {
        id: 'line-1',
        kind: 'line',
        a: { x: 0, y: 0 },
        b: { x: 10, y: 10 },
        color: '#111'
      }
    });

    const two = projectReducer(one, {
      type: 'add-primitive',
      primitive: {
        id: 'line-2',
        kind: 'line',
        a: { x: 10, y: 0 },
        b: { x: 0, y: 10 },
        color: '#111'
      }
    });

    const undone = projectReducer(two, { type: 'undo' });
    expect(undone.primitives).toHaveLength(1);
    expect(undone.primitives[0].id).toBe('line-1');
  });

  it('updates primitive geometry and can undo the edit', () => {
    const withPrimitive = projectReducer(initialProjectState, {
      type: 'add-primitive',
      primitive: {
        id: 'line-1',
        kind: 'line',
        a: { x: 0, y: 0 },
        b: { x: 10, y: 10 },
        color: '#111'
      }
    });

    const updated = projectReducer(withPrimitive, {
      type: 'update-primitive',
      primitive: {
        id: 'line-1',
        kind: 'line',
        a: { x: 5, y: 5 },
        b: { x: 20, y: 20 },
        color: '#111'
      }
    });

    expect(updated.primitives[0]).toMatchObject({
      a: { x: 5, y: 5 },
      b: { x: 20, y: 20 }
    });

    const undone = projectReducer(updated, { type: 'undo' });
    expect(undone.primitives[0]).toMatchObject({
      a: { x: 0, y: 0 },
      b: { x: 10, y: 10 }
    });
  });

  it('updates multiple primitives in one action and undoes together', () => {
    const withFirst = projectReducer(initialProjectState, {
      type: 'add-primitive',
      primitive: {
        id: 'line-1',
        kind: 'line',
        a: { x: 0, y: 0 },
        b: { x: 10, y: 0 },
        color: '#111'
      }
    });
    const withSecond = projectReducer(withFirst, {
      type: 'add-primitive',
      primitive: {
        id: 'line-2',
        kind: 'line',
        a: { x: 0, y: 10 },
        b: { x: 10, y: 10 },
        color: '#222'
      }
    });

    const updated = projectReducer(withSecond, {
      type: 'update-primitives',
      primitives: [
        {
          id: 'line-1',
          kind: 'line',
          a: { x: 1, y: 1 },
          b: { x: 11, y: 1 },
          color: '#111'
        },
        {
          id: 'line-2',
          kind: 'line',
          a: { x: 1, y: 11 },
          b: { x: 11, y: 11 },
          color: '#222'
        }
      ]
    });

    expect(updated.primitives[0]).toMatchObject({ a: { x: 1, y: 1 }, b: { x: 11, y: 1 } });
    expect(updated.primitives[1]).toMatchObject({ a: { x: 1, y: 11 }, b: { x: 11, y: 11 } });

    const undone = projectReducer(updated, { type: 'undo' });
    expect(undone.primitives[0]).toMatchObject({ a: { x: 0, y: 0 }, b: { x: 10, y: 0 } });
    expect(undone.primitives[1]).toMatchObject({ a: { x: 0, y: 10 }, b: { x: 10, y: 10 } });
  });

  it('changing tile shape clears primitives safely', () => {
    const withPrimitive = projectReducer(initialProjectState, {
      type: 'add-primitive',
      primitive: {
        id: 'line-1',
        kind: 'line',
        a: { x: 0, y: 0 },
        b: { x: 10, y: 10 },
        color: '#111'
      }
    });

    const changed = projectReducer(withPrimitive, {
      type: 'set-tile-shape',
      shape: 'hex-pointy'
    });

    expect(changed.tile.shape).toBe('hex-pointy');
    expect(changed.primitives).toHaveLength(0);
  });

  it('splits a line into two segments and supports undo', () => {
    const withLine = projectReducer(initialProjectState, {
      type: 'add-primitive',
      primitive: {
        id: 'line-1',
        kind: 'line',
        a: { x: 0, y: 0 },
        b: { x: 10, y: 0 },
        color: '#111'
      }
    });

    const split = projectReducer(withLine, {
      type: 'split-line',
      id: 'line-1',
      point: { x: 4, y: 0 },
      firstId: 'line-1a',
      secondId: 'line-1b'
    });

    expect(split.primitives).toHaveLength(2);
    expect(split.primitives[0]).toMatchObject({ a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
    expect(split.primitives[1]).toMatchObject({ a: { x: 4, y: 0 }, b: { x: 10, y: 0 } });

    const undone = projectReducer(split, { type: 'undo' });
    expect(undone.primitives).toHaveLength(1);
    expect(undone.primitives[0]).toMatchObject({ id: 'line-1' });
  });

  it('does not split when point is at endpoint', () => {
    const withLine = projectReducer(initialProjectState, {
      type: 'add-primitive',
      primitive: {
        id: 'line-1',
        kind: 'line',
        a: { x: 0, y: 0 },
        b: { x: 10, y: 0 },
        color: '#111'
      }
    });

    const split = projectReducer(withLine, {
      type: 'split-line',
      id: 'line-1',
      point: { x: 0, y: 0 },
      firstId: 'line-1a',
      secondId: 'line-1b'
    });

    expect(split.primitives).toHaveLength(1);
    expect(split.primitives[0]).toMatchObject({ id: 'line-1' });
  });

  it('recolors all selected primitives in one history step', () => {
    const withFirst = projectReducer(initialProjectState, {
      type: 'add-primitive',
      primitive: {
        id: 'line-1',
        kind: 'line',
        a: { x: 0, y: 0 },
        b: { x: 10, y: 0 },
        color: '#111'
      }
    });
    const withBoth = projectReducer(withFirst, {
      type: 'add-primitive',
      primitive: {
        id: 'line-2',
        kind: 'line',
        a: { x: 0, y: 10 },
        b: { x: 10, y: 10 },
        color: '#222'
      }
    });

    const recolored = projectReducer(withBoth, {
      type: 'recolor-primitives',
      ids: ['line-1', 'line-2'],
      color: '#abc'
    });

    expect(recolored.primitives.map((primitive) => primitive.color)).toEqual(['#abc', '#abc']);
    expect(recolored.history.past).toHaveLength(withBoth.history.past.length + 1);

    const undone = projectReducer(recolored, { type: 'undo' });
    expect(undone.primitives.map((primitive) => primitive.color)).toEqual(['#111', '#222']);
  });

  it('updates stroke width on selected primitives in one history step', () => {
    const withFirst = projectReducer(initialProjectState, {
      type: 'add-primitive',
      primitive: {
        id: 'line-1',
        kind: 'line',
        a: { x: 0, y: 0 },
        b: { x: 10, y: 0 },
        color: '#111'
      }
    });
    const withBoth = projectReducer(withFirst, {
      type: 'add-primitive',
      primitive: {
        id: 'line-2',
        kind: 'line',
        a: { x: 0, y: 10 },
        b: { x: 10, y: 10 },
        color: '#222'
      }
    });

    const restroked = projectReducer(withBoth, {
      type: 'restroke-primitives',
      ids: ['line-1', 'line-2'],
      strokeWidth: 3.5
    });

    expect(restroked.primitives.map((primitive) => primitive.strokeWidth)).toEqual([3.5, 3.5]);
    expect(restroked.history.past).toHaveLength(withBoth.history.past.length + 1);

    const undone = projectReducer(restroked, { type: 'undo' });
    expect(undone.primitives.map((primitive) => primitive.strokeWidth)).toEqual([2, 2]);
  });

  it('redo reapplies last undone action', () => {
    const one = projectReducer(initialProjectState, {
      type: 'add-primitive',
      primitive: {
        id: 'line-1',
        kind: 'line',
        a: { x: 0, y: 0 },
        b: { x: 10, y: 10 },
        color: '#111'
      }
    });
    const two = projectReducer(one, {
      type: 'add-primitive',
      primitive: {
        id: 'line-2',
        kind: 'line',
        a: { x: 10, y: 0 },
        b: { x: 0, y: 10 },
        color: '#222'
      }
    });

    const undone = projectReducer(two, { type: 'undo' });
    const redone = projectReducer(undone, { type: 'redo' });

    expect(redone.primitives.map((primitive) => primitive.id)).toEqual(['line-1', 'line-2']);
    expect(redone.history.future).toHaveLength(0);
  });

  it('multiple undo then redo replays in order', () => {
    const one = projectReducer(initialProjectState, {
      type: 'add-primitive',
      primitive: {
        id: 'line-1',
        kind: 'line',
        a: { x: 0, y: 0 },
        b: { x: 10, y: 0 },
        color: '#111'
      }
    });
    const two = projectReducer(one, {
      type: 'add-primitive',
      primitive: {
        id: 'line-2',
        kind: 'line',
        a: { x: 0, y: 10 },
        b: { x: 10, y: 10 },
        color: '#222'
      }
    });
    const three = projectReducer(two, {
      type: 'add-primitive',
      primitive: {
        id: 'line-3',
        kind: 'line',
        a: { x: 5, y: 0 },
        b: { x: 5, y: 10 },
        color: '#333'
      }
    });

    const undoneOnce = projectReducer(three, { type: 'undo' });
    const undoneTwice = projectReducer(undoneOnce, { type: 'undo' });
    expect(undoneTwice.primitives.map((primitive) => primitive.id)).toEqual(['line-1']);

    const redoneOnce = projectReducer(undoneTwice, { type: 'redo' });
    expect(redoneOnce.primitives.map((primitive) => primitive.id)).toEqual(['line-1', 'line-2']);

    const redoneTwice = projectReducer(redoneOnce, { type: 'redo' });
    expect(redoneTwice.primitives.map((primitive) => primitive.id)).toEqual([
      'line-1',
      'line-2',
      'line-3'
    ]);
  });

  it('new action after undo clears redo stack', () => {
    const one = projectReducer(initialProjectState, {
      type: 'add-primitive',
      primitive: {
        id: 'line-1',
        kind: 'line',
        a: { x: 0, y: 0 },
        b: { x: 10, y: 10 },
        color: '#111'
      }
    });
    const two = projectReducer(one, {
      type: 'add-primitive',
      primitive: {
        id: 'line-2',
        kind: 'line',
        a: { x: 10, y: 0 },
        b: { x: 0, y: 10 },
        color: '#222'
      }
    });
    const undone = projectReducer(two, { type: 'undo' });
    expect(undone.history.future).toHaveLength(1);

    const afterNewAction = projectReducer(undone, {
      type: 'add-primitive',
      primitive: {
        id: 'line-3',
        kind: 'line',
        a: { x: 3, y: 3 },
        b: { x: 8, y: 8 },
        color: '#333'
      }
    });

    expect(afterNewAction.primitives.map((primitive) => primitive.id)).toEqual(['line-1', 'line-3']);
    expect(afterNewAction.history.future).toHaveLength(0);
  });

  it('redo with empty future is a no-op', () => {
    const state = projectReducer(initialProjectState, { type: 'redo' });
    expect(state).toBe(initialProjectState);
  });

  it('stores concise history descriptions for action types', () => {
    const addOne = projectReducer(initialProjectState, {
      type: 'add-primitive',
      primitive: {
        id: 'line-1',
        kind: 'line',
        a: { x: 0, y: 0 },
        b: { x: 10, y: 10 },
        color: '#111'
      }
    });

    const recolored = projectReducer(addOne, {
      type: 'recolor-primitives',
      ids: ['line-1'],
      color: '#222'
    });

    expect(addOne.history.past[0].description).toBe('Add line');
    expect(recolored.history.past[1].description).toBe('Recolor 1 shape');
  });
});
