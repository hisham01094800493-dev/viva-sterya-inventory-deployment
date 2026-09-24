import type { Express, Response } from "express";
import { storageGetObject } from "../storage";

async function streamObjectBody(body: unknown, res: Response) {
  const candidate = body as {
    pipe?: (destination: Response) => unknown;
    [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array | Buffer | string>;
    getReader?: () => ReadableStreamDefaultReader<Uint8Array>;
  } | null | undefined;

  if (!candidate) throw new Error("Storage backend returned no file body");

  if (typeof candidate.pipe === "function") {
    candidate.pipe(res);
    return;
  }

  if (typeof candidate.getReader === "function") {
    const reader = candidate.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.write(Buffer.from(value))) await new Promise<void>((resolve) => res.once("drain", resolve));
      }
    } finally {
      reader.releaseLock();
    }
    res.end();
    return;
  }

  if (typeof candidate[Symbol.asyncIterator] === "function") {
    for await (const chunk of candidate as AsyncIterable<Uint8Array | Buffer | string>) {
      if (!res.write(Buffer.from(chunk))) await new Promise<void>((resolve) => res.once("drain", resolve));
    }
    res.end();
    return;
  }

  throw new Error("Storage backend returned an unsupported file body");
}

export function registerStorageProxy(app: Express) {
  app.get(["/api/files/*", "/manus-storage/*"], async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) return res.status(400).send("Missing storage key");
    try {
      const object = await storageGetObject(key, typeof req.headers.range === "string" ? req.headers.range : undefined);
      res.status(object.ContentRange ? 206 : 200).set({
        "Cache-Control": /\.(?:ttf|woff2?)$/i.test(key) ? "public, max-age=31536000, immutable" : "private, max-age=300",
        "Content-Type": object.ContentType || "application/octet-stream",
        ...(object.ContentLength ? { "Content-Length": String(object.ContentLength) } : {}),
        ...(object.ContentRange ? { "Content-Range": object.ContentRange, "Accept-Ranges": "bytes" } : {}),
      });
      await streamObjectBody(object.Body, res);
    } catch (error) {
      console.error("[StorageProxy] failed", error);
      if (!res.headersSent) res.status(502).send("Storage backend error");
      else res.destroy(error instanceof Error ? error : undefined);
    }
  });
}
