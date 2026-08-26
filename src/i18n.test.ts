import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import i18n from '@/i18n';

/**
 * The app ships exactly one namespace per language (`public/locales/{en,hi}/common.json`), and
 * browsers report region variants (`en-US`) no locale directory exists for. The config has to
 * request only what ships, or every page load fetches files that don't exist and the console
 * fills with parse failures (#427, bug 5).
 */
describe('i18n configuration', () => {
  it('loads only the common namespace', () => {
    const ns = Array.isArray(i18n.options.ns) ? i18n.options.ns : [i18n.options.ns];
    expect(ns).toEqual(['common']);
  });

  it('resolves region variants to their base language', () => {
    expect(i18n.options.load).toBe('languageOnly');
  });

  /**
   * `load: 'languageOnly'` only strips the region, so a browser reporting `fr-FR` still resolves
   * to `fr` and the backend requests a directory that never shipped. Reading the directory list
   * rather than restating it keeps the config honest when a locale is added or removed.
   */
  it('supports exactly the locales that ship on disk', () => {
    const onDisk = readdirSync(join(process.cwd(), 'public/locales'), {
      withFileTypes: true,
    })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort();

    // i18next types this as `false | readonly string[]`, and appends its own 'cimode'
    // pseudo-locale to whatever is configured.
    const supported = i18n.options.supportedLngs;
    const configured = (Array.isArray(supported) ? supported : [])
      .filter(lng => lng !== 'cimode')
      .sort();

    expect(configured).toEqual(onDisk);
  });
});
