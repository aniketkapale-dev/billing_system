/**
 * Sidebar expandable nav groups and quick-add (+) actions.
 */
var InventorySidebar = (function () {
    "use strict";

    function initGroups() {
        document.querySelectorAll(".inv-nav-group").forEach(function (group) {
            var toggle = group.querySelector(".inv-nav-group-toggle");
            if (!toggle || toggle.dataset.sidebarWired === "1") return;
            toggle.dataset.sidebarWired = "1";

            toggle.addEventListener("click", function () {
                var isOpen = group.classList.toggle("inv-nav-group--open");
                toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
            });
        });
    }

    function wireAddButtons() {
        document.querySelectorAll(".inv-nav-add-btn").forEach(function (btn) {
            if (btn.dataset.sidebarAddWired === "1") return;
            btn.dataset.sidebarAddWired = "1";

            btn.addEventListener("click", function (e) {
                e.preventDefault();
                e.stopPropagation();

                if (btn.getAttribute("data-add-action") === "business") {
                    var businessAddBtn = document.getElementById("inv-business-add-btn");
                    if (businessAddBtn) businessAddBtn.click();
                    return;
                }

                var href = btn.getAttribute("href");
                if (href) window.location.href = href;
            });
        });
    }

    function consumeAddAction() {
        var params = new URLSearchParams(window.location.search);
        if (params.get("action") !== "add") return false;

        params.delete("action");
        var query = params.toString();
        var nextUrl = window.location.pathname + (query ? "?" + query : "") + window.location.hash;
        window.history.replaceState({}, "", nextUrl);
        return true;
    }

    function init() {
        initGroups();
        wireAddButtons();
    }

    return {
        init: init,
        consumeAddAction: consumeAddAction
    };
})();

document.addEventListener("DOMContentLoaded", function () {
    InventorySidebar.init();
});
