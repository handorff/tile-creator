import { describe, expect, it } from 'vitest';
import type { HistoryState } from '../../types/model';
import { buildHistoryTimeline } from './historyTimeline';

function createHistory(overrides: Partial<HistoryState> = {}): HistoryState {
  return {
    past: [],
    future: [],
    ...overrides
  };
}

describe('buildHistoryTimeline', () => {
  it('builds start + past + future rows in oldest-to-newest order', () => {
    const timeline = buildHistoryTimeline(
      createHistory({
        past: [
          { primitives: [], description: 'Add line' },
          { primitives: [], description: 'Add circle' }
        ],
        future: [
          { primitives: [], description: 'Erase 1 shape' },
          { primitives: [], description: 'Edit 1 shape' }
        ]
      })
    );

    expect(timeline.map((item) => item.label)).toEqual([
      'Start',
      'Add line',
      'Add circle',
      'Edit 1 shape',
      'Erase 1 shape'
    ]);
    expect(timeline.map((item) => item.pastLength)).toEqual([0, 1, 2, 3, 4]);
  });

  it('marks the current row and future rows correctly', () => {
    const timeline = buildHistoryTimeline(
      createHistory({
        past: [{ primitives: [], description: 'Add line' }],
        future: [{ primitives: [], description: 'Add circle' }]
      })
    );

    expect(timeline[0]).toMatchObject({ isCurrent: false, isFuture: false });
    expect(timeline[1]).toMatchObject({ isCurrent: true, isFuture: false });
    expect(timeline[2]).toMatchObject({ isCurrent: false, isFuture: true });
  });

  it('marks start as current when fully undone', () => {
    const timeline = buildHistoryTimeline(
      createHistory({
        past: [],
        future: [
          { primitives: [], description: 'Add circle' },
          { primitives: [], description: 'Add line' }
        ]
      })
    );

    expect(timeline[0]).toMatchObject({ label: 'Start', isCurrent: true, isFuture: false });
    expect(timeline[1]).toMatchObject({ isFuture: true });
    expect(timeline[2]).toMatchObject({ isFuture: true });
  });
});
