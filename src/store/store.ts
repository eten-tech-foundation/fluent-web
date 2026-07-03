import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { type ProjectItem, type User } from '@/lib/types';

interface AppState {
  userdetail: User | null;
  currentProjectItem: ProjectItem | null;
  presenceWarning: string | null;
  _hasHydrated: boolean;
  displayMode: 'verse' | 'pericope';
  setUserDetail: (user: User) => void;
  setCurrentProjectItem: (projectItem: ProjectItem | null) => void;
  clearUserDetail: () => void;
  clearCurrentProjectItem: () => void;
  setHasHydrated: (state: boolean) => void;
  setPresenceWarning: (msg: string | null) => void;
  setDisplayMode: (mode: 'verse' | 'pericope') => void;
}
let hydrationResolve: (() => void) | null = null;
export const hydrationPromise = new Promise<void>(resolve => {
  hydrationResolve = resolve;
});

export const useAppStore = create<AppState>()(
  persist(
    set => ({
      userdetail: null,
      currentProjectItem: null,
      presenceWarning: null,
      _hasHydrated: false,
      displayMode: 'verse',
      setUserDetail: (userdetail: User) => set({ userdetail }),
      setCurrentProjectItem: (currentProjectItem: ProjectItem | null) =>
        set({ currentProjectItem }),
      clearUserDetail: () => set({ userdetail: null }),
      clearCurrentProjectItem: () => set({ currentProjectItem: null }),
      setHasHydrated: (state: boolean) => set({ _hasHydrated: state }),
      setPresenceWarning: (presenceWarning: string | null) => set({ presenceWarning }),
      setDisplayMode: (displayMode: 'verse' | 'pericope') => set({ displayMode }),
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
