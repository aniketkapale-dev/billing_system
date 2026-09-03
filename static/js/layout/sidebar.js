/**
 * Sidebar expandable nav groups, quick-add (+) actions, and hamburger flyout.
 */
var InventorySidebar = (function () {
    "use strict";

    function isCollapsedRail() {
        var body = document.body;
        return body.classList.contains("inv-sidebar-collapsed") &&
            !body.classList.contains("inv-sidebar-pinned") &&
            !body.classList.contains("inv-sidebar-open");
    }

    function syncGroupsForSidebarMode() {
        document.querySelectorAll(".inv-nav-group").forEach(function (group) {
            var toggle = group.querySelector(".inv-nav-group-toggle");
            if (isCollapsedRail()) {
                group.dataset.clickOpen = "0";
                setGroupOpen(group, false);
                return;
            }
            if (group.classList.contains("inv-nav-group--has-active-child")) {
                setGroupOpen(group, true);
                group.dataset.clickOpen = "1";
                if (toggle) toggle.setAttribute("aria-expanded", "true");
            }
        });
    }

    function setGroupOpen(group, open) {
        var toggle = group.querySelector(".inv-nav-group-toggle");
        group.classList.toggle("inv-nav-group--open", open);
        if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
    }

    function closeOtherGroups(except) {
        document.querySelectorAll(".inv-nav-group").forEach(function (group) {
            if (group === except) return;
            if (!isCollapsedRail() && group.classList.contains("inv-nav-group--has-active-child")) return;
            if (!isCollapsedRail() && group.dataset.clickOpen === "1") return;
            setGroupOpen(group, false);
        });
    }

    function initGroups() {
        document.querySelectorAll(".inv-nav-group").forEach(function (group) {
            var toggle = group.querySelector(".inv-nav-group-toggle");
            if (!toggle || toggle.dataset.sidebarWired === "1") return;
            toggle.dataset.sidebarWired = "1";

            if (group.classList.contains("inv-nav-group--open")) {
                group.dataset.clickOpen = isCollapsedRail() ? "0" : "1";
            }

            group.addEventListener("mouseenter", function () {
                if (!group.querySelector(".inv-nav-sub")) return;
                closeOtherGroups(group);
                setGroupOpen(group, true);
            });

            group.addEventListener("mouseleave", function () {
                if (isCollapsedRail()) {
                    setGroupOpen(group, false);
                    return;
                }
                if (group.classList.contains("inv-nav-group--has-active-child")) return;
                if (group.dataset.clickOpen === "1") return;
                setGroupOpen(group, false);
            });

            toggle.addEventListener("click", function () {
                var isOpen = !group.classList.contains("inv-nav-group--open");
                setGroupOpen(group, isOpen);
                group.dataset.clickOpen = isOpen ? "1" : "0";
                if (isOpen) closeOtherGroups(group);
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

    function initSidebarToggle() {
        var toggle = document.getElementById("inv-sidebar-toggle");
        var sidebar = document.querySelector(".inv-sidebar");
        var body = document.body;

        if (!toggle || !sidebar || !body.classList.contains("inv-dashboard-body")) return;
        if (toggle.dataset.sidebarToggleWired === "1") return;
        toggle.dataset.sidebarToggleWired = "1";

        var hoverTimer = null;
        var hoverOpen = false;

        function syncOpenState() {
            var pinned = body.classList.contains("inv-sidebar-pinned");
            body.classList.toggle("inv-sidebar-open", hoverOpen || pinned);
            toggle.setAttribute("aria-expanded", pinned || hoverOpen ? "true" : "false");
            syncGroupsForSidebarMode();
        }

        function openSidebar() {
            clearTimeout(hoverTimer);
            hoverOpen = true;
            syncOpenState();
        }

        function scheduleCloseSidebar() {
            clearTimeout(hoverTimer);
            hoverTimer = setTimeout(function () {
                hoverOpen = false;
                syncOpenState();
            }, 200);
        }

        toggle.addEventListener("mouseenter", openSidebar);
        toggle.addEventListener("mouseleave", scheduleCloseSidebar);
        sidebar.addEventListener("mouseenter", openSidebar);
        sidebar.addEventListener("mouseleave", scheduleCloseSidebar);

        toggle.addEventListener("click", function () {
            body.classList.toggle("inv-sidebar-pinned");
            syncOpenState();
            syncGroupsForSidebarMode();
        });

        syncGroupsForSidebarMode();
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
        initSidebarToggle();
        syncGroupsForSidebarMode();
    }

    return {
        init: init,
        consumeAddAction: consumeAddAction
    };
})();

document.addEventListener("DOMContentLoaded", function () {
    InventorySidebar.init();
});
