import { vi } from 'vitest';

export const useTranslation = () => ({
  t: (_key: string, defaultValue?: string, options?: Record<string, unknown>) =>
    (defaultValue ?? _key).replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
      String(options?.[name] ?? '')
    ),
  i18n: { language: 'en', changeLanguage: vi.fn() },
});

export const mockI18n = {
  useTranslation,
};

export default mockI18n;
