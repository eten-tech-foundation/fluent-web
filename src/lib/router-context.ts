export interface AuthContext {
  isAuthenticated: boolean;
  isLoading: boolean;
  loginWithRedirect: (options?: { appState?: { returnTo?: string } }) => Promise<void>;
}

export interface RouterContext {
  auth: AuthContext;
}
