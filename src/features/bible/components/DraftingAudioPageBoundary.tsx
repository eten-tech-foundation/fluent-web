import { type PropsWithChildren, useEffect } from 'react';

import { usePlaybackRegistry } from '@/features/tts';

interface DraftingAudioPageBoundaryProps extends PropsWithChildren {
  pageKey: string;
}

/** Owns audio data for one drafting route visit, even if the same page returns. */
export function DraftingAudioPageBoundary({
  pageKey,
  children,
}: DraftingAudioPageBoundaryProps): React.JSX.Element {
  const registry = usePlaybackRegistry();

  useEffect(() => {
    registry.setPageKey(pageKey);
    return () => registry.endPage(pageKey);
  }, [pageKey, registry]);

  return <>{children}</>;
}
