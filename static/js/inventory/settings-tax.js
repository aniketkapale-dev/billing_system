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

    function isModalMode() {
        return !!document.getElementById("tax-modal");
    }

    function isListPage() {
        return !!document.getElementById("settings-tax-table-body");
    }

    function getTaxFormRowsContainer() {
        return document.getElementById("settings-tax-form-rows");
    }

    function getTaxFormRows() {
        var container = getTaxFormRowsContainer();
        if (!container) return [];
        return Array.prototype.slice.call(container.querySelectorAll(".inv-product-form-row"));
    }

    function taxRowField(row, selector) {
        return row ? row.querySelector(selector) : null;
    }

    function removeExtraTaxRows() {
        var rows = getTaxFormRows();
        for (var i = rows.length - 1; i > 0; i--) {
            rows[i].remove();
        }
        ensureTaxRowHeads();
    }

    function clearTaxRowFields(row) {
        if (!row) return;
        var keyEl = taxRowField(row, ".inv-tax-field-key");
        var valueEl = taxRowField(row, ".inv-tax-field-value");
        if (keyEl) keyEl.value = "";
        if (valueEl) valueEl.value = "";
    }

    function ensureTaxRowHeads() {
        var rows = getTaxFormRows();
        if (rows.length <= 1) {
            rows.forEach(function (row) {
                var head = row.querySelector(".inv-product-form-row-head");
                if (head) head.remove();
            });
            return;
        }
        rows.forEach(function (row, idx) {
            var head = row.querySelector(".inv-product-form-row-head");
            if (!head) {
                head = document.createElement("div");
                head.className = "inv-product-form-row-head";
                row.insertBefore(head, row.firstChild);
            }
            var label = head.querySelector(".inv-product-form-row-label");
            if (!label) {
                label = document.createElement("span");
                label.className = "inv-product-form-row-label";
                head.appendChild(label);
            }
            label.textContent = "Tax " + (idx + 1);
            var removeBtn = head.querySelector(".inv-product-row-remove");
            if (idx > 0) {
                if (!removeBtn) {
                    removeBtn = document.createElement("button");
                    removeBtn.type = "button";
                    removeBtn.className = "inv-product-row-remove inv-mgmt-btn";
                    removeBtn.innerHTML = '<span class="material-symbols-outlined">close</span> Remove';
                    head.appendChild(removeBtn);
                }
            } else if (removeBtn) {
                removeBtn.remove();
            }
        });
    }

    function updateTaxSaveButtonLabel() {
        var saveBtn = document.getElementById("settings-tax-save-btn");
        if (!saveBtn || editingId || isModalMode()) return;
        var count = getTaxFormRows().length;
        saveBtn.textContent = count > 1 ? "Save " + count + " Taxes" : "Save Tax";
    }

    function toggleTaxAddMoreButton(show) {
        var btn = document.getElementById("settings-tax-add-more-btn");
        if (btn) btn.classList.toggle("inv-hidden", !show || isModalMode());
    }

    function addTaxFormRow() {
        if (editingId || isModalMode()) return;
        var tpl = document.getElementById("settings-tax-row-template");
        var container = getTaxFormRowsContainer();
        if (!tpl || !container) return;

        var rows = getTaxFormRows();
        var clone = tpl.content.firstElementChild.cloneNode(true);
        clone.setAttribute("data-row-index", String(rows.length));
        container.appendChild(clone);
        ensureTaxRowHeads();
        updateTaxSaveButtonLabel();
        var keyEl = taxRowField(clone, ".inv-tax-field-key");
        if (keyEl) keyEl.focus();
    }

    function removeTaxFormRow(row) {
        if (editingId || isModalMode() || !row) return;
        if (getTaxFormRows().length <= 1) return;
        row.remove();
        getTaxFormRows().forEach(function (r, idx) {
            r.setAttribute("data-row-index", String(idx));
        });
        ensureTaxRowHeads();
        updateTaxSaveButtonLabel();
    }

    function collectPayloadFromRow(row) {
        return {
            key: taxRowField(row, ".inv-tax-field-key").value.trim(),
            value: taxRowField(row, ".inv-tax-field-value").value.trim()
        };
    }

    function resetForm() {
        editingId = null;
        if (isModalMode()) {
            var keyEl = document.getElementById("settings-tax-key");
            var valueEl = document.getElementById("settings-tax-value");
            if (keyEl) keyEl.value = "";
            if (valueEl) valueEl.value = "";
            return;
        }
        removeExtraTaxRows();
        clearTaxRowFields(getTaxFormRows()[0]);
        toggleTaxAddMoreButton(isListPage());
        updateTaxSaveButtonLabel();
    }

    function openAddModal() {
        if (!InventoryBusiness.getActiveId()) {
            InventoryToast.error("Select or create a business first.");
            return;
        }
        resetForm();
        if (isModalMode()) {
            InventoryModal.open("tax-modal");
            var keyEl = document.getElementById("settings-tax-key");
            if (keyEl) keyEl.focus();
            return;
        }
        openForm(false);
    }

    function openForm(isEdit) {
        var title = document.getElementById("settings-tax-form-title");
        if (!title) return;

        if (!isEdit) {
            resetForm();
            title.textContent = "Add Tax";
        } else {
            title.textContent = "Edit Tax";
            toggleTaxAddMoreButton(false);
        }

        InventoryPagePanel.showPanel(LIST_PANEL, FORM_PANEL);
        document.getElementById("settings-tax-key").focus();
    }

    function closeForm() {
        editingId = null;
        InventoryPagePanel.showList(LIST_PANEL);
    }

    function collectPayload() {
        if (isModalMode()) {
            return {
                key: (document.getElementById("settings-tax-key") || { value: "" }).value.trim(),
                value: (document.getElementById("settings-tax-value") || { value: "" }).value.trim()
            };
        }
        var firstRow = getTaxFormRows()[0];
        if (!firstRow) {
            return { key: "", value: "" };
        }
        return collectPayloadFromRow(firstRow);
    }

    function validatePayload(payload) {
        if (!payload.key) return "Tax key is required (e.g. gst12%).";
        if (payload.value === "") return "Tax value is required (e.g. 12).";
        var num = Number(payload.value);
        if (Number.isNaN(num)) return "Tax value must be a number.";
        if (num < 0 || num > 100) return "Tax value must be between 0 and 100.";
        return null;
    }

    function saveTaxesSequential(payloads, btn) {
        InventoryLoader.button(btn, true, "Saving...");
        var saved = 0;
        var chain = Promise.resolve();

        payloads.forEach(function (payload, index) {
            chain = chain.then(function () {
                return request("/", { method: "POST", body: payload }).then(function (body) {
                    if (body && body.isSuccess) {
                        saved++;
                        return;
                    }
                    var msg = body && body.message ? body.message : "Failed to save tax.";
                    throw new Error(msg + (payloads.length > 1 ? " (Tax " + (index + 1) + ")" : ""));
                });
            });
        });

        chain
            .then(function () {
                InventoryToast.success(saved === 1 ? "Tax added." : saved + " taxes added.");
                closeForm();
                loadTaxes(1);
            })
            .catch(function (err) {
                InventoryToast.error(err && err.message ? err.message : "Network error while saving tax.");
                if (saved) loadTaxes(1);
            })
            .finally(function () {
                InventoryLoader.button(btn, false);
                updateTaxSaveButtonLabel();
            });
    }

    function saveTax() {
        var btn = document.getElementById("settings-tax-save-btn");
        var rows = getTaxFormRows();

        if (isModalMode() || editingId) {
            var payload = collectPayload();
            var error = validatePayload(payload);
            if (error) {
                InventoryToast.error(error);
                return;
            }
            InventoryLoader.button(btn, true);
            request(editingId ? "/" + editingId + "/" : "/", { method: editingId ? "PATCH" : "POST", body: payload })
                .then(function (body) {
                    if (body && body.isSuccess) {
                        InventoryToast.success(body.message || (editingId ? "Tax updated." : "Tax added."));
                        if (isModalMode()) {
                            InventoryModal.close("tax-modal");
                            resetForm();
                            if (body.data) {
                                window.dispatchEvent(new CustomEvent("inventory:tax-created", {
                                    detail: { tax: body.data }
                                }));
                            }
                        } else {
                            closeForm();
                            loadTaxes(editingId ? currentPage : 1);
                        }
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
            return;
        }

        if (!rows.length) return;

        var payloads = [];
        for (var i = 0; i < rows.length; i++) {
            var payload = collectPayloadFromRow(rows[i]);
            var err = validatePayload(payload);
            if (err) {
                InventoryToast.error(err + (rows.length > 1 ? " (Tax " + (i + 1) + ")" : ""));
                return;
            }
            payloads.push(payload);
        }

        if (payloads.length === 1) {
            InventoryLoader.button(btn, true, "Saving...");
            request("/", { method: "POST", body: payloads[0] })
                .then(function (body) {
                    if (body && body.isSuccess) {
                        InventoryToast.success("Tax added.");
                        closeForm();
                        loadTaxes(1);
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
            return;
        }

        saveTaxesSequential(payloads, btn);
    }

    function editTax(id) {
        InventoryLoader.show();
        request("/" + id + "/")
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    editingId = id;
                    removeExtraTaxRows();
                    clearTaxRowFields(getTaxFormRows()[0]);
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
        if (!isModalMode() && !isListPage()) return;

        init._wired = true;

        if (isModalMode()) {
            InventoryModal.wire("tax-modal");
        }

        var addBtn = document.getElementById("settings-tax-add-btn");
        var saveBtn = document.getElementById("settings-tax-save-btn");

        if (window.InventoryPagePanel && isListPage()) {
            InventoryPagePanel.init();
        }

        if (addBtn) {
            addBtn.addEventListener("click", function () {
                openAddModal();
            });
        }

        if (saveBtn) saveBtn.addEventListener("click", saveTax);

        var addMoreBtn = document.getElementById("settings-tax-add-more-btn");
        if (addMoreBtn) addMoreBtn.addEventListener("click", addTaxFormRow);

        var formRowsContainer = getTaxFormRowsContainer();
        if (formRowsContainer) {
            formRowsContainer.addEventListener("click", function (e) {
                var removeBtn = e.target.closest(".inv-product-row-remove");
                if (removeBtn) {
                    var row = removeBtn.closest(".inv-product-form-row");
                    if (row) removeTaxFormRow(row);
                }
            });
        }

        var tableBody = document.getElementById("settings-tax-table-body");
        if (tableBody) {
            tableBody.addEventListener("click", function (e) {
                var editBtn = e.target.closest("[data-tax-edit]");
                var deleteBtn = e.target.closest("[data-tax-delete]");
                if (editBtn) {
                    editTax(editBtn.getAttribute("data-tax-edit"));
                } else if (deleteBtn) {
                    deleteTax(deleteBtn.getAttribute("data-tax-delete"));
                }
            });
        }

        if (isListPage()) {
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
    }

    return { init: init, openAddModal: openAddModal };
})();
