var InventorySettingsTax = (function () {
    "use strict";

    var API = "/api/settings/taxes";
    var LIST_PANEL = "settings-tax-list-panel";
    var FORM_PANEL = "settings-tax-form-panel";
    var PAGINATION_ID = "settings-tax-pagination";
    var currentPage = 1;
    var editingId = null;

    function request(path, opts) {
        return InventoryApi.request(API, path, opts);
    }

    function buildQuery(page) {
        var params = new URLSearchParams();
        params.set("page", String(page || 1));
        params.set("page_size", String(InventoryPagination.getPageSize(PAGINATION_ID)));
        params.set("ordering", "key");
        return "?" + params.toString();
    }

    function formatValue(value) {
        var num = Number(value);
        if (Number.isNaN(num)) return "—";
        return num + "%";
    }

    function renderRows(items) {
        var tbody = document.getElementById("settings-tax-table-body");
        if (!tbody) return;

        if (!items || !items.length) {
            tbody.innerHTML = '<tr><td colspan="3" class="inv-mgmt-empty">No taxes yet. Add one to get started.</td></tr>';
            return;
        }

        tbody.innerHTML = items.map(function (item) {
            return (
                "<tr>" +
                "<td><strong>" + InventoryApi.escapeHtml(item.key) + "</strong></td>" +
                '<td class="inv-mgmt-cell--num">' + InventoryApi.escapeHtml(formatValue(item.value)) + "</td>" +
                '<td class="inv-mgmt-cell--action"><div class="inv-row-actions">' +
                '<button type="button" class="inv-row-action-btn inv-row-action-btn--edit" data-tax-edit="' + item.id + '" title="Edit" aria-label="Edit">' +
                '<span class="material-symbols-outlined">edit</span></button>' +
                '<button type="button" class="inv-row-action-btn inv-row-action-btn--delete" data-tax-delete="' + item.id + '" title="Delete" aria-label="Delete">' +
                '<span class="material-symbols-outlined">delete</span></button>' +
                "</div></td></tr>"
            );
        }).join("");
    }

    function loadTaxes(page) {
        currentPage = page || 1;
        InventoryLoader.show();

        return request(buildQuery(currentPage))
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    renderRows(body.data.items || []);
                    InventoryPagination.render(PAGINATION_ID, body.data.pagination, loadTaxes, {
                        onPageSizeChange: function () {
                            loadTaxes(1);
                        }
                    });
                } else {
                    renderRows([]);
                    InventoryPagination.render(PAGINATION_ID, null, function () {});
                    InventoryToast.error(body.message || "Failed to load taxes.");
                }
            })
            .catch(function () {
                renderRows([]);
                InventoryToast.error("Network error while loading taxes.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function openForm(isEdit) {
        var title = document.getElementById("settings-tax-form-title");
        if (!title) return;

        if (!isEdit) {
            editingId = null;
            document.getElementById("settings-tax-key").value = "";
            document.getElementById("settings-tax-value").value = "";
            title.textContent = "Add Tax";
        } else {
            title.textContent = "Edit Tax";
        }

        InventoryPagePanel.showPanel(LIST_PANEL, FORM_PANEL);
        document.getElementById("settings-tax-key").focus();
    }

    function closeForm() {
        editingId = null;
        InventoryPagePanel.showList(LIST_PANEL);
    }

    function collectPayload() {
        return {
            key: document.getElementById("settings-tax-key").value.trim(),
            value: document.getElementById("settings-tax-value").value.trim()
        };
    }

    function validatePayload(payload) {
        if (!payload.key) return "Tax key is required (e.g. gst12%).";
        if (payload.value === "") return "Tax value is required (e.g. 12).";
        var num = Number(payload.value);
        if (Number.isNaN(num)) return "Tax value must be a number.";
        if (num < 0 || num > 100) return "Tax value must be between 0 and 100.";
        return null;
    }

    function saveTax() {
        var payload = collectPayload();
        var error = validatePayload(payload);
        if (error) {
            InventoryToast.error(error);
            return;
        }

        var btn = document.getElementById("settings-tax-save-btn");
        InventoryLoader.button(btn, true);

        var path = editingId ? "/" + editingId + "/" : "/";
        var method = editingId ? "PATCH" : "POST";

        request(path, { method: method, body: payload })
            .then(function (body) {
                if (body && body.isSuccess) {
                    InventoryToast.success(body.message || (editingId ? "Tax updated." : "Tax added."));
                    closeForm();
                    loadTaxes(editingId ? currentPage : 1);
                } else {
                    InventoryToast.error(body.message || "Failed to save tax.");
                }
            })
            .catch(function () {
                InventoryToast.error("Network error while saving tax.");
            })
            .finally(function () {
                InventoryLoader.button(btn, false);
            });
    }

    function editTax(id) {
        InventoryLoader.show();
        request("/" + id + "/")
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    editingId = id;
                    document.getElementById("settings-tax-key").value = body.data.key || "";
                    document.getElementById("settings-tax-value").value = body.data.value || "";
                    openForm(true);
                } else {
                    InventoryToast.error(body.message || "Failed to load tax.");
                }
            })
            .catch(function () {
                InventoryToast.error("Network error while loading tax.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function deleteTax(id) {
        InventoryConfirm.delete({
            title: "Delete tax?",
            message: "This tax entry will be removed."
        }).then(function (confirmed) {
            if (!confirmed) return;

            InventoryLoader.show();
            request("/" + id + "/", { method: "DELETE" })
                .then(function (body) {
                    if (body && body.isSuccess) {
                        InventoryToast.success(body.message || "Tax deleted.");
                        loadTaxes(currentPage);
                    } else {
                        InventoryToast.error(body.message || "Failed to delete tax.");
                    }
                })
                .catch(function () {
                    InventoryToast.error("Network error while deleting tax.");
                })
                .finally(function () {
                    InventoryLoader.hide();
                });
        });
    }

    function init() {
        if (init._wired) return;

        var tableBody = document.getElementById("settings-tax-table-body");
        if (!tableBody) return;

        init._wired = true;

        var addBtn = document.getElementById("settings-tax-add-btn");
        var saveBtn = document.getElementById("settings-tax-save-btn");

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

        if (saveBtn) saveBtn.addEventListener("click", saveTax);

        tableBody.addEventListener("click", function (e) {
            var editBtn = e.target.closest("[data-tax-edit]");
            var deleteBtn = e.target.closest("[data-tax-delete]");
            if (editBtn) {
                editTax(editBtn.getAttribute("data-tax-edit"));
            } else if (deleteBtn) {
                deleteTax(deleteBtn.getAttribute("data-tax-delete"));
            }
        });

        InventoryBusiness.whenReady(function () {
            if (!InventoryBusiness.getActiveId()) return;
            loadTaxes(1);
            if (window.InventorySidebar && InventorySidebar.consumeAddAction()) {
                openForm(false);
            }
        });

        window.addEventListener("inventory:business-changed", function () {
            closeForm();
            if (InventoryBusiness.getActiveId()) loadTaxes(1);
            else renderRows([]);
        });
    }

    return { init: init };
})();
