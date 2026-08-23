// Generic notification list — mirrors vea-api's Notification model (open-
// ended `type` string + `payload` Json, no pre-rendered text; see
// NotificationBell.tsx for the type -> translation-key mapping that turns
// this into an actual message). Not offer-specific — any future feature
// that calls the backend's NotificationsService.createForMany shows up
// here automatically, no frontend change needed beyond adding its type to
// that mapping.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Paths } from '../paths';
import { patch } from '../client';
import { useApiGet, useApiGetList } from '../factory';

export interface ApiNotification {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export function useNotifications() {
  return useApiGetList<ApiNotification>(Paths.Notifications);
}

export function useUnreadNotificationCount() {
  return useApiGet<{ count: number }>(
    `${Paths.Notifications}/unread-count`,
    [Paths.Notifications, 'unread-count'],
  );
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      patch<ApiNotification>({ path: `${Paths.Notifications}/${id}/read` }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [Paths.Notifications] });
      void queryClient.invalidateQueries({ queryKey: [Paths.Notifications, 'unread-count'] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => patch<void>({ path: `${Paths.Notifications}/read-all` }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [Paths.Notifications] });
      void queryClient.invalidateQueries({ queryKey: [Paths.Notifications, 'unread-count'] });
    },
  });
}
