"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useBusinessStore } from "@/components/business-store-provider";
import { usePlatform } from "@/components/platform-provider";
import { commerceApi, type ApiNotification } from "@/lib/commerce-api";
import { offlineScope, offlineStorage, type OfflineSnapshot } from "@/lib/offline-storage";
import type { AppNotification, NotificationTone } from "@/lib/business-types";
import { apiMode } from "@/lib/platform-api";

export function useNotifications() {
  const { ready, offline, bootstrap, currentLocation } = usePlatform();
  const scope = offlineScope(bootstrap.organization.id, currentLocation.id);
  const snapshotKey = `${scope}:${bootstrap.user.id}`;
  const notificationQueryKey = ["notifications", currentLocation.id, bootstrap.user.id];
  const [cachedNotifications, setCachedNotifications] = useState<{
    key: string;
    snapshot: OfflineSnapshot<ApiNotification[]>;
  } | null>(null);
  const {
    state,
    markNotificationRead: markLocalRead,
    markAllNotificationsRead: markAllLocalRead,
    dismissNotification: dismissLocal,
  } = useBusinessStore();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: notificationQueryKey,
    queryFn: ({ signal }) => commerceApi.notifications(signal),
    enabled: apiMode && ready && !offline,
    staleTime: 20_000,
  });
  useEffect(() => {
    let active = true;
    void offlineStorage.getNotificationsSnapshot(scope, bootstrap.user.id)
      .then((snapshot) => {
        if (active && snapshot) setCachedNotifications({ key: snapshotKey, snapshot });
      }).catch(() => undefined);
    return () => { active = false; };
  }, [bootstrap.user.id, scope, snapshotKey]);
  useEffect(() => {
    if (!apiMode || !query.data || offline) return;
    void offlineStorage.saveNotificationsSnapshot(scope, bootstrap.user.id, query.data.results)
      .catch(() => undefined);
  }, [bootstrap.user.id, offline, query.data, scope]);
  type NotificationPage = {
    next: string | null;
    previous: string | null;
    results: ApiNotification[];
  };
  const updateNotificationCache = (
    updater: (items: ApiNotification[]) => ApiNotification[],
  ) => {
    queryClient.setQueryData<NotificationPage>(notificationQueryKey, (current) =>
      current
        ? {
            ...current,
            results: updater(current.results ?? []),
          }
        : current,
    );
  };
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: notificationQueryKey });
  const readMutation = useMutation({
    mutationFn: commerceApi.markNotificationRead,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: notificationQueryKey });
      const previous =
        queryClient.getQueryData<NotificationPage>(notificationQueryKey);
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
        queryClient.setQueryData(notificationQueryKey, context.previous);
      }
    },
    onSettled: invalidate,
  });
  const readAllMutation = useMutation({
    mutationFn: commerceApi.markAllNotificationsRead,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: notificationQueryKey });
      const previous =
        queryClient.getQueryData<NotificationPage>(notificationQueryKey);
      const readAt = new Date().toISOString();
      updateNotificationCache((items) =>
        items.map((item) => ({ ...item, read_at: item.read_at ?? readAt })),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(notificationQueryKey, context.previous);
      }
    },
    onSettled: invalidate,
  });
  const dismissMutation = useMutation({
    mutationFn: commerceApi.dismissNotification,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: notificationQueryKey });
      const previous =
        queryClient.getQueryData<NotificationPage>(notificationQueryKey);
      updateNotificationCache((items) => items.filter((item) => item.id !== id));
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(notificationQueryKey, context.previous);
      }
    },
    onSettled: invalidate,
  });

  const cached = cachedNotifications?.key === snapshotKey ? cachedNotifications.snapshot.value : [];
  const notifications = apiMode
    ? (query.data?.results ?? cached).map(
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
    loading: apiMode && ready && !offline && query.isPending && !cached.length,
    markRead: (id: string) => {
      if (offline) return;
      if (apiMode) readMutation.mutate(id);
      else markLocalRead(id);
    },
    markAllRead: () => {
      if (offline) return;
      if (apiMode) readAllMutation.mutate();
      else markAllLocalRead();
    },
    dismiss: (id: string) => {
      if (offline) return;
      if (apiMode) dismissMutation.mutate(id);
      else dismissLocal(id);
    },
  };
}
