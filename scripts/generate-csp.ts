#!/usr/bin/env node

/**
 * Generates the script-src SHA-256 hash in staticwebapp.config.json from the
 * inline <script> in index.html.
 *
 * The Content-Security-Policy pins the inline dark-mode theme script with a
 * hash instead of allowing 'unsafe-inline'. Vite passes inline <head> scripts
 * through to the build verbatim, so the hash of the source index.html matches
 * what is served. Recomputing it here keeps the static hash from going stale
 * whenever that script changes.
 *
 * Runs as part of `pnpm build` so the config is always in sync at deploy time.
 */

import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);

const indexHtmlPath = path.resolve(_dirname, '../index.html');
const configPath = path.resolve(_dirname, '../staticwebapp.config.json');

interface StaticWebAppConfig {
  globalHeaders?: Record<string, string>;
  [key: string]: unknown;
}

function getInlineScript(html: string): string {
  // Match every <script>...</script>, then keep only blocks that have no src
  // attribute and non-empty content (i.e. the inline theme script). Relying on
  // "the first script" is fragile because the module entry <script src> tag
  // would silently shift the match if the file is reordered.
  const matches = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  const inline = matches.filter(
    ([, attrs, body]) => !/\bsrc\s*=/.test(attrs) && body.trim().length > 0
  );

  if (inline.length === 0) {
    throw new Error('No inline <script> found in index.html to hash.');
  }
  if (inline.length > 1) {
    throw new Error(
      `Expected exactly one inline <script> in index.html, found ${inline.length}. ` +
        'Update generate-csp.ts to disambiguate before relying on the CSP hash.'
    );
  }

  return inline[0][2];
}

try {
  const html = fs.readFileSync(indexHtmlPath, 'utf-8');
  const scriptBody = getInlineScript(html);
  const hash = createHash('sha256').update(scriptBody, 'utf-8').digest('base64');

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as StaticWebAppConfig;
  const csp = config.globalHeaders?.['Content-Security-Policy'];

  if (!csp) {
    throw new Error(
      'staticwebapp.config.json is missing globalHeaders["Content-Security-Policy"].'
    );
  }

  const scriptSrcHash = /script-src 'self' 'sha256-[^']*'/;
  if (!scriptSrcHash.test(csp)) {
    throw new Error(
      "Could not find \"script-src 'self' 'sha256-...'\" in the Content-Security-Policy."
    );
  }

  const nextCsp = csp.replace(scriptSrcHash, `script-src 'self' 'sha256-${hash}'`);
  if (nextCsp === csp) {
    console.log(`CSP script-src hash already up to date (sha256-${hash}).`);
    process.exit(0);
  }

  config.globalHeaders ??= {};
  config.globalHeaders['Content-Security-Policy'] = nextCsp;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`Updated CSP script-src hash to sha256-${hash}.`);
} catch (error) {
  console.error(`Error generating CSP hash: ${(error as Error).message}`);
  process.exit(1);
}
