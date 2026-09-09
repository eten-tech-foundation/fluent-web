import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BibleTabList, SOURCE_BIBLE_TAB_ID } from './BibleTabList';

const resourceTabs = [
  { id: 'aq-1', label: 'ULT' },
  { id: 'yv-2', label: 'NIV' },
];

describe('BibleTabList', () => {
  it('keeps the source Bible first when several resource Bibles are open', () => {
    render(
      <BibleTabList
        activeTabId='yv-2'
        resourceTabs={resourceTabs}
        sourceLabel='WEB'
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['WEB', 'ULT', 'NIV']);
    expect(screen.getByRole('tab', { name: 'WEB' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.queryByRole('button', { name: 'Close WEB' })).not.toBeInTheDocument();
  });

  it('pins the source outside the horizontally scrolling resource tabs', () => {
    render(
      <BibleTabList
        activeTabId='yv-2'
        resourceTabs={resourceTabs}
        sourceLabel='WEB'
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />
    );

    const sourceTab = screen.getByRole('tab', { name: 'WEB' });
    const resourceScroller = screen.getByRole('group', { name: 'Open resource Bibles' });

    expect(resourceScroller).not.toContainElement(sourceTab);
    expect(resourceScroller).toContainElement(screen.getByRole('tab', { name: 'ULT' }));
    expect(resourceScroller).toContainElement(screen.getByRole('tab', { name: 'NIV' }));
  });

  it('selects the source and resource tabs by their stable ids', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <BibleTabList
        activeTabId='yv-2'
        resourceTabs={resourceTabs}
        sourceLabel='WEB'
        onClose={vi.fn()}
        onSelect={onSelect}
      />
    );

    await user.click(screen.getByRole('tab', { name: 'WEB' }));
    await user.click(screen.getByRole('tab', { name: 'ULT' }));

    expect(onSelect.mock.calls).toEqual([[SOURCE_BIBLE_TAB_ID], ['aq-1']]);
  });

  it('closes only the requested resource Bible', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <BibleTabList
        activeTabId='yv-2'
        resourceTabs={resourceTabs}
        sourceLabel='WEB'
        onClose={onClose}
        onSelect={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Close NIV' }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledWith('yv-2');
  });
});
