// เรือนอักษร — Worker หลังบ้าน (API + เสิร์ฟไฟล์ static)
// เส้นทาง /api/* จัดการที่นี่, ที่เหลือส่งต่อให้ไฟล์ใน public/

// ไม่มีรหัสผ่านฝังในโค้ดอีกต่อไป — สิทธิ์แอดมินอ่านจากคอลัมน์ role ในฐานข้อมูล
const COVERS = ["cover-1", "cover-2", "cover-3", "cover-4", "cover-5", "cover-6"];

// ความปลอดภัย
// Cloudflare Workers รองรับสูงสุด 100,000 รอบ (ขอมากกว่านี้จะ error)
// จึงชดเชยด้วยการล็อกบัญชีเมื่อกรอกผิดซ้ำ ๆ ด้านล่าง
const PBKDF2_ITERATIONS = 100000;
const SESSION_DAYS = 30;               // เซสชันหมดอายุใน 30 วัน
const MAX_FAILS_PER_USER = 5;          // กรอกผิดเกินนี้ใน 15 นาที = ล็อกชั่วคราว
const MAX_FAILS_PER_IP = 20;
const LOCK_WINDOW_MIN = 15;

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
        // เสิร์ฟไฟล์สื่อจาก R2
        if (url.pathname.startsWith("/media/")) {
            try {
                return await serveMedia(env, url);
            } catch (err) {
                return new Response("media error", { status: 500 });
            }
        }
        // เสิร์ฟหน้าเว็บพร้อมส่วนหัวความปลอดภัย
        const res = await env.ASSETS.fetch(request);
        const headers = new Headers(res.headers);
        headers.set("X-Content-Type-Options", "nosniff");
        headers.set("X-Frame-Options", "SAMEORIGIN");
        headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
        headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
        headers.set("Content-Security-Policy",
            "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline'; " +
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
            "font-src 'self' https://fonts.gstatic.com; " +
            "img-src 'self' data: blob:; " +
            "media-src 'self' blob:; " +
            "connect-src 'self'; " +
            "frame-ancestors 'self'; " +
            "base-uri 'self'; " +
            "form-action 'self'"
        );
        return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
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
    if (p === "/api/alias" && m === "POST") return changeAlias(request, env);
    if (p === "/api/profile" && m === "GET") return publicProfile(env, url);

    // แชทโลก
    if (p === "/api/global" && m === "GET") return listGlobal(env, url);
    if (p === "/api/global" && m === "POST") return sendGlobal(request, env);

    // posts
    if (p === "/api/posts" && m === "GET") return listPosts(request, env, url);
    if (p === "/api/posts" && m === "POST") return createPost(request, env);
    if (p === "/api/posts/update" && m === "POST") return updatePost(request, env);
    if (p === "/api/posts/delete" && m === "POST") return deletePost(request, env);
    if (p === "/api/posts/like" && m === "POST") return toggleLike(request, env);
    if (p === "/api/posts/share" && m === "POST") return sharePost(request, env);

    // comments
    if (p === "/api/comments" && m === "GET") return listComments(env, url);
    if (p === "/api/comments" && m === "POST") return createComment(request, env);
    if (p === "/api/comments/delete" && m === "POST") return deleteComment(request, env);

    // novels
    if (p === "/api/novels" && m === "GET") return listNovels(env, url);
    if (p === "/api/novels/get" && m === "GET") return getNovel(env, url);
    if (p === "/api/novels/create" && m === "POST") return createNovel(request, env);
    if (p === "/api/novels/delete" && m === "POST") return deleteNovel(request, env);
    if (p === "/api/chapters/create" && m === "POST") return createChapter(request, env);

    // การแจ้งเตือน
    if (p === "/api/notifications" && m === "GET") return listNotifications(env, url);
    if (p === "/api/notifications/read" && m === "POST") return markRead(request, env);
    if (p === "/api/notifications/read-all" && m === "POST") return markAllRead(request, env);
    if (p === "/api/notifications/announce" && m === "POST") return sendAnnouncement(request, env);
    if (p === "/api/novels/follow" && m === "POST") return toggleFollow(request, env);

    // friends
    if (p === "/api/friends" && m === "GET") return listFriends(env, url);
    if (p === "/api/friends/add" && m === "POST") return addFriend(request, env);

    // messages
    if (p === "/api/messages" && m === "GET") return listMessages(env, url);
    if (p === "/api/messages" && m === "POST") return sendMessage(request, env);

    // อาเรีย (ผู้ช่วย AI)
    if (p === "/api/aria" && m === "POST") return askAria(request, env);
    if (p === "/api/aria/conversations" && m === "GET") return ariaListConversations(env, url);
    if (p === "/api/aria/conversation" && m === "GET") return ariaGetConversation(env, url);
    if (p === "/api/aria/conversations/delete" && m === "POST") return ariaDeleteConversation(request, env);
    if (p === "/api/aria/conversations/clear-all" && m === "POST") return ariaClearAll(request, env);
    if (p === "/api/aria/trash" && m === "GET") return ariaTrash(env, url);
    if (p === "/api/aria/trash/restore" && m === "POST") return ariaRestore(request, env);
    if (p === "/api/aria/trash/purge" && m === "POST") return ariaPurge(request, env);

    // media (R2)
    if (p === "/api/media/status" && m === "GET") return json({ ok: true, enabled: !!env.MEDIA });
    if (p === "/api/media/upload" && m === "POST") return uploadMedia(request, env);

    // realtime chat (WebSocket)
    if (p === "/api/ws") return handleWs(request, env, url);

    return json({ error: "ไม่พบเส้นทาง API" }, 404);
}

// ===== อาเรีย (Workers AI) =====
const ARIA_MODELS = [
    "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    "@cf/meta/llama-3.1-8b-instruct",
];

const ARIA_SYSTEM =
    "คุณคือ 'อาเรีย' ผู้ช่วยประจำเว็บไซต์ 'เรือนอักษร' ซึ่งเป็นแพลตฟอร์มลงนิยายและโพสต์ของนักเขียนไทย " +
    "คุณเป็นผู้หญิง แทนตัวเองว่า 'ฉัน' และลงท้ายประโยคด้วย 'ค่ะ/นะคะ' เสมอ " +
    "ห้ามใช้ 'ครับ' หรือเขียนแบบ 'ครับ/ค่ะ' 'ผม/ดิฉัน' เด็ดขาด ให้เลือกใช้แบบผู้หญิงอย่างเดียว " +
    "คุณมีบุคลิกอบอุ่น สุภาพ เป็นกันเอง และช่างสังเกต พูดคุยเหมือนเพื่อนที่รู้เรื่องการเขียนดี " +
    "ตอบเป็นภาษาไทยเสมอ (ยกเว้นผู้ใช้ถามเป็นภาษาอื่น) ตอบให้กระชับ อ่านง่าย ตรงประเด็น " +
    "ถ้าผู้ใช้ขอความช่วยเหลือเรื่องนิยาย ให้ช่วยคิดพล็อต ตัวละคร ชื่อเรื่อง บทสนทนา หรือช่วยตรวจสำนวน " +
    "คุณสามารถเห็นข้อมูลจริงของเว็บได้ (จำนวนนิยาย โพสต์ สมาชิก หัวใจ คอมเมนต์ แชร์ รายชื่อนักเขียนและนิยาย) " +
    "ซึ่งจะถูกส่งมาให้ในข้อความระบบถัดไป ให้ใช้ข้อมูลนั้นตอบอย่างมั่นใจเมื่อถูกถามเรื่องเว็บ " +
    "คุณจำบทสนทนาเก่ากับผู้ใช้คนนี้ได้ข้ามวัน ถ้าเขาเคยเล่าอะไรไว้ให้อ้างถึงได้อย่างเป็นธรรมชาติ " +
    "ถ้าไม่รู้คำตอบให้บอกตามตรง อย่าแต่งข้อมูลขึ้นมาเอง";

