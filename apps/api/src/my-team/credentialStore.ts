import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { env } from "../config/env.js";

type StoredCredentials = {
  email: string;
  accessToken: string;
  refreshToken?: string;
};

function getKey() {
  if (!env.fplAuthSecret) {
    throw new Error("FPL_AUTH_SECRET is required to store FPL account credentials.");
  }
  return scryptSync(env.fplAuthSecret, "fplytics-my-team", 32);
}

export function encryptCredentials(credentials: StoredCredentials) {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credentials), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  });
}

export function decryptCredentials(payload: string): StoredCredentials {
  const parsed = JSON.parse(payload) as {
    iv: string;
    tag: string;
    ciphertext: string;
  };
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(parsed.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(parsed.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");

  const data = JSON.parse(plaintext) as Record<string, unknown>;

  // Detect legacy password-based credentials (stored before OAuth migration)
  if ("password" in data && !("accessToken" in data)) {
    throw new Error(
      "Stored FPL credentials use a deprecated format. Re-run `sync:my-team` to re-authenticate with the new FPL login flow.",
    );
  }

  return data as StoredCredentials;
}

export type { StoredCredentials };
