import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { type ProjectItem, type User } from '@/lib/types';

/** The drafting views a chapter can be presented in (#396). */
export type DisplayMode = 'verse' | 'pericope' | 'chapter';

/** IDs are only meaningful within their project and source context; local DB resets can reuse them. */
export const isSameProjectAssignment = (
  left: ProjectItem | null | undefined,
  right: ProjectItem | null | undefined
): boolean =>
  !!left &&
  !!right &&
  left.chapterAssignmentId === right.chapterAssignmentId &&
  left.projectId === right.projectId &&
  left.projectUnitId === right.projectUnitId &&
  left.bibleId === right.bibleId &&
  left.bookId === right.bookId &&
  left.chapterNumber === right.chapterNumber;

interface AppState {
  userdetail: User | null;
  currentProjectItem: ProjectItem | null;
  presenceWarning: string | null;
  roleChangeWarning: boolean;
  _hasHydrated: boolean;
  displayMode: DisplayMode;
  isAiThresholdMet: boolean | null;
  isAiSyncPending: boolean;
  isOrgSwitching: boolean;
  aiAutoEnablePreferences: Record<number, boolean | undefined>;
  setUserDetail: (user: User) => void;
  setCurrentProjectItem: (projectItem: ProjectItem | null) => void;
  clearUserDetail: () => void;
  clearCurrentProjectItem: () => void;
  setHasHydrated: (state: boolean) => void;
  setPresenceWarning: (msg: string | null) => void;
  setRoleChangeWarning: (warning: boolean) => void;
  setDisplayMode: (mode: DisplayMode) => void;
  setIsAiThresholdMet: (status: boolean | null) => void;
  setIsAiSyncPending: (pending: boolean) => void;
  setIsOrgSwitching: (switching: boolean) => void;
  setAiAutoEnablePreference: (userId: number, status: boolean | undefined) => void;
}
let hydrationResolve: (() => void) | null = null;
export const hydrationPromise = new Promise<void>(resolve => {
  hydrationResolve = resolve;
});

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      userdetail: null,
      currentProjectItem: null,
      presenceWarning: null,
      roleChangeWarning: false,
      _hasHydrated: false,
      displayMode: 'verse',
      isAiThresholdMet: null,
      isAiSyncPending: false,
      isOrgSwitching: false,
      aiAutoEnablePreferences: {},
      setUserDetail: (userdetail: User) => set({ userdetail }),
      setCurrentProjectItem: (currentProjectItem: ProjectItem | null) => {
        if (!isSameProjectAssignment(get().currentProjectItem, currentProjectItem)) {
          // Clear assignment-scoped state when the selected context changes, even if IDs were reused.
          set({ currentProjectItem, isAiThresholdMet: null, roleChangeWarning: false });
        } else {
          // Keep assignment-scoped state when only its metadata changes.
          set({ currentProjectItem });
        }
      },
      clearUserDetail: () => set({ userdetail: null, roleChangeWarning: false }),
      clearCurrentProjectItem: () =>
        set({ currentProjectItem: null, isAiThresholdMet: null, roleChangeWarning: false }),
      setHasHydrated: (state: boolean) => set({ _hasHydrated: state }),
      setPresenceWarning: (presenceWarning: string | null) => set({ presenceWarning }),
      setRoleChangeWarning: (roleChangeWarning: boolean) => set({ roleChangeWarning }),
      setDisplayMode: (displayMode: DisplayMode) => set({ displayMode }),
      setIsAiThresholdMet: (status: boolean | null) => set({ isAiThresholdMet: status }),
      setIsAiSyncPending: (pending: boolean) => set({ isAiSyncPending: pending }),
      setIsOrgSwitching: (isOrgSwitching: boolean) => set({ isOrgSwitching }),
      setAiAutoEnablePreference: (userId: number, status: boolean | undefined) =>
        set(state => {
          const next = { ...state.aiAutoEnablePreferences };
          if (status === undefined) {
            delete next[userId];
          } else {
            next[userId] = status;
          }
          return { aiAutoEnablePreferences: next };
        }),
    }),
    {
      name: 'app-store',
      partialize: state => ({
        userdetail: state.userdetail,
        currentProjectItem: state.currentProjectItem,
        displayMode: state.displayMode,
        aiAutoEnablePreferences: state.aiAutoEnablePreferences,
      }),
      onRehydrateStorage: () => state => {
        state?.setHasHydrated(true);
        if (hydrationResolve) {
          hydrationResolve();
          hydrationResolve = null;
        }
      },
    }
  )
);