// รวบรวมข้อมูลจริงจากฐานข้อมูล ส่งให้อาเรียอ่านทุกครั้งที่ตอบ
async function buildSiteContext(env, username) {
    const q = (sql, ...binds) => env.DB.prepare(sql).bind(...binds).all();
    const one = (sql, ...binds) => env.DB.prepare(sql).bind(...binds).first();

    const [stats, novels, topPosts, authors, mine] = await Promise.all([
        one(
            "SELECT (SELECT COUNT(*) FROM novels) AS novels, (SELECT COUNT(*) FROM chapters) AS chapters, " +
            "(SELECT COUNT(*) FROM posts) AS posts, (SELECT COUNT(*) FROM users) AS users, " +
            "(SELECT COUNT(*) FROM likes) AS likes, (SELECT COUNT(*) FROM comments) AS comments, " +
            "(SELECT COALESCE(SUM(share_count),0) FROM posts) AS shares"
        ),
        q(
            "SELECT n.title, n.author, n.synopsis, " +
            "(SELECT COUNT(*) FROM chapters c WHERE c.novel_id = n.id) AS chapters " +
            "FROM novels n ORDER BY n.id DESC LIMIT 12"
        ),
        q(
            "SELECT p.author, p.title, substr(p.content,1,90) AS snippet, p.share_count, " +
            "(SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS likes, " +
            "(SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id) AS comments " +
            "FROM posts p ORDER BY likes DESC, p.id DESC LIMIT 8"
        ),
        q(
            "SELECT author, COUNT(*) AS works FROM (" +
            "  SELECT author FROM novels UNION ALL SELECT author FROM posts" +
            ") GROUP BY author ORDER BY works DESC LIMIT 12"
        ),
        one(
            "SELECT (SELECT COUNT(*) FROM posts WHERE author = ?) AS my_posts, " +
            "(SELECT COUNT(*) FROM novels WHERE author = ?) AS my_novels, " +
            "(SELECT COUNT(*) FROM likes l JOIN posts p ON p.id = l.post_id WHERE p.author = ?) AS likes_received",
            username, username, username
        ),
    ]);

    // แปลงชื่อผู้ใช้จริงเป็นนามแฝงก่อนส่งให้ AI อ่าน
    const nameList = []
        .concat(((novels && novels.results) || []).map((n) => n.author))
        .concat(((topPosts && topPosts.results) || []).map((p) => p.author))
        .concat(((authors && authors.results) || []).map((a) => a.author))
        .concat([username]);
    const aMap = await aliasMap(env, nameList);
    const show = (n) => aMap[n] || n;

    const lines = [];
    lines.push("=== ข้อมูลจริงของเว็บไซต์ ณ ตอนนี้ (ใช้ตอบคำถามเกี่ยวกับเว็บ) ===");
    lines.push("หมายเหตุ: ผู้ใช้ทุกคนถูกเรียกด้วย 'นามแฝง' เท่านั้น ห้ามเปิดเผยหรือคาดเดาชื่อผู้ใช้จริง");
    if (stats) {
        lines.push(
            "ภาพรวม: นิยาย " + stats.novels + " เรื่อง, ตอนทั้งหมด " + stats.chapters + " ตอน, " +
            "โพสต์ " + stats.posts + " โพสต์, สมาชิกทั้งหมด " + stats.users + " คน, " +
            "หัวใจรวม " + stats.likes + ", คอมเมนต์รวม " + stats.comments + ", แชร์รวม " + stats.shares
        );
    }

    const nv = (novels && novels.results) || [];
    if (nv.length) {
        lines.push("รายชื่อนิยาย:");
        nv.forEach((n) => {
            lines.push("- \"" + n.title + "\" โดย " + show(n.author) + " (" + n.chapters + " ตอน)" +
                (n.synopsis ? " เรื่องย่อ: " + String(n.synopsis).slice(0, 140) : ""));
        });
    } else {
        lines.push("ยังไม่มีนิยายในเว็บ");
    }

    const au = (authors && authors.results) || [];
    if (au.length) {
        lines.push("นักเขียน/ผู้ใช้ที่มีผลงาน: " +
            au.map((a) => show(a.author) + " (" + a.works + " ชิ้น)").join(", "));
    }

    const tp = (topPosts && topPosts.results) || [];
    if (tp.length) {
        lines.push("โพสต์ที่ได้รับความนิยม:");
        tp.forEach((p) => {
            lines.push("- " + (p.title ? "\"" + p.title + "\" " : "") + "โดย " + show(p.author) +
                " | ❤️ " + p.likes + " | 💬 " + p.comments + " | ↗️ " + p.share_count +
                (p.snippet ? " | เนื้อหา: " + p.snippet : ""));
        });
    }

    if (mine) {
        lines.push("ข้อมูลของผู้ใช้ที่กำลังคุยกับคุณ (นามแฝง " + show(username) + "): " +
            "โพสต์ " + mine.my_posts + ", นิยาย " + mine.my_novels + ", ได้รับหัวใจรวม " + mine.likes_received);
    }
    lines.push("=== จบข้อมูล ===");
    lines.push("ถ้าผู้ใช้ถามเรื่องตัวเลขหรือรายชื่อในเว็บ ให้ตอบจากข้อมูลด้านบนเท่านั้น ห้ามเดาเอง " +
        "ถ้าข้อมูลไม่มีอยู่ด้านบน ให้บอกว่ายังไม่มีข้อมูลส่วนนั้น");

    return lines.join("\n");
}

// ลบบทสนทนาในถังขยะที่เกิน 7 วันทิ้งอัตโนมัติ
async function purgeExpiredTrash(env, username) {
    try {
        const { results } = await env.DB.prepare(
            "SELECT id FROM aria_conversations WHERE username = ? AND deleted_at IS NOT NULL " +
            "AND deleted_at < datetime('now', '-7 days')"
        ).bind(username).all();
        const ids = (results || []).map((r) => r.id);
        if (!ids.length) return;
        const marks = ids.map(() => "?").join(",");
        await env.DB.batch([
            env.DB.prepare("DELETE FROM aria_messages WHERE conversation_id IN (" + marks + ")").bind(...ids),
            env.DB.prepare("DELETE FROM aria_conversations WHERE id IN (" + marks + ")").bind(...ids),
        ]);
    } catch (e) { /* ไม่ให้กระทบการใช้งานหลัก */ }
}

async function ownedConversation(env, username, id, wantDeleted) {
    const cid = parseInt(id, 10);
    if (isNaN(cid)) return null;
    const row = await env.DB.prepare(
        "SELECT id, title, created_at, updated_at, deleted_at FROM aria_conversations WHERE id = ? AND username = ?"
    ).bind(cid, username).first();
    if (!row) return null;
    if (wantDeleted === true && !row.deleted_at) return null;
    if (wantDeleted === false && row.deleted_at) return null;
    return row;
}

function makeTitle(text) {
    const t = String(text).replace(/\s+/g, " ").trim();
    if (!t) return "บทสนทนาใหม่";
    return t.length > 42 ? t.slice(0, 42) + "…" : t;
}

async function loadConversationMessages(env, conversationId, limit) {
    const { results } = await env.DB.prepare(
        "SELECT role, content FROM aria_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?"
    ).bind(conversationId, limit).all();
    return (results || []).reverse();
}

