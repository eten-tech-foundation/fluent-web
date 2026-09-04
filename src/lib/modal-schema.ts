import { z } from 'zod';

export const modalSchema = z.enum([
  'settings',
  'profile',
  'add',
  'edit',
  'create',
  'export',
  'metadata',
]);
export type ModalType = z.infer<typeof modalSchema>;
