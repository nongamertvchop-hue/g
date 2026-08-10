// เรือนอักษร — Worker หลังบ้าน (API + เสิร์ฟไฟล์ static)
// เส้นทาง /api/* จัดการที่นี่, ที่เหลือส่งต่อให้ไฟล์ใน public/

const ADMIN_USER = "adminth";
const ADMIN_PASS = "123456";
const COVERS = ["cover-1", "cover-2", "cover-3", "cover-4", "cover-5", "cover-6"];

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
        return env.ASSETS.fetch(request);
    },
};

async function handleApi(request, env, url) {
    const p = url.pathname;
    const m = request.method;

    // auth
    if (p === "/api/register" && m === "POST") return register(request, env);
    if (p === "/api/login" && m === "POST") return login(request, env);
    if (p === "/api/logout" && m === "POST") return logout(request, env);
    if (p === "/api/me" && m === "GET") return me(request, env, url);

    // posts
    if (p === "/api/posts" && m === "GET") return listPosts(request, env, url);
    if (p === "/api/posts" && m === "POST") return createPost(request, env);
    if (p === "/api/posts/update" && m === "POST") return updatePost(request, env);
    if (p === "/api/posts/delete" && m === "POST") return deletePost(request, env);
    if (p === "/api/posts/like" && m === "POST") return toggleLike(request, env);

    // novels
    if (p === "/api/novels" && m === "GET") return listNovels(env);
    if (p === "/api/novels/get" && m === "GET") return getNovel(env, url);
    if (p === "/api/novels/create" && m === "POST") return createNovel(request, env);
    if (p === "/api/novels/delete" && m === "POST") return deleteNovel(request, env);
    if (p === "/api/chapters/create" && m === "POST") return createChapter(request, env);

    // friends
    if (p === "/api/friends" && m === "GET") return listFriends(env, url);
    if (p === "/api/friends/add" && m === "POST") return addFriend(request, env);

    // messages
    if (p === "/api/messages" && m === "GET") return listMessages(env, url);
    if (p === "/api/messages" && m === "POST") return sendMessage(request, env);

    // realtime chat (WebSocket)
    if (p === "/api/ws") return handleWs(request, env, url);

    return json({ error: "ไม่พบเส้นทาง API" }, 404);
}

// deterministic room id for a pair of users
function roomIdFor(a, b) {
    return [encodeURIComponent(a), encodeURIComponent(b)].sort().join("|");
}

async function handleWs(request, env, url) {
    if (request.headers.get("Upgrade") !== "websocket")
        return new Response("expected websocket", { status: 426 });
    const username = await userFromToken(env, url.searchParams.get("token") || "");
    const withUser = (url.searchParams.get("with") || "").trim();
    if (!username || !withUser) return new Response("unauthorized", { status: 401 });

    const roomId = roomIdFor(username, withUser);
    const doUrl = new URL(request.url);
    doUrl.searchParams.set("user", username);
    const stub = env.CHAT.get(env.CHAT.idFromName(roomId));
    return stub.fetch(new Request(doUrl.toString(), request));
}

