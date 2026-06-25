import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen } from '@/test/render';

import { type ResolvedFinding, type ResolvedFindings } from '../checks.types';

import { ChecksPanel } from './ChecksPanel';

const active = (sntId: string, word: string, ordinal = 0): ResolvedFinding => ({
  finding: {
    snt_id: sntId,
    repeated_word: word,
    surf: `${word} (in ${sntId})`,
    start_position: 0,
    legitimate: false,
    severity: 0.5,
  },
  ordinal,
  occurrenceKey: `${sntId}|${word}|${ordinal}`,
  isActive: true,
});

const inactive = (
  sntId: string,
  word: string,
  reason: ResolvedFinding['inactiveReason'],
  ordinal = 0
): ResolvedFinding => ({
  ...active(sntId, word, ordinal),
  isActive: false,
  inactiveReason: reason,
});

const handlers = () => ({
  onIgnoreHere: vi.fn(),
  onIgnoreEverywhere: vi.fn(),
  onUndo: vi.fn(),
  onStopIgnoringEverywhere: vi.fn(),
});

const renderPanel = (resolved: ResolvedFindings, over: Partial<{ isError: boolean }> = {}) =>
  renderWithProviders(
    <ChecksPanel
      globalIgnoresAvailable
      isError={over.isError ?? false}
      resolved={resolved}
      {...handlers()}
    />
  );

describe('ChecksPanel — grouping & zero state', () => {
  it('groups active findings by verse with a "Verse N" heading per findings-bearing verse', () => {
    renderPanel({
      active: [active('JDG 4:1', 'the the'), active('JDG 4:3', 'and and')],
      inactive: [],
    });
    expect(screen.getByRole('heading', { name: 'Verse 1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Verse 3' })).toBeInTheDocument();
    // Verse 2 had no findings -> no heading.
    expect(screen.queryByRole('heading', { name: 'Verse 2' })).not.toBeInTheDocument();
  });

  it('renders a separator between verse groups (one fewer than the group count)', () => {
    const { container } = renderPanel({
      active: [active('JDG 4:1', 'the the'), active('JDG 4:3', 'and and')],
      inactive: [],
    });
    expect(container.querySelectorAll('[data-slot="separator"]')).toHaveLength(1);
  });

  it('shows "No issues found" when there are no active findings', () => {
    renderPanel({ active: [], inactive: [] });
    expect(screen.getByText('No issues found')).toBeInTheDocument();
  });

  it('falls back to the raw snt_id when it does not parse to a verse number', () => {
    renderPanel({ active: [active('weird-id', 'the the')], inactive: [] });
    expect(screen.getByRole('heading', { name: 'weird-id' })).toBeInTheDocument();
  });
});

describe('ChecksPanel — error line', () => {
  it('renders the inline error line when isError', () => {
    renderPanel({ active: [active('JDG 4:1', 'the the')], inactive: [] }, { isError: true });
    expect(screen.getByRole('alert')).toHaveTextContent('Checks failed to refresh');
  });

  it('does NOT show the zero state on error (error over empty section instead)', () => {
    renderPanel({ active: [], inactive: [] }, { isError: true });
    expect(screen.getByRole('alert')).toHaveTextContent('Checks failed to refresh');
    expect(screen.queryByText('No issues found')).not.toBeInTheDocument();
  });

  it('keeps rendering last-known findings below the error line', () => {
    renderPanel({ active: [active('JDG 4:1', 'the the')], inactive: [] }, { isError: true });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Verse 1' })).toBeInTheDocument();
  });
});

