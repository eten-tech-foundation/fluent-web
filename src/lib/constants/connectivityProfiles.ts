export type ConnectivityProfile = 'usually_connected' | 'sometimes_connected' | 'rarely_connected';

export interface ConnectivityProfileOption {
  value: ConnectivityProfile;
  labelKey: string;
  descKey: string;
}

// Ordered exactly as issue #280 requires: Usually, Sometimes, Rarely.
export const CONNECTIVITY_PROFILE_OPTIONS: ConnectivityProfileOption[] = [
  {
    value: 'usually_connected',
    labelKey: 'connectivityUsuallyConnected',
    descKey: 'connectivityTooltipUsually',
  },
  {
    value: 'sometimes_connected',
    labelKey: 'connectivitySometimesConnected',
    descKey: 'connectivityTooltipSometimes',
  },
  {
    value: 'rarely_connected',
    labelKey: 'connectivityRarelyConnected',
    descKey: 'connectivityTooltipRarely',
  },
];
