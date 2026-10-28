import { QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { toast } from 'sonner';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { EditProjectMetadataDialog } from '@/features/projects/components/EditProjectMetadataDialog';
import { type BookDetails } from '@/features/projects/hooks/useBookDetails';
import { config } from '@/lib/config';
import { server } from '@/test/msw/server';
import {
  createTestQueryClient,
  fireEvent,
  render,
  renderWithProviders,
  screen,
  waitFor,
} from '@/test/render';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values ? [key, ...Object.values(values)].join(' ') : key,
  }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const genesis: BookDetails = {
  bookId: 1,
  bookCode: 'GEN',
  bookName: 'Genesis',
  runningHeader: null,
  bookTitle: 'The First Book of Moses',
  tocLongName: null,
  tocShortName: null,
  tocAbbreviation: null,
};

const exodus: BookDetails = {
  bookId: 2,
  bookCode: 'EXO',
  bookName: 'Exodus',
  runningHeader: null,
  bookTitle: null,
  tocLongName: 'Exodus',
  tocShortName: 'Exo',
  tocAbbreviation: 'Ex',
};

const listUrl = `${config.api.url}/project-units/7/book-details`;

interface Patch {
  bookId: string;
  body: Record<string, string | null>;
}

function mockApi(options: { patchStatus?: number; patchMessage?: string } = {}): Patch[] {
  const patches: Patch[] = [];
  server.use(
    http.get(listUrl, () => HttpResponse.json([genesis, exodus])),
    http.patch(`${listUrl}/:bookId`, async ({ params, request }) => {
      const body = (await request.json()) as Record<string, string | null>;
      patches.push({ bookId: String(params.bookId), body });
      if (options.patchStatus) {
        return HttpResponse.json(
          { message: options.patchMessage },
          { status: options.patchStatus }
        );
      }
      const book = [genesis, exodus].find(item => String(item.bookId) === params.bookId);
      return HttpResponse.json({ ...book, ...body });
    })
  );
  return patches;
}

