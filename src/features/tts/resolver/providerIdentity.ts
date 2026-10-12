export type Provider = 'aquifer' | 'youversion' | 'dbl';
export interface ProviderIdentity {
  provider: Provider;
  externalId: string;
}

const prefixes = { aquifer: 'aq', youversion: 'yv', dbl: 'dbl' } as const;

export function parseBibleKey(key: string): ProviderIdentity | null {
  const match = /^(aq|yv|dbl)-(.+)$/.exec(key);
  if (!match) return null;
  const [, prefix, externalId] = match;
  if (
    externalId?.trim() !== externalId ||
    externalId.length > 255 ||
    Array.from(externalId).some(
      char => char.charCodeAt(0) < 32 || (char.charCodeAt(0) >= 127 && char.charCodeAt(0) <= 159)
    )
  )
    return null;
  if (
    prefix !== 'dbl' &&
    (!/^[1-9]\d*$/.test(externalId) || !Number.isSafeInteger(Number(externalId)))
  )
    return null;
  // IDs are opaque, never a URL to fetch.
  if (externalId.includes('://')) return null;
  return {
    provider: prefix === 'aq' ? 'aquifer' : prefix === 'yv' ? 'youversion' : 'dbl',
    externalId,
  };
}

export function bibleKey(identity: ProviderIdentity): string {
  return `${prefixes[identity.provider]}-${identity.externalId}`;
}
