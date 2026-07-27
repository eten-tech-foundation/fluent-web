export interface UserGrant {
  orgId: number | null;
  projectId?: number | null;
  roleId: number;
  roleName: string;
  permissions: string[];
  orgName?: string | null;
}

export interface User {
  id: number;
  username: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email: string;
  grants?: UserGrant[];
  orgGrants?: UserGrant[];
  role?: number;
  status?: string;
  organization?: number;
  lastActiveOrgId?: number | null;
  createdBy?: number;
  isActive?: boolean;
}

export interface AssignmentUser {
  id: number;
  displayName: string;
}

export interface WorkflowStep {
  id: string;
  label: string;
}

export type ChapterStatusCounts = Record<string, number>;

export interface Project {
  id: number;
  name: string;
  sourceName: string;
  organization: number;
  status: string;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
  sourceLanguageName: string;
  targetLanguageName: string;
  lastChapterActivity: string;
  chapterStatusCounts: ChapterStatusCounts;
  workflowConfig: WorkflowStep[];
  pericopeSetId?: number | null;
}

export interface PericopeSet {
  id: number;
  name: string;
  description: string | null;
}

export interface PericopeVerseRef {
  chapterNumber: number;
  verseNumber: number;
}

export interface PericopeGroup {
  pericopeNumber: string;
  pericopeTitle: string | null;
  verses: PericopeVerseRef[];
}

export interface CreateProject {
  id: number;
  name: string;
  bibleId: number;
  bookId: number[];
  organization: number;
  createdBy: number;
  metadata: Record<string, unknown>;
  sourceLanguage: number;
  targetLanguage: number;
  pericopeSetId?: number;
}

export interface Chapter {
  id: string | number;
  book: string;
  chapter: number;
  assigned?: string;
  status: number;
  totalVerses?: number;
}

export interface ChapterAssignmentProgress {
  bibleId: number;
  bookId: number;
  bookCode: string;
  sourceLangCode: string;
  /**
   * ISO 639-3 target language CODE, e.g. "eng" (sent as the repeated-words
   * check's `lang_code`). Required so the PM "open chapter" path can populate
   * `ProjectItem.targetLangCode`; if it were optional the field could be
   * silently dropped and the check would send "<unknown>" (BUG #3).
   */
  targetLangCode: string;
  bookNameEng: string;
  chapterNumber: number;
  assignedUser: AssignmentUser | null;
  peerChecker: AssignmentUser | null;
  status: string;
  projectUnitId: number;
  assignmentId: number;
  totalVerses: number;
  completedVerses: number;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  isSubmitted?: boolean;
  submittedTime?: Date | null;
}

export interface Book {
  bookId: number;
  code: string;
  engDisplayName: string;
}

export interface ProjectItem {
  chapterAssignmentId: number;
  projectId: number;
  projectName: string;
  projectUnitId: number;
  bibleId: number;
  bibleName: string;
  /** Human-readable target language display NAME, e.g. "English". */
  targetLanguage: string;
  /**
   * ISO 639-3 target language CODE, e.g. "eng". Sent as the check's `lang_code`
   * — greek-room keys its legitimate-duplicate whitelist on this code, so the
   * display name must NOT be used here. See phase-04 manual smoke (BUG #2).
   * Required so the compiler forces every `ProjectItem` builder to supply it
   * (the PM "open chapter" path silently omitted it — BUG #3). The check still
   * degrades to "<unknown>" at runtime if the value is somehow empty, rather
   * than crashing.
   */
  targetLangCode: string;
  bookId: number;
  book: string;
  chapterStatus: string;
  chapterNumber: number;
  totalVerses: number;
  completedVerses: number;
  submittedTime: string | null;
  bookCode: string;
  sourceLangCode: string;
}

export interface VerseData {
  projectUnitId: number;
  content: string;
  bibleTextId: number;
  assignedUserId: number;
}

export interface AudioStep {
  stepNumber: number;
  url: string;
}

export interface AudioData {
  url?: string;
  steps?: AudioStep[];
}

