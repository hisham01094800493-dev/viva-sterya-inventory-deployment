export function resolveOfflineUser<T>(remoteUser: T | null | undefined, cachedUser: T | null, isOffline: boolean) {
  return remoteUser ?? (isOffline ? cachedUser : null);
}
