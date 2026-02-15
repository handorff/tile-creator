import {
  Circle as CircleIcon,
  Copy,
  Eraser,
  Hand,
  MousePointer2,
  RotateCcw,
  RotateCw,
  Scissors,
  Slash,
  type LucideIcon
} from 'lucide-react';
import type { TileShape, Tool } from '../../types/model';
import { SELECTION_SHORTCUTS, TOOL_SHORTCUTS, formatShortcutKey } from './shortcuts';

interface ToolbarProps {
  shape: TileShape;
  activeTool: Tool;
  activeColor: string;
  colors: string[];
  canUndo: boolean;
  canRedo: boolean;
  selectedCount: number;
  onShapeChange: (shape: TileShape) => void;
  onToolChange: (tool: Tool) => void;
  onColorChange: (color: string) => void;
  onDuplicateSelection: () => void;
  onRotateSelectionCcw: () => void;
  onRotateSelectionCw: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

const toolIcons: Record<Tool, LucideIcon> = {
  select: MousePointer2,
  line: Slash,
  circle: CircleIcon,
  split: Scissors,
  pan: Hand,
  erase: Eraser
};

export function Toolbar(props: ToolbarProps): JSX.Element {
  const hasSelection = props.selectedCount > 0;
  const rotationStepLabel = props.shape === 'square' ? '90' : '60';

  return (
    <aside className="toolbar">
      <section>
        <h2>Tile</h2>
        <label className="field">
          Shape
          <select
            value={props.shape}
            onChange={(event) => props.onShapeChange(event.target.value as TileShape)}
          >
            <option value="square">Square</option>
            <option value="hex-pointy">Hex (pointy)</option>
          </select>
        </label>
      </section>

      <section>
        <h2>Tools</h2>
        <div className="button-row tool-buttons">
          {TOOL_SHORTCUTS.map((tool) => {
            const ToolIcon = toolIcons[tool.tool];
            return (
              <button
                key={tool.tool}
                type="button"
                aria-label={tool.label}
                title={`${tool.label} tool (${formatShortcutKey(tool.key)})`}
                className={props.activeTool === tool.tool ? 'icon-button active' : 'icon-button'}
                onClick={() => props.onToolChange(tool.tool)}
              >
                <ToolIcon className="toolbar-icon" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h2>Color</h2>
        <div className="color-grid">
          {props.colors.map((color) => (
            <button
              key={color}
              type="button"
              data-testid={`color-${color}`}
              aria-label={`Select color ${color}`}
              className={props.activeColor === color ? 'color active-color' : 'color'}
              style={{ backgroundColor: color }}
              onClick={() => props.onColorChange(color)}
            />
          ))}
        </div>
      </section>

      <section>
        <h2>Selection</h2>
        <div className="button-row selection-buttons">
          <button
            type="button"
            aria-label="Duplicate"
            title={`Duplicate selected primitives (${formatShortcutKey(SELECTION_SHORTCUTS.duplicate)})`}
            className="icon-button"
            onClick={props.onDuplicateSelection}
            disabled={!hasSelection}
          >
            <Copy className="toolbar-icon" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Rotate counterclockwise"
            title={`Rotate selection counterclockwise by ${rotationStepLabel} degrees (${formatShortcutKey(SELECTION_SHORTCUTS.rotateCcw)})`}
            className="icon-button"
            onClick={props.onRotateSelectionCcw}
            disabled={!hasSelection}
          >
            <RotateCcw className="toolbar-icon" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Rotate clockwise"
            title={`Rotate selection clockwise by ${rotationStepLabel} degrees (${formatShortcutKey(SELECTION_SHORTCUTS.rotateCw)})`}
            className="icon-button"
            onClick={props.onRotateSelectionCw}
            disabled={!hasSelection}
          >
            <RotateCw className="toolbar-icon" aria-hidden="true" />
          </button>
        </div>
      </section>

      <section>
        <h2>History</h2>
        <div className="history-controls">
          <button type="button" onClick={props.onUndo} disabled={!props.canUndo}>
            Undo
          </button>
          <button type="button" onClick={props.onRedo} disabled={!props.canRedo}>
            Redo
          </button>
        </div>
      </section>
    </aside>
  );
}
