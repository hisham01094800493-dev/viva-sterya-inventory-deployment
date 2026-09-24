import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { API_ORIGIN, startLogin } from "./const";
import "./index.css";
import { registerPwaServiceWorker } from "./lib/pwa";
import { restoreOfflineQueryCache, subscribeToOfflineQueryCache } from "./lib/offlineQueryCache";
import { trpc } from "./lib/trpc";
import { toast } from "sonner";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnReconnect: true,
      networkMode: "offlineFirst",
    },
  },
});

registerPwaServiceWorker();

let lastPermissionToastAt = 0;
const showPermissionDenied = (error: unknown) => {
  if (!(error instanceof TRPCClientError) || typeof window === "undefined") return;
  const denied = error.data?.code === "FORBIDDEN" || error.message.includes("لا تملك صلاحية الوصول");
  if (!denied || Date.now() - lastPermissionToastAt < 1500) return;
  lastPermissionToastAt = Date.now();
  toast.error("تم منع الوصول: هذا الحساب لا يملك صلاحية فتح هذه الشاشة أو التقرير.");
};

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;
  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;
  if (!isUnauthorized || !navigator.onLine) return;
  startLogin();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    showPermissionDenied(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "success") {
    if (!event.mutation.options.onSuccess) toast.success("تم تنفيذ العملية بنجاح");
  }
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    showPermissionDenied(error);
    if (!event.mutation.options.onError) toast.error("تعذر تنفيذ العملية. يرجى المحاولة مرة أخرى.");
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${API_ORIGIN}/api/trpc`,
      transformer: superjson,
      headers() {
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) return { Authorization: `Bearer ${token}` };
          }
        } catch {
          // sessionStorage unavailable
        }
        return {};
      },
      fetch(input, init) {
        return globalThis.fetch(input, { ...(init ?? {}), credentials: "include" });
      },
    }),
  ],
});

async function bootstrap() {
  await restoreOfflineQueryCache(queryClient);
  subscribeToOfflineQueryCache(queryClient);
  window.addEventListener("online", () => {
    void queryClient.refetchQueries({ type: "active" });
  });
  createRoot(document.getElementById("root")!).render(
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </trpc.Provider>
  );
}

void bootstrap();