async function askAria(request, env) {
    if (!env.AI) return json({ error: "ระบบ AI ยังไม่พร้อมใช้งาน" }, 503);

    const b = await readJson(request);
    const username = await userFromToken(env, b.token || "");
    if (!username) return json({ error: "กรุณาเข้าสู่ระบบก่อนคุยกับอาเรีย" }, 401);

    const message = (b.message || "").trim();
    if (!message) return json({ error: "กรุณาพิมพ์ข้อความ" }, 400);
    if (message.length > 4000) return json({ error: "ข้อความยาวเกินไป" }, 400);

    await purgeExpiredTrash(env, username);

    // หาบทสนทนาปัจจุบัน ถ้าไม่มีให้สร้างใหม่
    let conv = await ownedConversation(env, username, b.conversation_id, false);
    let isNew = false;
    if (!conv) {
        const res = await env.DB.prepare(
            "INSERT INTO aria_conversations (username, title) VALUES (?, ?)"
        ).bind(username, makeTitle(message)).run();
        conv = { id: res.meta.last_row_id };
        isNew = true;
    }

    // ความจำถาวร: อ่านบทสนทนาเก่าจากฐานข้อมูล
    const past = await loadConversationMessages(env, conv.id, 12);
    const siteContext = await buildSiteContext(env, username);

    const messages = [
        { role: "system", content: ARIA_SYSTEM },
        { role: "system", content: siteContext },
    ]
        .concat(past.map((x) => ({ role: x.role, content: String(x.content).slice(0, 2000) })))
        .concat([{ role: "user", content: message }]);

    let reply = null, usedModel = null, lastErr = null;
    for (const model of ARIA_MODELS) {
        try {
            const out = await env.AI.run(model, { messages, max_tokens: 700, temperature: 0.7 });
            const text = (out && (out.response || out.result)) || "";
            if (text && String(text).trim()) {
                reply = String(text).trim();
                usedModel = model;
                break;
            }
            lastErr = "empty response";
        } catch (e) {
            lastErr = String(e);
        }
    }

    if (!reply) return json({ error: "อาเรียตอบไม่ได้ในตอนนี้ ลองใหม่อีกครั้งนะ", detail: lastErr }, 502);

    // บันทึกบทสนทนาไว้ถาวร
    try {
        await env.DB.batch([
            env.DB.prepare("INSERT INTO aria_messages (username, conversation_id, role, content) VALUES (?, ?, 'user', ?)")
                .bind(username, conv.id, message),
            env.DB.prepare("INSERT INTO aria_messages (username, conversation_id, role, content) VALUES (?, ?, 'assistant', ?)")
                .bind(username, conv.id, reply),
            env.DB.prepare("UPDATE aria_conversations SET updated_at = datetime('now') WHERE id = ?")
                .bind(conv.id),
        ]);
    } catch (e) { /* ถ้าบันทึกพลาด ก็ยังตอบผู้ใช้ได้ */ }

    return json({ ok: true, reply, model: usedModel, conversation_id: conv.id, new_conversation: isNew });
}

// ===== ประวัติแชท =====
async function ariaListConversations(env, url) {
    const username = await userFromToken(env, url.searchParams.get("token") || "");
    if (!username) return json({ error: "unauthorized" }, 401);
    await purgeExpiredTrash(env, username);
    const { results } = await env.DB.prepare(
        "SELECT c.id, c.title, c.created_at, c.updated_at, " +
        "(SELECT COUNT(*) FROM aria_messages m WHERE m.conversation_id = c.id) AS message_count " +
        "FROM aria_conversations c WHERE c.username = ? AND c.deleted_at IS NULL " +
        "ORDER BY c.updated_at DESC, c.id DESC LIMIT 100"
    ).bind(username).all();
    return json({ ok: true, conversations: results || [] });
}

async function ariaGetConversation(env, url) {
    const username = await userFromToken(env, url.searchParams.get("token") || "");
    if (!username) return json({ error: "unauthorized" }, 401);
    const conv = await ownedConversation(env, username, url.searchParams.get("id"), false);
    if (!conv) return json({ error: "ไม่พบบทสนทนา" }, 404);
    const { results } = await env.DB.prepare(
        "SELECT role, content, created_at FROM aria_messages WHERE conversation_id = ? ORDER BY id ASC LIMIT 200"
    ).bind(conv.id).all();
    return json({ ok: true, conversation: conv, messages: results || [] });
}

async function ariaDeleteConversation(request, env) {
    const b = await readJson(request);
    const username = await userFromToken(env, b.token || "");
    if (!username) return json({ error: "unauthorized" }, 401);
    const conv = await ownedConversation(env, username, b.id, false);
    if (!conv) return json({ error: "ไม่พบบทสนทนา" }, 404);
    await env.DB.prepare("UPDATE aria_conversations SET deleted_at = datetime('now') WHERE id = ?")
        .bind(conv.id).run();
    return json({ ok: true });
}

async function ariaClearAll(request, env) {
    const b = await readJson(request);
    const username = await userFromToken(env, b.token || "");
    if (!username) return json({ error: "unauthorized" }, 401);
    const res = await env.DB.prepare(
        "UPDATE aria_conversations SET deleted_at = datetime('now') WHERE username = ? AND deleted_at IS NULL"
    ).bind(username).run();
    return json({ ok: true, moved: res.meta ? res.meta.changes : 0 });
}

// ===== ถังขยะ (เฉพาะแชท AI) =====
async function ariaTrash(env, url) {
    const username = await userFromToken(env, url.searchParams.get("token") || "");
    if (!username) return json({ error: "unauthorized" }, 401);
    await purgeExpiredTrash(env, username);
    const { results } = await env.DB.prepare(
        "SELECT c.id, c.title, c.created_at, c.updated_at, c.deleted_at, " +
        "(SELECT COUNT(*) FROM aria_messages m WHERE m.conversation_id = c.id) AS message_count, " +
        "CAST(julianday(c.deleted_at, '+7 days') - julianday('now') AS REAL) AS days_left " +
        "FROM aria_conversations c WHERE c.username = ? AND c.deleted_at IS NOT NULL " +
        "ORDER BY c.deleted_at DESC LIMIT 100"
    ).bind(username).all();
    return json({ ok: true, trash: results || [] });
}

async function ariaRestore(request, env) {
    const b = await readJson(request);
    const username = await userFromToken(env, b.token || "");
    if (!username) return json({ error: "unauthorized" }, 401);
    const conv = await ownedConversation(env, username, b.id, true);
    if (!conv) return json({ error: "ไม่พบบทสนทนาในถังขยะ" }, 404);
    await env.DB.prepare("UPDATE aria_conversations SET deleted_at = NULL WHERE id = ?")
        .bind(conv.id).run();
    return json({ ok: true });
}

async function ariaPurge(request, env) {
    const b = await readJson(request);
    const username = await userFromToken(env, b.token || "");
    if (!username) return json({ error: "unauthorized" }, 401);
    const conv = await ownedConversation(env, username, b.id, true);
    if (!conv) return json({ error: "ไม่พบบทสนทนาในถังขยะ" }, 404);
    await env.DB.batch([
        env.DB.prepare("DELETE FROM aria_messages WHERE conversation_id = ?").bind(conv.id),
        env.DB.prepare("DELETE FROM aria_conversations WHERE id = ?").bind(conv.id),
    ]);
    return json({ ok: true });
}

// ===== Media (R2) =====
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
// Workers KV จำกัดค่าละ 25 MB — เผื่อไว้ให้ปลอดภัย
const MAX_IMAGE = 5 * 1024 * 1024;    // 5 MB (หน้าเว็บย่อรูปให้อัตโนมัติก่อนส่ง)
const MAX_VIDEO = 20 * 1024 * 1024;   // 20 MB

function extFor(type) {
    const map = {
        "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
        "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
    };
    return map[type] || "bin";
}

async function uploadMedia(request, env) {
    if (!env.MEDIA) return json({ error: "ระบบอัปโหลดยังไม่พร้อมใช้งาน" }, 503);

    let form;
    try { form = await request.formData(); } catch (e) { return json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, 400); }

    const token = form.get("token") || "";
    const username = await userFromToken(env, String(token));
    if (!username) return json({ error: "กรุณาเข้าสู่ระบบก่อนอัปโหลด" }, 401);

    const file = form.get("file");
    if (!file || typeof file === "string") return json({ error: "ไม่พบไฟล์" }, 400);

    const type = file.type || "";
    const isImage = IMAGE_TYPES.includes(type);
    const isVideo = VIDEO_TYPES.includes(type);
    if (!isImage && !isVideo)
        return json({ error: "รองรับเฉพาะรูปภาพ (JPG PNG GIF WEBP) และวิดีโอ (MP4 WEBM MOV)" }, 415);

    const limit = isImage ? MAX_IMAGE : MAX_VIDEO;
    if (file.size > limit)
        return json({ error: "ไฟล์ใหญ่เกินไป (จำกัด " + (isImage ? "5 MB" : "20 MB") + ")" }, 413);

    const key = (isVideo ? "video/" : "image/") + crypto.randomUUID() + "." + extFor(type);
    const bytes = await file.arrayBuffer();
    await env.MEDIA.put(key, bytes, {
        metadata: { contentType: type, uploader: username },
    });

    return json({ ok: true, key, url: "/media/" + key, media_type: isVideo ? "video" : "image" });
}

