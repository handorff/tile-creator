import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Toolbar } from './Toolbar';

function buildToolbarProps() {
  return {
    shape: 'square' as const,
    activeTool: 'line' as const,
    activeColor: '#111',
    colors: ['#111', '#222'],
    canUndo: false,
    canRedo: false,
    selectedCount: 1,
    canSplitSelection: true,
    splitSelectionArmed: false,
    onShapeChange: vi.fn(),
    onToolChange: vi.fn(),
    onColorChange: vi.fn(),
    onDuplicateSelection: vi.fn(),
    onSplitSelection: vi.fn(),
    onRotateSelectionCcw: vi.fn(),
    onRotateSelectionCw: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn()
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
