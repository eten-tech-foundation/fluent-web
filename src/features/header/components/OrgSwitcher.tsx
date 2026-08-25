import React, { useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Building2, Check, ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useUpdateActiveOrg } from '@/hooks/useUsers';
import { isManager } from '@/lib/grant-utils';
import { Logger } from '@/lib/services/logger';
import { getDisplayRole, ROLES, type UserGrant } from '@/lib/types';
import { useAppStore } from '@/store/store';

interface OrgRole {
  roleId: number;
  roleName: string;
}

interface OrgSwitcherProps {
  /** Called after a role/org switch succeeds, so the parent menu can close itself */
  onAfterSelect?: () => void;
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

export const OrgSwitcher: React.FC<OrgSwitcherProps> = ({ onAfterSelect }) => {
  const { userdetail, setUserDetail } = useAppStore();
  const updateActiveOrg = useUpdateActiveOrg();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [isExpanded, setIsExpanded] = useState(false);

  if (!userdetail?.grants || userdetail.grants.length === 0) {
    return null;
  }

  const orgMap = new Map<number, string>();
  userdetail.grants.forEach(grant => {
    if (grant.orgId !== null) {
      orgMap.set(grant.orgId, grant.orgName ?? `Org ${grant.orgId}`);
    }
  });

  const activeOrgId = userdetail.lastActiveOrgId ?? Array.from(orgMap.keys())[0];
  const activeOrgName = orgMap.get(activeOrgId) ?? 'Unknown Organization';
  const activeRoleName = userdetail.role;
  // Active org first, then the rest in original order
  const organizations = Array.from(orgMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => (a.id === activeOrgId ? -1 : b.id === activeOrgId ? 1 : 0));

  const rolesByOrg = new Map<number, OrgRole[]>();
  userdetail.grants.forEach((grant: UserGrant) => {
    if (grant.orgId === null) return;
    const existing = rolesByOrg.get(grant.orgId) ?? [];
    if (!existing.some(r => r.roleId === grant.roleId)) {
      existing.push({ roleId: grant.roleId, roleName: grant.roleName });
    }
    rolesByOrg.set(grant.orgId, existing);
  });

  // Rule: Only show "Organization Member" in the list if no other roles exist for that org
  rolesByOrg.forEach((roles, orgId) => {
    const hasFunctionalRole = roles.some(r => r.roleName !== ROLES.ORG_MEMBER);
    if (hasFunctionalRole) {
      rolesByOrg.set(
        orgId,
        roles.filter(r => r.roleName !== ROLES.ORG_MEMBER)
      );
    }
  });

  const singleOrgRoleCount =
    organizations.length === 1 ? (rolesByOrg.get(organizations[0].id)?.length ?? 0) : 0;
  const isSwitcherDisabled = organizations.length <= 1 && singleOrgRoleCount <= 1;

  if (isSwitcherDisabled) {
    return (
      <div className='flex h-10 w-full items-center px-4 py-2'>
        <span className='text-text-primary mr-3'>
          <Building2 size={18} />
        </span>
        <span className='text-text-primary truncate text-sm font-medium' title={activeOrgName}>
          {activeOrgName}
        </span>
      </div>
    );
  }

  const navigateForRole = (orgId: number, roleName: string | undefined) => {
    if (roleName === undefined) return;
    const grants = userdetail.grants ?? [];
    const grantsForRole = grants.filter(g => g.orgId === orgId && g.roleName === roleName);
    if (isManager(grantsForRole)) {
      void navigate({ to: '/projects' });
    } else {
      void navigate({ to: '/', search: {} });
    }
  };

  const handleSelectRole = async (orgId: number, roleName: string) => {
    setIsExpanded(false);
    if (orgId === activeOrgId && roleName === activeRoleName) {
      onAfterSelect?.();
      return;
    }

    try {
      await updateActiveOrg.mutateAsync({ orgId });

      setUserDetail({
        ...userdetail,
        lastActiveOrgId: orgId,
        role: roleName,
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['user-projects'] }),
        queryClient.invalidateQueries({ queryKey: ['chapter-assignments'] }),
        queryClient.invalidateQueries({ queryKey: ['users'] }),
        queryClient.invalidateQueries({ queryKey: ['userDetails'] }),
      ]);

      navigateForRole(orgId, roleName);
    } catch (error) {
      Logger.logException(error instanceof Error ? error : new Error(String(error)), {
        source: 'Failed to update active org/role',
      });
    } finally {
      onAfterSelect?.();
    }
  };

  return (
    <div className='w-full'>
      <Button
        aria-expanded={isExpanded}
        className={`hover:bg-popover-hover text-text-primary h-10 w-full cursor-pointer justify-start px-4 py-2 transition-colors duration-150 ${
          isExpanded ? 'bg-popover-hover' : ''
        }`}
        variant='ghost'
        onClick={() => setIsExpanded(prev => !prev)}
      >
        <span className='text-text-primary mr-3'>
          <Building2 size={18} />
        </span>
        <span className='flex-1 truncate text-left text-sm font-medium' title={activeOrgName}>
          {activeOrgName}
        </span>
        <ChevronDown
          className={`text-text-primary ml-2 shrink-0 transition-transform ${
            isExpanded ? 'rotate-180' : ''
          }`}
          size={16}
        />
      </Button>

      {isExpanded && (
        <div className='divide-border border-border bg-muted/60 mt-1.5 divide-y rounded-md border px-2.5'>
          {organizations.map(org => {
            const roles = sortRolesByDisplayOrder(rolesByOrg.get(org.id) ?? []);
            const isActiveOrg = org.id === activeOrgId;

            return (
              <div key={org.id} className='py-2.5 first:pt-2 last:pb-2'>
                <div className='flex items-center gap-1.5 px-0.5'>
                  <span
                    className={`max-w-[160px] truncate text-xs ${
                      isActiveOrg
                        ? 'text-text-primary font-semibold'
                        : 'text-muted-foreground font-medium'
                    }`}
                    title={org.name}
                  >
                    {org.name}
                  </span>
                  {isActiveOrg && (
                    <span className='bg-primary/10 text-primary flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium'>
                      <Check size={10} />
                      Current
                    </span>
                  )}
                </div>

                {roles.length > 0 && (
                  <div className='flex flex-wrap gap-1.5 px-0.5 pt-1.5'>
                    {roles.map(role => {
                      const isActiveRole = isActiveOrg && role.roleName === activeRoleName;
                      return (
                        <button
                          key={role.roleId}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                            isActiveRole
                              ? 'bg-primary text-primary-foreground'
                              : 'border-border bg-background text-foreground hover:bg-accent border'
                          }`}
                          onClick={() => handleSelectRole(org.id, role.roleName)}
                        >
                          {getDisplayRole(role.roleName)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
