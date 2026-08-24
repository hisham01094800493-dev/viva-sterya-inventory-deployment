import { runIsolatedFullBackupRestore } from "../server/db";

const result = await runIsolatedFullBackupRestore();
console.log(JSON.stringify(result, null, 2));
process.exit(result.status === "passed" || result.status === "skipped" ? 0 : 1);
