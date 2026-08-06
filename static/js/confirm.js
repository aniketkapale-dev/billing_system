define("confirm", function (require, module, exports) {
    "use strict";
    var helpers = require("helpers");

    /**
     * Reusable confirmation dialog. Returns a Promise that resolves to
     * true (confirmed) or false (cancelled). Used for delete/restore/logout/etc.
     */
    function ask(options) {
        options = options || {};
        var title = options.title || "Are you sure?";
        var message = options.message || "This action cannot be undone.";
        var confirmText = options.confirmText || "Yes, continue";
        var variant = options.variant || "danger";

        return new Promise(function (resolve) {
            var existing = document.getElementById("confirm-modal");
            if (existing) existing.remove();

            var wrap = document.createElement("div");
            wrap.className = "modal fade";
            wrap.id = "confirm-modal";
            wrap.tabIndex = -1;
            wrap.innerHTML =
                '<div class="modal-dialog modal-dialog-centered modal-sm">' +
                    '<div class="modal-content">' +
                        '<div class="modal-body text-center p-4">' +
                            '<i class="bi bi-exclamation-circle text-' + variant + ' fs-1"></i>' +
                            '<h5 class="mt-2">' + helpers.escapeHtml(title) + '</h5>' +
                            '<p class="text-muted mb-4">' + helpers.escapeHtml(message) + '</p>' +
                            '<div class="d-flex gap-2 justify-content-center">' +
                                '<button class="btn btn-light" data-act="cancel">Cancel</button>' +
                                '<button class="btn btn-' + variant + '" data-act="ok">' +
                                    helpers.escapeHtml(confirmText) + '</button>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>';
            document.body.appendChild(wrap);

            var modal = new bootstrap.Modal(wrap);
            var settled = false;

            wrap.querySelector('[data-act="ok"]').addEventListener("click", function () {
                settled = true; resolve(true); modal.hide();
            });
            wrap.querySelector('[data-act="cancel"]').addEventListener("click", function () {
                settled = true; resolve(false); modal.hide();
            });
            wrap.addEventListener("hidden.bs.modal", function () {
                if (!settled) resolve(false);
                wrap.remove();
            });
            modal.show();
        });
    }

    module.exports = { ask: ask };
});