async function serveMedia(env, url) {
    if (!env.MEDIA) return new Response("media not enabled", { status: 503 });
    const key = decodeURIComponent(url.pathname.replace("/media/", ""));
    if (!key) return new Response("not found", { status: 404 });

    const res = await env.MEDIA.getWithMetadata(key, { type: "arrayBuffer" });
    if (!res || !res.value) return new Response("not found", { status: 404 });

    const meta = res.metadata || {};
    return new Response(res.value, {
        headers: {
            "content-type": meta.contentType || "application/octet-stream",
            "cache-control": "public, max-age=31536000, immutable",
        },
    });
}

// deterministic room id for a pair of users
function roomIdFor(a, b) {
    return [encodeURIComponent(a), encodeURIComponent(b)].sort().join("|");
}

async function handleWs(request, env, url) {
    if (request.headers.get("Upgrade") !== "websocket")
        return new Response("expected websocket", { status: 426 });
    const username = await userFromToken(env, url.searchParams.get("token") || "");
    const withAlias = (url.searchParams.get("with") || "").trim();
    if (!username || !withAlias) return new Response("unauthorized", { status: 401 });
    const withUser = await usernameFromAlias(env, withAlias);
    if (!withUser) return new Response("not found", { status: 404 });

    const roomId = roomIdFor(username, withUser);
    const doUrl = new URL(request.url);
    doUrl.searchParams.set("user", username);
    const stub = env.CHAT.get(env.CHAT.idFromName(roomId));
    return stub.fetch(new Request(doUrl.toString(), request));
}

// ===== นามแฝง (ซ่อนชื่อผู้ใช้จริงจากทุกคน ยกเว้นแอดมิน) =====
function randomAlias() {
    let d = "";
    const buf = crypto.getRandomValues(new Uint8Array(9));
    for (let i = 0; i < 9; i++) d += (buf[i] % 10).toString();
    return "#" + d;
}

async function ensureAlias(env, username) {
    const row = await env.DB.prepare("SELECT alias FROM users WHERE username = ?").bind(username).first();
    if (row && row.alias) return row.alias;
    for (let i = 0; i < 6; i++) {
        const a = randomAlias();
        try {
            await env.DB.prepare("UPDATE users SET alias = ? WHERE username = ?").bind(a, username).run();
            return a;
        } catch (e) { /* ชนกัน สุ่มใหม่ */ }
    }
    return null;
}

// แปลงชื่อผู้ใช้จริง -> นามแฝง สำหรับส่งออกทาง API
async function aliasMap(env, names) {
    const uniq = [...new Set((names || []).filter(Boolean))];
    const map = {};
    if (!uniq.length) return map;
    const marks = uniq.map(() => "?").join(",");
    const { results } = await env.DB.prepare(
        "SELECT username, alias FROM users WHERE username IN (" + marks + ")"
    ).bind(...uniq).all();
    (results || []).forEach((r) => { if (r.alias) map[r.username] = r.alias; });
    // ชื่อที่ไม่ใช่สมาชิกจริง (เนื้อหาตัวอย่าง) ให้แสดงตามเดิม
    uniq.forEach((u) => { if (!map[u]) map[u] = u; });
    return map;
}

async function usernameFromAlias(env, alias) {
    const row = await env.DB.prepare("SELECT username FROM users WHERE alias = ?").bind(alias).first();
    return row ? row.username : null;
}

// ===== ตัวกรองคำหยาบ =====
const BAD_WORDS = [
    // ไทย
    "เหี้ย", "สัส", "สาด", "ควย", "หี", "เย็ด", "แตด", "ระยำ", "ชิบหาย", "ฉิบหาย",
    "อีดอก", "กะหรี่", "แม่ง", "มึง", "กู", "ไอ้เวร", "อีเวร", "สันดาน", "ไอ้สัตว์",
    "หน้าหี", "จัญไร", "ตอแหล", "ดอกทอง", "เงี่ยน", "ล่อกัน", "ขายตัว",
    // อังกฤษ
    "fuck", "shit", "bitch", "asshole", "cunt", "dick", "pussy", "whore", "slut",
    "bastard", "motherfucker", "nigger", "faggot", "retard",
];

function censor(text) {
    let out = String(text);
    let hits = 0;
    for (const w of BAD_WORDS) {
        // ไทยไม่มีขอบเขตคำ จึงแทนที่ตรง ๆ แบบไม่สนตัวพิมพ์
        const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
        out = out.replace(re, (m) => { hits++; return "*".repeat(m.length); });
    }
    return { text: out, censored: hits > 0 };
}

// ===== แชทโลก =====
const GLOBAL_KEEP = 200;   // เก็บข้อความล่าสุดเท่านี้ กันเว็บช้า

async function listGlobal(env, url) {
    const viewer = await userFromToken(env, url.searchParams.get("token") || "");
    if (!viewer) return json({ error: "unauthorized" }, 401);

    const since = parseInt(url.searchParams.get("since") || "0", 10) || 0;
    let rows;
    if (since > 0) {
        const r = await env.DB.prepare(
            "SELECT id, username, content, created_at FROM global_messages WHERE id > ? ORDER BY id ASC LIMIT 100"
        ).bind(since).all();
        rows = r.results || [];
    } else {
        const r = await env.DB.prepare(
            "SELECT id, username, content, created_at FROM global_messages ORDER BY id DESC LIMIT 50"
        ).all();
        rows = (r.results || []).reverse();
    }

    const map = await aliasMap(env, rows.map((m) => m.username));
    const isAdminViewer = await isAdmin(env, viewer);
    const messages = rows.map((m) => ({
        id: m.id,
        alias: map[m.username] || m.username,
        mine: m.username === viewer,
        content: m.content,
        created_at: m.created_at,
        username: isAdminViewer ? m.username : undefined,
    }));
    return json({ ok: true, messages });
}

async function sendGlobal(request, env) {
    const b = await readJson(request);
    const username = await userFromToken(env, b.token || "");
    if (!username) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);

    const raw = (b.content || "").trim();
    if (!raw) return json({ error: "กรุณาพิมพ์ข้อความ" }, 400);
    if (raw.length > 500) return json({ error: "ข้อความยาวเกินไป (ไม่เกิน 500 ตัวอักษร)" }, 400);

    // กันสแปม: ส่งได้ไม่เกิน 5 ข้อความใน 10 วินาที
    const recent = await env.DB.prepare(
        "SELECT COUNT(*) AS c FROM global_messages WHERE username = ? AND created_at > datetime('now','-10 seconds')"
    ).bind(username).first();
    if (recent && recent.c >= 5) return json({ error: "ส่งข้อความถี่เกินไป พักสักครู่นะ" }, 429);

    const { text, censored } = censor(raw);

    const res = await env.DB.prepare(
        "INSERT INTO global_messages (username, content) VALUES (?, ?)"
    ).bind(username, text).run();

    // ลบข้อความเก่าทิ้ง เก็บแค่ล่าสุด
    try {
        await env.DB.prepare(
            "DELETE FROM global_messages WHERE id NOT IN (SELECT id FROM global_messages ORDER BY id DESC LIMIT ?)"
        ).bind(GLOBAL_KEEP).run();
    } catch (e) { /* ignore */ }

    const alias = await ensureAlias(env, username);
    return json({
        ok: true,
        censored,
        message: {
            id: res.meta.last_row_id,
            alias: alias || username,
            mine: true,
            content: text,
            created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
        },
    });
}

