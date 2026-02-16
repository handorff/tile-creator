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
import type { HistoryTimelineItem } from './historyTimeline';
import type { TileShape, Tool } from '../../types/model';
import { SELECTION_SHORTCUTS, TOOL_SHORTCUTS, formatShortcutKey } from './shortcuts';

interface ToolbarProps {
  shape: TileShape;
  activeTool: Tool;
  activeColor: string | null;
  activeStrokeWidth: number | null;
  visibleColors: string[];
  colors: string[];
  canUndo: boolean;
  canRedo: boolean;
  historyTimeline: HistoryTimelineItem[];
  selectedCount: number;
  canSplitSelection: boolean;
  splitSelectionArmed: boolean;
  onShapeChange: (shape: TileShape) => void;
  onToolChange: (tool: Tool) => void;
  onColorChange: (color: string) => void;
  onStrokeWidthChange: (strokeWidth: number) => void;
  onColorVisibilityChange: (color: string, visible: boolean) => void;
  onAllColorsVisibilityChange: (visible: boolean) => void;
  onOnlyVisibleColor: (color: string) => void;
  onDuplicateSelection: () => void;
  onSplitSelection: () => void;
  onRotateSelectionCcw: () => void;
  onRotateSelectionCw: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onHistoryJump: (pastLength: number) => void;
}

const toolIcons: Record<Tool, LucideIcon> = {
  select: MousePointer2,
  line: Slash,
  circle: CircleIcon,
  pan: Hand,
  erase: Eraser
};
const STROKE_OPTIONS = [0.5, 1, 2, 4] as const;

export function Toolbar(props: ToolbarProps): JSX.Element {
  const hasSelection = props.selectedCount > 0;
  const rotationStepLabel = props.shape === 'square' ? '90' : '60';
  const visibleColors = new Set(props.visibleColors);
  const allVisible = props.colors.length > 0 && props.colors.every((color) => visibleColors.has(color));
  const allHidden = props.colors.length > 0 && props.colors.every((color) => !visibleColors.has(color));

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
        <h2>Stroke Weight</h2>
        <div className="button-row stroke-buttons">
          {STROKE_OPTIONS.map((strokeWidth) => (
            <button
              key={strokeWidth}
              type="button"
              data-testid={`stroke-width-${strokeWidth}`}
              className={props.activeStrokeWidth === strokeWidth ? 'active' : undefined}
              onClick={() => props.onStrokeWidthChange(strokeWidth)}
            >
              {strokeWidth}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Visibility</h2>
        <div className="visibility-all-controls">
          <span>All colors</span>
          <div className="segmented-control" role="group" aria-label="Toggle all colors visibility">
            <button
              type="button"
              data-testid="visibility-all-on"
              className={allVisible ? 'segmented-button active' : 'segmented-button'}
              aria-pressed={allVisible}
              onClick={() => props.onAllColorsVisibilityChange(true)}
            >
              On
            </button>
            <button
              type="button"
              data-testid="visibility-all-off"
              className={allHidden ? 'segmented-button active' : 'segmented-button'}
              aria-pressed={allHidden}
              onClick={() => props.onAllColorsVisibilityChange(false)}
            >
              Off
            </button>
          </div>
        </div>
        <div className="visibility-list">
          {props.colors.map((color) => (
            <div key={`visibility-${color}`} className="visibility-item">
              <span className="visibility-label" aria-hidden="true">
                <span
                  className="visibility-swatch"
                  style={{ backgroundColor: color }}
                />
              </span>
              <div className="visibility-actions">
                <div className="segmented-control" role="group" aria-label={`Toggle color ${color}`}>
                  <button
                    type="button"
                    data-testid={`visibility-on-${color}`}
                    className={visibleColors.has(color) ? 'segmented-button active' : 'segmented-button'}
                    aria-pressed={visibleColors.has(color)}
                    onClick={() => props.onColorVisibilityChange(color, true)}
                  >
                    On
                  </button>
                  <button
                    type="button"
                    data-testid={`visibility-off-${color}`}
                    className={!visibleColors.has(color) ? 'segmented-button active' : 'segmented-button'}
                    aria-pressed={!visibleColors.has(color)}
                    onClick={() => props.onColorVisibilityChange(color, false)}
                  >
                    Off
                  </button>
                </div>
                <button
                  type="button"
                  data-testid={`visibility-only-${color}`}
                  aria-label={`Show only color ${color}`}
                  className="visibility-only-button"
                  onClick={() => props.onOnlyVisibleColor(color)}
                >
                  Only
                </button>
              </div>
            </div>
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
            aria-label="Split"
            title={`Split selected line (${formatShortcutKey(SELECTION_SHORTCUTS.split)})`}
            className={props.splitSelectionArmed ? 'icon-button active' : 'icon-button'}
            onClick={props.onSplitSelection}
            disabled={!props.canSplitSelection}
          >
            <Scissors className="toolbar-icon" aria-hidden="true" />
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
        <div className="history-header">
          <h2>History</h2>
          <div className="history-controls">
            <button type="button" onClick={props.onUndo} disabled={!props.canUndo}>
              Undo
            </button>
            <button type="button" onClick={props.onRedo} disabled={!props.canRedo}>
              Redo
            </button>
          </div>
        </div>
        <div className="history-timeline" role="list" aria-label="History timeline">
          {props.historyTimeline.map((item) => (
            <button
              key={item.pastLength}
              type="button"
              data-testid={`history-step-${item.pastLength}`}
              className={`history-timeline-item${item.isCurrent ? ' current' : ''}${item.isFuture ? ' future' : ''}`}
              aria-current={item.isCurrent ? 'step' : undefined}
              onClick={() => props.onHistoryJump(item.pastLength)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}
