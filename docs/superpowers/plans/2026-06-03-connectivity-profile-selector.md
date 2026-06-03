# Connectivity Profile Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional "Connectivity Profile" dropdown (with an info tooltip) to the Create Project modal, persisting the choice in the project's existing `metadata` blob.

**Architecture:** Pure leaf modules first (i18n strings, a constants module, a pure metadata-mapping helper — each unit-tested where it has logic), then wire them into the existing `CreateProjectModal.tsx` UI and the `handleSave` payload mapping in `index.tsx`. No `fluent-api`/DB/`fluent-mobile` changes — the API already accepts, persists, and returns `metadata`.

**Tech Stack:** React + TypeScript, Vite, shadcn/ui (`Select`, `Tooltip`), `react-i18next`, `lucide-react`, `vitest`.

**Spec:** `docs/superpowers/specs/2026-06-03-connectivity-profile-selector-design.md`

**Branch:** `feat/connectivity-profile-selector` (already created).

**Contract established for downstream consumers:** `project.metadata.connectivityProfile` ∈ `{ usually_connected, sometimes_connected, rarely_connected }`; key omitted entirely when unset (consumers treat absent as *Rarely Connected*).

---

### Task 1: Add i18n strings (English + Hindi)

**Files:**
- Modify: `public/locales/en/common.json`
- Modify: `public/locales/hi/common.json`

- [ ] **Step 1: Add English keys**

In `public/locales/en/common.json`, the current last entry is `"books": "Book(s)"` (no trailing comma). Add a comma after it and append the new keys, so the tail of the object becomes:

```json
  "books": "Book(s)",
  "connectivityProfile": "Connectivity Profile",
  "connectivityProfilePlaceholder": "Select profile",
  "connectivityUsuallyConnected": "Usually Connected",
  "connectivitySometimesConnected": "Sometimes Connected",
  "connectivityRarelyConnected": "Rarely Connected",
  "connectivityTooltipUsually": "Usually Connected — Resources load on demand when chapters open; no download preparation is required.",
  "connectivityTooltipSometimes": "Sometimes Connected — The app silently caches assigned chapters in the background when WiFi is detected; assigned translators take no action.",
  "connectivityTooltipRarely": "Rarely Connected — The app prompts translators to prepare their device each time WiFi is detected before going offline."
}
```

- [ ] **Step 2: Add Hindi keys (flagged for native-speaker review)**

In `public/locales/hi/common.json`, the current last entry is `"books": "पुस्तक(एं)"` (no trailing comma). Add a comma after it and append (these are first-pass translations — leave a PR note asking a native speaker to review):

```json
  "books": "पुस्तक(एं)",
  "connectivityProfile": "कनेक्टिविटी प्रोफ़ाइल",
  "connectivityProfilePlaceholder": "प्रोफ़ाइल चुनें",
  "connectivityUsuallyConnected": "आमतौर पर कनेक्टेड",
  "connectivitySometimesConnected": "कभी-कभी कनेक्टेड",
  "connectivityRarelyConnected": "शायद ही कभी कनेक्टेड",
  "connectivityTooltipUsually": "आमतौर पर कनेक्टेड — अध्याय खुलने पर संसाधन मांग पर लोड होते हैं; किसी डाउनलोड तैयारी की आवश्यकता नहीं है।",
  "connectivityTooltipSometimes": "कभी-कभी कनेक्टेड — WiFi मिलने पर ऐप पृष्ठभूमि में सौंपे गए अध्यायों को चुपचाप कैश करता है; सौंपे गए अनुवादक कोई कार्रवाई नहीं करते।",
  "connectivityTooltipRarely": "शायद ही कभी कनेक्टेड — ऑफ़लाइन जाने से पहले हर बार WiFi मिलने पर ऐप अनुवादकों से उनका डिवाइस तैयार करने के लिए कहता है।"
}
```

- [ ] **Step 3: Verify both files are valid JSON**

Run: `node -e "require('./public/locales/en/common.json'); require('./public/locales/hi/common.json'); console.log('OK')"`
Expected: prints `OK` (no JSON parse error).

- [ ] **Step 4: Commit**

```bash
git add public/locales/en/common.json public/locales/hi/common.json
git commit -m "i18n: add connectivity profile strings (#280)"
```

---

### Task 2: Connectivity profile constants module

