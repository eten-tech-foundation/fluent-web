import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { config } from '@/lib/config';
import type { ProjectItem } from '@/lib/types';

import { useAppStore } from './store';

// #314: a build without the RTE flag must not revive a stored 'chapter' display mode — the
// chapter surface cannot work there and the toggle would have no option to check.
const originalRteFlag = config.features.rtePericope;

function seedDisplayMode(displayMode: string) {
  localStorage.setItem('app-store', JSON.stringify({ state: { displayMode }, version: 0 }));
}

describe('app store rehydration', () => {
  afterEach(() => {
    config.features.rtePericope = originalRteFlag;
    localStorage.removeItem('app-store');
    useAppStore.setState({ displayMode: 'verse' });
  });

  it('keeps a stored chapter mode when the RTE flag is on', async () => {
    config.features.rtePericope = true;
    seedDisplayMode('chapter');

    await useAppStore.persist.rehydrate();

    expect(useAppStore.getState().displayMode).toBe('chapter');
  });

  it('coerces a stored chapter mode to verse when the RTE flag is off', async () => {
    config.features.rtePericope = false;
    seedDisplayMode('chapter');

    await useAppStore.persist.rehydrate();

    expect(useAppStore.getState().displayMode).toBe('verse');
  });
});

const projectItem: ProjectItem = {
  chapterAssignmentId: 1,
  projectId: 2,
  projectName: 'BSB John',
  projectUnitId: 3,
  bibleId: 4,
  bibleName: 'BSB',
  targetLanguage: 'English',
  targetLangCode: 'eng',
  bookId: 5,
  book: 'John',
  bookCode: 'JHN',
  chapterStatus: 'in_progress',
  chapterNumber: 3,
  totalVerses: 36,
  completedVerses: 0,
  submittedTime: null,
  sourceLangCode: 'eng',
};

describe('setCurrentProjectItem assignment state', () => {
  beforeEach(() => {
    useAppStore.setState({
      currentProjectItem: projectItem,
      isAiThresholdMet: true,
      roleChangeWarning: true,
    });
  });

  it('clears assignment-scoped flags when a reused ID belongs to a different project context', () => {
    const nextItem: ProjectItem = {
      ...projectItem,
      projectId: 12,
      projectUnitId: 13,
      bibleId: 14,
      bookId: 15,
      bookCode: 'EXO',
      chapterNumber: 1,
    };

    useAppStore.getState().setCurrentProjectItem(nextItem);

    expect(useAppStore.getState()).toMatchObject({
      currentProjectItem: nextItem,
      isAiThresholdMet: null,
      roleChangeWarning: false,
    });
  });

  it('preserves assignment-scoped flags when only the same assignment metadata changes', () => {
    const updatedItem: ProjectItem = { ...projectItem, isAiEnabled: true };

    useAppStore.getState().setCurrentProjectItem(updatedItem);

    expect(useAppStore.getState()).toMatchObject({
      currentProjectItem: updatedItem,
      isAiThresholdMet: true,
      roleChangeWarning: true,
    });
  });
});
