import { useNavigate } from '@tanstack/react-router';

import { NoAssignmentsPage } from '@/components/NoAssignmentsPage';
import { ObserverDashboard } from '@/features/dashboard/observer';
import { UserDashboard } from '@/features/dashboard/user';
import { getActiveGrants, isManager, isObserver, isOrgMemberOnly } from '@/lib/grant-utils';
import { useAppStore } from '@/store/store';

export const RoleBasedHomePage = () => {
  const { userdetail } = useAppStore();
  const navigate = useNavigate();

  if (!userdetail?.grants || userdetail.grants.length === 0) {
    return <UserDashboard />;
  }

  const activeGrants = getActiveGrants(userdetail.grants, userdetail.lastActiveOrgId);

  // Only route to /projects if the *currently selected* role is a manager
  // role — not just because the org happens to also grant PM elsewhere.
  const activeRoleGrant = activeGrants.filter(g => g.roleName === userdetail.role);
  if (isManager(activeRoleGrant)) {
    void navigate({ to: '/projects' });
  }
  if (isObserver(activeRoleGrant)) {
    return <ObserverDashboard />;
  }
  if (isOrgMemberOnly(activeGrants)) {
    return <NoAssignmentsPage />;
  }

  return <UserDashboard />;
};