**Files:**
- Create: `src/lib/constants/connectivityProfiles.ts`
- Test: `src/lib/constants/connectivityProfiles.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/constants/connectivityProfiles.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { CONNECTIVITY_PROFILE_OPTIONS } from './connectivityProfiles';

describe('CONNECTIVITY_PROFILE_OPTIONS', () => {
  it('lists the three profiles in the order required by issue #280', () => {
    expect(CONNECTIVITY_PROFILE_OPTIONS.map(option => option.value)).toEqual([
      'usually_connected',
      'sometimes_connected',
      'rarely_connected',
    ]);
  });

  it('pairs each profile with a label and description i18n key', () => {
    for (const option of CONNECTIVITY_PROFILE_OPTIONS) {
      expect(option.labelKey).toBeTruthy();
      expect(option.descKey).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/lib/constants/connectivityProfiles.test.ts`
Expected: FAIL — cannot resolve `./connectivityProfiles` (module does not exist yet).

- [ ] **Step 3: Create the constants module**

Create `src/lib/constants/connectivityProfiles.ts`:

```ts
export type ConnectivityProfile =
  | 'usually_connected'
  | 'sometimes_connected'
  | 'rarely_connected';

export interface ConnectivityProfileOption {
  value: ConnectivityProfile;
  labelKey: string;
  descKey: string;
}

// Ordered exactly as issue #280 requires: Usually, Sometimes, Rarely.
export const CONNECTIVITY_PROFILE_OPTIONS: ConnectivityProfileOption[] = [
  {
    value: 'usually_connected',
    labelKey: 'connectivityUsuallyConnected',
    descKey: 'connectivityTooltipUsually',
  },
  {
    value: 'sometimes_connected',
    labelKey: 'connectivitySometimesConnected',
    descKey: 'connectivityTooltipSometimes',
  },
  {
    value: 'rarely_connected',
    labelKey: 'connectivityRarelyConnected',
    descKey: 'connectivityTooltipRarely',
  },
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/lib/constants/connectivityProfiles.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/constants/connectivityProfiles.ts src/lib/constants/connectivityProfiles.test.ts
git commit -m "feat: add connectivity profile constants (#280)"
```

---

### Task 3: Pure metadata-mapping helper

**Files:**
- Create: `src/features/projects/lib/projectMetadata.ts`
- Test: `src/features/projects/lib/projectMetadata.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/projects/lib/projectMetadata.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { buildProjectMetadata } from './projectMetadata';

describe('buildProjectMetadata', () => {
  it('returns an empty object when no profile is selected', () => {
    expect(buildProjectMetadata(null)).toEqual({});
    expect(buildProjectMetadata(undefined)).toEqual({});
  });

  it('embeds the selected profile under connectivityProfile', () => {
    expect(buildProjectMetadata('rarely_connected')).toEqual({
      connectivityProfile: 'rarely_connected',
    });
    expect(buildProjectMetadata('usually_connected')).toEqual({
      connectivityProfile: 'usually_connected',
    });
    expect(buildProjectMetadata('sometimes_connected')).toEqual({
      connectivityProfile: 'sometimes_connected',
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/features/projects/lib/projectMetadata.test.ts`
Expected: FAIL — cannot resolve `./projectMetadata` (module does not exist yet).

- [ ] **Step 3: Create the helper**

Create `src/features/projects/lib/projectMetadata.ts`:

```ts
import type { ConnectivityProfile } from '@/lib/constants/connectivityProfiles';

/**
 * Builds the project `metadata` payload for project creation.
 * Omits the connectivityProfile key entirely when unset so downstream
 * consumers (the Fluent mobile app) treat "absent" as the Rarely Connected default.
 */
export function buildProjectMetadata(
  connectivityProfile: ConnectivityProfile | null | undefined
): Record<string, unknown> {
  return connectivityProfile ? { connectivityProfile } : {};
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/features/projects/lib/projectMetadata.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/projects/lib/projectMetadata.ts src/features/projects/lib/projectMetadata.test.ts
git commit -m "feat: add buildProjectMetadata helper (#280)"
```

---

### Task 4: Add the selector + tooltip to the Create Project modal

**Files:**
- Modify: `src/features/projects/components/CreateProjectModal.tsx`

This task has no automated test (no `@testing-library/react` in the repo); it is verified by typecheck + manual smoke in Task 6.

- [ ] **Step 1: Add imports**

