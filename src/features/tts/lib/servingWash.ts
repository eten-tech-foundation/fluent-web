/**
 * The verification tint (§9.2) — one place, so it is one deletion.
 *
 * A working artifact store and one that silently regenerates every listen
 * sound EXACTLY alike; only the bill differs (§9.2). Since `generate` names
 * the compressed object directly when one exists (§7.1, amended 2026-08-20),
 * the container is readable off the clip URL, and the playback wash can simply
 * carry it.
 *
 * `wav` returns `null` ON PURPOSE: the streaming case is the ordinary one, so
 * it keeps the ordinary blue wash and nothing looks unusual. Only a clip that
 * came from the bucket departs from it. That makes the verification a single
 * clear observation — play a verse twice; the second time it should turn
 * purple — rather than a colour chart to memorise.
 *
 * The purples are loud rather than tasteful. A diagnostic that blends into the
 * card is the failure mode this codebase already hit once, when a "highlight"
 * over a `#f0f4f9` card differed from it by almost nothing and no test could
 * see it.
 */
import { type TtsServedFormat } from '../tts.types';

export const ttsServingWashClass = (served: TtsServedFormat | undefined): string | null => {
  if (served === 'ogg') return 'border-l-purple-500 bg-purple-500/20';
  if (served === 'mp3') return 'border-l-purple-900 bg-purple-900/20';
  return null; // 'wav' and unknown both keep the ordinary wash
};
