import { QueryClientProvider } from '@tanstack/react-query';
import { createInstance } from 'i18next';
import { http, HttpResponse } from 'msw';
import { initReactI18next } from 'react-i18next';
import { beforeAll, describe, expect, it } from 'vitest';

import { PericopeReferenceVerses } from '@/features/bible/components/PericopeReferenceVerses';
import { config } from '@/lib/config';
import { server } from '@/test/msw/server';
import {
  act,
  createTestQueryClient,
  render,
  renderWithProviders,
  screen,
  within,
} from '@/test/render';

const i18n = createInstance();

beforeAll(async () => {
  await i18n.use(initReactI18next).init({ lng: 'en', resources: {}, fallbackLng: 'en' });
});

const chapterNineVerses = [
  { chapterNumber: 9, verseNumber: 1 },
  { chapterNumber: 9, verseNumber: 3 },
];

function aquiferChapter(chapter: number) {
  return {
    bibleId: 11,
    bibleName: 'Resource Bible',
    bibleAbbreviation: 'RB',
    bookName: 'Mark',
    bookCode: 'MRK',
    chapters: [
      { number: 8, verses: [{ number: 1, text: 'Aquifer chapter eight' }] },
      {
        number: chapter,
        verses: [
          { number: 3, text: 'Aquifer third verse' },
          { number: 1, text: 'Aquifer chapter nine' },
          { number: 2, text: 'Outside the pericope' },
        ],
      },
    ],
  };
}

