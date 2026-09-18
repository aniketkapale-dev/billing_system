var InventorySettingsWhatsApp = (function () {
    "use strict";

    var API = "/api/settings/whatsapp-message";
    var FORM_PANEL = "settings-whatsapp-form-panel";
    var RECIPIENTS_PANEL = "settings-whatsapp-recipients-panel";
    var PAGINATION_ID = "settings-whatsapp-logs-pagination";
    var currentPage = 1;
    var savedSnapshot = null;
    var isEditing = false;

    function request(path, opts) {
        return InventoryApi.request(API, path, opts);
    }

    function isPageActive() {
        return !!document.getElementById(FORM_PANEL);
    }

    function setLoading(button, loading, label) {
        if (!button) return;
        button.disabled = loading;
        if (loading) {
            button.dataset.originalLabel = button.textContent;
            button.textContent = label || "Please wait...";
        } else if (button.dataset.originalLabel) {
            button.textContent = button.dataset.originalLabel;
            delete button.dataset.originalLabel;
        }
    }

    function fillForm(data) {
        var firstDays = document.getElementById("settings-whatsapp-first-days");
        var repeatDays = document.getElementById("settings-whatsapp-repeat-days");
        if (firstDays) firstDays.value = data.first_message_after_days != null ? data.first_message_after_days : 1;
        if (repeatDays) repeatDays.value = data.repeat_every_days != null ? data.repeat_every_days : 7;
    }

    function readForm() {
        return {
            first_message_after_days: Number(
                (document.getElementById("settings-whatsapp-first-days") || { value: "1" }).value
            ),
            repeat_every_days: Number(
                (document.getElementById("settings-whatsapp-repeat-days") || { value: "7" }).value
            )
        };
    }

    function getFormInputs() {
        return [
            document.getElementById("settings-whatsapp-first-days"),
            document.getElementById("settings-whatsapp-repeat-days")
        ].filter(Boolean);
    }

    function updateSavedSnapshot(data) {
        savedSnapshot = {
            first_message_after_days: Number(data.first_message_after_days),
            repeat_every_days: Number(data.repeat_every_days)
        };
    }

    function hasUnsavedChanges() {
        if (!savedSnapshot) return true;
        var current = readForm();
        return (
            current.first_message_after_days !== savedSnapshot.first_message_after_days ||
            current.repeat_every_days !== savedSnapshot.repeat_every_days
        );
    }

    function applyViewState() {
        var saveBtn = document.getElementById("settings-whatsapp-save-btn");
        var sendBtn = document.getElementById("settings-whatsapp-send-btn");

        getFormInputs().forEach(function (input) {
            input.readOnly = !isEditing;
            input.classList.toggle("inv-input-readonly", !isEditing);
        });

        if (saveBtn) {
            saveBtn.textContent = isEditing && hasUnsavedChanges()
                ? "Save Settings"
                : "Change Setting";
        }
    }

    function enterLockedState(data) {
        if (data) {
            fillForm(data);
            updateSavedSnapshot(data);
        }
        isEditing = false;
        applyViewState();
    }

    function enterEditingState() {
        isEditing = true;
        applyViewState();
    }

    function onFormInput() {
        if (!isEditing) return;
        applyViewState();
    }

    function buildLogsQuery(page) {
        var params = new URLSearchParams();
        params.set("page", String(page || 1));
        params.set("page_size", String(InventoryPagination.getPageSize(PAGINATION_ID)));
        return "/logs/?" + params.toString();
    }

    function renderSentMessages(items) {
        var tbody = document.getElementById("settings-whatsapp-logs-body");
        if (!tbody) return;

        if (!items || !items.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="inv-mgmt-empty">No first-time sent messages yet.</td></tr>';
            return;
        }

        tbody.innerHTML = items.map(function (item) {
            return (
                "<tr>" +
                "<td><strong>" + InventoryApi.escapeHtml(item.invoice_no || "—") + "</strong></td>" +
                "<td>" + InventoryApi.escapeHtml(item.customer_name || "—") + "</td>" +
                "<td>" + InventoryApi.escapeHtml(item.mobile || "—") + "</td>" +
                '<td class="inv-mgmt-cell--num">' + InventoryApi.escapeHtml(item.total_amount || "0.00") + "</td>" +
                '<td class="inv-mgmt-cell--num">' + InventoryApi.escapeHtml(item.pending_amount || "0.00") + "</td>" +
                "<td>" + InventoryApi.escapeHtml(InventoryApi.formatDisplayDate(item.first_message_sent_at, "—")) + "</td>" +
                "<td>" + InventoryApi.escapeHtml(InventoryApi.formatDateTime(item.sent_at, "—")) + "</td>" +
                "</tr>"
            );
        }).join("");

        if (typeof InventoryTableCards !== "undefined") {
            InventoryTableCards.syncAll(tbody.closest(".inv-mgmt-card") || tbody);
        }
    }

    function loadSentMessages(page) {
        currentPage = page || 1;
        var tbody = document.getElementById("settings-whatsapp-logs-body");
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="7" class="inv-mgmt-empty">Loading sent messages...</td></tr>';
        }

        return request(buildLogsQuery(currentPage), { method: "GET" })
            .then(function (body) {
                if (!body || !body.isSuccess) {
                    InventoryToast.error((body && body.message) || "Failed to load sent messages.");
                    return;
                }
                var items = (body.data && body.data.items) || [];
                renderSentMessages(items);
                if (body.data && body.data.pagination) {
                    InventoryPagination.render(PAGINATION_ID, body.data.pagination, loadSentMessages);
                }
            })
            .catch(function (err) {
                InventoryToast.error(err.message || "Failed to load sent messages.");
            });
    }

    function openRecipientsPanel() {
        InventoryPagePanel.showPanel(FORM_PANEL, RECIPIENTS_PANEL);
        loadSentMessages(1);
    }

    function loadSettings() {
        return request("", { method: "GET" })
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    enterLockedState(body.data);
                }
            })
            .catch(function (err) {
                InventoryToast.error(err.message || "Failed to load WhatsApp settings.");
            });
    }

    function saveSettings() {
        var btn = document.getElementById("settings-whatsapp-save-btn");
        var payload = readForm();
        setLoading(btn, true, "Saving...");

        return request("", {
            method: "PATCH",
            body: payload
        })
            .then(function (body) {
                if (body && body.isSuccess) {
                    enterLockedState(body.data || payload);
                    InventoryToast.success(body.message || "Settings saved.");
                } else {
                    InventoryToast.error((body && body.message) || "Failed to save settings.");
                }
            })
            .catch(function (err) {
                InventoryToast.error(err.message || "Failed to save settings.");
            })
            .finally(function () {
                setLoading(btn, false);
                applyViewState();
            });
    }

    function logSendResult(data) {
        data = data || {};
        var recipients = data.recipients || [];
        var skipped = data.skipped || [];
        var pendingCount = data.pending_count || 0;

        if (!pendingCount) {
            console.log("[WhatsApp Reminder] No pending invoices found.");
            return;
        }

        if (recipients.length) {
            console.log("[WhatsApp Reminder] Sent for " + recipients.length + " invoice(s):");
            recipients.forEach(function (item, index) {
                console.log(
                    (index + 1) + ". Invoice: " + (item.invoice_no || "—") +
                    " | Customer: " + item.customer_name +
                    " | Mobile: " + (item.mobile || "—") +
                    " | Total Amount: " + item.total_amount +
                    " | Pending Amount: " + item.pending_amount +
                    " | First Send: " + (item.is_first_send ? "Yes" : "No")
                );
            });
        } else {
            console.log("[WhatsApp Reminder] No invoices due for reminders right now.");
        }

        if (skipped.length) {
            console.log("[WhatsApp Reminder] Skipped " + skipped.length + " invoice(s):");
            skipped.forEach(function (item, index) {
                console.log(
                    (index + 1) + ". Invoice: " + (item.invoice_no || "—") +
                    " | Customer: " + item.customer_name +
                    " | Mobile: " + (item.mobile || "—") +
                    " | Reason: " + item.reason
                );
            });
        }
    }

    function sendMessages() {
        var btn = document.getElementById("settings-whatsapp-send-btn");
        setLoading(btn, true, "Sending...");

        return request("/send/", { method: "POST", body: {} })
            .then(function (body) {
                if (!body || !body.isSuccess) {
                    InventoryToast.error((body && body.message) || "Failed to send messages.");
                    return;
                }
                logSendResult(body.data || {});
                InventoryToast.success(body.message || "Messages sent.");
            })
            .catch(function (err) {
                InventoryToast.error(err.message || "Failed to send messages.");
            })
            .finally(function () {
                setLoading(btn, false);
            });
    }

    function init() {
        if (!isPageActive()) return;

        var saveBtn = document.getElementById("settings-whatsapp-save-btn");
        var sendBtn = document.getElementById("settings-whatsapp-send-btn");
        var recipientsBtn = document.getElementById("settings-whatsapp-recipients-btn");

        getFormInputs().forEach(function (input) {
            input.addEventListener("input", onFormInput);
            input.addEventListener("change", onFormInput);
        });

        if (saveBtn) {
            saveBtn.addEventListener("click", function () {
                if (!isEditing) {
                    enterEditingState();
                    var firstInput = document.getElementById("settings-whatsapp-first-days");
                    if (firstInput) firstInput.focus();
                    return;
                }
                if (hasUnsavedChanges()) {
                    saveSettings();
                }
            });
        }

        if (sendBtn) {
            sendBtn.addEventListener("click", function () {
                sendMessages();
            });
        }

        if (recipientsBtn) {
            recipientsBtn.addEventListener("click", function () {
                openRecipientsPanel();
            });
        }

        loadSettings();
    }

    return {
        init: init
    };
})();
