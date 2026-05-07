import { type UserRole } from '@/lib/types';

export interface AuthContext {
  isAuthenticated: boolean;
  isLoading: boolean;
  role: UserRole | null;
  loginWithRedirect: (options?: { appState?: { returnTo?: string } }) => Promise<void>;
}

export interface RouterContext {
  auth: AuthContext;
}
