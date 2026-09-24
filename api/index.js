import { createApp } from "../dist/index.js";

let handlerPromise;

export default async function handler(req, res) {
  if (!handlerPromise) {
    process.env.NODE_ENV = "production";
    handlerPromise = createApp({ withStaticFiles: false });
  }
  const { app } = await handlerPromise;
  return app(req, res);
}
