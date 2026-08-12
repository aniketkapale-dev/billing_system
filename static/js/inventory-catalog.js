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
            buildPayload: function () {
                return {
                    name: document.getElementById("catalog-field-name").value.trim(),
                    short_name: document.getElementById("catalog-field-short_name").value.trim()
                };
            },
            validate: function (payload) {
                if (!payload.name) return "Unit name is required.";
                if (!payload.short_name) return "Unit short name is required.";
                return null;
            },
            populate: function (item) {
                document.getElementById("catalog-field-name").value = item.name || "";
                document.getElementById("catalog-field-short_name").value = item.short_name || "";
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
            buildPayload: function () {
                return {
                    name: document.getElementById("catalog-field-name").value.trim(),
                    description: document.getElementById("catalog-field-description").value.trim()
                };
            },
            validate: function (payload) {
                if (!payload.name) return "Category name is required.";
                return null;
            },
            populate: function (item) {
                document.getElementById("catalog-field-name").value = item.name || "";
                document.getElementById("catalog-field-description").value = item.description || "";
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
            buildPayload: function () {
                return {
                    name: document.getElementById("catalog-field-name").value.trim()
                };
            },
            validate: function (payload) {
                if (!payload.name) return "Brand name is required.";
                return null;
            },
            populate: function (item) {
                document.getElementById("catalog-field-name").value = item.name || "";
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
                includeBulkCheck: true,
                bulkHeaderHtml: '<th class="inv-col-check"><input type="checkbox" class="inv-bulk-select-all" aria-label="Select all"/></th>',
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

    function renderFormFields() {
        var wrap = document.getElementById(resource + "-form-fields");
        if (!wrap || !config) return;
        wrap.innerHTML = config.fields.map(function (field) {
            var fullClass = field.type === "textarea" ? " inv-mgmt-field--full" : "";
            var input;
            if (field.type === "textarea") {
                input = '<textarea id="catalog-field-' + field.id + '" class="inv-mgmt-textarea" rows="3" placeholder="' +
                    InventoryApi.escapeHtml(field.placeholder || "") + '"></textarea>';
            } else {
                input = '<input id="catalog-field-' + field.id + '" class="inv-mgmt-input" type="text" placeholder="' +
                    InventoryApi.escapeHtml(field.placeholder || "") + '"' + (field.required ? " required" : "") + "/>";
            }
            return (
                '<div class="inv-mgmt-field' + fullClass + '">' +
                "<label for=\"catalog-field-" + field.id + "\">" + field.label + "</label>" +
                input +
                "</div>"
            );
        }).join("");
    }

    function cellValue(item, key) {
        var value = item[key];
        if (value === null || value === undefined || String(value).trim() === "") return "—";
        return InventoryApi.escapeHtml(String(value));
    }

    function renderRows(items) {
        var tbody = document.getElementById(resource + "-table-body");
        if (!tbody || !config) return;
        var colCount = (getColumnCtrl() ? getColumnCtrl().getColspan() : config.columns.length + 2);
        var bulk = getBulkSelect();
        var cols = getColumnCtrl();

        if (!items || !items.length) {
            tbody.innerHTML = '<tr><td colspan="' + colCount + '" class="inv-mgmt-empty">No ' +
                config.plural.toLowerCase() + " found.</td></tr>";
            bulk.afterRender();
            return;
        }

        cachedItems = items;

        tbody.innerHTML = items.map(function (item) {
            return (
                "<tr>" +
                bulk.rowCellHtml(item.id, item) +
                cols.renderRowCells(item) +
                '<td><div class="inv-row-actions">' +
                '<button type="button" class="inv-row-action-btn inv-row-action-btn--edit catalog-edit" data-id="' + item.id + '" title="Edit" aria-label="Edit">' +
                '<span class="material-symbols-outlined">edit</span></button>' +
                "</div></td></tr>"
            );
        }).join("");

        bulk.afterRender();
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
        config.fields.forEach(function (field) {
            var el = document.getElementById("catalog-field-" + field.id);
            if (el) el.value = "";
        });
        document.getElementById(resource + "-form-title").textContent = "Add " + config.title;
        document.getElementById(resource + "-save-btn").textContent = "Save " + config.title;
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
                config.populate(body.data);
                document.getElementById(resource + "-form-title").textContent = "Edit " + config.title;
                document.getElementById(resource + "-save-btn").textContent = "Update " + config.title;
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
        var payload = config.buildPayload();
        var err = config.validate(payload);
        if (err) {
            InventoryToast.error(err);
            return;
        }

        var btn = document.getElementById(resource + "-save-btn");
        InventoryLoader.button(btn, true, editingId ? "Updating..." : "Saving...");

        request(editingId ? String(editingId) + "/" : "", {
            method: editingId ? "PATCH" : "POST",
            body: payload
        })
            .then(function (body) {
                if (body && body.isSuccess) {
                    InventoryToast.success(editingId ? config.title + " updated." : config.title + " added.");
                    InventoryPagePanel.showList(listPanelId);
                    loadList(editingId ? currentPage : 1);
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
        if (!config) return;

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
            if (!InventoryBusiness.getActiveId()) return;
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
                }
            });
        }
    }

    return { init: init };
})();
