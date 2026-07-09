"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useBusinessStore } from "@/components/business-store-provider";
import { usePlatform } from "@/components/platform-provider";
import { commerceApi } from "@/lib/commerce-api";
import type { AppNotification, NotificationTone } from "@/lib/business-types";
import { apiMode } from "@/lib/platform-api";

export function useNotifications() {
  const { ready } = usePlatform();
  const {
    state,
    markNotificationRead: markLocalRead,
    markAllNotificationsRead: markAllLocalRead,
    dismissNotification: dismissLocal,
  } = useBusinessStore();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: ({ signal }) => commerceApi.notifications(signal),
    enabled: apiMode && ready,
    staleTime: 20_000,
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  const readMutation = useMutation({
    mutationFn: commerceApi.markNotificationRead,
    onSuccess: invalidate,
  });
  const readAllMutation = useMutation({
    mutationFn: commerceApi.markAllNotificationsRead,
    onSuccess: invalidate,
  });
  const dismissMutation = useMutation({
    mutationFn: commerceApi.dismissNotification,
    onSuccess: invalidate,
  });

  const notifications = apiMode
    ? (query.data?.results ?? []).map(
        (item): AppNotification => ({
          id: item.id ?? "",
          title: item.title ?? "Notification",
          body: item.body ?? "",
          tone: (
            item.tone === "error" ? "warning" : item.tone ?? "info"
          ) as NotificationTone,
          href: item.href || "/alerts",
          createdAt: item.created_at ?? new Date().toISOString(),
          unread: !item.read_at,
        }),
      )
    : state.notifications;

  return {
    notifications,
    unread: notifications.filter((item) => item.unread).length,
    loading: apiMode && ready && query.isPending,
    markRead: (id: string) => {
      if (apiMode) readMutation.mutate(id);
      else markLocalRead(id);
    },
    markAllRead: () => {
      if (apiMode) readAllMutation.mutate();
      else markAllLocalRead();
    },
    dismiss: (id: string) => {
      if (apiMode) dismissMutation.mutate(id);
      else dismissLocal(id);
    },
  };
}
