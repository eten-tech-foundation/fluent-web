import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LeftPanel } from './LeftPanel';

const baseProps = {
  activeTab: 'resources' as const,
  onTabChange: vi.fn(),
  activeFindingsCount: 0,
  resourcesContent: <div>resources-body</div>,
  checksContent: <div>checks-body</div>,
  assistantContent: <div>assistant-body</div>,
};

describe('LeftPanel', () => {
  it('renders both tabs', () => {
    render(<LeftPanel {...baseProps} />);
    expect(screen.getByRole('tab', { name: /Resources/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Checks/ })).toBeInTheDocument();
  });

  it('shows the active tab body and hides the inactive one', () => {
    const { rerender } = render(
      <LeftPanel {...baseProps} showAssistantTab activeTab='resources' />
    );
    expect(screen.getByText('resources-body')).toBeInTheDocument();
    expect(screen.queryByText('checks-body')).not.toBeInTheDocument();
    expect(screen.queryByText('assistant-body')).not.toBeInTheDocument();

    rerender(<LeftPanel {...baseProps} showAssistantTab activeTab='checks' />);
    expect(screen.getByText('checks-body')).toBeInTheDocument();
    expect(screen.queryByText('resources-body')).not.toBeInTheDocument();
    expect(screen.queryByText('assistant-body')).not.toBeInTheDocument();
  });

  it('marks the active tab via aria-selected', () => {
    render(<LeftPanel {...baseProps} activeTab='checks' />);
    expect(screen.getByRole('tab', { name: /Checks/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Resources/ })).toHaveAttribute(
      'aria-selected',
      'false'
    );
  });

  it('wires both tabs to the shared tabpanel via aria-controls', () => {
    render(<LeftPanel {...baseProps} activeTab='resources' />);
    const panel = screen.getByRole('tabpanel');
    const panelId = panel.getAttribute('id');
    expect(panelId).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Resources/ })).toHaveAttribute(
      'aria-controls',
      panelId
    );
    expect(screen.getByRole('tab', { name: /Checks/ })).toHaveAttribute('aria-controls', panelId);
  });

  it('labels the tabpanel by the active tab (aria-labelledby tracks the active tab)', () => {
    const { rerender } = render(<LeftPanel {...baseProps} activeTab='resources' />);
    const resourcesTabId = screen.getByRole('tab', { name: /Resources/ }).getAttribute('id');
    expect(resourcesTabId).toBeTruthy();
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', resourcesTabId);

    rerender(<LeftPanel {...baseProps} activeTab='checks' />);
    const checksTabId = screen.getByRole('tab', { name: /Checks/ }).getAttribute('id');
    expect(checksTabId).toBeTruthy();
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', checksTabId);
  });

  it('calls onTabChange when a tab is clicked', () => {
    const onTabChange = vi.fn();
    render(<LeftPanel {...baseProps} activeTab='resources' onTabChange={onTabChange} />);
    fireEvent.click(screen.getByRole('tab', { name: /Checks/ }));
    expect(onTabChange).toHaveBeenCalledWith('checks');
  });

  it('does not render the notification dot when there are no active findings', () => {
    render(<LeftPanel {...baseProps} activeFindingsCount={0} />);
    expect(screen.queryByTestId('checks-notification-dot')).not.toBeInTheDocument();
  });

  it('renders the dot (visible from the Resources tab) when active findings exist', () => {
    render(<LeftPanel {...baseProps} activeFindingsCount={3} activeTab='resources' />);
    expect(screen.getByTestId('checks-notification-dot')).toBeInTheDocument();
  });

  it('renders the dot on the Checks tab when active findings exist', () => {
    render(<LeftPanel {...baseProps} activeFindingsCount={1} activeTab='checks' />);
    expect(screen.getByTestId('checks-notification-dot')).toBeInTheDocument();
  });

  // --- showChecksTab (feature-flags proposal D6/D7) --------------------------
  describe('showChecksTab', () => {
    it('renders the Checks tab by default (prop omitted)', () => {
      render(<LeftPanel {...baseProps} />);
      expect(screen.getByRole('tab', { name: /Checks/ })).toBeInTheDocument();
    });

    it('hides the Checks tab entirely when showChecksTab is false', () => {
      render(<LeftPanel {...baseProps} showChecksTab={false} />);
      expect(screen.getByRole('tab', { name: /Resources/ })).toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: /Checks/ })).not.toBeInTheDocument();
    });

    it('suppresses the notification dot when the Checks tab is hidden', () => {
      render(<LeftPanel {...baseProps} activeFindingsCount={5} showChecksTab={false} />);
      expect(screen.queryByTestId('checks-notification-dot')).not.toBeInTheDocument();
    });

    it('falls back to the Resources body even if activeTab is checks while hidden', () => {
      render(<LeftPanel {...baseProps} activeTab='checks' showChecksTab={false} />);
      expect(screen.getByText('resources-body')).toBeInTheDocument();
      expect(screen.queryByText('checks-body')).not.toBeInTheDocument();
    });

    it('labels the tabpanel by the Resources tab when the Checks tab is hidden', () => {
      render(<LeftPanel {...baseProps} activeTab='checks' showChecksTab={false} />);
      const resourcesTabId = screen.getByRole('tab', { name: /Resources/ }).getAttribute('id');
      expect(resourcesTabId).toBeTruthy();
      expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', resourcesTabId);
    });
  });

  describe('Assistant tab', () => {
    it('is hidden by default and falls back to Resources if a saved Assistant tab is unavailable', () => {
      render(<LeftPanel {...baseProps} activeTab='assistant' />);
      expect(screen.queryByRole('tab', { name: 'AI Assistant' })).not.toBeInTheDocument();
      expect(screen.getByText('resources-body')).toBeInTheDocument();
    });

    it('renders an icon-only AI Assistant immediately before Resources with a tooltip', async () => {
      const user = userEvent.setup();
      render(<LeftPanel {...baseProps} showAssistantTab activeTab='assistant' />);
      const tabs = screen.getAllByRole('tab');
      expect(tabs).toEqual([
        screen.getByRole('tab', { name: 'AI Assistant' }),
        screen.getByRole('tab', { name: 'Resources' }),
        screen.getByRole('tab', { name: /Checks/ }),
      ]);
      const assistant = screen.getByRole('tab', { name: 'AI Assistant' });
      expect(assistant).toHaveTextContent('');
      expect(assistant).toHaveAttribute('aria-selected', 'true');
      expect(assistant).toHaveAttribute('aria-controls', screen.getByRole('tabpanel').id);
      expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', assistant.id);
      expect(screen.getByText('assistant-body')).toBeInTheDocument();
      await user.hover(assistant);
      expect(await screen.findByRole('tooltip')).toHaveTextContent('AI Assistant');
    });

    it('does not mount Assistant content until its tab is open', () => {
      const AssistantProbe = vi.fn(() => <div>assistant-probe</div>);
      const view = render(
        <LeftPanel
          {...baseProps}
          showAssistantTab
          activeTab='resources'
          assistantContent={<AssistantProbe />}
        />
      );
      expect(AssistantProbe).not.toHaveBeenCalled();

      view.rerender(
        <LeftPanel
          {...baseProps}
          showAssistantTab
          activeTab='assistant'
          assistantContent={<AssistantProbe />}
        />
      );
      expect(AssistantProbe).toHaveBeenCalledTimes(1);
    });

    it('moves across only visible tabs with Arrow, Home, and End keys', () => {
      const onTabChange = vi.fn();
      render(
        <LeftPanel
          {...baseProps}
          showAssistantTab
          activeTab='resources'
          showChecksTab={false}
          onTabChange={onTabChange}
        />
      );
      const resources = screen.getByRole('tab', { name: 'Resources' });
      fireEvent.keyDown(resources, { key: 'ArrowRight' });
      expect(onTabChange).toHaveBeenLastCalledWith('assistant');
      expect(screen.getByRole('tab', { name: 'AI Assistant' })).toHaveFocus();
      fireEvent.keyDown(screen.getByRole('tab', { name: 'AI Assistant' }), { key: 'Home' });
      expect(onTabChange).toHaveBeenLastCalledWith('assistant');
      fireEvent.keyDown(screen.getByRole('tab', { name: 'AI Assistant' }), { key: 'End' });
      expect(onTabChange).toHaveBeenLastCalledWith('resources');
    });

    it('does not disturb the Checks notification dot', () => {
      render(<LeftPanel {...baseProps} showAssistantTab activeFindingsCount={2} />);
      expect(screen.getByTestId('checks-notification-dot')).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'AI Assistant' })).not.toContainElement(
        screen.getByTestId('checks-notification-dot')
      );
    });
  });
});
