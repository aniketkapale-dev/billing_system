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
                includeBulkCheck: false,
                bulkHeaderHtml: '<th class="inv-col-check d-none"><input type="checkbox" class="inv-bulk-select-all" aria-label="Select all"/></th>',
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
                        id: "company",
                        label: "Company",
                        sortKey: "company_name",
                        cell: function (item) { return "<td>" + displayValue(item.company_name) + "</td>"; }
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
            ["Full Name", "Company", "Mobile", "Email", "Address"],
            items.map(function (item) {
                return [item.name || "", item.company_name || "", item.mobile || "", item.email || "", item.address || ""];
            }),
            "customers.pdf"
        );
    }

    function exportCustomersPrint(ids) {
        var items = getSelectedItems(ids);
        if (!items.length) return;
        var html = InventoryDocumentExport.buildTableHtml(
            "Customers",
            ["Full Name", "Company", "Mobile", "Email", "Address"],
            items.map(function (item) {
                return [item.name || "", item.company_name || "", item.mobile || "", item.email || "", item.address || ""];
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
        return InventoryApi.formatDateTime(value, "—");
    }

    function renderRows(items) {
        var tbody = document.getElementById("customers-table-body");
        if (!tbody) return;

        var cols = getColumnCtrl();
        var colspan = cols ? cols.getColspan() : 6;

        if (!items || !items.length) {
            tbody.innerHTML = '<tr><td colspan="' + colspan + '" class="inv-mgmt-empty">No customers found.</td></tr>';
            return;
        }

        cachedItems = items;

        tbody.innerHTML = items.map(function (item) {
            return (
                "<tr>" +
                cols.renderRowCells(item) +
                '<td class="inv-col-action inv-mgmt-cell--action"><div class="inv-row-actions">' +
                '<button type="button" class="inv-row-action-btn inv-row-action-btn--view customer-view" data-id="' + item.id + '" title="View" aria-label="View customer">' +
                '<span class="material-symbols-outlined">visibility</span></button>' +
                '<button type="button" class="inv-row-action-btn inv-row-action-btn--edit customer-edit" data-id="' + item.id + '" title="Edit" aria-label="Edit customer">' +
                '<span class="material-symbols-outlined">edit</span></button>' +
                '<button type="button" class="inv-row-action-btn inv-row-action-btn--delete customer-delete" data-id="' + item.id + '" title="Delete" aria-label="Delete customer">' +
                '<span class="material-symbols-outlined">delete</span></button>' +
                "</div></td></tr>"
            );
        }).join("");
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

    function getCustomerFormRowsContainer() {
        return document.getElementById("customer-form-rows");
    }

    function getCustomerFormRows() {
        var container = getCustomerFormRowsContainer();
        if (!container) return [];
        return Array.prototype.slice.call(container.querySelectorAll(".inv-customer-form-row"));
    }

    function customerRowField(row, selector) {
        return row ? row.querySelector(selector) : null;
    }

    function customerRowValue(row, selector) {
        var el = customerRowField(row, selector);
        return el ? el.value : "";
    }

    function setBusinessFieldsVisible(row, show) {
        if (!row) return;
        var panel = customerRowField(row, ".inv-customer-field-business-panel");
        var checkbox = customerRowField(row, ".inv-customer-field-add-business");
        if (checkbox) checkbox.checked = !!show;
        if (panel) panel.classList.toggle("inv-hidden", !show);
    }

    function wireCustomerRowInputs(row) {
        if (!row || row.dataset.customerWired === "1") return;
        row.dataset.customerWired = "1";

        var mobileEl = customerRowField(row, ".inv-customer-field-mobile");
        if (mobileEl && window.InventoryAuth && typeof InventoryAuth.wireMobileInput === "function") {
            InventoryAuth.wireMobileInput(mobileEl);
        }

        var pinCodeEl = customerRowField(row, ".inv-customer-field-pin-code");
        if (pinCodeEl) {
            pinCodeEl.addEventListener("input", function () {
                this.value = this.value.replace(/\D/g, "").slice(0, 6);
            });
        }

        var addBusinessCheckbox = customerRowField(row, ".inv-customer-field-add-business");
        if (addBusinessCheckbox) {
            addBusinessCheckbox.addEventListener("change", function () {
                setBusinessFieldsVisible(row, addBusinessCheckbox.checked);
                if (addBusinessCheckbox.checked) {
                    var companyEl = customerRowField(row, ".inv-customer-field-company-name");
                    if (companyEl) companyEl.focus();
                }
            });
        }
    }

    function removeExtraCustomerRows() {
        var rows = getCustomerFormRows();
        for (var i = rows.length - 1; i > 0; i--) {
            rows[i].remove();
        }
        ensureCustomerRowHeads();
    }

    function clearCustomerRowFields(row) {
        if (!row) return;
        [
            ".inv-customer-field-name",
            ".inv-customer-field-mobile",
            ".inv-customer-field-email",
            ".inv-customer-field-pin-code",
            ".inv-customer-field-address",
            ".inv-customer-field-company-name",
            ".inv-customer-field-company-mobile",
            ".inv-customer-field-gst",
            ".inv-customer-field-business-address",
            ".inv-customer-field-shipping-address"
        ].forEach(function (selector) {
            var el = customerRowField(row, selector);
            if (el) el.value = "";
        });
        setBusinessFieldsVisible(row, false);
    }

    function ensureCustomerRowHeads() {
        var rows = getCustomerFormRows();
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
            label.textContent = "Customer " + (idx + 1);
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

    function updateCustomerSaveButtonLabel() {
        var saveBtn = document.getElementById("customer-save-btn");
        if (!saveBtn || editingId || isModalMode()) return;
        var count = getCustomerFormRows().length;
        saveBtn.textContent = count > 1 ? "Save " + count + " Customers" : "Save Customer";
    }

    function toggleCustomerAddMoreButton(show) {
        var btn = document.getElementById("customer-add-more-btn");
        if (btn) btn.classList.toggle("inv-hidden", !show || isModalMode());
    }

    function addCustomerFormRow() {
        if (editingId || isModalMode()) return;
        var tpl = document.getElementById("customer-form-row-template");
        var container = getCustomerFormRowsContainer();
        if (!tpl || !container) return;

        var rows = getCustomerFormRows();
        var clone = tpl.content.firstElementChild.cloneNode(true);
        clone.setAttribute("data-row-index", String(rows.length));
        container.appendChild(clone);
        wireCustomerRowInputs(clone);
        ensureCustomerRowHeads();
        updateCustomerSaveButtonLabel();
        var nameEl = customerRowField(clone, ".inv-customer-field-name");
        if (nameEl) nameEl.focus();
    }

    function removeCustomerFormRow(row) {
        if (editingId || isModalMode() || !row) return;
        if (getCustomerFormRows().length <= 1) return;
        row.remove();
        getCustomerFormRows().forEach(function (r, idx) {
            r.setAttribute("data-row-index", String(idx));
        });
        ensureCustomerRowHeads();
        updateCustomerSaveButtonLabel();
    }

    function hasBusinessData(customer) {
        if (!customer) return false;
        return !!(
            (customer.company_name && String(customer.company_name).trim()) ||
            (customer.company_mobile && String(customer.company_mobile).trim()) ||
            (customer.gst_number && String(customer.gst_number).trim()) ||
            (customer.business_address && String(customer.business_address).trim()) ||
            (customer.shipping_address && String(customer.shipping_address).trim())
        );
    }

    function resetForm() {
        editingId = null;
        removeExtraCustomerRows();
        clearCustomerRowFields(getCustomerFormRows()[0]);
        var formTitle = document.getElementById("customer-form-title");
        var modalTitle = document.getElementById("customer-modal-title");
        if (formTitle) formTitle.textContent = "Add Customer";
        if (modalTitle) modalTitle.textContent = "Add Customer";
        toggleCustomerAddMoreButton(isListPage());
        updateCustomerSaveButtonLabel();
    }

    function populateCustomerRow(row, customer) {
        if (!row || !customer) return;
        customerRowField(row, ".inv-customer-field-name").value = customer.name || "";
        customerRowField(row, ".inv-customer-field-mobile").value = customer.mobile || "";
        customerRowField(row, ".inv-customer-field-email").value = customer.email || "";
        customerRowField(row, ".inv-customer-field-pin-code").value = customer.pin_code || "";
        customerRowField(row, ".inv-customer-field-address").value = customer.address || "";
        customerRowField(row, ".inv-customer-field-company-name").value = customer.company_name || "";
        customerRowField(row, ".inv-customer-field-company-mobile").value = customer.company_mobile || "";
        customerRowField(row, ".inv-customer-field-gst").value = customer.gst_number || "";
        customerRowField(row, ".inv-customer-field-business-address").value = customer.business_address || "";
        customerRowField(row, ".inv-customer-field-shipping-address").value = customer.shipping_address || "";
        setBusinessFieldsVisible(row, hasBusinessData(customer));
    }

    function populateForm(customer) {
        populateCustomerRow(getCustomerFormRows()[0], customer);
    }

    function isValidMobile(value) {
        if (window.InventoryAuth && typeof InventoryAuth.isValidMobile === "function") {
            return InventoryAuth.isValidMobile(value);
        }
        return /^[0-9]{10}$/.test(String(value || "").trim());
    }

    function isValidPinCode(value) {
        return /^[0-9]{6}$/.test(String(value || "").trim());
    }

    function collectPayloadFromRow(row, rowLabel) {
        var prefix = rowLabel ? " (" + rowLabel + ")" : "";
        var name = customerRowValue(row, ".inv-customer-field-name").trim();
        var mobile = customerRowValue(row, ".inv-customer-field-mobile").trim();
        var email = customerRowValue(row, ".inv-customer-field-email").trim();
        var pinCode = customerRowValue(row, ".inv-customer-field-pin-code").trim();
        var address = customerRowValue(row, ".inv-customer-field-address").trim();
        var addBusinessEl = customerRowField(row, ".inv-customer-field-add-business");
        var addBusiness = addBusinessEl ? addBusinessEl.checked : false;
        var companyName = customerRowValue(row, ".inv-customer-field-company-name").trim();
        var companyMobile = customerRowValue(row, ".inv-customer-field-company-mobile").trim();
        var gstNumber = customerRowValue(row, ".inv-customer-field-gst").trim();
        var businessAddress = customerRowValue(row, ".inv-customer-field-business-address").trim();
        var shippingAddress = customerRowValue(row, ".inv-customer-field-shipping-address").trim();

        if (!name) {
            InventoryToast.error("Full name is required" + prefix + ".");
            customerRowField(row, ".inv-customer-field-name").focus();
            return null;
        }
        if (!mobile) {
            InventoryToast.error("Mobile number is required" + prefix + ".");
            customerRowField(row, ".inv-customer-field-mobile").focus();
            return null;
        }
        if (!isValidMobile(mobile)) {
            InventoryToast.error("Enter a valid 10-digit mobile number" + prefix + ".");
            customerRowField(row, ".inv-customer-field-mobile").focus();
            return null;
        }
        if (!pinCode) {
            InventoryToast.error("Pin code is required" + prefix + ".");
            customerRowField(row, ".inv-customer-field-pin-code").focus();
            return null;
        }
        if (!isValidPinCode(pinCode)) {
            InventoryToast.error("Enter a valid 6-digit pin code" + prefix + ".");
            customerRowField(row, ".inv-customer-field-pin-code").focus();
            return null;
        }
        if (!address) {
            InventoryToast.error("Address is required" + prefix + ".");
            customerRowField(row, ".inv-customer-field-address").focus();
            return null;
        }
        if (addBusiness && !companyName) {
            InventoryToast.error("Company name is required when Add company is selected" + prefix + ".");
            customerRowField(row, ".inv-customer-field-company-name").focus();
            return null;
        }
        if (addBusiness && companyMobile && !isValidMobile(companyMobile)) {
            InventoryToast.error("Enter a valid 10-digit company mobile number" + prefix + ".");
            customerRowField(row, ".inv-customer-field-company-mobile").focus();
            return null;
        }

        return {
            name: name,
            mobile: mobile,
            email: email,
            pin_code: pinCode,
            address: address,
            company_name: addBusiness ? companyName : "",
            company_mobile: addBusiness ? companyMobile : "",
            gst_number: addBusiness ? gstNumber : "",
            business_address: addBusiness ? businessAddress : "",
            shipping_address: addBusiness ? shippingAddress : ""
        };
    }

    function collectPayload() {
        return collectPayloadFromRow(getCustomerFormRows()[0], null);
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
            { label: "Full Name", value: displayValue(customer.name), emphasis: true },
            { label: "Mobile", value: displayValue(customer.mobile) },
            { label: "Email", value: displayValue(customer.email) },
            { label: "Pin Code", value: displayValue(customer.pin_code) },
            { label: "Address", value: displayValue(customer.address), full: true }
        ];

        if (hasBusinessData(customer)) {
            rows.push(
                { label: "Company Name", value: displayValue(customer.company_name) },
                { label: "Company Mobile", value: displayValue(customer.company_mobile) },
                { label: "GST No", value: displayValue(customer.gst_number) },
                { label: "Company Address", value: displayValue(customer.business_address), full: true },
                { label: "Shipping Address", value: displayValue(customer.shipping_address), full: true }
            );
        }

        rows.push(
            { label: "Created", value: displayValue(formatDate(customer.created_at)) },
            { label: "Last Updated", value: displayValue(formatDate(customer.updated_at)) }
        );

        container.innerHTML = InventoryApi.renderViewGrid(rows);
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
                removeExtraCustomerRows();
                populateForm(body.data);
                var formTitle = document.getElementById("customer-form-title");
                var saveBtn = document.getElementById("customer-save-btn");
                if (formTitle) formTitle.textContent = "Edit Customer";
                if (saveBtn) saveBtn.textContent = "Update Customer";
                toggleCustomerAddMoreButton(false);
                InventoryPagePanel.showPanel(LIST_PANEL, FORM_PANEL);
            })
            .catch(function () {
                InventoryToast.error("Network error while loading customer.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function saveCustomersSequential(payloads, btn) {
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
                    var err = body && body.message ? body.message : "Unable to save customer.";
                    if (body && body.errors && body.errors.length) err = body.errors.join(" • ");
                    throw new Error(err + (payloads.length > 1 ? " (Customer " + (index + 1) + ")" : ""));
                });
            });
        });

        chain
            .then(function () {
                InventoryToast.success(saved === 1 ? "Customer added." : saved + " customers added.");
                InventoryPagePanel.showList(LIST_PANEL);
                loadCustomers(1);
            })
            .catch(function (err) {
                InventoryToast.error(err && err.message ? err.message : "Network error. Please try again.");
                if (saved) loadCustomers(1);
            })
            .finally(function () {
                InventoryLoader.button(btn, false);
                updateCustomerSaveButtonLabel();
            });
    }

    function saveCustomer() {
        var btn = document.getElementById("customer-save-btn");
        var rows = getCustomerFormRows();

        if (editingId || isModalMode()) {
            var singlePayload = collectPayload();
            if (!singlePayload) return;
            InventoryLoader.button(btn, true, editingId ? "Updating..." : "Saving...");
            request(editingId ? "/" + editingId + "/" : "", {
                method: editingId ? "PATCH" : "POST",
                body: singlePayload
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
            return;
        }

        if (!rows.length) return;

        var payloads = [];
        for (var i = 0; i < rows.length; i++) {
            var rowLabel = rows.length > 1 ? "Customer " + (i + 1) : null;
            var payload = collectPayloadFromRow(rows[i], rowLabel);
            if (!payload) return;
            payloads.push(payload);
        }

        if (payloads.length === 1) {
            InventoryLoader.button(btn, true, "Saving...");
            request("", { method: "POST", body: payloads[0] })
                .then(function (body) {
                    if (body && body.isSuccess) {
                        InventoryToast.success("Customer added.");
                        InventoryPagePanel.showList(LIST_PANEL);
                        loadCustomers(1);
                    } else {
                        var singleErr = body.message || "Unable to save customer.";
                        if (body.errors && body.errors.length) singleErr = body.errors.join(" • ");
                        InventoryToast.error(singleErr);
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

        saveCustomersSequential(payloads, btn);
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

        getCustomerFormRows().forEach(wireCustomerRowInputs);

        var formRowsContainer = getCustomerFormRowsContainer();
        if (formRowsContainer) {
            formRowsContainer.addEventListener("click", function (e) {
                var removeBtn = e.target.closest(".inv-product-row-remove");
                if (removeBtn) {
                    var row = removeBtn.closest(".inv-customer-form-row");
                    if (row) removeCustomerFormRow(row);
                }
            });
        }

        var openBtn = document.getElementById("customer-open-form-btn");
        var addMoreBtn = document.getElementById("customer-add-more-btn");
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
        if (addMoreBtn) addMoreBtn.addEventListener("click", addCustomerFormRow);
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
                    return;
                }
                var deleteBtn = e.target.closest(".customer-delete");
                if (deleteBtn) {
                    deleteCustomer(deleteBtn.getAttribute("data-id"), deleteBtn);
                }
            });
        }
    }

    return { init: init, loadCustomers: loadCustomers, openAddModal: openAddModal };
})();
