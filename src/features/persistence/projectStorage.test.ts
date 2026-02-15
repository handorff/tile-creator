import { describe, expect, it } from 'vitest';
import type { ProjectState } from '../../types/model';
import { deserializeProject, serializeProject } from './projectStorage';

describe('project storage', () => {
  it('loads legacy history and normalizes entries', () => {
    const line = {
      id: 'line-1',
      kind: 'line' as const,
      a: { x: 0, y: 0 },
      b: { x: 10, y: 10 },
      color: '#111'
    };
    const circle = {
      id: 'circle-1',
      kind: 'circle' as const,
      center: { x: 4, y: 4 },
      radius: 2,
      color: '#222'
    };
    const payload = JSON.stringify({
      version: 1,
      project: {
        tile: { shape: 'square', size: 120 },
        primitives: [line, circle],
        activeTool: 'line',
        activeColor: '#111',
        history: {
          past: [[line], [line, circle]]
        }
      },
      pattern: {
        columns: 4,
        rows: 3
      }
    });

    const loaded = deserializeProject(payload);

    expect(loaded.project.history.past).toHaveLength(2);
    expect(loaded.project.history.future).toEqual([]);
    expect(loaded.project.history.past[0].description).toBe('Imported history step');
    expect(loaded.project.history.past[1].primitives.map((primitive) => primitive.id)).toEqual([
      'line-1',
      'circle-1'
    ]);
  });

  it('round-trips projects using new history format', () => {
    const project: ProjectState = {
      tile: { shape: 'square', size: 120 },
      primitives: [],
      activeTool: 'line',
      activeColor: '#111',
      history: {
        past: [
          {
            primitives: [],
            description: 'Add line'
          }
        ],
        future: [
          {
            primitives: [],
            description: 'Add line'
          }
        ]
      }
    };
    const pattern = { columns: 2, rows: 3 };

    const serialized = serializeProject(project, pattern);
    const loaded = deserializeProject(serialized);

    expect(loaded.project).toEqual(project);
    expect(loaded.pattern).toEqual(pattern);
  });

  it('normalizes legacy split tool to select', () => {
    const payload = JSON.stringify({
      version: 1,
      project: {
        tile: { shape: 'square', size: 120 },
        primitives: [],
        activeTool: 'split',
        activeColor: '#111',
        history: {
          past: []
        }
      },
      pattern: {
        columns: 4,
        rows: 3
      }
    });

    const loaded = deserializeProject(payload);
    expect(loaded.project.activeTool).toBe('select');
  });
});
