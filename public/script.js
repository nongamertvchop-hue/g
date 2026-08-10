// เรือนอักษร — สคริปต์หน้าเข้าสู่ระบบ / สมัครสมาชิก (เชื่อมกับ API หลังบ้าน D1)

// เปิด/ปิดการมองเห็นรหัสผ่าน (รองรับหลายช่องในหน้าเดียว)
function setupPasswordToggles() {
    document.querySelectorAll(".toggle-password").forEach(function (btn) {
        btn.addEventListener("click", function () {
            const targetId = btn.getAttribute("data-target") || "password";
            const input = document.getElementById(targetId);
            if (!input) return;
            if (input.type === "password") {
                input.type = "text";
                btn.textContent = "🙈";
            } else {
                input.type = "password";
                btn.textContent = "👁";
            }
        });
    });
}

// ===== หน้าเข้าสู่ระบบ =====
function setupLogin() {
    const loginForm = document.getElementById("loginForm");
    if (!loginForm) return;

    const infoMessage = document.getElementById("infoMessage");
    if (infoMessage && new URLSearchParams(window.location.search).get("registered") === "1") {
        infoMessage.textContent = "สมัครสมาชิกสำเร็จ! เข้าสู่ระบบได้เลย";
        infoMessage.style.display = "block";
    }

    loginForm.addEventListener("submit", async function (e) {
        e.preventDefault();

        const username = document.getElementById("username").value.trim();
        const password = document.getElementById("password").value;
        const errorMessage = document.getElementById("errorMessage");
        const submitBtn = loginForm.querySelector("button[type=submit]");

        errorMessage.textContent = "";
        submitBtn.disabled = true;

        try {
            const res = await fetch("/api/login", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ username, password }),
            });
            const data = await res.json();

            if (res.ok && data.ok) {
                localStorage.setItem("authToken", data.token);
                localStorage.setItem("username", data.username);
                window.location.href = "dashboard.html";
            } else {
                errorMessage.textContent = data.error || "เข้าสู่ระบบไม่สำเร็จ";
                errorMessage.style.display = "block";
            }
        } catch (err) {
            errorMessage.textContent = "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง";
            errorMessage.style.display = "block";
        } finally {
            submitBtn.disabled = false;
        }
    });
}

// ===== หน้าสมัครสมาชิก =====
function setupRegister() {
    const registerForm = document.getElementById("registerForm");
    if (!registerForm) return;

    registerForm.addEventListener("submit", async function (e) {
        e.preventDefault();

        const username = document.getElementById("regUsername").value.trim();
        const password = document.getElementById("regPassword").value;
        const confirm = document.getElementById("regConfirm").value;
        const email = document.getElementById("regEmail").value.trim();
        const msg = document.getElementById("regMessage");
        const submitBtn = registerForm.querySelector("button[type=submit]");

        function showError(text) {
            msg.textContent = text;
            msg.style.display = "block";
        }
        msg.textContent = "";

        if (username.length < 3) return showError("ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร");
        if (password.length < 6) return showError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
        if (password !== confirm) return showError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");

        submitBtn.disabled = true;
        try {
            const res = await fetch("/api/register", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ username, password, email }),
            });
            const data = await res.json();

            if (res.ok && data.ok) {
                window.location.href = "index.html?registered=1";
            } else {
                showError(data.error || "สมัครสมาชิกไม่สำเร็จ");
            }
        } catch (err) {
            showError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง");
        } finally {
            submitBtn.disabled = false;
        }
    });
}

document.addEventListener("DOMContentLoaded", function () {
    // ถ้าล็อกอินค้างไว้แล้ว → ไปหน้าหลัก (แท็บ) ทันที
    if (document.getElementById("loginForm") && localStorage.getItem("authToken")) {
        window.location.href = "dashboard.html";
        return;
    }
    setupPasswordToggles();
    setupLogin();
    setupRegister();
});
