/** 40px non-overlapping targets; outline is painted by the primary button. */
export const PLAYABLE_CONTROL_BUTTON_CLASS = 'text-primary h-10 w-10 shrink-0';

/** Keyboard-visible focus reveals without pinning mouse-click focus over the text; touch has no hover. */
export const VERSE_CONTROL_REVEAL_CLASS =
  'absolute top-1/2 left-8 z-10 -translate-y-1/2 rounded-full bg-background opacity-0 transition-opacity group-hover/audio:opacity-100 has-[:focus-visible]:opacity-100 [@media(hover:none)]:opacity-100';
