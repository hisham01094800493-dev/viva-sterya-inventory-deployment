import { getBackupSnapshotFromRecord, restoreBackupSnapshot } from "../server/db";

const backupId = Number(process.argv[2]);
const maxRowsPerTable = Number(process.argv[3] ?? "3");

if (!Number.isInteger(backupId) || backupId < 1 || !Number.isInteger(maxRowsPerTable) || maxRowsPerTable < 1) {
  throw new Error("مرّر رقم نسخة وعيّنة صحيحين، مثال: pnpm exec tsx scripts/verify-backup-restore.mts 30001 3");
}

const { record, snapshot } = await getBackupSnapshotFromRecord(backupId);
const result = await restoreBackupSnapshot(snapshot, { dryRun: true, maxRowsPerTable });

console.log(JSON.stringify({
  backup: { id: record.id, fileName: record.fileName, createdAt: record.createdAt, backupType: record.backupType },
  verification: result,
}, null, 2));

process.exit(0);