describe('ChecksPanel — Show Ignored toggle', () => {
  it('hides inactive findings by default (toggle off) and reveals them when toggled on', async () => {
    const resolved: ResolvedFindings = {
      active: [active('JDG 4:1', 'the the')],
      inactive: [inactive('JDG 4:1', 'and and', 'occurrence')],
    };
    const { user } = renderWithProviders(
      <ChecksPanel globalIgnoresAvailable isError={false} resolved={resolved} {...handlers()} />
    );

    // Default OFF: the inactive snippet is not shown.
    expect(screen.queryByText('and and (in JDG 4:1)')).not.toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: 'Show Ignored' }));
    expect(screen.getByText('and and (in JDG 4:1)')).toBeInTheDocument();
    expect(screen.getByTestId('inactive-label')).toHaveTextContent('Ignore Here');
  });

  it('does not render the toggle when there are no inactive findings', () => {
    renderPanel({ active: [active('JDG 4:1', 'the the')], inactive: [] });
    expect(screen.queryByRole('switch', { name: 'Show Ignored' })).not.toBeInTheDocument();
  });

  it('renders revealed ignored findings in a dedicated section BELOW the toggle (revised #278 mock)', async () => {
    const resolved: ResolvedFindings = {
      active: [active('JDG 4:1', 'the the')],
      inactive: [inactive('JDG 4:2', 'and and', 'occurrence')],
    };
    const { user } = renderWithProviders(
      <ChecksPanel globalIgnoresAvailable isError={false} resolved={resolved} {...handlers()} />
    );

    await user.click(screen.getByRole('switch', { name: 'Show Ignored' }));

    const ignoredSection = screen.getByTestId('ignored-section');
    // The ignored finding lives inside the dedicated below-toggle section...
    expect(ignoredSection).toHaveTextContent('and and (in JDG 4:2)');
    expect(ignoredSection).toHaveTextContent('Verse 2');
    // ...and NOT interleaved into the active group above the toggle.
    expect(ignoredSection).not.toHaveTextContent('the the (in JDG 4:1)');

    // The toggle (switch) appears in the DOM before the ignored section.
    const toggle = screen.getByRole('switch', { name: 'Show Ignored' });
    expect(toggle.compareDocumentPosition(ignoredSection)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('resets the toggle (not persisted) across remounts', async () => {
    const resolved: ResolvedFindings = {
      active: [],
      inactive: [inactive('JDG 4:1', 'and and', 'global')],
    };
    const { user, unmount } = renderWithProviders(
      <ChecksPanel globalIgnoresAvailable isError={false} resolved={resolved} {...handlers()} />
    );
    await user.click(screen.getByRole('switch', { name: 'Show Ignored' }));
    expect(screen.getByText('and and (in JDG 4:1)')).toBeInTheDocument();
    unmount();

    // Fresh mount = fresh session: toggle is OFF again.
    renderWithProviders(
      <ChecksPanel globalIgnoresAvailable isError={false} resolved={resolved} {...handlers()} />
    );
    expect(screen.queryByText('and and (in JDG 4:1)')).not.toBeInTheDocument();
  });
});

describe('ChecksPanel — verseHeading helper (via grouping)', () => {
  it('handles a snt_id with no colon by rendering the raw id as the heading', () => {
    renderPanel({ active: [active('NOCOLON', 'the the')], inactive: [] });
    expect(screen.getByRole('heading', { name: 'NOCOLON' })).toBeInTheDocument();
  });

  it('handles a snt_id whose verse segment after the colon is not a number', () => {
    renderPanel({ active: [active('JDG 4:abc', 'the the')], inactive: [] });
    expect(screen.getByRole('heading', { name: 'JDG 4:abc' })).toBeInTheDocument();
  });

  it('renders multi-digit verse numbers correctly', () => {
    renderPanel({ active: [active('REV 22:21', 'the the')], inactive: [] });
    expect(screen.getByRole('heading', { name: 'Verse 21' })).toBeInTheDocument();
  });
});

describe('ChecksPanel — "Show Ignored" toggle visibility', () => {
  it('does not render the ignored section before the toggle is clicked even with inactive findings', () => {
    const resolved: ResolvedFindings = {
      active: [],
      inactive: [inactive('JDG 4:1', 'the the', 'legitimate')],
    };
    renderWithProviders(
      <ChecksPanel globalIgnoresAvailable isError={false} resolved={resolved} {...handlers()} />
    );
    expect(screen.queryByTestId('ignored-section')).not.toBeInTheDocument();
  });

  it('shows the zero state while inactive findings exist but toggle is off', () => {
    // No active findings + inactive findings present + toggle off = zero state visible
    // because showingIgnored is false and activeGroups is empty.
    const resolved: ResolvedFindings = {
      active: [],
      inactive: [inactive('JDG 4:1', 'the the', 'occurrence')],
    };
    renderWithProviders(
      <ChecksPanel globalIgnoresAvailable isError={false} resolved={resolved} {...handlers()} />
    );
    expect(screen.getByText('No issues found')).toBeInTheDocument();
    expect(screen.queryByTestId('ignored-section')).not.toBeInTheDocument();
  });

  it('hides the zero state once the toggle is turned on (ignored items now showing)', async () => {
    const resolved: ResolvedFindings = {
      active: [],
      inactive: [inactive('JDG 4:1', 'the the', 'occurrence')],
    };
    const { user } = renderWithProviders(
      <ChecksPanel globalIgnoresAvailable isError={false} resolved={resolved} {...handlers()} />
    );
    // Toggle is OFF: zero state is visible.
    expect(screen.getByText('No issues found')).toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: 'Show Ignored' }));

    // Toggle is ON: zero state must be hidden; ignored section appears.
    expect(screen.queryByText('No issues found')).not.toBeInTheDocument();
    expect(screen.getByTestId('ignored-section')).toBeInTheDocument();
  });

  it('supports all three inactive reasons (occurrence / global / legitimate) in the ignored section', async () => {
    const resolved: ResolvedFindings = {
      active: [],
      inactive: [
        inactive('JDG 4:1', 'the the', 'occurrence', 0),
        inactive('JDG 4:2', 'and and', 'global', 0),
        inactive('JDG 4:3', 'for for', 'legitimate', 0),
      ],
    };
    const { user } = renderWithProviders(
      <ChecksPanel globalIgnoresAvailable isError={false} resolved={resolved} {...handlers()} />
    );
    await user.click(screen.getByRole('switch', { name: 'Show Ignored' }));

    const section = screen.getByTestId('ignored-section');
    expect(section).toHaveTextContent('Verse 1');
    expect(section).toHaveTextContent('Verse 2');
    expect(section).toHaveTextContent('Verse 3');
  });
});

