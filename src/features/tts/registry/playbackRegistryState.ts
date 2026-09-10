import { type PlayableKey } from '../seam/types';

import { type PauseRecord } from './pauseRecord';

/** Idle-channel facts. Live position and the live AI latch belong to the player. */
export interface PlayableState {
  readonly record: PauseRecord | null;
  readonly staticAi: boolean;
  readonly lastDynamicAi: boolean;
  readonly impossibleReason: string | null;
  readonly isLive: boolean;
  readonly canRestart: boolean;
}

export const EMPTY_PLAYABLE_STATE: PlayableState = Object.freeze({
  record: null,
  staticAi: false,
  lastDynamicAi: false,
  impossibleReason: null,
  isLive: false,
  canRestart: false,
});

export interface RegistryState {
  readonly playables: ReadonlyMap<PlayableKey, PlayableState>;
  readonly liveKey: PlayableKey | null;
}

export type RegistryAction =
  | { type: 'setRecord'; key: PlayableKey; record: PauseRecord }
  | { type: 'clearRecord'; key: PlayableKey }
  | { type: 'setStaticAi'; key: PlayableKey; value: boolean }
  | { type: 'setLastDynamicAi'; key: PlayableKey; value: boolean }
  | { type: 'setImpossible'; key: PlayableKey; reason: string | null }
  | { type: 'setLive'; key: PlayableKey | null }
  | { type: 'dropAll' };

function sameRecord(a: PauseRecord | null, b: PauseRecord | null): boolean {
  return (
    a === b ||
    (a !== null &&
      b !== null &&
      a.itemIndex === b.itemIndex &&
      a.verseRef === b.verseRef &&
      a.currentTime === b.currentTime &&
      a.forceTts === b.forceTts)
  );
}

function updatePlayable(
  state: RegistryState,
  key: PlayableKey,
  patch: Partial<Omit<PlayableState, 'canRestart'>>
): RegistryState {
  const previous = state.playables.get(key) ?? EMPTY_PLAYABLE_STATE;
  const next = { ...previous, ...patch };
  next.canRestart = next.isLive || next.record !== null;
  if (
    sameRecord(previous.record, next.record) &&
    previous.staticAi === next.staticAi &&
    previous.lastDynamicAi === next.lastDynamicAi &&
    previous.impossibleReason === next.impossibleReason &&
    previous.isLive === next.isLive
  ) {
    return state;
  }
  const playables = new Map(state.playables);
  if (
    next.record === null &&
    !next.staticAi &&
    !next.lastDynamicAi &&
    next.impossibleReason === null &&
    !next.isLive
  ) {
    playables.delete(key);
  } else {
    playables.set(key, Object.freeze(next));
  }
  return { ...state, playables };
}

/** Pure data transitions; provider instances never share a mutable state map. */
export function playbackRegistryReducer(
  state: RegistryState,
  action: RegistryAction
): RegistryState {
  switch (action.type) {
    case 'setRecord':
      return updatePlayable(state, action.key, {
        record: Object.freeze({ ...action.record }),
      });
    case 'clearRecord':
      return updatePlayable(state, action.key, { record: null });
    case 'setStaticAi':
      return updatePlayable(state, action.key, { staticAi: action.value });
    case 'setLastDynamicAi':
      return updatePlayable(state, action.key, { lastDynamicAi: action.value });
    case 'setImpossible':
      return updatePlayable(state, action.key, { impossibleReason: action.reason });
    case 'setLive': {
      if (state.liveKey === action.key) return state;
      let next = state;
      if (state.liveKey !== null) {
        next = updatePlayable(next, state.liveKey, { isLive: false });
      }
      if (action.key !== null) {
        next = updatePlayable(next, action.key, { isLive: true });
      }
      return { ...next, liveKey: action.key };
    }
    case 'dropAll':
      return state.playables.size === 0 && state.liveKey === null
        ? state
        : { playables: new Map(), liveKey: null };
  }
}
