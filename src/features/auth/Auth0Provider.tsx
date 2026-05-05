import { type ReactNode } from 'react';

import { Auth0Provider } from '@auth0/auth0-react';

import { auth0Config } from '@/lib/auth0-config';

interface Auth0ProviderWrapperProps {
  children: ReactNode;
}

export function Auth0ProviderWrapper({ children }: Auth0ProviderWrapperProps) {
  return <Auth0Provider {...auth0Config}>{children}</Auth0Provider>;
}
