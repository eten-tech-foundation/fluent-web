const OUTPUT_LANGUAGE_KEY = 'fluent.assistant.outputLanguage';
const IGNORE_CACHE_KEY = 'fluent.assistant.ignoreCache';

function read(key: string): string | null {
  try {
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) globalThis.localStorage.removeItem(key);
    else globalThis.localStorage.setItem(key, value);
  } catch {
    // Diagnostics and preference storage must never prevent drafting from loading.
  }
}

export function readAssistantOutputLanguage(): string | null {
  const value = read(OUTPUT_LANGUAGE_KEY)?.trim();
  return value === '' ? null : (value ?? null);
}

export function writeAssistantOutputLanguage(value: string): void {
  write(OUTPUT_LANGUAGE_KEY, value);
}

export function readAssistantIgnoreCache(): boolean {
  return read(IGNORE_CACHE_KEY) === 'true';
}

export function writeAssistantIgnoreCache(value: boolean): void {
  write(IGNORE_CACHE_KEY, value ? 'true' : null);
}

export const ASSISTANT_STORAGE_KEYS = {
  outputLanguage: OUTPUT_LANGUAGE_KEY,
  ignoreCache: IGNORE_CACHE_KEY,
} as const;
