/**
 * Zoho-style Quick Create / Quick Access menu in the top bar.
 */
var InventoryQuickAccess = (function () {
    "use strict";

    var root = null;
    var trigger = null;
    var panel = null;
    var open = false;

    function close() {
        if (!panel || !trigger) return;
        open = false;
        panel.classList.add("inv-hidden");
        trigger.setAttribute("aria-expanded", "false");
        trigger.classList.remove("inv-quick-access-trigger--open");
    }

    function openPanel() {
        if (!panel || !trigger) return;
        if (typeof InventoryOwnerProfile !== "undefined" && InventoryOwnerProfile.close) {
            InventoryOwnerProfile.close();
        }
        open = true;
        panel.classList.remove("inv-hidden");
        trigger.setAttribute("aria-expanded", "true");
        trigger.classList.add("inv-quick-access-trigger--open");
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

    function wireItems() {
        if (!panel) return;

        panel.querySelectorAll("[data-quick-action='business']").forEach(function (el) {
            el.addEventListener("click", function (e) {
                e.preventDefault();
                close();
                var btn = document.getElementById("inv-business-add-btn");
                if (btn) btn.click();
            });
        });

        panel.querySelectorAll("a[href]").forEach(function (link) {
            link.addEventListener("click", function () {
                close();
            });
        });
    }

    function init() {
        root = document.getElementById("inv-quick-access");
        trigger = document.getElementById("inv-quick-access-btn");
        panel = document.getElementById("inv-quick-access-panel");
        if (!root || !trigger || !panel) return;

        trigger.addEventListener("click", function (e) {
            e.stopPropagation();
            toggle();
        });

        document.addEventListener("click", onDocumentClick);
        document.addEventListener("keydown", onKeyDown);
        wireItems();
    }

    return { init: init, close: close };
})();

document.addEventListener("DOMContentLoaded", function () {
    InventoryQuickAccess.init();
});
