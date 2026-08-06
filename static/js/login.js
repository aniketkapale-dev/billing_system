define("login", function (require, module, exports) {
    "use strict";
    var api = require("api");
    var auth = require("auth");
    var toast = require("toast");
    var loader = require("loader");
    var c = require("constants");
    var forgotPassword = require("forgot-password");
    function init() {
        var forgot = document.getElementById("forgot-password-link");

        if (forgot) {
            forgot.addEventListener("click", function (e) {
                e.preventDefault();
                forgotPassword.open();
            });
        }
        // Already logged in? Skip login.
        if (auth.isAuthenticated()) {
            window.location.href = c.DASHBOARD_URL;
            return;
        }

        var formEl = document.getElementById("login-form");

        // Password visibility toggle (UI only).
        var pwToggle = document.getElementById("pw-toggle");
        if (pwToggle) {
            pwToggle.addEventListener("click", function () {
                var input = document.getElementById("login-password");
                var icon = pwToggle.querySelector("i");
                if (input.type === "password") {
                    input.type = "text";
                    icon.className = "bi bi-eye-slash";
                } else {
                    input.type = "password";
                    icon.className = "bi bi-eye";
                }
            });
        }

        // Remember-me: prefill the last email (does not change auth flow).
        var remembered = localStorage.getItem("vrms_remember_email");
        if (remembered) {
            formEl.email.value = remembered;
            var rm = document.getElementById("remember-me");
            if (rm) rm.checked = true;
        }

        formEl.addEventListener("submit", function (e) {
            e.preventDefault();
            var email = formEl.email.value.trim();
            var password = formEl.password.value;

            formEl.querySelectorAll(".is-invalid").forEach(function (el) {
                el.classList.remove("is-invalid");
            });
            var valid = true;
            if (!email) { formEl.email.classList.add("is-invalid"); valid = false; }
            if (!password) { formEl.password.classList.add("is-invalid"); valid = false; }
            if (!valid) return;

            var btn = document.getElementById("login-submit");
            loader.button(btn, true, "Signing in...");

            api.post("/auth/login/", { email: email, password: password }).then(function (body) {
                loader.button(btn, false);
                if (body && body.isSuccess) {
                    var rm = document.getElementById("remember-me");
                    if (rm && rm.checked) localStorage.setItem("vrms_remember_email", email);
                    else localStorage.removeItem("vrms_remember_email");
                    auth.setSession(body.data.tokens, body.data.user);
                    sessionStorage.setItem("login_success", "Login successful");
                    window.location.href = c.DASHBOARD_URL;
                }
            }).catch(function () { loader.button(btn, false); });
        });
    }

    module.exports = { init: init };
});
