import {
  ChapterAssignmentStatusDisplay,
  ConnectivityProfileDisplay,
  type ChapterAssignmentStatus,
  type ConnectivityProfile,
} from '@/lib/types';

export const getStatusDisplay = (status: ChapterAssignmentStatus): string => {
  return ChapterAssignmentStatusDisplay[status] || status;
};

export const getConnectivityProfileDisplay = (value?: string | null): string => {
  if (value && value in ConnectivityProfileDisplay) {
    return ConnectivityProfileDisplay[value as ConnectivityProfile];
  }
  return ConnectivityProfileDisplay.rarely_connected;
};

// Formats a project's last-activity timestamp for the metadata pane
export const getLastActivityDisplay = (value?: string | null): string => {
  if (!value) return 'No activity yet';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No activity yet';

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
};
