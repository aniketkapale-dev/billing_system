var InventoryStockIn = (function () {
    "use strict";

    var API = "/api/invoicing/purchase-invoices";
    var PRODUCTS_API = "/api/products";
    var BARCODES_API = "/api/settings/barcodes";
    var CATALOG_API = "/api/catalog";
    var PAGE_SIZE = (window.InventoryConstants && InventoryConstants.PAGE_SIZE) || 10;
    var currentPage = 1;
    var currentOrdering = "-invoice_date";
    var searchTimer = null;
    var products = [];
    var vendors = [];
    var barcodes = [];
    var barcodesByProductId = {};
    var barcodesLoadPromises = {};
    var pendingProductRow = null;
    var pendingVendorRow = null;
    var pendingBarcodeRow = null;
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
                includeBulkCheck: false,
                bulkHeaderHtml: '<th class="inv-col-check d-none"><input type="checkbox" class="inv-bulk-select-all" aria-label="Select all"/></th>',
                sortDefault: "-invoice_date",
                onSortChange: function (ordering) {
                    currentOrdering = ordering;
                    loadInvoices(1);
                },
                columns: [
                    { id: "date", label: "Date", locked: true, cell: function (item) { return "<td>" + InventoryApi.escapeHtml(formatDate(item.invoice_date)) + "</td>"; } },
                    { id: "invoice_no", label: "Invoice No.", locked: true, sortKey: "invoice_number", cell: function (item) { return "<td><strong>" + InventoryApi.escapeHtml(item.invoice_number) + "</strong></td>"; } },
                    { id: "qty", label: "Qty", headerClass: "inv-mgmt-cell--num", cell: function (item) { return '<td class="inv-mgmt-cell--num">' + InventoryApi.escapeHtml(formatQty(item.total_quantity)) + "</td>"; } },
                    { id: "subtotal", label: "Total Amount", sortKey: "subtotal", locked: true, headerClass: "inv-mgmt-cell--num", cell: function (item) { return '<td class="inv-mgmt-cell--num"><strong>' + InventoryApi.formatMoney(item.subtotal) + "</strong></td>"; } },
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
            ["Date", "Invoice No.", "Qty", "Total Amount"],
            items.map(function (item) {
                return [
                    formatDate(item.invoice_date),
                    item.invoice_number || "",
                    formatQty(item.total_quantity),
                    item.subtotal || ""
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
            ["Date", "Invoice No.", "Qty", "Total Amount"],
            items.map(function (item) {
                return [
                    formatDate(item.invoice_date),
                    item.invoice_number || "",
                    formatQty(item.total_quantity),
                    item.subtotal || ""
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

    function catalogRequest(path, opts) {
        return InventoryApi.request(CATALOG_API, path, opts);
    }

    function vendorOptions(selectedId) {
        if (!vendors.length) {
            return '<option value="">No vendors — add one first</option>';
        }
        var options = '<option value="">Select vendor (optional)</option>';
        options += vendors.map(function (vendor) {
            var selected = String(vendor.id) === String(selectedId) ? " selected" : "";
            return '<option value="' + vendor.id + '"' + selected + ">" +
                InventoryApi.escapeHtml(vendor.name) + "</option>";
        }).join("");
        return options;
    }

    function renderVendorSelectInRow(row, selectedId) {
        var select = row.querySelector(".inv-item-vendor");
        if (!select) return;
        select.innerHTML = vendorOptions(selectedId);
        if (selectedId) {
            select.value = String(selectedId);
        }
    }

    function updateAllVendorSelects(newVendorId, focusRow) {
        document.querySelectorAll("#stockin-items-container .inv-item-vendor").forEach(function (select) {
            var row = select.closest(".inv-mgmt-item-row");
            var selectedId = row === focusRow && newVendorId
                ? newVendorId
                : select.value;
            renderVendorSelectInRow(row, selectedId);
        });
    }

    function loadVendors(selectedId, focusRow) {
        return catalogRequest("/vendors/?page_size=100&ordering=name").then(function (body) {
            vendors = body && body.isSuccess ? (body.data.items || []) : [];
            updateAllVendorSelects(selectedId, focusRow);
            return vendors;
        });
    }

    function toggleVendorPanel(show) {
        var panel = document.getElementById("stockin-vendor-new-panel");
        if (!panel) return;
        if (show) {
            panel.classList.remove("inv-hidden");
            document.getElementById("stockin-vendor-new-name").focus();
        } else {
            panel.classList.add("inv-hidden");
            document.getElementById("stockin-vendor-new-name").value = "";
        }
    }

    function saveNewVendor() {
        var name = document.getElementById("stockin-vendor-new-name").value.trim();
        if (!name) {
            InventoryToast.error("Vendor name is required.");
            return;
        }

        var btn = document.getElementById("stockin-vendor-save-btn");
        InventoryLoader.button(btn, true, "Saving...");

        catalogRequest("/vendors/", {
            method: "POST",
            body: { name: name }
        })
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    InventoryToast.success("Vendor added.");
                    toggleVendorPanel(false);
                    var focusRow = pendingVendorRow;
                    pendingVendorRow = null;
                    return loadVendors(body.data.id, focusRow);
                }
                var err = body.message || "Unable to add vendor.";
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

    function roundMoney(value) {
        return Math.round(Number(value || 0) * 100) / 100;
    }

    function updateRowTotalPrice(row, skipTotals) {
        var priceEl = row.querySelector(".inv-item-price-with-tax");
        var qtyEl = row.querySelector(".inv-item-qty");
        var totalEl = row.querySelector(".inv-item-total");
        if (!priceEl || !totalEl) return;
        var unitPrice = roundMoney(priceEl.value);
        var qty = qtyEl ? Number(qtyEl.value || 0) : 0;
        if (isNaN(qty) || qty <= 0) qty = 0;
        totalEl.value = InventoryApi.formatMoney(roundMoney(unitPrice * (qty || 1)));
        if (!skipTotals) {
            updateInvoiceTotals();
        }
    }

    function getRowUnitPrice(row) {
        var priceEl = row.querySelector(".inv-item-price-with-tax");
        if (!priceEl) return 0;
        return roundMoney(priceEl.value);
    }

    function getRowLineAmounts(row) {
        var unitPrice = getRowUnitPrice(row);
        var qty = Number(row.querySelector(".inv-item-qty").value || 0);
        if (isNaN(qty) || qty <= 0) qty = 0;
        var lineTotal = roundMoney(unitPrice * (qty || 1));
        return {
            subtotal: lineTotal,
            tax: 0,
            grand: lineTotal
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
        if (subEl) subEl.textContent = InventoryApi.formatMoney(totals.subtotal);
    }

    function updateAllRowTotals() {
        document.querySelectorAll("#stockin-items-container .inv-mgmt-item-row").forEach(function (row) {
            updateRowTotalPrice(row, true);
        });
        updateInvoiceTotals();
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

    function parseRowPrice(value) {
        var num = Number(value);
        return isNaN(num) ? 0 : num;
    }

    function getProductHighestMrp(product) {
        if (!product) return 0;
        var batchMrp = Number(product.max_batch_mrp || 0);
        var productMrp = Number(product.mrp || 0);
        var highest = Math.max(
            isNaN(batchMrp) ? 0 : batchMrp,
            isNaN(productMrp) ? 0 : productMrp
        );
        return highest < 0 ? 0 : highest;
    }

    function updateRowMrpEditHint(row) {
        var productSelect = row.querySelector(".inv-item-product");
        var priceEl = row.querySelector(".inv-item-price-with-tax");
        var mrpField = row.querySelector(".inv-stockin-mrp-field");
        var mrpInput = row.querySelector(".inv-item-mrp");
        var hint = row.querySelector(".inv-stockin-mrp-hint");
        if (!productSelect || !priceEl) return;

        var product = getProduct(productSelect.value);
        var price = parseRowPrice(priceEl.value);
        var highestMrp = getProductHighestMrp(product);
        var show = !!(product && price > 0 && price > highestMrp);

        if (mrpField) mrpField.classList.toggle("inv-hidden", !show);
        if (show && mrpInput && mrpInput.value === "") {
            mrpInput.value = String(price);
        }
        if (hint) {
            if (show) {
                hint.textContent =
                    "Change the MRP — it should be greater than " + InventoryApi.formatMoney(price) + ".";
            } else {
                hint.textContent = "";
            }
        }
    }

    function getBarcode(barcodeId) {
        var found = barcodes.find(function (item) {
            return String(item.id) === String(barcodeId);
        });
        if (found) return found;

        return Object.keys(barcodesByProductId).reduce(function (match, key) {
            if (match) return match;
            return barcodesByProductId[key].find(function (item) {
                return String(item.id) === String(barcodeId);
            });
        }, null);
    }

    function mergeBarcodesIntoCache(items) {
        (items || []).forEach(function (item) {
            var exists = barcodes.some(function (existing) {
                return String(existing.id) === String(item.id);
            });
            if (!exists) barcodes.push(item);
        });
    }

    function fetchAllBarcodePages(query) {
        var page = 1;
        var pageSize = 500;
        var all = [];

        function loadNext() {
            var path = query + (query.indexOf("?") >= 0 ? "&" : "?") +
                "page=" + page + "&page_size=" + pageSize;
            return InventoryApi.request(BARCODES_API, path).then(function (body) {
                if (!(body && body.isSuccess && body.data)) {
                    return all;
                }
                all = all.concat(body.data.items || []);
                var pagination = body.data.pagination || {};
                if (pagination.has_next) {
                    page += 1;
                    return loadNext();
                }
                return all;
            });
        }

        return loadNext();
    }

    function fetchBarcodesForProduct(productId) {
        if (!productId) return Promise.resolve([]);

        var key = String(productId);
        if (Object.prototype.hasOwnProperty.call(barcodesByProductId, key)) {
            return Promise.resolve(barcodesByProductId[key]);
        }
        if (barcodesLoadPromises[key]) {
            return barcodesLoadPromises[key];
        }

        barcodesLoadPromises[key] = fetchAllBarcodePages(
            "?product_id=" + encodeURIComponent(productId) + "&ordering=value"
        ).then(function (items) {
            var product = getProduct(productId);
            var filtered = product
                ? items.filter(function (item) {
                    return barcodeBelongsToProduct(item, product);
                })
                : items;
            barcodesByProductId[key] = filtered;
            mergeBarcodesIntoCache(filtered);
            delete barcodesLoadPromises[key];
            return filtered;
        }).catch(function () {
            delete barcodesLoadPromises[key];
            return [];
        });

        return barcodesLoadPromises[key];
    }

    function invalidateProductBarcodes(productId) {
        if (!productId) return;
        delete barcodesByProductId[String(productId)];
    }

    function resetBarcodeCache() {
        barcodes = [];
        barcodesByProductId = {};
        barcodesLoadPromises = {};
    }

    function formatBarcodeOptionLabel(item) {
        return String(item.value || "").trim() || "—";
    }

    function getProductSkuKey(product) {
        if (!product || !product.sku) return "";
        return String(product.sku).trim().toLowerCase();
    }

    function barcodeBelongsToProduct(item, product) {
        if (!item || !product) return false;

        if (item.product) {
            return String(item.product) === String(product.id);
        }

        var skuKey = getProductSkuKey(product);
        if (!skuKey) return false;

        var label = String(item.model_label || item.product_sku || "").trim().toLowerCase();
        return label === skuKey;
    }

    function getBarcodesForRow(productId) {
        if (!productId) return [];
        return barcodesByProductId[String(productId)] || [];
    }

    function assignBarcodeToProduct(barcodeId, productId) {
        if (!barcodeId || !productId) return Promise.resolve(null);
        var barcode = getBarcode(barcodeId);
        if (!barcode) return Promise.resolve(null);
        if (barcode.product && String(barcode.product) === String(productId)) {
            return Promise.resolve(barcode);
        }
        if (barcode.product) {
            InventoryToast.error("This barcode is already assigned to another product.");
            return Promise.resolve(null);
        }
        return InventoryApi.request(BARCODES_API, "/" + barcodeId + "/", {
            method: "PATCH",
            body: { product_id: Number(productId) }
        }).then(function (body) {
            if (body && body.isSuccess && body.data) {
                var idx = barcodes.findIndex(function (item) {
                    return String(item.id) === String(barcodeId);
                });
                if (idx >= 0) barcodes[idx] = body.data;
                invalidateProductBarcodes(productId);
                return body.data;
            }
            InventoryToast.error(body.message || "Failed to assign barcode to product.");
            return null;
        });
    }

    function getRowBarcodeId(row) {
        return row && row.dataset.barcodeId ? String(row.dataset.barcodeId) : "";
    }

    function setRowBarcodeField(row, barcode) {
        var input = row.querySelector(".inv-item-barcode");
        if (!input) return;
        if (!barcode) {
            input.value = "";
            delete row.dataset.barcodeId;
            return;
        }
        input.value = formatBarcodeOptionLabel(barcode);
        row.dataset.barcodeId = String(barcode.id);
    }

    function assignBarcodesFromForm() {
        var rows = document.querySelectorAll("#stockin-items-container .inv-mgmt-item-row");
        var promises = [];
        rows.forEach(function (row) {
            var productId = row.querySelector(".inv-item-product").value;
            var barcodeId = getRowBarcodeId(row);
            if (productId && barcodeId) {
                promises.push(assignBarcodeToProduct(barcodeId, productId));
            }
        });
        return Promise.all(promises);
    }

    function loadBarcodes() {
        resetBarcodeCache();
        refreshAllRowBarcodeFields();
        return Promise.resolve([]);
    }

    function renderRowBarcodeField(row, productId, selectedBarcodeId, options) {
        options = options || {};
        var input = row.querySelector(".inv-item-barcode");
        if (!input) return;

        if (!productId) {
            input.disabled = false;
            input.placeholder = "Auto-filled";
            setRowBarcodeField(row, null);
            return;
        }

        input.disabled = true;
        input.value = "";
        input.placeholder = "Loading...";
        delete row.dataset.barcodeId;

        fetchBarcodesForProduct(productId).then(function (items) {
            if (!input.isConnected) return;
            input.disabled = false;
            input.placeholder = "Auto-filled";

            var barcode = null;
            if (selectedBarcodeId) {
                barcode = items.find(function (item) {
                    return String(item.id) === String(selectedBarcodeId);
                }) || getBarcode(selectedBarcodeId);
            }
            if (!barcode && options.autoSelectFirst && items.length) {
                barcode = items[0];
            }

            if (barcode) {
                setRowBarcodeField(row, barcode);
                return;
            }

            setRowBarcodeField(row, null);
            if (options.openModalIfEmpty) {
                var product = getProduct(productId);
                if (product && getProductSkuKey(product)) {
                    openAddBarcodeModal(row);
                }
            }
        });
    }

    function refreshAllRowBarcodeFields() {
        document.querySelectorAll("#stockin-items-container .inv-mgmt-item-row").forEach(function (row) {
            var productId = row.querySelector(".inv-item-product").value;
            renderRowBarcodeField(row, productId, getRowBarcodeId(row));
        });
    }

    function applyProductToRow(row, product, preferredBarcodeId) {
        var priceEl = row.querySelector(".inv-item-price-with-tax");
        if (!product) {
            if (priceEl) priceEl.value = "";
            renderRowBarcodeField(row, "", "");
            updateRowTotalPrice(row);
            updateRowMrpEditHint(row);
            return;
        }
        if (priceEl) {
            var price = product.purchase_price != null && Number(product.purchase_price) > 0
                ? product.purchase_price
                : product.actual_price;
            priceEl.value = price != null && Number(price) > 0 ? price : "";
        }
        var selectedBarcodeId = preferredBarcodeId || getRowBarcodeId(row);
        if (selectedBarcodeId) {
            var selectedBarcode = getBarcode(selectedBarcodeId);
            if (!selectedBarcode || !barcodeBelongsToProduct(selectedBarcode, product)) {
                selectedBarcodeId = "";
            }
        }
        renderRowBarcodeField(row, product.id, selectedBarcodeId, {
            autoSelectFirst: true,
            openModalIfEmpty: true
        });
        updateRowTotalPrice(row);
        updateRowMrpEditHint(row);
    }

    function openAddBarcodeModal(row) {
        pendingBarcodeRow = row || null;
        var productId = "";
        if (row) {
            var productSelect = row.querySelector(".inv-item-product");
            productId = productSelect ? productSelect.value : "";
        }
        if (!productId) {
            InventoryToast.error("Select a product first.");
            return;
        }
        var product = getProduct(productId);
        if (!product || !getProductSkuKey(product)) {
            InventoryToast.error("Selected product must have a SKU before adding barcodes.");
            return;
        }
        var modal = document.getElementById("barcode-modal");
        if (modal) {
            modal.dataset.prefillProductId = productId;
        }
        if (window.InventorySettingsBarcode && typeof InventorySettingsBarcode.openAddModal === "function") {
            InventorySettingsBarcode.openAddModal();
            return;
        }
        InventoryToast.error("Barcode form is not available.");
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
            '<div class="inv-mgmt-field"><label>Vendor</label>' +
            '<div class="inv-field-inline">' +
            '<select class="inv-mgmt-select inv-item-vendor">' + vendorOptions(data.vendor_id) + "</select>" +
            '<button type="button" class="inv-inline-add-btn inv-item-vendor-add" title="Add vendor" aria-label="Add vendor">' +
            '<span class="material-symbols-outlined">add</span></button></div></div>' +
            '<div class="inv-mgmt-field"><label>Quantity</label><input class="inv-mgmt-input inv-item-qty" type="number" min="0.01" step="0.01" value="' + (data.quantity || 1) + '" required/></div>' +
            '<div class="inv-mgmt-field inv-stockin-price-field"><label>Cost Price with Tax (per product)</label>' +
            '<input class="inv-mgmt-input inv-item-price-with-tax" type="number" min="0" step="0.01" placeholder="0.00" value="' + (data.purchase_price != null ? data.purchase_price : "") + '"/></div>' +
            '<div class="inv-mgmt-field inv-stockin-mrp-field inv-hidden">' +
            '<label>Update the MRP</label>' +
            '<input class="inv-mgmt-input inv-item-mrp" type="number" min="0" step="0.01" placeholder="0.00"/>' +
            '<div class="inv-field-hint inv-stockin-mrp-hint"></div></div>' +
            '<div class="inv-mgmt-field"><label>Total Price</label><input class="inv-mgmt-input inv-item-total" type="text" readonly value="0.00"/></div>' +
            '<div class="inv-mgmt-field"><label>Barcode</label>' +
            '<input class="inv-mgmt-input inv-item-barcode" type="text" readonly placeholder="Auto-filled" value=""/></div>' +
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
        row.querySelector(".inv-item-vendor-add").addEventListener("click", function () {
            pendingVendorRow = row;
            var panel = document.getElementById("stockin-vendor-new-panel");
            toggleVendorPanel(panel.classList.contains("inv-hidden"));
        });

        if (data.product_id) {
            applyProductToRow(row, getProduct(data.product_id), data.barcode_id || "");
        } else {
            updateRowTotalPrice(row);
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

    function formatDate(value) {
        return InventoryApi.formatDisplayDate(value, "—");
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
            return;
        }

        cachedItems = items;

        tbody.innerHTML = items.map(function (item) {
            return (
                "<tr>" +
                cols.renderRowCells(item) +
                '<td class="inv-col-action inv-mgmt-cell--action">' + actionButtons(item) + "</td>" +
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
            { label: "Invoice Number", value: displayValue(invoice.invoice_number), emphasis: true },
            { label: "Purchase Date", value: displayValue(formatDate(invoice.invoice_date)) },
            { label: "Total Quantity", value: displayValue(formatQty(invoice.total_quantity)), num: true },
            { label: "Total Amount", value: InventoryApi.formatMoney(invoice.subtotal), num: true, emphasis: true },
            { label: "Remarks", value: displayValue(invoice.remarks) }
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

        container.innerHTML = InventoryApi.renderViewGrid(rows);

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
            "<th>Product</th><th>Vendor</th><th>SKU</th><th>Qty</th><th>Cost Price with Tax (per product)</th><th>Batch</th><th>Expiry</th><th>Total Price</th>" +
            "</tr></thead><tbody>" +
            lines.map(function (line) {
                return (
                    "<tr>" +
                    "<td>" + displayValue(line.product_name) + "</td>" +
                    "<td>" + displayValue(line.vendor_name) + "</td>" +
                    "<td>" + displayValue(line.product_sku) + "</td>" +
                    "<td class=\"inv-mgmt-cell--num\">" + displayValue(line.quantity) + "</td>" +
                    "<td class=\"inv-mgmt-cell--num\">" + InventoryApi.formatMoney(line.purchase_price) + "</td>" +
                    "<td>" + displayValue(line.batch_number) + "</td>" +
                    "<td>" + displayValue(InventoryApi.formatDisplayDate(line.expiry_date, "—")) + "</td>" +
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
            row.querySelectorAll("input, select, button.inv-item-product-add, button.inv-item-vendor-add, button.inv-item-remove").forEach(function (el) {
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
                vendor_id: line.vendor,
                batch_number: line.batch_number,
                barcode_id: "",
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
        toggleVendorPanel(false);
        pendingVendorRow = null;
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
        loadProducts()
            .then(function () {
                return loadVendors();
            })
            .then(function () {
                return loadBarcodes();
            })
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
        Promise.all([loadProducts(), loadVendors(), loadBarcodes()]).then(function () {
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
            var unitPrice = getRowUnitPrice(row);
            var amounts = getRowLineAmounts(row);
            var vendorEl = row.querySelector(".inv-item-vendor");
            var vendorId = vendorEl ? vendorEl.value : "";
            var item = {
                product_id: Number(productId),
                quantity: qty,
                purchase_price: unitPrice,
                tax: amounts.tax,
                vendor_id: vendorId ? Number(vendorId) : null,
                batch_number: row.querySelector(".inv-item-batch").value.trim(),
                expiry_date: expiry || null,
            };
            var mrpEl = row.querySelector(".inv-item-mrp");
            var mrpField = row.querySelector(".inv-stockin-mrp-field");
            if (mrpEl && mrpField && !mrpField.classList.contains("inv-hidden")) {
                var mrpVal = parseRowPrice(mrpEl.value);
                if (mrpVal > 0) {
                    item.mrp = mrpVal;
                }
            }
            items.push(item);
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
            assignBarcodesFromForm().then(function () {
            var editBody = attachmentFile ? buildInvoiceFormData(payload) : payload;
            return request("/" + editingInvoiceId + "/", { method: "PATCH", body: editBody });
            })
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
        assignBarcodesFromForm().then(function () {
        var createBody = attachmentFile ? buildInvoiceFormData(payload, items) : payload;
        return request("/", { method: "POST", body: createBody });
        })
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
            loadProducts().then(function () {
                return loadVendors();
            }).then(function () {
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

        window.addEventListener("inventory:product-updated", function () {
            loadProducts().then(function () {
                document.querySelectorAll("#stockin-items-container .inv-mgmt-item-row").forEach(function (row) {
                    updateRowMrpEditHint(row);
                });
            });
        });

        window.addEventListener("inventory:barcode-created", function (e) {
            var detail = e.detail || {};
            var barcode = detail.barcode || (detail.barcodes && detail.barcodes[0]);
            var focusRow = pendingBarcodeRow;
            pendingBarcodeRow = null;
            if (focusRow && barcode) {
                var productId = focusRow.querySelector(".inv-item-product").value;
                invalidateProductBarcodes(productId);
                fetchBarcodesForProduct(productId).then(function () {
                    renderRowBarcodeField(focusRow, productId, barcode.id);
                    if (productId) {
                        assignBarcodeToProduct(barcode.id, productId);
                    }
                });
            }
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
                if (!e.target.matches(".inv-item-price-with-tax, .inv-item-qty")) return;
                var row = e.target.closest(".inv-mgmt-item-row");
                if (!row) return;
                updateRowTotalPrice(row);
                if (e.target.matches(".inv-item-price-with-tax")) {
                    updateRowMrpEditHint(row);
                }
            });
        }

        var vendorSaveBtn = document.getElementById("stockin-vendor-save-btn");
        var vendorCancelBtn = document.getElementById("stockin-vendor-cancel-btn");
        if (vendorSaveBtn) vendorSaveBtn.addEventListener("click", saveNewVendor);
        if (vendorCancelBtn) {
            vendorCancelBtn.addEventListener("click", function () {
                pendingVendorRow = null;
                toggleVendorPanel(false);
            });
        }

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
