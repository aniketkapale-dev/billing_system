define("layout", function (require, module, exports) {
    "use strict";
    var auth = require("auth");
    var api = require("api");
    var navbar = require("navbar");
    var confirm = require("confirm");

    function boot() {
        // Guard every panel page.
        if (!auth.requireAuth()) return;

        var active = document.body.getAttribute("data-active");
        navbar.init(active);

        // Show current user (from cache, then refresh from API).
        var nameEl = document.getElementById("current-user-name");
        var emailEl = document.getElementById("current-user-email");
        var headerEl = document.getElementById("current-user-header");

        function paint(user) {
            if (!user) return;
            var name = user.full_name || user.email;
            if (nameEl) nameEl.textContent = name;
            if (emailEl) emailEl.textContent = user.email || "";
            if (headerEl) headerEl.textContent = "Signed in as " + name;
        }

        paint(auth.getUser());
        api.get("/auth/me/", { silent: true, showLoader: false }).then(function (body) {
            if (body && body.isSuccess) paint(body.data);
        });

        // Logout (wired to every logout trigger — sidebar + navbar dropdown).
        function doLogout(e) {
            e.preventDefault();
            confirm.ask({
                title: "Log out?",
                message: "You will be returned to the login screen.",
                confirmText: "Logout",
                variant: "primary"
            }).then(function (ok) {
                if (!ok) return;
                api.post("/auth/logout/", {}, { silent: true }).finally(function () {
                    auth.clear();
                    window.location.href = require("constants").LOGIN_URL;
                });
            });
        }

        ["logout-btn", "logout-btn-top"].forEach(function (id) {
            var btn = document.getElementById(id);
            if (btn) btn.addEventListener("click", doLogout);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }

    module.exports = { boot: boot };
});
