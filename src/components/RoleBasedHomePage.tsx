import { Navigate } from '@tanstack/react-router';

import { NoAssignmentsPage } from '@/components/NoAssignmentsPage';
import { ObserverDashboard } from '@/features/dashboard/observer';
import { UserDashboard } from '@/features/dashboard/user';
import { getActiveGrants, isManager, isObserver, isOrgMemberOnly } from '@/lib/grant-utils';
import { ROLES } from '@/lib/types';
import { useAppStore } from '@/store/store';

export const RoleBasedHomePage = () => {
  const { userdetail } = useAppStore();

  if (!userdetail?.grants || userdetail.grants.length === 0) {
    return <UserDashboard />;
  }

  const activeGrants = getActiveGrants(userdetail.grants, userdetail.lastActiveOrgId);

  const functionalGrant = activeGrants.find(g => g.roleName !== ROLES.ORG_MEMBER);
  const effectiveRole =
    userdetail.role !== ROLES.ORG_MEMBER
      ? userdetail.role
      : (functionalGrant?.roleName ?? ROLES.ORG_MEMBER);

  const activeRoleGrant = activeGrants.filter(g => g.roleName === effectiveRole);

  if (isManager(activeRoleGrant)) {
    return <Navigate to='/projects' />;
  }
  if (isObserver(activeRoleGrant)) {
    return <ObserverDashboard />;
  }
  if (isOrgMemberOnly(activeGrants)) {
    return <NoAssignmentsPage />;
  }

  return <UserDashboard />;
};
