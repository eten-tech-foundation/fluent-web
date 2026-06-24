import React, { useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown } from 'lucide-react';

import { useUpdateActiveOrg } from '@/hooks/useUsers';
import { Logger } from '@/lib/services/logger';
import { useAppStore } from '@/store/store';

export const OrgSwitcher: React.FC = () => {
  const { userdetail, setUserDetail } = useAppStore();
  const updateActiveOrg = useUpdateActiveOrg();
  const queryClient = useQueryClient();

  const [isOpen, setIsOpen] = useState(false);

  if (!userdetail?.grants || userdetail.grants.length === 0) {
    return null;
  }

  // Deduplicate organizations from grants
  const orgMap = new Map<number, string>();
  userdetail.grants.forEach(grant => {
    if (grant.orgId !== null) {
      orgMap.set(grant.orgId, grant.orgName ?? `Org ${grant.orgId}`);
    }
  });

  const organizations = Array.from(orgMap.entries()).map(([id, name]) => ({ id, name }));

  // Find the active organization
  const activeOrgId = userdetail.lastActiveOrgId ?? organizations[0]?.id;
  const activeOrgName = orgMap.get(activeOrgId) ?? 'Unknown Organization';

  // Single-org: show as a static pill label (no chevron, no dropdown)
  if (organizations.length <= 1) {
    return (
      <div className='bg-background flex items-center rounded-full px-4 py-1.5 text-sm font-medium'>
        <span className='text-foreground max-w-[200px] truncate'>{activeOrgName}</span>
      </div>
    );
  }

  const handleSelect = async (orgId: number) => {
    setIsOpen(false);
    if (orgId === activeOrgId) return;

    try {
      // 1. Update the backend session FIRST so all subsequent API calls
      //    use the new activeOrgId.
      await updateActiveOrg.mutateAsync({ orgId });

      // 2. Now update the local store so the UI re-renders with the new org.
      const grants = userdetail.grants ?? [];
      const activeGrant = grants.find(g => g.orgId === orgId);
      const newRole = activeGrant?.roleId ?? userdetail.role;

      setUserDetail({
        ...userdetail,
        lastActiveOrgId: orgId,
        role: newRole,
      });

      // 3. Invalidate all org-scoped queries so they refetch against
      //    the now-updated backend session.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['user-projects'] }),
        queryClient.invalidateQueries({ queryKey: ['chapter-assignments'] }),
        queryClient.invalidateQueries({ queryKey: ['users'] }),
        queryClient.invalidateQueries({ queryKey: ['userDetails'] }),
      ]);
    } catch (error) {
      Logger.logException(error instanceof Error ? error : new Error(String(error)), {
        source: 'Failed to update active organization',
      });
    }
  };

  return (
    <div className='relative'>
      {/* Trigger — white pill with border, matching the screenshot */}
      <button
        className='bg-background border-border flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors hover:bg-gray-50 dark:hover:bg-gray-800'
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className='text-foreground max-w-[200px] truncate'>{activeOrgName}</span>
        <ChevronDown
          className={`text-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
          size={16}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          <div className='fixed inset-0 z-40' onClick={() => setIsOpen(false)} />
          <div className='border-border bg-background absolute top-full right-0 z-50 mt-2 w-64 overflow-hidden rounded-lg border shadow-lg'>
            <div className='text-muted-foreground border-border border-b px-3 py-2 text-xs font-semibold tracking-wider uppercase'>
              Switch Organization
            </div>
            {organizations.map(org => (
              <button
                key={org.id}
                className={`flex w-full items-center justify-between px-3 py-2.5 text-sm transition-colors ${
                  org.id === activeOrgId
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-foreground hover:bg-accent'
                }`}
                onClick={() => handleSelect(org.id)}
              >
                <span className='truncate'>{org.name}</span>
                {org.id === activeOrgId && (
                  <Check className='text-primary ml-2 shrink-0' size={16} />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
