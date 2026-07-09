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
