/**
 * Reusable auth helpers for Billing System pages (login, register, superadmin).
 * Uses the same localStorage keys as the existing auth module.
 */
var InventoryAuth = (function () {
    "use strict";

    var INACTIVE_ACCOUNT_MESSAGE =
        "Your registration is complete and waiting for approval. Please wait till your account is approved.";

    function isInactiveAccountMessage(message) {
        var msg = String(message || "").toLowerCase();
        return msg.indexOf("inactive") !== -1 ||
            msg.indexOf("not active") !== -1 ||
            msg.indexOf("waiting for approval") !== -1 ||
            msg.indexOf("registration is complete") !== -1;
    }

    function notifyLoginError(message) {
        if (isInactiveAccountMessage(message)) {
            notify("warning", message || INACTIVE_ACCOUNT_MESSAGE);
            return;
        }
        notify("error", message || "Invalid email/mobile or password.");
    }

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
        if (!input || input.dataset.mobileWired === "1") return;
        input.dataset.mobileWired = "1";

        function sanitize(value) {
            return String(value || "").replace(/\D/g, "").slice(0, 10);
        }

        function applyValue(value) {
            var next = sanitize(value);
            if (input.value !== next) {
                input.value = next;
            }
        }

        function digitCount() {
            return String(input.value || "").replace(/\D/g, "").length;
        }

        function isFullSelection() {
            return input.selectionStart === 0 && input.selectionEnd === input.value.length;
        }

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
                return;
            }

            if (e.key.length === 1 && /\d/.test(e.key)) {
                var hasSelection = input.selectionStart !== input.selectionEnd;
                if (digitCount() >= 10 && !hasSelection && !isFullSelection()) {
                    e.preventDefault();
                }
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

    function isMobileOnlyValue(value) {
        var cleaned = String(value || "").replace(/\s/g, "");
        return cleaned === "" || /^[0-9]+$/.test(cleaned);
    }

    function wireLoginIdentifierInput(input) {
        if (!input || input.dataset.loginIdWired === "1") return;
        input.dataset.loginIdWired = "1";

        function sanitizeMobile(value) {
            return String(value || "").replace(/\D/g, "").slice(0, 10);
        }

        input.addEventListener("input", function () {
            if (!isMobileOnlyValue(input.value)) return;
            var next = sanitizeMobile(input.value);
            if (input.value !== next) {
                input.value = next;
            }
        });

        input.addEventListener("keydown", function (e) {
            if (e.ctrlKey || e.metaKey || e.altKey) return;

            var allowedKeys = [
                "Backspace", "Delete", "Tab", "Escape", "Enter",
                "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"
            ];
            if (allowedKeys.indexOf(e.key) !== -1) return;

            if (e.key.length === 1) {
                if (/[a-zA-Z@._+-]/.test(e.key)) return;
                if (!/\d/.test(e.key)) {
                    e.preventDefault();
                    return;
                }
                if (isMobileOnlyValue(input.value)) {
                    var hasSelection = input.selectionStart !== input.selectionEnd;
                    var digits = String(input.value || "").replace(/\D/g, "");
                    if (digits.length >= 10 && !hasSelection) {
                        e.preventDefault();
                    }
                }
            }
        });

        input.addEventListener("paste", function (e) {
            if (!isMobileOnlyValue(input.value)) return;
            e.preventDefault();
            var pasted = (e.clipboardData || window.clipboardData).getData("text") || "";
            input.value = sanitizeMobile(pasted);
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
        if (typeof InventoryOwnerProfile !== "undefined" && InventoryOwnerProfile.setUser) {
            InventoryOwnerProfile.setUser(user);
            return;
        }

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

        if (typeof InventoryOwnerProfile !== "undefined") return;

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
                clear();
                notify("warning", INACTIVE_ACCOUNT_MESSAGE);
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

        wireLoginIdentifierInput(form.email);

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
            var loginId = form.email.value.trim();
            var password = form.password.value;

            if (!loginId || !password) {
                notify("error", "Email or mobile number and password are required.");
                return;
            }

            InventoryLoader.button(btn, true, "Signing in...");

            apiPost("/login/", { email: loginId, password: password })
                .then(function (result) {
                    InventoryLoader.button(btn, false);
                    var body = result.body;
                    if (result.ok && body && body.isSuccess && body.data) {
                        if (!body.data.user || body.data.user.is_active === false) {
                            clear();
                            notify("warning", INACTIVE_ACCOUNT_MESSAGE);
                            return;
                        }
                        setSession(body.data.tokens, body.data.user);
                        notify("success", "Welcome back! You have signed in successfully.");
                        redirectAfterLogin(body.data.user);
                        return;
                    }
                    notifyLoginError(body && body.message);
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

            var payload = {
                full_name: form.full_name.value.trim(),
                mobile_number: mobile,
                password: form.password.value
            };
            var email = form.email.value.trim();
            if (email) {
                payload.email = email;
            }

            apiPost("/register/", payload)
                .then(function (result) {
                    InventoryLoader.button(btn, false);
                    var body = result.body;
                    if (result.ok && body && body.isSuccess) {
                        notify("success", body.message || "Registration submitted. Awaiting admin approval.");
                        form.reset();
                        window.setTimeout(function () {
                            goLogin();
                        }, 1200);
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
        clear: clear,
        wireMobileInput: wireMobileInput,
        isValidMobile: isValidMobile
    };
})();
