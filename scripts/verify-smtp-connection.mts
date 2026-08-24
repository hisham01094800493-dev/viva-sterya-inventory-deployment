import { verifyConfiguredSmtp } from "../server/email";

const result = await verifyConfiguredSmtp();
console.log(JSON.stringify(result));
process.exit(result.verified ? 0 : 1);
