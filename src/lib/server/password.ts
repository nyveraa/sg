import crypto from "node:crypto";

export function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString("hex") };
}

export function verifyPassword(password: string, salt: string, hash: string) {
  const a = Buffer.from(crypto.scryptSync(password, salt, 64).toString("hex"));
  const b = Buffer.from(hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
