/**
 * Custom confirmation dialog for Billing System pages (delete, etc.).
 */
var InventoryConfirm = (function () {
    "use strict";

    var MODAL_ID = "inv-confirm-modal";
    var BACKDROP_ID = "inv-confirm-backdrop";

    function escapeHtml(str) {
        var div = document.createElement("div");
        div.textContent = str == null ? "" : String(str);
        return div.innerHTML;
    }

    function removeExisting() {
        var modal = document.getElementById(MODAL_ID);
        var backdrop = document.getElementById(BACKDROP_ID);
        if (modal) modal.remove();
        if (backdrop) backdrop.remove();
        document.body.classList.remove("inv-confirm-open");
    }

    function closeDialog(settledRef, resolve, value) {
        if (settledRef.settled) return;
        settledRef.settled = true;
        resolve(value);
        removeExisting();
    }

    function ask(options) {
        options = options || {};

        var title = options.title || "Are you sure?";
        var message = options.message || "This action cannot be undone.";
        var confirmText = options.confirmText || "Confirm";
        var cancelText = options.cancelText || "Cancel";
        var variant = options.variant || "danger";
        var icon = options.icon || (variant === "danger" ? "warning" : "help");

        return new Promise(function (resolve) {
            removeExisting();

            var settledRef = { settled: false };

            var backdrop = document.createElement("div");
            backdrop.id = BACKDROP_ID;
            backdrop.className = "inv-confirm-backdrop";

            var modal = document.createElement("div");
            modal.id = MODAL_ID;
            modal.className = "inv-confirm-modal";
            modal.setAttribute("role", "dialog");
            modal.setAttribute("aria-modal", "true");
            modal.setAttribute("aria-labelledby", "inv-confirm-title");

            modal.innerHTML =
                '<div class="inv-confirm-modal__icon inv-confirm-modal__icon--' + variant + '">' +
                    '<span class="material-symbols-outlined">' + escapeHtml(icon) + "</span>" +
                "</div>" +
                '<h3 id="inv-confirm-title" class="inv-confirm-modal__title">' + escapeHtml(title) + "</h3>" +
                '<p class="inv-confirm-modal__message">' + escapeHtml(message) + "</p>" +
                '<div class="inv-confirm-modal__actions">' +
                    '<button type="button" class="inv-confirm-btn inv-confirm-btn--cancel" data-act="cancel">' +
                        escapeHtml(cancelText) +
                    "</button>" +
                    '<button type="button" class="inv-confirm-btn inv-confirm-btn--' + variant + '" data-act="ok">' +
                        escapeHtml(confirmText) +
                    "</button>" +
                "</div>";

            document.body.appendChild(backdrop);
            document.body.appendChild(modal);
            document.body.classList.add("inv-confirm-open");

            modal.querySelector('[data-act="ok"]').addEventListener("click", function () {
                closeDialog(settledRef, resolve, true);
            });

            modal.querySelector('[data-act="cancel"]').addEventListener("click", function () {
                closeDialog(settledRef, resolve, false);
            });

            backdrop.addEventListener("click", function () {
                closeDialog(settledRef, resolve, false);
            });

            window.addEventListener("keydown", function onKeydown(e) {
                if (e.key === "Escape") {
                    window.removeEventListener("keydown", onKeydown);
                    closeDialog(settledRef, resolve, false);
                }
            });
        });
    }

    function deleteConfirm(options) {
        options = options || {};
        return ask({
            title: options.title || "Delete this user?",
            message: options.message || "This will permanently remove the user from the system. This action cannot be undone.",
            confirmText: options.confirmText || "Delete",
            cancelText: options.cancelText || "Cancel",
            variant: "danger",
            icon: "delete_forever"
        });
    }

    return {
        ask: ask,
        delete: deleteConfirm
    };
})();
