/**
 * Reusable auth helpers for Billing System pages (login, register, superadmin).
 * Uses the same localStorage keys as the existing auth module.
 */
var InventoryAuth = (function () {
    "use strict";

    var KEYS = {
        TOKEN: "vrms_access_token",
        REFRESH: "vrms_refresh_token",
        USER: "vrms_user"
    };

    var ROUTES = {
        LOGIN: "/login/",
        REGISTER: "/register/",
        SUPERADMIN: "/superadmin/dashboard/",
        USER_DASHBOARD: "/dashboard/",
        LANDING: "/"
    };

    var API = "/api/auth";
    var logoutWired = false;

    function getToken() {
        return localStorage.getItem(KEYS.TOKEN);
    }

    function getUser() {
        try {
            return JSON.parse(localStorage.getItem(KEYS.USER));
        } catch (e) {
            return null;
        }
    }

    function setSession(tokens, user) {
        if (tokens) {
            if (tokens.access) localStorage.setItem(KEYS.TOKEN, tokens.access);
            if (tokens.refresh) localStorage.setItem(KEYS.REFRESH, tokens.refresh);
        }
        if (user) localStorage.setItem(KEYS.USER, JSON.stringify(user));
    }

    function clear() {
        localStorage.removeItem(KEYS.TOKEN);
        localStorage.removeItem(KEYS.REFRESH);
        localStorage.removeItem(KEYS.USER);
    }

    function goLogin() {
        clear();
        window.location.replace(ROUTES.LOGIN);
    }

    function goDashboard() {
        window.location.replace(ROUTES.SUPERADMIN);
    }

    function goUserDashboard() {
        window.location.replace(ROUTES.USER_DASHBOARD);
    }

    function normalizeRole(role) {
        return String(role || "").trim().toLowerCase().replace(/\s+/g, " ");
    }

    function isSuperAdmin(user) {
        if (!user || !user.roles || !user.roles.length) return false;
        return user.roles.some(function (r) {
            var role = normalizeRole(r);
            return role === "super admin" || role === "superadmin" || role === "admin";
        });
    }

    function getHomeRoute(user) {
        return isSuperAdmin(user) ? ROUTES.SUPERADMIN : ROUTES.USER_DASHBOARD;
    }

    function redirectToHome(user) {
        window.location.replace(getHomeRoute(user));
    }

    function notify(type, message) {
        if (typeof InventoryToast !== "undefined") {
            InventoryToast[type](message);
            return;
        }
        window.alert(message);
    }

    function wireMobileInput(input) {
        if (!input) return;

        function sanitize(value) {
            return String(value || "").replace(/\D/g, "").slice(0, 10);
        }

        function applyValue(value) {
            var next = sanitize(value);
            if (input.value !== next) {
                input.value = next;
            }
        }

        input.addEventListener("beforeinput", function (e) {
            if (
                e.inputType === "insertFromPaste" ||
                e.inputType === "insertFromDrop" ||
                e.inputType === "deleteContentBackward" ||
                e.inputType === "deleteContentForward" ||
                e.inputType === "deleteByCut"
            ) {
                return;
            }
            if (e.data && /\D/.test(e.data)) {
                e.preventDefault();
            }
        });

        input.addEventListener("input", function () {
            applyValue(input.value);
        });

        input.addEventListener("keydown", function (e) {
            if (e.ctrlKey || e.metaKey || e.altKey) return;

            var allowedKeys = [
                "Backspace", "Delete", "Tab", "Escape", "Enter",
                "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"
            ];
            if (allowedKeys.indexOf(e.key) !== -1) return;

            if (e.key.length === 1 && !/\d/.test(e.key)) {
                e.preventDefault();
            }
        });

        input.addEventListener("paste", function (e) {
            e.preventDefault();
            var pasted = (e.clipboardData || window.clipboardData).getData("text") || "";
            applyValue(pasted);
        });

        input.addEventListener("drop", function (e) {
            e.preventDefault();
        });
    }

    function isValidMobile(value) {
        return /^[0-9]{10}$/.test(String(value || "").trim());
    }

    function apiGet(path, withAuth) {
        var headers = {};
        if (withAuth) {
            var token = getToken();
            if (token) headers["Authorization"] = "Bearer " + token;
        }
        return fetch(API + path, {
            method: "GET",
            headers: headers,
            cache: "no-store"
        }).then(function (res) {
            return res.json();
        });
    }

    function apiPost(path, body, withAuth) {
        var headers = { "Content-Type": "application/json" };
        if (withAuth) {
            var token = getToken();
            if (token) headers["Authorization"] = "Bearer " + token;
        }
        return fetch(API + path, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(body),
            cache: "no-store"
        }).then(function (res) {
            return res.json().then(function (data) {
                return {
                    ok: res.ok,
                    status: res.status,
                    body: data
                };
            });
        });
    }

    function paintProfile(user) {
        var roleEl = document.getElementById("profile-role");
        if (!roleEl) return;

        if (user && user.roles && user.roles.length) {
            roleEl.textContent = user.roles[0];
            return;
        }

        roleEl.textContent = isSuperAdmin(user) ? "Super Admin" : "Business Owner";
    }

    function wireLogout() {
        if (logoutWired) return;
        logoutWired = true;

        var logoutBtn = document.getElementById("inventory-logout-btn");
        if (!logoutBtn) return;

        logoutBtn.addEventListener("click", function () {
            apiPost("/logout/", {}, true).finally(function () {
                goLogin();
            });
        });
    }

    function verifySuperAdminSession() {
        if (!getToken()) {
            goLogin();
            return Promise.resolve(false);
        }

        return apiGet("/me/", true).then(function (body) {
            if (!body || !body.isSuccess || !body.data) {
                goLogin();
                return false;
            }

            if (!isSuperAdmin(body.data)) {
                redirectToHome(body.data);
                return false;
            }

            setSession(null, body.data);
            document.body.classList.remove("inv-auth-pending");
            paintProfile(body.data);
            wireLogout();
            return true;
        }).catch(function () {
            goLogin();
            return false;
        });
    }

    function verifyUserSession() {
        if (!getToken()) {
            goLogin();
            return Promise.resolve(false);
        }

        return apiGet("/me/", true).then(function (body) {
            if (!body || !body.isSuccess || !body.data) {
                goLogin();
                return false;
            }

            if (isSuperAdmin(body.data)) {
                redirectToHome(body.data);
                return false;
            }

            if (!body.data.is_active) {
                goLogin();
                return false;
            }

            setSession(null, body.data);
            document.body.classList.remove("inv-auth-pending");
            paintProfile(body.data);
            wireLogout();
            return true;
        }).catch(function () {
            goLogin();
            return false;
        });
    }

    function redirectAfterLogin(user) {
        redirectToHome(user);
    }

    function initLogin() {
        var form = document.getElementById("inventory-login-form");
        var btn = document.getElementById("login-submit");

        if (!form) return;

        // Always require fresh credentials on the login page.
        clear();

        window.addEventListener("pageshow", function (e) {
            if (e.persisted) {
                clear();
            }
        });

        var pwToggle = document.getElementById("password-toggle");
        if (pwToggle) {
            pwToggle.addEventListener("click", function () {
                var input = document.getElementById("password");
                var icon = pwToggle.querySelector(".material-symbols-outlined");
                if (input.type === "password") {
                    input.type = "text";
                    icon.textContent = "visibility_off";
                    pwToggle.setAttribute("aria-label", "Hide password");
                } else {
                    input.type = "password";
                    icon.textContent = "visibility";
                    pwToggle.setAttribute("aria-label", "Show password");
                }
            });
        }

        form.addEventListener("submit", function (e) {
            e.preventDefault();
            var email = form.email.value.trim();
            var password = form.password.value;

            if (!email || !password) {
                notify("error", "Email and password are required.");
                return;
            }

            InventoryLoader.button(btn, true, "Signing in...");

            apiPost("/login/", { email: email, password: password })
                .then(function (result) {
                    InventoryLoader.button(btn, false);
                    var body = result.body;
                    if (result.ok && body && body.isSuccess && body.data) {
                        setSession(body.data.tokens, body.data.user);
                        notify("success", "Login successful.");
                        redirectAfterLogin(body.data.user);
                        return;
                    }
                    notify("error", (body && body.message) || "Invalid email or password.");
                })
                .catch(function () {
                    InventoryLoader.button(btn, false);
                    notify("error", "Network error. Please try again.");
                });
        });
    }

    function initRegister() {
        var form = document.getElementById("inventory-register-form");
        var btn = document.getElementById("register-submit");
        var mobileInput = document.getElementById("mobile_number");

        if (!form) return;

        wireMobileInput(mobileInput);

        form.addEventListener("submit", function (e) {
            e.preventDefault();

            var mobile = form.mobile_number.value.trim();
            if (!isValidMobile(mobile)) {
                notify("error", "Enter a valid 10-digit mobile number.");
                if (mobileInput) mobileInput.focus();
                return;
            }

            InventoryLoader.button(btn, true, "Registering...");

            apiPost("/register/", {
                full_name: form.full_name.value.trim(),
                email: form.email.value.trim(),
                mobile_number: mobile,
                password: form.password.value
            })
                .then(function (result) {
                    InventoryLoader.button(btn, false);
                    var body = result.body;
                    if (result.ok && body && body.isSuccess) {
                        notify("success", body.message || "Registration submitted. Awaiting admin approval.");
                        form.reset();
                        return;
                    }
                    var err = (body && body.message) || "Registration failed.";
                    if (body && body.errors && body.errors.length) err = body.errors.join(" • ");
                    notify("error", err);
                })
                .catch(function () {
                    InventoryLoader.button(btn, false);
                    notify("error", "Network error. Please try again.");
                });
        });
    }

    function guardSuperAdmin() {
        function checkSession() {
            verifySuperAdminSession();
        }

        checkSession();

        window.addEventListener("pageshow", function (e) {
            if (e.persisted) {
                document.body.classList.add("inv-auth-pending");
                checkSession();
            }
        });

        window.addEventListener("popstate", checkSession);
    }

    function guardUser() {
        function checkSession() {
            verifyUserSession();
        }

        checkSession();

        window.addEventListener("pageshow", function (e) {
            if (e.persisted) {
                document.body.classList.add("inv-auth-pending");
                checkSession();
            }
        });

        window.addEventListener("popstate", checkSession);
    }

    return {
        initLogin: initLogin,
        initRegister: initRegister,
        guardSuperAdmin: guardSuperAdmin,
        guardUser: guardUser,
        clear: clear
    };
})();
