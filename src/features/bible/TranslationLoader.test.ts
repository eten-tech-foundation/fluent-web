import { isRedirect } from '@tanstack/react-router';
import { beforeEach, describe, expect, it } from 'vitest';

import { translationLoader } from '@/features/bible/TranslationLoader';
import type { ProjectItem } from '@/lib/types';
import { useAppStore } from '@/store/store';

/**
 * A fresh session has neither `userdetail` nor `currentProjectItem` in the store — that is every
 * deep link, new tab, or shared URL. The loader used to throw plain Errors there, which the route
 * surfaces as the "Something went wrong" boundary (#427, bug 4). A session that cannot resolve
 * its context belongs back on the dashboard instead.
 */
describe('translationLoader without in-app navigation state', () => {
  beforeEach(() => {
    useAppStore.setState({ userdetail: null, currentProjectItem: null });
  });

  it('redirects to the dashboard when user details are missing', async () => {
    const thrown = await translationLoader({ location: {} }).then(
      () => undefined,
      error => error as unknown
    );
    expect(isRedirect(thrown)).toBe(true);
  });

  it('redirects to the dashboard when no project item can be resolved', async () => {
    useAppStore.setState({
      userdetail: { id: 2, email: 't@fluent.local' } as never,
    });
    const thrown = await translationLoader({ location: {} }).then(
      () => undefined,
      error => error as unknown
    );
    expect(isRedirect(thrown)).toBe(true);
  });

  it('still loads normally when navigation state provides the project item', async () => {
    useAppStore.setState({
      userdetail: { id: 2, email: 't@fluent.local' } as never,
    });
    const projectItem = { chapterAssignmentId: 1 } as ProjectItem;
    const thrown = await translationLoader({ location: { state: { projectItem } } }).then(
      () => undefined,
      error => error as unknown
    );
    // It gets past the guards; whatever it throws afterwards is the fetch layer, not a redirect.
    expect(isRedirect(thrown)).toBe(false);
  });
});
