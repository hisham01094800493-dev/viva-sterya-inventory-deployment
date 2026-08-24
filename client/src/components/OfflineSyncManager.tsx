import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { subscribeOfflineSync, syncOfflineQueue, type OfflineQueueEntry } from "@/lib/offlineQueue";

export default function OfflineSyncManager() {
  const createAddition = trpc.additions.create.useMutation();
  const createDisbursement = trpc.disbursements.create.useMutation();
  const createTransfer = trpc.transfers.create.useMutation();
  const utils = trpc.useUtils();

  useEffect(() => {
    const sync = () => void syncOfflineQueue(async (entry: OfflineQueueEntry) => {
      if (entry.kind === "additions") await createAddition.mutateAsync(entry.payload as never);
      else if (entry.kind === "disbursements") await createDisbursement.mutateAsync(entry.payload as never);
      else await createTransfer.mutateAsync(entry.payload as never);
      await Promise.all([
        utils.dashboard.summary.invalidate(),
        utils.items.list.invalidate(),
        utils.items.listPaged.invalidate(),
        utils.items.categories.invalidate(),
        utils.additions.list.invalidate(),
        utils.disbursements.list.invalidate(),
        utils.transfers.list.invalidate(),
      ]);
    });
    const unsubscribe = subscribeOfflineSync(sync);
    window.addEventListener("online", sync);
    sync();
    return () => {
      unsubscribe();
      window.removeEventListener("online", sync);
    };
  }, [createAddition, createDisbursement, createTransfer, utils]);

  return null;
}
