import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/store';

import { DisplayModeToggle } from './DisplayModeToggle';

// #396: the drafting settings toggle gains Chapter as a third option. Switching only changes how
// the chapter is presented, so these tests assert the selection, never any content mutation.

function openModal() {
  render(<DisplayModeToggle />);
  return { user: userEvent.setup() };
}

function toggle() {
  return screen.getByRole('radiogroup', { name: /display/i });
}

describe('DisplayModeToggle', () => {
  beforeEach(() => {
    useAppStore.setState({ displayMode: 'verse' });
  });

  it('offers exactly the three views, in order', () => {
    openModal();

    const options = screen.getAllByRole('radio').map(option => option.textContent);
    expect(options).toEqual(['Verse', 'Pericope', 'Chapter']);
  });

  it('is labelled "Display", not "Scripture Display"', () => {
    openModal();

    expect(screen.getByText('Display')).toBeInTheDocument();
    expect(screen.queryByText('Scripture Display')).not.toBeInTheDocument();
  });

  it('marks the active view and no other', () => {
    useAppStore.setState({ displayMode: 'pericope' });
    openModal();

    const checked = screen
      .getAllByRole('radio')
      .filter(option => option.getAttribute('aria-checked') === 'true')
      .map(option => option.textContent);
    expect(checked).toEqual(['Pericope']);
  });

  it('selects chapter view, which is the entry point to the chapter surface', async () => {
    const { user } = openModal();

    await user.click(screen.getByRole('radio', { name: 'Chapter' }));

    expect(useAppStore.getState().displayMode).toBe('chapter');
  });

  it('still switches between the two original views', async () => {
    useAppStore.setState({ displayMode: 'chapter' });
    const { user } = openModal();

    await user.click(screen.getByRole('radio', { name: 'Verse' }));
    expect(useAppStore.getState().displayMode).toBe('verse');

    await user.click(screen.getByRole('radio', { name: 'Pericope' }));
    expect(useAppStore.getState().displayMode).toBe('pericope');
  });

  it('groups the options so a screen reader announces one control, not three buttons', () => {
    openModal();

    expect(toggle()).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });
});
