// เรือนอักษร — Worker หลังบ้าน (API + เสิร์ฟไฟล์ static)
// เส้นทาง /api/* จัดการที่นี่, ที่เหลือส่งต่อให้ไฟล์ใน public/

const ADMIN_USER = "adminth";
const ADMIN_PASS = "123456";

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.pathname.startsWith("/api/")) {
            try {
                return await handleApi(request, env, url);
            } catch (err) {
                return json({ error: "เกิดข้อผิดพลาดในระบบ", detail: String(err) }, 500);
            }
        }

        // ที่เหลือ: เสิร์ฟไฟล์ static จาก public/
        return env.ASSETS.fetch(request);
    },
};

async function handleApi(request, env, url) {
    const path = url.pathname;
    const method = request.method;

    if (path === "/api/register" && method === "POST") return register(request, env);
    if (path === "/api/login" && method === "POST") return login(request, env);
    if (path === "/api/logout" && method === "POST") return logout(request, env);
    if (path === "/api/posts" && method === "GET") return listPosts(env);
    if (path === "/api/posts" && method === "POST") return createPost(request, env);
    if (path === "/api/me" && method === "GET") return me(request, env, url);

    return json({ error: "ไม่พบเส้นทาง API" }, 404);
}

// ===== Auth =====
async function register(request, env) {
    const body = await readJson(request);
    const username = (body.username || "").trim();
    const password = body.password || "";
    const email = (body.email || "").trim() || null;

    if (username.length < 3) return json({ error: "ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร" }, 400);
    if (username.toLowerCase() === ADMIN_USER.toLowerCase())
        return json({ error: "ชื่อผู้ใช้นี้ถูกใช้แล้ว" }, 409);
    if (password.length < 6) return json({ error: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" }, 400);

    const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ?")
        .bind(username).first();
    if (existing) return json({ error: "ชื่อผู้ใช้นี้ถูกใช้แล้ว" }, 409);

    const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await pbkdf2(password, salt);

    await env.DB.prepare(
        "INSERT INTO users (username, password_hash, salt, email) VALUES (?, ?, ?, ?)"
    ).bind(username, hash, salt, email).run();

    return json({ ok: true });
}

async function login(request, env) {
    const body = await readJson(request);
    const username = (body.username || "").trim();
    const password = body.password || "";

    let validUser = null;

    if (username === ADMIN_USER && password === ADMIN_PASS) {
        validUser = ADMIN_USER;
    } else {
        const row = await env.DB.prepare(
            "SELECT username, password_hash, salt FROM users WHERE username = ?"
        ).bind(username).first();
        if (row) {
            const hash = await pbkdf2(password, row.salt);
            if (hash === row.password_hash) validUser = row.username;
        }
    }

    if (!validUser) return json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }, 401);

    const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    await env.DB.prepare("INSERT INTO sessions (token, username) VALUES (?, ?)")
        .bind(token, validUser).run();

    return json({ ok: true, token, username: validUser });
}

async function logout(request, env) {
    const body = await readJson(request);
    const token = body.token || "";
    if (token) {
        await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    }
    return json({ ok: true });
}

async function me(request, env, url) {
    const token = url.searchParams.get("token") || "";
    const username = await userFromToken(env, token);
    if (!username) return json({ error: "unauthorized" }, 401);
    return json({ ok: true, username });
}

async function userFromToken(env, token) {
    if (!token) return null;
    const row = await env.DB.prepare("SELECT username FROM sessions WHERE token = ?")
        .bind(token).first();
    return row ? row.username : null;
}

// ===== Posts =====
async function listPosts(env) {
    const { results } = await env.DB.prepare(
        "SELECT id, author, type, title, content, created_at FROM posts ORDER BY id DESC LIMIT 100"
    ).all();
    return json({ ok: true, posts: results || [] });
}

async function createPost(request, env) {
    const body = await readJson(request);
    const username = await userFromToken(env, body.token || "");
    if (!username) return json({ error: "กรุณาเข้าสู่ระบบก่อนโพสต์" }, 401);

    const content = (body.content || "").trim();
    const title = (body.title || "").trim() || null;
    if (!content) return json({ error: "กรุณากรอกเนื้อหา" }, 400);
    if (content.length > 20000) return json({ error: "เนื้อหายาวเกินไป" }, 400);

    const type = title ? "novel" : "text";

    const res = await env.DB.prepare(
        "INSERT INTO posts (author, type, title, content) VALUES (?, ?, ?, ?)"
    ).bind(username, type, title, content).run();

    const post = await env.DB.prepare(
        "SELECT id, author, type, title, content, created_at FROM posts WHERE id = ?"
    ).bind(res.meta.last_row_id).first();

    return json({ ok: true, post });
}

// ===== Helpers =====
async function pbkdf2(password, saltHex) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: hexToBytes(saltHex), iterations: 100000, hash: "SHA-256" },
        key, 256
    );
    return toHex(new Uint8Array(bits));
}

function toHex(bytes) {
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
}

async function readJson(request) {
    try {
        return await request.json();
    } catch (e) {
        return {};
    }
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json; charset=utf-8" },
    });
}
