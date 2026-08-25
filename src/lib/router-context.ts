export interface AuthContext {
  isAuthenticated: boolean;
  isLoading: boolean;
  /** True for Org Owner / Org Manager / SuperAdmin — can create projects */
  isManager?: boolean;
  /** True for any role with USER_VIEW — includes project-scoped Project Managers */
  canViewUsers?: boolean;
}

export interface RouterContext {
  auth: AuthContext;
}
