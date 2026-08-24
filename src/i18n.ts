import { default as i18n } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';
import { initReactI18next } from 'react-i18next';

i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    // Only what actually ships under public/locales: one namespace per language, and no region
    // directories — so 'en-US' resolves to 'en' instead of requesting files that don't exist
    // (fluent-web#427). Without an explicit `ns`, i18next also loads its default 'translation'
    // namespace on every page.
    ns: ['common'],
    load: 'languageOnly',
    debug: true,
    interpolation: {
      escapeValue: false,
    },
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    defaultNS: 'common',
  })
  .catch(error => {
    console.error('i18n initialization failed:', error);
  });

export default i18n;
