import { describe, expect, it } from 'vitest';

import { looksLikeUsfm } from './usfm-validate';

describe('looksLikeUsfm', () => {
  it('passes anything with a USFM marker on to the API', () => {
    expect(looksLikeUsfm('\\id GEN Genesis\n\\c 1\n\\v 1 In the beginning')).toBe(true);
    // Which book and whether it parses are the API's call (#419), not this check's.
    expect(looksLikeUsfm('\\mt Genesis\n\\c 1\n\\v 1 text')).toBe(true);
    expect(looksLikeUsfm('\\v 1 before any chapter')).toBe(true);
  });

  it('does not reject a file for markers Fluent does not render', () => {
    expect(looksLikeUsfm('\\zsomething custom')).toBe(true);
  });

  it('turns away text with no markers at all', () => {
    expect(looksLikeUsfm('just some prose, no markers')).toBe(false);
    expect(looksLikeUsfm('%PDF-1.7 \u0000\u0001 binary')).toBe(false);
  });

  it('turns away an empty file', () => {
    expect(looksLikeUsfm('')).toBe(false);
  });
});
