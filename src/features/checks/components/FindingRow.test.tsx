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

describe('FindingRow — active', () => {
  it('renders the surface snippet and both ignore buttons', () => {
    renderWithProviders(
      <FindingRow globalIgnoresAvailable resolved={makeResolved()} {...handlers()} />
    );
    expect(screen.getByText('and The the made')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ignore Here' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ignore Everywhere' })).toBeInTheDocument();
  });

  it('fires onIgnoreHere with the occurrence key', async () => {
    const h = handlers();
    const { user } = renderWithProviders(
      <FindingRow globalIgnoresAvailable resolved={makeResolved()} {...h} />
    );
    await user.click(screen.getByRole('button', { name: 'Ignore Here' }));
    expect(h.onIgnoreHere).toHaveBeenCalledWith('JDG 4:3|the the|0');
  });

  it('hides Ignore Everywhere when global ignores are unavailable', () => {
    renderWithProviders(
      <FindingRow globalIgnoresAvailable={false} resolved={makeResolved()} {...handlers()} />
    );
    expect(screen.queryByRole('button', { name: 'Ignore Everywhere' })).not.toBeInTheDocument();
  });

  it('Ignore Everywhere opens a confirm dialog and only fires on confirm', async () => {
    const h = handlers();
    const { user } = renderWithProviders(
      <FindingRow globalIgnoresAvailable resolved={makeResolved()} {...h} />
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
      <FindingRow globalIgnoresAvailable resolved={makeResolved()} {...h} />
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
      <FindingRow globalIgnoresAvailable resolved={resolved} {...h} />
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
        {...handlers()}
      />
    );
    expect(screen.queryByRole('button', { name: 'More undo options' })).not.toBeInTheDocument();
    // The plain Undo button is still present.
    expect(screen.getByRole('button', { name: 'Undo Ignore' })).toBeInTheDocument();
  });
});
