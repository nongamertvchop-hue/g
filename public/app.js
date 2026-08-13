// เรือนอักษร — ตรรกะหน้าแพลตฟอร์ม (dashboard)
(function () {
    const token = localStorage.getItem("authToken");
    let me = { username: localStorage.getItem("username") || "", id: null, role: "user" };

    if (!token) {
        window.location.href = "index.html";
        return;
    }

    // ตรวจอุปกรณ์ทันที ไม่ต้องรอโหลดข้อมูล
    setupResponsive();

    // ---------- ตรวจอุปกรณ์ผู้ใช้ แล้วปรับหน้าเว็บอัตโนมัติ ----------
    function detectDevice() {
        const root = document.documentElement;
        const w = window.innerWidth;
        const touch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
        const coarse = window.matchMedia("(pointer: coarse)").matches;

        // iPadOS รุ่นใหม่รายงานตัวเองเป็น Mac จึงต้องดูจากจำนวนจุดสัมผัสร่วมด้วย
        const ua = navigator.userAgent;
        const iPadLike = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
        const phoneUA = /Android.*Mobile|iPhone|iPod|Windows Phone/i.test(ua);

        let kind;
        if (phoneUA || (w < 768 && touch)) kind = "phone";
        else if (iPadLike || (touch && w < 1180)) kind = "tablet";
        else if (w < 1180) kind = "laptop";
        else kind = "desktop";

        root.classList.remove("dev-phone", "dev-tablet", "dev-laptop", "dev-desktop");
        root.classList.add("dev-" + kind);
        root.classList.toggle("is-touch", touch || coarse);
        root.classList.toggle("is-landscape", w > window.innerHeight);

        // ให้ 1vh เท่ากับความสูงจริงของช่องมองเห็น (แก้ปัญหาแถบที่อยู่เว็บบนมือถือ)
        root.style.setProperty("--vh", (window.innerHeight * 0.01) + "px");
        return kind;
    }

    function setupResponsive() {
        detectDevice();
        let t = null;
        const rerun = function () {
            clearTimeout(t);
            t = setTimeout(detectDevice, 120);
        };
        window.addEventListener("resize", rerun);
        window.addEventListener("orientationchange", rerun);
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

    // ใช้ธง is_mine จากเซิร์ฟเวอร์ เพราะชื่อผู้เขียนที่ส่งมาเป็น "นามแฝง" ไม่ใช่ชื่อผู้ใช้จริง
    function canManage(item) {
        if (!item) return false;
        return !!item.is_mine || me.role === "admin";
    }

    // กล่องยืนยันในหน้าเว็บเอง — ไม่ใช้ window.confirm เพราะบางเบราว์เซอร์บล็อก
    function confirmDialog(message, confirmLabel) {
        return new Promise(function (resolve) {
            const overlay = el("div", "modal-overlay");
            const box = el("div", "modal-box");
            box.appendChild(el("p", "modal-text", message));
            const row = el("div", "modal-actions");
            const yes = el("button", "modal-btn danger", confirmLabel || "ลบ");
            const no = el("button", "modal-btn", "ยกเลิก");
            row.appendChild(no);
            row.appendChild(yes);
            box.appendChild(row);
            overlay.appendChild(box);
            document.body.appendChild(overlay);

            function done(val) {
                document.removeEventListener("keydown", onKey);
                overlay.remove();
                resolve(val);
            }
            function onKey(e) {
                if (e.key === "Escape") done(false);
                if (e.key === "Enter") done(true);
            }
            yes.addEventListener("click", () => done(true));
            no.addEventListener("click", () => done(false));
            overlay.addEventListener("click", (e) => { if (e.target === overlay) done(false); });
            document.addEventListener("keydown", onKey);
            yes.focus();
        });
    }

    // แจ้งเตือนแบบ toast — ไม่ใช้ alert
    function toast(message, isError) {
        const t = el("div", "toast" + (isError ? " error" : ""), message);
        document.body.appendChild(t);
        setTimeout(function () { t.classList.add("show"); }, 10);
        setTimeout(function () {
            t.classList.remove("show");
            setTimeout(function () { t.remove(); }, 300);
        }, 2600);
    }

    function initial(name) {
        return (name || "?").replace("#", "").charAt(0).toUpperCase();
    }

    // สร้างวงกลมโปรไฟล์: ถ้ามีรูปให้แสดงรูป ถ้าไม่มีให้แสดงตัวอักษรแรก
    function avatarEl(alias, avatarKey, extraClass, tag) {
        const node = document.createElement(tag || "div");
        node.className = "avatar" + (extraClass ? " " + extraClass : "");
        if (avatarKey) {
            node.classList.add("has-photo");
            node.style.backgroundImage = 'url("/media/' + avatarKey + '")';
            node.textContent = "";
        } else {
            node.textContent = initial(alias);
        }
        return node;
    }

    function paintAvatar(node, alias, avatarKey) {
        if (!node) return;
        if (avatarKey) {
            node.classList.add("has-photo");
            node.style.backgroundImage = 'url("/media/' + avatarKey + '")';
            node.textContent = "";
        } else {
            node.classList.remove("has-photo");
            node.style.backgroundImage = "";
            node.textContent = initial(alias);
        }
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
            me.alias = meRes.data.alias;
            me.avatar = meRes.data.avatar;
            me.id = meRes.data.id;
            me.role = meRes.data.role;
        }

        const ch = initial(me.alias || me.username);
        paintAvatar(document.getElementById("myAvatar"), me.alias, me.avatar);
        document.getElementById("myAvatar").title = me.alias || "";
        paintAvatar(document.getElementById("composerAvatar"), me.alias, me.avatar);

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
        setupMedia();
        setupAria();
        setupNotifications();
        setupGlobal();
        setupMyPanel();
        setupAvatarUpload();
        startHeartbeat();
        setupWrite();
        setupChatControls();
        setupSidebarNav();

        showView("feed");
    });

    // ---------- view router ----------
    const featureViews = ["feed", "global", "live", "videos", "menu",
        "novels", "chat", "write", "profile", "clips", "topup", "aria"];

    function showView(name) {
        featureViews.forEach(function (v) {
            const node = document.getElementById("view-" + v);
            if (node) node.style.display = (v === name) ? "" : "none";
        });

        // แท็บที่มีหน้าเป็นของตัวเอง ที่เหลือถือว่าอยู่ใต้ "แท็บแท็บ"
        const tabMap = { tabFeed: "feed", tabGlobal: "global", tabLive: "live", tabVideos: "videos" };
        let matched = false;
        Object.keys(tabMap).forEach(function (id) {
            const btn = document.getElementById(id);
            if (!btn) return;
            const on = tabMap[id] === name;
            if (on) matched = true;
            btn.classList.toggle("active", on);
        });
        const tabMenu = document.getElementById("tabMenu");
        if (tabMenu) tabMenu.classList.toggle("active", !matched);

        // ปิดการเชื่อมต่อแชทเมื่อออกจากหน้าแชท
        if (name !== "chat") { closeSocket(); stopChatPoll(); }
        if (name !== "global") stopGlobalPoll();
        if (name !== "novels") setReading(false);   // ออกจากหน้านิยาย = หยุดนับเวลาอ่าน

        if (name === "feed") loadPosts();
        if (name === "novels") loadNovels();
        if (name === "chat") loadFriends();
        if (name === "write") loadMyNovels();
        if (name === "profile") loadProfile();
        if (name === "clips") loadClips();
        if (name === "aria") loadAriaHistory();
        if (name === "global") { loadGlobal(true); startGlobalPoll(); }
        if (name === "videos") loadVideos();
    }

    function setupTabs() {
        const map = { tabFeed: "feed", tabGlobal: "global", tabLive: "live", tabVideos: "videos", tabMenu: "menu" };
        Object.keys(map).forEach(function (id) {
            const btn = document.getElementById(id);
            if (btn) btn.addEventListener("click", () => showView(map[id]));
        });
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
        const av = avatarEl(post.author, post.author_avatar, null);
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

        // ปุ่มถูกใจ (ทำงานจริง)
        const likeBtn = el("button", "react-btn like-btn");
        let liked = !!post.liked;
        let count = post.like_count || 0;
        function paintLike() {
            likeBtn.textContent = (liked ? "❤️" : "🤍") + " " + count;
            likeBtn.classList.toggle("liked", liked);
        }
        paintLike();
        likeBtn.addEventListener("click", async function () {
            if (likeBtn.disabled) return;
            likeBtn.disabled = true;
            // อัปเดตหน้าจอทันที แล้วค่อยยืนยันกับเซิร์ฟเวอร์
            const prevLiked = liked, prevCount = count;
            liked = !liked;
            count += liked ? 1 : -1;
            if (count < 0) count = 0;
            paintLike();
            likeBtn.classList.add("pop");
            setTimeout(() => likeBtn.classList.remove("pop"), 300);

            const res = await api("/api/posts/like", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ token, id: post.id }),
            });
            if (res.ok && res.data.ok) {
                liked = res.data.liked;
                count = res.data.like_count;
            } else {
                liked = prevLiked;
                count = prevCount;
                toast(res.data.error || "กดถูกใจไม่สำเร็จ", true);
            }
            paintLike();
            likeBtn.disabled = false;
        });
        footer.appendChild(likeBtn);

        // ปุ่มคอมเมนต์ (เปิด/ปิดกล่องคอมเมนต์)
        const cmtBtn = el("button", "react-btn", "💬 " + (post.comment_count || 0));
        cmtBtn.addEventListener("click", function () { toggleComments(card, post, cmtBtn); });
        footer.appendChild(cmtBtn);

        footer.appendChild(el("button", "react-btn", "🔖 บันทึก"));

        // ปุ่มแชร์ (คัดลอกลิงก์ + นับจำนวน)
        const shareBtn = el("button", "react-btn", "↗️ " + (post.share_count || 0));
        shareBtn.addEventListener("click", async function () {
            const link = location.origin + "/dashboard.html#post-" + post.id;
            let copied = false;
            try {
                await navigator.clipboard.writeText(link);
                copied = true;
            } catch (e) {
                const ta = document.createElement("textarea");
                ta.value = link;
                ta.style.position = "fixed";
                ta.style.opacity = "0";
                document.body.appendChild(ta);
                ta.select();
                try { copied = document.execCommand("copy"); } catch (e2) { copied = false; }
                ta.remove();
            }
            const res = await api("/api/posts/share", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ token, id: post.id }),
            });
            if (res.ok && res.data.ok) {
                post.share_count = res.data.share_count;
                shareBtn.textContent = "↗️ " + res.data.share_count;
            }
            toast(copied ? "คัดลอกลิงก์แล้ว" : "แชร์แล้ว");
        });
        footer.appendChild(shareBtn);

        if (canManage(post)) {
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

    function mediaNode(post) {
        if (!post.media_key) return null;
        const src = "/media/" + post.media_key;
        if (post.media_type === "video") {
            const v = document.createElement("video");
            v.className = "post-media";
            v.src = src;
            v.controls = true;
            v.preload = "metadata";
            v.playsInline = true;
            return v;
        }
        const img = document.createElement("img");
        img.className = "post-media";
        img.src = src;
        img.alt = "รูปภาพประกอบโพสต์";
        img.loading = "lazy";
        return img;
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
        } else if (post.content) {
            body.appendChild(el("p", "post-text", post.content));
        }
        const media = mediaNode(post);
        if (media) body.appendChild(media);
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
                // คงจำนวนถูกใจเดิมไว้ (API แก้ไขไม่ได้ส่งค่านี้กลับมา)
                const updated = res.data.post;
                updated.like_count = post.like_count || 0;
                updated.liked = post.liked || 0;
                card.replaceWith(renderPost(updated));
                toast("บันทึกการแก้ไขแล้ว");
            } else {
                msg.textContent = res.data.error || "แก้ไขไม่สำเร็จ";
            }
        });
    }

    // ---------- คอมเมนต์ ----------
    async function toggleComments(card, post, cmtBtn) {
        const existing = card.querySelector(".comment-box");
        if (existing) { existing.remove(); return; }

        const box = el("div", "comment-box");
        box.appendChild(el("div", "feed-loading", "กำลังโหลดคอมเมนต์..."));
        card.appendChild(box);

        const res = await api("/api/comments?post_id=" + encodeURIComponent(post.id) +
            "&token=" + encodeURIComponent(token));
        box.innerHTML = "";

        const list = el("div", "comment-list");
        box.appendChild(list);

        function refreshCount(n) {
            post.comment_count = n;
            cmtBtn.textContent = "💬 " + n;
        }

        function addRow(c) {
            const row = el("div", "comment-row");
            row.appendChild(avatarEl(c.author, c.author_avatar, "sm"));
            const bodyWrap = el("div", "comment-body");
            const head = el("div", "comment-head");
            head.appendChild(el("span", "comment-author", c.author));
            head.appendChild(el("span", "comment-time", timeAgo(c.created_at)));
            if (canManage(c)) {
                const del = el("button", "comment-del", "ลบ");
                del.addEventListener("click", async function () {
                    const yes = await confirmDialog("ลบคอมเมนต์นี้?", "ลบ");
                    if (!yes) return;
                    const r = await api("/api/comments/delete", {
                        method: "POST", headers: { "content-type": "application/json" },
                        body: JSON.stringify({ token, id: c.id }),
                    });
                    if (r.ok && r.data.ok) {
                        row.remove();
                        refreshCount(Math.max(0, (post.comment_count || 1) - 1));
                        if (!list.children.length) list.appendChild(el("div", "comment-empty", "ยังไม่มีคอมเมนต์"));
                    } else {
                        toast(r.data.error || "ลบไม่สำเร็จ", true);
                    }
                });
                head.appendChild(del);
            }
            bodyWrap.appendChild(head);
            bodyWrap.appendChild(el("p", "comment-text", c.content));
            row.appendChild(bodyWrap);
            list.appendChild(row);
        }

        const comments = (res.data && res.data.comments) || [];
        if (comments.length === 0) list.appendChild(el("div", "comment-empty", "ยังไม่มีคอมเมนต์"));
        else comments.forEach(addRow);
        refreshCount(comments.length);

        // ช่องเขียนคอมเมนต์
        const form = el("div", "comment-form");
        const input = el("input", "comment-input");
        input.type = "text";
        input.placeholder = "เขียนคอมเมนต์...";
        const send = el("button", "comment-send", "ส่ง");
        async function submit() {
            const text = input.value.trim();
            if (!text) return;
            send.disabled = true;
            const r = await api("/api/comments", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ token, post_id: post.id, content: text }),
            });
            send.disabled = false;
            if (r.ok && r.data.ok) {
                input.value = "";
                const empty = list.querySelector(".comment-empty");
                if (empty) empty.remove();
                addRow(r.data.comment);
                refreshCount((post.comment_count || 0) + 1);
            } else {
                toast(r.data.error || "คอมเมนต์ไม่สำเร็จ", true);
            }
        }
        send.addEventListener("click", submit);
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
        form.appendChild(input);
        form.appendChild(send);
        box.appendChild(form);
    }

    async function deletePost(card, post) {
        const yes = await confirmDialog("ต้องการลบโพสต์นี้หรือไม่? การลบไม่สามารถย้อนกลับได้", "ลบโพสต์");
        if (!yes) return;
        const res = await api("/api/posts/delete", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token, id: post.id }),
        });
        if (res.ok && res.data.ok) {
            card.style.opacity = "0";
            setTimeout(function () {
                card.remove();
                const list = document.getElementById("postList");
                if (list && list.children.length === 0) {
                    list.innerHTML = '<div class="feed-loading">ยังไม่มีโพสต์ มาเริ่มเขียนกันเลย!</div>';
                }
            }, 200);
            toast("ลบโพสต์แล้ว");
        } else {
            toast(res.data.error || "ลบไม่สำเร็จ", true);
        }
    }

    async function loadPosts() {
        const list = document.getElementById("postList");
        list.innerHTML = '<div class="feed-loading">กำลังโหลดโพสต์...</div>';
        const res = await api("/api/posts?token=" + encodeURIComponent(token));
        list.innerHTML = "";
        if (!res.ok || !res.data.posts) {
            list.innerHTML = '<div class="feed-loading">โหลดโพสต์ไม่สำเร็จ</div>';
            return;
        }
        // วิดีโอย้ายไปอยู่แท็บ "วิดีโอ" แล้ว ฟีดหลักจึงแสดงเฉพาะข้อความและรูป
        const feedPosts = res.data.posts.filter(p => p.media_type !== "video");
        if (feedPosts.length === 0) {
            list.innerHTML = '<div class="feed-loading">ยังไม่มีโพสต์ มาเริ่มเขียนกันเลย!</div>';
            return;
        }
        feedPosts.forEach(p => list.appendChild(renderPost(p)));
    }

    // ---------- แท็บวิดีโอ ----------
    async function loadVideos() {
        const list = document.getElementById("videoList");
        if (!list) return;
        list.innerHTML = '<div class="feed-loading">กำลังโหลดวิดีโอ...</div>';
        const res = await api("/api/posts?token=" + encodeURIComponent(token));
        if (!res.ok || !res.data.posts) {
            list.innerHTML = '<div class="feed-loading">โหลดวิดีโอไม่สำเร็จ</div>';
            return;
        }
        const videos = res.data.posts.filter(p => p.media_type === "video");
        list.innerHTML = "";
        if (videos.length === 0) {
            list.innerHTML = '<div class="feed-loading">ยังไม่มีใครอัปโหลดวิดีโอ — อัปคลิปแรกได้ที่เมนู "อัปคลิป"</div>';
            return;
        }
        videos.forEach(p => list.appendChild(renderPost(p)));
    }

    let pickedFile = null;

    function showPreview(container, file) {
        container.innerHTML = "";
        container.style.display = "";
        const url = URL.createObjectURL(file);
        let node;
        if (file.type.indexOf("video/") === 0) {
            node = document.createElement("video");
            node.src = url;
            node.controls = true;
            node.playsInline = true;
        } else {
            node = document.createElement("img");
            node.src = url;
            node.alt = "ตัวอย่างไฟล์ที่เลือก";
        }
        node.className = "preview-media";
        const remove = el("button", "preview-remove", "✕ เอาออก");
        remove.addEventListener("click", function () {
            pickedFile = null;
            container.style.display = "none";
            container.innerHTML = "";
            URL.revokeObjectURL(url);
        });
        const info = el("div", "preview-info", file.name + " · " + (file.size / 1048576).toFixed(1) + " MB");
        container.appendChild(node);
        container.appendChild(info);
        container.appendChild(remove);
    }

    // ย่อรูปในเครื่องก่อนอัปโหลด — ประหยัดพื้นที่และโหลดเร็วขึ้น
    // (ข้าม GIF เพราะจะทำให้ภาพเคลื่อนไหวหาย)
    function compressImage(file) {
        return new Promise(function (resolve) {
            if (file.type.indexOf("image/") !== 0 || file.type === "image/gif") return resolve(file);
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = function () {
                const MAX = 1600;
                let w = img.naturalWidth, h = img.naturalHeight;
                if (w > MAX || h > MAX) {
                    if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
                    else { w = Math.round(w * MAX / h); h = MAX; }
                }
                const canvas = document.createElement("canvas");
                canvas.width = w;
                canvas.height = h;
                canvas.getContext("2d").drawImage(img, 0, 0, w, h);
                canvas.toBlob(function (blob) {
                    URL.revokeObjectURL(url);
                    if (!blob || blob.size >= file.size) return resolve(file);
                    resolve(new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }));
                }, "image/jpeg", 0.82);
            };
            img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
            img.src = url;
        });
    }

    async function uploadFile(rawFile) {
        const file = await compressImage(rawFile);
        const fd = new FormData();
        fd.append("token", token);
        fd.append("file", file);
        const res = await fetch("/api/media/upload", { method: "POST", body: fd });
        let data = {};
        try { data = await res.json(); } catch (e) { data = {}; }
        return { ok: res.ok, data };
    }

    async function setupMedia() {
        const status = await api("/api/media/status");
        const enabled = status.ok && status.data.enabled;

        // กล่องโพสต์
        const pickBtn = document.getElementById("btnPickMedia");
        const fileInput = document.getElementById("postFile");
        const preview = document.getElementById("mediaPreview");
        if (enabled && pickBtn) {
            pickBtn.style.display = "";
            pickBtn.addEventListener("click", () => fileInput.click());
            fileInput.addEventListener("change", function () {
                const f = fileInput.files[0];
                fileInput.value = "";
                if (!f) return;
                // โพสต์หลักรับเฉพาะรูปภาพ วิดีโอให้ไปที่เมนู "อัปคลิป"
                if (f.type.indexOf("image/") !== 0) {
                    toast("โพสต์หลักแนบได้เฉพาะรูปภาพ — วิดีโออัปได้ที่เมนู \"อัปคลิป\"", true);
                    return;
                }
                // รูปจะถูกย่ออัตโนมัติก่อนส่ง จึงรับไฟล์ต้นฉบับใหญ่ได้
                pickedFile = f;
                showPreview(preview, f);
            });
        }

        // หน้าอัปคลิป
        const uploader = document.getElementById("clipUploader");
        const disabled = document.getElementById("clipDisabled");
        if (enabled) {
            if (uploader) uploader.style.display = "";
            setupClipUploader();
        } else {
            if (disabled) disabled.style.display = "";
        }
    }

    function setupClipUploader() {
        const pick = document.getElementById("btnPickClip");
        const input = document.getElementById("clipFile");
        const preview = document.getElementById("clipPreview");
        const msg = document.getElementById("clipMsg");
        const upload = document.getElementById("btnUploadClip");
        let clipFile = null;

        pick.addEventListener("click", () => input.click());
        input.addEventListener("change", function () {
            const f = input.files[0];
            input.value = "";
            if (!f) return;
            if (f.size > 20 * 1048576) { msg.className = "composer-msg"; msg.textContent = "ไฟล์ใหญ่เกินไป (จำกัด 20 MB)"; return; }
            clipFile = f;
            msg.textContent = "";
            showPreview(preview, f);
        });

        upload.addEventListener("click", async function () {
            if (!clipFile) { msg.className = "composer-msg"; msg.textContent = "กรุณาเลือกวิดีโอก่อน"; return; }
            upload.disabled = true;
            msg.className = "composer-msg";
            msg.textContent = "กำลังอัปโหลด... กรุณารอสักครู่";
            const up = await uploadFile(clipFile);
            if (!up.ok || !up.data.ok) {
                msg.textContent = up.data.error || "อัปโหลดไม่สำเร็จ";
                upload.disabled = false;
                return;
            }
            const caption = document.getElementById("clipCaption").value.trim();
            const res = await api("/api/posts", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ token, content: caption, media_key: up.data.key, media_type: "video" }),
            });
            upload.disabled = false;
            if (res.ok && res.data.ok) {
                clipFile = null;
                document.getElementById("clipCaption").value = "";
                preview.style.display = "none";
                preview.innerHTML = "";
                msg.className = "composer-msg ok";
                msg.textContent = "อัปโหลดคลิปสำเร็จ!";
                toast("อัปโหลดคลิปสำเร็จ");
                loadClips();
            } else {
                msg.textContent = res.data.error || "บันทึกโพสต์ไม่สำเร็จ";
            }
        });
    }

    async function loadClips() {
        const list = document.getElementById("clipList");
        if (!list) return;
        list.innerHTML = '<div class="feed-loading">กำลังโหลดคลิป...</div>';
        const res = await api("/api/posts?token=" + encodeURIComponent(token));
        const clips = (res.data.posts || []).filter(p => p.media_type === "video");
        list.innerHTML = "";
        if (clips.length === 0) {
            list.innerHTML = '<div class="feed-loading">ยังไม่มีคลิป</div>';
            return;
        }
        clips.forEach(function (p) {
            const card = el("div", "clip-card");
            const v = mediaNode(p);
            if (v) card.appendChild(v);
            card.appendChild(el("div", "clip-caption", p.content || "ไม่มีคำบรรยาย"));
            card.appendChild(el("div", "clip-author", "โดย " + p.author));
            list.appendChild(card);
        });
    }

    function setupComposer() {
        const btn = document.getElementById("btnPost");
        const titleEl = document.getElementById("postTitle");
        const contentEl = document.getElementById("postContent");
        const msg = document.getElementById("composerMsg");
        const preview = document.getElementById("mediaPreview");

        btn.addEventListener("click", async function () {
            const content = contentEl.value.trim();
            const title = titleEl.value.trim();
            msg.className = "composer-msg";
            msg.textContent = "";
            if (!content && !pickedFile) { msg.textContent = "กรุณากรอกเนื้อหา หรือแนบไฟล์ก่อนโพสต์"; return; }

            btn.disabled = true;
            let mediaKey = null, mediaType = null;
            if (pickedFile) {
                msg.textContent = "กำลังอัปโหลดไฟล์...";
                const up = await uploadFile(pickedFile);
                if (!up.ok || !up.data.ok) {
                    msg.textContent = up.data.error || "อัปโหลดไฟล์ไม่สำเร็จ";
                    btn.disabled = false;
                    return;
                }
                mediaKey = up.data.key;
                mediaType = up.data.media_type;
                msg.textContent = "";
            }

            const res = await api("/api/posts", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ token, title, content, media_key: mediaKey, media_type: mediaType }),
            });
            btn.disabled = false;
            if (res.ok && res.data.ok) {
                contentEl.value = "";
                titleEl.value = "";
                pickedFile = null;
                if (preview) { preview.style.display = "none"; preview.innerHTML = ""; }
                const list = document.getElementById("postList");
                const empty = list.querySelector(".feed-loading");
                if (empty) list.innerHTML = "";
                list.insertBefore(renderPost(res.data.post), list.firstChild);
                toast("โพสต์เรียบร้อย");
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
        const res = await api("/api/novels/get?id=" + encodeURIComponent(id) + "&token=" + encodeURIComponent(token));
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

        // ปุ่มเปิดแจ้งเตือนเมื่อมีตอนใหม่
        const followBtn = el("button", "follow-btn");
        let following = !!novel.following;
        let followers = novel.follower_count || 0;
        function paintFollow() {
            followBtn.textContent = (following ? "🔔 เปิดแจ้งเตือนอยู่" : "🔕 เปิดแจ้งเตือนตอนใหม่") +
                (followers ? " · " + followers : "");
            followBtn.classList.toggle("on", following);
        }
        paintFollow();
        followBtn.addEventListener("click", async function () {
            followBtn.disabled = true;
            const r = await api("/api/novels/follow", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ token, id: novel.id }),
            });
            followBtn.disabled = false;
            if (r.ok && r.data.ok) {
                following = r.data.following;
                followers = r.data.follower_count;
                paintFollow();
                toast(following ? "จะแจ้งเตือนเมื่อมีตอนใหม่" : "ปิดแจ้งเตือนแล้ว");
            } else toast(r.data.error || "ทำรายการไม่สำเร็จ", true);
        });
        meta.appendChild(followBtn);

        if (canManage(novel)) {
            const del = el("button", "react-btn manage danger", "🗑️ ลบนิยาย");
            del.addEventListener("click", async function () {
                const yes = await confirmDialog("ลบนิยายทั้งเรื่อง รวมทุกตอน? การลบไม่สามารถย้อนกลับได้", "ลบนิยาย");
                if (!yes) return;
                const r = await api("/api/novels/delete", {
                    method: "POST", headers: { "content-type": "application/json" },
                    body: JSON.stringify({ token, id: novel.id }),
                });
                if (r.ok && r.data.ok) { toast("ลบนิยายแล้ว"); loadNovels(); }
                else toast(r.data.error || "ลบไม่สำเร็จ", true);
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

        // เริ่มนับเวลาอ่าน + บันทึกว่าอ่านตอนนี้แล้ว (ครั้งแรกได้เหรียญ)
        setReading(true);
        api("/api/read", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ token, novel_id: novel.id, chapter_id: c.id }),
        }).then(function (r) {
            if (r.ok && r.data.ok && r.data.first_time) toast("อ่านตอนใหม่ +1 🪙");
        });

        const back = el("button", "back-btn", "← สารบัญ");
        back.addEventListener("click", () => { setReading(false); renderChapterList(wrap, novel); });
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
        const mine = (res.data.novels || []).filter(n => n.is_mine);
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

    // ---------- chat (เรียลไทม์ผ่าน WebSocket + fallback polling) ----------
    let chatWith = null;
    let chatPoll = null;
    let chatSocket = null;
    let reconnectTimer = null;
    let lastMsgId = 0;

    function setupChatControls() {
        document.getElementById("addFriendBtn").addEventListener("click", async function () {
            const aliasVal = document.getElementById("friendName").value.trim();
            const msg = document.getElementById("addFriendMsg");
            msg.textContent = "";
            if (!aliasVal) { msg.textContent = "กรอกนามแฝงของเพื่อน"; return; }
            const res = await api("/api/friends/add", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ token, alias: aliasVal }),
            });
            if (res.ok && res.data.ok) {
                document.getElementById("friendName").value = "";
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
        document.getElementById("myIdLabel").textContent = me.alias || "—";
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
            item.appendChild(el("div", "avatar sm", initial((f.alias || "?").replace("#", ""))));
            const info = el("div", "friend-row-info");
            info.appendChild(el("span", "friend-row-name", f.alias));
            if (f.real_username) info.appendChild(el("span", "friend-row-id", "🔑 " + f.real_username));
            item.appendChild(info);
            item.addEventListener("click", () => openChat(f.alias, item));
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
        loadMessages(true).then(connectSocket);
    }

    async function loadMessages(scroll) {
        if (!chatWith) return;
        const res = await api("/api/messages?token=" + encodeURIComponent(token) + "&with=" + encodeURIComponent(chatWith));
        if (!res.ok || !res.data.messages) return;
        res.data.messages.forEach(function (m) {
            if (m.id <= lastMsgId) return;
            lastMsgId = m.id;
            appendMsg(m);
        });
    }

    function appendMsg(m) {
        const box = document.getElementById("chatMessages");
        const cls = m.mine ? "chat-msg me" : "chat-msg them";
        box.appendChild(el("div", cls, m.content));
        box.scrollTop = box.scrollHeight;
    }

    function connectSocket() {
        closeSocket();
        const who = chatWith;
        if (!who) return;
        try {
            const proto = location.protocol === "https:" ? "wss:" : "ws:";
            const ws = new WebSocket(proto + "//" + location.host + "/api/ws?token=" +
                encodeURIComponent(token) + "&with=" + encodeURIComponent(who));
            chatSocket = ws;
            ws.onopen = function () { stopChatPoll(); };
            ws.onmessage = function (ev) {
                let d;
                try { d = JSON.parse(ev.data); } catch (e) { return; }
                if (d.type === "message" && d.message && chatWith === who) {
                    const m = d.message;
                    if (m.id > lastMsgId) { lastMsgId = m.id; appendMsg(m); }
                }
            };
            ws.onclose = function () {
                if (chatSocket === ws) chatSocket = null;
                if (chatWith === who) { startChatPoll(); scheduleReconnect(who); }
            };
            ws.onerror = function () { try { ws.close(); } catch (e) { /* ignore */ } };
        } catch (e) {
            startChatPoll();
        }
    }

    function scheduleReconnect(who) {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(function () {
            if (chatWith === who) connectSocket();
        }, 4000);
    }

    function closeSocket() {
        if (chatSocket) {
            try { chatSocket.onclose = null; chatSocket.close(); } catch (e) { /* ignore */ }
            chatSocket = null;
        }
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    }

    async function sendChat() {
        const input = document.getElementById("chatInput");
        const val = input.value.trim();
        if (!val || !chatWith) return;
        input.value = "";
        if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
            chatSocket.send(JSON.stringify({ to: chatWith, content: val }));
        } else {
            const res = await api("/api/messages", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ token, to: chatWith, content: val }),
            });
            if (res.ok && res.data.ok) loadMessages(true);
        }
    }

    function startChatPoll() {
        stopChatPoll();
        chatPoll = setInterval(() => loadMessages(false), 3000);
    }

    function stopChatPoll() {
        if (chatPoll) { clearInterval(chatPoll); chatPoll = null; }
    }

    // ---------- ระบบครอปรูปโปรไฟล์ ----------
    const CROP_OUT = 400;    // ขนาดรูปที่บันทึกจริง (กรอบบนจอวัดจาก CSS เพื่อรองรับทุกอุปกรณ์)

    function openCropper(file) {
        const url = URL.createObjectURL(file);
        const img = new Image();

        img.onerror = function () {
            URL.revokeObjectURL(url);
            toast("เปิดไฟล์รูปไม่ได้ ลองไฟล์อื่นนะ", true);
        };

        img.onload = function () {
            const overlay = el("div", "modal-overlay");
            const box = el("div", "modal-box cropper-box");
            box.appendChild(el("p", "cropper-title", "ปรับขนาดและตำแหน่งรูป"));
            box.appendChild(el("p", "cropper-hint", "ลากรูปเพื่อเลื่อน · ใช้แถบเลื่อนหรือหมุนล้อเมาส์เพื่อย่อ-ขยาย"));

            const stage = el("div", "crop-stage");
            const canvasImg = document.createElement("img");
            canvasImg.className = "crop-img";
            canvasImg.src = url;
            canvasImg.draggable = false;
            stage.appendChild(canvasImg);
            stage.appendChild(el("div", "crop-ring"));
            box.appendChild(stage);

            const zoomRow = el("div", "crop-zoom");
            zoomRow.appendChild(el("span", null, "🔍"));
            const zoom = document.createElement("input");
            zoom.type = "range";
            zoom.min = "100";
            zoom.max = "400";
            zoom.value = "100";
            zoomRow.appendChild(zoom);
            box.appendChild(zoomRow);

            const msg = el("div", "composer-msg");
            box.appendChild(msg);

            const actions = el("div", "modal-actions");
            const cancel = el("button", "modal-btn", "ยกเลิก");
            const save = el("button", "modal-btn primary", "บันทึกรูป");
            actions.appendChild(cancel);
            actions.appendChild(save);
            box.appendChild(actions);
            overlay.appendChild(box);
            document.body.appendChild(overlay);

            // วัดขนาดกรอบจริงจาก CSS (เปลี่ยนตามขนาดหน้าจอ)
            let CROP_BOX = Math.round(stage.getBoundingClientRect().width) || 280;

            // ขนาดฐาน: ย่อ/ขยายให้รูปคลุมกรอบครอปพอดี
            const natW = img.naturalWidth, natH = img.naturalHeight;
            let baseScale = Math.max(CROP_BOX / natW, CROP_BOX / natH);
            let zoomFactor = 1;
            let offX = 0, offY = 0;   // ตำแหน่งมุมซ้ายบนของรูป เทียบกับกรอบครอป

            function scale() { return baseScale * zoomFactor; }

            function clamp() {
                const w = natW * scale(), h = natH * scale();
                const minX = CROP_BOX - w, minY = CROP_BOX - h;
                if (offX > 0) offX = 0;
                if (offY > 0) offY = 0;
                if (offX < minX) offX = minX;
                if (offY < minY) offY = minY;
            }

            // ถ้าหมุนจอหรือเปลี่ยนขนาดหน้าต่าง ให้คำนวณกรอบใหม่โดยคงสัดส่วนเดิม
            function onResize() {
                const next = Math.round(stage.getBoundingClientRect().width);
                if (!next || next === CROP_BOX) return;
                const ratio = next / CROP_BOX;
                CROP_BOX = next;
                baseScale = Math.max(CROP_BOX / natW, CROP_BOX / natH);
                offX *= ratio;
                offY *= ratio;
                paint();
            }
            window.addEventListener("resize", onResize);
            window.addEventListener("orientationchange", onResize);

            function paint() {
                clamp();
                canvasImg.style.width = (natW * scale()) + "px";
                canvasImg.style.height = (natH * scale()) + "px";
                canvasImg.style.transform = "translate(" + offX + "px," + offY + "px)";
            }

            // จัดกึ่งกลางตอนเริ่ม
            offX = (CROP_BOX - natW * scale()) / 2;
            offY = (CROP_BOX - natH * scale()) / 2;
            paint();

            zoom.addEventListener("input", function () {
                const prev = scale();
                zoomFactor = Number(zoom.value) / 100;
                // ซูมโดยยึดจุดกึ่งกลางกรอบไว้
                const ratio = scale() / prev;
                offX = CROP_BOX / 2 - (CROP_BOX / 2 - offX) * ratio;
                offY = CROP_BOX / 2 - (CROP_BOX / 2 - offY) * ratio;
                paint();
            });

            stage.addEventListener("wheel", function (e) {
                e.preventDefault();
                const step = e.deltaY < 0 ? 10 : -10;
                zoom.value = String(Math.min(400, Math.max(100, Number(zoom.value) + step)));
                zoom.dispatchEvent(new Event("input"));
            }, { passive: false });

            // ลากเลื่อน (รองรับทั้งเมาส์และนิ้ว)
            let dragging = false, startX = 0, startY = 0, startOffX = 0, startOffY = 0;
            function down(e) {
                dragging = true;
                const p = e.touches ? e.touches[0] : e;
                startX = p.clientX; startY = p.clientY;
                startOffX = offX; startOffY = offY;
                stage.classList.add("dragging");
            }
            function move(e) {
                if (!dragging) return;
                const p = e.touches ? e.touches[0] : e;
                offX = startOffX + (p.clientX - startX);
                offY = startOffY + (p.clientY - startY);
                paint();
                if (e.cancelable) e.preventDefault();
            }
            function up() { dragging = false; stage.classList.remove("dragging"); }

            stage.addEventListener("mousedown", down);
            window.addEventListener("mousemove", move);
            window.addEventListener("mouseup", up);
            stage.addEventListener("touchstart", down, { passive: true });
            stage.addEventListener("touchmove", move, { passive: false });
            stage.addEventListener("touchend", up);

            function cleanup() {
                window.removeEventListener("mousemove", move);
                window.removeEventListener("mouseup", up);
                window.removeEventListener("resize", onResize);
                window.removeEventListener("orientationchange", onResize);
                URL.revokeObjectURL(url);
                overlay.remove();
            }

            cancel.addEventListener("click", cleanup);
            overlay.addEventListener("click", (e) => { if (e.target === overlay) cleanup(); });

            save.addEventListener("click", async function () {
                save.disabled = true;
                cancel.disabled = true;
                msg.className = "composer-msg";
                msg.textContent = "กำลังบันทึก...";

                try {
                    // แปลงพิกัดบนจอกลับไปเป็นพิกัดในรูปต้นฉบับ
                    const s = scale();
                    const srcX = -offX / s;
                    const srcY = -offY / s;
                    const srcSize = CROP_BOX / s;

                    const canvas = document.createElement("canvas");
                    canvas.width = CROP_OUT;
                    canvas.height = CROP_OUT;
                    const ctx = canvas.getContext("2d");
                    ctx.imageSmoothingQuality = "high";
                    ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, CROP_OUT, CROP_OUT);

                    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.9));
                    if (!blob) throw new Error("แปลงรูปไม่สำเร็จ");

                    const fd = new FormData();
                    fd.append("token", token);
                    fd.append("file", new File([blob], "avatar.jpg", { type: "image/jpeg" }));
                    const upRes = await fetch("/api/media/upload", { method: "POST", body: fd });
                    const up = await upRes.json();
                    if (!upRes.ok || !up.ok) throw new Error(up.error || "อัปโหลดไม่สำเร็จ");

                    const setRes = await api("/api/avatar", {
                        method: "POST", headers: { "content-type": "application/json" },
                        body: JSON.stringify({ token, media_key: up.key }),
                    });
                    if (!setRes.ok || !setRes.data.ok) throw new Error(setRes.data.error || "บันทึกรูปไม่สำเร็จ");

                    me.avatar = up.key;
                    paintAvatar(document.getElementById("myAvatar"), me.alias, me.avatar);
                    paintAvatar(document.getElementById("composerAvatar"), me.alias, me.avatar);
                    paintAvatar(document.getElementById("pfAvatar"), me.alias, me.avatar);
                    cleanup();
                    toast("เปลี่ยนรูปโปรไฟล์แล้ว");
                } catch (err) {
                    msg.textContent = String(err.message || err);
                    save.disabled = false;
                    cancel.disabled = false;
                }
            });
        };

        img.src = url;
    }

    // หน้าต่างตัวเลือกเมื่อกดรูปโปรไฟล์ในหน้าโปรไฟล์
    function openAvatarMenu() {
        const overlay = el("div", "modal-overlay");
        const box = el("div", "modal-box avatar-menu");
        box.appendChild(el("p", "cropper-title", "รูปโปรไฟล์"));

        const preview = avatarEl(me.alias, me.avatar, "avatar-menu-preview");
        box.appendChild(preview);

        const list = el("div", "avatar-menu-list");

        const viewBtn = el("button", "avatar-menu-item", "🖼️  ดูรูปภาพ");
        viewBtn.addEventListener("click", function () {
            overlay.remove();
            if (me.avatar) openImageViewer("/media/" + me.avatar);
            else toast("ยังไม่มีรูปโปรไฟล์ ลองอัปโหลดดูสิ");
        });
        list.appendChild(viewBtn);

        const editBtn = el("button", "avatar-menu-item", "✏️  แก้ไขรูปภาพ");
        editBtn.addEventListener("click", function () {
            overlay.remove();
            const picker = document.getElementById("avatarFile");
            picker.click();
        });
        list.appendChild(editBtn);

        if (me.avatar) {
            const delBtn = el("button", "avatar-menu-item danger", "🗑️  ลบรูปภาพ");
            delBtn.addEventListener("click", async function () {
                overlay.remove();
                const yes = await confirmDialog("ลบรูปโปรไฟล์ออกหรือไม่?", "ลบรูป");
                if (!yes) return;
                const r = await api("/api/avatar", {
                    method: "POST", headers: { "content-type": "application/json" },
                    body: JSON.stringify({ token, media_key: null }),
                });
                if (r.ok && r.data.ok) {
                    me.avatar = null;
                    paintAvatar(document.getElementById("myAvatar"), me.alias, null);
                    paintAvatar(document.getElementById("composerAvatar"), me.alias, null);
                    paintAvatar(document.getElementById("pfAvatar"), me.alias, null);
                    toast("ลบรูปโปรไฟล์แล้ว");
                } else toast(r.data.error || "ลบไม่สำเร็จ", true);
            });
            list.appendChild(delBtn);
        }

        box.appendChild(list);
        const actions = el("div", "modal-actions");
        const close = el("button", "modal-btn", "ปิด");
        close.addEventListener("click", () => overlay.remove());
        actions.appendChild(close);
        box.appendChild(actions);

        overlay.appendChild(box);
        document.body.appendChild(overlay);
        overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    }

    function openImageViewer(src) {
        const overlay = el("div", "modal-overlay image-viewer");
        const img = document.createElement("img");
        img.className = "viewer-img";
        img.src = src;
        img.alt = "รูปโปรไฟล์";
        overlay.appendChild(img);
        const hint = el("div", "viewer-hint", "กดที่ใดก็ได้เพื่อปิด");
        overlay.appendChild(hint);
        document.body.appendChild(overlay);
        overlay.addEventListener("click", () => overlay.remove());
    }

    function setupAvatarUpload() {
        const picker = document.getElementById("avatarFile");
        const pfAvatar = document.getElementById("pfAvatar");
        if (!picker || !pfAvatar) return;

        pfAvatar.style.cursor = "pointer";
        pfAvatar.title = "กดเพื่อดูหรือแก้ไขรูปโปรไฟล์";
        pfAvatar.addEventListener("click", openAvatarMenu);

        picker.addEventListener("change", function () {
            const f = picker.files[0];
            picker.value = "";
            if (!f) return;
            if (f.type.indexOf("image/") !== 0) { toast("กรุณาเลือกไฟล์รูปภาพ", true); return; }
            if (f.size > 15 * 1048576) { toast("ไฟล์ใหญ่เกินไป (จำกัด 15 MB)", true); return; }
            openCropper(f);
        });
    }

    // ---------- หน้าต่างโปรไฟล์ลอย (กดที่รูปโปรไฟล์) ----------
    function fmtDuration(sec) {
        const s = Math.max(0, Math.floor(sec || 0));
        const h = Math.floor(s / 3600);
        const mnt = Math.floor((s % 3600) / 60);
        if (h > 0) return h + " ชม. " + mnt + " นาที";
        if (mnt > 0) return mnt + " นาที";
        return s + " วินาที";
    }

    function setupMyPanel() {
        const av = document.getElementById("myAvatar");
        const panel = document.getElementById("myPanel");
        if (!av || !panel) return;

        av.style.cursor = "pointer";
        av.addEventListener("click", function (e) {
            e.stopPropagation();
            if (panel.style.display === "none") {
                panel.style.display = "";
                loadMyStats();
            } else {
                panel.style.display = "none";
            }
        });
        document.addEventListener("click", function (e) {
            if (panel.style.display !== "none" && !panel.contains(e.target) && e.target !== av) {
                panel.style.display = "none";
            }
        });
        const goProfile = document.getElementById("myPanelProfile");
        if (goProfile) goProfile.addEventListener("click", function () {
            panel.style.display = "none";
            showView("profile");
        });
    }

    async function loadMyStats() {
        const body = document.getElementById("myPanelBody");
        body.innerHTML = '<div class="feed-loading">กำลังโหลด...</div>';
        const res = await api("/api/mystats?token=" + encodeURIComponent(token));
        if (!res.ok || !res.data.ok) {
            body.innerHTML = '<div class="feed-loading">โหลดข้อมูลไม่สำเร็จ</div>';
            return;
        }
        const s = res.data.stats;
        body.innerHTML = "";

        const head = el("div", "mp-head");
        head.appendChild(avatarEl(s.alias, s.avatar, "mp-avatar"));
        const idBox = el("div", "mp-id");
        idBox.appendChild(el("span", "mp-alias", s.alias));
        const status = el("span", "mp-status" + (s.online ? " online" : ""));
        status.appendChild(el("span", "mp-dot"));
        status.appendChild(document.createTextNode(s.online ? "ออนไลน์" : "ออฟไลน์"));
        idBox.appendChild(status);
        if (s.role === "admin") idBox.appendChild(el("span", "mp-role", "แอดมิน / เจ้าของ"));
        head.appendChild(idBox);
        body.appendChild(head);

        const coinRow = el("div", "mp-coins");
        coinRow.appendChild(el("span", "mp-coin-icon", "🪙"));
        coinRow.appendChild(el("b", null, String(s.coins)));
        coinRow.appendChild(document.createTextNode(" เหรียญ"));
        body.appendChild(coinRow);

        const grid = el("div", "mp-grid");
        [
            ["📚", "นิยายที่อ่านไป", s.novels_read + " เรื่อง"],
            ["📖", "ตอนที่อ่านไป", s.chapters_read + " ตอน"],
            ["⏳", "เวลาที่อ่านนิยาย", fmtDuration(s.read_seconds)],
            ["🕒", "เวลาที่อยู่ในเว็บ", fmtDuration(s.site_seconds)],
        ].forEach(function (row) {
            const item = el("div", "mp-item");
            item.appendChild(el("span", "mp-item-icon", row[0]));
            const t = el("div", "mp-item-text");
            t.appendChild(el("span", "mp-item-label", row[1]));
            t.appendChild(el("span", "mp-item-value", row[2]));
            item.appendChild(t);
            grid.appendChild(item);
        });
        body.appendChild(grid);
    }

    // ---------- นับเวลาอยู่ในเว็บ / เวลาอ่านนิยาย ----------
    let hbTimer = null;
    let readingNow = false;
    const HB_SECONDS = 30;

    function setReading(on) { readingNow = !!on; }

    function startHeartbeat() {
        if (hbTimer) return;
        hbTimer = setInterval(async function () {
            if (document.hidden) return;   // ไม่นับตอนสลับแท็บไปทำอย่างอื่น
            await api("/api/heartbeat", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ token, seconds: HB_SECONDS, reading: readingNow }),
            });
        }, HB_SECONDS * 1000);
    }

    // ---------- แชทโลก ----------
    let globalLastId = 0;
    let globalPoll = null;

    function setupGlobal() {
        const input = document.getElementById("globalText");
        const send = document.getElementById("globalSend");
        if (!input || !send) return;
        send.addEventListener("click", sendGlobal);
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") sendGlobal(); });
    }

    function globalRow(m) {
        const row = el("div", "gm-row" + (m.mine ? " mine" : ""));
        // คนส่งจะไม่เห็นโปรไฟล์ของตัวเอง แต่เห็นของคนอื่นและกดดูได้
        if (!m.mine) {
            const av = avatarEl(m.alias, m.avatar, "sm gm-avatar", "button");
            av.title = "ดูโปรไฟล์ " + m.alias;
            av.addEventListener("click", () => openProfileCard(m.alias));
            row.appendChild(av);
        }
        const bubble = el("div", "gm-bubble");
        if (!m.mine) {
            const name = el("button", "gm-alias", m.alias);
            name.addEventListener("click", () => openProfileCard(m.alias));
            bubble.appendChild(name);
        }
        bubble.appendChild(el("div", "gm-text", m.content));
        bubble.appendChild(el("div", "gm-time", timeAgo(m.created_at)));
        row.appendChild(bubble);
        return row;
    }

    function appendGlobal(list) {
        const box = document.getElementById("globalWindow");
        const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
        list.forEach(function (m) {
            if (m.id <= globalLastId) return;
            globalLastId = m.id;
            box.appendChild(globalRow(m));
        });
        if (nearBottom) box.scrollTop = box.scrollHeight;
    }

    async function loadGlobal(initial) {
        const box = document.getElementById("globalWindow");
        const res = await api("/api/global?token=" + encodeURIComponent(token) +
            (initial ? "" : "&since=" + globalLastId));
        if (!res.ok || !res.data.ok) {
            if (initial) box.innerHTML = '<div class="feed-loading">โหลดแชทไม่สำเร็จ</div>';
            return;
        }
        const msgs = res.data.messages || [];
        if (initial) {
            box.innerHTML = "";
            globalLastId = 0;
            if (!msgs.length) box.appendChild(el("div", "feed-loading", "ยังไม่มีใครพิมพ์ มาเริ่มทักทายกันเลย!"));
        }
        if (msgs.length) {
            const empty = box.querySelector(".feed-loading");
            if (empty) empty.remove();
        }
        appendGlobal(msgs);
    }

    async function sendGlobal() {
        const input = document.getElementById("globalText");
        const btn = document.getElementById("globalSend");
        const text = input.value.trim();
        if (!text) return;
        btn.disabled = true;
        const res = await api("/api/global", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ token, content: text }),
        });
        btn.disabled = false;
        if (res.ok && res.data.ok) {
            input.value = "";
            const box = document.getElementById("globalWindow");
            const empty = box.querySelector(".feed-loading");
            if (empty) empty.remove();
            appendGlobal([res.data.message]);
            if (res.data.censored) toast("ข้อความมีคำไม่เหมาะสม ระบบเซ็นเซอร์ให้แล้ว", true);
        } else {
            toast(res.data.error || "ส่งข้อความไม่สำเร็จ", true);
        }
    }

    function startGlobalPoll() {
        stopGlobalPoll();
        globalPoll = setInterval(() => loadGlobal(false), 4000);
    }

    function stopGlobalPoll() {
        if (globalPoll) { clearInterval(globalPoll); globalPoll = null; }
    }

    // ---------- การ์ดโปรไฟล์สาธารณะ ----------
    async function openProfileCard(alias) {
        const res = await api("/api/profile?token=" + encodeURIComponent(token) +
            "&alias=" + encodeURIComponent(alias));
        if (!res.ok || !res.data.ok) { toast(res.data.error || "เปิดโปรไฟล์ไม่สำเร็จ", true); return; }
        const p = res.data.profile;

        const overlay = el("div", "modal-overlay");
        const box = el("div", "modal-box profile-card-modal");
        const pav = avatarEl(p.alias, p.avatar, "profile-avatar");
        if (p.avatar) {
            pav.style.cursor = "zoom-in";
            pav.title = "ดูรูปเต็ม";
            pav.addEventListener("click", () => openImageViewer("/media/" + p.avatar));
        }
        box.appendChild(pav);
        box.appendChild(el("h3", "profile-name", p.alias));
        const st = el("span", "mp-status" + (p.online ? " online" : ""));
        st.appendChild(el("span", "mp-dot"));
        st.appendChild(document.createTextNode(p.online ? "ออนไลน์" : "ออฟไลน์"));
        box.appendChild(st);
        if (p.role === "admin") box.appendChild(el("span", "profile-badge", "ผู้ดูแลระบบ"));
        const stats = el("div", "profile-stats");
        [["โพสต์", p.posts], ["นิยาย", p.novels], ["หัวใจที่ได้รับ", p.likes_received]].forEach(function (s) {
            const item = el("span");
            item.appendChild(el("b", null, String(s[1])));
            item.appendChild(document.createTextNode(" " + s[0]));
            stats.appendChild(item);
        });
        box.appendChild(stats);
        if (p.username) {
            box.appendChild(el("p", "admin-reveal", "🔑 ชื่อผู้ใช้จริง (เห็นเฉพาะแอดมิน): " + p.username));
        }
        const close = el("button", "modal-btn", "ปิด");
        const row = el("div", "modal-actions");
        row.appendChild(close);
        box.appendChild(row);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        close.addEventListener("click", () => overlay.remove());
        overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    }

    // ---------- การแจ้งเตือน (กระดิ่ง) ----------
    let notifPoll = null;

    function notifIcon(type) {
        if (type === "message") return "💬";
        if (type === "announce") return "📢";
        if (type === "chapter") return "📖";
        return "🔔";
    }

    function setupNotifications() {
        const bell = document.getElementById("bellBtn");
        const panel = document.getElementById("notifPanel");
        if (!bell || !panel) return;

        bell.addEventListener("click", function (e) {
            e.stopPropagation();
            if (panel.style.display === "none") {
                panel.style.display = "";
                loadNotifications();
            } else {
                panel.style.display = "none";
            }
        });

        // คลิกที่อื่นเพื่อปิด
        document.addEventListener("click", function (e) {
            if (panel.style.display !== "none" && !panel.contains(e.target) && e.target !== bell) {
                panel.style.display = "none";
            }
        });

        document.getElementById("notifReadAll").addEventListener("click", async function () {
            await api("/api/notifications/read-all", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ token }),
            });
            loadNotifications();
            refreshBadge();
        });

        // ฟอร์มส่งประกาศ (เฉพาะแอดมิน)
        const announceBtn = document.getElementById("notifAnnounce");
        const form = document.getElementById("announceForm");
        if (me.role === "admin" && announceBtn) {
            announceBtn.style.display = "";
            announceBtn.addEventListener("click", function () {
                form.style.display = form.style.display === "none" ? "" : "none";
            });
            document.getElementById("announceCancel").addEventListener("click", function () {
                form.style.display = "none";
            });
            document.getElementById("announceSend").addEventListener("click", async function () {
                const title = document.getElementById("announceTitle").value.trim();
                const body = document.getElementById("announceBody").value.trim();
                if (!title) { toast("กรุณากรอกหัวข้อประกาศ", true); return; }
                const btn = document.getElementById("announceSend");
                btn.disabled = true;
                const r = await api("/api/notifications/announce", {
                    method: "POST", headers: { "content-type": "application/json" },
                    body: JSON.stringify({ token, title, body }),
                });
                btn.disabled = false;
                if (r.ok && r.data.ok) {
                    document.getElementById("announceTitle").value = "";
                    document.getElementById("announceBody").value = "";
                    form.style.display = "none";
                    toast("ส่งประกาศถึงสมาชิก " + r.data.sent + " คนแล้ว");
                    loadNotifications();
                    refreshBadge();
                } else toast(r.data.error || "ส่งประกาศไม่สำเร็จ", true);
            });
        }

        refreshBadge();
        notifPoll = setInterval(refreshBadge, 45000);
    }

    async function refreshBadge() {
        const res = await api("/api/notifications?token=" + encodeURIComponent(token));
        if (!res.ok || !res.data.ok) return;
        const badge = document.getElementById("bellBadge");
        const n = res.data.unread || 0;
        if (n > 0) {
            badge.textContent = n > 99 ? "99+" : n;
            badge.style.display = "";
        } else {
            badge.style.display = "none";
        }
    }

    async function loadNotifications() {
        const list = document.getElementById("notifList");
        list.innerHTML = '<div class="feed-loading">กำลังโหลด...</div>';
        const res = await api("/api/notifications?token=" + encodeURIComponent(token));
        const items = (res.data && res.data.notifications) || [];
        list.innerHTML = "";
        if (!items.length) {
            list.appendChild(el("div", "notif-empty", "ยังไม่มีการแจ้งเตือน"));
            return;
        }
        items.forEach(function (n) {
            const row = el("button", "notif-item" + (n.is_read ? "" : " unread"));
            row.appendChild(el("span", "notif-icon", notifIcon(n.type)));
            const main = el("span", "notif-main");
            main.appendChild(el("span", "notif-item-title", n.title));
            if (n.body) main.appendChild(el("span", "notif-body", n.body));
            main.appendChild(el("span", "notif-time", timeAgo(n.created_at)));
            row.appendChild(main);
            if (!n.is_read) row.appendChild(el("span", "notif-dot"));

            row.addEventListener("click", async function () {
                if (!n.is_read) {
                    await api("/api/notifications/read", {
                        method: "POST", headers: { "content-type": "application/json" },
                        body: JSON.stringify({ token, id: n.id }),
                    });
                    row.classList.remove("unread");
                    const dot = row.querySelector(".notif-dot");
                    if (dot) dot.remove();
                    refreshBadge();
                }
                document.getElementById("notifPanel").style.display = "none";
                // พาไปยังหน้าที่เกี่ยวข้อง
                if (n.link && n.link.indexOf("chat:") === 0) {
                    showView("chat");
                    setTimeout(function () { openChat(n.link.slice(5), null); }, 400);
                } else if (n.link && n.link.indexOf("novel:") === 0) {
                    showView("novels");
                    setTimeout(function () { openNovel(n.link.slice(6)); }, 400);
                }
            });
            list.appendChild(row);
        });
    }

    // ---------- อาเรีย (AI) ----------
    let ariaBusy = false;
    let ariaLoaded = false;
    let ariaConvId = null;

    function fmtDateTime(iso) {
        if (!iso) return "";
        const t = Date.parse(String(iso).replace(" ", "T") + "Z");
        if (isNaN(t)) return "";
        return new Date(t).toLocaleString("th-TH", {
            day: "numeric", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit",
        });
    }

    // เปิดบทสนทนาล่าสุดเมื่อเข้าหน้าอาเรียครั้งแรก
    async function loadAriaHistory() {
        if (ariaLoaded) return;
        ariaLoaded = true;
        const res = await api("/api/aria/conversations?token=" + encodeURIComponent(token));
        const list = (res.data && res.data.conversations) || [];
        if (list.length > 0) openConversation(list[0].id);
    }

    async function openConversation(id) {
        const box = document.getElementById("ariaMessages");
        if (!box) return;
        closeAriaPanes();
        const res = await api("/api/aria/conversation?token=" + encodeURIComponent(token) + "&id=" + encodeURIComponent(id));
        if (!res.ok || !res.data.ok) { toast(res.data.error || "เปิดบทสนทนาไม่สำเร็จ", true); return; }
        ariaConvId = res.data.conversation.id;
        box.innerHTML = "";
        (res.data.messages || []).forEach(function (m) { box.appendChild(ariaBubble(m.role, m.content)); });
        if (!res.data.messages || !res.data.messages.length) {
            box.appendChild(el("div", "aria-empty", "ยังไม่มีข้อความในบทสนทนานี้"));
        }
        box.scrollTop = box.scrollHeight;
    }

    function closeAriaPanes() {
        const h = document.getElementById("ariaHistoryPane");
        const t = document.getElementById("ariaTrashPane");
        if (h) h.style.display = "none";
        if (t) t.style.display = "none";
    }

    // ---------- ประวัติแชท ----------
    async function showAriaHistory() {
        const pane = document.getElementById("ariaHistoryPane");
        const list = document.getElementById("ariaHistoryList");
        document.getElementById("ariaTrashPane").style.display = "none";
        pane.style.display = "";
        list.innerHTML = '<div class="feed-loading">กำลังโหลด...</div>';

        const res = await api("/api/aria/conversations?token=" + encodeURIComponent(token));
        const items = (res.data && res.data.conversations) || [];
        list.innerHTML = "";
        if (!items.length) {
            list.appendChild(el("div", "aria-empty", "ยังไม่มีประวัติแชท"));
            return;
        }
        items.forEach(function (c) {
            const row = el("div", "aria-item" + (c.id === ariaConvId ? " current" : ""));
            const main = el("button", "aria-item-main");
            main.appendChild(el("span", "aria-item-title", c.title));
            const meta = el("span", "aria-item-meta");
            meta.appendChild(el("span", null, "เริ่ม " + fmtDateTime(c.created_at)));
            meta.appendChild(el("span", null, "ล่าสุด " + fmtDateTime(c.updated_at)));
            meta.appendChild(el("span", null, c.message_count + " ข้อความ"));
            main.appendChild(meta);
            main.addEventListener("click", function () { openConversation(c.id); });

            const del = el("button", "aria-item-btn danger", "🗑️ ลบ");
            del.addEventListener("click", async function () {
                const yes = await confirmDialog(
                    "ย้ายบทสนทนา \"" + c.title + "\" ไปถังขยะ?\nจะเก็บไว้ 7 วัน กู้คืนได้ก่อนครบกำหนด", "ย้ายไปถังขยะ");
                if (!yes) return;
                const r = await api("/api/aria/conversations/delete", {
                    method: "POST", headers: { "content-type": "application/json" },
                    body: JSON.stringify({ token, id: c.id }),
                });
                if (r.ok && r.data.ok) {
                    toast("ย้ายไปถังขยะแล้ว");
                    if (c.id === ariaConvId) startNewConversation();
                    showAriaHistory();
                } else toast(r.data.error || "ลบไม่สำเร็จ", true);
            });

            row.appendChild(main);
            row.appendChild(del);
            list.appendChild(row);
        });
    }

    // ---------- ถังขยะ ----------
    async function showAriaTrash() {
        const pane = document.getElementById("ariaTrashPane");
        const list = document.getElementById("ariaTrashList");
        document.getElementById("ariaHistoryPane").style.display = "none";
        pane.style.display = "";
        list.innerHTML = '<div class="feed-loading">กำลังโหลด...</div>';

        const res = await api("/api/aria/trash?token=" + encodeURIComponent(token));
        const items = (res.data && res.data.trash) || [];
        list.innerHTML = "";
        if (!items.length) {
            list.appendChild(el("div", "aria-empty", "ถังขยะว่างเปล่า"));
            return;
        }
        items.forEach(function (c) {
            const daysLeft = Math.max(0, Math.ceil(Number(c.days_left) || 0));
            const row = el("div", "aria-item");
            const main = el("div", "aria-item-main static");
            main.appendChild(el("span", "aria-item-title", c.title));
            const meta = el("span", "aria-item-meta");
            meta.appendChild(el("span", null, "ลบเมื่อ " + fmtDateTime(c.deleted_at)));
            meta.appendChild(el("span", null, c.message_count + " ข้อความ"));
            meta.appendChild(el("span", "aria-days-left", "เหลืออีก " + daysLeft + " วัน"));
            main.appendChild(meta);

            const restore = el("button", "aria-item-btn", "↩️ กู้คืน");
            restore.addEventListener("click", async function () {
                const yes = await confirmDialog(
                    "ต้องการกู้คืนบทสนทนา \"" + c.title + "\" กลับไปที่ประวัติแชทหรือไม่?", "กู้คืน");
                if (!yes) return;
                const r = await api("/api/aria/trash/restore", {
                    method: "POST", headers: { "content-type": "application/json" },
                    body: JSON.stringify({ token, id: c.id }),
                });
                if (r.ok && r.data.ok) { toast("กู้คืนแล้ว"); showAriaTrash(); }
                else toast(r.data.error || "กู้คืนไม่สำเร็จ", true);
            });

            const purge = el("button", "aria-item-btn danger", "❌ ลบถาวร");
            purge.addEventListener("click", async function () {
                const yes = await confirmDialog(
                    "ต้องการลบบทสนทนา \"" + c.title + "\" ถาวรหรือไม่?\nการลบถาวรกู้คืนไม่ได้อีก", "ลบถาวร");
                if (!yes) return;
                const r = await api("/api/aria/trash/purge", {
                    method: "POST", headers: { "content-type": "application/json" },
                    body: JSON.stringify({ token, id: c.id }),
                });
                if (r.ok && r.data.ok) { toast("ลบถาวรแล้ว"); showAriaTrash(); }
                else toast(r.data.error || "ลบไม่สำเร็จ", true);
            });

            const actions = el("div", "aria-item-actions");
            actions.appendChild(restore);
            actions.appendChild(purge);
            row.appendChild(main);
            row.appendChild(actions);
            list.appendChild(row);
        });
    }

    function startNewConversation() {
        ariaConvId = null;
        const box = document.getElementById("ariaMessages");
        box.innerHTML = "";
        box.appendChild(el("div", "aria-empty", "เริ่มบทสนทนาใหม่ได้เลยค่ะ"));
    }

    function setupAria() {
        const openBtn = document.getElementById("btnAria");
        if (openBtn) openBtn.addEventListener("click", function () { showView("aria"); });

        const sendBtn = document.getElementById("ariaSend");
        const input = document.getElementById("ariaText");
        const clearBtn = document.getElementById("ariaClear");

        if (!sendBtn || !input) return;

        sendBtn.addEventListener("click", sendAria);
        input.addEventListener("keydown", function (e) {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAria(); }
        });
        // ขยายช่องพิมพ์ตามเนื้อหา
        input.addEventListener("input", function () {
            input.style.height = "auto";
            input.style.height = Math.min(input.scrollHeight, 140) + "px";
        });

        document.querySelectorAll(".aria-chip").forEach(function (chip) {
            chip.addEventListener("click", function () {
                input.value = chip.textContent;
                sendAria();
            });
        });

        // ล้างหน้าจอ = เริ่มบทสนทนาใหม่ (บทเก่ายังอยู่ในประวัติแชท)
        if (clearBtn) clearBtn.addEventListener("click", async function () {
            const yes = await confirmDialog(
                "ล้างหน้าจอและเริ่มบทสนทนาใหม่?\nบทสนทนาปัจจุบันจะยังถูกเก็บไว้ในประวัติแชท", "เริ่มใหม่");
            if (!yes) return;
            closeAriaPanes();
            startNewConversation();
        });

        const histBtn = document.getElementById("ariaHistoryBtn");
        const trashBtn = document.getElementById("ariaTrashBtn");
        const histClose = document.getElementById("ariaHistoryClose");
        const trashClose = document.getElementById("ariaTrashClose");
        const clearAllBtn = document.getElementById("ariaClearAllBtn");

        if (histBtn) histBtn.addEventListener("click", function () {
            const pane = document.getElementById("ariaHistoryPane");
            if (pane.style.display !== "none") { pane.style.display = "none"; return; }
            showAriaHistory();
        });
        if (trashBtn) trashBtn.addEventListener("click", function () {
            const pane = document.getElementById("ariaTrashPane");
            if (pane.style.display !== "none") { pane.style.display = "none"; return; }
            showAriaTrash();
        });
        if (histClose) histClose.addEventListener("click", closeAriaPanes);
        if (trashClose) trashClose.addEventListener("click", closeAriaPanes);

        if (clearAllBtn) clearAllBtn.addEventListener("click", async function () {
            const yes = await confirmDialog(
                "ย้ายประวัติแชททั้งหมดไปถังขยะ?\nจะเก็บไว้ 7 วัน กู้คืนได้ก่อนครบกำหนด", "ล้างทั้งหมด");
            if (!yes) return;
            const r = await api("/api/aria/conversations/clear-all", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ token }),
            });
            if (r.ok && r.data.ok) {
                toast("ย้ายไปถังขยะแล้ว " + (r.data.moved || 0) + " บทสนทนา");
                startNewConversation();
                showAriaHistory();
            } else toast(r.data.error || "ล้างไม่สำเร็จ", true);
        });
    }

    function ariaBubble(role, text) {
        const row = el("div", "aria-row " + (role === "user" ? "user" : "bot"));
        if (role !== "user") row.appendChild(el("div", "aria-avatar sm", "อ"));
        const bubble = el("div", "aria-bubble");
        // แสดงข้อความแบบหลายย่อหน้า
        String(text).split("\n").forEach(function (line, i) {
            if (i > 0) bubble.appendChild(document.createElement("br"));
            bubble.appendChild(document.createTextNode(line));
        });
        row.appendChild(bubble);
        return row;
    }

    async function sendAria() {
        if (ariaBusy) return;
        const input = document.getElementById("ariaText");
        const box = document.getElementById("ariaMessages");
        const text = input.value.trim();
        if (!text) return;

        closeAriaPanes();
        const welcome = box.querySelector(".aria-welcome");
        if (welcome) welcome.remove();
        const empty = box.querySelector(".aria-empty");
        if (empty) empty.remove();

        input.value = "";
        input.style.height = "auto";
        box.appendChild(ariaBubble("user", text));
        box.scrollTop = box.scrollHeight;

        // แสดงจุดกำลังพิมพ์
        ariaBusy = true;
        const typing = el("div", "aria-row bot");
        typing.appendChild(el("div", "aria-avatar sm", "อ"));
        const dots = el("div", "aria-bubble aria-typing");
        dots.appendChild(el("span", "dot"));
        dots.appendChild(el("span", "dot"));
        dots.appendChild(el("span", "dot"));
        typing.appendChild(dots);
        box.appendChild(typing);
        box.scrollTop = box.scrollHeight;

        // บทสนทนาเก่าอยู่ในฐานข้อมูลแล้ว เซิร์ฟเวอร์จะดึงเองอัตโนมัติ
        const res = await api("/api/aria", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token, message: text, conversation_id: ariaConvId }),
        });

        typing.remove();
        ariaBusy = false;

        if (res.ok && res.data.ok) {
            ariaConvId = res.data.conversation_id;
            box.appendChild(ariaBubble("assistant", res.data.reply));
        } else {
            const errRow = el("div", "aria-row bot");
            errRow.appendChild(el("div", "aria-avatar sm", "อ"));
            errRow.appendChild(el("div", "aria-bubble aria-error",
                res.data.error || "เชื่อมต่อไม่ได้ ลองใหม่อีกครั้งนะ"));
            box.appendChild(errRow);
        }
        box.scrollTop = box.scrollHeight;
    }

    // ---------- profile ----------
    async function loadProfile() {
        document.getElementById("pfName").textContent = me.alias || me.username;
        document.getElementById("pfAlias").textContent = me.alias || "—";
        document.getElementById("pfRole").textContent = me.role === "admin" ? "แอดมิน / เจ้าของ" : "สมาชิก";
        paintAvatar(document.getElementById("pfAvatar"), me.alias, me.avatar);

        const aliasInput = document.getElementById("aliasInput");
        if (aliasInput && !aliasInput.dataset.wired) {
            aliasInput.dataset.wired = "1";
            aliasInput.value = me.alias || "";
            document.getElementById("aliasSave").addEventListener("click", async function () {
                const msg = document.getElementById("aliasMsg");
                const val = aliasInput.value.trim();
                msg.className = "composer-msg";
                if (!val) { msg.textContent = "กรุณากรอกนามแฝง"; return; }
                const r = await api("/api/alias", {
                    method: "POST", headers: { "content-type": "application/json" },
                    body: JSON.stringify({ token, alias: val }),
                });
                if (r.ok && r.data.ok) {
                    me.alias = r.data.alias;
                    msg.className = "composer-msg ok";
                    msg.textContent = "เปลี่ยนนามแฝงแล้ว";
                    toast("เปลี่ยนนามแฝงเป็น " + r.data.alias);
                    loadProfile();
                    const av = document.getElementById("myAvatar");
                    av.textContent = initial(r.data.alias.replace("#", ""));
                    av.title = r.data.alias;
                } else {
                    msg.textContent = r.data.error || "เปลี่ยนนามแฝงไม่สำเร็จ";
                }
            });
        }

        const postsRes = await api("/api/posts?token=" + encodeURIComponent(token));
        const novelsRes = await api("/api/novels?token=" + encodeURIComponent(token));
        const myPosts = (postsRes.data.posts || []).filter(p => p.is_mine);
        const myNovels = (novelsRes.data.novels || []).filter(n => n.is_mine);

        document.getElementById("pfPostCount").textContent = myPosts.length;
        document.getElementById("pfNovelCount").textContent = myNovels.length;

        const pList = document.getElementById("pfPostList");
        pList.innerHTML = "";
        if (myPosts.length === 0) pList.appendChild(el("div", "feed-loading", "ยังไม่มีโพสต์"));
        else myPosts.forEach(p => pList.appendChild(renderPost(p)));
    }
})();
