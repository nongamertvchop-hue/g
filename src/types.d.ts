/**
 * เรือนอักษร — นิยามชนิดข้อมูลสำหรับ Worker
 *
 * ไฟล์นี้ไม่ถูกนำไปรัน (Cloudflare รันเฉพาะ src/index.js)
 * แต่ช่วยให้เอดิเตอร์ตรวจจับการเรียกใช้ผิดชนิดได้ก่อนขึ้นเว็บจริง
 */

/** ทรัพยากรที่ Worker ผูกไว้ใน wrangler.toml */
interface Env {
  /** ฐานข้อมูล D1 — ตารางหลักของเว็บ */
  DB: D1Database;
  /** Workers KV — เก็บรูปภาพและวิดีโอ */
  MEDIA?: KVNamespace;
  /** Workers AI — ใช้ขับเคลื่อนอาเรีย */
  AI?: { run(model: string, input: Record<string, unknown>): Promise<{ response?: string; result?: string }> };
  /** Durable Object — ห้องแชทเรียลไทม์ */
  CHAT: DurableObjectNamespace;
  /** ไฟล์ static ในโฟลเดอร์ public/ */
  ASSETS: { fetch(request: Request): Promise<Response> };
}

/** แถวในตาราง users */
interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  salt: string;
  email: string | null;
  role: "user" | "admin";
  alias: string | null;
  avatar_key: string | null;
  coins: number;
  read_seconds: number;
  site_seconds: number;
  last_seen: string | null;
  created_at: string;
}

/** แถวในตาราง posts (author จะถูกแทนที่ด้วยนามแฝงก่อนส่งออก) */
interface PostRow {
  id: number;
  author: string;
  type: "text" | "novel";
  title: string | null;
  content: string;
  media_key: string | null;
  media_type: "image" | "video" | null;
  share_count: number;
  created_at: string;
  /** เติมโดย maskAuthors() */
  is_mine?: boolean;
  author_avatar?: string | null;
  real_username?: string;
}

/** แถวในตาราง audit_log — ใคร ทำอะไร ที่ไหน อย่างไร เมื่อไหร่ */
interface AuditRow {
  id: number;
  actor: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  detail: string | null;
  ip: string | null;
  country: string | null;
  device: string | null;
  user_agent: string | null;
  ok: 0 | 1;
  created_at: string;
}

/** ตัวเลือกของ logAudit() */
interface AuditOptions {
  actor?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | number | null;
  detail?: string | null;
  ok?: boolean;
}
