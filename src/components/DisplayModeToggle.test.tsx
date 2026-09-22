import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { config } from '@/lib/config';
import { type ProjectItem } from '@/lib/types';
import { useAppStore } from '@/store/store';

import { DisplayModeToggle } from './DisplayModeToggle';

// #396: the drafting settings toggle gains Chapter as a third option. Switching only changes how
// the chapter is presented, so these tests assert the selection, never any content mutation.

function renderToggle() {
  render(<DisplayModeToggle />);
  return { user: userEvent.setup() };
}

function toggle() {
  return screen.getByRole('radiogroup', { name: /display/i });
}

function focusedRadios() {
  return screen.getAllByRole('radio').filter(radio => radio === document.activeElement);
}

describe('DisplayModeToggle', () => {
  const initialFeatureFlag = config.features.rtePericope;
  afterEach(() => {
    config.features.rtePericope = initialFeatureFlag;
  });

  beforeEach(() => {
    config.features.rtePericope = true;
    useAppStore.setState({
      displayMode: 'verse',
      currentProjectItem: { chapterAssignmentId: 396 } as ProjectItem,
      chapterViewAvailability: { chapterAssignmentId: 396, available: true },
    });
  });

  it('blocks Chapter while the chapter is missing, loading, or incomplete', async () => {
    useAppStore.setState({ chapterViewAvailability: null });
    const { user } = renderToggle();
    const chapter = screen.getByRole('radio', { name: 'Chapter' });
    expect(chapter).toHaveAttribute('aria-disabled', 'true');
    await user.click(chapter);
    expect(useAppStore.getState().displayMode).toBe('verse');
    act(() => chapter.focus());
    await user.keyboard('{Enter} ');
    expect(useAppStore.getState().displayMode).toBe('verse');
  });

  it('explains the disabled option on hover and focus', async () => {
    useAppStore.setState({
      chapterViewAvailability: { chapterAssignmentId: 396, available: false },
    });
    const { user } = renderToggle();
    const chapter = screen.getByRole('radio', { name: 'Chapter' });
    const explanation = 'Chapter view is available once all verses have content.';
    await user.hover(chapter);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(explanation);
    await user.unhover(chapter);
    await user.tab();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(chapter).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(explanation);
    expect(toggle()).toHaveAccessibleDescription(explanation);
  });

  it('lets arrows focus disabled Chapter for its explanation without selecting it', async () => {
    useAppStore.setState({ chapterViewAvailability: null });
    const { user } = renderToggle();
    await user.tab();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Chapter' })).toHaveFocus();
    expect(useAppStore.getState().displayMode).toBe('pericope');
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Chapter view is available once all verses have content.'
    );
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Verse' })).toHaveFocus();
    expect(useAppStore.getState().displayMode).toBe('verse');
  });

  it('ignores availability published for another assignment', () => {
    useAppStore.setState({
      chapterViewAvailability: { chapterAssignmentId: 397, available: true },
    });
    renderToggle();
    expect(screen.getByRole('radio', { name: 'Chapter' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('restores a tab stop when a saved Chapter preference is unavailable', async () => {
    useAppStore.setState({ displayMode: 'chapter', chapterViewAvailability: null });
    const { user } = renderToggle();
    await user.tab();
    expect(screen.getByRole('radio', { name: 'Verse' })).toHaveFocus();
  });

  it('updates the option when local content becomes complete and then empty', async () => {
    useAppStore.setState({ chapterViewAvailability: null });
    const { user } = renderToggle();
    expect(screen.getByRole('radio', { name: 'Chapter' })).toHaveAttribute('aria-disabled', 'true');
    act(() =>
      useAppStore
        .getState()
        .setChapterViewAvailability({ chapterAssignmentId: 396, available: true })
    );
    await user.click(screen.getByRole('radio', { name: 'Chapter' }));
    expect(useAppStore.getState().displayMode).toBe('chapter');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    act(() =>
      useAppStore
        .getState()
        .setChapterViewAvailability({ chapterAssignmentId: 396, available: false })
    );
    expect(screen.getByRole('radio', { name: 'Chapter' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('explains when the Chapter editor is not enabled in this environment', async () => {
    config.features.rtePericope = false;
    useAppStore.setState({ chapterViewAvailability: null });
    const { user } = renderToggle();
    await user.hover(screen.getByRole('radio', { name: 'Chapter' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Chapter view is not available in this environment.'
    );
  });

  it('offers exactly the three views, in order', () => {
    renderToggle();

    const options = screen.getAllByRole('radio').map(option => option.textContent);
    expect(options).toEqual(['Verse', 'Pericope', 'Chapter']);
  });

  it('is labelled "Display", not "Scripture Display"', () => {
    renderToggle();

    expect(screen.getByText('Display')).toBeInTheDocument();
    expect(screen.queryByText('Scripture Display')).not.toBeInTheDocument();
  });

  it('takes the group name from the visible label rather than repeating it', () => {
    renderToggle();

    expect(toggle()).toHaveAccessibleName('Display');
    expect(toggle()).not.toHaveAttribute('aria-label');
  });

  it('marks the active view and no other', () => {
    useAppStore.setState({ displayMode: 'pericope' });
    renderToggle();

    const checked = screen
      .getAllByRole('radio')
      .filter(option => option.getAttribute('aria-checked') === 'true')
      .map(option => option.textContent);
    expect(checked).toEqual(['Pericope']);
  });

  it('selects chapter view, which is the entry point to the chapter surface', async () => {
    const { user } = renderToggle();

    await user.click(screen.getByRole('radio', { name: 'Chapter' }));

    expect(useAppStore.getState().displayMode).toBe('chapter');
  });

  it('still switches between the two original views', async () => {
    useAppStore.setState({ displayMode: 'chapter' });
    const { user } = renderToggle();

    await user.click(screen.getByRole('radio', { name: 'Verse' }));
    expect(useAppStore.getState().displayMode).toBe('verse');

    await user.click(screen.getByRole('radio', { name: 'Pericope' }));
    expect(useAppStore.getState().displayMode).toBe('pericope');
  });

  it('groups the options so a screen reader announces one control, not three buttons', () => {
    renderToggle();

    expect(toggle()).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  // The keyboard half of the radio group pattern: one tab stop, arrows move between the options.

  it('keeps only the checked option in the tab order', () => {
    useAppStore.setState({ displayMode: 'pericope' });
    renderToggle();

    const tabStops = screen.getAllByRole('radio').map(option => option.getAttribute('tabindex'));
    expect(tabStops).toEqual(['-1', '0', '-1']);
  });

  it('is a single tab stop for the whole group, not three', async () => {
    const { user } = renderToggle();

    await user.tab();
    expect(screen.getByRole('radio', { name: 'Verse' })).toHaveFocus();

    // Tabbing again leaves the group. With three loose buttons it would land on "Pericope".
    await user.tab();
    expect(focusedRadios()).toEqual([]);
  });

  it('enters the group at the checked option', async () => {
    useAppStore.setState({ displayMode: 'chapter' });
    const { user } = renderToggle();

    await user.tab();

    expect(screen.getByRole('radio', { name: 'Chapter' })).toHaveFocus();
  });

  it('moves focus and the selection together with the arrow keys', async () => {
    const { user } = renderToggle();
    await user.tab();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Pericope' })).toHaveFocus();
    expect(useAppStore.getState().displayMode).toBe('pericope');

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Chapter' })).toHaveFocus();
    expect(useAppStore.getState().displayMode).toBe('chapter');

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'Pericope' })).toHaveFocus();
    expect(useAppStore.getState().displayMode).toBe('pericope');
  });

  it('navigates on the vertical axis too', async () => {
    const { user } = renderToggle();
    await user.tab();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: 'Pericope' })).toHaveFocus();
    expect(useAppStore.getState().displayMode).toBe('pericope');

    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('radio', { name: 'Verse' })).toHaveFocus();
    expect(useAppStore.getState().displayMode).toBe('verse');
  });

  it('wraps around at both ends', async () => {
    useAppStore.setState({ displayMode: 'chapter' });
    const { user } = renderToggle();
    await user.tab();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Verse' })).toHaveFocus();
    expect(useAppStore.getState().displayMode).toBe('verse');

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'Chapter' })).toHaveFocus();
    expect(useAppStore.getState().displayMode).toBe('chapter');
  });
});
