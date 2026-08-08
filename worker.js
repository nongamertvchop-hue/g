// worker.js — Cloudflare Worker
// เสิร์ฟไฟล์หน้าเว็บ (public/) + ทำ API ล็อกอินจริงฝั่งเซิร์ฟเวอร์
//
// ตั้งค่าแนะนำใน Cloudflare (Worker → Settings → Variables):
//   AUTH_USER    = adminth
//   AUTH_PASS    = 123456
//   AUTH_SECRET  = (พิมพ์ข้อความสุ่มยาว ๆ เก็บเป็นความลับ)
// ถ้าไม่ตั้ง จะใช้ค่า default ด้านล่างไปก่อน (ควรตั้ง AUTH_SECRET เสมอ)

const COOKIE = "session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 วัน

function b64url(buf) {
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlToBytes(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = str.length % 4 ? 4 - (str.length % 4) : 0;
  str += "=".repeat(pad);
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64url(sig);
}
async function makeToken(secret, user) {
  const payload = b64url(
    new TextEncoder().encode(
      JSON.stringify({ u: user, exp: Math.floor(Date.now() / 1000) + MAX_AGE })
    )
  );
  const sig = await hmac(secret, payload);
  return payload + "." + sig;
}
async function verifyToken(secret, token) {
  if (!token || token.indexOf(".") < 0) return null;
  const [payload, sig] = token.split(".");
  const expected = await hmac(secret, payload);
  if (sig !== expected) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload)));
    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch (e) {
    return null;
  }
}
function getCookie(request, name) {
  const c = request.headers.get("Cookie") || "";
  const m = c.match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}
function json(obj, status, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json" }, extraHeaders || {}),
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const SECRET = env.AUTH_SECRET || "please-change-this-secret";
    const USER = env.AUTH_USER || "adminth";
    const PASS = env.AUTH_PASS || "123456";

    // ── เข้าสู่ระบบ ──────────────────────────────
    if (url.pathname === "/api/login" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return json({ ok: false, error: "bad_request" }, 400);
      }
      const u = (body.username || "").trim();
      const p = body.password || "";
      if (u === USER && p === PASS) {
        const token = await makeToken(SECRET, u);
        const cookie =
          COOKIE +
          "=" +
          encodeURIComponent(token) +
          "; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=" +
          MAX_AGE;
        return json({ ok: true, user: u }, 200, { "Set-Cookie": cookie });
      }
      return json({ ok: false, error: "invalid" }, 401);
    }

    // ── ตรวจว่าล็อกอินอยู่ไหม ────────────────────
    if (url.pathname === "/api/me") {
      const data = await verifyToken(SECRET, getCookie(request, COOKIE));
      if (data) return json({ ok: true, user: data.u });
      return json({ ok: false }, 401);
    }

    // ── ออกจากระบบ ──────────────────────────────
    if (url.pathname === "/api/logout" && request.method === "POST") {
      const cookie =
        COOKIE + "=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0";
      return json({ ok: true }, 200, { "Set-Cookie": cookie });
    }

    // ── ไฟล์หน้าเว็บอื่น ๆ (public/) ─────────────
    return env.ASSETS.fetch(request);
  },
};
