import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function keyBuffer(key: string) {
  const raw = Buffer.from(key, "base64");
  return raw.length === 32 ? raw : Buffer.from(key.padEnd(32, "0")).subarray(0, 32);
}

export function encryptToken(value: string, key: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBuffer(key), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptToken(value: string, key: string) {
  const [ivBase64, tagBase64, encryptedBase64] = value.split(".");
  if (!ivBase64 || !tagBase64 || !encryptedBase64) {
    throw new Error("Invalid encrypted token format");
  }

  const decipher = createDecipheriv("aes-256-gcm", keyBuffer(key), Buffer.from(ivBase64, "base64"));
  decipher.setAuthTag(Buffer.from(tagBase64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
