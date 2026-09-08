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

    function prompt(options) {
        options = options || {};

        var title = options.title || "Please provide details";
        var message = options.message || "";
        var confirmText = options.confirmText || "Confirm";
        var cancelText = options.cancelText || "Cancel";
        var variant = options.variant || "danger";
        var icon = options.icon || (variant === "danger" ? "warning" : "help");
        var inputLabel = options.inputLabel || "Reason";
        var inputPlaceholder = options.inputPlaceholder || "";
        var required = options.required !== false;
        var showDate = !!options.showDate;
        var dateLabel = options.dateLabel || "Date";
        var dateRequired = options.dateRequired !== false;
        var minDate = options.minDate || "";
        var dateErrorMessage = options.dateErrorMessage ||
            "Selected date cannot be before the invoice date.";
        var defaultDate = options.defaultDate || new Date().toISOString().slice(0, 10);
        if (minDate && defaultDate < minDate) {
            defaultDate = minDate;
        }

        return new Promise(function (resolve) {
            removeExisting();

            var settledRef = { settled: false };

            var backdrop = document.createElement("div");
            backdrop.id = BACKDROP_ID;
            backdrop.className = "inv-confirm-backdrop";

            var modal = document.createElement("div");
            modal.id = MODAL_ID;
            modal.className = "inv-confirm-modal inv-confirm-modal--prompt";
            modal.setAttribute("role", "dialog");
            modal.setAttribute("aria-modal", "true");
            modal.setAttribute("aria-labelledby", "inv-confirm-title");

            var dateFieldHtml = showDate
                ? (
                    '<div class="inv-confirm-modal__field">' +
                        '<label for="inv-confirm-date" class="inv-confirm-modal__label">' + escapeHtml(dateLabel) + "</label>" +
                        '<input id="inv-confirm-date" class="inv-confirm-modal__date" type="date" value="' +
                            escapeHtml(defaultDate) + '"' +
                            (minDate ? ' min="' + escapeHtml(minDate) + '"' : "") +
                            "/>" +
                        '<p id="inv-confirm-date-error" class="inv-confirm-modal__error inv-hidden"></p>' +
                    "</div>"
                )
                : "";

            modal.innerHTML =
                '<div class="inv-confirm-modal__icon inv-confirm-modal__icon--' + variant + '">' +
                    '<span class="material-symbols-outlined">' + escapeHtml(icon) + "</span>" +
                "</div>" +
                '<h3 id="inv-confirm-title" class="inv-confirm-modal__title">' + escapeHtml(title) + "</h3>" +
                (message
                    ? '<p class="inv-confirm-modal__message">' + escapeHtml(message) + "</p>"
                    : "") +
                dateFieldHtml +
                '<div class="inv-confirm-modal__field">' +
                    '<label for="inv-confirm-input" class="inv-confirm-modal__label">' + escapeHtml(inputLabel) + "</label>" +
                    '<textarea id="inv-confirm-input" class="inv-confirm-modal__input" rows="3" placeholder="' +
                        escapeHtml(inputPlaceholder) + '"></textarea>' +
                "</div>" +
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

            var inputEl = modal.querySelector("#inv-confirm-input");
            var dateEl = modal.querySelector("#inv-confirm-date");
            var dateErrorEl = modal.querySelector("#inv-confirm-date-error");

            function showDateError(message) {
                if (!dateErrorEl) return;
                dateErrorEl.textContent = message || dateErrorMessage;
                dateErrorEl.classList.remove("inv-hidden");
            }

            function clearDateError() {
                if (!dateErrorEl) return;
                dateErrorEl.textContent = "";
                dateErrorEl.classList.add("inv-hidden");
            }

            function submitValue() {
                var value = inputEl ? inputEl.value.trim() : "";
                if (required && !value) {
                    if (inputEl) inputEl.focus();
                    return;
                }
                var dateValue = dateEl ? dateEl.value.trim() : "";
                if (showDate && dateRequired && !dateValue) {
                    if (dateEl) dateEl.focus();
                    return;
                }
                if (showDate && minDate && dateValue && dateValue < minDate) {
                    showDateError(dateErrorMessage);
                    if (dateEl) dateEl.focus();
                    return;
                }
                clearDateError();
                if (showDate) {
                    closeDialog(settledRef, resolve, {
                        reason: value,
                        cancellation_date: dateValue || defaultDate
                    });
                    return;
                }
                closeDialog(settledRef, resolve, value || null);
            }

            modal.querySelector('[data-act="ok"]').addEventListener("click", submitValue);

            modal.querySelector('[data-act="cancel"]').addEventListener("click", function () {
                closeDialog(settledRef, resolve, null);
            });

            backdrop.addEventListener("click", function () {
                closeDialog(settledRef, resolve, null);
            });

            window.addEventListener("keydown", function onKeydown(e) {
                if (e.key === "Escape") {
                    window.removeEventListener("keydown", onKeydown);
                    closeDialog(settledRef, resolve, null);
                }
            });

            if (inputEl) {
                inputEl.addEventListener("keydown", function (e) {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        submitValue();
                    }
                });
            }

            if (dateEl) {
                dateEl.addEventListener("input", clearDateError);
                dateEl.focus();
            } else if (inputEl) {
                inputEl.focus();
            }
        });
    }

    return {
        ask: ask,
        delete: deleteConfirm,
        prompt: prompt
    };
})();
