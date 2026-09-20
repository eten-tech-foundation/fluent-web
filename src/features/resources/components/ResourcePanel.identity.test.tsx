import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { type ProjectItem } from '@/lib/types';

import { ResourcePanel } from './ResourcePanel';

const { handleBibleChange, bibles, empty } = vi.hoisted(() => ({
  handleBibleChange: vi.fn(),
  bibles: [
    { id: 'aq-123', rawId: 123, source: 'aquifer', name: 'Aquifer edition', abbreviation: 'SAME' },
    {
      id: 'yv-123',
      rawId: 123,
      source: 'youversion',
      name: 'YouVersion edition',
      abbreviation: 'SAME',
    },
  ],
  empty: [],
}));
vi.mock('../hooks/hooks', () => ({
  useBibleResources: () => ({
    unifiedBibles: bibles,
    loadingBibles: false,
    loadingBibleContent: false,
    selectedBible: null,
    handleBibleChange,
    clearSelectedBible: vi.fn(),
    bibleVerses: empty,
  }),
  useResourceLanguages: () => ({
    availableLanguages: [{ code: 'eng', name: 'English' }],
    selectedLanguage: 'eng',
    loadingLanguages: false,
    handleLanguageChange: vi.fn(),
  }),
  useResourceFetch: () => ({ localizeRefName: empty, imageItems: empty, loadingImages: false }),
  useGuideContent: () => ({ guideContents: {}, relatedAudioIds: {}, fetchGuideContent: vi.fn() }),
  useResourceDialog: () => ({}),
}));
vi.mock('./LanguageDropdown', () => ({ LanguageDropdown: () => null }));
vi.mock('./ResourceChipRow', () => ({ ResourceChipRow: () => null }));
vi.mock('./ResourceDialog', () => ({
  ResourceDialog: () => null,
  ImageDialog: () => null,
  ImageGrid: () => null,
}));
vi.mock('./TextResourceAccordion', () => ({ TextResourceAccordion: () => null }));

const resource = { id: 'Bibles', name: 'Bibles' };

describe('ResourcePanel — domain-qualified reference identity', () => {
  it('forwards the selected id unchanged, independent of the abbreviation or raw id', () => {
    const onBibleSelect = vi.fn();
    const props = {
      activeVerseId: 1,
      sourceData: { bookCode: 'GEN', chapterNumber: 1, sourceLangCode: 'eng' } as ProjectItem,
      resourceNames: [resource],
      initialResource: resource,
      initialLanguage: 'eng',
      onBibleSelect,
    };
    const { rerender } = render(<ResourcePanel {...props} />);
    // Existing initialization resets its ref after the first effect pass;
    // subsequent parent renders initialize it, then expose the selected language.
    rerender(<ResourcePanel {...props} />);
    rerender(<ResourcePanel {...props} />);
    expect(onBibleSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('SAME — Aquifer edition'));
    fireEvent.click(screen.getByText('SAME — YouVersion edition'));
    expect(onBibleSelect.mock.calls).toEqual([
      [{ id: 'aq-123', label: 'SAME', language: 'eng' }],
      [{ id: 'yv-123', label: 'SAME', language: 'eng' }],
    ]);
    expect(handleBibleChange.mock.calls).toEqual([['aq-123'], ['yv-123']]);
  });
});