// ===== Auth =====
async function register(request, env) {
    const b = await readJson(request);
    const username = (b.username || "").trim();
    const password = b.password || "";
    const email = (b.email || "").trim() || null;

    if (username.length < 3) return json({ error: "ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร" }, 400);
    if (username.toLowerCase() === ADMIN_USER.toLowerCase())
        return json({ error: "ชื่อผู้ใช้นี้ถูกใช้แล้ว" }, 409);
    if (password.length < 6) return json({ error: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" }, 400);

    const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
    if (existing) return json({ error: "ชื่อผู้ใช้นี้ถูกใช้แล้ว" }, 409);

    const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await pbkdf2(password, salt);
    await env.DB.prepare(
        "INSERT INTO users (username, password_hash, salt, email) VALUES (?, ?, ?, ?)"
    ).bind(username, hash, salt, email).run();
    return json({ ok: true });
}

async function login(request, env) {
    const b = await readJson(request);
    const username = (b.username || "").trim();
    const password = b.password || "";

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
    const b = await readJson(request);
    if (b.token) await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(b.token).run();
    return json({ ok: true });
}

async function me(request, env, url) {
    const username = await userFromToken(env, url.searchParams.get("token") || "");
    if (!username) return json({ error: "unauthorized" }, 401);
    return json({ ok: true, ...(await userInfo(env, username)) });
}

async function userInfo(env, username) {
    if (username === ADMIN_USER) return { username, id: 0, role: "admin", email: null, created_at: null };
    const row = await env.DB.prepare("SELECT id, email, created_at FROM users WHERE username = ?")
        .bind(username).first();
    return {
        username,
        id: row ? row.id : null,
        email: row ? row.email : null,
        created_at: row ? row.created_at : null,
        role: "user",
    };
}

function isAdmin(username) {
    return username === ADMIN_USER;
}

async function userFromToken(env, token) {
    if (!token) return null;
    const row = await env.DB.prepare("SELECT username FROM sessions WHERE token = ?").bind(token).first();
    return row ? row.username : null;
}

// ===== Posts =====
async function listPosts(request, env, url) {
    const viewer = await userFromToken(env, url.searchParams.get("token") || "");
    const { results } = await env.DB.prepare(
        "SELECT p.id, p.author, p.type, p.title, p.content, p.created_at, " +
        "(SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count, " +
        "CASE WHEN ? IS NULL THEN 0 ELSE " +
        "  (SELECT COUNT(*) FROM likes l2 WHERE l2.post_id = p.id AND l2.username = ?) END AS liked " +
        "FROM posts p ORDER BY p.id DESC LIMIT 100"
    ).bind(viewer, viewer).all();
    return json({ ok: true, posts: results || [] });
}

async function toggleLike(request, env) {
    const b = await readJson(request);
    const username = await userFromToken(env, b.token || "");
    if (!username) return json({ error: "กรุณาเข้าสู่ระบบก่อนกดถูกใจ" }, 401);

    const postId = parseInt(b.id, 10);
    if (isNaN(postId)) return json({ error: "รหัสโพสต์ไม่ถูกต้อง" }, 400);

    const post = await env.DB.prepare("SELECT id FROM posts WHERE id = ?").bind(postId).first();
    if (!post) return json({ error: "ไม่พบโพสต์" }, 404);

    const existing = await env.DB.prepare(
        "SELECT id FROM likes WHERE post_id = ? AND username = ?"
    ).bind(postId, username).first();

    let liked;
    if (existing) {
        await env.DB.prepare("DELETE FROM likes WHERE post_id = ? AND username = ?")
            .bind(postId, username).run();
        liked = false;
    } else {
        await env.DB.prepare("INSERT INTO likes (post_id, username) VALUES (?, ?)")
            .bind(postId, username).run();
        liked = true;
    }

    const row = await env.DB.prepare("SELECT COUNT(*) AS c FROM likes WHERE post_id = ?")
        .bind(postId).first();
    return json({ ok: true, liked, like_count: row ? row.c : 0 });
}

async function createPost(request, env) {
    const b = await readJson(request);
    const username = await userFromToken(env, b.token || "");
    if (!username) return json({ error: "กรุณาเข้าสู่ระบบก่อนโพสต์" }, 401);

    const content = (b.content || "").trim();
    const title = (b.title || "").trim() || null;
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

async function updatePost(request, env) {
    const b = await readJson(request);
    const username = await userFromToken(env, b.token || "");
    if (!username) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);

    const post = await env.DB.prepare("SELECT author FROM posts WHERE id = ?").bind(b.id).first();
    if (!post) return json({ error: "ไม่พบโพสต์" }, 404);
    if (post.author !== username && !isAdmin(username))
        return json({ error: "คุณไม่มีสิทธิ์แก้ไขโพสต์นี้" }, 403);

    const content = (b.content || "").trim();
    if (!content) return json({ error: "กรุณากรอกเนื้อหา" }, 400);
    const title = (b.title || "").trim() || null;
    const type = title ? "novel" : "text";

    await env.DB.prepare("UPDATE posts SET title = ?, content = ?, type = ? WHERE id = ?")
        .bind(title, content, type, b.id).run();
    const updated = await env.DB.prepare(
        "SELECT id, author, type, title, content, created_at FROM posts WHERE id = ?"
    ).bind(b.id).first();
    return json({ ok: true, post: updated });
}

async function deletePost(request, env) {
    const b = await readJson(request);
    const username = await userFromToken(env, b.token || "");
    if (!username) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);

    const post = await env.DB.prepare("SELECT author FROM posts WHERE id = ?").bind(b.id).first();
    if (!post) return json({ error: "ไม่พบโพสต์" }, 404);
    if (post.author !== username && !isAdmin(username))
        return json({ error: "คุณไม่มีสิทธิ์ลบโพสต์นี้" }, 403);

    await env.DB.prepare("DELETE FROM likes WHERE post_id = ?").bind(b.id).run();
    await env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(b.id).run();
    return json({ ok: true });
}

// ===== Novels =====
async function listNovels(env) {
    const { results } = await env.DB.prepare(
        "SELECT n.id, n.author, n.title, n.synopsis, n.cover, n.created_at, " +
        "(SELECT COUNT(*) FROM chapters c WHERE c.novel_id = n.id) AS chapter_count " +
        "FROM novels n ORDER BY n.id DESC LIMIT 100"
    ).all();
    return json({ ok: true, novels: results || [] });
}

async function getNovel(env, url) {
    const id = url.searchParams.get("id");
    const novel = await env.DB.prepare(
        "SELECT id, author, title, synopsis, cover, created_at FROM novels WHERE id = ?"
    ).bind(id).first();
    if (!novel) return json({ error: "ไม่พบนิยาย" }, 404);
    const { results } = await env.DB.prepare(
        "SELECT id, title, content, created_at FROM chapters WHERE novel_id = ? ORDER BY id ASC"
    ).bind(id).all();
    novel.chapters = results || [];
    return json({ ok: true, novel });
}

async function createNovel(request, env) {
    const b = await readJson(request);
    const username = await userFromToken(env, b.token || "");
    if (!username) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);

    const title = (b.title || "").trim();
    const synopsis = (b.synopsis || "").trim() || null;
    let cover = (b.cover || "cover-1").trim();
    if (!COVERS.includes(cover)) cover = "cover-1";
    if (!title) return json({ error: "กรุณากรอกชื่อเรื่อง" }, 400);
    if (title.length > 200) return json({ error: "ชื่อเรื่องยาวเกินไป" }, 400);

    const res = await env.DB.prepare(
        "INSERT INTO novels (author, title, synopsis, cover) VALUES (?, ?, ?, ?)"
    ).bind(username, title, synopsis, cover).run();
    const novel = await env.DB.prepare(
        "SELECT id, author, title, synopsis, cover, created_at FROM novels WHERE id = ?"
    ).bind(res.meta.last_row_id).first();
    return json({ ok: true, novel });
}

