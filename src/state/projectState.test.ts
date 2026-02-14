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
});
