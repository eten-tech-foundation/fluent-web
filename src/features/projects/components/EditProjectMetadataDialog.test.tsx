import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { EditProjectMetadataDialog } from '@/features/projects/components/EditProjectMetadataDialog';
import { type BookDetails } from '@/features/projects/hooks/useBookDetails';
import { config } from '@/lib/config';
import { server } from '@/test/msw/server';
import { renderWithProviders, screen, waitFor } from '@/test/render';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

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
  const utils = renderWithProviders(
    <EditProjectMetadataDialog isOpen projectUnitId={7} onClose={onClose} />
  );
  return { ...utils, onClose };
}

const bookTrigger = (name: string) => screen.findByRole('button', { name: new RegExp(name) });

describe('EditProjectMetadataDialog', () => {
  it('lists the books of the project collapsed', async () => {
    mockApi();
    renderDialog();

    expect(await bookTrigger('Genesis')).toBeInTheDocument();
    expect(await bookTrigger('Exodus')).toBeInTheDocument();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('expands several books at once and seeds Short Name from the legacy title', async () => {
    mockApi();
    const { user } = renderDialog();

    await user.click(await bookTrigger('Genesis'));
    await user.click(await bookTrigger('Exodus'));

    expect(screen.getAllByRole('textbox')).toHaveLength(6);
    const [longName, shortName, abbreviation] = screen.getAllByRole('textbox');
    expect(longName).toHaveAttribute('placeholder', 'bookLongNamePlaceholder');
    expect(shortName).toHaveAttribute('placeholder', 'bookShortNamePlaceholder');
    expect(abbreviation).toHaveAttribute('placeholder', 'bookAbbreviationPlaceholder');
    expect(longName).toHaveValue('');
    expect(shortName).toHaveValue('The First Book of Moses');
    expect(abbreviation).toHaveValue('');
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
    const { user } = renderDialog();

    await user.click(await bookTrigger('Genesis'));
    await user.type(screen.getByPlaceholderText('bookLongNamePlaceholder'), 'a|b');
    await user.tab();

    expect(await screen.findByRole('alert')).toHaveTextContent('must not contain pipes');
  });
});
