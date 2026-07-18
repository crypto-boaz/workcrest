"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useBusinessStore } from "@/components/business-store-provider";
import { usePlatform } from "@/components/platform-provider";
import { commerceApi, type ApiNotification } from "@/lib/commerce-api";
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
  type NotificationPage = {
    next: string | null;
    previous: string | null;
    results: ApiNotification[];
  };
  const updateNotificationCache = (
    updater: (items: ApiNotification[]) => ApiNotification[],
  ) => {
    queryClient.setQueryData<NotificationPage>(["notifications"], (current) =>
      current
        ? {
            ...current,
            results: updater(current.results ?? []),
          }
        : current,
    );
  };
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  const readMutation = useMutation({
    mutationFn: commerceApi.markNotificationRead,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["notifications"] });
      const previous =
        queryClient.getQueryData<NotificationPage>(["notifications"]);
      updateNotificationCache((items) =>
        items.map((item) =>
          item.id === id
            ? { ...item, read_at: item.read_at ?? new Date().toISOString() }
            : item,
        ),
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["notifications"], context.previous);
      }
    },
    onSettled: invalidate,
  });
  const readAllMutation = useMutation({
    mutationFn: commerceApi.markAllNotificationsRead,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["notifications"] });
      const previous =
        queryClient.getQueryData<NotificationPage>(["notifications"]);
      const readAt = new Date().toISOString();
      updateNotificationCache((items) =>
        items.map((item) => ({ ...item, read_at: item.read_at ?? readAt })),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["notifications"], context.previous);
      }
    },
    onSettled: invalidate,
  });
  const dismissMutation = useMutation({
    mutationFn: commerceApi.dismissNotification,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["notifications"] });
      const previous =
        queryClient.getQueryData<NotificationPage>(["notifications"]);
      updateNotificationCache((items) => items.filter((item) => item.id !== id));
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["notifications"], context.previous);
      }
    },
    onSettled: invalidate,
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