describe('PericopeReferenceVerses', () => {
  it('uses the requested Aquifer chapter and orders only its pericope references', async () => {
    server.use(
      http.get(`${config.api.url}/aquifer/bibles/11/texts`, ({ request }) => {
        const params = new URL(request.url).searchParams;
        if (
          params.get('bookCode') !== 'MRK' ||
          params.get('startChapter') !== '9' ||
          params.get('endChapter') !== '9'
        ) {
          return new HttpResponse(null, { status: 404 });
        }
        return HttpResponse.json(aquiferChapter(9));
      })
    );

    const { container } = renderWithProviders(
      <p>
        <PericopeReferenceVerses
          bibleId='aq-11'
          bookCode='MRK'
          chapterNumber={9}
          showChapter={true}
          verses={[
            chapterNineVerses[1],
            { chapterNumber: 8, verseNumber: 1 },
            chapterNineVerses[0],
          ]}
        />
      </p>
    );

    await screen.findByText('Aquifer chapter nine');
    expect(container.textContent).toMatch(/9:1\s*Aquifer chapter nine\s*9:3\s*Aquifer third verse/);
    expect(screen.queryByText('Aquifer chapter eight')).not.toBeInTheDocument();
    expect(screen.queryByText('Outside the pericope')).not.toBeInTheDocument();
    expect(container.querySelector('p p')).toBeNull();
  });

  it('keeps the selected provider and chapter separate when verse numbers and Bible IDs collide', async () => {
    server.use(
      http.get(`${config.api.url}/aquifer/bibles/11/texts`, () =>
        HttpResponse.json(aquiferChapter(9))
      ),
      http.get(`${config.api.url}/youversion/bibles/11/chapters/8/text`, () =>
        HttpResponse.json({
          bibleId: 11,
          bookId: 'MRK',
          chapterId: 8,
          verses: [{ verseNumber: 1, passageId: 'MRK.8.1', content: 'YouVersion chapter eight' }],
        })
      ),
      http.get(`${config.api.url}/youversion/bibles/11/chapters/9/text`, () =>
        HttpResponse.json({
          bibleId: 11,
          bookId: 'MRK',
          chapterId: 9,
          verses: [{ verseNumber: 1, passageId: 'MRK.9.1', content: 'YouVersion chapter nine' }],
        })
      )
    );

    renderWithProviders(
      <>
        <p aria-label='Aquifer nine'>
          <PericopeReferenceVerses
            bibleId='aq-11'
            bookCode='MRK'
            chapterNumber={9}
            showChapter={true}
            verses={[chapterNineVerses[0]]}
          />
        </p>
        <p aria-label='YouVersion eight'>
          <PericopeReferenceVerses
            bibleId='yv-11'
            bookCode='MRK'
            chapterNumber={8}
            showChapter={true}
            verses={[{ chapterNumber: 8, verseNumber: 1 }]}
          />
        </p>
        <p aria-label='YouVersion nine'>
          <PericopeReferenceVerses
            bibleId='yv-11'
            bookCode='MRK'
            chapterNumber={9}
            showChapter={false}
            verses={[chapterNineVerses[0]]}
          />
        </p>
      </>
    );

    await within(screen.getByLabelText('YouVersion nine')).findByText('YouVersion chapter nine');
    await within(screen.getByLabelText('YouVersion eight')).findByText('YouVersion chapter eight');
    await within(screen.getByLabelText('Aquifer nine')).findByText('Aquifer chapter nine');
    expect(screen.getByLabelText('Aquifer nine').textContent).toMatch(
      /^9:1\s*Aquifer chapter nine\s*$/
    );
    expect(screen.getByLabelText('YouVersion eight').textContent).toMatch(
      /^8:1\s*YouVersion chapter eight\s*$/
    );
    expect(screen.getByLabelText('YouVersion nine').textContent).toMatch(
      /^1\s*YouVersion chapter nine\s*$/
    );
  });

  it('preserves the verse labels with explicit loading text until the resource chapter arrives', async () => {
    let release: () => void = () => {};
    const ready = new Promise<void>(resolve => {
      release = resolve;
    });
    server.use(
      http.get(`${config.api.url}/aquifer/bibles/11/texts`, async () => {
        await ready;
        return HttpResponse.json(aquiferChapter(9));
      })
    );

    renderWithProviders(
      <p>
        <PericopeReferenceVerses
          bibleId='aq-11'
          bookCode='MRK'
          chapterNumber={9}
          showChapter={true}
          verses={chapterNineVerses}
        />
      </p>
    );

    expect(screen.getByText('9:1')).toBeInTheDocument();
    expect(screen.getByText('9:3')).toBeInTheDocument();
    expect(screen.getAllByText(/loading/i)).toHaveLength(2);
    release();
    await screen.findByText('Aquifer chapter nine');
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it('shows unavailable content for a missing selected Bible without retaining another Bible text', async () => {
    server.use(
      http.get(`${config.api.url}/aquifer/bibles/11/texts`, () =>
        HttpResponse.json(aquiferChapter(9))
      ),
      http.get(
        `${config.api.url}/aquifer/bibles/12/texts`,
        () => new HttpResponse(null, { status: 404 })
      )
    );

    const { rerender } = renderWithProviders(
      <p>
        <PericopeReferenceVerses
          bibleId='aq-11'
          bookCode='MRK'
          chapterNumber={9}
          showChapter={true}
          verses={[chapterNineVerses[0]]}
        />
      </p>
    );
    await screen.findByText('Aquifer chapter nine');

    rerender(
      <p>
        <PericopeReferenceVerses
          bibleId='aq-12'
          bookCode='MRK'
          chapterNumber={9}
          showChapter={true}
          verses={[chapterNineVerses[0]]}
        />
      </p>
    );

    await screen.findByText(/no content available/i);
    expect(screen.getByText('9:1')).toBeInTheDocument();
    expect(screen.queryByText('Aquifer chapter nine')).not.toBeInTheDocument();
    expect(screen.queryByText(/unable to load/i)).not.toBeInTheDocument();
  });

  it('shows a failed resource request beside its verse label', async () => {
    server.use(http.get(`${config.api.url}/aquifer/bibles/11/texts`, () => HttpResponse.error()));

    renderWithProviders(
      <p>
        <PericopeReferenceVerses
          bibleId='aq-11'
          bookCode='MRK'
          chapterNumber={9}
          showChapter={true}
          verses={[chapterNineVerses[0]]}
        />
      </p>
    );

    await screen.findByText(/unable to load/i);
    expect(screen.getByText('9:1')).toBeInTheDocument();
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it.each([500, 503])(
    'shows an Aquifer HTTP %i failure instead of missing content',
    async status => {
      server.use(
        http.get(
          `${config.api.url}/aquifer/bibles/11/texts`,
          () => new HttpResponse(null, { status })
        )
      );

      renderWithProviders(
        <p>
          <PericopeReferenceVerses
            bibleId='aq-11'
            bookCode='MRK'
            chapterNumber={9}
            showChapter={true}
            verses={[chapterNineVerses[0]]}
          />
        </p>
      );

      const failedVerse = await screen.findByText(/unable to load/i);
      expect(failedVerse.parentElement).toHaveTextContent('9:1');
      expect(failedVerse).toHaveClass('text-muted-foreground', 'text-sm');
      expect(screen.queryByText(/no content available/i)).not.toBeInTheDocument();
    }
  );

  it('preserves cached Aquifer text and shows refetch failures only for missing verses', async () => {
    server.use(
      http.get(`${config.api.url}/aquifer/bibles/11/texts`, () =>
        HttpResponse.json({
          ...aquiferChapter(9),
          chapters: [{ number: 9, verses: [{ number: 1, text: 'Aquifer cached verse' }] }],
        })
      )
    );
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <p>
          <PericopeReferenceVerses
            bibleId='aq-11'
            bookCode='MRK'
            chapterNumber={9}
            showChapter={true}
            verses={chapterNineVerses}
          />
        </p>
      </QueryClientProvider>
    );

    await screen.findByText('Aquifer cached verse');
    expect(screen.getByText(/no content available/i).parentElement).toHaveTextContent('9:3');
    server.use(
      http.get(
        `${config.api.url}/aquifer/bibles/11/texts`,
        () => new HttpResponse(null, { status: 503 })
      )
    );

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['aquifer-bible-text', 11, 'MRK', 9] });
    });

    const failedVerse = await screen.findByText(/unable to load/i);
    expect(failedVerse.parentElement).toHaveTextContent('9:3');
    const cachedVerse = screen.getByText('Aquifer cached verse');
    expect(cachedVerse.parentElement).toHaveTextContent('9:1');
    expect(cachedVerse).not.toHaveClass('text-muted-foreground');
    expect(screen.getAllByText(/unable to load/i)).toHaveLength(1);
    expect(screen.queryByText(/no content available/i)).not.toBeInTheDocument();
  });

  it('shows missing content when a verse is omitted from YouVersion chapter text', async () => {
    server.use(
      http.get(`${config.api.url}/youversion/bibles/11/chapters/9/text`, () =>
        HttpResponse.json({
          bibleId: 11,
          bookId: 'MRK',
          chapterId: 9,
          verses: [{ verseNumber: 1, passageId: 'MRK.9.1', content: 'YouVersion available verse' }],
        })
      )
    );

    renderWithProviders(
      <p>
        <PericopeReferenceVerses
          bibleId='yv-11'
          bookCode='MRK'
          chapterNumber={9}
          showChapter={true}
          verses={[
            chapterNineVerses[0],
            { chapterNumber: 9, verseNumber: 2 },
            chapterNineVerses[1],
          ]}
        />
      </p>
    );

    const unavailableVerses = await screen.findAllByText(/no content available/i);
    const availableVerse = await screen.findByText('YouVersion available verse');
    expect(unavailableVerses[0].parentElement).toHaveTextContent('9:2');
    expect(availableVerse.parentElement).toHaveTextContent('9:1');
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it('keeps available YouVersion text visible while chapter is loading', async () => {
    let release: () => void = () => {};
    const ready = new Promise<void>(resolve => {
      release = resolve;
    });
    server.use(
      http.get(`${config.api.url}/youversion/bibles/11/chapters/9/text`, async () => {
        await ready;
        return HttpResponse.json({
          bibleId: 11,
          bookId: 'MRK',
          chapterId: 9,
          verses: [{ verseNumber: 1, passageId: 'MRK.9.1', content: 'YouVersion delayed verse' }],
        });
      })
    );

    renderWithProviders(
      <p>
        <PericopeReferenceVerses
          bibleId='yv-11'
          bookCode='MRK'
          chapterNumber={9}
          showChapter={true}
          verses={chapterNineVerses}
        />
      </p>
    );

    expect(screen.getAllByText(/loading/i)).toHaveLength(2);
    release();
    await screen.findByText('YouVersion delayed verse');
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it('shows a YouVersion chapter text failure when the server endpoint returns non-2xx', async () => {
    server.use(
      http.get(
        `${config.api.url}/youversion/bibles/11/chapters/9/text`,
        () => new HttpResponse(null, { status: 503 })
      )
    );

    renderWithProviders(
      <p>
        <PericopeReferenceVerses
          bibleId='yv-11'
          bookCode='MRK'
          chapterNumber={9}
          showChapter={true}
          verses={[chapterNineVerses[0]]}
        />
      </p>
    );

    await screen.findByText(/unable to load/i);
    expect(screen.getByText('9:1')).toBeInTheDocument();
    expect(screen.queryByText(/no content available/i)).not.toBeInTheDocument();
  });
});