// ===== โปรไฟล์สาธารณะ (ดูด้วยนามแฝง) =====
async function publicProfile(env, url) {
    const viewer = await userFromToken(env, url.searchParams.get("token") || "");
    if (!viewer) return json({ error: "unauthorized" }, 401);

    const alias = (url.searchParams.get("alias") || "").trim();
    if (!alias) return json({ error: "ไม่พบนามแฝง" }, 400);

    const row = await env.DB.prepare(
        "SELECT id, username, alias, role, created_at FROM users WHERE alias = ?"
    ).bind(alias).first();
    if (!row) return json({ error: "ไม่พบผู้ใช้นี้" }, 404);

    const stats = await env.DB.prepare(
        "SELECT (SELECT COUNT(*) FROM posts WHERE author = ?) AS posts, " +
        "(SELECT COUNT(*) FROM novels WHERE author = ?) AS novels, " +
        "(SELECT COUNT(*) FROM likes l JOIN posts p ON p.id = l.post_id WHERE p.author = ?) AS likes_received"
    ).bind(row.username, row.username, row.username).first();

    const viewerIsAdmin = await isAdmin(env, viewer);
    return json({
        ok: true,
        profile: {
            alias: row.alias,
            role: row.role,
            joined: row.created_at,
            posts: stats ? stats.posts : 0,
            novels: stats ? stats.novels : 0,
            likes_received: stats ? stats.likes_received : 0,
            // ชื่อผู้ใช้จริงเปิดให้เห็นเฉพาะแอดมินเท่านั้น
            username: viewerIsAdmin ? row.username : undefined,
        },
    });
}

async function changeAlias(request, env) {
    const b = await readJson(request);
    const username = await userFromToken(env, b.token || "");
    if (!username) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);

    const alias = (b.alias || "").trim();
    if (alias.length < 2 || alias.length > 24)
        return json({ error: "นามแฝงต้องยาว 2-24 ตัวอักษร" }, 400);
    if (!/^[\p{L}\p{N}#_.\- ]+$/u.test(alias))
        return json({ error: "นามแฝงใช้ได้เฉพาะตัวอักษร ตัวเลข # _ . - และเว้นวรรค" }, 400);

    const { censored } = censor(alias);
    if (censored) return json({ error: "นามแฝงมีคำไม่เหมาะสม" }, 400);

    const taken = await env.DB.prepare(
        "SELECT username FROM users WHERE lower(alias) = lower(?) AND username != ?"
    ).bind(alias, username).first();
    if (taken) return json({ error: "นามแฝงนี้ถูกใช้แล้ว" }, 409);

    // กันตั้งนามแฝงให้ตรงกับชื่อผู้ใช้จริงของคนอื่น (จะทำให้เดาตัวตนได้)
    const clash = await env.DB.prepare(
        "SELECT username FROM users WHERE lower(username) = lower(?) AND username != ?"
    ).bind(alias, username).first();
    if (clash) return json({ error: "นามแฝงนี้ใช้ไม่ได้" }, 409);

    await env.DB.prepare("UPDATE users SET alias = ? WHERE username = ?").bind(alias, username).run();
    return json({ ok: true, alias });
}

// ===== Auth =====
async function register(request, env) {
    const b = await readJson(request);
    const username = (b.username || "").trim();
    const password = b.password || "";
    const email = (b.email || "").trim() || null;

    if (username.length < 3) return json({ error: "ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร" }, 400);
    if (username.length > 24) return json({ error: "ชื่อผู้ใช้ยาวเกินไป (ไม่เกิน 24 ตัวอักษร)" }, 400);
    if (!/^[\p{L}\p{N}_.-]+$/u.test(username))
        return json({ error: "ชื่อผู้ใช้ใช้ได้เฉพาะตัวอักษร ตัวเลข จุด ขีดกลาง และขีดล่าง" }, 400);
    if (password.length < 6) return json({ error: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" }, 400);
    if (password.length > 200) return json({ error: "รหัสผ่านยาวเกินไป" }, 400);

    // เทียบแบบไม่สนตัวพิมพ์ กันการสมัครชื่อคล้ายกันเพื่อสวมรอย
    const existing = await env.DB.prepare(
        "SELECT id FROM users WHERE lower(username) = lower(?)"
    ).bind(username).first();
    if (existing) return json({ error: "ชื่อผู้ใช้นี้ถูกใช้แล้ว" }, 409);

    const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await pbkdf2(password, salt);
    const alias = randomAlias();
    await env.DB.prepare(
        "INSERT INTO users (username, password_hash, salt, email, alias) VALUES (?, ?, ?, ?, ?)"
    ).bind(username, hash, salt, email, alias).run();
    return json({ ok: true, alias });
}

async function login(request, env) {
    const b = await readJson(request);
    const username = (b.username || "").trim();
    const password = b.password || "";
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";

    // กันการเดารหัสผ่านซ้ำ ๆ (brute force)
    const locked = await isLockedOut(env, username, ip);
    if (locked) {
        return json({
            error: "กรอกรหัสผ่านผิดหลายครั้งเกินไป กรุณารออีก " + LOCK_WINDOW_MIN + " นาทีแล้วลองใหม่",
        }, 429);
    }

    let validUser = null;
    const row = await env.DB.prepare(
        "SELECT username, password_hash, salt FROM users WHERE username = ?"
    ).bind(username).first();
    if (row) {
        const hash = await pbkdf2(password, row.salt);
        if (timingSafeEqual(hash, row.password_hash)) validUser = row.username;
    }

    await recordAttempt(env, username, ip, !!validUser);

    if (!validUser) return json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }, 401);

    const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    await env.DB.prepare(
        "INSERT INTO sessions (token, username, expires_at) VALUES (?, ?, datetime('now', '+" + SESSION_DAYS + " days'))"
    ).bind(token, validUser).run();

    // ล้างเซสชันที่หมดอายุทิ้ง ไม่ให้ตารางโตไม่หยุด
    try {
        await env.DB.prepare("DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at < datetime('now')").run();
    } catch (e) { /* ไม่กระทบการล็อกอิน */ }

    // ผู้ใช้เก่าที่ยังไม่มีนามแฝง จะได้รับตอนล็อกอิน
    const alias = await ensureAlias(env, validUser);
    return json({ ok: true, token, username: validUser, alias });
}

// ===== ป้องกันการเดารหัสผ่าน =====
async function isLockedOut(env, username, ip) {
    try {
        const since = "datetime('now', '-" + LOCK_WINDOW_MIN + " minutes')";
        const row = await env.DB.prepare(
            "SELECT " +
            "(SELECT COUNT(*) FROM login_attempts WHERE username = ? AND success = 0 AND created_at > " + since + ") AS by_user, " +
            "(SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND success = 0 AND created_at > " + since + ") AS by_ip"
        ).bind(username, ip).first();
        if (!row) return false;
        return row.by_user >= MAX_FAILS_PER_USER || row.by_ip >= MAX_FAILS_PER_IP;
    } catch (e) {
        return false;   // ถ้าตรวจไม่ได้ อย่าล็อกผู้ใช้ออกจากระบบ
    }
}

async function recordAttempt(env, username, ip, success) {
    try {
        await env.DB.batch([
            env.DB.prepare("INSERT INTO login_attempts (username, ip, success) VALUES (?, ?, ?)")
                .bind(username, ip, success ? 1 : 0),
            // ล็อกอินสำเร็จ = ล้างประวัติผิดพลาดของชื่อนี้
            success
                ? env.DB.prepare("DELETE FROM login_attempts WHERE username = ? AND success = 0").bind(username)
                : env.DB.prepare("DELETE FROM login_attempts WHERE created_at < datetime('now', '-1 day')"),
        ]);
    } catch (e) { /* ไม่กระทบการล็อกอิน */ }
}

// เปรียบเทียบแบบใช้เวลาคงที่ กันการวัดเวลาเพื่อเดาแฮช
function timingSafeEqual(a, b) {
    if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
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
    const row = await env.DB.prepare("SELECT id, email, created_at, role, alias FROM users WHERE username = ?")
        .bind(username).first();
    return {
        username,                       // เห็นได้เฉพาะเจ้าของบัญชีเอง
        alias: row ? row.alias : null,  // ชื่อที่คนอื่นเห็น
        id: row ? row.id : null,
        email: row ? row.email : null,
        created_at: row ? row.created_at : null,
        role: row ? row.role : "user",
    };
}

// สิทธิ์แอดมินอ่านจากฐานข้อมูล ไม่ใช่ชื่อที่ฝังในโค้ด
async function isAdmin(env, username) {
    const row = await env.DB.prepare("SELECT role FROM users WHERE username = ?").bind(username).first();
    return !!row && row.role === "admin";
}

async function userFromToken(env, token) {
    if (!token) return null;
    const row = await env.DB.prepare(
        "SELECT username, expires_at FROM sessions WHERE token = ?"
    ).bind(token).first();
    if (!row) return null;
    // เซสชันหมดอายุ = ใช้ไม่ได้ และลบทิ้ง
    if (row.expires_at && Date.parse(row.expires_at.replace(" ", "T") + "Z") < Date.now()) {
        try { await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run(); } catch (e) { /* ignore */ }
        return null;
    }
    return row.username;
}

// แทนที่ชื่อผู้ใช้จริงด้วยนามแฝงในรายการที่ส่งออก
// เก็บ author_key ไว้ให้หน้าเว็บใช้ตรวจสิทธิ์ (เทียบกับตัวเอง) โดยไม่เปิดเผยชื่อคนอื่น
async function maskAuthors(env, rows, field, viewer) {
    const list = rows || [];
    const map = await aliasMap(env, list.map((r) => r[field]));
    const viewerIsAdmin = viewer ? await isAdmin(env, viewer) : false;
    list.forEach((r) => {
        const real = r[field];
        r.is_mine = real === viewer;
        if (viewerIsAdmin) r.real_username = real;
        r[field] = map[real] || real;
    });
    return list;
}

// ===== Posts =====
async function listPosts(request, env, url) {
    const viewer = await userFromToken(env, url.searchParams.get("token") || "");
    const { results } = await env.DB.prepare(
        "SELECT p.id, p.author, p.type, p.title, p.content, p.media_key, p.media_type, p.created_at, " +
        "p.share_count, " +
        "(SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id) AS comment_count, " +
        "(SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count, " +
        "CASE WHEN ? IS NULL THEN 0 ELSE " +
        "  (SELECT COUNT(*) FROM likes l2 WHERE l2.post_id = p.id AND l2.username = ?) END AS liked " +
        "FROM posts p ORDER BY p.id DESC LIMIT 100"
    ).bind(viewer, viewer).all();
    return json({ ok: true, posts: await maskAuthors(env, results, "author", viewer) });
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
    const mediaKey = (b.media_key || "").trim() || null;
    const mediaType = (b.media_type || "").trim() || null;
    if (!content && !mediaKey) return json({ error: "กรุณากรอกเนื้อหา หรือแนบไฟล์" }, 400);
    if (content.length > 20000) return json({ error: "เนื้อหายาวเกินไป" }, 400);
    const type = title ? "novel" : "text";

    const res = await env.DB.prepare(
        "INSERT INTO posts (author, type, title, content, media_key, media_type) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(username, type, title, content, mediaKey, mediaType).run();
    const post = await env.DB.prepare(
        "SELECT id, author, type, title, content, media_key, media_type, created_at FROM posts WHERE id = ?"
    ).bind(res.meta.last_row_id).first();
    post.like_count = 0;
    post.liked = 0;
    post.comment_count = 0;
    post.share_count = 0;
    await maskAuthors(env, [post], "author", username);
    return json({ ok: true, post });
}

async function updatePost(request, env) {
    const b = await readJson(request);
    const username = await userFromToken(env, b.token || "");
    if (!username) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);

    const post = await env.DB.prepare("SELECT author FROM posts WHERE id = ?").bind(b.id).first();
    if (!post) return json({ error: "ไม่พบโพสต์" }, 404);
    if (post.author !== username && !(await isAdmin(env, username)))
        return json({ error: "คุณไม่มีสิทธิ์แก้ไขโพสต์นี้" }, 403);

    const content = (b.content || "").trim();
    if (!content) return json({ error: "กรุณากรอกเนื้อหา" }, 400);
    const title = (b.title || "").trim() || null;
    const type = title ? "novel" : "text";

    await env.DB.prepare("UPDATE posts SET title = ?, content = ?, type = ? WHERE id = ?")
        .bind(title, content, type, b.id).run();
    const updated = await env.DB.prepare(
        "SELECT id, author, type, title, content, media_key, media_type, share_count, created_at FROM posts WHERE id = ?"
    ).bind(b.id).first();
    await maskAuthors(env, [updated], "author", username);
    return json({ ok: true, post: updated });
}

async function deletePost(request, env) {
    const b = await readJson(request);
    const username = await userFromToken(env, b.token || "");
    if (!username) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);

    const post = await env.DB.prepare("SELECT author, media_key FROM posts WHERE id = ?").bind(b.id).first();
    if (!post) return json({ error: "ไม่พบโพสต์" }, 404);
    if (post.author !== username && !(await isAdmin(env, username)))
        return json({ error: "คุณไม่มีสิทธิ์ลบโพสต์นี้" }, 403);

    // ลบไฟล์สื่อใน R2 ด้วย ไม่ให้เหลือขยะ
    if (post.media_key && env.MEDIA) {
        try { await env.MEDIA.delete(post.media_key); } catch (e) { /* ignore */ }
    }
    await env.DB.prepare("DELETE FROM likes WHERE post_id = ?").bind(b.id).run();
    await env.DB.prepare("DELETE FROM comments WHERE post_id = ?").bind(b.id).run();
    await env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(b.id).run();
    return json({ ok: true });
}

