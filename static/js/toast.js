define("toast", function (require, module, exports) {
    "use strict";
    var constants = require("constants");
    var helpers = require("helpers");

    var ICONS = {
        success: "bi-check-circle-fill",
        error: "bi-x-circle-fill",
        warning: "bi-exclamation-triangle-fill",
        info: "bi-info-circle-fill"
    };

    function notify(type, message) {
        var container = document.getElementById("toast-container");
        if (!container) { alert(message); return; }

        var wrapper = document.createElement("div");
        wrapper.className = "toast align-items-center app-toast app-toast-" + type;
        wrapper.setAttribute("role", "alert");
        wrapper.innerHTML =
            '<div class="d-flex">' +
                '<div class="toast-body"><i class="bi ' + (ICONS[type] || ICONS.info) +
                    ' me-2"></i>' + helpers.escapeHtml(message) + '</div>' +
                '<button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>' +
            '</div>';
        container.appendChild(wrapper);

        var toast = new bootstrap.Toast(wrapper, {
            delay: constants.TOAST_TIMEOUT
        });
        toast.show();
        wrapper.addEventListener("hidden.bs.toast", function () { wrapper.remove(); });
    }

    module.exports = {
        success: function (m) { notify("success", m); },
        error: function (m) { notify("error", m); },
        warning: function (m) { notify("warning", m); },
        info: function (m) { notify("info", m); }
    };
});
