/**
 * Business owner account menu — profile details, password, logout.
 */
var InventoryOwnerProfile = (function () {
    "use strict";

    var API = "/api/auth";
    var root = null;
    var trigger = null;
    var panel = null;
    var open = false;
    var currentUser = null;

    function notify(type, message) {
        if (typeof InventoryToast !== "undefined") {
            InventoryToast[type](message);
            return;
        }
        window.alert(message);
    }

    function authHeaders() {
        var headers = { "Content-Type": "application/json" };
        var token = localStorage.getItem("vrms_access_token");
        if (token) headers["Authorization"] = "Bearer " + token;
        return headers;
    }

    function apiRequest(method, path, body) {
        return fetch(API + path, {
            method: method,
            headers: authHeaders(),
            body: body ? JSON.stringify(body) : undefined,
            cache: "no-store"
        }).then(function (res) {
            return res.json().then(function (data) {
                return { ok: res.ok, body: data };
            });
        });
    }

    function close() {
        if (!panel || !trigger) return;
        open = false;
        panel.classList.add("inv-hidden");
        trigger.setAttribute("aria-expanded", "false");
        trigger.classList.remove("inv-profile-trigger--open");
    }

    function openPanel() {
        if (!panel || !trigger) return;
        if (typeof InventoryQuickAccess !== "undefined" && InventoryQuickAccess.close) {
            InventoryQuickAccess.close();
        }
        open = true;
        panel.classList.remove("inv-hidden");
        trigger.setAttribute("aria-expanded", "true");
        trigger.classList.add("inv-profile-trigger--open");
    }

    function toggle() {
        if (open) close();
        else openPanel();
    }

    function onDocumentClick(e) {
        if (!open || !root) return;
        if (root.contains(e.target)) return;
        close();
    }

    function onKeyDown(e) {
        if (e.key === "Escape") close();
    }

    function roleLabel(user) {
        if (user && user.roles && user.roles.length) return user.roles[0];
        return "Business Owner";
    }

    function paintAvatar(user) {
        var avatarEl = document.getElementById("profile-avatar");
        if (!avatarEl) return;

        if (user && user.profile_image) {
            avatarEl.innerHTML = '<img src="' + user.profile_image + '" alt="" class="inv-profile-avatar-img">';
            return;
        }

        avatarEl.innerHTML = '<span class="material-symbols-outlined">person</span>';
    }

    function paintHeader(user) {
        var nameEl = document.getElementById("profile-name");
        var roleEl = document.getElementById("profile-role");
        var subtitleEl = document.getElementById("owner-profile-panel-subtitle");

        var name = (user && user.full_name) || roleLabel(user);
        var role = roleLabel(user);

        if (nameEl) nameEl.textContent = name;
        if (roleEl) roleEl.textContent = role;
        if (subtitleEl) subtitleEl.textContent = role;
        paintAvatar(user);
    }

    function fillForm(user) {
        var fullNameEl = document.getElementById("owner-profile-full-name");
        var emailEl = document.getElementById("owner-profile-email");
        var mobileEl = document.getElementById("owner-profile-mobile");

        if (fullNameEl) fullNameEl.value = (user && user.full_name) || "";
        if (emailEl) emailEl.value = (user && user.email) || "";
        if (mobileEl) mobileEl.value = (user && user.mobile_number) || "";
    }

    function setUser(user) {
        currentUser = user || null;
        paintHeader(currentUser);
        fillForm(currentUser);
    }

    function persistUser(user) {
        if (!user) return;
        try {
            localStorage.setItem("vrms_user", JSON.stringify(user));
        } catch (e) {
            /* ignore storage errors */
        }
        setUser(user);
    }

    function saveProfile(e) {
        e.preventDefault();

        var fullName = document.getElementById("owner-profile-full-name").value.trim();
        var email = document.getElementById("owner-profile-email").value.trim();
        var mobile = document.getElementById("owner-profile-mobile").value.trim();
        var btn = document.getElementById("owner-profile-save-btn");

        if (!fullName) {
            notify("error", "Full name is required.");
            return;
        }

        if (typeof InventoryAuth !== "undefined" && InventoryAuth.isValidMobile && !InventoryAuth.isValidMobile(mobile)) {
            notify("error", "Enter a valid 10-digit mobile number.");
            return;
        }

        InventoryLoader.button(btn, true, "Saving...");

        apiRequest("PATCH", "/me/", {
            full_name: fullName,
            email: email,
            mobile_number: mobile
        }).then(function (result) {
            InventoryLoader.button(btn, false);
            var body = result.body;
            if (result.ok && body && body.isSuccess && body.data) {
                persistUser(body.data);
                notify("success", body.message || "Profile updated successfully.");
                return;
            }
            var err = (body && body.message) || "Unable to update profile.";
            if (body && body.errors && body.errors.length) err = body.errors.join(" • ");
            notify("error", err);
        }).catch(function () {
            InventoryLoader.button(btn, false);
            notify("error", "Network error. Please try again.");
        });
    }

    function savePassword(e) {
        e.preventDefault();

        var currentPassword = document.getElementById("owner-profile-current-password").value;
        var newPassword = document.getElementById("owner-profile-new-password").value;
        var confirmPassword = document.getElementById("owner-profile-confirm-password").value;
        var btn = document.getElementById("owner-password-save-btn");

        if (!currentPassword || !newPassword || !confirmPassword) {
            notify("error", "Fill in all password fields.");
            return;
        }

        if (newPassword.length < 8) {
            notify("error", "New password must be at least 8 characters.");
            return;
        }

        if (newPassword !== confirmPassword) {
            notify("error", "New password and confirmation do not match.");
            return;
        }

        InventoryLoader.button(btn, true, "Updating...");

        apiRequest("POST", "/change-password/", {
            current_password: currentPassword,
            new_password: newPassword
        }).then(function (result) {
            InventoryLoader.button(btn, false);
            var body = result.body;
            if (result.ok && body && body.isSuccess) {
                document.getElementById("owner-password-form").reset();
                notify("success", body.message || "Password changed successfully.");
                return;
            }
            notify("error", (body && body.message) || "Unable to change password.");
        }).catch(function () {
            InventoryLoader.button(btn, false);
            notify("error", "Network error. Please try again.");
        });
    }

    function wireLogout() {
        var logoutBtn = document.getElementById("inventory-logout-btn");
        if (!logoutBtn || logoutBtn.dataset.ownerLogoutWired === "1") return;
        logoutBtn.dataset.ownerLogoutWired = "1";

        logoutBtn.addEventListener("click", function () {
            close();
            apiRequest("POST", "/logout/", {}).finally(function () {
                if (typeof InventoryAuth !== "undefined" && InventoryAuth.clear) {
                    InventoryAuth.clear();
                }
                window.location.replace("/login/");
            });
        });
    }

    function init() {
        root = document.getElementById("inv-owner-profile");
        trigger = document.getElementById("inv-owner-profile-trigger");
        panel = document.getElementById("inv-owner-profile-panel");
        if (!root || !trigger || !panel) return;

        trigger.addEventListener("click", function (e) {
            e.stopPropagation();
            toggle();
        });

        document.addEventListener("click", onDocumentClick);
        document.addEventListener("keydown", onKeyDown);

        var profileForm = document.getElementById("owner-profile-form");
        var passwordForm = document.getElementById("owner-password-form");
        if (profileForm) profileForm.addEventListener("submit", saveProfile);
        if (passwordForm) passwordForm.addEventListener("submit", savePassword);

        var mobileInput = document.getElementById("owner-profile-mobile");
        if (mobileInput && typeof InventoryAuth !== "undefined" && InventoryAuth.wireMobileInput) {
            InventoryAuth.wireMobileInput(mobileInput);
        }

        wireLogout();

        try {
            var cached = JSON.parse(localStorage.getItem("vrms_user"));
            if (cached) setUser(cached);
        } catch (err) {
            /* ignore bad cache */
        }
    }

    return {
        init: init,
        setUser: setUser,
        close: close
    };
})();

document.addEventListener("DOMContentLoaded", function () {
    InventoryOwnerProfile.init();
});
