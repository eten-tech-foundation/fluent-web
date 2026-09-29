import type { VerseHeading, VerseMarkers } from '@/lib/types';

/** Top-level section markers identify the title; subtitles and references stay in the body. */
function titleIndex(markers: VerseMarkers | null | undefined): number {
  return (
    markers?.headings?.findIndex(heading => heading.marker === 's' || heading.marker === 's1') ?? -1
  );
}

export function getPericopeTitle(markers?: VerseMarkers | null): VerseHeading | undefined {
  return markers?.headings?.[titleIndex(markers)];
}

export function canSetPericopeTitle(markers?: VerseMarkers | null): boolean {
  return Boolean(getPericopeTitle(markers)) || (markers?.headings?.length ?? 0) < 4;
}

export function withPericopeTitle(
  markers: VerseMarkers | null | undefined,
  text: string
): VerseMarkers {
  const headings = [...(markers?.headings ?? [])];
  const index = titleIndex(markers);
  if (index >= 0) {
    if (text.trim()) headings[index] = { ...headings[index], text };
    else headings.splice(index, 1);
  } else if (text.trim()) {
    headings.unshift({ marker: 's1', text });
  }
  return { ...markers, headings };
}

export function withoutPericopeTitle(markers?: VerseMarkers | null): VerseMarkers | null {
  const index = titleIndex(markers);
  if (index < 0) return markers ?? null;
  return { ...markers, headings: markers?.headings?.filter((_, i) => i !== index) };
}

/** Keep the title beside surviving headings when the body adds or removes headings. */
export function restorePericopeTitle(
  edited: VerseMarkers | null | undefined,
  original: VerseMarkers | null | undefined
): VerseMarkers | null | undefined {
  const title = getPericopeTitle(original);
  if (!title) return edited;
  const headings = [...(edited?.headings ?? [])];
  const originalIndex = titleIndex(original);
  let index = Math.min(originalIndex, headings.length);
  const following = original?.headings?.slice(originalIndex + 1) ?? [];
  const followingIndex = following
    .map(heading =>
      headings.findIndex(edited => edited.marker === heading.marker && edited.text === heading.text)
    )
    .find(candidate => candidate >= 0);
  if (originalIndex === 0) index = 0;
  else if (followingIndex !== undefined) index = followingIndex;
  else {
    const preceding = original?.headings?.slice(0, originalIndex).reverse() ?? [];
    const precedingIndex = preceding
      .map(heading =>
        headings.findIndex(
          edited => edited.marker === heading.marker && edited.text === heading.text
        )
      )
      .find(candidate => candidate >= 0);
    if (precedingIndex !== undefined) index = precedingIndex + 1;
  }
  headings.splice(index, 0, title);
  return { ...edited, headings };
}
