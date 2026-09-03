/**
 * Reusable toast notifications for InventoryPro pages.
 */
var InventoryToast = (function () {
    "use strict";

    var TIMEOUT = 3500;
    var ICONS = {
        success: "check_circle",
        error: "error",
        warning: "warning",
        info: "info"
    };

    function container() {
        return document.getElementById("inv-toast-container");
    }

    function escapeHtml(str) {
        var div = document.createElement("div");
        div.textContent = str == null ? "" : String(str);
        return div.innerHTML;
    }

    function notify(type, message) {
        var root = container();
        if (!root) {
            window.alert(message);
            return;
        }

        var toast = document.createElement("div");
        toast.className = "inv-toast inv-toast--" + type;
        toast.setAttribute("role", "alert");
        toast.innerHTML =
            '<span class="material-symbols-outlined inv-toast-icon">' + (ICONS[type] || ICONS.info) + "</span>" +
            '<span class="inv-toast-text">' + escapeHtml(message) + "</span>" +
            '<button type="button" class="inv-toast-close" aria-label="Close">' +
            '<span class="material-symbols-outlined">close</span></button>';

        var closeBtn = toast.querySelector(".inv-toast-close");
        function remove() {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }
        closeBtn.addEventListener("click", remove);

        root.appendChild(toast);
        window.setTimeout(remove, TIMEOUT);
    }

    return {
        success: function (m) { notify("success", m); },
        error: function (m) { notify("error", m); },
        warning: function (m) { notify("warning", m); },
        info: function (m) { notify("info", m); }
    };
})();
