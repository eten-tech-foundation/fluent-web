import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type ChapterAssignmentProgress, type ProjectItem } from '@/lib/types';
import { renderWithProviders, screen } from '@/test/render';

import { MilestoneDetailPage } from './MilestoneDetailPage';

interface ChapterNavigation {
  to: string;
  params: { bookId: string; chapterNumber: string };
  state: { projectItem: ProjectItem };
}

const { navigate } = vi.hoisted(() => ({
  navigate: vi.fn<(options: ChapterNavigation) => void>(),
}));

const assignment: ChapterAssignmentProgress = {
  assignmentId: 42,
  projectUnitId: 10,
  status: 'draft',
  bibleId: 20,
  textBibleKey: 'aquifer-text-20',
  selectedRecordingKey: 'recording-20',
  ttsLicenseStatus: 'allowed',
  bookId: 30,
  bookCode: 'JHN',
  bookNameEng: 'John',
  chapterNumber: 3,
  sourceLangCode: 'eng',
  targetLangCode: 'spa',
  assignedUser: { id: 7, displayName: 'Translator' },
  peerChecker: null,
  totalVerses: 36,
  completedVerses: 2,
};

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/store/store', () => ({
  useAppStore: () => ({ userdetail: { id: 7, lastActiveOrgId: 1, grants: [] } }),
}));
vi.mock('@/hooks/useChapterAssignment', () => ({
  useChapterAssignments: () => ({ data: [assignment], isLoading: false, isFetching: false }),
  useAssignChapters: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));
vi.mock('@/features/projects/hooks/useProjectUnitBooks', () => ({
  useProjectBooks: () => ({
    data: [{ bookId: 30, code: 'JHN', engDisplayName: 'John' }],
    isLoading: false,
  }),
}));
vi.mock('@/features/projects/hooks/useProjectUsers', () => ({
  useProjectUsers: () => ({ data: undefined, isLoading: false }),
}));
vi.mock('./ChapterAssignmentsTable', () => ({
  ChapterAssignmentsTable: ({
    assignments,
    onRowClick,
  }: {
    assignments: ChapterAssignmentProgress[];
    onRowClick: (assignment: ChapterAssignmentProgress) => void;
  }) => <button onClick={() => onRowClick(assignments[0])}>Open chapter</button>,
}));
vi.mock('./AssignUsersDialog', () => ({ AssignUsersDialog: () => null }));
vi.mock('./CardProgressBar', () => ({ CardProgressBar: () => null }));

describe('MilestoneDetailPage audio handoff', () => {
  beforeEach(() => navigate.mockClear());

  it('carries source audio identity and licence into the drafting navigation state', async () => {
    const { user } = renderWithProviders(
      <MilestoneDetailPage
        milestoneId={10}
        milestoneName='New Testament'
        projectId={5}
        projectSource='World English Bible'
        projectSourceBibleId={20}
        projectTargetLanguageName='Spanish'
        projectTitle='Translation project'
        projectWorkflowConfig={[]}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Open chapter' }));

    expect(navigate).toHaveBeenCalledTimes(1);
    const navigation = navigate.mock.calls[0][0];
    expect(navigation.to).toBe('/translation/$bookId/$chapterNumber');
    expect(navigation.params).toEqual({ bookId: '30', chapterNumber: '3' });
    expect(navigation.state.projectItem).toMatchObject({
      chapterAssignmentId: 42,
      projectId: 5,
      bibleId: 20,
      bibleName: 'World English Bible',
      ttsLicenseStatus: 'allowed',
      textBibleKey: 'aquifer-text-20',
      selectedRecordingKey: 'recording-20',
    });
  });
});
