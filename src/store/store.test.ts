import { beforeEach, describe, expect, it } from 'vitest';

import type { ProjectItem } from '@/lib/types';
import { useAppStore } from '@/store/store';

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
