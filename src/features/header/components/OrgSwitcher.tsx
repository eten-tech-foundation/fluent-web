import React, { useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';

import { useUpdateActiveOrg } from '@/hooks/useUsers';
import { isManager } from '@/lib/grant-utils';
import { Logger } from '@/lib/services/logger';
import { ROLES, type UserGrant } from '@/lib/types';
import { useAppStore } from '@/store/store';

interface OrgRole {
  roleId: number;
  roleName: string;
}
const ROLE_DISPLAY_ORDER: string[] = [
  ROLES.PROJECT_MANAGER,
  ROLES.PROJECT_TRANSLATOR,
  ROLES.PROJECT_OBSERVER,
  ROLES.ORG_MEMBER,
];

const sortRolesByDisplayOrder = (roles: OrgRole[]): OrgRole[] =>
  [...roles].sort((a, b) => {
    const aIndex = ROLE_DISPLAY_ORDER.indexOf(a.roleName);
    const bIndex = ROLE_DISPLAY_ORDER.indexOf(b.roleName);
    const aRank = aIndex === -1 ? ROLE_DISPLAY_ORDER.length : aIndex;
    const bRank = bIndex === -1 ? ROLE_DISPLAY_ORDER.length : bIndex;
    return aRank - bRank;
  });

export const OrgSwitcher: React.FC = () => {
  const { userdetail, setUserDetail } = useAppStore();
  const updateActiveOrg = useUpdateActiveOrg();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);

  if (!userdetail?.grants || userdetail.grants.length === 0) {
    return null;
  }

  const orgMap = new Map<number, string>();
  userdetail.grants.forEach(grant => {
    if (grant.orgId !== null) {
      orgMap.set(grant.orgId, grant.orgName ?? `Org ${grant.orgId}`);
    }
  });

  const organizations = Array.from(orgMap.entries()).map(([id, name]) => ({ id, name }));

  const rolesByOrg = new Map<number, OrgRole[]>();
  userdetail.grants.forEach((grant: UserGrant) => {
    if (grant.orgId === null) return;
    const existing = rolesByOrg.get(grant.orgId) ?? [];
    if (!existing.some(r => r.roleId === grant.roleId)) {
      existing.push({ roleId: grant.roleId, roleName: grant.roleName });
    }
    rolesByOrg.set(grant.orgId, existing);
  });

  // Rule: Only show "Organization Member" in the dropdown if no other roles exist for that org
  rolesByOrg.forEach((roles, orgId) => {
    const hasFunctionalRole = roles.some(r => r.roleName !== ROLES.ORG_MEMBER);
    if (hasFunctionalRole) {
      rolesByOrg.set(
        orgId,
        roles.filter(r => r.roleName !== ROLES.ORG_MEMBER)
      );
    }
  });

  const activeOrgId = userdetail.lastActiveOrgId ?? organizations[0]?.id;
  const activeOrgName = orgMap.get(activeOrgId) ?? 'Unknown Organization';
  const activeRoleId = userdetail.role;

  const singleOrgRoleCount =
    organizations.length === 1 ? (rolesByOrg.get(organizations[0].id)?.length ?? 0) : 0;
  const isSwitcherDisabled = organizations.length <= 1 && singleOrgRoleCount <= 1;

  if (isSwitcherDisabled) {
    return (
      <div className='flex items-center rounded-md border border-white/25 bg-transparent px-4 py-1.5 text-sm font-semibold text-white'>
        <span className='max-w-[200px] truncate'>{activeOrgName}</span>
      </div>
    );
  }

  const navigateForRole = (orgId: number, roleId: number | undefined) => {
    if (roleId === undefined) return;
    const grants = userdetail.grants ?? [];
    const grantsForRole = grants.filter(g => g.orgId === orgId && g.roleId === roleId);
    if (isManager(grantsForRole)) {
      void navigate({ to: '/projects' });
    } else {
      void navigate({ to: '/', search: {} });
    }
  };

  const handleSelectRole = async (orgId: number, roleId: number) => {
    setIsOpen(false);
    if (orgId === activeOrgId && roleId === activeRoleId) return;

    try {
      await updateActiveOrg.mutateAsync({ orgId });

      setUserDetail({
        ...userdetail,
        lastActiveOrgId: orgId,
        role: roleId,
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['user-projects'] }),
        queryClient.invalidateQueries({ queryKey: ['chapter-assignments'] }),
        queryClient.invalidateQueries({ queryKey: ['users'] }),
        queryClient.invalidateQueries({ queryKey: ['userDetails'] }),
      ]);

      navigateForRole(orgId, roleId);
    } catch (error) {
      Logger.logException(error instanceof Error ? error : new Error(String(error)), {
        source: 'Failed to update active org/role',
      });
    }
  };

  return (
    <div className='relative'>
      <button
        className='flex items-center gap-1.5 rounded-md border border-white/25 bg-transparent px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-white/10'
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className='max-w-[160px] truncate'>{activeOrgName}</span>
        <ChevronDown className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} size={16} />
      </button>
      {isOpen && (
        <>
          <div className='fixed inset-0 z-40' onClick={() => setIsOpen(false)} />
          <div className='bg-popover absolute top-full right-0 z-50 mt-2 w-72 rounded-2xl p-4 shadow-lg'>
            <div className='text-muted-foreground mb-3 px-1 text-xs font-semibold tracking-wider uppercase'>
              Switch Organization
            </div>

            <div className='space-y-4'>
              {organizations.map(org => {
                const roles = sortRolesByDisplayOrder(rolesByOrg.get(org.id) ?? []);
                const isActiveOrg = org.id === activeOrgId;

                return (
                  <div key={org.id}>
                    <div className='flex items-center gap-2 px-1'>
                      <span
                        className={`text-base ${
                          isActiveOrg
                            ? 'text-foreground font-semibold'
                            : 'text-foreground font-medium'
                        }`}
                      >
                        {org.name}
                      </span>
                    </div>

                    {roles.length > 0 && (
                      <div className='flex flex-wrap gap-2 px-1 pt-2'>
                        {roles.map(role => {
                          const isActiveRole = isActiveOrg && role.roleId === activeRoleId;
                          return (
                            <button
                              key={role.roleId}
                              className={`rounded-full px-3.5 py-1 text-xs font-medium transition-colors ${
                                isActiveRole
                                  ? 'bg-primary text-primary-foreground'
                                  : 'border-border bg-background text-foreground hover:bg-accent border'
                              }`}
                              onClick={() => handleSelectRole(org.id, role.roleId)}
                            >
                              {role.roleName}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