In `src/features/projects/components/CreateProjectModal.tsx`:

Change the lucide import (line 3) from:

```ts
import { Loader2, TriangleAlert } from 'lucide-react';
```

to:

```ts
import { Info, Loader2, TriangleAlert } from 'lucide-react';
```

After the existing `Select` import block (the import ending `} from '@/components/ui/select';`, line 17), add:

```ts
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
```

After the existing `Logger` import (line 20), add:

```ts
import {
  CONNECTIVITY_PROFILE_OPTIONS,
  type ConnectivityProfile,
} from '@/lib/constants/connectivityProfiles';
```

- [ ] **Step 2: Extend the data interfaces**

In the exported `CreateProjectData` interface (currently lines 22-28), add a final optional field:

```ts
export interface CreateProjectData {
  title: string;
  targetLanguage: number;
  sourceLanguage: number;
  sourceBible: number;
  books: number[];
  connectivityProfile?: ConnectivityProfile | null;
}
```

In the internal `FormData` interface (currently lines 38-44), add:

```ts
interface FormData {
  title: string;
  targetLanguage: number | null;
  sourceLanguage: number | null;
  sourceBible: number | null;
  books: number[];
  connectivityProfile: ConnectivityProfile | null;
}
```

- [ ] **Step 3: Initialize and reset the new field**

In the `useState<FormData>` initializer (currently lines 56-62), add `connectivityProfile: null,` as the last property:

```ts
  const [formData, setFormData] = useState<FormData>({
    title: '',
    targetLanguage: null,
    sourceLanguage: null,
    sourceBible: null,
    books: [],
    connectivityProfile: null,
  });
```

In the `isOpen` reset effect (currently lines 70-81), add the same property to the `setFormData({...})` call:

```ts
  useEffect(() => {
    if (isOpen) {
      setFormData({
        title: '',
        targetLanguage: null,
        sourceLanguage: null,
        sourceBible: null,
        books: [],
        connectivityProfile: null,
      });
    }
    setIsSubmitting(false);
  }, [isOpen]);
```

- [ ] **Step 4: Include the field in the onSave payload**

In `handleSubmit` (currently lines 122-128), add `connectivityProfile` to the `onSave({...})` call:

```ts
      await onSave({
        title: formData.title,
        targetLanguage: formData.targetLanguage,
        sourceLanguage: formData.sourceLanguage,
        sourceBible: formData.sourceBible,
        books: formData.books,
        connectivityProfile: formData.connectivityProfile,
      });
```

(Leave `isFormValid()` untouched — the field is optional and must not gate submission.)

- [ ] **Step 5: Render the field**

Insert the following block immediately AFTER the Books field's closing `</div>` (currently line 291) and BEFORE the submit-row `<div className='flex items-center justify-end pt-4'>` (currently line 293):

```tsx
          <div className='space-y-2'>
            <div className='flex items-center gap-1'>
              <Label htmlFor='connectivityProfile'>{t('connectivityProfile')}</Label>
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      aria-label={t('connectivityProfile')}
                      className='text-muted-foreground hover:text-foreground'
                      type='button'
                    >
                      <Info className='h-4 w-4' />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className='max-w-xs' side='top'>
                    <ul className='space-y-1'>
                      {CONNECTIVITY_PROFILE_OPTIONS.map(option => (
                        <li key={option.value}>{t(option.descKey)}</li>
                      ))}
                    </ul>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Select
              value={formData.connectivityProfile ?? ''}
              onValueChange={value => updateFormData('connectivityProfile', value)}
            >
              <SelectTrigger className='w-full bg-white' id='connectivityProfile'>
                <SelectValue placeholder={t('connectivityProfilePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {CONNECTIVITY_PROFILE_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
```

Note: `updateFormData` accepts `string | number | number[] | null`, so passing the Radix `value` string is fine — it is stored into the `connectivityProfile` slot, which is typed `ConnectivityProfile | null`. No cast is required.

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no type errors).

- [ ] **Step 7: Commit**

```bash
git add src/features/projects/components/CreateProjectModal.tsx
git commit -m "feat: add connectivity profile selector to create project modal (#280)"
```

---

### Task 5: Persist the selection via metadata in handleSave

**Files:**
- Modify: `src/features/projects/components/index.tsx`

- [ ] **Step 1: Import the helper**