async function deleteNovel(request, env) {
    const b = await readJson(request);
    const username = await userFromToken(env, b.token || "");
    if (!username) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);

    const novel = await env.DB.prepare("SELECT author FROM novels WHERE id = ?").bind(b.id).first();
    if (!novel) return json({ error: "ไม่พบนิยาย" }, 404);
    if (novel.author !== username && !isAdmin(username))
        return json({ error: "คุณไม่มีสิทธิ์ลบนิยายนี้" }, 403);

    await env.DB.prepare("DELETE FROM chapters WHERE novel_id = ?").bind(b.id).run();
    await env.DB.prepare("DELETE FROM novels WHERE id = ?").bind(b.id).run();
    return json({ ok: true });
}

async function createChapter(request, env) {
    const b = await readJson(request);
    const username = await userFromToken(env, b.token || "");
    if (!username) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);

    const novel = await env.DB.prepare("SELECT author FROM novels WHERE id = ?").bind(b.novel_id).first();
    if (!novel) return json({ error: "ไม่พบนิยาย" }, 404);
    if (novel.author !== username && !isAdmin(username))
        return json({ error: "คุณไม่มีสิทธิ์เพิ่มตอนในนิยายนี้" }, 403);

    const title = (b.title || "").trim();
    const content = (b.content || "").trim();
    if (!title || !content) return json({ error: "กรุณากรอกชื่อตอนและเนื้อหา" }, 400);
    if (content.length > 100000) return json({ error: "เนื้อหายาวเกินไป" }, 400);

    const res = await env.DB.prepare(
        "INSERT INTO chapters (novel_id, title, content) VALUES (?, ?, ?)"
    ).bind(b.novel_id, title, content).run();
    const chapter = await env.DB.prepare(
        "SELECT id, title, content, created_at FROM chapters WHERE id = ?"
    ).bind(res.meta.last_row_id).first();
    return json({ ok: true, chapter });
}

