import { type PlayableKey } from '../seam/types';

import { type PauseRecord } from './pauseRecord';
import {
  EMPTY_PLAYABLE_STATE,
  playbackRegistryReducer,
  type PlayableState,
  type RegistryAction,
  type RegistryState,
} from './playbackRegistryState';

type Listener = () => void;
type PauseClaimant = () => void;

export interface PlaybackRegistry {
  /** Pauses the previous claimant. Release on direct pause or host unmount. */
  claim: (pause: PauseClaimant, restart?: () => void) => () => void;
  silenceAll: () => void;
  /** True if a claimant exists, even if it has no Restart control. */
  restartLive: () => boolean;
  setPageKey: (key: string) => void;
  getRecord: (key: PlayableKey) => PauseRecord | null;
  setRecord: (key: PlayableKey, record: PauseRecord) => void;
  clearRecord: (key: PlayableKey) => void;
  getStaticAi: (key: PlayableKey) => boolean;
  setStaticAi: (key: PlayableKey, value: boolean) => void;
  getLastDynamicAi: (key: PlayableKey) => boolean;
  setLastDynamicAi: (key: PlayableKey, value: boolean) => void;
  setImpossible: (key: PlayableKey, reason: string | null) => void;
  setLive: (key: PlayableKey | null) => void;
  isLive: (key: PlayableKey) => boolean;
  canRestart: (key: PlayableKey) => boolean;
  getSnapshot: (key: PlayableKey) => PlayableState;
  subscribe: (key: PlayableKey, listener: Listener) => () => void;
}

/**
 * One reducer-backed store per Provider. Synchronous transitions let a claimant
 * write a pause record before the next starter reads it in the same event. React
 * observes immutable, per-key snapshots rather than broadcasting a Context map.
 */
export class PlaybackRegistryStore implements PlaybackRegistry {
  private state: RegistryState = { playables: new Map(), liveKey: null };
  private pageKey: string | undefined;
  private readonly listeners = new Map<PlayableKey, Set<Listener>>();
  // Behavior belongs only to live claims, never to saved per-playable data.
  private readonly restarts = new WeakMap<PauseClaimant, () => void>();

  constructor(private readonly claimants: Set<PauseClaimant>) {}

  private dispatch(action: RegistryAction): void {
    const previous = this.state;
    this.state = playbackRegistryReducer(previous, action);
    if (previous === this.state) return;
    const notify = new Set<Listener>();
    for (const [key, listeners] of this.listeners) {
      if (previous.playables.get(key) !== this.state.playables.get(key)) {
        for (const listener of listeners) notify.add(listener);
      }
    }
    for (const listener of notify) listener();
  }

  private replaceClaimant(pause?: PauseClaimant, restart?: () => void): () => void {
    // One loop for both exclusive starts and silence-all. These callbacks pause
    // and record; the registry neither owns nor retains a media element.
    for (const claimant of [...this.claimants]) claimant();
    this.claimants.clear();
    if (!pause) return () => {};
    // Each registration has its own identity, so an old cleanup cannot remove
    // a newer claim that happens to reuse the same host callback.
    const claimant = () => pause();
    this.claimants.add(claimant);
    if (restart) this.restarts.set(claimant, restart);
    return () => {
      this.claimants.delete(claimant);
    };
  }

  claim = (pause: PauseClaimant, restart?: () => void): (() => void) =>
    this.replaceClaimant(pause, restart);

  restartLive = (): boolean => {
    const claimant = this.claimants.values().next().value;
    if (!claimant) return false;
    this.restarts.get(claimant)?.();
    return true;
  };

  silenceAll = (): void => {
    this.replaceClaimant();
  };

  setPageKey = (key: string): void => {
    if (this.pageKey === key) return;
    this.pageKey = key;
    // The page's host stops/releases its run; dropping data must not write an
    // old-page pause record back into the new page's store.
    this.dispatch({ type: 'dropAll' });
  };

  getSnapshot = (key: PlayableKey): PlayableState =>
    this.state.playables.get(key) ?? EMPTY_PLAYABLE_STATE;

  subscribe = (key: PlayableKey, listener: Listener): (() => void) => {
    let listeners = this.listeners.get(key);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(key, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(key);
    };
  };

  getRecord = (key: PlayableKey): PauseRecord | null => this.getSnapshot(key).record;

  setRecord = (key: PlayableKey, record: PauseRecord): void => {
    this.dispatch({ type: 'setRecord', key, record });
  };

  clearRecord = (key: PlayableKey): void => {
    this.dispatch({ type: 'clearRecord', key });
  };

  getStaticAi = (key: PlayableKey): boolean => this.getSnapshot(key).staticAi;

  setStaticAi = (key: PlayableKey, value: boolean): void => {
    this.dispatch({ type: 'setStaticAi', key, value });
  };

  getLastDynamicAi = (key: PlayableKey): boolean => this.getSnapshot(key).lastDynamicAi;

  setLastDynamicAi = (key: PlayableKey, value: boolean): void => {
    this.dispatch({ type: 'setLastDynamicAi', key, value });
  };

  setImpossible = (key: PlayableKey, reason: string | null): void => {
    this.dispatch({ type: 'setImpossible', key, reason });
  };

  setLive = (key: PlayableKey | null): void => {
    this.dispatch({ type: 'setLive', key });
  };

  isLive = (key: PlayableKey): boolean => this.getSnapshot(key).isLive;

  canRestart = (key: PlayableKey): boolean => this.getSnapshot(key).canRestart;
}
