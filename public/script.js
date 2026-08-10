// บัญชีผู้ดูแลระบบ (ตั้งค่าตายตัว)
const VALID_USERNAME = "adminth";
const VALID_PASSWORD = "123456";

// อ่าน/เขียนรายชื่อสมาชิกที่สมัครไว้ใน localStorage (เดโม — ข้อมูลอยู่แค่ในเครื่องนี้)
function getUsers() {
    try {
        return JSON.parse(localStorage.getItem("users") || "[]");
    } catch (e) {
        return [];
    }
}

function saveUsers(users) {
    localStorage.setItem("users", JSON.stringify(users));
}

// เปิด/ปิดการมองเห็นรหัสผ่าน (รองรับได้หลายช่องในหน้าเดียว)
function setupPasswordToggles() {
    document.querySelectorAll(".toggle-password").forEach(function (btn) {
        btn.addEventListener("click", function () {
            // ช่องเป้าหมาย: จาก data-target หรือ id "password" (หน้าเข้าสู่ระบบ)
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

    // ถ้าเพิ่งสมัครสมาชิกเสร็จ ให้ขึ้นข้อความสำเร็จ
    const infoMessage = document.getElementById("infoMessage");
    if (infoMessage && new URLSearchParams(window.location.search).get("registered") === "1") {
        infoMessage.textContent = "สมัครสมาชิกสำเร็จ! เข้าสู่ระบบได้เลย";
        infoMessage.style.display = "block";
    }

    loginForm.addEventListener("submit", function (e) {
        e.preventDefault();

        const username = document.getElementById("username").value.trim();
        const password = document.getElementById("password").value;
        const errorMessage = document.getElementById("errorMessage");

        const isAdmin = username === VALID_USERNAME && password === VALID_PASSWORD;
        const matched = getUsers().find(function (u) {
            return u.username === username && u.password === password;
        });

        if (isAdmin || matched) {
            sessionStorage.setItem("loggedIn", "true");
            sessionStorage.setItem("username", username);
            window.location.href = "dashboard.html";
        } else {
            errorMessage.textContent = "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง";
            errorMessage.style.display = "block";
        }
    });
}

// ===== หน้าสมัครสมาชิก =====
function setupRegister() {
    const registerForm = document.getElementById("registerForm");
    if (!registerForm) return;

    registerForm.addEventListener("submit", function (e) {
        e.preventDefault();

        const username = document.getElementById("regUsername").value.trim();
        const password = document.getElementById("regPassword").value;
        const confirm = document.getElementById("regConfirm").value;
        const email = document.getElementById("regEmail").value.trim();
        const msg = document.getElementById("regMessage");

        function showError(text) {
            msg.textContent = text;
            msg.style.display = "block";
        }

        if (username.length < 3) {
            return showError("ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร");
        }
        if (username.toLowerCase() === VALID_USERNAME.toLowerCase()) {
            return showError("ชื่อผู้ใช้นี้ถูกใช้แล้ว");
        }
        if (password.length < 6) {
            return showError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
        }
        if (password !== confirm) {
            return showError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
        }

        const users = getUsers();
        if (users.some(function (u) { return u.username === username; })) {
            return showError("ชื่อผู้ใช้นี้ถูกใช้แล้ว");
        }

        users.push({ username: username, password: password, email: email });
        saveUsers(users);

        window.location.href = "index.html?registered=1";
    });
}

document.addEventListener("DOMContentLoaded", function () {
    setupPasswordToggles();
    setupLogin();
    setupRegister();
});
