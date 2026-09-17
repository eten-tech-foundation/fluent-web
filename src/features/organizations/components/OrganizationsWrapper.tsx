import { useState } from 'react';

import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import {
  useCreateOrganization,
  useOrganizations,
} from '@/features/organizations/hooks/useOrganizations';
import { Logger } from '@/lib/services/logger';

import { CreateOrganizationModal } from './CreateOrganizationModal';
import { OrganizationsPage } from './OrganizationsPage';

const routeApi = getRouteApi('/_authenticated/organizations/');

export const OrganizationsWrapper: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { modal } = routeApi.useSearch();

  const { data: organizations = [], isLoading } = useOrganizations();
  const createOrganizationMutation = useCreateOrganization();
  const [createError, setCreateError] = useState<string | null>(null);

  const handleOpenCreate = () => {
    setCreateError(null);
    void navigate({ to: '/organizations', search: { modal: 'create' as const } });
  };

  const handleCloseCreate = () => {
    setCreateError(null);
    void navigate({ to: '/organizations', search: {} });
  };

  const handleSelectOrganization = (orgId: number) => {
    void navigate({
      to: '/organizations/$orgId',
      params: { orgId: orgId.toString() },
      search: {},
    });
  };

  const handleSave = async (name: string): Promise<void> => {
    setCreateError(null);
    try {
      const org = await createOrganizationMutation.mutateAsync({ name });
      toast.success(t('organizationCreated'));
      // Land on the new org with the invite dialog already open — the next onboarding step.
      void navigate({
        to: '/organizations/$orgId',
        params: { orgId: org.id.toString() },
        search: { modal: 'add' as const },
      });
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'An unknown error occurred');
      Logger.logException(error instanceof Error ? error : new Error(String(error)), {
        source: 'Failed to create organization',
      });
      throw error;
    }
  };

  return (
    <>
      <OrganizationsPage
        loading={isLoading}
        organizations={organizations}
        onCreateOrganization={handleOpenCreate}
        onSelectOrganization={handleSelectOrganization}
      />

      <CreateOrganizationModal
        error={createError}
        isLoading={createOrganizationMutation.isPending}
        isOpen={modal === 'create'}
        onClose={handleCloseCreate}
        onSave={handleSave}
      />
    </>
  );
};