async function sharePost(request, env) {
    const b = await readJson(request);
    const username = await userFromToken(env, b.token || "");
    if (!username) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    const postId = parseInt(b.id, 10);
    if (isNaN(postId)) return json({ error: "รหัสโพสต์ไม่ถูกต้อง" }, 400);

    const post = await env.DB.prepare("SELECT id FROM posts WHERE id = ?").bind(postId).first();
    if (!post) return json({ error: "ไม่พบโพสต์" }, 404);

    await env.DB.prepare("UPDATE posts SET share_count = share_count + 1 WHERE id = ?")
        .bind(postId).run();
    const row = await env.DB.prepare("SELECT share_count FROM posts WHERE id = ?").bind(postId).first();
    return json({ ok: true, share_count: row ? row.share_count : 0 });
}

// ===== Comments =====
async function listComments(env, url) {
    const viewer = await userFromToken(env, url.searchParams.get("token") || "");
    const postId = parseInt(url.searchParams.get("post_id") || "", 10);
    if (isNaN(postId)) return json({ error: "รหัสโพสต์ไม่ถูกต้อง" }, 400);
    const { results } = await env.DB.prepare(
        "SELECT id, post_id, author, content, created_at FROM comments WHERE post_id = ? ORDER BY id ASC LIMIT 200"
    ).bind(postId).all();
    return json({ ok: true, comments: await maskAuthors(env, results, "author", viewer) });
}

async function createComment(request, env) {
    const b = await readJson(request);
    const username = await userFromToken(env, b.token || "");
    if (!username) return json({ error: "กรุณาเข้าสู่ระบบก่อนคอมเมนต์" }, 401);

    const postId = parseInt(b.post_id, 10);
    const content = (b.content || "").trim();
    if (isNaN(postId)) return json({ error: "รหัสโพสต์ไม่ถูกต้อง" }, 400);
    if (!content) return json({ error: "กรุณาพิมพ์ข้อความ" }, 400);
    if (content.length > 2000) return json({ error: "ข้อความยาวเกินไป" }, 400);

    const post = await env.DB.prepare("SELECT id FROM posts WHERE id = ?").bind(postId).first();
    if (!post) return json({ error: "ไม่พบโพสต์" }, 404);

    const res = await env.DB.prepare(
        "INSERT INTO comments (post_id, author, content) VALUES (?, ?, ?)"
    ).bind(postId, username, content).run();
    const comment = await env.DB.prepare(
        "SELECT id, post_id, author, content, created_at FROM comments WHERE id = ?"
    ).bind(res.meta.last_row_id).first();
    await maskAuthors(env, [comment], "author", username);
    return json({ ok: true, comment });
}

async function deleteComment(request, env) {
    const b = await readJson(request);
    const username = await userFromToken(env, b.token || "");
    if (!username) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);

    const c = await env.DB.prepare("SELECT author FROM comments WHERE id = ?").bind(b.id).first();
    if (!c) return json({ error: "ไม่พบคอมเมนต์" }, 404);
    if (c.author !== username && !(await isAdmin(env, username)))
        return json({ error: "คุณไม่มีสิทธิ์ลบคอมเมนต์นี้" }, 403);

    await env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(b.id).run();
    return json({ ok: true });
}

