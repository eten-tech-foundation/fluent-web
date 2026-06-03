export type ConnectivityProfile = 'usually_connected' | 'sometimes_connected' | 'rarely_connected';

// Sentinel value for the "unset" Select option. Radix SelectItem cannot use an
// empty-string value, so this maps back to null (key omitted in metadata).
export const CONNECTIVITY_PROFILE_NONE = '__none__';

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
