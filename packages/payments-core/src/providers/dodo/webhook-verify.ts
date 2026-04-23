import { createHmac, timingSafeEqual } from "node:crypto";

function secureEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
}

function parseSignatureHeader(signatureHeader: string) {
  const parts = signatureHeader.split(",").map((item) => item.trim());
  const map = new Map<string, string>();

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key && value) {
      map.set(key, value);
    }
  }

  return {
    timestamp: map.get("t") ?? null,
    v1: map.get("v1") ?? null,
  };
}

export async function verifyDodoWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret?: string,
) {
  if (!signatureHeader || !secret) {
    return false;
  }

  const parsed = parseSignatureHeader(signatureHeader);

  if (parsed.v1) {
    const timestamp = parsed.timestamp ?? "";
    const signedPayload = timestamp ? `${timestamp}.${rawBody}` : rawBody;
    const expectedHex = createHmac("sha256", secret).update(signedPayload).digest("hex");
    if (secureEqual(expectedHex, parsed.v1)) {
      return true;
    }
  }

  const expectedHex = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (secureEqual(expectedHex, signatureHeader)) {
    return true;
  }

  const expectedBase64 = createHmac("sha256", secret).update(rawBody).digest("base64");
  return secureEqual(expectedBase64, signatureHeader);
}
