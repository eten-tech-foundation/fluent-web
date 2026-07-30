/**
 * Browser stand-ins for the Node built-ins `@sillsdev/machine` imports at
 * module scope (see vite.config.ts resolve.alias). The corpora entry computes
 * `dirname(fileURLToPath(import.meta.url))` when the module loads and only
 * touches the filesystem in code paths the app never calls (file-based
 * stylesheet loading — we parse the vendored usfm.sty from a string instead),
 * so inert implementations are safe.
 *
 * Upstream ask (sillsdev/machine): guard the module-scope Node calls so the
 * package's own `browser` field is sufficient.
 */

// url
export function fileURLToPath(): string {
  return '/';
}

// path
export function dirname(): string {
  return '/';
}
export function basename(input = ''): string {
  return input.split('/').pop() ?? '';
}
export function resolve(...segments: string[]): string {
  return segments.join('/');
}
export function join(...segments: string[]): string {
  return segments.join('/');
}

// fs
export function existsSync(): boolean {
  return false;
}
export function readFileSync(): never {
  throw new Error('fs is not available in the browser');
}

// fs/promises
export function access(): Promise<never> {
  return Promise.reject(new Error('fs is not available in the browser'));
}
export function readFile(): Promise<never> {
  return Promise.reject(new Error('fs is not available in the browser'));
}
export function readdir(): Promise<never> {
  return Promise.reject(new Error('fs is not available in the browser'));
}

export default {
  fileURLToPath,
  dirname,
  basename,
  resolve,
  join,
  existsSync,
  readFileSync,
  access,
  readFile,
  readdir,
};
