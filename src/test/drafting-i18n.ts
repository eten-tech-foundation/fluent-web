import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import enCommon from '../../public/locales/en/common.json';

/** The shipped English text for a passage with no Bible content (#471). */
export const NO_CONTENT_MESSAGE = enCommon.noContentAvailable;

/** The shipped English text for a Bible whose request failed (#471). */
export const BIBLE_UNAVAILABLE_MESSAGE = enCommon.errorLoadingBibleContent;

/**
 * Serves the empty-passage and unavailable-Bible messages from the English locale file so tests
 * assert what users read. Other keys keep their inline fallbacks, as they did with i18n
 * uninitialized.
 */
export const initDraftingTestI18n = () =>
  createInstance()
    .use(initReactI18next)
    .init({
      lng: 'en',
      fallbackLng: 'en',
      ns: ['common'],
      defaultNS: 'common',
      resources: {
        en: {
          common: {
            noContentAvailable: NO_CONTENT_MESSAGE,
            errorLoadingBibleContent: BIBLE_UNAVAILABLE_MESSAGE,
          },
        },
      },
      interpolation: { escapeValue: false },
    });
