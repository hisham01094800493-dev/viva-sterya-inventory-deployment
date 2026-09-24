import { createVercelApp } from "../dist/vercel-api.js";

let handlerPromise;

export default async function handler(req, res) {
  if (!handlerPromise) {
    process.env.NODE_ENV = "production";
    handlerPromise = createVercelApp();
  }
  const app = await handlerPromise;
  return app(req, res);
}
