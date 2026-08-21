import { getDisplayRole, ROLES, type RoleOption } from '@/lib/types';

/** Dropdown options for UserModal with canonical role values */
export const roleOptions: RoleOption[] = [
  { value: ROLES.PROJECT_MANAGER, label: 'Project Manager' },
  { value: ROLES.PROJECT_TRANSLATOR, label: 'Translator' },
];

export const getRoleLabel = (roleName: string): string => {
  const option = roleOptions.find(r => r.value === roleName);
  return option?.label ?? getDisplayRole(roleName);
};
