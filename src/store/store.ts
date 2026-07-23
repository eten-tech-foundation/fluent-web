import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { type ProjectItem, type User } from '@/lib/types';

interface AppState {
  userdetail: User | null;
  currentProjectItem: ProjectItem | null;
  presenceWarning: string | null;
  _hasHydrated: boolean;
  displayMode: 'verse' | 'pericope';
  isAiThresholdMet: boolean | null;
  setUserDetail: (user: User) => void;
  setCurrentProjectItem: (projectItem: ProjectItem | null) => void;
  clearUserDetail: () => void;
  clearCurrentProjectItem: () => void;
  setHasHydrated: (state: boolean) => void;
  setPresenceWarning: (msg: string | null) => void;
  setDisplayMode: (mode: 'verse' | 'pericope') => void;
  setIsAiThresholdMet: (status: boolean | null) => void;
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
      _hasHydrated: false,
      displayMode: 'verse',
      isAiThresholdMet: null,
      setUserDetail: (userdetail: User) => set({ userdetail }),
      setCurrentProjectItem: (currentProjectItem: ProjectItem | null) => {
        const currentId = get().currentProjectItem?.chapterAssignmentId;
        const newId = currentProjectItem?.chapterAssignmentId;

        if (currentProjectItem === null || currentId !== newId) {
          // Clear threshold status when changing projects
          set({ currentProjectItem, isAiThresholdMet: null });
        } else {
          // Keep threshold status when just updating the same project's fields
          set({ currentProjectItem });
        }
      },
      clearUserDetail: () => set({ userdetail: null }),
      clearCurrentProjectItem: () => set({ currentProjectItem: null, isAiThresholdMet: null }),
      setHasHydrated: (state: boolean) => set({ _hasHydrated: state }),
      setPresenceWarning: (presenceWarning: string | null) => set({ presenceWarning }),
      setDisplayMode: (displayMode: 'verse' | 'pericope') => set({ displayMode }),
      setIsAiThresholdMet: (status: boolean | null) => set({ isAiThresholdMet: status }),
    }),
    {
      name: 'app-store',
      partialize: state => ({
        userdetail: state.userdetail,
        currentProjectItem: state.currentProjectItem,
        displayMode: state.displayMode,
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
