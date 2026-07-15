import { useNavigate } from '@tanstack/react-router';

import { UserDashboard } from '@/features/dashboard/user';
import { getActiveGrants, isManager } from '@/lib/grant-utils';
import { useAppStore } from '@/store/store';

export const RoleBasedHomePage = () => {
  const { userdetail } = useAppStore();
  const navigate = useNavigate();

  // Don't route until grants are loaded from the API (not stale localStorage).
  // AuthenticatedLayout gates rendering behind userDetailsFetched,
  // but grants may still be empty during the transition.
  if (!userdetail?.grants || userdetail.grants.length === 0) {
    return <UserDashboard />;
  }

  const activeGrants = getActiveGrants(userdetail.grants, userdetail.lastActiveOrgId);

  // Org-level managers and Project Managers go to /projects; translators stay on dashboard
  if (isManager(activeGrants)) {
    void navigate({ to: '/projects' });
  }

  return <UserDashboard />;
};