In `src/features/projects/components/index.tsx`, after the existing `Logger` import (line 7), add:

```ts
import { buildProjectMetadata } from '@/features/projects/lib/projectMetadata';
```

- [ ] **Step 2: Use the helper in the create payload**

In `handleSave` (currently lines 46-69), change the `metadata` line in the `newProjectData` object from:

```ts
        metadata: {},
```

to:

```ts
        metadata: buildProjectMetadata(projectData.connectivityProfile),
```

The full object becomes:

```ts
      const newProjectData: Omit<CreateProject, 'id' | 'createdAt' | 'updatedAt'> = {
        name: projectData.title,
        targetLanguage: projectData.targetLanguage,
        sourceLanguage: projectData.sourceLanguage,
        bibleId: projectData.sourceBible,
        bookId: projectData.books,
        organization: Number(userdetail?.organization),
        createdBy: Number(userdetail?.id),
        metadata: buildProjectMetadata(projectData.connectivityProfile),
      };
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (`projectData.connectivityProfile` is now part of `CreateProjectData`; `buildProjectMetadata` returns `Record<string, unknown>`, matching `CreateProject.metadata`).

- [ ] **Step 4: Commit**

```bash
git add src/features/projects/components/index.tsx
git commit -m "feat: persist connectivity profile in project metadata (#280)"
```

---

### Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full precheck**

Run: `pnpm precheck`
Expected: PASS — lint, format check, typecheck, and all vitest tests (including the two new test files) green.

If `format:check` fails, run `pnpm format` (prettier `--write` over `src/**`), re-stage, and amend the most recent commit. (`format:check` only globs `src/**`, so the `public/locales` JSON files are not format-checked.)

- [ ] **Step 2: Manual smoke test**

Run: `pnpm dev`, log in as a Project Manager, open **Create Project**. Confirm:
- The **Connectivity Profile** dropdown renders **last**, after Books, with placeholder **"Select profile"** and **no** red asterisk.
- The **Info** icon beside the label shows a tooltip listing all three profile descriptions on hover/focus.
- The three options appear in order: Usually Connected, Sometimes Connected, Rarely Connected.
- The project can be created with the field **left unset** (submit is not blocked by it).
- With a profile selected, the POST `/projects` request body contains `metadata: { connectivityProfile: "<value>" }` (check the Network tab); with it unset, `metadata` is `{}`.

- [ ] **Step 3: Push the branch and open a PR**

```bash
git push -u origin feat/connectivity-profile-selector
gh pr create --fill --base main --title "Add connectivity profile selector to project creation (#280)"
```

In the PR description, note that the Hindi i18n strings are first-pass machine translations and need native-speaker review, and link issue #280.

---

## Self-Review

**Spec coverage:**
- Dropdown labeled "Connectivity Profile" → Task 4 Step 5 (`<Label>{t('connectivityProfile')}</Label>`). ✓
- Three options in order Usually/Sometimes/Rarely → Task 2 (constants order) + Task 2 ordering test + Task 4 render. ✓
- Placeholder "Select profile" → Task 1 (`connectivityProfilePlaceholder`) + Task 4 `SelectValue`. ✓
- Info tooltip (`li:info`) describing all three → Task 4 Step 5 (lucide `Info` + tooltip mapping over options). ✓
- Optional field, does not gate submit → Task 4 Step 4 note (no `isFormValid()` change). ✓
- Unset → omitted from metadata (mobile defaults to Rarely Connected) → Task 3 helper + test, Task 5 wiring. ✓
- Storage contract `metadata.connectivityProfile`, snake_case values → Task 2 type + Task 3 helper. ✓
- No `fluent-api`/DB/mobile changes → only `fluent-web` files touched. ✓
- Hindi parity → Task 1 Step 2. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N". All code shown in full. ✓

**Type consistency:** `ConnectivityProfile` (Task 2) is imported and used identically in Task 3 (helper param), Task 4 (`CreateProjectData`/`FormData`), and flows into Task 5. `buildProjectMetadata` signature matches between Task 3 definition and Task 5 call site. `CONNECTIVITY_PROFILE_OPTIONS` shape (`value`/`labelKey`/`descKey`) is consistent between Task 2 definition and Task 4 usage. i18n keys in Task 1 match those referenced in Task 2 (`labelKey`/`descKey`) and Task 4 (`connectivityProfile`/`connectivityProfilePlaceholder`). ✓