export interface AudioContent {
  mp3?: AudioData;
  webm?: AudioData;
}

export interface TipTapMark {
  type: string;
  attrs?: {
    resourceId?: number;
    level?: number;
    indent?: number;
    src?: string;
    alt?: string;
    start?: number;
    [key: string]: unknown;
  };
}

export interface TipTapNode {
  type: string;
  content?: TipTapNode[];
  text?: string;
  marks?: TipTapMark[];
  attrs?: {
    level?: number;
    indent?: number;
    src?: string;
    alt?: string;
    start?: number;
    resourceId?: number;
    [key: string]: unknown;
  };
}

export interface ContentItem {
  tiptap?: TipTapNode | AudioContent;
  stepNumber?: number;
  url?: string;
}

export type GuideContentData = ContentItem[] | AudioContent;

export interface GroupingData {
  name?: string;
  collectionCode?: string;
}

export interface GuideContent {
  id: number;
  name: string;
  localizedName: string;
  content: GuideContentData;
  grouping: GroupingData;
}

export interface ItemWithUrl {
  id: number;
  name: string;
  localizedName: string;
  mediaType: string;
  url: string;
  thumbnailUrl?: string;
  isVideo?: boolean;
  grouping: GroupingData;
}

export interface ResourceName {
  id: string;
  name: string;
}

export interface ResourceItem {
  id: number;
  localizedName: string;
  mediaType: string;
  grouping: GroupingData;
}
export interface Source {
  id: number;
  verseNumber: number;
  text: string;
}
export interface TargetVerse {
  id?: number;
  content: string;
  verseNumber: number;
}

export interface DraftingUIProps {
  projectItem: ProjectItem;
  sourceVerses: Source[];
  targetVerses: TargetVerse[];
  userdetail: User;
  readOnly?: boolean;
}

export interface UserChapterAssignment {
  chapterAssignmentId: number;
  projectId: number;
  projectName: string;
  projectUnitId: number;
  bibleId: number;
  bibleName: string;
  chapterStatus: string;
  /** Human-readable target language display NAME, e.g. "English". */
  targetLanguage: string;
  /** ISO 639-3 target language CODE, e.g. "eng" (sent as the check's lang_code). */
  targetLangCode: string;
  sourceLangCode: string;
  bookCode: string;
  bookId: number;
  book: string;
  chapterNumber: number;
  totalVerses: number;
  completedVerses: number;
  submittedTime: string | null;
}

export enum ChapterAssignmentStatus {
  NOT_STARTED = 'not_started',
  DRAFT = 'draft',
  PEER_CHECK = 'peer_check',
  COMMUNITY_REVIEW = 'community_review',
  LINGUIST_CHECK = 'linguist_check',
  THEOLOGICAL_CHECK = 'theological_check',
  CONSULTANT_CHECK = 'consultant_check',
  COMPLETE = 'complete',
}
export enum UserRole {
  PROJECT_MANAGER = 1,
  TRANSLATOR = 2,
  SUPER_ADMIN = 3,
  ORG_OWNER = 4,
  ORG_MANAGER = 5,
  PROJECT_OBSERVER = 6,
}

export const ROLES = {
  SUPER_ADMIN: 'SuperAdmin',
  ORG_OWNER: 'Org Owner',
  ORG_MANAGER: 'Org Manager',
  PROJECT_MANAGER: 'Project Manager',
  PROJECT_TRANSLATOR: 'Project Translator',
  PROJECT_OBSERVER: 'Project Observer',
} as const;

const roleDisplayMap: Partial<Record<UserRole, string>> = {
  [UserRole.PROJECT_MANAGER]: 'Project Manager',
  [UserRole.TRANSLATOR]: 'Translator',
  [UserRole.SUPER_ADMIN]: 'SuperAdmin',
  [UserRole.ORG_OWNER]: 'Org Owner',
  [UserRole.ORG_MANAGER]: 'Org Manager',
  [UserRole.PROJECT_OBSERVER]: 'Observer',
};

