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
        setupMedia();
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

        // ปิดการเชื่อมต่อแชทเมื่อออกจากหน้าแชท
        if (name !== "chat") { closeSocket(); stopChatPoll(); }

        if (name === "feed") loadPosts();
        if (name === "novels") loadNovels();
        if (name === "chat") loadFriends();
        if (name === "write") loadMyNovels();
        if (name === "profile") loadProfile();
        if (name === "clips") loadClips();
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

        ["💬 คอมเมนต์", "🔖 บันทึก", "↗️ แชร์"].forEach(function (t) {
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
        if (res.data.posts.length === 0) {
            list.innerHTML = '<div class="feed-loading">ยังไม่มีโพสต์ มาเริ่มเขียนกันเลย!</div>';
            return;
        }
        res.data.posts.forEach(p => list.appendChild(renderPost(p)));
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
                const isVid = f.type.indexOf("video/") === 0;
                // รูปจะถูกย่ออัตโนมัติก่อนส่ง จึงรับไฟล์ต้นฉบับใหญ่ได้
                if (isVid && f.size > 20 * 1048576) {
                    toast("วิดีโอใหญ่เกินไป (จำกัด 20 MB)", true);
                    return;
                }
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

    // ---------- chat (เรียลไทม์ผ่าน WebSocket + fallback polling) ----------
    let chatWith = null;
    let chatPoll = null;
    let chatSocket = null;
    let reconnectTimer = null;
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
        const cls = m.sender === me.username ? "chat-msg me" : "chat-msg them";
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
