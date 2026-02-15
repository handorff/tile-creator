import type { Tool } from '../../types/model';

export interface ToolShortcut {
  tool: Tool;
  key: string;
  label: string;
}

export const TOOL_SHORTCUTS: ReadonlyArray<ToolShortcut> = [
  { tool: 'select', key: 'v', label: 'Select' },
  { tool: 'line', key: 'l', label: 'Line' },
  { tool: 'circle', key: 'c', label: 'Circle' },
  { tool: 'split', key: 'x', label: 'Split' },
  { tool: 'pan', key: 'h', label: 'Pan' },
  { tool: 'erase', key: 'e', label: 'Erase' }
];

export const TOOL_SHORTCUT_BY_KEY: Readonly<Record<string, Tool>> = Object.fromEntries(
  TOOL_SHORTCUTS.map((shortcut) => [shortcut.key, shortcut.tool])
) as Record<string, Tool>;

export const SELECTION_SHORTCUTS = {
  duplicate: 'd',
  rotateCcw: 'q',
  rotateCw: 'r'
} as const;

export function formatShortcutKey(key: string): string {
  return key.length === 1 ? key.toUpperCase() : key;
}
