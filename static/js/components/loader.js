/**
 * Reusable loader overlay and button busy state.
 */
var InventoryLoader = (function () {
    "use strict";

    var count = 0;

    function el() {
        return document.getElementById("inv-loader");
    }

    function show() {
        count += 1;
        var node = el();
        if (node) node.classList.remove("inv-hidden");
    }

    function hide() {
        count = Math.max(0, count - 1);
        if (count === 0) {
            var node = el();
            if (node) node.classList.add("inv-hidden");
        }
    }

    function forceHide() {
        count = 0;
        var node = el();
        if (node) node.classList.add("inv-hidden");
    }

    function button(btn, busy, busyText) {
        if (!btn) return;
        if (busy) {
            if (!btn.dataset.originalHtml) {
                btn.dataset.originalHtml = btn.innerHTML;
            }
            btn.disabled = true;
            var spinner = '<span class="inv-btn-spinner"></span>';
            if (busyText) {
                btn.innerHTML = spinner + escapeHtml(busyText);
            } else {
                btn.innerHTML = spinner;
            }
        } else {
            btn.disabled = false;
            if (btn.dataset.originalHtml) {
                btn.innerHTML = btn.dataset.originalHtml;
            }
        }
    }

    function escapeHtml(str) {
        var div = document.createElement("div");
        div.textContent = str == null ? "" : String(str);
        return div.innerHTML;
    }

    return {
        show: show,
        hide: hide,
        forceHide: forceHide,
        button: button
    };
})();
