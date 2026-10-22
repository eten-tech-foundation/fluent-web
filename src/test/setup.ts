import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { server } from './msw/server';

// jsdom doesn't implement ResizeObserver; MultiSelectFilter and Radix read it.
window.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom doesn't implement matchMedia; the theme + a few components read it.
window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;

// jsdom doesn't implement Range geometry. Lexical measures the caret to scroll it into view after
// the editors place it themselves (a click on a verse number, Next Pericope).
Range.prototype.getBoundingClientRect = () => new DOMRect();

// Start MSW once for the whole run. onUnhandledRequest: 'error' makes any
// un-mocked network call fail loudly instead of leaking out of the test.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());
