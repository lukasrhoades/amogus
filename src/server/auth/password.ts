import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  const [scheme, salt, hash] = encoded.split("$");
  if (scheme !== "scrypt" || salt === undefined || hash === undefined) {
    return false;
  }

  const derived = scryptSync(password, salt, KEY_LENGTH);
  const stored = Buffer.from(hash, "hex");
  if (stored.length !== derived.length) {
    return false;
  }
  return timingSafeEqual(derived, stored);
}
