var InventoryCatalog = (function () {
    "use strict";

    var CATALOG_API = "/api/catalog";
    var configs = {
        units: {
            title: "Unit",
            plural: "Units",
            columns: [
                { key: "name", label: "Name" },
                { key: "short_name", label: "Short Name" }
            ],
            fields: [
                { id: "name", label: "Unit Name", type: "text", required: true, placeholder: "e.g. Piece" },
                { id: "short_name", label: "Short Name", type: "text", required: true, placeholder: "e.g. pcs" }
            ],
            validate: function (payload) {
                if (!payload.name) return "Unit name is required.";
                if (!payload.short_name) return "Unit short name is required.";
                return null;
            }
        },
        categories: {
            title: "Category",
            plural: "Categories",
            columns: [
                { key: "name", label: "Name" },
                { key: "description", label: "Description" }
            ],
            fields: [
                { id: "name", label: "Category Name", type: "text", required: true, placeholder: "Category name" },
                { id: "description", label: "Description", type: "textarea", required: false, placeholder: "Optional description" }
            ],
            validate: function (payload) {
                if (!payload.name) return "Category name is required.";
                return null;
            }
        },
        brands: {
            title: "Brand",
            plural: "Brands",
            columns: [
                { key: "name", label: "Name" }
            ],
            fields: [
                { id: "name", label: "Brand Name", type: "text", required: true, placeholder: "Brand name" }
            ],
            validate: function (payload) {
                if (!payload.name) return "Brand name is required.";
                return null;
            }
        },
        vendors: {
            title: "Vendor",
            plural: "Vendors",
            columns: [
                { key: "name", label: "Name" }
            ],
            fields: [
                { id: "name", label: "Vendor Name", type: "text", required: true, placeholder: "Vendor name" }
            ],
            validate: function (payload) {
                if (!payload.name) return "Vendor name is required.";
                return null;
            }
        }
    };

    var resource = "";
    var config = null;
    var listPanelId = "";
    var formPanelId = "";
    var editingId = null;
    var currentPage = 1;
    var currentSearch = "";
    var currentOrdering = "name";
    var searchTimer = null;
    var cachedItems = [];
    var bulkSelect = null;
    var columnCtrl = null;

    function buildCatalogColumnDefs() {
        if (!config) return [];
        return config.columns.map(function (col, index) {
            return {
                id: col.key,
                label: col.label,
                locked: index === 0,
                sortKey: col.key,
                cell: function (item) {
                    return "<td>" + cellValue(item, col.key) + "</td>";
                }
            };
        });
    }

    function getColumnCtrl() {
        if (!columnCtrl && config) {
            columnCtrl = InventoryColumnCustomize.create({
                tableKey: "catalog-" + resource,
                theadSelector: "#catalog-page .inv-mgmt-table thead tr",
                toolbarSelector: "#catalog-page .inv-mgmt-toolbar",
                includeBulkCheck: false,
                bulkHeaderHtml: '<th class="inv-col-check d-none"><input type="checkbox" class="inv-bulk-select-all" aria-label="Select all"/></th>',
                sortDefault: "name",
                onSortChange: function (ordering) {
                    currentOrdering = ordering;
                    loadList(1);
                },
                columns: buildCatalogColumnDefs(),
                onApply: function () {
                    renderRows(cachedItems);
                }
            });
            columnCtrl.mount();
            columnCtrl.renderHeader();
        }
        return columnCtrl;
    }

    function getBulkSelect() {
        if (!bulkSelect) {
            bulkSelect = InventoryBulkSelect.create({
                tbodyId: resource + "-table-body",
                tableSelector: "#catalog-page .inv-mgmt-table",
                entitySingular: config ? config.title : "Record",
                entityPlural: config ? config.plural : "Records",
                onDelete: bulkDeleteItems,
                onPdf: exportCatalogPdf,
                onPrint: exportCatalogPrint
            });
        }
        return bulkSelect;
    }

    function getSelectedItems(ids) {
        return cachedItems.filter(function (item) {
            return ids.indexOf(String(item.id)) !== -1;
        });
    }

    function exportCatalogPdf(ids) {
        var items = getSelectedItems(ids);
        if (!items.length || !config) return;
        var headers = config.columns.map(function (col) { return col.label; });
        var rows = items.map(function (item) {
            return config.columns.map(function (col) {
                var value = item[col.key];
                return value == null ? "" : String(value);
            });
        });
        InventoryDocumentExport.downloadTablePdf(config.plural, headers, rows, resource + ".pdf");
    }

    function exportCatalogPrint(ids) {
        var items = getSelectedItems(ids);
        if (!items.length || !config) return;
        var headers = config.columns.map(function (col) { return col.label; });
        var rows = items.map(function (item) {
            return config.columns.map(function (col) {
                var value = item[col.key];
                return value == null ? "" : String(value);
            });
        });
        var html = InventoryDocumentExport.buildTableHtml(config.plural, headers, rows);
        InventoryDocumentExport.printHtml(config.plural, html);
    }

    function bulkDeleteItems(ids) {
        InventoryConfirm.delete({
            title: "Delete selected " + (config ? config.plural.toLowerCase() : "records") + "?",
            message: ids.length + " record(s) will be removed."
        }).then(function (confirmed) {
            if (!confirmed) return;

            InventoryLoader.show();
            var chain = Promise.resolve();
            var deleted = 0;
            var failed = 0;

            ids.forEach(function (id) {
                chain = chain.then(function () {
                    return request(String(id) + "/", { method: "DELETE" }).then(function (body) {
                        if (body && body.isSuccess) {
                            deleted++;
                            getBulkSelect().removeId(id);
                        } else {
                            failed++;
                        }
                    }).catch(function () {
                        failed++;
                    });
                });
            });

            chain.finally(function () {
                InventoryLoader.hide();
                if (deleted) InventoryToast.success(deleted + " record(s) deleted.");
                if (failed) InventoryToast.error(failed + " record(s) could not be deleted.");
                getBulkSelect().clearSelection();
                loadList(currentPage);
            });
        });
    }

    function request(path, opts) {
        path = path == null ? "" : String(path);
        if (path.charAt(0) === "?") {
            return InventoryApi.request(CATALOG_API, "/" + resource + "/" + path, opts);
        }
        if (!path) {
            return InventoryApi.request(CATALOG_API, "/" + resource + "/", opts);
        }
        return InventoryApi.request(CATALOG_API, "/" + resource + "/" + path.replace(/^\//, ""), opts);
    }

    function buildQuery(page) {
        var params = new URLSearchParams();
        params.set("page", String(page || 1));
        params.set("page_size", String(InventoryPagination.getPageSize(resource + "-pagination")));
        if (currentSearch) params.set("search", currentSearch);
        if (currentOrdering) params.set("ordering", currentOrdering);
        return "?" + params.toString();
    }

    function renderTableHead() {
        var ctrl = getColumnCtrl();
        if (ctrl) ctrl.renderHeader();
    }

    function getCatalogFormRowsContainer() {
        return document.getElementById("catalog-form-rows");
    }

    function getCatalogFormRows() {
        var container = getCatalogFormRowsContainer();
        if (!container) return [];
        return Array.prototype.slice.call(container.querySelectorAll(".inv-catalog-form-row"));
    }

    function rowField(row, selector) {
        return row ? row.querySelector(selector) : null;
    }

    function renderCatalogFieldInput(field, withId) {
        var idAttr = withId ? ' id="catalog-field-' + field.id + '"' : "";
        var className = "inv-catalog-field-" + field.id;
        var placeholder = InventoryApi.escapeHtml(field.placeholder || "");
        if (field.type === "textarea") {
            return (
                '<textarea' + idAttr + ' class="inv-mgmt-textarea ' + className + '" rows="3" placeholder="' +
                placeholder + '"></textarea>'
            );
        }
        return (
            '<input' + idAttr + ' class="inv-mgmt-input ' + className + '" type="text" placeholder="' +
            placeholder + '"' + (field.required ? " required" : "") + "/>"
        );
    }

    function renderCatalogRowFieldsHtml(withId) {
        return config.fields.map(function (field) {
            var fullClass = field.type === "textarea" ? " inv-mgmt-field--full" : "";
            var labelFor = withId ? ' for="catalog-field-' + field.id + '"' : "";
            return (
                '<div class="inv-mgmt-field' + fullClass + '">' +
                "<label" + labelFor + ">" + field.label + "</label>" +
                renderCatalogFieldInput(field, withId) +
                "</div>"
            );
        }).join("");
    }

    function renderFormFields() {
        var wrap = document.getElementById(resource + "-form-fields");
        if (!wrap || !config) return;
        wrap.innerHTML =
            '<div id="catalog-form-rows" class="inv-product-form-rows">' +
            '<div class="inv-catalog-form-row inv-product-form-row" data-row-index="0">' +
            '<div class="inv-mgmt-form-grid" style="padding:0;">' +
            renderCatalogRowFieldsHtml(true) +
            "</div></div></div>" +
            '<template id="catalog-form-row-template">' +
            '<div class="inv-catalog-form-row inv-product-form-row" data-row-index="">' +
            '<div class="inv-mgmt-form-grid" style="padding:0;">' +
            renderCatalogRowFieldsHtml(false) +
            "</div></div></template>";
    }

    function collectPayloadFromRow(row) {
        var payload = {};
        config.fields.forEach(function (field) {
            var el = rowField(row, ".inv-catalog-field-" + field.id);
            payload[field.id] = el ? String(el.value || "").trim() : "";
        });
        return payload;
    }

    function clearCatalogRowFields(row) {
        if (!row) return;
        config.fields.forEach(function (field) {
            var el = rowField(row, ".inv-catalog-field-" + field.id);
            if (el) el.value = "";
        });
    }

    function populateCatalogRow(row, item) {
        if (!row || !item) return;
        config.fields.forEach(function (field) {
            var el = rowField(row, ".inv-catalog-field-" + field.id);
            if (el) el.value = item[field.id] != null ? item[field.id] : "";
        });
    }

    function removeExtraCatalogRows() {
        var rows = getCatalogFormRows();
        for (var i = rows.length - 1; i > 0; i--) {
            rows[i].remove();
        }
        ensureCatalogRowHeads();
    }

    function ensureCatalogRowHeads() {
        var rows = getCatalogFormRows();
        var labelPrefix = config ? config.title : "Item";
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
            label.textContent = labelPrefix + " " + (idx + 1);
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

    function updateCatalogSaveButtonLabel() {
        var saveBtn = document.getElementById(resource + "-save-btn");
        if (!saveBtn || editingId || !config) return;
        var count = getCatalogFormRows().length;
        if (count > 1) {
            saveBtn.textContent = "Save " + count + " " + config.plural;
        } else {
            saveBtn.textContent = "Save " + config.title;
        }
    }

    function toggleCatalogAddMoreButton(show) {
        var btn = document.getElementById(resource + "-add-more-btn");
        if (btn) btn.classList.toggle("inv-hidden", !show);
    }

    function addCatalogFormRow() {
        if (editingId) return;
        var tpl = document.getElementById("catalog-form-row-template");
        var container = getCatalogFormRowsContainer();
        if (!tpl || !container) return;

        var rows = getCatalogFormRows();
        var clone = tpl.content.firstElementChild.cloneNode(true);
        clone.setAttribute("data-row-index", String(rows.length));
        container.appendChild(clone);
        ensureCatalogRowHeads();
        updateCatalogSaveButtonLabel();
        var firstField = rowField(clone, ".inv-catalog-field-" + config.fields[0].id);
        if (firstField) firstField.focus();
    }

    function removeCatalogFormRow(row) {
        if (editingId || !row) return;
        if (getCatalogFormRows().length <= 1) return;
        row.remove();
        getCatalogFormRows().forEach(function (r, idx) {
            r.setAttribute("data-row-index", String(idx));
        });
        ensureCatalogRowHeads();
        updateCatalogSaveButtonLabel();
    }

    function validateCatalogPayload(payload, rowLabel) {
        var err = config.validate(payload);
        if (!err) return null;
        return rowLabel ? err.replace(/\.$/, "") + " (" + rowLabel + ")." : err;
    }

    function saveCatalogItemsSequential(payloads, btn) {
        InventoryLoader.button(btn, true, "Saving...");
        var saved = 0;
        var chain = Promise.resolve();

        payloads.forEach(function (payload, index) {
            chain = chain.then(function () {
                return request("", { method: "POST", body: payload }).then(function (body) {
                    if (body && body.isSuccess) {
                        saved++;
                        return;
                    }
                    var msg = body && body.message ? body.message : "Unable to save.";
                    if (body && body.errors && body.errors.length) msg = body.errors.join(" • ");
                    var rowNum = index + 1;
                    throw new Error(msg + (payloads.length > 1 ? " (" + config.title + " " + rowNum + ")" : ""));
                });
            });
        });

        chain
            .then(function () {
                InventoryToast.success(
                    saved === 1
                        ? config.title + " added."
                        : saved + " " + config.plural.toLowerCase() + " added."
                );
                InventoryPagePanel.showList(listPanelId);
                loadList(1);
            })
            .catch(function (err) {
                InventoryToast.error(err && err.message ? err.message : "Network error. Please try again.");
                if (saved) loadList(1);
            })
            .finally(function () {
                InventoryLoader.button(btn, false);
                updateCatalogSaveButtonLabel();
            });
    }

    function cellValue(item, key) {
        var value = item[key];
        if (value === null || value === undefined || String(value).trim() === "") return "—";
        return InventoryApi.escapeHtml(String(value));
    }

    function renderRows(items) {
        var tbody = document.getElementById(resource + "-table-body");
        if (!tbody || !config) return;
        var colCount = (getColumnCtrl() ? getColumnCtrl().getColspan() : config.columns.length + 1);
        var cols = getColumnCtrl();

        if (!items || !items.length) {
            tbody.innerHTML = '<tr><td colspan="' + colCount + '" class="inv-mgmt-empty">No ' +
                config.plural.toLowerCase() + " found.</td></tr>";
            return;
        }

        cachedItems = items;

        tbody.innerHTML = items.map(function (item) {
            return (
                "<tr>" +
                cols.renderRowCells(item) +
                '<td class="inv-col-action inv-mgmt-cell--action"><div class="inv-row-actions">' +
                '<button type="button" class="inv-row-action-btn inv-row-action-btn--edit catalog-edit" data-id="' + item.id + '" title="Edit" aria-label="Edit">' +
                '<span class="material-symbols-outlined">edit</span></button>' +
                '<button type="button" class="inv-row-action-btn inv-row-action-btn--delete catalog-delete" data-id="' + item.id + '" title="Delete" aria-label="Delete">' +
                '<span class="material-symbols-outlined">delete</span></button>' +
                "</div></td></tr>"
            );
        }).join("");
    }

    function loadList(page) {
        currentPage = page || 1;
        InventoryLoader.show();
        return request(buildQuery(currentPage))
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    renderRows(body.data.items || []);
                    InventoryPagination.render(resource + "-pagination", body.data.pagination, function (p) {
                        loadList(p);
                    }, {
                        onPageSizeChange: function () {
                            loadList(1);
                        }
                    });
                } else {
                    renderRows([]);
                    InventoryPagination.render(resource + "-pagination", null, function () {});
                    InventoryToast.error(body.message || "Failed to load list.");
                }
            })
            .catch(function () {
                renderRows([]);
                InventoryToast.error("Network error while loading list.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function resetForm() {
        editingId = null;
        removeExtraCatalogRows();
        var firstRow = getCatalogFormRows()[0];
        if (firstRow) clearCatalogRowFields(firstRow);
        document.getElementById(resource + "-form-title").textContent = "Add " + config.title;
        toggleCatalogAddMoreButton(true);
        updateCatalogSaveButtonLabel();
    }

    function openFormPanel() {
        resetForm();
        InventoryPagePanel.showPanel(listPanelId, formPanelId);
        var first = document.getElementById("catalog-field-" + config.fields[0].id);
        if (first) first.focus();
    }

    function openEditPanel(id) {
        InventoryLoader.show();
        request(String(id) + "/")
            .then(function (body) {
                if (!body || !body.isSuccess || !body.data) {
                    InventoryToast.error(body.message || "Failed to load record.");
                    return;
                }
                editingId = body.data.id;
                removeExtraCatalogRows();
                populateCatalogRow(getCatalogFormRows()[0], body.data);
                document.getElementById(resource + "-form-title").textContent = "Edit " + config.title;
                document.getElementById(resource + "-save-btn").textContent = "Update " + config.title;
                toggleCatalogAddMoreButton(false);
                InventoryPagePanel.showPanel(listPanelId, formPanelId);
            })
            .catch(function () {
                InventoryToast.error("Network error while loading record.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function saveItem() {
        var btn = document.getElementById(resource + "-save-btn");
        var rows = getCatalogFormRows();

        if (editingId) {
            var editPayload = collectPayloadFromRow(rows[0]);
            var editErr = validateCatalogPayload(editPayload, null);
            if (editErr) {
                InventoryToast.error(editErr);
                return;
            }
            InventoryLoader.button(btn, true, "Updating...");
            request(String(editingId) + "/", { method: "PATCH", body: editPayload })
                .then(function (body) {
                    if (body && body.isSuccess) {
                        InventoryToast.success(config.title + " updated.");
                        InventoryPagePanel.showList(listPanelId);
                        loadList(currentPage);
                    } else {
                        var msg = body.message || "Unable to save.";
                        if (body.errors && body.errors.length) msg = body.errors.join(" • ");
                        InventoryToast.error(msg);
                    }
                })
                .catch(function () {
                    InventoryToast.error("Network error. Please try again.");
                })
                .finally(function () {
                    InventoryLoader.button(btn, false);
                });
            return;
        }

        if (!rows.length) return;

        var payloads = [];
        for (var i = 0; i < rows.length; i++) {
            var rowLabel = rows.length > 1 ? config.title + " " + (i + 1) : null;
            var payload = collectPayloadFromRow(rows[i]);
            var err = validateCatalogPayload(payload, rowLabel);
            if (err) {
                InventoryToast.error(err);
                return;
            }
            payloads.push(payload);
        }

        if (payloads.length === 1) {
            InventoryLoader.button(btn, true, "Saving...");
            request("", { method: "POST", body: payloads[0] })
                .then(function (body) {
                    if (body && body.isSuccess) {
                        InventoryToast.success(config.title + " added.");
                        InventoryPagePanel.showList(listPanelId);
                        loadList(1);
                    } else {
                        var singleMsg = body.message || "Unable to save.";
                        if (body.errors && body.errors.length) singleMsg = body.errors.join(" • ");
                        InventoryToast.error(singleMsg);
                    }
                })
                .catch(function () {
                    InventoryToast.error("Network error. Please try again.");
                })
                .finally(function () {
                    InventoryLoader.button(btn, false);
                });
            return;
        }

        saveCatalogItemsSequential(payloads, btn);
    }

    function deleteItem(id, btn) {
        InventoryConfirm.delete({
            title: "Delete " + config.title.toLowerCase() + "?",
            message: "This " + config.title.toLowerCase() + " will be removed."
        }).then(function (confirmed) {
            if (!confirmed) return;
            InventoryLoader.button(btn, true, "");
            request(String(id) + "/", { method: "DELETE" })
                .then(function (body) {
                    if (body && body.isSuccess) {
                        InventoryToast.success(config.title + " deleted.");
                        loadList(currentPage);
                    } else {
                        InventoryToast.error(body.message || "Unable to delete.");
                    }
                })
                .catch(function () {
                    InventoryToast.error("Network error. Please try again.");
                })
                .finally(function () {
                    InventoryLoader.button(btn, false);
                });
        });
    }

    function init() {
        var root = document.getElementById("catalog-page");
        if (!root) return;

        resource = root.getAttribute("data-resource") || "";
        config = configs[resource];
        if (!config) {
            var missingTbody = document.getElementById(resource + "-table-body");
            if (missingTbody) {
                missingTbody.innerHTML =
                    '<tr><td colspan="4" class="inv-mgmt-empty">Unable to load this page. Please refresh the browser.</td></tr>';
            }
            return;
        }

        listPanelId = root.getAttribute("data-list-panel") || resource + "-list-panel";
        formPanelId = root.getAttribute("data-form-panel") || resource + "-form-panel";

        renderTableHead();
        renderFormFields();
        InventoryPagePanel.init();

        var openBtn = document.getElementById(resource + "-open-form-btn");
        var saveBtn = document.getElementById(resource + "-save-btn");
        var searchEl = document.getElementById(resource + "-search");
        var tbody = document.getElementById(resource + "-table-body");

        function boot() {
            if (!InventoryBusiness.getActiveId()) {
                renderRows([]);
                return;
            }
            loadList(1);
        }

        InventoryBusiness.whenReady(function () {
            boot();
            if (window.InventorySidebar && InventorySidebar.consumeAddAction()) {
                openFormPanel();
            }
        });
        window.addEventListener("inventory:business-changed", function () {
            currentPage = 1;
            boot();
        });

        if (openBtn) openBtn.addEventListener("click", openFormPanel);
        if (saveBtn) saveBtn.addEventListener("click", saveItem);

        var addMoreBtn = document.getElementById(resource + "-add-more-btn");
        if (addMoreBtn) addMoreBtn.addEventListener("click", addCatalogFormRow);

        var formRowsContainer = getCatalogFormRowsContainer();
        if (formRowsContainer) {
            formRowsContainer.addEventListener("click", function (e) {
                var removeBtn = e.target.closest(".inv-product-row-remove");
                if (removeBtn) {
                    var row = removeBtn.closest(".inv-catalog-form-row");
                    if (row) removeCatalogFormRow(row);
                }
            });
        }

        if (searchEl) {
            searchEl.addEventListener("input", function () {
                window.clearTimeout(searchTimer);
                searchTimer = window.setTimeout(function () {
                    currentSearch = searchEl.value.trim();
                    loadList(1);
                }, 300);
            });
        }

        if (tbody) {
            tbody.addEventListener("click", function (e) {
                var editBtn = e.target.closest(".catalog-edit");
                if (editBtn) {
                    openEditPanel(editBtn.getAttribute("data-id"));
                    return;
                }
                var deleteBtn = e.target.closest(".catalog-delete");
                if (deleteBtn) {
                    deleteItem(deleteBtn.getAttribute("data-id"), deleteBtn);
                }
            });
        }
    }

    return { init: init };
})();