// ===== Friends =====
async function listFriends(env, url) {
    const username = await userFromToken(env, url.searchParams.get("token") || "");
    if (!username) return json({ error: "unauthorized" }, 401);
    const { results } = await env.DB.prepare(
        "SELECT friend_username, friend_id FROM friends WHERE owner = ? ORDER BY id DESC"
    ).bind(username).all();
    return json({ ok: true, friends: results || [] });
}

async function addFriend(request, env) {
    const b = await readJson(request);
    const username = await userFromToken(env, b.token || "");
    if (!username) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);

    const fname = (b.username || "").trim();
    const fidRaw = b.id;
    if (!fname || fidRaw === undefined || fidRaw === null || String(fidRaw).trim() === "")
        return json({ error: "กรุณากรอกชื่อผู้ใช้และไอดี" }, 400);
    const fid = parseInt(fidRaw, 10);
    if (isNaN(fid)) return json({ error: "ไอดีต้องเป็นตัวเลข" }, 400);

    const target = await env.DB.prepare("SELECT id, username FROM users WHERE id = ? AND username = ?")
        .bind(fid, fname).first();
    if (!target) return json({ error: "ไม่พบผู้ใช้ที่มีชื่อและไอดีนี้" }, 404);
    if (target.username === username) return json({ error: "ไม่สามารถเพิ่มตัวเองเป็นเพื่อนได้" }, 400);

    const exists = await env.DB.prepare("SELECT id FROM friends WHERE owner = ? AND friend_username = ?")
        .bind(username, target.username).first();
    if (exists) return json({ error: "เป็นเพื่อนกันอยู่แล้ว" }, 409);

    await env.DB.prepare("INSERT INTO friends (owner, friend_username, friend_id) VALUES (?, ?, ?)")
        .bind(username, target.username, target.id).run();
    return json({ ok: true, friend: { friend_username: target.username, friend_id: target.id } });
}

// ===== Messages =====
async function listMessages(env, url) {
    const username = await userFromToken(env, url.searchParams.get("token") || "");
    if (!username) return json({ error: "unauthorized" }, 401);
    const withUser = (url.searchParams.get("with") || "").trim();
    if (!withUser) return json({ error: "missing with" }, 400);
    const { results } = await env.DB.prepare(
        "SELECT id, sender, recipient, content, created_at FROM messages " +
        "WHERE (sender = ? AND recipient = ?) OR (sender = ? AND recipient = ?) ORDER BY id ASC LIMIT 300"
    ).bind(username, withUser, withUser, username).all();
    return json({ ok: true, messages: results || [] });
}