export function getDisplayRole(role: number): string {
  return roleDisplayMap[role as UserRole] ?? 'Unknown';
}

export interface RoleOption {
  value: UserRole;
  label: string;
}

export const ROLE_OPTIONS: RoleOption[] = (
  Object.entries(roleDisplayMap) as Array<[string, string]>
).map(([value, label]) => ({
  value: Number(value) as UserRole,
  label,
}));

export const PROJECT_ROLE_OPTIONS: RoleOption[] = ROLE_OPTIONS.filter(r =>
  [UserRole.PROJECT_MANAGER, UserRole.TRANSLATOR, UserRole.PROJECT_OBSERVER].includes(r.value)
);

export const ChapterAssignmentStatusDisplay: Record<ChapterAssignmentStatus, string> = {
  [ChapterAssignmentStatus.NOT_STARTED]: 'Not Started',
  [ChapterAssignmentStatus.DRAFT]: 'Draft',
  [ChapterAssignmentStatus.PEER_CHECK]: 'Peer Check',
  [ChapterAssignmentStatus.COMMUNITY_REVIEW]: 'Community Review',
  [ChapterAssignmentStatus.LINGUIST_CHECK]: 'Linguist Check',
  [ChapterAssignmentStatus.THEOLOGICAL_CHECK]: 'Theological Check',
  [ChapterAssignmentStatus.CONSULTANT_CHECK]: 'Consultant Check',
  [ChapterAssignmentStatus.COMPLETE]: 'Complete',
};

export const ChapterAssignmentStatusNextAction: Partial<Record<ChapterAssignmentStatus, string>> = {
  [ChapterAssignmentStatus.DRAFT]: 'Send to Peer Checking',
  [ChapterAssignmentStatus.PEER_CHECK]: 'Send to Community Review',
  [ChapterAssignmentStatus.COMMUNITY_REVIEW]: 'Send to Linguist Check',
  [ChapterAssignmentStatus.LINGUIST_CHECK]: 'Send to Theological Check',
  [ChapterAssignmentStatus.THEOLOGICAL_CHECK]: 'Send to Consultant Check',
  [ChapterAssignmentStatus.CONSULTANT_CHECK]: 'Mark as Complete',
};

export const ADVANCED_CHECK_SUB_STATUSES: ChapterAssignmentStatus[] = [
  ChapterAssignmentStatus.LINGUIST_CHECK,
  ChapterAssignmentStatus.THEOLOGICAL_CHECK,
  ChapterAssignmentStatus.CONSULTANT_CHECK,
];

export const ADVANCED_CHECK_SUB_LABELS: Partial<Record<ChapterAssignmentStatus, string>> = {
  [ChapterAssignmentStatus.LINGUIST_CHECK]: 'Linguist Check',
  [ChapterAssignmentStatus.THEOLOGICAL_CHECK]: 'Theologian Check',
  [ChapterAssignmentStatus.CONSULTANT_CHECK]: 'Consultant Check',
};

export const CHAPTER_STATUS_ORDER: ChapterAssignmentStatus[] = [
  ChapterAssignmentStatus.NOT_STARTED,
  ChapterAssignmentStatus.DRAFT,
  ChapterAssignmentStatus.PEER_CHECK,
  ChapterAssignmentStatus.COMMUNITY_REVIEW,
  ChapterAssignmentStatus.LINGUIST_CHECK,
  ChapterAssignmentStatus.THEOLOGICAL_CHECK,
  ChapterAssignmentStatus.CONSULTANT_CHECK,
  ChapterAssignmentStatus.COMPLETE,
];

export type SortOption = 'recent' | 'title' | 'targetLanguage';

export type StatusFilter = 'all' | 'potentially_stalled' | 'not_assigned';

export type ConnectivityProfile = 'usually_connected' | 'sometimes_connected' | 'rarely_connected';

export const ConnectivityProfileDisplay: Record<ConnectivityProfile, string> = {
  usually_connected: 'Usually Connected',
  sometimes_connected: 'Sometimes Connected',
  rarely_connected: 'Rarely Connected',
};