function renderDialog(onClose = vi.fn()) {
  const queryClient = createTestQueryClient();
  const utils = render(<EditProjectMetadataDialog isOpen projectUnitId={7} onClose={onClose} />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  return { ...utils, onClose, queryClient, user: userEvent.setup() };
}

const bookTrigger = (name: string) => screen.findByRole('button', { name: new RegExp(name) });

describe('EditProjectMetadataDialog', () => {
  // jsdom has neither. The dialog calls scrollIntoView once a book has finished opening, and
  // scrollBy to move the list for a wheel outside it.
  const scrollIntoView = vi.fn();
  const scrollBy = vi.fn();
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollBy', {
      configurable: true,
      value: scrollBy,
    });
  });
  afterAll(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollBy');
  });

  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
    scrollIntoView.mockClear();
    scrollBy.mockClear();
  });

  it('lists the books of the project collapsed', async () => {
    mockApi();
    renderDialog();

    expect(await bookTrigger('Genesis')).toBeInTheDocument();
    expect(await bookTrigger('Exodus')).toBeInTheDocument();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('expands several books at once and shows the TOC values as stored', async () => {
    mockApi();
    const { user } = renderDialog();

    await user.click(await bookTrigger('Genesis'));
    await user.click(await bookTrigger('Exodus'));

    expect(screen.getAllByRole('textbox')).toHaveLength(6);
    const [longName, shortName, abbreviation, ...exodusFields] = screen.getAllByRole('textbox');
    expect(longName).toHaveAttribute('placeholder', 'bookLongNamePlaceholder');
    expect(shortName).toHaveAttribute('placeholder', 'bookShortNamePlaceholder');
    expect(abbreviation).toHaveAttribute('placeholder', 'bookAbbreviationPlaceholder');
    // Genesis has a book title (\mt) and no TOC values. The title is not a Short Name: it is
    // exported as \mt1 on its own, so showing it here would claim a \toc2 the file never has.
    expect(longName).toHaveValue('');
    expect(shortName).toHaveValue('');
    expect(abbreviation).toHaveValue('');
    expect(exodusFields.map(input => (input as HTMLInputElement).value)).toEqual([
      'Exodus',
      'Exo',
      'Ex',
    ]);
  });

  it.each([
    ['bookLongName', '\\toc1'],
    ['bookShortName', '\\toc2'],
    ['bookAbbreviation', '\\toc3'],
  ])('shows the %s marker in a tooltip on its label', async (label, marker) => {
    mockApi();
    const { user } = renderDialog();
    await user.click(await bookTrigger('Genesis'));

    await user.hover(screen.getByText(label));

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent(`storedAsMarker ${marker}`);
    // Radix parks the content at translate(0, -200%) until it has measured the trigger. With
    // no element to measure it never moves, and the dialog's transform turns that parking spot
    // into a box above the dialog's top-left corner (QA on #398).
    const wrapper = tooltip.closest<HTMLElement>('[data-radix-popper-content-wrapper]');
    await waitFor(() => expect(wrapper?.style.transform).not.toContain('-200%'));
  });

  it('gives each field its marker as an accessible description, with no extra button', async () => {
    mockApi();
    const { user } = renderDialog();
    await user.click(await bookTrigger('Genesis'));

    // The tooltip only opens on hover, like the app's other text tooltips, so keyboard and
    // screen reader users get the same text from the input itself.
    expect(screen.getByLabelText('bookLongName')).toHaveAccessibleDescription(
      'storedAsMarker \\toc1'
    );
    expect(screen.getByLabelText('bookShortName')).toHaveAccessibleDescription(
      'storedAsMarker \\toc2'
    );
    expect(screen.getByLabelText('bookAbbreviation')).toHaveAccessibleDescription(
      'storedAsMarker \\toc3'
    );
    expect(
      screen.queryAllByRole('button', { name: /bookLongName|bookShortName|bookAbbreviation/ })
    ).toHaveLength(0);
  });

  // QA on #398 and Chad's call: the title, the X and Close stay put and only the book list
  // scrolls. jsdom has no layout, so these pin the structure and the wheel hand-off; the E2E suite
  // checks the positions in Chromium and Firefox.
  const bookList = () => {
    const lists = screen.getByRole('dialog').querySelectorAll('.overflow-y-auto');
    expect(lists).toHaveLength(1);
    return lists[0] as HTMLElement;
  };

  it('scrolls only the book list, so the title, the X and Close stay in place', async () => {
    mockApi();
    renderDialog();
    const genesis = await bookTrigger('Genesis');

    expect(screen.getByRole('dialog')).not.toHaveClass('overflow-y-auto');
    const list = bookList();
    expect(list).toContainElement(genesis);
    expect(list).not.toContainElement(screen.getByRole('heading', { name: 'editProjectMetadata' }));
    expect(list).not.toContainElement(screen.getByRole('button', { name: 'Close' }));
    expect(list).not.toContainElement(screen.getByRole('button', { name: 'close' }));
  });

  it('keeps a save error next to Close, outside the scrolling books', async () => {
    mockApi({ patchStatus: 400, patchMessage: 'must not contain pipes' });
    const { user, unmount } = renderDialog();

    await user.click(await bookTrigger('Genesis'));
    await user.type(screen.getByPlaceholderText('bookLongNamePlaceholder'), 'a|b');
    await user.tab();

    const alert = await screen.findByRole('alert');
    expect(bookList()).not.toContainElement(alert);
    expect(screen.getByRole('button', { name: 'close' }).closest('.grid')).toContainElement(alert);
    // The failed edit is saved again on unmount; let that land while the handlers still exist.
    unmount();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('must not contain pipes'));
  });

  it('scrolls the books with a wheel over the title or the footer', async () => {
    mockApi();
    renderDialog();
    const genesis = await bookTrigger('Genesis');
    const list = bookList();

    fireEvent.wheel(screen.getByRole('heading', { name: 'editProjectMetadata' }), { deltaY: 100 });
    // Firefox can report the wheel in lines, and a page step is the list's own height.
    fireEvent.wheel(screen.getByRole('button', { name: 'close' }), { deltaY: 3, deltaMode: 1 });
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 500 });
    fireEvent.wheel(screen.getByRole('button', { name: 'close' }), { deltaY: -1, deltaMode: 2 });

    expect(scrollBy.mock.calls).toEqual([[{ top: 100 }], [{ top: 120 }], [{ top: -500 }]]);
    expect(scrollBy.mock.contexts.every(context => context === list)).toBe(true);

    // Over the books themselves the browser scrolls the list on its own.
    fireEvent.wheel(genesis, { deltaY: 100 });
    expect(scrollBy).toHaveBeenCalledTimes(3);
  });

  it('brings a book into view once it has finished opening', async () => {
    mockApi();
    const { user } = renderDialog();

    await user.click(await bookTrigger('Genesis'));
    const region = screen.getByRole('region', { name: /Genesis/ });
    // An animation inside the fields is not the book opening.
    fireEvent.animationEnd(screen.getByPlaceholderText('bookLongNamePlaceholder'));
    expect(scrollIntoView).not.toHaveBeenCalled();

    fireEvent.animationEnd(region);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    // The whole book, header included, so the user still sees which book the fields belong to.
    expect(scrollIntoView.mock.contexts[0]).toBe(region.parentElement);
  });

  it('saves a changed field when it loses focus', async () => {
    const patches = mockApi();
    const { user } = renderDialog();

    await user.click(await bookTrigger('Genesis'));
    await user.type(screen.getByPlaceholderText('bookLongNamePlaceholder'), 'Genesis');
    await user.tab();

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({ bookId: '1', body: { tocLongName: 'Genesis' } });
  });

  it('does not save a field that did not change', async () => {
    const patches = mockApi();
    const { user } = renderDialog();

    await user.click(await bookTrigger('Exodus'));
    await user.click(screen.getByPlaceholderText('bookLongNamePlaceholder'));
    await user.tab();
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(patches).toHaveLength(0);
  });

  it('clears a field by sending null', async () => {
    const patches = mockApi();
    const { user } = renderDialog();

    await user.click(await bookTrigger('Exodus'));
    await user.clear(screen.getByPlaceholderText('bookAbbreviationPlaceholder'));
    await user.tab();

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({ bookId: '2', body: { tocAbbreviation: null } });
  });

  it('saves pending changes once when the dialog closes', async () => {
    const patches = mockApi();
    const { user, onClose } = renderDialog();

    await user.click(await bookTrigger('Genesis'));
    await user.type(screen.getByPlaceholderText('bookAbbreviationPlaceholder'), 'Gn');
    await user.click(screen.getByRole('button', { name: 'close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({ bookId: '1', body: { tocAbbreviation: 'Gn' } });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(patches).toHaveLength(1);
  });

  it('shows the API message when a save fails', async () => {
    mockApi({ patchStatus: 400, patchMessage: 'must not contain pipes' });
    const { user, unmount } = renderDialog();

    await user.click(await bookTrigger('Genesis'));
    await user.type(screen.getByPlaceholderText('bookLongNamePlaceholder'), 'a|b');
    await user.tab();

    expect(await screen.findByRole('alert')).toHaveTextContent('must not contain pipes');
    unmount();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('must not contain pipes'));
  });

  it('waits for an in-flight save before sending the next one for the same field', async () => {
    const patches: Patch[] = [];
    let release: (() => void) | undefined;
    const held = new Promise<void>(resolve => {
      release = resolve;
    });

    server.use(
      http.get(listUrl, () => HttpResponse.json([genesis, exodus])),
      http.patch(`${listUrl}/:bookId`, async ({ params, request }) => {
        const body = (await request.json()) as Record<string, string | null>;
        patches.push({ bookId: String(params.bookId), body });
        if (patches.length === 1) await held;
        return HttpResponse.json({ ...genesis, ...body });
      })
    );

    const { user } = renderDialog();
    await user.click(await bookTrigger('Genesis'));
    const longName = screen.getByPlaceholderText('bookLongNamePlaceholder');

    await user.type(longName, 'A');
    await user.tab();
    await waitFor(() => expect(patches).toHaveLength(1));

    await user.type(longName, 'B');
    await user.tab();
    await new Promise(resolve => setTimeout(resolve, 50));

    // The second PATCH must not be on the wire while the first is unanswered - a late 'A'
    // response would otherwise land on top of 'AB'.
    expect(patches).toHaveLength(1);

    release?.();
    await waitFor(() => expect(patches).toHaveLength(2));
    expect(patches.map(patch => patch.body)).toEqual([{ tocLongName: 'A' }, { tocLongName: 'AB' }]);
    await waitFor(() => expect(longName).toHaveValue('AB'));
  });

  it('keeps an edit whose close-time save failed and reports it outside the dialog', async () => {
    let release: (() => void) | undefined;
    const held = new Promise<void>(resolve => {
      release = resolve;
    });

    server.use(
      http.get(listUrl, () => HttpResponse.json([genesis, exodus])),
      http.patch(`${listUrl}/:bookId`, async () => {
        await held;
        return HttpResponse.json({ message: 'must not contain pipes' }, { status: 400 });
      })
    );

    const onClose = vi.fn();
    const { user, rerender, unmount } = renderWithProviders(
      <EditProjectMetadataDialog isOpen projectUnitId={7} onClose={onClose} />
    );

    await user.click(await bookTrigger('Genesis'));
    await user.type(screen.getByPlaceholderText('bookLongNamePlaceholder'), 'a|b');
    await user.click(screen.getByRole('button', { name: 'close' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    // The wrapper drives `isOpen` from the URL, so the dialog is gone before the PATCH answers.
    rerender(<EditProjectMetadataDialog isOpen={false} projectUnitId={7} onClose={onClose} />);
    release?.();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('must not contain pipes'));

    // Reopening still shows what the user typed: the failed edit was not thrown away.
    rerender(<EditProjectMetadataDialog isOpen projectUnitId={7} onClose={onClose} />);
    await user.click(await bookTrigger('Genesis'));
    expect(screen.getByPlaceholderText('bookLongNamePlaceholder')).toHaveValue('a|b');
    unmount();
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(2));
  });

  it('saves pending changes when the URL closes the dialog without a blur', async () => {
    const patches = mockApi();
    const { user, rerender, onClose, queryClient } = renderDialog();

    await user.click(await bookTrigger('Genesis'));
    await user.type(screen.getByPlaceholderText('bookLongNamePlaceholder'), 'Genesis');

    rerender(<EditProjectMetadataDialog isOpen={false} projectUnitId={7} onClose={onClose} />);

    await waitFor(() => expect(patches).toHaveLength(1));
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(patches[0]).toEqual({ bookId: '1', body: { tocLongName: 'Genesis' } });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('saves pending changes when navigation unmounts the dialog', async () => {
    const patches = mockApi();
    const { user, unmount, queryClient } = renderDialog();

    await user.click(await bookTrigger('Genesis'));
    await user.type(screen.getByPlaceholderText('bookAbbreviationPlaceholder'), 'Gn');
    unmount();

    await waitFor(() => expect(patches).toHaveLength(1));
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(patches[0]).toEqual({ bookId: '1', body: { tocAbbreviation: 'Gn' } });
  });

  it('isolates drafts and late save responses when the project changes', async () => {
    const patches: Array<Patch & { projectUnitId: string }> = [];
    let release: (() => void) | undefined;
    const held = new Promise<void>(resolve => {
      release = resolve;
    });
    server.use(
      http.get(`${config.api.url}/project-units/:projectUnitId/book-details`, ({ params }) =>
        HttpResponse.json([
          { ...genesis, tocLongName: params.projectUnitId === '7' ? 'Project A' : 'Project B' },
        ])
      ),
      http.patch(
        `${config.api.url}/project-units/:projectUnitId/book-details/:bookId`,
        async ({ params, request }) => {
          const body = (await request.json()) as Record<string, string | null>;
          patches.push({
            projectUnitId: String(params.projectUnitId),
            bookId: String(params.bookId),
            body,
          });
          if (params.projectUnitId === '7') await held;
          return HttpResponse.json({ ...genesis, ...body });
        }
      )
    );
    const { user, rerender, onClose, queryClient } = renderDialog();

    await user.click(await bookTrigger('Genesis'));
    await user.clear(screen.getByPlaceholderText('bookLongNamePlaceholder'));
    await user.type(screen.getByPlaceholderText('bookLongNamePlaceholder'), 'Shared title');

    rerender(<EditProjectMetadataDialog isOpen projectUnitId={8} onClose={onClose} />);

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({
      projectUnitId: '7',
      bookId: '1',
      body: { tocLongName: 'Shared title' },
    });
    expect(await bookTrigger('Genesis')).toHaveAttribute('aria-expanded', 'false');
    await user.click(await bookTrigger('Genesis'));
    const longName = screen.getByPlaceholderText('bookLongNamePlaceholder');
    expect(longName).toHaveValue('Project B');
    await user.clear(longName);
    await user.type(longName, 'Shared title');

    release?.();
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    // Project A's matching response must not settle Project B's unsaved draft.
    expect(longName).toHaveValue('Shared title');
    await user.tab();
    await waitFor(() => expect(patches).toHaveLength(2));
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(patches[1]).toEqual({
      projectUnitId: '8',
      bookId: '1',
      body: { tocLongName: 'Shared title' },
    });
  });
});