// ===== Novels =====
async function listNovels(env, url) {
    const viewer = url ? await userFromToken(env, url.searchParams.get("token") || "") : null;
    const { results } = await env.DB.prepare(
        "SELECT n.id, n.author, n.title, n.synopsis, n.cover, n.created_at, " +
        "(SELECT COUNT(*) FROM chapters c WHERE c.novel_id = n.id) AS chapter_count " +
        "FROM novels n ORDER BY n.id DESC LIMIT 100"
    ).all();
    return json({ ok: true, novels: await maskAuthors(env, results, "author", viewer) });
}

async function getNovel(env, url) {
    const id = url.searchParams.get("id");
    const viewer = await userFromToken(env, url.searchParams.get("token") || "");
    const novel = await env.DB.prepare(
        "SELECT id, author, title, synopsis, cover, created_at FROM novels WHERE id = ?"
    ).bind(id).first();
    if (!novel) return json({ error: "ไม่พบนิยาย" }, 404);
    const { results } = await env.DB.prepare(
        "SELECT id, title, content, created_at FROM chapters WHERE novel_id = ? ORDER BY id ASC"
    ).bind(id).all();
    novel.chapters = results || [];

    const fc = await env.DB.prepare("SELECT COUNT(*) AS c FROM novel_follows WHERE novel_id = ?")
        .bind(id).first();
    novel.follower_count = fc ? fc.c : 0;
    novel.following = false;
    if (viewer) {
        const f = await env.DB.prepare(
            "SELECT id FROM novel_follows WHERE novel_id = ? AND username = ?"
        ).bind(id, viewer).first();
        novel.following = !!f;
    }
    await maskAuthors(env, [novel], "author", viewer);
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
    await maskAuthors(env, [novel], "author", username);
    return json({ ok: true, novel });
}

async function deleteNovel(request, env) {
    const b = await readJson(request);
    const username = await userFromToken(env, b.token || "");
    if (!username) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);

    const novel = await env.DB.prepare("SELECT author FROM novels WHERE id = ?").bind(b.id).first();
    if (!novel) return json({ error: "ไม่พบนิยาย" }, 404);
    if (novel.author !== username && !(await isAdmin(env, username)))
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
    if (novel.author !== username && !(await isAdmin(env, username)))
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

    // แจ้งเตือนคนที่กดติดตามนิยายเรื่องนี้ไว้
    try {
        const full = await env.DB.prepare("SELECT title FROM novels WHERE id = ?").bind(b.novel_id).first();
        const { results } = await env.DB.prepare(
            "SELECT username FROM novel_follows WHERE novel_id = ? AND username != ?"
        ).bind(b.novel_id, username).all();
        const followers = (results || []).map((r) => r.username);
        if (followers.length) {
            await env.DB.batch(followers.map((u) =>
                env.DB.prepare(
                    "INSERT INTO notifications (recipient, type, title, body, link, actor) " +
                    "VALUES (?, 'chapter', ?, ?, ?, ?)"
                ).bind(
                    u,
                    "\"" + (full ? full.title : "นิยาย") + "\" มีตอนใหม่",
                    title,
                    "novel:" + b.novel_id,
                    username
                )
            ));
        }
    } catch (e) { /* แจ้งเตือนพลาดไม่ควรทำให้ลงตอนไม่สำเร็จ */ }

    return json({ ok: true, chapter });
}

// ===== การแจ้งเตือน =====

// สร้างแจ้งเตือน — ถ้าเป็นข้อความจากคนเดิมที่ยังไม่ได้อ่าน จะรวมเป็นอันเดียวไม่ให้รก
async function pushNotification(env, { recipient, type, title, body, link, actor }) {
    if (!recipient) return;
    try {
        if (type === "message") {
            const existing = await env.DB.prepare(
                "SELECT id FROM notifications WHERE recipient = ? AND type = 'message' AND actor = ? AND is_read = 0"
            ).bind(recipient, actor || "").first();
            if (existing) {
                await env.DB.prepare(
                    "UPDATE notifications SET title = ?, body = ?, created_at = datetime('now') WHERE id = ?"
                ).bind(title, body || null, existing.id).run();
                return;
            }
        }
        await env.DB.prepare(
            "INSERT INTO notifications (recipient, type, title, body, link, actor) VALUES (?, ?, ?, ?, ?, ?)"
        ).bind(recipient, type, title, body || null, link || null, actor || null).run();
    } catch (e) { /* แจ้งเตือนพลาดต้องไม่ทำให้งานหลักล้ม */ }
}

async function listNotifications(env, url) {
    const username = await userFromToken(env, url.searchParams.get("token") || "");
    if (!username) return json({ error: "unauthorized" }, 401);

    const { results } = await env.DB.prepare(
        "SELECT id, type, title, body, link, actor, is_read, created_at FROM notifications " +
        "WHERE recipient = ? ORDER BY id DESC LIMIT 50"
    ).bind(username).all();
    const row = await env.DB.prepare(
        "SELECT COUNT(*) AS c FROM notifications WHERE recipient = ? AND is_read = 0"
    ).bind(username).first();

    // เก็บไว้ไม่เกิน 200 รายการต่อคน
    try {
        await env.DB.prepare(
            "DELETE FROM notifications WHERE recipient = ? AND id NOT IN " +
            "(SELECT id FROM notifications WHERE recipient = ? ORDER BY id DESC LIMIT 200)"
        ).bind(username, username).run();
    } catch (e) { /* ignore */ }

    return json({ ok: true, notifications: results || [], unread: row ? row.c : 0 });
}

async function markRead(request, env) {
    const b = await readJson(request);
    const username = await userFromToken(env, b.token || "");
    if (!username) return json({ error: "unauthorized" }, 401);
    await env.DB.prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND recipient = ?")
        .bind(b.id, username).run();
    return json({ ok: true });
}

async function markAllRead(request, env) {
    const b = await readJson(request);
    const username = await userFromToken(env, b.token || "");
    if (!username) return json({ error: "unauthorized" }, 401);
    await env.DB.prepare("UPDATE notifications SET is_read = 1 WHERE recipient = ? AND is_read = 0")
        .bind(username).run();
    return json({ ok: true });
}

// ประกาศจากผู้พัฒนา — เฉพาะแอดมิน
async function sendAnnouncement(request, env) {
    const b = await readJson(request);
    const username = await userFromToken(env, b.token || "");
    if (!username) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    if (!(await isAdmin(env, username)))
        return json({ error: "เฉพาะผู้ดูแลระบบเท่านั้นที่ส่งประกาศได้" }, 403);

    const title = (b.title || "").trim();
    const body = (b.body || "").trim();
    if (!title) return json({ error: "กรุณากรอกหัวข้อประกาศ" }, 400);
    if (title.length > 200 || body.length > 2000) return json({ error: "ข้อความยาวเกินไป" }, 400);

    const { results } = await env.DB.prepare("SELECT username FROM users").all();
    const targets = (results || []).map((r) => r.username);
    if (!targets.length) return json({ ok: true, sent: 0 });

    const stmts = targets.map((u) =>
        env.DB.prepare(
            "INSERT INTO notifications (recipient, type, title, body, actor) VALUES (?, 'announce', ?, ?, ?)"
        ).bind(u, title, body || null, username)
    );
    await env.DB.batch(stmts);
    return json({ ok: true, sent: targets.length });
}

