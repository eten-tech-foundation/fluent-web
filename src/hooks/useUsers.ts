import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { config } from '@/lib/config';
import { Logger } from '@/lib/services/logger';
import { type User } from '@/lib/types';

const fetchUsers = async (): Promise<User[]> => {
  const res = await fetch(`${config.api.url}/users`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error('Failed to fetch users');

  const data = (await res.json()) as User[];
  return data;
};

const knownErrors = ['A user with this email already exists.', 'Username already exists.'];
const apiRequestWithStatus = async <T>(
  url: string,
  options: RequestInit
): Promise<{ data: T; status: number }> => {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorMessage = await parseErrorMessage(response);
    throw new Error(errorMessage);
  }

  return { data: (await response.json()) as T, status: response.status };
};

const apiRequest = async <T>(url: string, options: RequestInit): Promise<T> =>
  (await apiRequestWithStatus<T>(url, options)).data;

const parseErrorMessage = async (response: Response): Promise<string> => {
  try {
    const errorData = (await response.json()) as { message?: string };
    if (errorData.message && knownErrors.includes(errorData.message)) {
      return errorData.message;
    }
  } catch {
    const text = await response.text();
    if (text && knownErrors.includes(text)) return text;
  }

  return 'Generic API error';
};

/** Payload sent to POST /users/invite */
export interface InviteUserPayload {
  email: string;
  username: string;
  orgId: number;
  projectId?: number | null;
  roleName: string;
  orgName?: string;
  inviterName?: string;
}

/** Result of POST /users/invite. `created` is true when a new Fluent account was made (201). */
export interface InviteUserResult {
  user: User;
  created: boolean;
}

const createUser = async (userData: InviteUserPayload): Promise<InviteUserResult> => {
  try {
    const { data, status } = await apiRequestWithStatus<{ user: User }>(
      `${config.api.url}/users/invite`,
      { method: 'POST', body: JSON.stringify(userData) }
    );
    return { user: data.user, created: status === 201 };
  } catch (error: unknown) {
    if (error instanceof Error && error.message && error.message !== 'Generic API error') {
      return Promise.reject(error);
    }
    return Promise.reject(new Error('Error: User was not created.'));
  }
};

const updateUser = async (userData: User): Promise<User> => {
  try {
    return await apiRequest<User>(`${config.api.url}/users/${userData.id}`, {
      method: 'PATCH',
      body: JSON.stringify(userData),
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message && error.message !== 'Generic API error') {
      return Promise.reject(error);
    }
    return Promise.reject(new Error('Error: User was not saved.'));
  }
};

const getUserDetails = async (email: string): Promise<User> => {
  const res = await fetch(`${config.api.url}/users/email/${email}`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error('Failed to fetch user details');
  const data = (await res.json()) as User;
  return data;
};

export const useUsers = (enabled: boolean = true) => {
  return useQuery<User[]>({
    queryKey: ['users'],
    queryFn: fetchUsers,
    enabled,
  });
};

export const useCreateUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userData }: { userData: InviteUserPayload }) => createUser(userData),
    onSuccess: (_data, { userData }) => {
      // Invalidate and refetch users list
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      // Invalidate project users list if invited within a project context
      if (userData.projectId) {
        void queryClient.invalidateQueries({ queryKey: ['projectUsers', userData.projectId] });
      } else {
        void queryClient.invalidateQueries({ queryKey: ['organizationUsers', userData.orgId] });
        void queryClient.invalidateQueries({ queryKey: ['organizations'] });
      }
    },
    onError: error => {
      Logger.logException(error, { context: 'Error creating user' });
    },
  });
};

export const useUpdateUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userData }: { userData: User }) => updateUser(userData),
    onSuccess: () => {
      // Invalidate and refetch users list
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: error => {
      Logger.logException(error, { context: 'Error updating user' });
    },
  });
};

const updateOrgUserRole = async ({
  orgId,
  userId,
  roleName,
}: {
  orgId: number;
  userId: number;
  roleName: string;
}): Promise<User> => {
  try {
    return await apiRequest<User>(`${config.api.url}/organizations/${orgId}/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ roleName }),
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message && error.message !== 'Generic API error') {
      return Promise.reject(error);
    }
    return Promise.reject(new Error('Error: Role was not saved.'));
  }
};

/** PATCH /organizations/{orgId}/users/{userId} — change a member's org-level role. */
export const useUpdateOrgUserRole = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateOrgUserRole,
    onSuccess: (_data, { orgId }) => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void queryClient.invalidateQueries({ queryKey: ['organizationUsers', orgId] });
    },
    onError: error => {
      Logger.logException(error, { context: 'Error updating org role' });
    },
  });
};

const removeOrgUser = async ({
  orgId,
  userId,
}: {
  orgId: number;
  userId: number;
}): Promise<void> => {
  const response = await fetch(`${config.api.url}/organizations/${orgId}/users/${userId}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new Error(message === 'Generic API error' ? 'Error: User was not removed.' : message);
  }
};

/** DELETE /organizations/{orgId}/users/{userId} — remove a member from the org entirely. */
export const useRemoveOrgUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: removeOrgUser,
    onSuccess: (_data, { orgId }) => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void queryClient.invalidateQueries({ queryKey: ['organizationUsers', orgId] });
      void queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
    onError: error => {
      Logger.logException(error, { context: 'Error removing org user' });
    },
  });
};

export const useGetUserDetailsMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: getUserDetails,
    onSuccess: (data, email) => {
      // Cache the user details and invalidate related queries
      queryClient.setQueryData(['userDetails', email], data);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: error => {
      Logger.logException(error, { context: 'Error fetching user details' });
    },
  });
};

const updateActiveOrg = async (orgId: number, signal?: AbortSignal): Promise<void> => {
  const response = await fetch(`${config.api.url}/users/me/active-org`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orgId }),
    signal,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || 'Failed to update active org');
  }
};

export const useUpdateActiveOrg = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, signal }: { orgId: number; signal?: AbortSignal }) =>
      updateActiveOrg(orgId, signal),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void queryClient.invalidateQueries({ queryKey: ['userDetails'] });
    },
    onError: error => {
      Logger.logException(error, { context: 'Error updating active org' });
    },
  });
};
