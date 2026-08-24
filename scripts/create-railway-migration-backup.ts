import "dotenv/config";
import { createBackupRecord } from "../server/db";

const result = await createBackupRecord({ backupType: "railway_migration" });

console.log(JSON.stringify({
  backupId: result.record.id,
  fileName: result.record.fileName,
  fileSize: result.record.fileSize,
  summary: result.record.summary,
  exportedAt: result.snapshot.exportedAt,
  tables: Object.fromEntries(Object.entries(result.snapshot.tables).map(([name, rows]) => [name, Array.isArray(rows) ? rows.length : 0])),
  assets: result.snapshot.assets.length,
}, null, 2));
