import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function storageConfig() {
  const endpoint = process.env.S3_ENDPOINT ?? process.env.ENDPOINT;
  const region = process.env.S3_REGION ?? process.env.REGION ?? "auto";
  const bucket = process.env.S3_BUCKET ?? process.env.BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID ?? process.env.ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY ?? process.env.SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) throw new Error("S3 storage is not configured");
  return { endpoint, region, bucket, accessKeyId, secretAccessKey };
}

function client() {
  const config = storageConfig();
  return { bucket: config.bucket, s3: new S3Client({ endpoint: config.endpoint, region: config.region, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } }) };
}

function normalizeKey(relKey: string) { return relKey.replace(/^\/+/, ""); }
function appendHashSuffix(relKey: string) {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  return lastDot === -1 ? `${relKey}_${hash}` : `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}
function publicFilePath(key: string) { return `/api/files/${key.split("/").map(encodeURIComponent).join("/")}`; }

export async function storagePut(relKey: string, data: Buffer | Uint8Array | string, contentType = "application/octet-stream") {
  const key = appendHashSuffix(normalizeKey(relKey));
  return storagePutAtKey(key, data, contentType);
}
export async function storagePutAtKey(relKey: string, data: Buffer | Uint8Array | string, contentType = "application/octet-stream") {
  const { bucket, s3 } = client();
  const key = normalizeKey(relKey);
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: data, ContentType: contentType }));
  return { key, url: publicFilePath(key) };
}
export async function storageGet(relKey: string) { const key = normalizeKey(relKey); return { key, url: publicFilePath(key) }; }
export async function storageGetObject(relKey: string, range?: string) {
  const { bucket, s3 } = client();
  return s3.send(new GetObjectCommand({ Bucket: bucket, Key: normalizeKey(relKey), ...(range ? { Range: range } : {}) }));
}
export async function storageGetSignedUrl(relKey: string, expiresIn = 300) {
  const { bucket, s3 } = client();
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: normalizeKey(relKey) }), { expiresIn });
}
export async function storageDelete(relKey: string) {
  const { bucket, s3 } = client();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: normalizeKey(relKey) }));
  return { key: normalizeKey(relKey) };
}
