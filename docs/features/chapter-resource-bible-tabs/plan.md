# Chapter Resource Bible Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the source Bible named and reachable in Chapter View while each selected Resources Bible opens as an additional tab with its own loading, content, and empty state.

**Architecture:** `DraftingUI` will own an ordered collection of open resource-Bible tabs instead of one anonymous secondary panel. `ResourcePanel` will report selection and keyed content updates, while one reusable `BibleTabList` will render the permanent source tab and all closable resource tabs in every drafting mode. `DraftingChapterView` will consume the same active-tab model and render its source pane header, target-language header, loading state, content, or exact no-content copy.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, Tailwind CSS, react-i18next

**Spec:** https://github.com/eten-tech-foundation/fluent-web/issues/471

## Global Constraints

- The Chapter View always displays `projectItem.bibleName`.
- Selecting a Bible in Resources adds or activates a tab without removing the source Bible or previously opened resource Bibles.
- Closing a resource Bible never closes the source Bible.
- A resource Bible with no verses displays `This Bible verse doesn't have content for this passage.` after loading finishes.
- The source tab stays pinned at reduced width while the resource-tab section scrolls horizontally.
- Keep changes limited to the drafting/resource-Bible interaction described by issue #471.

---

### Task 1: Persistent source and resource tab model

**Files:**

- Create: `src/features/bible/components/BibleTabList.tsx`
- Create: `src/features/bible/components/BibleTabList.test.tsx`
- Modify: `src/features/resources/components/ResourcePanel.tsx`
- Modify: `src/features/bible/components/DraftingResourceSidebar.tsx`
- Modify: `src/features/bible/components/DraftingUI.tsx`
- Modify: `src/features/bible/components/DraftingUI.test.tsx`

**Interfaces:**

- Consumes: `UnifiedBible` selections and `BibleVerse[]` results from `useBibleResources`.
- Produces: `ResourceBibleTab { id: string; label: string; verses: BibleVerse[]; isLoading: boolean }`, `SOURCE_BIBLE_TAB_ID`, and callbacks keyed by Bible id.

- [x] **Step 1: Write failing tab-list and drafting-state tests**

```tsx
render(
  <BibleTabList
    sourceLabel='WEB'
    resourceTabs={[
      { id: 'aq-1', label: 'ULT' },
      { id: 'yv-2', label: 'NIV' },
    ]}
    activeTabId='yv-2'
    onSelect={onSelect}
    onClose={onClose}
  />
);
expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['WEB', 'ULT', 'NIV']);
expect(screen.getByRole('tab', { name: 'WEB' })).toHaveAttribute('aria-selected', 'false');
await user.click(screen.getByRole('button', { name: 'Close NIV' }));
expect(onClose).toHaveBeenCalledWith('yv-2');
```

Extend the `ResourcePanel` mock in `DraftingUI.test.tsx` to select two keyed Bibles and assert that `WEB`, `Alternative Bible`, and `Second Bible` remain available together, with each selection restoring its own verses.

- [x] **Step 2: Run the focused tests and verify RED**

Run: `pnpm test src/features/bible/components/BibleTabList.test.tsx src/features/bible/components/DraftingUI.test.tsx`

Expected: FAIL because `BibleTabList` and the keyed multi-tab callbacks do not exist.

- [x] **Step 3: Implement the reusable tab strip and keyed selection contract**

```ts
export const SOURCE_BIBLE_TAB_ID = 'source';

export interface ResourceBibleTab {
  id: string;
  label: string;
  verses: BibleVerse[];
  isLoading: boolean;
}
```

`BibleTabList` renders the source as the first non-closable `role='tab'`, then every resource tab with a separate `Close <label>` button inside an `overflow-x-auto` tab list. `ResourcePanel` reports `onBibleSelect({ id, label })`, `onBibleVersesChange(id, verses)`, and `onBibleLoadingChange(id, loading)`. `DraftingUI` appends unseen ids, activates existing ids without duplicating them, updates content by id, and falls back to the source when the active resource tab closes.

- [x] **Step 4: Run the focused tests and verify GREEN**

Run: `pnpm test src/features/bible/components/BibleTabList.test.tsx src/features/bible/components/DraftingUI.test.tsx`

Expected: PASS with the permanent source tab, multiple resource tabs, keyed content restoration, and close fallback covered.

- [x] **Step 5: Commit the tab model**

```bash
git add src/features/bible/components/BibleTabList.tsx \
  src/features/bible/components/BibleTabList.test.tsx \
  src/features/bible/components/DraftingResourceSidebar.tsx \
  src/features/bible/components/DraftingUI.tsx \
  src/features/bible/components/DraftingUI.test.tsx \
  src/features/resources/components/ResourcePanel.tsx
git commit -m "fix: preserve source Bible resource tabs"
```

### Task 2: Chapter View headers and no-content state

