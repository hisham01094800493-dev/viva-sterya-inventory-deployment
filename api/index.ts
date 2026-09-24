import { createApp } from "../server/_core/index";

let handlerPromise: ReturnType<typeof createApp> | undefined;

export default async function handler(req: any, res: any) {
  if (!handlerPromise) {
    process.env.NODE_ENV = "production";
    handlerPromise = createApp({ withStaticFiles: false });
  }
  const { app } = await handlerPromise;
  return app(req, res);
}
