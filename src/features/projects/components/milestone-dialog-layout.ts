/**
 * Add Milestone with the import tabs (#418): each tab is a column whose body scrolls on its own,
 * while the dialog's title and tabs above it and the tab's buttons below it stay put.
 */
export const MILESTONE_TAB = 'flex min-h-0 flex-col';

/** The part of a tab that scrolls. It spans the dialog's side padding, so its scrollbar sits at the edge. */
export const MILESTONE_TAB_BODY = '-mx-6 min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-6';
