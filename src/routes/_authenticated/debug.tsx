import { createFileRoute } from '@tanstack/react-router';

import { FeatureFlagsDiagnostics } from '@/features/flags';

/**
 * Unlinked, read-only feature-flags diagnostics page (feature-flags proposal
 * D8). Login-gated by the `_authenticated` layout but intentionally has no role
 * gate and no nav entry — you reach it only by knowing the path (`/debug`) — so
 * any signed-in user can self-serve "what does `GET /config/features` report
 * here?" without exposing a control surface (there is nothing to toggle; the API
 * owns the values).
 */
export const Route = createFileRoute('/_authenticated/debug')({
  component: FeatureFlagsDiagnostics,
});