describe('ChecksPanel — callback wiring', () => {
  it('passes onIgnoreHere through to the active FindingRow', async () => {
    const h = handlers();
    const resolved: ResolvedFindings = {
      active: [active('JDG 4:1', 'the the')],
      inactive: [],
    };
    const { user } = renderWithProviders(
      <ChecksPanel globalIgnoresAvailable isError={false} resolved={resolved} {...h} />
    );
    await user.click(screen.getByRole('button', { name: 'Ignore Here' }));
    expect(h.onIgnoreHere).toHaveBeenCalledWith('JDG 4:1|the the|0');
  });

  it('passes onUndo through to the inactive FindingRow (after toggle)', async () => {
    const h = handlers();
    const inactiveFinding = inactive('JDG 4:1', 'the the', 'occurrence');
    const resolved: ResolvedFindings = {
      active: [active('JDG 4:2', 'and and')],
      inactive: [inactiveFinding],
    };
    const { user } = renderWithProviders(
      <ChecksPanel globalIgnoresAvailable isError={false} resolved={resolved} {...h} />
    );
    await user.click(screen.getByRole('switch', { name: 'Show Ignored' }));
    await user.click(screen.getByRole('button', { name: 'Undo Ignore' }));
    expect(h.onUndo).toHaveBeenCalledWith(inactiveFinding);
  });
});