// ติดตามนิยาย (เปิดแจ้งเตือนเมื่อมีตอนใหม่)
async function toggleFollow(request, env) {
    const b = await readJson(request);
    const username = await userFromToken(env, b.token || "");
    if (!username) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);

    const novelId = parseInt(b.id, 10);
    if (isNaN(novelId)) return json({ error: "รหัสนิยายไม่ถูกต้อง" }, 400);
    const novel = await env.DB.prepare("SELECT id FROM novels WHERE id = ?").bind(novelId).first();
    if (!novel) return json({ error: "ไม่พบนิยาย" }, 404);

    const existing = await env.DB.prepare(
        "SELECT id FROM novel_follows WHERE novel_id = ? AND username = ?"
    ).bind(novelId, username).first();

    let following;
    if (existing) {
        await env.DB.prepare("DELETE FROM novel_follows WHERE id = ?").bind(existing.id).run();
        following = false;
    } else {
        await env.DB.prepare("INSERT INTO novel_follows (novel_id, username) VALUES (?, ?)")
            .bind(novelId, username).run();
        following = true;
    }
    const row = await env.DB.prepare("SELECT COUNT(*) AS c FROM novel_follows WHERE novel_id = ?")
        .bind(novelId).first();
    return json({ ok: true, following, follower_count: row ? row.c : 0 });
}

// ===== Friends =====
async function listFriends(env, url) {
    const username = await userFromToken(env, url.searchParams.get("token") || "");
    if (!username) return json({ error: "unauthorized" }, 401);
    const { results } = await env.DB.prepare(
        "SELECT f.friend_username, f.friend_id, u.alias FROM friends f " +
        "LEFT JOIN users u ON u.username = f.friend_username WHERE f.owner = ? ORDER BY f.id DESC"
    ).bind(username).all();
    const viewerIsAdmin = await isAdmin(env, username);
    const friends = (results || []).map((r) => ({
        alias: r.alias || r.friend_username,
        friend_id: r.friend_id,
        real_username: viewerIsAdmin ? r.friend_username : undefined,
    }));
    return json({ ok: true, friends });
}

async function addFriend(request, env) {
    const b = await readJson(request);
    const username = await userFromToken(env, b.token || "");
    if (!username) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);

    // เพิ่มเพื่อนด้วย "นามแฝง" เท่านั้น — ชื่อผู้ใช้จริงถูกซ่อนจากทุกคน
    let alias = (b.alias || b.username || "").trim();
    if (!alias) return json({ error: "กรุณากรอกนามแฝงของเพื่อน" }, 400);
    if (alias[0] !== "#" && /^\d{9}$/.test(alias)) alias = "#" + alias;   // ใส่ # ให้อัตโนมัติ

    const target = await env.DB.prepare("SELECT id, username, alias FROM users WHERE alias = ?")
        .bind(alias).first();
    if (!target) return json({ error: "ไม่พบผู้ใช้ที่มีนามแฝงนี้" }, 404);
    if (target.username === username) return json({ error: "ไม่สามารถเพิ่มตัวเองเป็นเพื่อนได้" }, 400);

    const exists = await env.DB.prepare("SELECT id FROM friends WHERE owner = ? AND friend_username = ?")
        .bind(username, target.username).first();
    if (exists) return json({ error: "เป็นเพื่อนกันอยู่แล้ว" }, 409);

    await env.DB.prepare("INSERT INTO friends (owner, friend_username, friend_id) VALUES (?, ?, ?)")
        .bind(username, target.username, target.id).run();
    return json({ ok: true, friend: { alias: target.alias, friend_id: target.id } });
}

// ===== Messages =====
async function listMessages(env, url) {
    const username = await userFromToken(env, url.searchParams.get("token") || "");
    if (!username) return json({ error: "unauthorized" }, 401);
    const withAlias = (url.searchParams.get("with") || "").trim();
    if (!withAlias) return json({ error: "missing with" }, 400);
    const withUser = await usernameFromAlias(env, withAlias);
    if (!withUser) return json({ error: "ไม่พบผู้ใช้นี้" }, 404);

    const { results } = await env.DB.prepare(
        "SELECT id, sender, recipient, content, created_at FROM messages " +
        "WHERE (sender = ? AND recipient = ?) OR (sender = ? AND recipient = ?) ORDER BY id ASC LIMIT 300"
    ).bind(username, withUser, withUser, username).all();
    const messages = (results || []).map((r) => ({
        id: r.id,
        mine: r.sender === username,
        content: r.content,
        created_at: r.created_at,
    }));
    return json({ ok: true, messages });
}

async function sendMessage(request, env) {
    const b = await readJson(request);
    const username = await userFromToken(env, b.token || "");
    if (!username) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    const toAlias = (b.to || "").trim();
    const content = (b.content || "").trim();
    if (!toAlias || !content) return json({ error: "ข้อมูลไม่ครบ" }, 400);
    if (content.length > 2000) return json({ error: "ข้อความยาวเกินไป" }, 400);
    const to = await usernameFromAlias(env, toAlias);
    if (!to) return json({ error: "ไม่พบผู้ใช้นี้" }, 404);
    const myAlias = await ensureAlias(env, username);

    const res = await env.DB.prepare(
        "INSERT INTO messages (sender, recipient, content) VALUES (?, ?, ?)"
    ).bind(username, to, content).run();
    const raw = await env.DB.prepare(
        "SELECT id, sender, content, created_at FROM messages WHERE id = ?"
    ).bind(res.meta.last_row_id).first();
    const message = { id: raw.id, mine: true, content: raw.content, created_at: raw.created_at };

    await pushNotification(env, {
        recipient: to,
        type: "message",
        title: (myAlias || "มีคน") + " ส่งข้อความถึงคุณ",
        body: content.slice(0, 120),
        link: "chat:" + (myAlias || ""),
        actor: username,
    });

    // แจ้ง Durable Object ให้กระจายข้อความแบบเรียลไทม์ (ถ้ามีคนออนไลน์อยู่)
    try {
        const stub = env.CHAT.get(env.CHAT.idFromName(roomIdFor(username, to)));
        await stub.fetch("https://do/broadcast", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                message: { id: raw.id, sender: username, content: raw.content, created_at: raw.created_at },
            }),
        });
    } catch (e) { /* ignore broadcast errors */ }

    return json({ ok: true, message });
}

// ===== Helpers =====
async function pbkdf2(password, saltHex) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: hexToBytes(saltHex), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" }, key, 256
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

        // กระจายข้อความที่ส่งผ่าน REST (คำนวณ mine แยกรายคน)
        if (request.method === "POST") {
            const body = await request.json().catch(() => ({}));
            const msg = body && body.message;
            if (msg) {
                for (const ws of this.state.getWebSockets()) {
                    try {
                        const a = ws.deserializeAttachment() || {};
                        ws.send(JSON.stringify({
                            type: "message",
                            message: {
                                id: msg.id,
                                mine: a.user === msg.sender,
                                content: msg.content,
                                created_at: msg.created_at,
                            },
                        }));
                    } catch (e) { /* ignore */ }
                }
            }
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
        const toAlias = (data.to || "").trim();
        const content = (data.content || "").trim();
        if (!toAlias || !content || content.length > 2000) return;

        const toRow = await this.env.DB.prepare("SELECT username FROM users WHERE alias = ?")
            .bind(toAlias).first();
        if (!toRow) return;
        const to = toRow.username;
        const meRow = await this.env.DB.prepare("SELECT alias FROM users WHERE username = ?")
            .bind(sender).first();
        const senderAlias = meRow ? meRow.alias : sender;

        const res = await this.env.DB.prepare(
            "INSERT INTO messages (sender, recipient, content) VALUES (?, ?, ?)"
        ).bind(sender, to, content).run();
        const saved = await this.env.DB.prepare(
            "SELECT id, sender, content, created_at FROM messages WHERE id = ?"
        ).bind(res.meta.last_row_id).first();

        // ส่งให้แต่ละฝั่งโดยระบุว่าเป็นข้อความของตัวเองหรือไม่ (ไม่เปิดเผยชื่อผู้ใช้จริง)
        for (const ws2 of this.state.getWebSockets()) {
            try {
                const a = ws2.deserializeAttachment() || {};
                ws2.send(JSON.stringify({
                    type: "message",
                    message: {
                        id: saved.id,
                        mine: a.user === sender,
                        content: saved.content,
                        created_at: saved.created_at,
                    },
                }));
            } catch (e) { /* ignore */ }
        }

        // แจ้งเตือนผู้รับ (กระดิ่ง)
        await pushNotification(this.env, {
            recipient: to,
            type: "message",
            title: senderAlias + " ส่งข้อความถึงคุณ",
            body: content.slice(0, 120),
            link: "chat:" + senderAlias,
            actor: sender,
        });
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
