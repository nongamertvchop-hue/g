const VALID_USERNAME = "adminth";
const VALID_PASSWORD = "123456";

document.addEventListener("DOMContentLoaded", function () {
    const loginForm = document.getElementById("loginForm");
    const togglePassword = document.getElementById("togglePassword");

    if (loginForm) {
        loginForm.addEventListener("submit", function (e) {
            e.preventDefault();

            const username = document.getElementById("username").value.trim();
            const password = document.getElementById("password").value;
            const errorMessage = document.getElementById("errorMessage");

            if (username === VALID_USERNAME && password === VALID_PASSWORD) {
                sessionStorage.setItem("loggedIn", "true");
                sessionStorage.setItem("username", username);
                window.location.href = "dashboard.html";
            } else {
                errorMessage.textContent = "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง";
                errorMessage.style.display = "block";
            }
        });
    }

    if (togglePassword) {
        togglePassword.addEventListener("click", function () {
            const passwordInput = document.getElementById("password");
            if (passwordInput.type === "password") {
                passwordInput.type = "text";
                togglePassword.textContent = "🙈";
            } else {
                passwordInput.type = "password";
                togglePassword.textContent = "👁";
            }
        });
    }
});
