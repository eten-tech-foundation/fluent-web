import { UsfmStylesheet } from '@sillsdev/machine/corpora';

import usfmStyContent from '../assets/usfm.sty?raw';

// UsfmStylesheet's public constructor only accepts a *file name* and reads it
// with Node's fs, which cannot work in the browser. The content-based parser
// exists but is typed private, so the PoC reaches through with a narrow cast.
// Upstream ask (sillsdev/machine): expose a content-based constructor/factory.
interface StylesheetContentParser {
  parseTagEntries: (contents: string) => void;
}

let cached: UsfmStylesheet | undefined;

/**
 * Builds the Paratext USFM stylesheet from the vendored `usfm.sty` (copied
 * from @sillsdev/machine/dist/corpora, MIT) without any filesystem access.
 */
export function createBrowserUsfmStylesheet(): UsfmStylesheet {
  if (cached == null) {
    const stylesheet = new UsfmStylesheet();
    (stylesheet as unknown as StylesheetContentParser).parseTagEntries(usfmStyContent);
    cached = stylesheet;
  }
  return cached;
}
