/** Top-level USJ block containing a selection point. */
export const blockIndex = (path: string): string | undefined =>
  /^\$\.content\[(\d+)\]/.exec(path)?.[1];
