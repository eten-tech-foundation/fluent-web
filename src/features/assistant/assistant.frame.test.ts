import { afterEach, expect, it, vi } from 'vitest';

import { assistantFrames, utf8Bytes } from './assistant.stream';
import { TURN_LIMITS } from './assistant.turn.types';
import fixture from './fixtures/frame-v1.json';

const bytes = new TextEncoder();
function body(parts: string[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(bytes.encode(part));
      controller.close();
    },
  });
}
afterEach(() => vi.restoreAllMocks());

it('mirrors the API maximum emitted frame, independently of the provider frame limit', () => {
  expect(TURN_LIMITS.frameBytes).toBe(fixture.maximumFrameBytes);
  expect(TURN_LIMITS.frameBytes).toBe(
    TURN_LIMITS.outputBytes * fixture.jsonExpansion + fixture.envelopeReserveBytes
  );
});

it.each(['\n', '\r\n'])(
  'accepts the exact whole-frame boundary and rejects one byte over (%j)',
  async newline => {
    const wire = `id: 1${newline}event: turn_replace${newline}data: ${JSON.stringify(fixture.event)}${newline}${newline}`;
    const limit = TURN_LIMITS.frameBytes;
    try {
      Object.assign(TURN_LIMITS, { frameBytes: utf8Bytes(wire) });
      const received = [];
      for await (const event of assistantFrames(body([wire]), undefined, true))
        received.push(event);
      expect(received).toEqual([fixture.event]);
      Object.assign(TURN_LIMITS, { frameBytes: utf8Bytes(wire) - 1 });
      const consume = async () => {
        for await (const _event of assistantFrames(body([wire]), undefined, true)) {
          /* drain */
        }
      };
      await expect(consume()).rejects.toMatchObject({ code: 'malformed_upstream_response' });
    } finally {
      Object.assign(TURN_LIMITS, { frameBytes: limit });
    }
  }
);

it('accepts a replacement above the former 1 MiB limit and scans fragmented frames linearly', async () => {
  const event = { ...fixture.event, markdown: 'x'.repeat(2 * 1024 * 1024) };
  const wire = `id: 1\nevent: turn_replace\ndata: ${JSON.stringify(event)}\n\n`;
  const parts = Array.from({ length: Math.ceil(wire.length / 1024) }, (_, i) =>
    wire.slice(i * 1024, (i + 1) * 1024)
  );
  const stream = body(parts);
  const original = TextEncoder.prototype.encode;
  let scannedUnits = 0;
  vi.spyOn(TextEncoder.prototype, 'encode').mockImplementation(function (
    this: TextEncoder,
    text = ''
  ) {
    scannedUnits += text.length;
    return original.call(this, text);
  });
  let count = 0;
  for await (const parsed of assistantFrames(stream, undefined, true)) {
    expect(parsed).toEqual(event);
    count++;
  }
  expect(count).toBe(1);
  expect(scannedUnits).toBeLessThan(wire.length * 4);
});
