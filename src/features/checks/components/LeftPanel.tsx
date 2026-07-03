import { type ReactNode } from 'react';

import { type LeftTab } from '@/features/bible/hooks/useResourceStatePersistence';
import { cn } from '@/lib/utils';

/**
 * Which tab of the drafting-page left panel is showing (persisted, W11).
 * Single source of truth lives in `useResourceStatePersistence`, where it is
 * the editor-state `activeLeftTab` field; re-exported here so consumers of the
 * panel's type surface can keep importing it from `LeftPanel`.
 */
export type { LeftTab };

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
  /**
   * Whether the "Checks" tab is shown at all. When the Repeated Word Check
   * feature is disabled (feature-flags proposal D6/D7), the tab — and its
   * notification dot — are hidden entirely so the panel looks as if Checks were
   * never implemented. The parent (`DraftingUI`) is responsible for also forcing
   * `activeTab` back to `'resources'` when this is false, so the shared panel
   * never tries to render an absent tab's body. Defaults to true.
   */
  showChecksTab?: boolean;
}

/**
 * Stable element ids wiring the tabs to the shared panel (W11, §6.6). The two
 * tabs share a single body container; `aria-labelledby` on the panel points at
 * whichever tab is currently active, so screen readers announce the panel's
 * controlling tab. (CR-5: complete the ARIA tab/tabpanel relationship.)
 */
const TAB_IDS: Record<LeftTab, string> = {
  resources: 'left-panel-tab-resources',
  checks: 'left-panel-tab-checks',
};
const PANEL_ID = 'left-panel-tabpanel';

interface TabButtonProps {
  id: string;
  label: string;
  isActive: boolean;
  onClick: () => void;
  showDot?: boolean;
}

const TabButton: React.FC<TabButtonProps> = ({ id, label, isActive, onClick, showDot = false }) => (
  <button
    aria-controls={PANEL_ID}
    aria-selected={isActive}
    className={cn(
      'flex items-center gap-1.5 border-b-2 px-1 pb-2 text-base font-semibold transition-colors',
      isActive
        ? 'border-blue-600 text-blue-600'
        : 'text-muted-foreground hover:text-foreground border-transparent'
    )}
    id={id}
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
  showChecksTab = true,
}) => {
  const hasActiveFindings = activeFindingsCount > 0;
  // When the Checks tab is hidden, the shared panel must never try to render the
  // (absent) checks body. The parent forces `activeTab` back to 'resources', but
  // we also guard here so this component is correct in isolation.
  const effectiveTab: LeftTab = showChecksTab ? activeTab : 'resources';

  return (
    <div className='flex h-full flex-col'>
      <div aria-label='Left panel' className='flex items-center gap-6 px-1 pt-4' role='tablist'>
        <TabButton
          id={TAB_IDS.resources}
          isActive={effectiveTab === 'resources'}
          label='Resources'
          onClick={() => onTabChange('resources')}
        />
        {/* The notification dot sits to the right of the "Checks" label only,
            and is visible whatever tab is active (mock shows it while the
            Resources tab is active too) — §5.1, W11. The whole tab (and thus the
            dot) is hidden when the Checks feature is disabled (feature-flags
            proposal D6/D7), so it looks as if Checks were never implemented. */}
        {showChecksTab && (
          <TabButton
            id={TAB_IDS.checks}
            isActive={effectiveTab === 'checks'}
            label='Checks'
            showDot={hasActiveFindings}
            onClick={() => onTabChange('checks')}
          />
        )}
      </div>

      {/* Single shared panel: `aria-labelledby` tracks the active tab so the
          tab/tabpanel relationship is complete for assistive tech (CR-5). */}
      <div
        aria-labelledby={TAB_IDS[effectiveTab]}
        className='min-h-0 flex-1'
        id={PANEL_ID}
        role='tabpanel'
      >
        {effectiveTab === 'resources' ? resourcesContent : checksContent}
      </div>
    </div>
  );
};

export default LeftPanel;
