import type { Express } from "express";
import { storageGetSignedUrl } from "../storage";

export function registerStorageProxy(app: Express) {
  app.get(["/api/files/*", "/manus-storage/*"], async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) return res.status(400).send("Missing storage key");
    try {
      const url = await storageGetSignedUrl(key);
      res.set("Cache-Control", "private, max-age=300");
      res.redirect(307, url);
    } catch (error) {
      console.error("[StorageProxy] failed", error);
      res.status(502).send("Storage backend error");
    }
  });
}
