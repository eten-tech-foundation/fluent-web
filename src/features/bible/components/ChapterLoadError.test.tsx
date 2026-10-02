import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Route as TranslationRoute } from '@/routes/_authenticated/translation/$bookId/$chapterNumber';

vi.mock('@/features/bible/components/DraftingPage', () => ({ default: () => null }));
vi.mock('@/features/bible/TranslationLoader', () => ({ translationLoader: vi.fn() }));

describe('chapter load failure', () => {
  it('shows the required refresh message instead of opening an empty editor', async () => {
    const root = createRootRoute();
    const chapter = createRoute({
      getParentRoute: () => root,
      path: '/translation/$bookId/$chapterNumber',
      loader: () => {
        throw new Error('database connection detail');
      },
      errorComponent: TranslationRoute.options.errorComponent,
      component: () => <div data-testid='editor'>Chapter text</div>,
    });
    const router = createRouter({
      routeTree: root.addChildren([chapter]),
      history: createMemoryHistory({ initialEntries: ['/translation/2/2'] }),
    });
    render(<RouterProvider router={router} />);
    expect(await screen.findByText('Refresh the page to try again.')).toBeVisible();
    expect(screen.queryByTestId('editor')).not.toBeInTheDocument();
    expect(screen.queryByText('database connection detail')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeVisible();
  });
});
