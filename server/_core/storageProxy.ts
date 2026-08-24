import type { Express } from "express";
import { storageGetObject } from "../storage";

export function registerStorageProxy(app: Express) {
  app.get(["/api/files/*", "/manus-storage/*"], async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) return res.status(400).send("Missing storage key");
    try {
      const object = await storageGetObject(key, typeof req.headers.range === "string" ? req.headers.range : undefined);
      if (!object.Body || typeof (object.Body as any).pipe !== "function") return res.status(502).send("Storage backend returned no file body");
      res.status(object.ContentRange ? 206 : 200).set({
        "Cache-Control": /\.(?:ttf|woff2?)$/i.test(key) ? "public, max-age=31536000, immutable" : "private, max-age=300",
        "Content-Type": object.ContentType || "application/octet-stream",
        ...(object.ContentLength ? { "Content-Length": String(object.ContentLength) } : {}),
        ...(object.ContentRange ? { "Content-Range": object.ContentRange, "Accept-Ranges": "bytes" } : {}),
      });
      (object.Body as NodeJS.ReadableStream).pipe(res);
    } catch (error) {
      console.error("[StorageProxy] failed", error);
      res.status(502).send("Storage backend error");
    }
  });
}
