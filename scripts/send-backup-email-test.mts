import { sendBackupEmailTest } from "../server/db";

const result = await sendBackupEmailTest();
console.log(JSON.stringify({ sent: result.sent, recipient: result.recipient }));
process.exit(0);
