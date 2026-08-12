var InventoryStockIn = (function () {
    "use strict";

    var API = "/api/invoicing/purchase-invoices";
    var PRODUCTS_API = "/api/products";
    var TAXES_API = "/api/settings/taxes";
    var PAGE_SIZE = (window.InventoryConstants && InventoryConstants.PAGE_SIZE) || 10;
    var currentPage = 1;
    var currentOrdering = "-invoice_date";
    var searchTimer = null;
    var products = [];
    var taxes = [];
    var pendingProductRow = null;
    var pendingTaxRow = null;
    var editingInvoiceId = null;
    var existingAttachment = null;
    var ALLOWED_ATTACHMENT_EXT = ["pdf", "jpg", "jpeg", "png", "webp", "gif"];
    var STOCKIN_LIST_PANEL = "stockin-list-panel";
    var STOCKIN_FORM_PANEL = "stockin-form-panel";
    var STOCKIN_VIEW_PANEL = "stockin-view-panel";
    var cachedItems = [];
    var bulkSelect = null;
    var columnCtrl = null;

    function getColumnCtrl() {
        if (!columnCtrl) {
            columnCtrl = InventoryColumnCustomize.create({
                tableKey: "stock-in",
                theadSelector: ".inv-mgmt-table--stockin thead tr",
                toolbarSelector: "#stockin-list-panel .inv-mgmt-toolbar",
                includeBulkCheck: true,
                bulkHeaderHtml: '<th class="inv-col-check"><input type="checkbox" class="inv-bulk-select-all" aria-label="Select all"/></th>',
                sortDefault: "-invoice_date",
                onSortChange: function (ordering) {
                    currentOrdering = ordering;
                    loadInvoices(1);
                },
                columns: [
                    { id: "date", label: "Date", locked: true, cell: function (item) { return "<td>" + InventoryApi.escapeHtml(formatDate(item.invoice_date)) + "</td>"; } },
                    { id: "invoice_no", label: "Invoice No.", locked: true, sortKey: "invoice_number", cell: function (item) { return "<td><strong>" + InventoryApi.escapeHtml(item.invoice_number) + "</strong></td>"; } },
                    { id: "qty", label: "Qty", headerClass: "inv-mgmt-cell--num", cell: function (item) { return '<td class="inv-mgmt-cell--num">' + InventoryApi.escapeHtml(formatQty(item.total_quantity)) + "</td>"; } },
                    { id: "subtotal", label: "Subtotal", sortKey: "subtotal", locked: true, headerClass: "inv-mgmt-cell--num", cell: function (item) { return '<td class="inv-mgmt-cell--num">' + InventoryApi.formatMoney(item.subtotal) + "</td>"; } },
                    { id: "grand_total", label: "Grand Total", sortKey: "grand_total", locked: true, headerClass: "inv-mgmt-cell--num", cell: function (item) { return '<td class="inv-mgmt-cell--num"><strong>' + InventoryApi.formatMoney(item.grand_total) + "</strong></td>"; } },
                    { id: "file", label: "File", headerClass: "inv-col-file", cell: function (item) { return '<td class="inv-col-file">' + cellFile(item) + "</td>"; } }
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
        if (!bulkSelect) {
            bulkSelect = InventoryBulkSelect.create({
                tbodyId: "stockin-table-body",
                tableSelector: ".inv-mgmt-table--stockin",
                entitySingular: "Purchase",
                entityPlural: "Purchases",
                onDelete: bulkDeleteInvoices,
                onPdf: exportStockInPdf,
                onPrint: exportStockInPrint
            });
        }
        return bulkSelect;
    }

    function getSelectedItems(ids) {
        return cachedItems.filter(function (item) {
            return ids.indexOf(String(item.id)) !== -1;
        });
    }

    function exportStockInPdf(ids) {
        var items = getSelectedItems(ids);
        if (!items.length) return;
        InventoryDocumentExport.downloadTablePdf(
            "Purchase (Stock In)",
            ["Date", "Invoice No.", "Qty", "Subtotal", "Grand Total"],
            items.map(function (item) {
                return [
                    formatDate(item.invoice_date),
                    item.invoice_number || "",
                    formatQty(item.total_quantity),
                    item.subtotal || "",
                    item.grand_total || ""
                ];
            }),
            "purchases-stock-in.pdf"
        );
    }

    function exportStockInPrint(ids) {
        var items = getSelectedItems(ids);
        if (!items.length) return;
        var html = InventoryDocumentExport.buildTableHtml(
            "Purchase (Stock In)",
            ["Date", "Invoice No.", "Qty", "Subtotal", "Grand Total"],
            items.map(function (item) {
                return [
                    formatDate(item.invoice_date),
                    item.invoice_number || "",
                    formatQty(item.total_quantity),
                    item.subtotal || "",
                    item.grand_total || ""
                ];
            })
        );
        InventoryDocumentExport.printHtml("Purchase (Stock In)", html);
    }

    function bulkDeleteInvoices(ids) {
        InventoryConfirm.delete({
            title: "Delete selected purchases?",
            message: ids.length + " purchase invoice(s) will be removed."
        }).then(function (confirmed) {
            if (!confirmed) return;

            InventoryLoader.show();
            var chain = Promise.resolve();
            var deleted = 0;
            var failed = 0;

            ids.forEach(function (id) {
                chain = chain.then(function () {
                    return request("/" + id + "/", { method: "DELETE" }).then(function (body) {
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
                if (deleted) InventoryToast.success(deleted + " purchase(s) deleted.");
                if (failed) InventoryToast.error(failed + " purchase(s) could not be deleted.");
                getBulkSelect().clearSelection();
                loadInvoices(currentPage);
            });
        });
    }

    function request(path, opts) {
        return InventoryApi.request(API, path, opts);
    }

    function taxRequest(path, opts) {
        return InventoryApi.request(TAXES_API, path, opts);
    }

    function taxLabel(item) {
        return item.key + " (" + item.value + "%)";
    }

    function getTax(taxId) {
        return taxes.find(function (tax) {
            return String(tax.id) === String(taxId);
        });
    }

    function getTaxRate(taxId) {
        var tax = getTax(taxId);
        return tax ? Number(tax.value || 0) : 0;
    }

    function roundMoney(value) {
        return Math.round(Number(value || 0) * 100) / 100;
    }

    function computeBuyPrice(actualPrice, taxRate) {
        var actual = Number(actualPrice || 0);
        var rate = Number(taxRate || 0);
        if (isNaN(actual)) actual = 0;
        if (isNaN(rate)) rate = 0;
        return roundMoney(actual * (1 + rate / 100));
    }

    function rowTaxOptions(selectedId) {
        var options = '<option value="">Select GST (optional)</option>';
        options += taxes.map(function (tax) {
            var selected = String(tax.id) === String(selectedId) ? " selected" : "";
            return '<option value="' + tax.id + '"' + selected + '>' +
                InventoryApi.escapeHtml(taxLabel(tax)) + "</option>";
        }).join("");
        return options;
    }

    function renderRowTaxSelect(select, selectedId) {
        if (!select) return;
        var current = selectedId !== undefined && selectedId !== null
            ? String(selectedId)
            : select.value;
        select.innerHTML = rowTaxOptions(current);
        if (current) select.value = current;
    }

    function refreshAllRowTaxSelects() {
        document.querySelectorAll("#stockin-items-container .inv-item-tax").forEach(function (select) {
            renderRowTaxSelect(select, select.value);
        });
        updateAllRowBuyPrices();
    }

    function getRowTaxId(row) {
        var rowTax = row.querySelector(".inv-item-tax");
        return rowTax ? rowTax.value : "";
    }

    function getEffectiveTaxRate(row) {
        return getTaxRate(getRowTaxId(row));
    }

    function updateRowBuyPrice(row, skipTotals) {
        var actualEl = row.querySelector(".inv-item-actual");
        var qtyEl = row.querySelector(".inv-item-qty");
        var buyEl = row.querySelector(".inv-item-buy");
        var totalEl = row.querySelector(".inv-item-total");
        if (!actualEl || !buyEl) return;
        var unitBuy = computeBuyPrice(actualEl.value, getEffectiveTaxRate(row));
        buyEl.value = InventoryApi.formatMoney(unitBuy);
        var qty = qtyEl ? Number(qtyEl.value || 0) : 0;
        if (isNaN(qty) || qty <= 0) qty = 0;
        if (totalEl) {
            totalEl.value = InventoryApi.formatMoney(roundMoney(unitBuy * (qty || 1)));
        }
        if (!skipTotals) {
            updateInvoiceTotals();
        }
    }

    function getRowUnitBuyPrice(row) {
        var actualEl = row.querySelector(".inv-item-actual");
        if (!actualEl) return 0;
        return computeBuyPrice(actualEl.value, getEffectiveTaxRate(row));
    }

    function getRowLineAmounts(row) {
        var actualPrice = roundMoney(row.querySelector(".inv-item-actual").value);
        var qty = Number(row.querySelector(".inv-item-qty").value || 0);
        if (isNaN(qty) || qty <= 0) qty = 0;
        var lineSubtotal = roundMoney(actualPrice * qty);
        var lineGrand = roundMoney(getRowUnitBuyPrice(row) * (qty || 1));
        var lineTax = roundMoney(lineGrand - lineSubtotal);
        if (lineTax < 0) lineTax = 0;
        return {
            subtotal: lineSubtotal,
            tax: lineTax,
            grand: lineGrand
        };
    }

    function calculateInvoiceTotals() {
        var subtotal = 0;
        var gstTotal = 0;
        var grandTotal = 0;
        document.querySelectorAll("#stockin-items-container .inv-mgmt-item-row").forEach(function (row) {
            if (!row.querySelector(".inv-item-product").value) return;
            var amounts = getRowLineAmounts(row);
            subtotal += amounts.subtotal;
            gstTotal += amounts.tax;
            grandTotal += amounts.grand;
        });
        return {
            subtotal: roundMoney(subtotal),
            gstTotal: roundMoney(gstTotal),
            grandTotal: roundMoney(grandTotal)
        };
    }

    function updateInvoiceTotals() {
        var totals = calculateInvoiceTotals();
        var subEl = document.getElementById("stockin-subtotal");
        var gstEl = document.getElementById("stockin-gst-total");
        var grandEl = document.getElementById("stockin-grand-total");
        if (subEl) subEl.textContent = InventoryApi.formatMoney(totals.subtotal);
        if (gstEl) gstEl.textContent = InventoryApi.formatMoney(totals.gstTotal);
        if (grandEl) grandEl.textContent = InventoryApi.formatMoney(totals.grandTotal);
    }

    function updateAllRowBuyPrices() {
        document.querySelectorAll("#stockin-items-container .inv-mgmt-item-row").forEach(function (row) {
            updateRowBuyPrice(row, true);
        });
        updateInvoiceTotals();
    }

    function loadTaxes(selectedId) {
        return taxRequest("?page_size=100&ordering=key").then(function (body) {
            if (body && body.isSuccess && body.data) {
                taxes = body.data.items || [];
            } else {
                taxes = [];
            }
            refreshAllRowTaxSelects();
            if (selectedId && pendingTaxRow) {
                var select = pendingTaxRow.querySelector(".inv-item-tax");
                if (select) {
                    select.value = String(selectedId);
                    updateRowBuyPrice(pendingTaxRow);
                }
                pendingTaxRow = null;
            }
        });
    }

    function toggleGstPanel(show) {
        var panel = document.getElementById("stockin-gst-new-panel");
        if (!panel) return;
        if (show) {
            panel.classList.remove("inv-hidden");
            document.getElementById("stockin-gst-new-key").focus();
        } else {
            panel.classList.add("inv-hidden");
            document.getElementById("stockin-gst-new-key").value = "";
            document.getElementById("stockin-gst-new-value").value = "";
        }
    }

    function saveNewGst() {
        var key = document.getElementById("stockin-gst-new-key").value.trim();
        var valueRaw = document.getElementById("stockin-gst-new-value").value.trim();
        if (!key) {
            InventoryToast.error("GST key is required (e.g. gst12%).");
            return;
        }
        if (valueRaw === "") {
            InventoryToast.error("GST value is required (e.g. 12).");
            return;
        }
        var value = parseFloat(valueRaw);
        if (Number.isNaN(value) || value < 0 || value > 100) {
            InventoryToast.error("GST value must be between 0 and 100.");
            return;
        }

        var btn = document.getElementById("stockin-gst-save-btn");
        InventoryLoader.button(btn, true, "Saving...");

        taxRequest("", {
            method: "POST",
            body: { key: key, value: value }
        })
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    InventoryToast.success("GST added.");
                    toggleGstPanel(false);
                    return loadTaxes(body.data.id);
                }
                var err = body.message || "Unable to add GST.";
                if (body.errors && body.errors.length) err = body.errors.join(" • ");
                InventoryToast.error(err);
            })
            .catch(function () {
                InventoryToast.error("Network error. Please try again.");
            })
            .finally(function () {
                InventoryLoader.button(btn, false);
            });
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
        var actualEl = row.querySelector(".inv-item-actual");
        var taxSelect = row.querySelector(".inv-item-tax");
        if (!product) {
            updateRowBuyPrice(row);
            return;
        }
        if (taxSelect && product.tax) {
            taxSelect.value = String(product.tax);
        }
        if (actualEl) {
            if (product.actual_price != null && String(product.actual_price).trim() !== "" && Number(product.actual_price) > 0) {
                actualEl.value = product.actual_price;
            } else if (product.purchase_price != null && Number(product.purchase_price) > 0) {
                var rate = product.tax ? getTaxRate(product.tax) : 0;
                actualEl.value = rate > 0
                    ? roundMoney(Number(product.purchase_price) / (1 + rate / 100))
                    : product.purchase_price;
            } else {
                actualEl.value = "";
            }
        }
        updateRowBuyPrice(row);
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
            '<div class="inv-mgmt-field"><label>Actual Price</label><input class="inv-mgmt-input inv-item-actual" type="number" min="0" step="0.01" placeholder="0.00" value="' + (data.actual_price != null ? data.actual_price : "") + '"/></div>' +
            '<div class="inv-mgmt-field"><label>GST</label>' +
            '<div class="inv-field-inline">' +
            '<select class="inv-mgmt-select inv-item-tax">' + rowTaxOptions(data.tax_id || "") + "</select>" +
            '<button type="button" class="inv-inline-add-btn inv-item-tax-add" title="Add GST" aria-label="Add GST">' +
            '<span class="material-symbols-outlined">add</span></button></div></div>' +
            '<div class="inv-mgmt-field"><label>Buy Price</label><input class="inv-mgmt-input inv-item-buy" type="text" readonly value="0.00"/></div>' +
            '<div class="inv-mgmt-field"><label>Total Price</label><input class="inv-mgmt-input inv-item-total" type="text" readonly value="0.00"/></div>' +
            '<div class="inv-mgmt-field"><label>Batch No.</label><input class="inv-mgmt-input inv-item-batch" type="text" placeholder="B001" value="' + InventoryApi.escapeHtml(data.batch_number || "") + '"/></div>' +
            '<div class="inv-mgmt-field"><label>Expiry</label><input class="inv-mgmt-input inv-item-expiry" type="date" value="' + (data.expiry_date || "") + '"/></div>' +
            '<div class="inv-mgmt-item-row-remove">' +
            '<button type="button" class="inv-row-action-btn inv-row-action-btn--delete inv-item-remove" title="Remove" aria-label="Remove product row">' +
            '<span class="material-symbols-outlined">delete</span></button></div>';

        row.querySelector(".inv-item-remove").addEventListener("click", function () {
            row.remove();
            updateInvoiceTotals();
        });
        row.querySelector(".inv-item-product").addEventListener("change", function () {
            applyProductToRow(row, getProduct(this.value));
        });
        row.querySelector(".inv-item-product-add").addEventListener("click", function () {
            openAddProductModal(row);
        });

        if (data.product_id) {
            applyProductToRow(row, getProduct(data.product_id));
        } else {
            updateRowBuyPrice(row);
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

    function formatDate(value) {
        if (value === null || value === undefined || String(value).trim() === "") return "—";
        var raw = String(value).trim();
        var match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
            return match[3] + "/" + match[2] + "/" + match[1];
        }
        var d = new Date(raw);
        if (isNaN(d.getTime())) return "—";
        var day = String(d.getDate()).padStart(2, "0");
        var month = String(d.getMonth() + 1).padStart(2, "0");
        var year = d.getFullYear();
        return day + "/" + month + "/" + year;
    }

    function formatQty(value) {
        var num = Number(value || 0);
        return Number.isInteger(num) ? String(num) : num.toFixed(2);
    }

    function cellFile(item) {
        if (!item.attachment_url) {
            return "—";
        }
        var label = item.attachment_name || "View file";
        return (
            '<a class="inv-stockin-list-file-link" href="' + InventoryApi.escapeHtml(item.attachment_url) + '" ' +
            'target="_blank" rel="noopener" title="Open ' + InventoryApi.escapeHtml(label) + '">' +
            '<span class="material-symbols-outlined">description</span>' +
            '<span class="inv-stockin-list-file-text">' + InventoryApi.escapeHtml(label) + "</span></a>"
        );
    }

    function renderRows(items) {
        var tbody = document.getElementById("stockin-table-body");
        if (!tbody) return;

        var cols = getColumnCtrl();
        var colspan = cols.getColspan();

        if (!items || !items.length) {
            tbody.innerHTML = '<tr><td colspan="' + colspan + '" class="inv-mgmt-empty">No purchase invoices yet.</td></tr>';
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
                '<td class="inv-col-action">' + actionButtons(item) + "</td>" +
                "</tr>"
            );
        }).join("");

        bulk.afterRender();
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
            { label: "Purchase Date", value: displayValue(formatDate(invoice.invoice_date)) },
            { label: "Total Quantity", value: displayValue(formatQty(invoice.total_quantity)) },
            { label: "Subtotal", value: InventoryApi.formatMoney(invoice.subtotal) },
            { label: "GST Price", value: InventoryApi.formatMoney(invoice.tax) },
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
            "<th>Product</th><th>SKU</th><th>Qty</th><th>Actual Price</th><th>Buy Price</th><th>Batch</th><th>Expiry</th><th>Total Price</th>" +
            "</tr></thead><tbody>" +
            lines.map(function (line) {
                return (
                    "<tr>" +
                    "<td>" + displayValue(line.product_name) + "</td>" +
                    "<td>" + displayValue(line.product_sku) + "</td>" +
                    "<td class=\"inv-mgmt-cell--num\">" + displayValue(line.quantity) + "</td>" +
                    "<td class=\"inv-mgmt-cell--num\">" + InventoryApi.formatMoney(line.actual_price || line.purchase_price) + "</td>" +
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
            row.querySelectorAll("input, select, button.inv-item-product-add, button.inv-item-tax-add, button.inv-item-remove").forEach(function (el) {
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
                actual_price: line.actual_price,
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
        toggleGstPanel(false);
        pendingTaxRow = null;
        var dateEl = document.getElementById("stockin-invoice-date");
        if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);
        var container = document.getElementById("stockin-items-container");
        container.innerHTML = "";
        container.appendChild(createItemRow());
        setItemsEditable(true);
        updateInvoiceTotals();
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
        Promise.all([loadProducts(), loadTaxes()])
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

    function buildListQuery(page) {
        var params = new URLSearchParams();
        params.set("page", String(page || 1));
        params.set("page_size", String(InventoryPagination.getPageSize("stockin-pagination")));

        var searchEl = document.getElementById("stockin-search");
        var dateFromEl = document.getElementById("stockin-date-from");
        var dateToEl = document.getElementById("stockin-date-to");
        if (searchEl && searchEl.value.trim()) {
            params.set("search", searchEl.value.trim());
        }
        if (dateFromEl && dateFromEl.value) {
            params.set("date_from", dateFromEl.value);
        }
        if (dateToEl && dateToEl.value) {
            params.set("date_to", dateToEl.value);
        }
        if (currentOrdering) {
            params.set("ordering", currentOrdering);
        }

        return "?" + params.toString();
    }

    function clearFilters() {
        var searchEl = document.getElementById("stockin-search");
        var dateFromEl = document.getElementById("stockin-date-from");
        var dateToEl = document.getElementById("stockin-date-to");
        if (searchEl) searchEl.value = "";
        if (dateFromEl) dateFromEl.value = "";
        if (dateToEl) dateToEl.value = "";
        loadInvoices(1);
    }

    function loadInvoices(page) {
        currentPage = page || 1;
        InventoryLoader.show();

        return request(buildListQuery(currentPage))
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
        Promise.all([loadProducts(), loadTaxes()]).then(function () {
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
            var qty = row.querySelector(".inv-item-qty").value;
            var actualPrice = roundMoney(row.querySelector(".inv-item-actual").value);
            var unitBuyPrice = getRowUnitBuyPrice(row);
            var amounts = getRowLineAmounts(row);
            if (actualPrice <= 0) {
                unitBuyPrice = 0;
                amounts = { subtotal: 0, tax: 0, grand: 0 };
            }
            items.push({
                product_id: Number(productId),
                quantity: qty,
                purchase_price: unitBuyPrice,
                tax: amounts.tax,
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

        getColumnCtrl();

        var openBtn = document.getElementById("stockin-open-modal-btn");
        var addItemBtn = document.getElementById("stockin-add-item-btn");
        var saveBtn = document.getElementById("stockin-save-btn");
        var tbody = document.getElementById("stockin-table-body");

        function boot() {
            if (!InventoryBusiness.getActiveId()) return;
            Promise.all([loadProducts(), loadTaxes()]).then(function () {
                loadInvoices(1);
            });
        }

        InventoryBusiness.whenReady(function () {
            boot();
            if (window.InventorySidebar && InventorySidebar.consumeAddAction()) {
                openModal();
            }
        });
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

        var itemsContainer = document.getElementById("stockin-items-container");
        if (itemsContainer) {
            itemsContainer.addEventListener("input", function (e) {
                if (!e.target.matches(".inv-item-actual, .inv-item-qty")) return;
                var row = e.target.closest(".inv-mgmt-item-row");
                if (row) updateRowBuyPrice(row);
            });
            itemsContainer.addEventListener("change", function (e) {
                if (!e.target.matches(".inv-item-tax")) return;
                var row = e.target.closest(".inv-mgmt-item-row");
                if (row) updateRowBuyPrice(row);
            });
            itemsContainer.addEventListener("click", function (e) {
                var taxAddBtn = e.target.closest(".inv-item-tax-add");
                if (!taxAddBtn) return;
                var row = taxAddBtn.closest(".inv-mgmt-item-row");
                if (!row) return;
                pendingTaxRow = row;
                var panel = document.getElementById("stockin-gst-new-panel");
                toggleGstPanel(panel.classList.contains("inv-hidden"));
            });
        }

        var gstSaveBtn = document.getElementById("stockin-gst-save-btn");
        var gstCancelBtn = document.getElementById("stockin-gst-cancel-btn");
        if (gstSaveBtn) gstSaveBtn.addEventListener("click", saveNewGst);
        if (gstCancelBtn) gstCancelBtn.addEventListener("click", function () {
            pendingTaxRow = null;
            toggleGstPanel(false);
        });

        var searchEl = document.getElementById("stockin-search");
        var dateFromEl = document.getElementById("stockin-date-from");
        var dateToEl = document.getElementById("stockin-date-to");
        var clearBtn = document.getElementById("stockin-clear-filters");

        if (searchEl) {
            searchEl.addEventListener("input", function () {
                window.clearTimeout(searchTimer);
                searchTimer = window.setTimeout(function () {
                    loadInvoices(1);
                }, 300);
            });
        }
        if (dateFromEl) dateFromEl.addEventListener("change", function () { loadInvoices(1); });
        if (dateToEl) dateToEl.addEventListener("change", function () { loadInvoices(1); });
        if (clearBtn) clearBtn.addEventListener("click", clearFilters);

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
                }
            });
        }
    }

    return { init: init };
})();
