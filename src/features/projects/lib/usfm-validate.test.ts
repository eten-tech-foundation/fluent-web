import { describe, expect, it } from 'vitest';

import { validateUsfmFile } from './usfm-validate';

describe('validateUsfmFile', () => {
  it('reads the book code from \\id', () => {
    const result = validateUsfmFile('\\id GEN Genesis\n\\c 1\n\\v 1 In the beginning');
    expect(result).toEqual({ ok: true, bookCode: 'GEN' });
  });

  it('falls back to \\toc3 when \\id is missing', () => {
    const result = validateUsfmFile('\\toc3 MAT\n\\c 1\n\\v 1 The book of the genealogy');
    expect(result).toEqual({ ok: true, bookCode: 'MAT' });
  });

  it('falls back to \\mt when \\id and \\toc3 are missing', () => {
    const result = validateUsfmFile('\\mt1 REV\n\\c 1\n\\v 1 The revelation');
    expect(result).toEqual({ ok: true, bookCode: 'REV' });
  });

  // \mt normally carries the book's title, not its code, so the fallback #418 asks for only
  // fires on the unusual file that puts a code there. Pinned so the limit is visible rather
  // than surprising: see the note on #418 about whether \mt was meant to do more than this.
  it('does not invent a book code from a \\mt holding a title', () => {
    expect(validateUsfmFile('\\mt Genesis\n\\c 1\n\\v 1 text')).toEqual({
      ok: false,
      reason: 'missing-book',
    });
  });

  it('rejects a file with no markers at all', () => {
    expect(validateUsfmFile('just some prose, no markers')).toEqual({
      ok: false,
      reason: 'not-usfm',
    });
  });

  it('rejects an empty file', () => {
    expect(validateUsfmFile('')).toEqual({ ok: false, reason: 'not-usfm' });
  });

  it('rejects a well-formed file whose book code is not a real book', () => {
    expect(validateUsfmFile('\\id ZZZ Nope\n\\c 1')).toEqual({
      ok: false,
      reason: 'missing-book',
    });
  });

  it('rejects a well-formed file with no id, toc3 or mt', () => {
    expect(validateUsfmFile('\\c 1\n\\v 1 text')).toEqual({
      ok: false,
      reason: 'missing-book',
    });
  });

  it('does not reject a file for markers Fluent does not render', () => {
    const result = validateUsfmFile('\\id GEN\n\\zsomething custom\n\\c 1\n\\v 1 text');
    expect(result).toEqual({ ok: true, bookCode: 'GEN' });
  });

  it('is case insensitive about the book code', () => {
    expect(validateUsfmFile('\\id gen Genesis')).toEqual({ ok: true, bookCode: 'GEN' });
  });
});
