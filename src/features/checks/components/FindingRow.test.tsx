import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen, within } from '@/test/render';

import { type ResolvedFinding } from '../checks.types';

import { FindingRow } from './FindingRow';

const makeResolved = (over: Partial<ResolvedFinding> = {}): ResolvedFinding => ({
  finding: {
    snt_id: 'JDG 4:3',
    repeated_word: 'the the',
    surf: 'and The the made',
    start_position: 4,
    legitimate: false,
    severity: 0.5,
  },
  ordinal: 0,
  occurrenceKey: 'JDG 4:3|the the|0',
  isActive: true,
  ...over,
});

const handlers = () => ({
  onIgnoreHere: vi.fn(),
  onIgnoreEverywhere: vi.fn(),
  onUndo: vi.fn(),
  onStopIgnoringEverywhere: vi.fn(),
});

/**
 * Empty as-checked snapshot: exercises the fallback path (render `finding.surf`
 * bare) in the pre-existing action/label tests, which don't care about the
 * verse window.
 */
const emptySnapshot: ReadonlyMap<string, string> = new Map();

describe('FindingRow — active', () => {
  it('renders the surface snippet and both ignore buttons', () => {
    renderWithProviders(
      <FindingRow
        globalIgnoresAvailable
        resolved={makeResolved()}
        verseTextBySntId={emptySnapshot}
        {...handlers()}
      />
    );
    expect(screen.getByText('and The the made')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ignore Here' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ignore Everywhere' })).toBeInTheDocument();
  });

  it('fires onIgnoreHere with the occurrence key', async () => {
    const h = handlers();
    const { user } = renderWithProviders(
      <FindingRow
        globalIgnoresAvailable
        resolved={makeResolved()}
        verseTextBySntId={emptySnapshot}
        {...h}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Ignore Here' }));
    expect(h.onIgnoreHere).toHaveBeenCalledWith('JDG 4:3|the the|0');
  });

  it('hides Ignore Everywhere when global ignores are unavailable', () => {
    renderWithProviders(
      <FindingRow
        globalIgnoresAvailable={false}
        resolved={makeResolved()}
        verseTextBySntId={emptySnapshot}
        {...handlers()}
      />
    );
    expect(screen.queryByRole('button', { name: 'Ignore Everywhere' })).not.toBeInTheDocument();
  });

  it('Ignore Everywhere opens a confirm dialog and only fires on confirm', async () => {
    const h = handlers();
    const { user } = renderWithProviders(
      <FindingRow
        globalIgnoresAvailable
        resolved={makeResolved()}
        verseTextBySntId={emptySnapshot}
        {...h}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Ignore Everywhere' }));
    // Dialog is open; the action has NOT fired yet.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(h.onIgnoreEverywhere).not.toHaveBeenCalled();

    // Confirm via the dialog's own "Ignore Everywhere" button.
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Ignore Everywhere' }));
    expect(h.onIgnoreEverywhere).toHaveBeenCalledWith('the the');
  });

  it('Cancel in the confirm dialog does not fire onIgnoreEverywhere', async () => {
    const h = handlers();
    const { user } = renderWithProviders(
      <FindingRow
        globalIgnoresAvailable
        resolved={makeResolved()}
        verseTextBySntId={emptySnapshot}
        {...h}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Ignore Everywhere' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(h.onIgnoreEverywhere).not.toHaveBeenCalled();
  });
});

describe('FindingRow — inactive', () => {
  it('renders the correct ignore-type label for each inactive reason', () => {
    const cases: Array<[ResolvedFinding['inactiveReason'], string]> = [
      ['occurrence', 'Ignore Here'],
      ['global', 'Ignore Always'],
      ['legitimate', 'Default Ignore'],
    ];
    for (const [reason, label] of cases) {
      const { unmount } = renderWithProviders(
        <FindingRow
          globalIgnoresAvailable
          resolved={makeResolved({ isActive: false, inactiveReason: reason })}
          verseTextBySntId={emptySnapshot}
          {...handlers()}
        />
      );
      expect(screen.getByTestId('inactive-label')).toHaveTextContent(label);
      // No active ignore buttons on an inactive row.
      expect(screen.queryByRole('button', { name: 'Ignore Here' })).not.toBeInTheDocument();
      unmount();
    }
  });

  it('Undo Ignore default click fires onUndo with the resolved finding', async () => {
    const h = handlers();
    const resolved = makeResolved({ isActive: false, inactiveReason: 'occurrence' });
    const { user } = renderWithProviders(
      <FindingRow
        globalIgnoresAvailable
        resolved={resolved}
        verseTextBySntId={emptySnapshot}
        {...h}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Undo Ignore' }));
    expect(h.onUndo).toHaveBeenCalledWith(resolved);
  });

  it('chevron menu fires onStopIgnoringEverywhere when global ignores are available', async () => {
    const h = handlers();
    const { user } = renderWithProviders(
      <FindingRow
        globalIgnoresAvailable
        resolved={makeResolved({ isActive: false, inactiveReason: 'global' })}
        verseTextBySntId={emptySnapshot}
        {...h}
      />
    );
    await user.click(screen.getByRole('button', { name: 'More undo options' }));
    await user.click(screen.getByRole('menuitem', { name: /Stop ignoring/ }));
    expect(h.onStopIgnoringEverywhere).toHaveBeenCalledWith('the the');
  });

  it('omits the chevron (global entry) when global ignores are unavailable', () => {
    renderWithProviders(
      <FindingRow
        globalIgnoresAvailable={false}
        resolved={makeResolved({ isActive: false, inactiveReason: 'occurrence' })}
        verseTextBySntId={emptySnapshot}
        {...handlers()}
      />
    );
    expect(screen.queryByRole('button', { name: 'More undo options' })).not.toBeInTheDocument();
    // The plain Undo button is still present.
    expect(screen.getByRole('button', { name: 'Undo Ignore' })).toBeInTheDocument();
  });
});

describe('FindingRow — verse-context window', () => {
  // The as-checked verse text for the default finding: the highlighted slice at
  // [4, 4 + surf.length) is 'The the' — deliberately DIFFERENT casing from
  // `finding.surf` ('and The the made' would not match anywhere) to lock in the
  // surf-agnostic contract: the card must highlight the verse slice, never surf.
  const verse = 'And The the made light';
  const snapshot: ReadonlyMap<string, string> = new Map([['JDG 4:3', verse]]);
  // surf's length (7) is all that matters for the window; its text is unused.
  const windowed = makeResolved({
    finding: { ...makeResolved().finding, surf: 'the the', start_position: 4 },
  });

  it('active card renders the verse window with the VERSE slice highlighted (red + bold)', () => {
    renderWithProviders(
      <FindingRow
        globalIgnoresAvailable
        resolved={windowed}
        verseTextBySntId={snapshot}
        {...handlers()}
      />
    );
    const highlight = screen.getByTestId('verse-highlight');
    // The verse slice ('The the'), NOT finding.surf ('the the').
    expect(highlight).toHaveTextContent('The the');
    expect(highlight.textContent).toBe('The the');
    expect(highlight).toHaveClass('text-red-600', 'font-semibold');
    // before + match + after reassemble the (short, untruncated) verse — no ellipses.
    expect(highlight.parentElement?.textContent).toBe('And The the made light');
  });

  it('renders leading and trailing ellipses when the window cuts a long verse on both ends', () => {
    // Match at [34, 41): 26 chars of raw context on each side cut inside the
    // verse, snapping to whitespace (constants: 26/26, radius 10).
    const longVerse =
      'one two three four five six seven the the eight nine ten eleven twelve thirteen';
    renderWithProviders(
      <FindingRow
        globalIgnoresAvailable
        resolved={makeResolved({
          finding: { ...makeResolved().finding, surf: 'the the', start_position: 34 },
        })}
        verseTextBySntId={new Map([['JDG 4:3', longVerse]])}
        {...handlers()}
      />
    );
    const highlight = screen.getByTestId('verse-highlight');
    expect(highlight.textContent).toBe('the the');
    expect(highlight.parentElement?.textContent).toBe(
      '… three four five six seven the the eight nine ten eleven twelve …'
    );
  });

  it('dimmed/ignored card renders the same window but with bold-only highlight (no red)', () => {
    renderWithProviders(
      <FindingRow
        globalIgnoresAvailable
        resolved={{ ...windowed, isActive: false, inactiveReason: 'occurrence' }}
        verseTextBySntId={snapshot}
        {...handlers()}
      />
    );
    const highlight = screen.getByTestId('verse-highlight');
    expect(highlight.textContent).toBe('The the');
    expect(highlight).toHaveClass('font-semibold');
    expect(highlight).not.toHaveClass('text-red-600');
    // The window renders alongside the ignore-type label, not instead of it.
    expect(screen.getByTestId('inactive-label')).toHaveTextContent('Ignore Here');
  });

  it('falls back to finding.surf when the snapshot has no text for the snt_id', () => {
    renderWithProviders(
      <FindingRow
        globalIgnoresAvailable
        resolved={makeResolved()}
        verseTextBySntId={emptySnapshot}
        {...handlers()}
      />
    );
    // Today's behavior: the bare surface text, no highlight span, no crash.
    expect(screen.getByText('and The the made')).toBeInTheDocument();
    expect(screen.queryByTestId('verse-highlight')).not.toBeInTheDocument();
  });
});
