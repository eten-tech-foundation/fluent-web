import { createInstance } from 'i18next';
import { http, HttpResponse } from 'msw';
import { initReactI18next } from 'react-i18next';
import { beforeAll, describe, expect, it } from 'vitest';

import { PericopeReferenceVerses } from '@/features/bible/components/PericopeReferenceVerses';
import { config } from '@/lib/config';
import { server } from '@/test/msw/server';
import { renderWithProviders, screen, within } from '@/test/render';

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
      http.get(`${config.api.aquifer_url}/bibles/11/texts`, ({ request }) => {
        const params = new URL(request.url).searchParams;
        if (
          params.get('BookCode') !== 'MRK' ||
          params.get('StartChapter') !== '9' ||
          params.get('EndChapter') !== '9'
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
      http.get(`${config.api.aquifer_url}/bibles/11/texts`, () =>
        HttpResponse.json(aquiferChapter(9))
      ),
      http.get(`${config.api.youversion_url}/bibles/11/books/MRK/chapters/:chapter`, ({ params }) =>
        HttpResponse.json({
          id: Number(params.chapter),
          passage_id: `MRK.${Number(params.chapter)}`,
          title: Number(params.chapter),
          verses: [{ id: 1, passage_id: `MRK.${Number(params.chapter)}.1`, title: 1 }],
        })
      ),
      http.get(`${config.api.youversion_url}/bibles/11/passages/MRK.8.1`, () =>
        HttpResponse.json({
          id: 'MRK.8.1',
          content: 'YouVersion chapter eight',
          reference: 'Mark 8:1',
        })
      ),
      http.get(`${config.api.youversion_url}/bibles/11/passages/MRK.9.1`, () =>
        HttpResponse.json({
          id: 'MRK.9.1',
          content: 'YouVersion chapter nine',
          reference: 'Mark 9:1',
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
      http.get(`${config.api.aquifer_url}/bibles/11/texts`, async () => {
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
      http.get(`${config.api.aquifer_url}/bibles/11/texts`, () =>
        HttpResponse.json(aquiferChapter(9))
      ),
      http.get(
        `${config.api.aquifer_url}/bibles/12/texts`,
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
  });

  it('shows a failed resource request beside its verse label', async () => {
    server.use(http.get(`${config.api.aquifer_url}/bibles/11/texts`, () => HttpResponse.error()));

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
});
