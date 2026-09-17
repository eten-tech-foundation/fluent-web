import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { config } from '@/lib/config';
import { Logger } from '@/lib/services/logger';
import { type Organization, type OrganizationSummary, type User } from '@/lib/types';

export const ORG_NAME_CONFLICT_MESSAGE = 'An organization with this name already exists.';

const jsonHeaders = { 'Content-Type': 'application/json' };

const fetchJson = async <T>(path: string, errorMessage: string): Promise<T> => {
  const res = await fetch(`${config.api.url}${path}`, {
    method: 'GET',
    credentials: 'include',
    headers: jsonHeaders,
  });
  if (!res.ok) throw new Error(errorMessage);
  return (await res.json()) as T;
};

const fetchOrganizations = () =>
  fetchJson<OrganizationSummary[]>('/organizations', 'Failed to fetch organizations');

const fetchOrganization = (orgId: number) =>
  fetchJson<OrganizationSummary>(`/organizations/${orgId}`, 'Failed to fetch organization');

const fetchOrganizationUsers = (orgId: number) =>
  fetchJson<User[]>(`/organizations/${orgId}/users`, 'Failed to fetch organization users');

const createOrganization = async (name: string): Promise<Organization> => {
  const res = await fetch(`${config.api.url}/organizations`, {
    method: 'POST',
    credentials: 'include',
    headers: jsonHeaders,
    body: JSON.stringify({ name }),
  });
  if (res.status === 409) throw new Error(ORG_NAME_CONFLICT_MESSAGE);
  if (!res.ok) throw new Error('Error: Organization was not created.');
  return (await res.json()) as Organization;
};

export const useOrganizations = (enabled: boolean = true) =>
  useQuery<OrganizationSummary[]>({
    queryKey: ['organizations'],
    queryFn: fetchOrganizations,
    enabled,
  });

export const useOrganization = (orgId: number) =>
  useQuery<OrganizationSummary>({
    queryKey: ['organizations', orgId],
    queryFn: () => fetchOrganization(orgId),
    enabled: Number.isFinite(orgId),
  });

export const useOrganizationUsers = (orgId: number) =>
  useQuery<User[]>({
    queryKey: ['organizationUsers', orgId],
    queryFn: () => fetchOrganizationUsers(orgId),
    enabled: Number.isFinite(orgId),
  });

export const useCreateOrganization = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name }: { name: string }) => createOrganization(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
    onError: error => {
      Logger.logException(error, { context: 'Error creating organization' });
    },
  });
};
