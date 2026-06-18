import { type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** Which tab of the drafting-page left panel is showing (persisted, W11). */
export type LeftTab = 'resources' | 'checks';

export interface LeftPanelProps {
  /** Controlled active tab; lifted to `DraftingPage` so it can be persisted
   *  in the editor-state blob as `activeLeftTab` (W11, §6.6). */
  activeTab: LeftTab;
  /** Called when the translator switches tabs; the parent persists the value. */
  onTabChange: (tab: LeftTab) => void;
  /** Cascade-resolved active-finding count (§6.4). The notification dot shows
   *  iff this is > 0; the dot is visible from either tab. */
  activeFindingsCount: number;
  /** Body for the Resources tab (the existing `ResourcePanel`). */
  resourcesContent: ReactNode;
  /** Body for the Checks tab (the `ChecksPanel`, composed by the parent). */
  checksContent: ReactNode;
}

interface TabButtonProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
  showDot?: boolean;
}

const TabButton: React.FC<TabButtonProps> = ({ label, isActive, onClick, showDot = false }) => (
  <button
    aria-selected={isActive}
    className={cn(
      'flex items-center gap-1.5 border-b-2 px-1 pb-2 text-base font-semibold transition-colors',
      isActive
        ? 'border-blue-600 text-blue-600'
        : 'text-muted-foreground hover:text-foreground border-transparent'
    )}
    role='tab'
    type='button'
    onClick={onClick}
  >
    {label}
    {showDot && (
      <span
        aria-label='Active checks present'
        className='inline-block h-2 w-2 shrink-0 rounded-full bg-blue-600'
        data-testid='checks-notification-dot'
      />
    )}
  </button>
);

/**
 * Tabbed left-panel container for the drafting page (W11, §6.6).
 *
 * Owns the text-tab header row ("Resources | Checks", blue underline on the
 * active tab, a blue notification dot right of "Checks" when there are active
 * findings) and renders the active tab's body below it. The dot's state comes
 * from the cascade-resolved active count computed at `DraftingPage` level and
 * threaded in via {@link LeftPanelProps.activeFindingsCount}, so it stays live
 * while the Resources tab is showing.
 *
 * `ResourcePanel` lost its own "Resources" heading; this tab row is now the
 * panel's header. The component is deliberately content-agnostic (slots for
 * each tab body) so it can be unit-tested in isolation and so the real
 * `ChecksPanel`/`ResourcePanel` are composed by the parent.
 */
export const LeftPanel: React.FC<LeftPanelProps> = ({
  activeTab,
  onTabChange,
  activeFindingsCount,
  resourcesContent,
  checksContent,
}) => {
  const hasActiveFindings = activeFindingsCount > 0;

  return (
    <div className='flex h-full flex-col'>
      <div aria-label='Left panel' className='flex items-center gap-6 px-1 pt-4' role='tablist'>
        <TabButton
          isActive={activeTab === 'resources'}
          label='Resources'
          onClick={() => onTabChange('resources')}
        />
        {/* The notification dot sits to the right of the "Checks" label only,
            and is visible whatever tab is active (mock shows it while the
            Resources tab is active too) — §5.1, W11. */}
        <TabButton
          isActive={activeTab === 'checks'}
          label='Checks'
          showDot={hasActiveFindings}
          onClick={() => onTabChange('checks')}
        />
      </div>

      <div className='min-h-0 flex-1'>
        {activeTab === 'resources' ? resourcesContent : checksContent}
      </div>
    </div>
  );
};

export default LeftPanel;
