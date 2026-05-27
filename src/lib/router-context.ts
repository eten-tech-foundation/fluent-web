import { type UserRole } from '@/lib/types';

export interface AuthContext {
  isAuthenticated: boolean;
  isLoading: boolean;
  role: UserRole | null;
}

export interface RouterContext {
  auth: AuthContext;
}
