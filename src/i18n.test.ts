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
});
