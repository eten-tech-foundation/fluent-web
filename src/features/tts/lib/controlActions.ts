import { type TFunction } from 'i18next';
import { toast } from 'sonner';

/** One reason/press policy for pointer, native button keys and global shortcuts. */
export function unavailableReason(
  t: TFunction,
  {
    offline,
    missing,
    impossibleReason,
  }: {
    offline: boolean;
    missing: boolean;
    impossibleReason?: string | null;
  }
): string | undefined {
  if (offline) return t('ttsOfflineReason', "You're offline. Reconnect to play audio.");
  if (missing) return t('ttsAudioUnavailable', 'Audio is unavailable.');
  return impossibleReason ?? undefined;
}

export function pressPrimary(reason: string | undefined, action: () => void): void {
  if (reason !== undefined) toast.error(reason);
  else action();
}

/** Unlike the primary, disabled Restart is silent and never clears a record. */
export function pressRestart(allowed: boolean, action: () => void): void {
  if (allowed) action();
}