async function sendMessage(request, env) {
    const b = await readJson(request);
    const username = await userFromToken(env, b.token || "");
    if (!username) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    const to = (b.to || "").trim();
    const content = (b.content || "").trim();
    if (!to || !content) return json({ error: "ข้อมูลไม่ครบ" }, 400);
    if (content.length > 2000) return json({ error: "ข้อความยาวเกินไป" }, 400);

    const res = await env.DB.prepare(
        "INSERT INTO messages (sender, recipient, content) VALUES (?, ?, ?)"
    ).bind(username, to, content).run();
    const message = await env.DB.prepare(
        "SELECT id, sender, recipient, content, created_at FROM messages WHERE id = ?"
    ).bind(res.meta.last_row_id).first();

    // แจ้ง Durable Object ให้กระจายข้อความแบบเรียลไทม์ (ถ้ามีคนออนไลน์อยู่)
    try {
        const stub = env.CHAT.get(env.CHAT.idFromName(roomIdFor(username, to)));
        await stub.fetch("https://do/broadcast", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ message }),
        });
    } catch (e) { /* ignore broadcast errors */ }

    return json({ ok: true, message });
}

// ===== Helpers =====
async function pbkdf2(password, saltHex) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: hexToBytes(saltHex), iterations: 100000, hash: "SHA-256" }, key, 256
    );
    return toHex(new Uint8Array(bits));
}

function toHex(bytes) {
    return Array.from(bytes).map((x) => x.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
}

async function readJson(request) {
    try { return await request.json(); } catch (e) { return {}; }
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json; charset=utf-8" },
    });
}

// ===== Durable Object: ห้องแชทเรียลไทม์ (หนึ่งห้องต่อคู่สนทนา) =====
export class ChatRoom {
    constructor(state, env) {
        this.state = state;
        this.env = env;
    }

    async fetch(request) {
        // การเชื่อมต่อ WebSocket
        if (request.headers.get("Upgrade") === "websocket") {
            const url = new URL(request.url);
            const user = url.searchParams.get("user") || "";
            const pair = new WebSocketPair();
            const client = pair[0];
            const server = pair[1];
            this.state.acceptWebSocket(server);
            server.serializeAttachment({ user });
            return new Response(null, { status: 101, webSocket: client });
        }

        // กระจายข้อความที่ส่งผ่าน REST
        if (request.method === "POST") {
            const body = await request.json().catch(() => ({}));
            if (body && body.message) this.broadcast({ type: "message", message: body.message });
            return new Response("ok");
        }

        return new Response("not found", { status: 404 });
    }

    async webSocketMessage(ws, raw) {
        let data;
        try { data = JSON.parse(raw); } catch (e) { return; }
        const att = ws.deserializeAttachment() || {};
        const sender = att.user;
        if (!sender) return;
        const to = (data.to || "").trim();
        const content = (data.content || "").trim();
        if (!to || !content || content.length > 2000) return;

        const res = await this.env.DB.prepare(
            "INSERT INTO messages (sender, recipient, content) VALUES (?, ?, ?)"
        ).bind(sender, to, content).run();
        const saved = await this.env.DB.prepare(
            "SELECT id, sender, recipient, content, created_at FROM messages WHERE id = ?"
        ).bind(res.meta.last_row_id).first();

        this.broadcast({ type: "message", message: saved });
    }

    async webSocketClose(ws, code, reason, wasClean) {
        try { ws.close(code, reason); } catch (e) { /* ignore */ }
    }

    async webSocketError(ws) {
        try { ws.close(1011, "error"); } catch (e) { /* ignore */ }
    }

    broadcast(obj) {
        const msg = JSON.stringify(obj);
        for (const ws of this.state.getWebSockets()) {
            try { ws.send(msg); } catch (e) { /* ignore */ }
        }
    }
}
