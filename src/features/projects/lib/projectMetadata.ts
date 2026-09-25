/**
 * Builds the project `metadata` payload for project creation.
 * Omits the connectivityProfile key entirely when unset so downstream
 * consumers (the Fluent mobile app) treat "absent" as the Rarely Connected default.
 */
export function buildProjectMetadata(connectivityProfile?: string): Record<string, unknown> {
  return connectivityProfile ? { connectivityProfile } : {};
}
