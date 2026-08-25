import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PericopeTargetGroup } from '@/features/bible/components/DraftingGridPericope';
import { config } from '@/lib/config';
import { type ProjectItem, type Source, type TargetVerse } from '@/lib/types';

/**
 * The editor chunk is loaded on demand, and what the box shows while it travels is the point of
 * this suite. The mocked module resolves only when the test lets it, which is the slow connection
 * the fallback exists for.
 */
const editorChunk = vi.hoisted(() => {
  let arrive = () => {};
  const onTheWire = new Promise<void>(resolve => {
    arrive = resolve;
  });
  return { onTheWire, deliver: () => arrive() };
});

vi.mock('@/features/bible/components/PericopeRteGroup', async () => {
  await editorChunk.onTheWire;
  return { PericopeRteGroup: () => <div data-testid='pericope-rte-group' /> };
});

const GROUP_VERSES: Source[] = [
  { id: 1, verseNumber: 1, text: 'Source 1' },
  { id: 2, verseNumber: 2, text: 'Source 2' },
  { id: 3, verseNumber: 3, text: 'Source 3' },
];

const projectItem = {
  bookCode: 'GEN',
  chapterAssignmentId: 7,
  chapterNumber: 1,
} as ProjectItem;

const renderGroup = () =>
  render(
    <PericopeTargetGroup
      activeVerseId={1}
      aiSuggestions={{}}
      globalNextUntouchedVerse={null}
      groupIndex={0}
      groupVerses={GROUP_VERSES}
      handleActiveVerseChange={vi.fn()}
      handleKeyDown={vi.fn()}
      handleNextClick={vi.fn(() => Promise.resolve())}
      handleNextPericopeClick={vi.fn(() => Promise.resolve())}
      handleTextChange={vi.fn()}
      isAiActive={false}
      isAiThresholdMet={false}
      isTranslationComplete={false}
      pericopes={[{ pericopeNumber: '1', pericopeTitle: null, verses: [] }]}
      projectItem={projectItem}
      readOnly={false}
      sourceVerses={GROUP_VERSES}
      suggestionStatus='idle'
      textareaRefs={{ current: {} }}
      verses={[{ verseNumber: 1, content: '' }] as TargetVerse[]}
    />
  );

describe('PericopeTargetGroup', () => {
  afterEach(() => {
    config.features.rtePericope = false;
  });

  it('holds the box open while the editor chunk is still loading', async () => {
    config.features.rtePericope = true;

    renderGroup();

    // Blank would read as "this pericope has no surface", which is what the translator sees on a
    // slow connection with nothing in the fallback.
    const loading = screen.getByTestId('pericope-editor-loading');
    expect(loading).toBeInTheDocument();
    // Shaped like the pericope that is coming, so the column does not jump when it arrives.
    expect(loading.children).toHaveLength(GROUP_VERSES.length);

    editorChunk.deliver();

    expect(await screen.findByTestId('pericope-rte-group')).toBeInTheDocument();
    expect(screen.queryByTestId('pericope-editor-loading')).not.toBeInTheDocument();
  });

  it('waits for nothing on the textarea path, which is in the main bundle', () => {
    config.features.rtePericope = false;

    renderGroup();

    expect(screen.queryByTestId('pericope-editor-loading')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Translation for verse 1')).toBeInTheDocument();
  });
});
