import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import enCommon from '../../public/locales/en/common.json';

/** The shipped English text for a passage with no Bible content (#471). */
export const NO_CONTENT_MESSAGE = enCommon.noContentAvailable;

/**
 * Serves the empty-passage message from the English locale file so tests assert what users
 * read. Other keys keep their inline fallbacks, as they did with i18n uninitialized.
 */
export const initDraftingTestI18n = () =>
  createInstance()
    .use(initReactI18next)
    .init({
      lng: 'en',
      fallbackLng: 'en',
      ns: ['common'],
      defaultNS: 'common',
      resources: { en: { common: { noContentAvailable: NO_CONTENT_MESSAGE } } },
      interpolation: { escapeValue: false },
    });
