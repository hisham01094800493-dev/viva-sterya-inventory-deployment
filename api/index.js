import { createVercelApp } from "../dist/vercel-api.js";

let handlerPromise;

export default async function handler(req, res) {
  if (!handlerPromise) {
    process.env.NODE_ENV = "production";
    handlerPromise = createVercelApp();
  }
  const app = await handlerPromise;
  const handler = typeof app === "function" ? app : app?.default ?? app?.app ?? app?.handle?.bind(app);
  if (!handler) throw new TypeError("Vercel API bundle did not return an Express handler");
  return handler(req, res);
}
