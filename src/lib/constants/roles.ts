import { ROLES } from '@/lib/types';

export const roleOptions = [
  { value: ROLES.PROJECT_MANAGER, label: 'Manager' },
  { value: ROLES.PROJECT_TRANSLATOR, label: 'Translator' },
];

export const getRoleLabel = (roleName: string): string => {
  const option = roleOptions.find(r => r.value === roleName);
  return option?.label ?? roleName;
};
