var InventorySettingsInvoice = (function () {
    "use strict";

    var API = "/api/settings/invoice-settings";
    var LIST_PANEL = "settings-invoice-list-panel";
    var FORM_PANEL = "settings-invoice-form-panel";
    var currentPage = 1;
    var editingId = null;

    function request(path, opts) {
        return InventoryApi.request(API, path, opts);
    }

    function buildQuery(page) {
        var params = new URLSearchParams();
        params.set("page", String(page || 1));
        params.set("page_size", "10");
        params.set("ordering", "-year");
        return "?" + params.toString();
    }

    function displayText(value) {
        if (value === null || value === undefined || String(value).trim() === "") return "—";
        return InventoryApi.escapeHtml(String(value));
    }

    function renderRows(items) {
        var tbody = document.getElementById("settings-invoice-table-body");
        if (!tbody) return;

        if (!items || !items.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="inv-mgmt-empty">No invoice settings yet. Add one to get started.</td></tr>';
            return;
        }

        tbody.innerHTML = items.map(function (item) {
            return (
                "<tr>" +
                '<td class="inv-mgmt-cell--num"><strong>' + displayText(item.year) + "</strong></td>" +
                "<td>" + displayText(item.prefix) + "</td>" +
                "<td>" + displayText(item.suffix) + "</td>" +
                '<td class="inv-mgmt-cell--num">' + displayText(item.counter) + "</td>" +
                '<td class="inv-mgmt-cell--num">' + displayText(item.current_counter) + "</td>" +
                "<td>" + displayText(item.end_counter) + "</td>" +
                '<td class="inv-mgmt-cell--action"><div class="inv-row-actions">' +
                '<button type="button" class="inv-row-action-btn inv-row-action-btn--edit" data-invoice-edit="' + item.id + '" title="Edit" aria-label="Edit">' +
                '<span class="material-symbols-outlined">edit</span></button>' +
                '<button type="button" class="inv-row-action-btn inv-row-action-btn--delete" data-invoice-delete="' + item.id + '" title="Delete" aria-label="Delete">' +
                '<span class="material-symbols-outlined">delete</span></button>' +
                "</div></td></tr>"
            );
        }).join("");
    }

    function loadSettings(page) {
        currentPage = page || 1;
        InventoryLoader.show();

        return request(buildQuery(currentPage))
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    renderRows(body.data.items || []);
                    InventoryPagination.render("settings-invoice-pagination", body.data.pagination, loadSettings);
                } else {
                    renderRows([]);
                    InventoryPagination.render("settings-invoice-pagination", null, function () {});
                    InventoryToast.error(body.message || "Failed to load invoice settings.");
                }
            })
            .catch(function () {
                renderRows([]);
                InventoryToast.error("Network error while loading invoice settings.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function openForm(isEdit) {
        var title = document.getElementById("settings-invoice-form-title");
        if (!title) return;

        if (!isEdit) {
            editingId = null;
            document.getElementById("settings-invoice-year").value = String(new Date().getFullYear());
            document.getElementById("settings-invoice-prefix").value = "";
            document.getElementById("settings-invoice-suffix").value = "";
            document.getElementById("settings-invoice-end-counter").value = "";
            title.textContent = "Add Invoice Setting";
        } else {
            title.textContent = "Edit Invoice Setting";
        }

        InventoryPagePanel.showPanel(LIST_PANEL, FORM_PANEL);
        document.getElementById("settings-invoice-year").focus();
    }

    function closeForm() {
        editingId = null;
        InventoryPagePanel.showList(LIST_PANEL);
    }

    function collectPayload() {
        return {
            year: document.getElementById("settings-invoice-year").value.trim(),
            prefix: document.getElementById("settings-invoice-prefix").value.trim(),
            suffix: document.getElementById("settings-invoice-suffix").value.trim(),
            end_counter: document.getElementById("settings-invoice-end-counter").value.trim() || null
        };
    }

    function validatePayload(payload) {
        if (!payload.year) return "Year is required.";
        var year = Number(payload.year);
        if (!Number.isInteger(year) || year < 2000 || year > 2100) {
            return "Year must be between 2000 and 2100.";
        }
        return null;
    }

    function saveSetting() {
        var payload = collectPayload();
        var error = validatePayload(payload);
        if (error) {
            InventoryToast.error(error);
            return;
        }

        payload.year = Number(payload.year);

        var btn = document.getElementById("settings-invoice-save-btn");
        InventoryLoader.button(btn, true);

        var path = editingId ? "/" + editingId + "/" : "/";
        var method = editingId ? "PATCH" : "POST";

        request(path, { method: method, body: payload })
            .then(function (body) {
                if (body && body.isSuccess) {
                    InventoryToast.success(body.message || (editingId ? "Invoice settings updated." : "Invoice settings added."));
                    closeForm();
                    loadSettings(editingId ? currentPage : 1);
                } else {
                    InventoryToast.error(body.message || "Failed to save invoice settings.");
                }
            })
            .catch(function () {
                InventoryToast.error("Network error while saving invoice settings.");
            })
            .finally(function () {
                InventoryLoader.button(btn, false);
            });
    }

    function editSetting(id) {
        InventoryLoader.show();
        request("/" + id + "/")
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    editingId = id;
                    document.getElementById("settings-invoice-year").value = body.data.year || "";
                    document.getElementById("settings-invoice-prefix").value = body.data.prefix || "";
                    document.getElementById("settings-invoice-suffix").value = body.data.suffix || "";
                    document.getElementById("settings-invoice-end-counter").value = body.data.end_counter || "";
                    openForm(true);
                } else {
                    InventoryToast.error(body.message || "Failed to load invoice settings.");
                }
            })
            .catch(function () {
                InventoryToast.error("Network error while loading invoice settings.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function deleteSetting(id) {
        InventoryConfirm.delete({
            title: "Delete invoice setting?",
            message: "This invoice setting will be removed."
        }).then(function (confirmed) {
            if (!confirmed) return;

            InventoryLoader.show();
            request("/" + id + "/", { method: "DELETE" })
                .then(function (body) {
                    if (body && body.isSuccess) {
                        InventoryToast.success(body.message || "Invoice setting deleted.");
                        loadSettings(currentPage);
                    } else {
                        InventoryToast.error(body.message || "Failed to delete invoice setting.");
                    }
                })
                .catch(function () {
                    InventoryToast.error("Network error while deleting invoice setting.");
                })
                .finally(function () {
                    InventoryLoader.hide();
                });
        });
    }

    function init() {
        if (init._wired) return;
        init._wired = true;

        var addBtn = document.getElementById("settings-invoice-add-btn");
        var saveBtn = document.getElementById("settings-invoice-save-btn");
        var tableBody = document.getElementById("settings-invoice-table-body");

        if (!tableBody) return;

        if (window.InventoryPagePanel) {
            InventoryPagePanel.init();
        }

        if (addBtn) {
            addBtn.addEventListener("click", function () {
                if (!InventoryBusiness.getActiveId()) {
                    InventoryToast.error("Select or create a business first.");
                    return;
                }
                openForm(false);
            });
        }

        if (saveBtn) saveBtn.addEventListener("click", saveSetting);

        tableBody.addEventListener("click", function (e) {
            var editBtn = e.target.closest("[data-invoice-edit]");
            var deleteBtn = e.target.closest("[data-invoice-delete]");
            if (editBtn) {
                editSetting(editBtn.getAttribute("data-invoice-edit"));
            } else if (deleteBtn) {
                deleteSetting(deleteBtn.getAttribute("data-invoice-delete"));
            }
        });

        InventoryBusiness.whenReady(function () {
            if (!InventoryBusiness.getActiveId()) return;
            loadSettings(1);
            if (window.InventorySidebar && InventorySidebar.consumeAddAction()) {
                openForm(false);
            }
        });

        window.addEventListener("inventory:business-changed", function () {
            closeForm();
            if (InventoryBusiness.getActiveId()) loadSettings(1);
            else renderRows([]);
        });
    }

    return { init: init };
})();
