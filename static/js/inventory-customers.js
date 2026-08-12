var InventoryCustomers = (function () {
    "use strict";

    var API = "/api/customers";
    var LIST_PANEL = "customers-list-panel";
    var FORM_PANEL = "customers-form-panel";
    var VIEW_PANEL = "customers-view-panel";
    var currentPage = 1;
    var currentSearch = "";
    var currentOrdering = "name";
    var searchTimer = null;
    var editingId = null;
    var cachedItems = [];
    var bulkSelect = null;
    var columnCtrl = null;

    function getColumnCtrl() {
        if (!columnCtrl && isListPage()) {
            columnCtrl = InventoryColumnCustomize.create({
                tableKey: "customers",
                theadSelector: ".inv-mgmt-table--customers thead tr",
                toolbarSelector: "#customers-list-panel .inv-mgmt-toolbar",
                includeBulkCheck: true,
                bulkHeaderHtml: '<th class="inv-col-check"><input type="checkbox" class="inv-bulk-select-all" aria-label="Select all"/></th>',
                sortDefault: "name",
                onSortChange: function (ordering) {
                    currentOrdering = ordering;
                    loadCustomers(1);
                },
                columns: [
                    {
                        id: "name",
                        label: "Full Name",
                        locked: true,
                        sortKey: "name",
                        cell: function (item) { return "<td>" + displayValue(item.name) + "</td>"; }
                    },
                    {
                        id: "mobile",
                        label: "Mobile",
                        sortKey: "mobile",
                        cell: function (item) { return "<td>" + displayValue(item.mobile) + "</td>"; }
                    },
                    {
                        id: "email",
                        label: "Email",
                        sortKey: "email",
                        cell: function (item) { return "<td>" + displayValue(item.email) + "</td>"; }
                    },
                    {
                        id: "address",
                        label: "Address",
                        sortKey: "address",
                        cell: function (item) { return "<td>" + displayValue(item.address) + "</td>"; }
                    }
                ],
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
        if (!bulkSelect && isListPage()) {
            bulkSelect = InventoryBulkSelect.create({
                tbodyId: "customers-table-body",
                tableSelector: ".inv-mgmt-table--customers",
                entitySingular: "Customer",
                entityPlural: "Customers",
                onDelete: bulkDeleteCustomers,
                onPdf: exportCustomersPdf,
                onPrint: exportCustomersPrint
            });
        }
        return bulkSelect;
    }

    function getSelectedItems(ids) {
        return cachedItems.filter(function (item) {
            return ids.indexOf(String(item.id)) !== -1;
        });
    }

    function exportCustomersPdf(ids) {
        var items = getSelectedItems(ids);
        if (!items.length) return;
        InventoryDocumentExport.downloadTablePdf(
            "Customers",
            ["Full Name", "Mobile", "Email", "Address"],
            items.map(function (item) {
                return [item.name || "", item.mobile || "", item.email || "", item.address || ""];
            }),
            "customers.pdf"
        );
    }

    function exportCustomersPrint(ids) {
        var items = getSelectedItems(ids);
        if (!items.length) return;
        var html = InventoryDocumentExport.buildTableHtml(
            "Customers",
            ["Full Name", "Mobile", "Email", "Address"],
            items.map(function (item) {
                return [item.name || "", item.mobile || "", item.email || "", item.address || ""];
            })
        );
        InventoryDocumentExport.printHtml("Customers", html);
    }

    function bulkDeleteCustomers(ids) {
        InventoryConfirm.delete({
            title: "Delete selected customers?",
            message: ids.length + " customer(s) will be removed."
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
                if (deleted) InventoryToast.success(deleted + " customer(s) deleted.");
                if (failed) InventoryToast.error(failed + " customer(s) could not be deleted.");
                getBulkSelect().clearSelection();
                loadCustomers(currentPage);
            });
        });
    }

    function request(path, opts) {
        return InventoryApi.request(API, path, opts);
    }

    function isModalMode() {
        return !!document.getElementById("customer-modal");
    }

    function isListPage() {
        return !!document.getElementById("customers-list-panel");
    }

    function buildQuery(page) {
        var params = new URLSearchParams();
        params.set("page", String(page || 1));
        params.set("page_size", String(InventoryPagination.getPageSize("customers-pagination")));
        if (currentSearch) params.set("search", currentSearch);
        if (currentOrdering) params.set("ordering", currentOrdering);
        return "?" + params.toString();
    }

    function displayValue(value) {
        if (value === null || value === undefined || String(value).trim() === "") return "—";
        return InventoryApi.escapeHtml(String(value));
    }

    function formatDate(value) {
        if (!value) return "—";
        var date = new Date(value);
        if (isNaN(date.getTime())) return "—";
        return date.toLocaleString();
    }

    function renderRows(items) {
        var tbody = document.getElementById("customers-table-body");
        if (!tbody) return;

        var cols = getColumnCtrl();
        var colspan = cols ? cols.getColspan() : 6;

        if (!items || !items.length) {
            tbody.innerHTML = '<tr><td colspan="' + colspan + '" class="inv-mgmt-empty">No customers found.</td></tr>';
            getBulkSelect().afterRender();
            return;
        }

        cachedItems = items;
        var bulk = getBulkSelect();

        tbody.innerHTML = items.map(function (item) {
            return (
                "<tr>" +
                bulk.rowCellHtml(item.id, item) +
                cols.renderRowCells(item) +
                '<td><div class="inv-row-actions">' +
                '<button type="button" class="inv-row-action-btn inv-row-action-btn--view customer-view" data-id="' + item.id + '" title="View" aria-label="View customer">' +
                '<span class="material-symbols-outlined">visibility</span></button>' +
                '<button type="button" class="inv-row-action-btn inv-row-action-btn--edit customer-edit" data-id="' + item.id + '" title="Edit" aria-label="Edit customer">' +
                '<span class="material-symbols-outlined">edit</span></button>' +
                "</div></td></tr>"
            );
        }).join("");

        bulk.afterRender();
    }

    function loadCustomers(page) {
        currentPage = page || 1;
        InventoryLoader.show();
        return request(buildQuery(currentPage))
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    renderRows(body.data.items || []);
                    InventoryPagination.render("customers-pagination", body.data.pagination, function (p) {
                        loadCustomers(p);
                    }, {
                        onPageSizeChange: function () {
                            loadCustomers(1);
                        }
                    });
                } else {
                    renderRows([]);
                    InventoryPagination.render("customers-pagination", null, function () {});
                    InventoryToast.error(body && body.message ? body.message : "Failed to load customers.");
                }
            })
            .catch(function () {
                renderRows([]);
                InventoryToast.error("Network error while loading customers.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function resetForm() {
        editingId = null;
        document.getElementById("customer-name").value = "";
        document.getElementById("customer-mobile").value = "";
        document.getElementById("customer-email").value = "";
        document.getElementById("customer-address").value = "";
        var formTitle = document.getElementById("customer-form-title");
        var modalTitle = document.getElementById("customer-modal-title");
        var saveBtn = document.getElementById("customer-save-btn");
        if (formTitle) formTitle.textContent = "Add Customer";
        if (modalTitle) modalTitle.textContent = "Add Customer";
        if (saveBtn) saveBtn.textContent = "Save Customer";
    }

    function populateForm(customer) {
        document.getElementById("customer-name").value = customer.name || "";
        document.getElementById("customer-mobile").value = customer.mobile || "";
        document.getElementById("customer-email").value = customer.email || "";
        document.getElementById("customer-address").value = customer.address || "";
    }

    function isValidMobile(value) {
        if (window.InventoryAuth && typeof InventoryAuth.isValidMobile === "function") {
            return InventoryAuth.isValidMobile(value);
        }
        return /^[0-9]{10}$/.test(String(value || "").trim());
    }

    function collectPayload() {
        var name = document.getElementById("customer-name").value.trim();
        var mobile = document.getElementById("customer-mobile").value.trim();
        var email = document.getElementById("customer-email").value.trim();
        var address = document.getElementById("customer-address").value.trim();

        if (!name) {
            InventoryToast.error("Full name is required.");
            document.getElementById("customer-name").focus();
            return null;
        }
        if (!mobile) {
            InventoryToast.error("Mobile number is required.");
            document.getElementById("customer-mobile").focus();
            return null;
        }
        if (!isValidMobile(mobile)) {
            InventoryToast.error("Enter a valid 10-digit mobile number.");
            document.getElementById("customer-mobile").focus();
            return null;
        }

        return {
            name: name,
            mobile: mobile,
            email: email,
            address: address
        };
    }

    function openFormPanel() {
        resetForm();
        InventoryPagePanel.showPanel(LIST_PANEL, FORM_PANEL);
        document.getElementById("customer-name").focus();
    }

    function openAddModal() {
        if (!InventoryBusiness.getActiveId()) {
            InventoryToast.error("Select or create a business first.");
            return;
        }
        resetForm();
        if (isModalMode()) {
            InventoryModal.open("customer-modal");
            document.getElementById("customer-name").focus();
            return;
        }
        openFormPanel();
    }

    function renderViewDetails(customer) {
        var container = document.getElementById("customer-view-body");
        if (!container) return;

        var rows = [
            { label: "Full Name", value: displayValue(customer.name) },
            { label: "Mobile", value: displayValue(customer.mobile) },
            { label: "Email", value: displayValue(customer.email) },
            { label: "Address", value: displayValue(customer.address), full: true },
            { label: "Created", value: displayValue(formatDate(customer.created_at)) },
            { label: "Last Updated", value: displayValue(formatDate(customer.updated_at)) }
        ];

        container.innerHTML = rows.map(function (row) {
            var cls = row.full ? " inv-product-view-item--full" : "";
            return (
                '<div class="inv-product-view-item' + cls + '">' +
                '<span class="inv-product-view-label">' + row.label + "</span>" +
                '<div class="inv-product-view-value">' + row.value + "</div>" +
                "</div>"
            );
        }).join("");
    }

    function openViewPanel(id) {
        InventoryLoader.show();
        request("/" + id + "/")
            .then(function (body) {
                if (!body || !body.isSuccess || !body.data) {
                    InventoryToast.error(body && body.message ? body.message : "Failed to load customer.");
                    return;
                }
                var customer = body.data;
                var titleEl = document.getElementById("customer-view-title");
                if (titleEl) titleEl.textContent = customer.name || "Customer Details";
                renderViewDetails(customer);
                InventoryPagePanel.showPanel(LIST_PANEL, VIEW_PANEL);
            })
            .catch(function () {
                InventoryToast.error("Network error while loading customer.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function openEditPanel(id) {
        InventoryLoader.show();
        request("/" + id + "/")
            .then(function (body) {
                if (!body || !body.isSuccess || !body.data) {
                    InventoryToast.error(body && body.message ? body.message : "Failed to load customer.");
                    return;
                }
                editingId = body.data.id;
                populateForm(body.data);
                var formTitle = document.getElementById("customer-form-title");
                var saveBtn = document.getElementById("customer-save-btn");
                if (formTitle) formTitle.textContent = "Edit Customer";
                if (saveBtn) saveBtn.textContent = "Update Customer";
                InventoryPagePanel.showPanel(LIST_PANEL, FORM_PANEL);
            })
            .catch(function () {
                InventoryToast.error("Network error while loading customer.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function saveCustomer() {
        var payload = collectPayload();
        if (!payload) return;

        var btn = document.getElementById("customer-save-btn");
        InventoryLoader.button(btn, true, editingId ? "Updating..." : "Saving...");

        request(editingId ? "/" + editingId + "/" : "", {
            method: editingId ? "PATCH" : "POST",
            body: payload
        })
            .then(function (body) {
                if (body && body.isSuccess) {
                    InventoryToast.success(editingId ? "Customer updated." : "Customer added.");
                    if (isModalMode()) {
                        InventoryModal.close("customer-modal");
                        resetForm();
                        if (body.data) {
                            window.dispatchEvent(new CustomEvent("inventory:customer-created", {
                                detail: { customer: body.data }
                            }));
                        }
                    } else {
                        InventoryPagePanel.showList(LIST_PANEL);
                        loadCustomers(editingId ? currentPage : 1);
                    }
                } else {
                    var err = body.message || "Unable to save customer.";
                    if (body.errors && body.errors.length) err = body.errors.join(" • ");
                    InventoryToast.error(err);
                }
            })
            .catch(function () {
                InventoryToast.error("Network error. Please try again.");
            })
            .finally(function () {
                InventoryLoader.button(btn, false);
            });
    }

    function deleteCustomer(id, btn) {
        InventoryConfirm.delete({
            title: "Delete customer?",
            message: "This customer will be removed from your list."
        }).then(function (confirmed) {
            if (!confirmed) return;
            InventoryLoader.button(btn, true, "");
            request("/" + id + "/", { method: "DELETE" })
                .then(function (body) {
                    if (body && body.isSuccess) {
                        InventoryToast.success("Customer deleted.");
                        loadCustomers(currentPage);
                    } else {
                        InventoryToast.error(body && body.message ? body.message : "Unable to delete customer.");
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
        if (init._wired) return;
        init._wired = true;

        if (isModalMode()) {
            InventoryModal.wire("customer-modal");
        }

        if (window.InventoryPagePanel && isListPage()) {
            InventoryPagePanel.init();
        }

        if (window.InventoryAuth && typeof InventoryAuth.wireMobileInput === "function") {
            InventoryAuth.wireMobileInput(document.getElementById("customer-mobile"));
        }

        var openBtn = document.getElementById("customer-open-form-btn");
        var saveBtn = document.getElementById("customer-save-btn");
        var searchEl = document.getElementById("customers-search");
        var tbody = document.getElementById("customers-table-body");

        if (isListPage()) {
            getColumnCtrl();
            function boot() {
                if (!InventoryBusiness.getActiveId()) return;
                loadCustomers(1);
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
        }

        if (openBtn) openBtn.addEventListener("click", openFormPanel);
        if (saveBtn) saveBtn.addEventListener("click", saveCustomer);

        if (searchEl) {
            searchEl.addEventListener("input", function () {
                window.clearTimeout(searchTimer);
                searchTimer = window.setTimeout(function () {
                    currentSearch = searchEl.value.trim();
                    loadCustomers(1);
                }, 300);
            });
        }

        if (tbody) {
            tbody.addEventListener("click", function (e) {
                var viewBtn = e.target.closest(".customer-view");
                if (viewBtn) {
                    openViewPanel(viewBtn.getAttribute("data-id"));
                    return;
                }
                var editBtn = e.target.closest(".customer-edit");
                if (editBtn) {
                    openEditPanel(editBtn.getAttribute("data-id"));
                }
            });
        }
    }

    return { init: init, loadCustomers: loadCustomers, openAddModal: openAddModal };
})();
