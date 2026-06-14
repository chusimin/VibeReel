import crypto from "node:crypto";

export const AUTH_COOKIE = "vr_auth";

// 用 COOKIE_SECRET 对固定串做 HMAC，作为登录态 token。
export function authToken(): string {
  const secret = process.env.COOKIE_SECRET || "poc-dev-secret";
  return crypto.createHmac("sha256", secret).update("ok").digest("hex");
}