**Files:**

- Create: `src/features/bible/components/DraftingChapterView.test.tsx`
- Modify: `src/features/bible/components/DraftingChapterView.tsx`
- Modify: `src/features/bible/components/DraftingUI.tsx`
- Modify: `public/locales/en/common.json`

**Interfaces:**

- Consumes: `ResourceBibleTab[]`, `activeTabId`, `onSelectTab`, and `onCloseTab` from `DraftingUI`.
- Produces: a two-column Chapter View whose first row contains the Bible tabs and target-language name, and whose source pane renders source/resource/loading/empty states without removing the source tab.

- [x] **Step 1: Write failing Chapter View behavior tests**

```tsx
render(<DraftingChapterView {...props} resourceBibleTabs={[]} activeBibleTabId='source' />);
expect(screen.getByRole('tab', { name: 'WEB' })).toBeInTheDocument();
expect(screen.getByText('Spanish')).toBeInTheDocument();

render(
  <DraftingChapterView
    {...props}
    activeBibleTabId='aq-empty'
    resourceBibleTabs={[{ id: 'aq-empty', label: 'Empty Bible', verses: [], isLoading: false }]}
  />
);
expect(screen.getByRole('tab', { name: 'WEB' })).toBeInTheDocument();
expect(
  screen.getByText("This Bible verse doesn't have content for this passage.")
).toBeInTheDocument();
```

Add a third case that opens two resource tabs, switches back to `WEB`, and verifies the source verse text is rendered again.

- [x] **Step 2: Run the Chapter View test and verify RED**

Run: `pnpm test src/features/bible/components/DraftingChapterView.test.tsx`

Expected: FAIL because Chapter View has no Bible tab header, no target-language header, and no resource empty state.

- [x] **Step 3: Implement the Chapter View states and exact copy**

Use `BibleTabList` above the independently scrolling source pane. Resolve the active resource tab by id; show a spinner while `isLoading`, the translated `noContentAvailable` message when its `verses` array is empty, and verse content otherwise. Keep the right `ChapterEditor` mounted beside it and label that column with `projectItem.targetLanguage`. Change the English `noContentAvailable` value to the exact issue text.

- [x] **Step 4: Run focused and full checks**

Run: `pnpm test src/features/bible/components/DraftingChapterView.test.tsx src/features/bible/components/BibleTabList.test.tsx src/features/bible/components/DraftingUI.test.tsx`

Expected: PASS.

Run: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build`

Expected: all commands exit 0.

- [x] **Step 5: Commit the Chapter View behavior and plan**

```bash
git add docs/features/chapter-resource-bible-tabs/plan.md \
  public/locales/en/common.json \
  src/features/bible/components/DraftingChapterView.tsx \
  src/features/bible/components/DraftingChapterView.test.tsx \
  src/features/bible/components/DraftingUI.tsx
git commit -m "fix: show Bible tabs in chapter view"
```

### Task 3: Browser validation and PR handoff

**Files:**

- No production file changes expected.

**Interfaces:**

- Consumes: the completed branch and local Fluent development stack.
- Produces: browser evidence for source, multiple-resource, empty-content, and reduced-width states plus a PR linked to #471.

- [x] **Step 1: Start a focused browser harness for Chapter View**

Use an ephemeral Vite entry point that mounts the real `DraftingChapterView`, styles, editor, and i18n with controlled source and resource data. This avoids committing credentials or depending on unavailable local API environment files. Remove the harness after validation.

- [x] **Step 2: Validate the requested states in a browser**

Verify Chapter View shows the source name before Resources opens; selecting two Bibles leaves all three tabs visible; switching to the source restores its content; an empty resource shows the exact message; and the tab strip remains reachable at a narrow viewport.

- [x] **Step 3: Perform the fresh completion gate**

Run: `pnpm precheck && pnpm build && git diff --check && git status --short --branch`

Expected: checks and build exit 0, the diff has no whitespace errors, and the worktree contains only intentional committed changes.

- [x] **Step 4: Push and open the linked PR**

```bash
git push -u origin fix/471-chapter-source-bible-tabs
gh pr create --repo eten-tech-foundation/fluent-web --base main \
  --head fix/471-chapter-source-bible-tabs \
  --title "fix: keep source Bible visible in Chapter View" \
  --body-file /tmp/fluent-web-471-pr.md
```

The short PR body states the behavior change and tests and includes `Fixes #471`. Do not merge.

## Self-Review

- Spec coverage: source name, permanent source access, multiple additional Bible tabs, exact empty state, and narrow-width behavior are each assigned to a test and implementation step.
- Placeholder scan: the plan contains no deferred implementation or unspecified test step.
- Type consistency: `ResourceBibleTab`, `SOURCE_BIBLE_TAB_ID`, and all keyed callbacks use the same ids and fields across both tasks.
