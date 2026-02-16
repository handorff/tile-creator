import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Toolbar } from './Toolbar';

function buildToolbarProps() {
  return {
    shape: 'square' as const,
    activeTool: 'line' as const,
    activeColor: '#111',
    activeStrokeWidth: 2,
    visibleColors: ['#111', '#222'],
    colors: ['#111', '#222'],
    canUndo: false,
    canRedo: false,
    historyTimeline: [
      { pastLength: 0, label: 'Start', isCurrent: true, isFuture: false }
    ],
    selectedCount: 1,
    canSplitSelection: true,
    splitSelectionArmed: false,
    onShapeChange: vi.fn(),
    onToolChange: vi.fn(),
    onColorChange: vi.fn(),
    onStrokeWidthChange: vi.fn(),
    onColorVisibilityChange: vi.fn(),
    onAllColorsVisibilityChange: vi.fn(),
    onOnlyVisibleColor: vi.fn(),
    onDuplicateSelection: vi.fn(),
    onSplitSelection: vi.fn(),
    onRotateSelectionCcw: vi.fn(),
    onRotateSelectionCw: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onHistoryJump: vi.fn()
  };
}

describe('Toolbar', () => {
  it('calls color callback when swatch is clicked', () => {
    const props = buildToolbarProps();

    render(<Toolbar {...props} onColorChange={props.onColorChange} />);

    fireEvent.click(screen.getByTestId('color-#222'));
    expect(props.onColorChange).toHaveBeenCalledWith('#222');
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    expect(props.onDuplicateSelection).toHaveBeenCalledTimes(1);
  });

  it('calls stroke-width callback when button is clicked', () => {
    const props = buildToolbarProps();
    const view = render(<Toolbar {...props} onStrokeWidthChange={props.onStrokeWidthChange} />);

    fireEvent.click(within(view.container).getByTestId('stroke-width-4'));
    expect(props.onStrokeWidthChange).toHaveBeenCalledWith(4);
  });

  it('calls color visibility callback when segmented control is changed to off', () => {
    const props = buildToolbarProps();

    const view = render(<Toolbar {...props} onColorVisibilityChange={props.onColorVisibilityChange} />);

    fireEvent.click(within(view.container).getByTestId('visibility-off-#222'));

    expect(props.onColorVisibilityChange).toHaveBeenCalledWith('#222', false);
  });

  it('calls color visibility callback when segmented control is changed to on', () => {
    const props = buildToolbarProps();
    const view = render(
      <Toolbar
        {...props}
        visibleColors={['#111']}
        onColorVisibilityChange={props.onColorVisibilityChange}
      />
    );

    fireEvent.click(within(view.container).getByTestId('visibility-on-#222'));

    expect(props.onColorVisibilityChange).toHaveBeenCalledWith('#222', true);
  });

  it('calls all-colors visibility callback from segmented control', () => {
    const props = buildToolbarProps();
    const view = render(
      <Toolbar {...props} onAllColorsVisibilityChange={props.onAllColorsVisibilityChange} />
    );

    fireEvent.click(within(view.container).getByTestId('visibility-all-off'));
    expect(props.onAllColorsVisibilityChange).toHaveBeenCalledWith(false);

    fireEvent.click(within(view.container).getByTestId('visibility-all-on'));
    expect(props.onAllColorsVisibilityChange).toHaveBeenCalledWith(true);
  });

  it('calls only-visible callback when only button is clicked', () => {
    const props = buildToolbarProps();
    const view = render(<Toolbar {...props} onOnlyVisibleColor={props.onOnlyVisibleColor} />);

    fireEvent.click(within(view.container).getByTestId('visibility-only-#222'));

    expect(props.onOnlyVisibleColor).toHaveBeenCalledWith('#222');
  });

  it('shows a checked state when a color is visible', () => {
    const props = buildToolbarProps();
    const view = render(<Toolbar {...props} visibleColors={['#111']} />);

    expect(within(view.container).getByTestId('visibility-on-#111')).toHaveClass('active');
    expect(within(view.container).getByTestId('visibility-off-#111')).not.toHaveClass('active');
    expect(within(view.container).getByTestId('visibility-on-#222')).not.toHaveClass('active');
    expect(within(view.container).getByTestId('visibility-off-#222')).toHaveClass('active');
  });

  it('does not highlight color or stroke weight when active values are null', () => {
    const props = buildToolbarProps();
    const view = render(<Toolbar {...props} activeColor={null} activeStrokeWidth={null} />);

    expect(within(view.container).getByTestId('color-#111')).not.toHaveClass('active-color');
    expect(within(view.container).getByTestId('stroke-width-2')).not.toHaveClass('active');
  });

  it('highlights color independently from stroke weight', () => {
    const props = buildToolbarProps();
    const view = render(<Toolbar {...props} activeColor="#111" activeStrokeWidth={null} />);

    expect(within(view.container).getByTestId('color-#111')).toHaveClass('active-color');
    expect(within(view.container).getByTestId('stroke-width-2')).not.toHaveClass('active');
  });

  it('calls color visibility callback with true when enabling hidden color', () => {
    const props = buildToolbarProps();
    const view = render(
      <Toolbar
        {...props}
        visibleColors={['#111']}
        onColorVisibilityChange={props.onColorVisibilityChange}
      />
    );

    fireEvent.click(within(view.container).getByTestId('visibility-on-#222'));

    expect(props.onColorVisibilityChange).toHaveBeenCalledWith('#222', true);
  });

  it('renders visibility section separately from color section', () => {
    const props = buildToolbarProps();
    const view = render(<Toolbar {...props} />);

    expect(within(view.container).getByRole('heading', { name: 'Color' })).toBeInTheDocument();
    expect(within(view.container).getByRole('heading', { name: 'Visibility' })).toBeInTheDocument();
    expect(within(view.container).queryByTestId('visible-color')).toBeNull();
    expect(within(view.container).getByText('All colors')).toBeInTheDocument();
    expect(within(view.container).queryByText('#111')).toBeNull();
    expect(within(view.container).queryByText('#222')).toBeNull();
  });

  it('disables undo/redo buttons from props', () => {
    const props = buildToolbarProps();
    const view = render(<Toolbar {...props} />);

    expect(within(view.container).getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(within(view.container).getByRole('button', { name: 'Redo' })).toBeDisabled();
  });

  it('calls redo callback', () => {
    const props = buildToolbarProps();
    const view = render(<Toolbar {...props} canRedo onRedo={props.onRedo} />);

    fireEvent.click(within(view.container).getByRole('button', { name: 'Redo' }));
    expect(props.onRedo).toHaveBeenCalledTimes(1);
  });

  it('renders history timeline including start and current row', () => {
    const props = buildToolbarProps();
    const view = render(
      <Toolbar
        {...props}
        historyTimeline={[
          { pastLength: 0, label: 'Start', isCurrent: false, isFuture: false },
          { pastLength: 1, label: 'Add line', isCurrent: true, isFuture: false }
        ]}
      />
    );

    expect(within(view.container).getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(within(view.container).getByRole('button', { name: 'Add line' })).toHaveClass('current');
    expect(within(view.container).getByRole('button', { name: 'Add line' })).toHaveAttribute(
      'aria-current',
      'step'
    );
  });

  it('shows future timeline rows and allows jumping to them', () => {
    const props = buildToolbarProps();
    const view = render(
      <Toolbar
        {...props}
        historyTimeline={[
          { pastLength: 0, label: 'Start', isCurrent: false, isFuture: false },
          { pastLength: 1, label: 'Add line', isCurrent: true, isFuture: false },
          { pastLength: 2, label: 'Add circle', isCurrent: false, isFuture: true }
        ]}
      />
    );

    const futureStep = within(view.container).getByTestId('history-step-2');
    expect(futureStep).toHaveClass('future');

    fireEvent.click(futureStep);
    expect(props.onHistoryJump).toHaveBeenCalledWith(2);
  });

  it('shows shortcut titles for tool and selection buttons', () => {
    const props = buildToolbarProps();

    const view = render(<Toolbar {...props} />);

    expect(within(view.container).getByRole('button', { name: 'Line' })).toHaveAttribute(
      'title',
      'Line tool (L)'
    );
    expect(within(view.container).getByRole('button', { name: 'Duplicate' })).toHaveAttribute(
      'title',
      'Duplicate selected primitives (D)'
    );
    expect(within(view.container).getByRole('button', { name: 'Split' })).toHaveAttribute(
      'title',
      'Split selected line (X)'
    );
  });

  it('disables split when selection cannot be split', () => {
    const props = buildToolbarProps();
    const view = render(<Toolbar {...props} canSplitSelection={false} />);

    const splitButton = within(view.container).getByRole('button', { name: 'Split' });
    expect(splitButton).toBeDisabled();

    fireEvent.click(splitButton);
    expect(props.onSplitSelection).not.toHaveBeenCalled();
  });
});
