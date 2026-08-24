import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { resolveOfflineUser } from "./offlineSession";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo, useState } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

type CachedUser = {
  id: number;
  openId?: string;
  name?: string | null;
  email?: string | null;
  role?: "admin" | "manager" | "user" | "operator" | "reviewer" | "reports" | "viewer";
  lastSignedIn?: number | string | Date;
};
const CACHED_USER_KEY = "manus-runtime-user-info";

function readCachedUser(): CachedUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHED_USER_KEY);
    if (!raw || raw === "null") return null;
    return JSON.parse(raw) as CachedUser;
  } catch {
    return null;
  }
}

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath } = options ?? {};
  const utils = trpc.useUtils();
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);
  const [cachedUser, setCachedUser] = useState<CachedUser | null>(readCachedUser);

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      void meQuery.refetch();
    };
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [meQuery.refetch]);

  useEffect(() => {
    if (!meQuery.data) return;
    setCachedUser(meQuery.data);
    try {
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify(meQuery.data));
    } catch {
      // Local storage may be unavailable in private browsing.
    }
  }, [meQuery.data]);

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (error instanceof TRPCClientError && error.data?.code === "UNAUTHORIZED") return;
      throw error;
    } finally {
      try {
        sessionStorage.removeItem("manus-cookie");
        localStorage.removeItem(CACHED_USER_KEY);
      } catch {}
      setCachedUser(null);
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  const state = useMemo(() => {
    const user = resolveOfflineUser(meQuery.data, cachedUser, isOffline);
    return {
      user,
      loading: (meQuery.isLoading && !isOffline) || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(user),
      isOfflineSession: isOffline && Boolean(user),
    };
  }, [cachedUser, isOffline, logoutMutation.error, logoutMutation.isPending, meQuery.data, meQuery.error, meQuery.isLoading]);

  useEffect(() => {
    if (!redirectOnUnauthenticated || isOffline) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (redirectPath && window.location.pathname === redirectPath) return;
    if (redirectPath) window.location.href = redirectPath;
    else startLogin();
  }, [redirectOnUnauthenticated, redirectPath, isOffline, logoutMutation.isPending, meQuery.isLoading, state.user]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
