var InventoryStockIn = (function () {
    "use strict";

    var API = "/api/invoicing/purchase-invoices";
    var PRODUCTS_API = "/api/products";
    var PAGE_SIZE = (window.InventoryConstants && InventoryConstants.PAGE_SIZE) || 10;
    var currentPage = 1;
    var products = [];
    var pendingProductRow = null;
    var editingInvoiceId = null;
    var existingAttachment = null;
    var ALLOWED_ATTACHMENT_EXT = ["pdf", "jpg", "jpeg", "png", "webp", "gif"];
    var STOCKIN_LIST_PANEL = "stockin-list-panel";
    var STOCKIN_FORM_PANEL = "stockin-form-panel";
    var STOCKIN_VIEW_PANEL = "stockin-view-panel";

    function request(path, opts) {
        return InventoryApi.request(API, path, opts);
    }

    function loadProducts() {
        return InventoryApi.request(PRODUCTS_API, "?page_size=100")
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    products = body.data.items || [];
                } else {
                    products = [];
                }
            });
    }

    function productOptions(selectedId) {
        if (!products.length) {
            return '<option value="">No products — add products first</option>';
        }
        var options = '<option value="">Select product</option>';
        options += products.map(function (product) {
            var sku = product.sku ? " (" + product.sku + ")" : "";
            var selected = String(product.id) === String(selectedId) ? " selected" : "";
            return '<option value="' + product.id + '"' + selected + '>' +
                InventoryApi.escapeHtml(product.name) + sku + "</option>";
        }).join("");
        return options;
    }

    function getProduct(productId) {
        return products.find(function (p) {
            return String(p.id) === String(productId);
        });
    }

    function applyProductToRow(row, product) {
        if (!product) return;
        var buyEl = row.querySelector(".inv-item-buy");
        if (buyEl && product.purchase_price != null) {
            buyEl.value = product.purchase_price;
        }
    }

    function updateAllProductSelects(newProductId, focusRow) {
        document.querySelectorAll("#stockin-items-container .inv-item-product").forEach(function (select) {
            var row = select.closest(".inv-mgmt-item-row");
            var selectedId = row === focusRow && newProductId
                ? newProductId
                : select.value;
            select.innerHTML = productOptions(selectedId);
            if (selectedId) {
                select.value = String(selectedId);
            }
        });
    }

    function openAddProductModal(row) {
        pendingProductRow = row || null;
        if (window.InventoryProducts && typeof InventoryProducts.openAddModal === "function") {
            InventoryProducts.openAddModal();
            return;
        }
        InventoryToast.error("Product form is not available.");
    }

    function createItemRow(data) {
        data = data || {};
        var row = document.createElement("div");
        row.className = "inv-mgmt-item-row inv-mgmt-item-row--stockin";
        row.innerHTML =
            '<div class="inv-mgmt-field"><label>Product</label>' +
            '<div class="inv-field-inline">' +
            '<select class="inv-mgmt-select inv-item-product" required>' + productOptions(data.product_id) + "</select>" +
            '<button type="button" class="inv-inline-add-btn inv-item-product-add" title="Add product" aria-label="Add product">' +
            '<span class="material-symbols-outlined">add</span></button></div></div>' +
            '<div class="inv-mgmt-field"><label>Quantity</label><input class="inv-mgmt-input inv-item-qty" type="number" min="0.01" step="0.01" value="' + (data.quantity || 1) + '" required/></div>' +
            '<div class="inv-mgmt-field"><label>Buy Price</label><input class="inv-mgmt-input inv-item-buy" type="number" min="0" step="0.01" value="' + (data.purchase_price || 0) + '" required/></div>' +
            '<div class="inv-mgmt-field"><label>Batch No.</label><input class="inv-mgmt-input inv-item-batch" type="text" placeholder="B001" value="' + InventoryApi.escapeHtml(data.batch_number || "") + '"/></div>' +
            '<div class="inv-mgmt-field"><label>Expiry</label><input class="inv-mgmt-input inv-item-expiry" type="date" value="' + (data.expiry_date || "") + '"/></div>' +
            '<div class="inv-mgmt-item-row-remove">' +
            '<button type="button" class="inv-row-action-btn inv-row-action-btn--delete inv-item-remove" title="Remove" aria-label="Remove product row">' +
            '<span class="material-symbols-outlined">delete</span></button></div>';

        row.querySelector(".inv-item-remove").addEventListener("click", function () {
            row.remove();
        });
        row.querySelector(".inv-item-product").addEventListener("change", function () {
            applyProductToRow(row, getProduct(this.value));
        });
        row.querySelector(".inv-item-product-add").addEventListener("click", function () {
            openAddProductModal(row);
        });

        if (data.product_id) {
            applyProductToRow(row, getProduct(data.product_id));
        }
        return row;
    }

    function actionButtons(item) {
        return (
            '<div class="inv-row-actions">' +
            '<button type="button" class="inv-row-action-btn inv-row-action-btn--view inv-stockin-view" data-id="' + item.id + '" title="View" aria-label="View purchase">' +
            '<span class="material-symbols-outlined">visibility</span></button>' +
            '<button type="button" class="inv-row-action-btn inv-row-action-btn--edit inv-stockin-edit" data-id="' + item.id + '" title="Edit" aria-label="Edit purchase">' +
            '<span class="material-symbols-outlined">edit</span></button>' +
            '<button type="button" class="inv-row-action-btn inv-row-action-btn--delete inv-stockin-delete" data-id="' + item.id + '" title="Delete" aria-label="Delete purchase">' +
            '<span class="material-symbols-outlined">delete</span></button>' +
            "</div>"
        );
    }

    function getAttachmentInput() {
        return document.getElementById("stockin-attachment");
    }

    function getSelectedAttachmentFile() {
        var input = getAttachmentInput();
        return input && input.files && input.files[0] ? input.files[0] : null;
    }

    function isAllowedAttachmentFile(file) {
        if (!file || !file.name) return false;
        var parts = file.name.split(".");
        if (parts.length < 2) return false;
        var ext = parts.pop().toLowerCase();
        return ALLOWED_ATTACHMENT_EXT.indexOf(ext) !== -1;
    }

    function updateAttachmentMeta() {
        var meta = document.getElementById("stockin-attachment-meta");
        var nameEl = document.getElementById("stockin-attachment-name");
        if (!meta || !nameEl) return;

        var file = getSelectedAttachmentFile();
        if (file) {
            nameEl.textContent = file.name;
            meta.classList.remove("inv-hidden");
            return;
        }

        if (existingAttachment && existingAttachment.name) {
            if (existingAttachment.url) {
                nameEl.innerHTML =
                    '<a href="' + InventoryApi.escapeHtml(existingAttachment.url) + '" target="_blank" rel="noopener">' +
                    InventoryApi.escapeHtml(existingAttachment.name) + "</a> (current)";
            } else {
                nameEl.textContent = existingAttachment.name + " (current)";
            }
            meta.classList.remove("inv-hidden");
            return;
        }

        meta.classList.add("inv-hidden");
        nameEl.textContent = "";
    }

    function clearAttachmentSelection() {
        var input = getAttachmentInput();
        if (input) input.value = "";
        updateAttachmentMeta();
    }

    function resetAttachmentField() {
        existingAttachment = null;
        var input = getAttachmentInput();
        if (input) input.value = "";
        updateAttachmentMeta();
    }

    function setExistingAttachment(invoice) {
        existingAttachment = null;
        if (invoice && invoice.attachment_url) {
            existingAttachment = {
                url: invoice.attachment_url,
                name: invoice.attachment_name || "Attachment"
            };
        }
        var input = getAttachmentInput();
        if (input) input.value = "";
        updateAttachmentMeta();
    }

    function buildInvoiceFormData(payload, items) {
        var fd = new FormData();
        fd.append("invoice_number", payload.invoice_number);
        if (payload.invoice_date) {
            fd.append("invoice_date", payload.invoice_date);
        }
        fd.append("remarks", payload.remarks || "");
        if (items) {
            fd.append("items", JSON.stringify(items));
        }
        var file = getSelectedAttachmentFile();
        if (file) {
            fd.append("attachment", file);
        }
        return fd;
    }

    function displayValue(value) {
        if (value === null || value === undefined || String(value).trim() === "") return "—";
        return InventoryApi.escapeHtml(String(value));
    }

    function renderRows(items) {
        var tbody = document.getElementById("stockin-table-body");
        if (!tbody) return;

        if (!items || !items.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="inv-mgmt-empty">No purchase invoices yet.</td></tr>';
            return;
        }

        tbody.innerHTML = items.map(function (item) {
            return (
                "<tr>" +
                "<td>" + InventoryApi.escapeHtml(item.invoice_date) + "</td>" +
                "<td><strong>" + InventoryApi.escapeHtml(item.invoice_number) + "</strong></td>" +
                "<td class=\"inv-mgmt-cell--num\">" + InventoryApi.formatMoney(item.subtotal) + "</td>" +
                "<td class=\"inv-mgmt-cell--num\"><strong>" + InventoryApi.formatMoney(item.grand_total) + "</strong></td>" +
                "<td class=\"inv-col-action\">" + actionButtons(item) + "</td>" +
                "</tr>"
            );
        }).join("");
    }

    function fetchInvoice(id) {
        return request("/" + id + "/").then(function (body) {
            if (body && body.isSuccess && body.data) {
                return body.data;
            }
            InventoryToast.error(body.message || "Failed to load purchase invoice.");
            return null;
        });
    }

    function renderViewDetails(invoice) {
        var container = document.getElementById("stockin-view-body");
        var itemsWrap = document.getElementById("stockin-view-items-wrap");
        if (!container || !itemsWrap) return;

        var rows = [
            { label: "Invoice Number", value: displayValue(invoice.invoice_number) },
            { label: "Purchase Date", value: displayValue(invoice.invoice_date) },
            { label: "Subtotal", value: InventoryApi.formatMoney(invoice.subtotal) },
            { label: "Grand Total", value: InventoryApi.formatMoney(invoice.grand_total) },
            { label: "Remarks", value: displayValue(invoice.remarks), full: true }
        ];

        if (invoice.attachment_url) {
            rows.push({
                label: "Attachment",
                value:
                    '<a href="' + InventoryApi.escapeHtml(invoice.attachment_url) + '" target="_blank" rel="noopener">' +
                    InventoryApi.escapeHtml(invoice.attachment_name || "View file") +
                    "</a>",
                full: true,
                html: true
            });
        }

        container.innerHTML = rows.map(function (row) {
            var cls = row.full ? " inv-product-view-item--full" : "";
            return (
                '<div class="inv-product-view-item' + cls + '">' +
                '<span class="inv-product-view-label">' + row.label + "</span>" +
                '<div class="inv-product-view-value">' + row.value + "</div>" +
                "</div>"
            );
        }).join("");

        var lines = invoice.items || [];
        if (!lines.length) {
            itemsWrap.innerHTML = "";
            return;
        }

        itemsWrap.innerHTML =
            '<h4 class="inv-stockin-view-items-title">Purchase Items</h4>' +
            '<div class="inv-mgmt-table-wrap">' +
            '<table class="inv-mgmt-table">' +
            "<thead><tr>" +
            "<th>Product</th><th>SKU</th><th>Qty</th><th>Buy Price</th><th>Batch</th><th>Expiry</th><th>Line Total</th>" +
            "</tr></thead><tbody>" +
            lines.map(function (line) {
                return (
                    "<tr>" +
                    "<td>" + displayValue(line.product_name) + "</td>" +
                    "<td>" + displayValue(line.product_sku) + "</td>" +
                    "<td class=\"inv-mgmt-cell--num\">" + displayValue(line.quantity) + "</td>" +
                    "<td class=\"inv-mgmt-cell--num\">" + InventoryApi.formatMoney(line.purchase_price) + "</td>" +
                    "<td>" + displayValue(line.batch_number) + "</td>" +
                    "<td>" + displayValue(line.expiry_date) + "</td>" +
                    "<td class=\"inv-mgmt-cell--num\">" + InventoryApi.formatMoney(line.line_total) + "</td>" +
                    "</tr>"
                );
            }).join("") +
            "</tbody></table></div>";
    }

    function setFormMode(mode) {
        var titleEl = document.getElementById("stockin-form-title");
        var saveBtn = document.getElementById("stockin-save-btn");
        var addItemBtn = document.getElementById("stockin-add-item-btn");
        var itemsPanel = document.querySelector("#stockin-form-panel .inv-mgmt-items-panel");

        if (mode === "edit") {
            if (titleEl) titleEl.textContent = "Edit Purchase";
            if (saveBtn) saveBtn.textContent = "Update Purchase";
            if (addItemBtn) addItemBtn.classList.add("inv-hidden");
            if (itemsPanel) itemsPanel.classList.add("inv-stockin-items--readonly");
        } else {
            if (titleEl) titleEl.textContent = "Add Purchase";
            if (saveBtn) saveBtn.textContent = "Save Purchase";
            if (addItemBtn) addItemBtn.classList.remove("inv-hidden");
            if (itemsPanel) itemsPanel.classList.remove("inv-stockin-items--readonly");
        }
    }

    function setItemsEditable(editable) {
        document.querySelectorAll("#stockin-items-container .inv-mgmt-item-row").forEach(function (row) {
            row.querySelectorAll("input, select, button.inv-item-product-add, button.inv-item-remove").forEach(function (el) {
                el.disabled = !editable;
            });
        });
    }

    function populateForm(invoice) {
        document.getElementById("stockin-invoice-no").value = invoice.invoice_number || "";
        document.getElementById("stockin-remarks").value = invoice.remarks || "";
        setExistingAttachment(invoice);
        var dateEl = document.getElementById("stockin-invoice-date");
        if (dateEl) dateEl.value = invoice.invoice_date || "";

        var container = document.getElementById("stockin-items-container");
        container.innerHTML = "";
        (invoice.items || []).forEach(function (line) {
            container.appendChild(createItemRow({
                product_id: line.product,
                quantity: line.quantity,
                purchase_price: line.purchase_price,
                batch_number: line.batch_number,
                expiry_date: line.expiry_date || ""
            }));
        });
        setItemsEditable(false);
    }

    function resetForm() {
        editingInvoiceId = null;
        setFormMode("add");
        document.getElementById("stockin-invoice-no").value = "";
        document.getElementById("stockin-remarks").value = "";
        resetAttachmentField();
        var dateEl = document.getElementById("stockin-invoice-date");
        if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);
        var container = document.getElementById("stockin-items-container");
        container.innerHTML = "";
        container.appendChild(createItemRow());
        setItemsEditable(true);
    }

    function openViewInvoice(id) {
        InventoryLoader.show();
        fetchInvoice(id)
            .then(function (invoice) {
                if (!invoice) return;
                var viewTitle = document.getElementById("stockin-view-title");
                if (viewTitle) viewTitle.textContent = invoice.invoice_number || "Purchase Details";
                renderViewDetails(invoice);
                InventoryPagePanel.showPanel(STOCKIN_LIST_PANEL, STOCKIN_VIEW_PANEL);
            })
            .catch(function () {
                InventoryToast.error("Network error while loading purchase.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function openEditInvoice(id) {
        InventoryLoader.show();
        loadProducts()
            .then(function () {
                return fetchInvoice(id);
            })
            .then(function (invoice) {
                if (!invoice) return;
                editingInvoiceId = invoice.id;
                setFormMode("edit");
                populateForm(invoice);
                InventoryPagePanel.showPanel(STOCKIN_LIST_PANEL, STOCKIN_FORM_PANEL);
                document.getElementById("stockin-invoice-no").focus();
            })
            .catch(function () {
                InventoryToast.error("Network error while loading purchase.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function deleteInvoice(id, btn) {
        InventoryConfirm.delete({
            title: "Delete purchase?",
            message: "This will remove the purchase invoice and reverse its stock batches if none have been sold."
        }).then(function (confirmed) {
            if (!confirmed) return;
            InventoryLoader.button(btn, true, "");
            request("/" + id + "/", { method: "DELETE" })
                .then(function (body) {
                    if (body && body.isSuccess) {
                        InventoryToast.success(body.message || "Purchase deleted.");
                        loadInvoices(currentPage);
                    } else {
                        InventoryToast.error(body.message || "Unable to delete purchase.");
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

    function loadInvoices(page) {
        currentPage = page || 1;
        InventoryLoader.show();
        var params = new URLSearchParams();
        params.set("page", String(currentPage));
        params.set("page_size", String(InventoryPagination.getPageSize("stockin-pagination")));

        return request("?" + params.toString())
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    renderRows(body.data.items || []);
                    InventoryPagination.render("stockin-pagination", body.data.pagination, loadInvoices, {
                        onPageSizeChange: function () {
                            loadInvoices(1);
                        }
                    });
                } else {
                    renderRows([]);
                    InventoryPagination.render("stockin-pagination", null, function () {});
                    InventoryToast.error(body.message || "Failed to load invoices.");
                }
            })
            .catch(function () {
                renderRows([]);
                InventoryToast.error("Network error while loading invoices.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function openModal() {
        loadProducts().then(function () {
            resetForm();
            InventoryPagePanel.showPanel(STOCKIN_LIST_PANEL, STOCKIN_FORM_PANEL);
            document.getElementById("stockin-invoice-no").focus();
        });
    }

    function collectItems() {
        var rows = document.querySelectorAll("#stockin-items-container .inv-mgmt-item-row");
        var items = [];
        rows.forEach(function (row) {
            var productId = row.querySelector(".inv-item-product").value;
            if (!productId) return;
            var expiry = row.querySelector(".inv-item-expiry").value;
            items.push({
                product_id: Number(productId),
                quantity: row.querySelector(".inv-item-qty").value,
                purchase_price: row.querySelector(".inv-item-buy").value,
                batch_number: row.querySelector(".inv-item-batch").value.trim(),
                expiry_date: expiry || null,
            });
        });
        return items;
    }

    function saveInvoice() {
        var invoiceNumber = document.getElementById("stockin-invoice-no").value.trim();
        if (!invoiceNumber) {
            InventoryToast.error("Invoice number is required.");
            return;
        }

        var attachmentFile = getSelectedAttachmentFile();
        if (attachmentFile && !isAllowedAttachmentFile(attachmentFile)) {
            InventoryToast.error("Only PDF and image files are allowed.");
            return;
        }

        var payload = {
            invoice_number: invoiceNumber,
            invoice_date: document.getElementById("stockin-invoice-date").value || undefined,
            remarks: document.getElementById("stockin-remarks").value.trim()
        };

        if (editingInvoiceId) {
            InventoryLoader.show();
            var editBody = attachmentFile ? buildInvoiceFormData(payload) : payload;
            request("/" + editingInvoiceId + "/", { method: "PATCH", body: editBody })
                .then(function (body) {
                    if (body && body.isSuccess) {
                        InventoryToast.success(body.message || "Purchase updated.");
                        resetForm();
                        InventoryPagePanel.showList(STOCKIN_LIST_PANEL);
                        loadInvoices(currentPage);
                    } else {
                        var err = body.message || "Failed to update purchase.";
                        if (body.errors && body.errors.length) err = body.errors.join(" • ");
                        InventoryToast.error(err);
                    }
                })
                .catch(function () {
                    InventoryToast.error("Network error while saving invoice.");
                })
                .finally(function () {
                    InventoryLoader.hide();
                });
            return;
        }

        var items = collectItems();
        if (!items.length) {
            InventoryToast.error("Add at least one product row.");
            return;
        }

        payload.items = items;

        InventoryLoader.show();
        var createBody = attachmentFile ? buildInvoiceFormData(payload, items) : payload;
        request("/", { method: "POST", body: createBody })
            .then(function (body) {
                if (body && body.isSuccess) {
                    InventoryToast.success(body.message || "Purchase invoice saved.");
                    resetForm();
                    InventoryPagePanel.showList(STOCKIN_LIST_PANEL);
                    loadInvoices(1);
                } else {
                    var err = body.message || "Failed to save invoice.";
                    if (body.errors && body.errors.length) err = body.errors.join(" • ");
                    InventoryToast.error(err);
                }
            })
            .catch(function () {
                InventoryToast.error("Network error while saving invoice.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function init() {
        if (document.getElementById("product-modal")) {
            InventoryModal.wire("product-modal");
        }
        if (window.InventoryPagePanel) {
            InventoryPagePanel.init();
        }

        var openBtn = document.getElementById("stockin-open-modal-btn");
        var addItemBtn = document.getElementById("stockin-add-item-btn");
        var saveBtn = document.getElementById("stockin-save-btn");
        var tbody = document.getElementById("stockin-table-body");

        function boot() {
            if (!InventoryBusiness.getActiveId()) return;
            loadProducts().then(function () {
                loadInvoices(1);
            });
        }

        InventoryBusiness.whenReady(boot);
        window.addEventListener("inventory:business-changed", boot);

        window.addEventListener("inventory:product-created", function (e) {
            var product = e.detail && e.detail.product;
            var focusRow = pendingProductRow;
            pendingProductRow = null;
            loadProducts().then(function () {
                updateAllProductSelects(product ? product.id : null, focusRow);
                if (focusRow && product) {
                    applyProductToRow(focusRow, product);
                }
            });
        });

        if (openBtn) openBtn.addEventListener("click", openModal);
        if (addItemBtn) {
            addItemBtn.addEventListener("click", function () {
                document.getElementById("stockin-items-container").appendChild(createItemRow());
            });
        }
        if (saveBtn) saveBtn.addEventListener("click", saveInvoice);

        var attachmentBtn = document.getElementById("stockin-attachment-btn");
        var attachmentInput = getAttachmentInput();
        var attachmentClear = document.getElementById("stockin-attachment-clear");

        if (attachmentBtn && attachmentInput) {
            attachmentBtn.addEventListener("click", function () {
                attachmentInput.click();
            });
            attachmentInput.addEventListener("change", function () {
                var file = getSelectedAttachmentFile();
                if (file && !isAllowedAttachmentFile(file)) {
                    InventoryToast.error("Only PDF and image files are allowed.");
                    clearAttachmentSelection();
                    return;
                }
                updateAttachmentMeta();
            });
        }
        if (attachmentClear) {
            attachmentClear.addEventListener("click", clearAttachmentSelection);
        }

        if (tbody) {
            tbody.addEventListener("click", function (e) {
                var viewBtn = e.target.closest(".inv-stockin-view");
                if (viewBtn) {
                    openViewInvoice(viewBtn.getAttribute("data-id"));
                    return;
                }
                var editBtn = e.target.closest(".inv-stockin-edit");
                if (editBtn) {
                    openEditInvoice(editBtn.getAttribute("data-id"));
                    return;
                }
                var deleteBtn = e.target.closest(".inv-stockin-delete");
                if (deleteBtn) {
                    deleteInvoice(deleteBtn.getAttribute("data-id"), deleteBtn);
                }
            });
        }
    }

    return { init: init };
})();
