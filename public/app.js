// เรือนอักษร — ตรรกะหน้าแพลตฟอร์ม (dashboard)
(function () {
    const token = localStorage.getItem("authToken");
    let me = { username: localStorage.getItem("username") || "", id: null, role: "user" };

    if (!token) {
        window.location.href = "index.html";
        return;
    }

    // ---------- helpers ----------
    async function api(path, opts) {
        const res = await fetch(path, opts);
        let data = {};
        try { data = await res.json(); } catch (e) { data = {}; }
        return { ok: res.ok, status: res.status, data };
    }

    function el(tag, className, text) {
        const e = document.createElement(tag);
        if (className) e.className = className;
        if (text !== undefined) e.textContent = text;
        return e;
    }

    function timeAgo(iso) {
        if (!iso) return "";
        const t = Date.parse(iso.replace(" ", "T") + "Z");
        if (isNaN(t)) return "";
        const diff = Math.floor((Date.now() - t) / 1000);
        if (diff < 60) return "เมื่อสักครู่";
        if (diff < 3600) return Math.floor(diff / 60) + " นาทีที่แล้ว";
        if (diff < 86400) return Math.floor(diff / 3600) + " ชั่วโมงที่แล้ว";
        return Math.floor(diff / 86400) + " วันที่แล้ว";
    }

    function canManage(author) {
        return author === me.username || me.role === "admin";
    }

    function initial(name) {
        return (name || "?").charAt(0).toUpperCase();
    }

    // ---------- boot ----------
    document.addEventListener("DOMContentLoaded", async function () {
        // ตรวจ token ว่ายังใช้ได้ไหม
        const meRes = await api("/api/me?token=" + encodeURIComponent(token));
        if (meRes.status === 401) {
            localStorage.removeItem("authToken");
            localStorage.removeItem("username");
            window.location.href = "index.html";
            return;
        }
        if (meRes.ok && meRes.data.ok) {
            me.username = meRes.data.username;
            me.id = meRes.data.id;
            me.role = meRes.data.role;
        }

        const ch = initial(me.username);
        document.getElementById("myAvatar").textContent = ch;
        document.getElementById("myAvatar").title = me.username;
        document.getElementById("composerAvatar").textContent = ch;

        document.getElementById("logoutBtn").addEventListener("click", async function (e) {
            e.preventDefault();
            try {
                await fetch("/api/logout", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ token }),
                });
            } catch (err) { /* ignore */ }
            localStorage.removeItem("authToken");
            localStorage.removeItem("username");
            window.location.href = "index.html";
        });

        setupTabs();
        setupMenu();
        setupComposer();
        setupWrite();
        setupChatControls();
        setupSidebarNav();

        showView("feed");
    });

    // ---------- view router ----------
    const featureViews = ["feed", "menu", "novels", "chat", "write", "profile", "clips"];

    function showView(name) {
        featureViews.forEach(function (v) {
            const node = document.getElementById("view-" + v);
            if (node) node.style.display = (v === name) ? "" : "none";
        });

        const tabFeed = document.getElementById("tabFeed");
        const tabMenu = document.getElementById("tabMenu");
        tabFeed.classList.toggle("active", name === "feed");
        tabMenu.classList.toggle("active", name !== "feed");

        // หยุด polling แชทเมื่อออกจากหน้าแชท
        if (name !== "chat") stopChatPolling();

        if (name === "feed") loadPosts();
        if (name === "novels") loadNovels();
        if (name === "chat") loadFriends();
        if (name === "write") loadMyNovels();
        if (name === "profile") loadProfile();
    }

    function setupTabs() {
        document.getElementById("tabFeed").addEventListener("click", () => showView("feed"));
        document.getElementById("tabMenu").addEventListener("click", () => showView("menu"));
    }

    function setupMenu() {
        document.querySelectorAll("[data-goto]").forEach(function (btn) {
            btn.addEventListener("click", function () {
                showView(btn.getAttribute("data-goto"));
            });
        });
        document.querySelectorAll(".back-to-menu").forEach(function (btn) {
            btn.addEventListener("click", () => showView("menu"));
        });
    }

    function setupSidebarNav() {
        const map = { navHome: "feed", navWrite: "write", navChat: "chat", navProfile: "profile", navNovels: "novels" };
        Object.keys(map).forEach(function (id) {
            const node = document.getElementById(id);
            if (node) node.addEventListener("click", function (e) {
                e.preventDefault();
                document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
                node.classList.add("active");
                showView(map[id]);
            });
        });
    }

    // ---------- posts (feed) ----------
    function renderPost(post) {
        const card = el("article", "post-card");
        card.dataset.id = post.id;

        const head = el("div", "post-head");
        const av = el("div", "avatar", initial(post.author));
        const meta = el("div", "post-meta");
        meta.appendChild(el("span", "post-author", post.author));
        meta.appendChild(el("span", "post-time", (post.type === "novel" ? "ลงบทใหม่ · " : "") + timeAgo(post.created_at)));
        head.appendChild(av);
        head.appendChild(meta);
        if (post.type === "novel") head.appendChild(el("span", "post-badge", "นิยาย"));
        card.appendChild(head);

        const body = el("div", "post-body");
        renderPostBody(body, post);
        card.appendChild(body);

        const footer = el("div", "post-footer");
        ["❤️ ถูกใจ", "💬 คอมเมนต์", "🔖 บันทึก", "↗️ แชร์"].forEach(function (t) {
            footer.appendChild(el("button", "react-btn", t));
        });
        if (canManage(post.author)) {
            const edit = el("button", "react-btn manage", "✏️ แก้ไข");
            const del = el("button", "react-btn manage danger", "🗑️ ลบ");
            edit.addEventListener("click", () => startEditPost(card, post));
            del.addEventListener("click", () => deletePost(card, post));
            footer.appendChild(edit);
            footer.appendChild(del);
        }
        card.appendChild(footer);
        return card;
    }

    function renderPostBody(body, post) {
        body.innerHTML = "";
        if (post.type === "novel") {
            const block = el("div", "novel-block");
            block.appendChild(el("div", "novel-cover cover-1"));
            const info = el("div", "novel-info");
            info.appendChild(el("h2", "novel-title", post.title || "ไม่มีชื่อเรื่อง"));
            info.appendChild(el("p", "novel-excerpt", post.content));
            block.appendChild(info);
            body.appendChild(block);
        } else {
            body.appendChild(el("p", "post-text", post.content));
        }
    }

    function startEditPost(card, post) {
        const body = card.querySelector(".post-body");
        body.innerHTML = "";
        const wrap = el("div", "edit-box");
        const titleInput = el("input", "post-title-input");
        titleInput.type = "text";
        titleInput.placeholder = "ชื่อเรื่อง/บท (เว้นว่าง = โพสต์ธรรมดา)";
        titleInput.value = post.title || "";
        const ta = el("textarea", "edit-textarea");
        ta.value = post.content;
        const row = el("div", "edit-actions");
        const save = el("button", "btn-post", "บันทึก");
        const cancel = el("button", "tool-btn", "ยกเลิก");
        const msg = el("div", "composer-msg");
        row.appendChild(save);
        row.appendChild(cancel);
        wrap.appendChild(titleInput);
        wrap.appendChild(ta);
        wrap.appendChild(msg);
        wrap.appendChild(row);
        body.appendChild(wrap);

        cancel.addEventListener("click", () => renderPostBody(body, post));
        save.addEventListener("click", async function () {
            const content = ta.value.trim();
            const title = titleInput.value.trim();
            if (!content) { msg.textContent = "กรุณากรอกเนื้อหา"; return; }
            save.disabled = true;
            const res = await api("/api/posts/update", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ token, id: post.id, title, content }),
            });
            save.disabled = false;
            if (res.ok && res.data.ok) {
                const newCard = renderPost(res.data.post);
                card.replaceWith(newCard);
            } else {
                msg.textContent = res.data.error || "แก้ไขไม่สำเร็จ";
            }
        });
    }

    async function deletePost(card, post) {
        if (!window.confirm("ต้องการลบโพสต์นี้หรือไม่?")) return;
        const res = await api("/api/posts/delete", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token, id: post.id }),
        });
        if (res.ok && res.data.ok) {
            card.remove();
        } else {
            alert(res.data.error || "ลบไม่สำเร็จ");
        }
    }

    async function loadPosts() {
        const list = document.getElementById("postList");
        list.innerHTML = '<div class="feed-loading">กำลังโหลดโพสต์...</div>';
        const res = await api("/api/posts");
        list.innerHTML = "";
        if (!res.ok || !res.data.posts) {
            list.innerHTML = '<div class="feed-loading">โหลดโพสต์ไม่สำเร็จ</div>';
            return;
        }
        if (res.data.posts.length === 0) {
            list.innerHTML = '<div class="feed-loading">ยังไม่มีโพสต์ มาเริ่มเขียนกันเลย!</div>';
            return;
        }
        res.data.posts.forEach(p => list.appendChild(renderPost(p)));
    }

    function setupComposer() {
        const btn = document.getElementById("btnPost");
        const titleEl = document.getElementById("postTitle");
        const contentEl = document.getElementById("postContent");
        const msg = document.getElementById("composerMsg");

        btn.addEventListener("click", async function () {
            const content = contentEl.value.trim();
            const title = titleEl.value.trim();
            msg.textContent = "";
            if (!content) { msg.textContent = "กรุณากรอกเนื้อหาก่อนโพสต์"; return; }
            btn.disabled = true;
            const res = await api("/api/posts", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ token, title, content }),
            });
            btn.disabled = false;
            if (res.ok && res.data.ok) {
                contentEl.value = "";
                titleEl.value = "";
                const list = document.getElementById("postList");
                const empty = list.querySelector(".feed-loading");
                if (empty) list.innerHTML = "";
                list.insertBefore(renderPost(res.data.post), list.firstChild);
            } else {
                msg.textContent = res.data.error || "โพสต์ไม่สำเร็จ";
            }
        });
    }

    // ---------- novels ----------
    async function loadNovels() {
        const grid = document.getElementById("novelGrid");
        document.getElementById("novelDetail").style.display = "none";
        grid.style.display = "";
        grid.innerHTML = '<div class="feed-loading">กำลังโหลดนิยาย...</div>';
        const res = await api("/api/novels");
        grid.innerHTML = "";
        if (!res.ok || !res.data.novels) {
            grid.innerHTML = '<div class="feed-loading">โหลดนิยายไม่สำเร็จ</div>';
            return;
        }
        if (res.data.novels.length === 0) {
            grid.innerHTML = '<div class="feed-loading">ยังไม่มีนิยาย ไปที่ "เขียนนิยาย" เพื่อเริ่มเรื่องแรก!</div>';
            return;
        }
        res.data.novels.forEach(n => grid.appendChild(renderNovelCard(n)));
    }

    function renderNovelCard(n) {
        const card = el("div", "novel-card");
        const cover = el("div", "novel-card-cover " + safeCover(n.cover));
        cover.appendChild(el("span", "novel-card-badge", (n.chapter_count || 0) + " ตอน"));
        const info = el("div", "novel-card-info");
        info.appendChild(el("h3", "novel-card-title", n.title));
        info.appendChild(el("p", "novel-card-synopsis", n.synopsis || "ไม่มีเรื่องย่อ"));
        info.appendChild(el("span", "novel-card-author", "โดย " + n.author));
        card.appendChild(cover);
        card.appendChild(info);
        card.addEventListener("click", () => openNovel(n.id));
        return card;
    }

    function safeCover(c) {
        const allowed = ["cover-1", "cover-2", "cover-3", "cover-4", "cover-5", "cover-6"];
        return allowed.indexOf(c) >= 0 ? c : "cover-1";
    }

    async function openNovel(id) {
        const grid = document.getElementById("novelGrid");
        const detail = document.getElementById("novelDetail");
        grid.style.display = "none";
        detail.style.display = "";
        detail.innerHTML = '<div class="feed-loading">กำลังโหลด...</div>';
        const res = await api("/api/novels/get?id=" + encodeURIComponent(id));
        if (!res.ok || !res.data.novel) {
            detail.innerHTML = '<div class="feed-loading">โหลดนิยายไม่สำเร็จ</div>';
            return;
        }
        renderNovelDetail(detail, res.data.novel);
    }

    function renderNovelDetail(detail, novel) {
        detail.innerHTML = "";
        const back = el("button", "back-btn", "← กลับไปชั้นหนังสือ");
        back.addEventListener("click", loadNovels);
        detail.appendChild(back);

        const head = el("div", "novel-detail-head");
        head.appendChild(el("div", "novel-detail-cover " + safeCover(novel.cover)));
        const meta = el("div", "novel-detail-meta");
        meta.appendChild(el("h2", "novel-detail-title", novel.title));
        meta.appendChild(el("span", "novel-detail-author", "โดย " + novel.author));
        meta.appendChild(el("p", "novel-detail-synopsis", novel.synopsis || "ไม่มีเรื่องย่อ"));
        if (canManage(novel.author)) {
            const del = el("button", "react-btn manage danger", "🗑️ ลบนิยาย");
            del.addEventListener("click", async function () {
                if (!window.confirm("ลบนิยายทั้งเรื่อง (รวมทุกตอน)?")) return;
                const r = await api("/api/novels/delete", {
                    method: "POST", headers: { "content-type": "application/json" },
                    body: JSON.stringify({ token, id: novel.id }),
                });
                if (r.ok && r.data.ok) loadNovels(); else alert(r.data.error || "ลบไม่สำเร็จ");
            });
            meta.appendChild(del);
        }
        head.appendChild(meta);
        detail.appendChild(head);

        const chapWrap = el("div", "chapter-area");
        detail.appendChild(chapWrap);
        renderChapterList(chapWrap, novel);
    }

    function renderChapterList(wrap, novel) {
        wrap.innerHTML = "";
        wrap.appendChild(el("h3", "side-title", "สารบัญ (" + novel.chapters.length + " ตอน)"));
        if (novel.chapters.length === 0) {
            wrap.appendChild(el("div", "feed-loading", "ยังไม่มีตอน"));
            return;
        }
        novel.chapters.forEach(function (c, i) {
            const item = el("button", "chapter-item");
            item.appendChild(el("span", "chapter-no", "ตอนที่ " + (i + 1)));
            item.appendChild(el("span", "chapter-name", c.title));
            item.addEventListener("click", () => renderChapterRead(wrap, novel, i));
            wrap.appendChild(item);
        });
    }

    function renderChapterRead(wrap, novel, index) {
        const c = novel.chapters[index];
        wrap.innerHTML = "";
        const back = el("button", "back-btn", "← สารบัญ");
        back.addEventListener("click", () => renderChapterList(wrap, novel));
        wrap.appendChild(back);
        wrap.appendChild(el("h2", "chapter-read-title", "ตอนที่ " + (index + 1) + " · " + c.title));
        const content = el("div", "chapter-read-content");
        c.content.split("\n").forEach(function (line) {
            content.appendChild(el("p", null, line));
        });
        wrap.appendChild(content);
    }

    // ---------- write ----------
    function setupWrite() {
        // ตัวเลือกปก
        document.querySelectorAll("#coverPick .cover-swatch").forEach(function (sw) {
            sw.addEventListener("click", function () {
                document.querySelectorAll("#coverPick .cover-swatch").forEach(s => s.classList.remove("selected"));
                sw.classList.add("selected");
            });
        });

        document.getElementById("nvCreateBtn").addEventListener("click", async function () {
            const title = document.getElementById("nvTitle").value.trim();
            const synopsis = document.getElementById("nvSynopsis").value.trim();
            const sel = document.querySelector("#coverPick .cover-swatch.selected");
            const cover = sel ? sel.getAttribute("data-cover") : "cover-1";
            const msg = document.getElementById("nvCreateMsg");
            msg.textContent = "";
            if (!title) { msg.textContent = "กรุณากรอกชื่อเรื่อง"; return; }
            const btn = document.getElementById("nvCreateBtn");
            btn.disabled = true;
            const res = await api("/api/novels/create", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ token, title, synopsis, cover }),
            });
            btn.disabled = false;
            if (res.ok && res.data.ok) {
                document.getElementById("nvTitle").value = "";
                document.getElementById("nvSynopsis").value = "";
                msg.className = "composer-msg ok";
                msg.textContent = "สร้างนิยายสำเร็จ! เพิ่มตอนได้ด้านล่าง";
                loadMyNovels();
            } else {
                msg.className = "composer-msg";
                msg.textContent = res.data.error || "สร้างไม่สำเร็จ";
            }
        });

        document.getElementById("chAddBtn").addEventListener("click", async function () {
            const novel_id = document.getElementById("chNovelSelect").value;
            const title = document.getElementById("chTitle").value.trim();
            const content = document.getElementById("chContent").value.trim();
            const msg = document.getElementById("chAddMsg");
            msg.textContent = "";
            if (!novel_id) { msg.textContent = "กรุณาเลือกนิยาย"; return; }
            if (!title || !content) { msg.textContent = "กรุณากรอกชื่อตอนและเนื้อหา"; return; }
            const btn = document.getElementById("chAddBtn");
            btn.disabled = true;
            const res = await api("/api/chapters/create", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ token, novel_id: Number(novel_id), title, content }),
            });
            btn.disabled = false;
            if (res.ok && res.data.ok) {
                document.getElementById("chTitle").value = "";
                document.getElementById("chContent").value = "";
                msg.className = "composer-msg ok";
                msg.textContent = "เพิ่มตอนสำเร็จ!";
                loadMyNovels();
            } else {
                msg.className = "composer-msg";
                msg.textContent = res.data.error || "เพิ่มตอนไม่สำเร็จ";
            }
        });
    }

    async function loadMyNovels() {
        const res = await api("/api/novels");
        const select = document.getElementById("chNovelSelect");
        const listWrap = document.getElementById("myNovelList");
        select.innerHTML = "";
        listWrap.innerHTML = "";
        const mine = (res.data.novels || []).filter(n => n.author === me.username);
        if (mine.length === 0) {
            const opt = el("option", null, "— ยังไม่มีนิยาย —");
            opt.value = "";
            select.appendChild(opt);
            listWrap.appendChild(el("div", "feed-loading", "คุณยังไม่มีนิยาย สร้างเรื่องแรกด้านบน"));
            return;
        }
        mine.forEach(function (n) {
            const opt = el("option", null, n.title);
            opt.value = n.id;
            select.appendChild(opt);
            const chip = el("div", "my-novel-chip");
            chip.appendChild(el("span", "my-novel-chip-title", n.title));
            chip.appendChild(el("span", "my-novel-chip-meta", (n.chapter_count || 0) + " ตอน"));
            listWrap.appendChild(chip);
        });
    }

    // ---------- chat ----------
    let chatWith = null;
    let chatPoll = null;
    let lastMsgId = 0;

    function setupChatControls() {
        document.getElementById("addFriendBtn").addEventListener("click", async function () {
            const name = document.getElementById("friendName").value.trim();
            const fid = document.getElementById("friendId").value.trim();
            const msg = document.getElementById("addFriendMsg");
            msg.textContent = "";
            if (!name || !fid) { msg.textContent = "กรอกชื่อและไอดีให้ครบ"; return; }
            const res = await api("/api/friends/add", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ token, username: name, id: fid }),
            });
            if (res.ok && res.data.ok) {
                document.getElementById("friendName").value = "";
                document.getElementById("friendId").value = "";
                msg.className = "composer-msg ok";
                msg.textContent = "เพิ่มเพื่อนสำเร็จ!";
                loadFriends();
            } else {
                msg.className = "composer-msg";
                msg.textContent = res.data.error || "เพิ่มเพื่อนไม่สำเร็จ";
            }
        });

        const sendBtn = document.getElementById("chatSendBtn");
        const input = document.getElementById("chatInput");
        sendBtn.addEventListener("click", sendChat);
        input.addEventListener("keydown", e => { if (e.key === "Enter") sendChat(); });
    }

    async function loadFriends() {
        document.getElementById("myIdLabel").textContent = me.id === 0 ? "ผู้ดูแลระบบ" : ("#" + me.id);
        const res = await api("/api/friends?token=" + encodeURIComponent(token));
        const list = document.getElementById("friendList");
        list.innerHTML = "";
        const friends = res.data.friends || [];
        if (friends.length === 0) {
            list.appendChild(el("div", "feed-loading", "ยังไม่มีเพื่อน เพิ่มด้วยชื่อ + ไอดีด้านบน"));
            return;
        }
        friends.forEach(function (f) {
            const item = el("button", "friend-row");
            item.appendChild(el("div", "avatar sm", initial(f.friend_username)));
            const info = el("div", "friend-row-info");
            info.appendChild(el("span", "friend-row-name", f.friend_username));
            info.appendChild(el("span", "friend-row-id", "#" + f.friend_id));
            item.appendChild(info);
            item.addEventListener("click", () => openChat(f.friend_username, item));
            list.appendChild(item);
        });
    }

    function openChat(username, item) {
        chatWith = username;
        lastMsgId = 0;
        document.querySelectorAll(".friend-row").forEach(r => r.classList.remove("active"));
        if (item) item.classList.add("active");
        document.getElementById("chatTitle").textContent = "คุยกับ " + username;
        const emptyNote = document.getElementById("chatEmpty");
        if (emptyNote) emptyNote.style.display = "none";
        document.getElementById("chatBox").style.display = "";
        document.getElementById("chatMessages").innerHTML = "";
        loadMessages(true);
        startChatPolling();
    }

    async function loadMessages(scroll) {
        if (!chatWith) return;
        const res = await api("/api/messages?token=" + encodeURIComponent(token) + "&with=" + encodeURIComponent(chatWith));
        if (!res.ok || !res.data.messages) return;
        const box = document.getElementById("chatMessages");
        res.data.messages.forEach(function (m) {
            if (m.id <= lastMsgId) return;
            lastMsgId = m.id;
            const cls = m.sender === me.username ? "chat-msg me" : "chat-msg them";
            box.appendChild(el("div", cls, m.content));
        });
        if (scroll) box.scrollTop = box.scrollHeight;
        else box.scrollTop = box.scrollHeight;
    }

    async function sendChat() {
        const input = document.getElementById("chatInput");
        const val = input.value.trim();
        if (!val || !chatWith) return;
        input.value = "";
        const res = await api("/api/messages", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ token, to: chatWith, content: val }),
        });
        if (res.ok && res.data.ok) {
            loadMessages(true);
        }
    }

    function startChatPolling() {
        stopChatPolling();
        chatPoll = setInterval(() => loadMessages(false), 3000);
    }

    function stopChatPolling() {
        if (chatPoll) { clearInterval(chatPoll); chatPoll = null; }
    }

    // ---------- profile ----------
    async function loadProfile() {
        document.getElementById("pfName").textContent = me.username;
        document.getElementById("pfId").textContent = me.id === 0 ? "ผู้ดูแลระบบ" : ("#" + me.id);
        document.getElementById("pfRole").textContent = me.role === "admin" ? "แอดมิน / เจ้าของ" : "สมาชิก";
        document.getElementById("pfAvatar").textContent = initial(me.username);

        const postsRes = await api("/api/posts");
        const novelsRes = await api("/api/novels");
        const myPosts = (postsRes.data.posts || []).filter(p => p.author === me.username);
        const myNovels = (novelsRes.data.novels || []).filter(n => n.author === me.username);

        document.getElementById("pfPostCount").textContent = myPosts.length;
        document.getElementById("pfNovelCount").textContent = myNovels.length;

        const pList = document.getElementById("pfPostList");
        pList.innerHTML = "";
        if (myPosts.length === 0) pList.appendChild(el("div", "feed-loading", "ยังไม่มีโพสต์"));
        else myPosts.forEach(p => pList.appendChild(renderPost(p)));
    }
})();
