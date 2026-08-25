import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const output = resolve(process.cwd(), "client/public/app-version.json");
const buildId = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GITHUB_SHA || `build-${Date.now().toString(36)}`;
const payload = { version: buildId.slice(0, 16), releasedAt: new Date().toISOString() };

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
