import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { type ProjectItem, type User } from '@/lib/types';

/** The drafting views a chapter can be presented in (#396). */
export type DisplayMode = 'verse' | 'pericope' | 'chapter';

interface ChapterViewAvailability {
  chapterAssignmentId: number;
  available: boolean;
}

interface AppState {
  userdetail: User | null;
  currentProjectItem: ProjectItem | null;
  presenceWarning: string | null;
  roleChangeWarning: boolean;
  _hasHydrated: boolean;
  displayMode: DisplayMode;
  chapterViewAvailability: ChapterViewAvailability | null;
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
  setChapterViewAvailability: (availability: ChapterViewAvailability | null) => void;
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
      chapterViewAvailability: null,
      isAiThresholdMet: null,
      isAiSyncPending: false,
      isOrgSwitching: false,
      aiAutoEnablePreferences: {},
      setUserDetail: (userdetail: User) => set({ userdetail }),
      setCurrentProjectItem: (currentProjectItem: ProjectItem | null) => {
        const currentId = get().currentProjectItem?.chapterAssignmentId;
        const newId = currentProjectItem?.chapterAssignmentId;

        if (currentProjectItem === null || currentId !== newId) {
          // Clear threshold status and role warning when changing projects
          set({
            currentProjectItem,
            isAiThresholdMet: null,
            roleChangeWarning: false,
            chapterViewAvailability: null,
          });
        } else {
          // Keep threshold status when just updating the same project's fields
          set({ currentProjectItem });
        }
      },
      clearUserDetail: () =>
        set({ userdetail: null, roleChangeWarning: false, chapterViewAvailability: null }),
      clearCurrentProjectItem: () =>
        set({
          currentProjectItem: null,
          isAiThresholdMet: null,
          roleChangeWarning: false,
          chapterViewAvailability: null,
        }),
      setHasHydrated: (state: boolean) => set({ _hasHydrated: state }),
      setPresenceWarning: (presenceWarning: string | null) => set({ presenceWarning }),
      setRoleChangeWarning: (roleChangeWarning: boolean) => set({ roleChangeWarning }),
      setDisplayMode: (displayMode: DisplayMode) => set({ displayMode }),
      setChapterViewAvailability: chapterViewAvailability => set({ chapterViewAvailability }),
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
