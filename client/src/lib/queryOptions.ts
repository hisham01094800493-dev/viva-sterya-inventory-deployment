export const inventoryQueryOptions = {
  staleTime: 15_000,
  gcTime: 5 * 60_000,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  networkMode: "offlineFirst",
} as const;

export const dashboardQueryOptions = {
  ...inventoryQueryOptions,
  staleTime: 10_000,
  refetchInterval: 15_000,
  refetchIntervalInBackground: false,
} as const;

export const detailQueryOptions = {
  ...inventoryQueryOptions,
  staleTime: 60_000,
} as const;

export const manualRefreshQueryOptions = {
  ...inventoryQueryOptions,
  refetchOnMount: false,
} as const;

export function limitRows<T>(rows: T[] | undefined, limit: number): T[] {
  return rows?.slice(0, limit) ?? [];
}

export function normalizeSearchTerm(value: string | undefined | null): string {
  return String(value ?? "").trim().toLocaleLowerCase("ar-EG");
}
