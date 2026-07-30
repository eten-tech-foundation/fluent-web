import { UsfmStyleType } from '@sillsdev/machine/corpora';
import { describe, expect, it } from 'vitest';

import { createBrowserUsfmStylesheet } from './stylesheet';

describe('createBrowserUsfmStylesheet', () => {
  it('parses the vendored usfm.sty into real marker definitions', () => {
    const stylesheet = createBrowserUsfmStylesheet();

    expect(stylesheet.getTag('p').styleType).toBe(UsfmStyleType.Paragraph);
    expect(stylesheet.getTag('id').styleType).toBe(UsfmStyleType.Paragraph);
    expect(stylesheet.getTag('v').styleType).toBe(UsfmStyleType.Character);
    expect(stylesheet.getTag('qt').styleType).toBe(UsfmStyleType.Character);
  });

  it('does not fall back to unknown tags for standard markers', () => {
    const stylesheet = createBrowserUsfmStylesheet();

    expect(stylesheet.getTag('c').styleType).not.toBe(UsfmStyleType.Unknown);
    expect(stylesheet.getTag('mt').styleType).not.toBe(UsfmStyleType.Unknown);
  });
});
