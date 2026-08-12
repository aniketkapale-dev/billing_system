var InventoryPurchases = (function () {
    "use strict";

    var API = "/api/purchases";
    var PRODUCTS_API = "/api/products";
    var CATALOG_API = "/api/catalog";
    var CUSTOMERS_API = "/api/customers";
    var PAGE_SIZE = (window.InventoryConstants && InventoryConstants.PAGE_SIZE) || 10;
    var currentPage = 1;
    var currentOrdering = "-purchase_date";
    var searchTimer = null;
    var products = [];
    var paymentTypes = [];
    var customers = [];
    var editingPurchaseId = null;
    var PURCHASES_LIST_PANEL = "purchases-list-panel";
    var PURCHASES_FORM_PANEL = "purchases-form-panel";
    var PURCHASES_VIEW_PANEL = "purchases-view-panel";
    var cachedItems = [];
    var bulkSelect = null;
    var columnCtrl = null;

    function getColumnCtrl() {
        if (!columnCtrl) {
            columnCtrl = InventoryColumnCustomize.create({
                tableKey: "purchases",
                theadSelector: ".inv-mgmt-table--purchases thead tr",
                toolbarSelector: "#purchases-list-panel .inv-mgmt-toolbar",
                includeBulkCheck: true,
                bulkHeaderHtml: '<th class="inv-col-check"><input type="checkbox" class="inv-bulk-select-all" aria-label="Select all"/></th>',
                sortDefault: "-purchase_date",
                onSortChange: function (ordering) {
                    currentOrdering = ordering;
                    loadPurchases(1);
                },
                columns: [
                    { id: "date", label: "Date", locked: true, cell: function (p) { return "<td>" + InventoryApi.escapeHtml(p.purchase_date) + "</td>"; } },
                    { id: "customer", label: "Customer", locked: true, sortKey: "customer_name", cell: function (p) { return "<td>" + formatCustomerDisplay(p) + "</td>"; } },
                    { id: "products", label: "Products Sold", cell: function (p) { return '<td class="inv-col-name">' + formatProductsSoldCell(p.items || [], p.id) + "</td>"; } },
                    { id: "sale_amount", label: "Sale Amount", sortKey: "total_amount", cell: function (p) { return '<td class="inv-mgmt-cell--num">' + InventoryApi.formatMoney(p.total_amount) + "</td>"; } },
                    { id: "total_cost", label: "Total Cost", sortKey: "total_cost", cell: function (p) { return '<td class="inv-mgmt-cell--num">' + InventoryApi.formatMoney(p.total_cost) + "</td>"; } },
                    {
                        id: "profit",
                        label: "Profit",
                        sortKey: "total_profit",
                        cell: function (p) {
                            var profit = Number(p.total_profit || 0);
                            var profitClass = profit >= 0 ? "inv-profit-positive" : "inv-profit-negative";
                            return '<td class="inv-mgmt-cell--num ' + profitClass + '"><strong>' + formatProfit(profit) + "</strong></td>";
                        }
                    }
                ],
                onApply: function () {
                    renderPurchaseRows(cachedItems);
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
                tbodyId: "purchases-table-body",
                tableSelector: ".inv-mgmt-table--purchases",
                entitySingular: "Sale",
                entityPlural: "Sales",
                enableDelete: false,
                onPdf: exportSalesPdf,
                onPrint: exportSalesPrint
            });
        }
        return bulkSelect;
    }

    function getSelectedItems(ids) {
        return cachedItems.filter(function (item) {
            return ids.indexOf(String(item.id)) !== -1;
        });
    }

    function fetchSalesDetails(ids) {
        return Promise.all(ids.map(function (id) {
            return fetchPurchase(id);
        })).then(function (results) {
            return results.filter(Boolean);
        });
    }

    function exportSalesPdf(ids) {
        fetchSalesDetails(ids)
            .then(function (sales) {
                if (!sales.length) {
                    InventoryToast.error("Unable to load selected sales.");
                    return;
                }
                InventoryDocumentExport.downloadSalesPdf(sales, "sales.pdf");
            });
    }

    function exportSalesPrint(ids) {
        InventoryLoader.show();
        fetchSalesDetails(ids)
            .then(function (sales) {
                if (!sales.length) {
                    InventoryToast.error("Unable to load selected sales.");
                    return;
                }
                var html = InventoryDocumentExport.buildSalesDocumentHtml(sales);
                InventoryDocumentExport.printHtml("Sales", html);
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function request(path, opts) {
        return InventoryApi.request(API, path, opts);
    }

    function catalogRequest(resource, path, opts) {
        path = path == null ? "" : String(path);
        var segment = String(resource).replace(/^\/+|\/+$/g, "");
        var urlPath;
        if (path.charAt(0) === "?") {
            urlPath = "/" + segment + "/" + path;
        } else if (!path) {
            urlPath = "/" + segment + "/";
        } else {
            urlPath = "/" + segment + "/" + path.replace(/^\//, "");
        }
        return InventoryApi.request(CATALOG_API, urlPath, opts);
    }

    function customerLabel(customer) {
        var mobile = customer.mobile ? String(customer.mobile) : "—";
        return InventoryApi.escapeHtml(customer.name) + "(" + InventoryApi.escapeHtml(mobile) + ")";
    }

    function renderCustomerSelect(selectedId) {
        var select = document.getElementById("purchase-customer");
        if (!select) return;

        var applyOptions = function (el) {
            var html;
            if (!customers.length) {
                html = '<option value="">No customers — add a customer first</option>';
            } else {
                html = '<option value="">Select customer</option>';
                customers.forEach(function (item) {
                    var selected = String(item.id) === String(selectedId) ? " selected" : "";
                    html += '<option value="' + item.id + '"' + selected + ">" +
                        customerLabel(item) + "</option>";
                });
            }
            el.innerHTML = html;
            if (selectedId) {
                el.value = String(selectedId);
            }
        };

        if (window.InventorySearchableSelect) {
            InventorySearchableSelect.rebuild(select, applyOptions);
            return;
        }

        applyOptions(select);
    }

    function loadCustomers(selectedId) {
        return InventoryApi.request(CUSTOMERS_API, "?page_size=100").then(function (body) {
            customers = body && body.isSuccess ? (body.data.items || []) : [];
            renderCustomerSelect(selectedId);
            return customers;
        });
    }

    function openAddCustomerModal() {
        if (window.InventoryCustomers && typeof InventoryCustomers.openAddModal === "function") {
            InventoryCustomers.openAddModal();
            return;
        }
        InventoryToast.error("Customer form is not available.");
    }

    function formatCustomerDisplay(purchase) {
        var name = purchase.customer_name || "—";
        var mobile = purchase.customer_mobile;
        if (mobile) {
            return InventoryApi.escapeHtml(name) + "(" + InventoryApi.escapeHtml(mobile) + ")";
        }
        return InventoryApi.escapeHtml(name);
    }

    function renderPaymentTypeSelect(selectedId) {
        var select = document.getElementById("purchase-payment-type");
        if (!select) return;

        var html = '<option value="">Select payment type (optional)</option>';
        paymentTypes.forEach(function (item) {
            var selected = String(item.id) === String(selectedId) ? " selected" : "";
            html += '<option value="' + item.id + '"' + selected + ">" +
                InventoryApi.escapeHtml(item.name) + "</option>";
        });
        select.innerHTML = html;
        if (selectedId) {
            select.value = String(selectedId);
        }
    }

    function togglePaymentTypePanel(show) {
        var panel = document.getElementById("purchase-payment-type-new-panel");
        if (!panel) return;
        panel.classList.toggle("inv-hidden", !show);
        if (show) {
            document.getElementById("purchase-payment-type-new-name").focus();
        } else {
            document.getElementById("purchase-payment-type-new-name").value = "";
        }
    }

    function loadPaymentTypes(selectedId) {
        return catalogRequest("payment-types", "?page_size=100").then(function (body) {
            paymentTypes = body && body.isSuccess ? (body.data.items || []) : [];
            renderPaymentTypeSelect(selectedId);
            return paymentTypes;
        });
    }

    function saveNewPaymentType() {
        var name = document.getElementById("purchase-payment-type-new-name").value.trim();
        if (!name) {
            InventoryToast.error("Payment type name is required.");
            return;
        }

        var btn = document.getElementById("purchase-payment-type-save-btn");
        InventoryLoader.button(btn, true, "Saving...");

        catalogRequest("payment-types", "", {
            method: "POST",
            body: { name: name }
        })
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    InventoryToast.success(body.message || "Payment type added.");
                    togglePaymentTypePanel(false);
                    return loadPaymentTypes(body.data.id);
                }
                var err = body.message || "Unable to add payment type.";
                if (body.errors && body.errors.length) err = body.errors.join(" • ");
                InventoryToast.error(err);
            })
            .catch(function () {
                InventoryToast.error("Network error while saving payment type.");
            })
            .finally(function () {
                InventoryLoader.button(btn, false);
            });
    }

    function loadProducts() {
        return InventoryApi.request(PRODUCTS_API, "?page_size=100")
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    products = (body.data.items || []).filter(function (product) {
                        return Number(product.quantity || 0) > 0;
                    });
                } else {
                    products = [];
                }
            });
    }

    function formatQty(value) {
        var num = Number(value || 0);
        return Number.isInteger(num) ? String(num) : num.toFixed(2);
    }

    function getProduct(productId) {
        return products.find(function (p) {
            return String(p.id) === String(productId);
        });
    }

    function getAllocatedByProduct(excludeRow) {
        var totals = {};
        document.querySelectorAll("#purchase-items-container .inv-mgmt-item-row").forEach(function (row) {
            if (row === excludeRow) return;
            var productId = row.querySelector(".inv-item-product").value;
            if (!productId) return;
            var qty = Number(row.querySelector(".inv-item-qty").value || 0);
            totals[productId] = (totals[productId] || 0) + qty;
        });
        return totals;
    }

    function getRemainingQty(productId, excludeRow) {
        var product = getProduct(productId);
        if (!product) return 0;
        var allocated = getAllocatedByProduct(excludeRow);
        var base = Number(product.quantity || 0);
        return Math.max(0, base - (allocated[productId] || 0));
    }

    function hasAvailableProducts(excludeRow) {
        var allocated = getAllocatedByProduct(excludeRow);
        return products.some(function (product) {
            var remaining = Number(product.quantity || 0) - (allocated[product.id] || 0);
            return remaining > 0;
        });
    }

    function productLabel(product, availableQty) {
        var sku = product.sku ? " (" + product.sku + ")" : "";
        var qty = availableQty != null ? availableQty : Number(product.quantity || 0);
        return InventoryApi.escapeHtml(product.name) + sku +
            " — Available: " + formatQty(qty);
    }

    function productOptions(selectedId, excludeRow) {
        if (!products.length) {
            return '<option value="">No products in stock — add a purchase first</option>';
        }

        var allocated = getAllocatedByProduct(excludeRow);
        var options = '<option value="">Select product</option>';

        products.forEach(function (product) {
            var remaining = Number(product.quantity || 0) - (allocated[product.id] || 0);
            var isSelected = String(product.id) === String(selectedId);
            if (remaining <= 0 && !isSelected) {
                return;
            }
            var selected = isSelected ? " selected" : "";
            var displayQty = isSelected ? getRemainingQty(product.id, excludeRow) : remaining;
            options += '<option value="' + product.id + '"' + selected + '>' +
                productLabel(product, displayQty) + "</option>";
        });

        if (options === '<option value="">Select product</option>') {
            return '<option value="">No products available — all stock is allocated</option>';
        }

        return options;
    }

    function refreshAllProductSelects() {
        document.querySelectorAll("#purchase-items-container .inv-mgmt-item-row").forEach(function (row) {
            var select = row.querySelector(".inv-item-product");
            if (!select) return;
            var selectedId = select.value;
            select.innerHTML = productOptions(selectedId, row);
            if (selectedId && getRemainingQty(selectedId, row) <= 0) {
                select.value = "";
                applyProductToRow(row, null);
                return;
            }
            if (selectedId) {
                select.value = String(selectedId);
                updateRowQtyLimits(row, getProduct(select.value));
            }
        });
    }

    function defaultSalePrice(product) {
        if (!product || product.sale_price == null || product.sale_price === "") {
            return "";
        }
        return product.sale_price;
    }

    function updateRowQtyLimits(row, product) {
        var qtyInput = row.querySelector(".inv-item-qty");
        if (!qtyInput) return;

        if (!product) {
            qtyInput.removeAttribute("max");
            row.dataset.maxQty = "";
            updateRowTotal(row);
            return;
        }

        var available = getRemainingQty(product.id, row);
        row.dataset.maxQty = String(available);
        if (available <= 0) {
            qtyInput.value = "";
            qtyInput.removeAttribute("max");
            qtyInput.min = 0;
        } else {
            qtyInput.max = available;
            qtyInput.min = 0.01;
            if (Number(qtyInput.value || 0) > available) {
                qtyInput.value = available;
            }
            if (!qtyInput.value) {
                qtyInput.value = 1;
            }
        }
        updateRowTotal(row);
    }

    function applyProductToRow(row, product, options) {
        options = options || {};
        var priceInput = row.querySelector(".inv-item-price");
        if (!product) {
            updateRowQtyLimits(row, null);
            if (priceInput) priceInput.value = "";
            return;
        }

        updateRowQtyLimits(row, product);

        if (priceInput && options.updatePrice !== false) {
            var shouldSetPrice = options.forcePrice || priceInput.value === "";
            if (shouldSetPrice) {
                priceInput.value = defaultSalePrice(product);
            }
        }
        updateRowTotal(row);
    }

    function updateRowTotal(row) {
        var qty = Number(row.querySelector(".inv-item-qty").value || 0);
        var price = Number(row.querySelector(".inv-item-price").value || 0);
        row.querySelector(".inv-item-total").value = InventoryApi.formatMoney(qty * price);
    }

    function createItemRow(data) {
        data = data || {};
        var row = document.createElement("div");
        row.className = "inv-mgmt-item-row inv-mgmt-item-row--sale";
        row.innerHTML =
            '<div class="inv-mgmt-field"><label>Available Product</label><select class="inv-mgmt-select inv-item-product" required>' + productOptions(data.product_id, row) + "</select></div>" +
            '<div class="inv-mgmt-field"><label>Quantity</label><input class="inv-mgmt-input inv-item-qty" type="number" min="0.01" step="0.01" value="' + (data.quantity || 1) + '" required/></div>' +
            '<div class="inv-mgmt-field"><label>Sale Price</label><input class="inv-mgmt-input inv-item-price" type="number" min="0" step="0.01" placeholder="0.00" value="' + (data.unit_price != null && data.unit_price !== "" ? data.unit_price : "") + '" required/></div>' +
            '<div class="inv-mgmt-field"><label>Total Price</label><input class="inv-mgmt-input inv-item-total" type="text" readonly value="0.00"/></div>' +
            '<div class="inv-mgmt-field"><label>&nbsp;</label><button type="button" class="inv-mgmt-btn inv-mgmt-btn--danger inv-item-remove">Remove</button></div>';

        row.querySelector(".inv-item-qty").addEventListener("input", function () {
            var product = getProduct(row.querySelector(".inv-item-product").value);
            if (product) {
                var max = getRemainingQty(product.id, row);
                var val = Number(row.querySelector(".inv-item-qty").value || 0);
                if (val > max) {
                    row.querySelector(".inv-item-qty").value = max > 0 ? max : "";
                    InventoryToast.warning("Quantity cannot exceed available stock (" + formatQty(max) + ").");
                }
            }
            updateRowTotal(row);
            refreshAllProductSelects();
        });
        row.querySelector(".inv-item-price").addEventListener("input", function () {
            updateRowTotal(row);
        });
        row.querySelector(".inv-item-remove").addEventListener("click", function () {
            row.remove();
            refreshAllProductSelects();
        });

        var select = row.querySelector(".inv-item-product");
        select.addEventListener("change", function () {
            applyProductToRow(row, getProduct(select.value), { forcePrice: true });
            refreshAllProductSelects();
        });

        if (data.product_id) {
            applyProductToRow(row, getProduct(data.product_id), {
                updatePrice: data.unit_price == null || data.unit_price === ""
            });
        } else {
            updateRowTotal(row);
        }
        return row;
    }

    function createReadonlySaleRow(line) {
        var label = InventoryApi.escapeHtml(line.product_name || "—");
        if (line.product_sku) {
            label += " (" + InventoryApi.escapeHtml(line.product_sku) + ")";
        }
        var row = document.createElement("div");
        row.className = "inv-mgmt-item-row inv-mgmt-item-row--sale";
        row.innerHTML =
            '<div class="inv-mgmt-field"><label>Product</label><input class="inv-mgmt-input" type="text" readonly value="' + label + '"/></div>' +
            '<div class="inv-mgmt-field"><label>Quantity</label><input class="inv-mgmt-input" type="text" readonly value="' + InventoryApi.escapeHtml(formatQty(line.quantity)) + '"/></div>' +
            '<div class="inv-mgmt-field"><label>Sale Price</label><input class="inv-mgmt-input" type="text" readonly value="' + InventoryApi.formatMoney(line.unit_price) + '"/></div>' +
            '<div class="inv-mgmt-field"><label>Total Price</label><input class="inv-mgmt-input" type="text" readonly value="' + InventoryApi.formatMoney(line.line_total) + '"/></div>' +
            '<div class="inv-mgmt-field"><label>&nbsp;</label><button type="button" class="inv-mgmt-btn inv-mgmt-btn--danger inv-item-remove inv-hidden" disabled>Remove</button></div>';
        return row;
    }

    function setFormMode(mode) {
        var titleEl = document.getElementById("purchase-form-title");
        var saveBtn = document.getElementById("purchase-save-btn");
        var addItemBtn = document.getElementById("purchase-add-item-btn");
        var itemsPanel = document.querySelector("#purchases-form-panel .inv-mgmt-items-panel");
        var itemsTitle = itemsPanel ? itemsPanel.querySelector("h4") : null;
        var itemsHelp = itemsPanel ? itemsPanel.querySelector(".inv-mgmt-items-help") : null;

        if (mode === "edit") {
            if (titleEl) titleEl.textContent = "Edit Sale";
            if (saveBtn) saveBtn.textContent = "Update Sale";
            if (addItemBtn) addItemBtn.classList.add("inv-hidden");
            if (itemsPanel) itemsPanel.classList.add("inv-sale-items--readonly");
            if (itemsTitle) itemsTitle.textContent = "Products Sold";
            if (itemsHelp) itemsHelp.textContent = "Sold items cannot be changed after the sale is recorded.";
        } else {
            if (titleEl) titleEl.textContent = "Add Sale";
            if (saveBtn) saveBtn.textContent = "Create Sale";
            if (addItemBtn) addItemBtn.classList.remove("inv-hidden");
            if (itemsPanel) itemsPanel.classList.remove("inv-sale-items--readonly");
            if (itemsTitle) itemsTitle.textContent = "Products to Sell";
            if (itemsHelp) itemsHelp.textContent = "Stock is deducted using FIFO. Profit = sale price − batch purchase cost.";
        }
    }

    function populateForm(purchase) {
        loadCustomers(purchase.customer || "");
        document.getElementById("purchase-date").value = purchase.purchase_date || "";
        document.getElementById("purchase-billing-address").value = purchase.billing_address || "";
        document.getElementById("purchase-shipping-address").value = purchase.shipping_address || "";
        loadPaymentTypes(purchase.payment_type || "");

        var container = document.getElementById("purchase-items-container");
        container.innerHTML = "";
        (purchase.items || []).forEach(function (line) {
            container.appendChild(createReadonlySaleRow(line));
        });
    }

    function formatProfit(value) {
        var num = Number(value || 0);
        var formatted = InventoryApi.formatMoney(num);
        if (num > 0) return "+" + formatted;
        return formatted;
    }

    function displayValue(value) {
        if (value === null || value === undefined || String(value).trim() === "") return "—";
        return InventoryApi.escapeHtml(String(value));
    }

    function actionButtons(purchase) {
        return (
            '<div class="inv-row-actions">' +
            '<button type="button" class="inv-row-action-btn inv-row-action-btn--view inv-purchase-view" data-id="' + purchase.id + '" title="View" aria-label="View sale">' +
            '<span class="material-symbols-outlined">visibility</span></button>' +
            '<button type="button" class="inv-row-action-btn inv-row-action-btn--edit inv-purchase-edit" data-id="' + purchase.id + '" title="Edit" aria-label="Edit sale">' +
            '<span class="material-symbols-outlined">edit</span></button>' +
            "</div>"
        );
    }

    function formatProductsSoldCell(items, purchaseId) {
        if (!items || !items.length) return "—";

        var lines = items.map(function (item) {
            return InventoryApi.escapeHtml(item.product_name) + " × " + formatQty(item.quantity);
        });

        if (lines.length <= 2) {
            return lines.join(" · ");
        }

        var short = lines.slice(0, 2).join(" · ");
        var full = lines.join(" · ");
        var moreCount = lines.length - 2;

        return (
            '<span class="inv-products-sold" data-purchase-id="' + purchaseId + '">' +
            '<span class="inv-products-sold-collapsed">' + short + " · " +
            '<button type="button" class="inv-products-sold-toggle">+' + moreCount + " more</button></span>" +
            '<span class="inv-products-sold-expanded inv-hidden">' + full + " · " +
            '<button type="button" class="inv-products-sold-toggle inv-products-sold-toggle--less">show less</button></span>' +
            "</span>"
        );
    }

    function renderPurchaseRows(items) {
        var tbody = document.getElementById("purchases-table-body");
        if (!tbody) return;

        var cols = getColumnCtrl();
        var colspan = cols.getColspan();

        if (!items || !items.length) {
            tbody.innerHTML = '<tr><td colspan="' + colspan + '" class="inv-mgmt-empty">No sales yet. Record a purchase first, then create a sale.</td></tr>';
            getBulkSelect().afterRender();
            return;
        }

        cachedItems = items;
        var bulk = getBulkSelect();

        tbody.innerHTML = items.map(function (purchase) {
            return (
                "<tr>" +
                bulk.rowCellHtml(purchase.id, purchase) +
                cols.renderRowCells(purchase) +
                '<td class="inv-col-action">' + actionButtons(purchase) + "</td>" +
                "</tr>"
            );
        }).join("");

        bulk.afterRender();
    }

    function fetchPurchase(id) {
        return request("/" + id + "/").then(function (body) {
            if (body && body.isSuccess && body.data) {
                return body.data;
            }
            InventoryToast.error(body.message || "Failed to load sale details.");
            return null;
        });
    }

    function renderViewDetails(purchase) {
        var container = document.getElementById("purchase-view-body");
        var itemsWrap = document.getElementById("purchase-view-items-wrap");
        if (!container || !itemsWrap) return;

        var profit = Number(purchase.total_profit || 0);
        var profitClass = profit >= 0 ? "inv-profit-positive" : "inv-profit-negative";
        var rows = [
            { label: "Sale Date", value: displayValue(purchase.purchase_date) },
            { label: "Customer", value: formatCustomerDisplay(purchase) },
            { label: "Payment Type", value: displayValue(purchase.payment_type_name) },
            { label: "Billing Address", value: displayValue(purchase.billing_address) },
            { label: "Shipping Address", value: displayValue(purchase.shipping_address) },
            { label: "Sale Amount", value: InventoryApi.formatMoney(purchase.total_amount) },
            { label: "Total Cost", value: InventoryApi.formatMoney(purchase.total_cost) },
            {
                label: "Profit",
                value: "<strong class=\"" + profitClass + "\">" + formatProfit(profit) + "</strong>",
                html: true
            }
        ];

        if (purchase.reference_no) {
            rows.splice(2, 0, { label: "Reference No.", value: displayValue(purchase.reference_no) });
        }
        if (purchase.notes) {
            rows.push({ label: "Notes", value: displayValue(purchase.notes), full: true });
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

        var lines = purchase.items || [];
        if (!lines.length) {
            itemsWrap.innerHTML = "";
            return;
        }

        itemsWrap.innerHTML =
            '<h4 class="inv-stockin-view-items-title">Products Sold</h4>' +
            '<div class="inv-mgmt-table-wrap">' +
            '<table class="inv-mgmt-table">' +
            "<thead><tr>" +
            "<th>Product</th><th>SKU</th><th>Unit</th><th>Qty</th><th>Sale Price</th><th>Total Price</th><th>Total Cost</th><th>Profit</th>" +
            "</tr></thead><tbody>" +
            lines.map(function (line) {
                var lineProfit = Number(line.profit_amount || 0);
                var lineProfitClass = lineProfit >= 0 ? "inv-profit-positive" : "inv-profit-negative";
                return (
                    "<tr>" +
                    "<td>" + displayValue(line.product_name) + "</td>" +
                    "<td>" + displayValue(line.product_sku) + "</td>" +
                    "<td>" + displayValue(line.product_unit || "pcs") + "</td>" +
                    "<td class=\"inv-mgmt-cell--num\">" + displayValue(formatQty(line.quantity)) + "</td>" +
                    "<td class=\"inv-mgmt-cell--num\">" + InventoryApi.formatMoney(line.unit_price) + "</td>" +
                    "<td class=\"inv-mgmt-cell--num\">" + InventoryApi.formatMoney(line.line_total) + "</td>" +
                    "<td class=\"inv-mgmt-cell--num\">" + InventoryApi.formatMoney(line.cost_amount) + "</td>" +
                    "<td class=\"inv-mgmt-cell--num " + lineProfitClass + "\"><strong>" + formatProfit(lineProfit) + "</strong></td>" +
                    "</tr>"
                );
            }).join("") +
            "</tbody></table></div>";
    }

    function openEditPurchase(id) {
        InventoryLoader.show();
        fetchPurchase(id)
            .then(function (purchase) {
                if (!purchase) return;
                editingPurchaseId = purchase.id;
                setFormMode("edit");
                populateForm(purchase);
                InventoryPagePanel.showPanel(PURCHASES_LIST_PANEL, PURCHASES_FORM_PANEL);
                document.getElementById("purchase-customer").focus();
            })
            .catch(function () {
                InventoryToast.error("Network error while loading sale.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function openViewPurchase(id) {
        InventoryLoader.show();
        fetchPurchase(id)
            .then(function (purchase) {
                if (!purchase) return;
                var titleEl = document.getElementById("purchase-view-title");
                if (titleEl) {
                    titleEl.textContent = purchase.customer_name || "Sale Details";
                }
                renderViewDetails(purchase);
                InventoryPagePanel.showPanel(PURCHASES_LIST_PANEL, PURCHASES_VIEW_PANEL);
            })
            .catch(function () {
                InventoryToast.error("Network error while loading sale.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function buildQuery(page) {
        var params = new URLSearchParams();
        params.set("page", String(page || 1));
        params.set("page_size", String(InventoryPagination.getPageSize("purchases-pagination")));

        var searchEl = document.getElementById("purchases-search");
        var dateFromEl = document.getElementById("purchases-date-from");
        var dateToEl = document.getElementById("purchases-date-to");
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
        var searchEl = document.getElementById("purchases-search");
        var dateFromEl = document.getElementById("purchases-date-from");
        var dateToEl = document.getElementById("purchases-date-to");
        if (searchEl) searchEl.value = "";
        if (dateFromEl) dateFromEl.value = "";
        if (dateToEl) dateToEl.value = "";
        loadPurchases(1);
    }

    function loadPurchases(page) {
        currentPage = page || 1;
        InventoryLoader.show();

        return request(buildQuery(currentPage))
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    renderPurchaseRows(body.data.items || []);
                    InventoryPagination.render("purchases-pagination", body.data.pagination, function (p) {
                        loadPurchases(p);
                    }, {
                        onPageSizeChange: function () {
                            loadPurchases(1);
                        }
                    });
                } else {
                    renderPurchaseRows([]);
                    InventoryPagination.render("purchases-pagination", null, function () {});
                    InventoryToast.error(body.message || "Failed to load sales.");
                }
            })
            .catch(function () {
                renderPurchaseRows([]);
                InventoryToast.error("Network error while loading sales.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function collectItems() {
        var rows = document.querySelectorAll("#purchase-items-container .inv-mgmt-item-row");
        var items = [];
        var totalsByProduct = {};

        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            var productId = row.querySelector(".inv-item-product").value;
            var quantity = Number(row.querySelector(".inv-item-qty").value || 0);
            var unitPrice = Number(row.querySelector(".inv-item-price").value || 0);
            if (!productId) continue;

            var product = getProduct(productId);
            if (!product) {
                InventoryToast.error("Selected product is no longer available.");
                return null;
            }

            if (row.querySelector(".inv-item-price").value === "") {
                InventoryToast.error("Enter a sale price for " + product.name + ".");
                return null;
            }
            if (unitPrice < 0) {
                InventoryToast.error("Sale price cannot be negative.");
                return null;
            }

            var available = getRemainingQty(productId, row);
            totalsByProduct[productId] = (totalsByProduct[productId] || 0) + quantity;
            if (totalsByProduct[productId] > Number(product.quantity || 0)) {
                InventoryToast.error(
                    product.name + ": total quantity (" + formatQty(totalsByProduct[productId]) +
                    ") exceeds available stock (" + formatQty(product.quantity) + ")."
                );
                return null;
            }
            if (quantity > available) {
                InventoryToast.error(
                    product.name + ": quantity (" + formatQty(quantity) +
                    ") exceeds remaining stock (" + formatQty(available) + ")."
                );
                return null;
            }
            if (quantity <= 0) {
                InventoryToast.error("Quantity must be greater than zero.");
                return null;
            }

            items.push({
                product_id: Number(productId),
                quantity: quantity,
                unit_price: unitPrice
            });
        }

        return items;
    }

    function addItemRow(data, silent) {
        if (!hasAvailableProducts(null)) {
            if (!silent) {
                InventoryToast.warning("No products with remaining stock available.");
            }
            return false;
        }
        var container = document.getElementById("purchase-items-container");
        container.appendChild(createItemRow(data));
        return true;
    }

    function resetForm(isSilent) {
        editingPurchaseId = null;
        setFormMode("add");
        loadCustomers("");
        document.getElementById("purchase-date").value = new Date().toISOString().slice(0, 10);
        document.getElementById("purchase-billing-address").value = "";
        document.getElementById("purchase-shipping-address").value = "";
        document.getElementById("purchase-payment-type").value = "";
        togglePaymentTypePanel(false);
        document.getElementById("purchase-items-container").innerHTML = "";
        addItemRow(null, isSilent !== false);
    }

    function getSaleHeaderPayload() {
        var paymentTypeEl = document.getElementById("purchase-payment-type");
        var paymentTypeId = paymentTypeEl ? paymentTypeEl.value : "";
        var customerId = document.getElementById("purchase-customer").value;
        return {
            customer_id: customerId ? Number(customerId) : null,
            purchase_date: document.getElementById("purchase-date").value || undefined,
            billing_address: document.getElementById("purchase-billing-address").value.trim(),
            shipping_address: document.getElementById("purchase-shipping-address").value.trim(),
            payment_type_id: paymentTypeId ? Number(paymentTypeId) : null
        };
    }

    function savePurchase() {
        var customerId = document.getElementById("purchase-customer").value;
        if (!customerId) {
            InventoryToast.error("Please select a customer.");
            document.getElementById("purchase-customer").focus();
            return;
        }

        if (editingPurchaseId) {
            var btn = document.getElementById("purchase-save-btn");
            InventoryLoader.button(btn, true, "Updating...");
            request("/" + editingPurchaseId + "/", {
                method: "PATCH",
                body: getSaleHeaderPayload()
            })
                .then(function (body) {
                    if (body && body.isSuccess) {
                        InventoryToast.success(body.message || "Sale updated successfully.");
                        resetForm(true);
                        InventoryPagePanel.showList(PURCHASES_LIST_PANEL);
                        loadPurchases(currentPage);
                    } else {
                        var err = body.message || "Unable to update sale.";
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

        var items = collectItems();
        if (!items || !items.length) {
            if (items !== null) {
                InventoryToast.error("Add at least one product the customer is purchasing.");
            }
            return;
        }

        var rowCount = document.querySelectorAll("#purchase-items-container .inv-mgmt-item-row").length;
        if (items.length !== rowCount) {
            InventoryToast.error("Select an available product for each row.");
            return;
        }

        var btn = document.getElementById("purchase-save-btn");
        InventoryLoader.button(btn, true, "Saving...");

        request("", {
            method: "POST",
            body: Object.assign(getSaleHeaderPayload(), { items: items })
        })
            .then(function (body) {
                if (body && body.isSuccess) {
                    InventoryToast.success(body.message || "Sale added successfully. Stock has been updated.");
                    resetForm(true);
                    InventoryPagePanel.showList(PURCHASES_LIST_PANEL);
                    loadPurchases(1);
                } else {
                    var err = body.message || "Unable to create sale.";
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

    function init() {
        if (init._wired) return;
        init._wired = true;

        if (window.InventoryPagePanel) {
            InventoryPagePanel.init();
        }

        getColumnCtrl();

        function boot() {
            if (!InventoryBusiness.getActiveId()) return;
            loadProducts().then(function () {
                loadPaymentTypes();
                loadCustomers();
                loadPurchases(1);
            });
        }

        InventoryBusiness.whenReady(function () {
            boot();
            if (window.InventorySidebar && InventorySidebar.consumeAddAction()) {
                var openSaleBtn = document.getElementById("purchase-open-modal-btn");
                if (openSaleBtn) openSaleBtn.click();
            }
        });
        window.addEventListener("inventory:business-changed", boot);

        document.getElementById("purchase-open-modal-btn").addEventListener("click", function () {
            if (!InventoryBusiness.getActiveId()) {
                InventoryToast.error("Select or create a business first.");
                return;
            }
            loadProducts().then(function () {
                return Promise.all([loadPaymentTypes(), loadCustomers()]);
            }).then(function () {
                resetForm(true);
                if (!hasAvailableProducts(null)) {
                    InventoryToast.warning("No products with remaining stock available.");
                }
                if (!customers.length) {
                    InventoryToast.warning("No customers found. Add a customer first.");
                }
                InventoryPagePanel.showPanel(PURCHASES_LIST_PANEL, PURCHASES_FORM_PANEL);
                var customerSelect = document.getElementById("purchase-customer");
                if (customerSelect) customerSelect.focus();
            });
        });

        document.getElementById("purchase-add-item-btn").addEventListener("click", function () {
            if (!hasAvailableProducts(null)) {
                InventoryToast.warning("No products with remaining stock available.");
                return;
            }
            addItemRow(null, true);
        });
        document.getElementById("purchase-save-btn").addEventListener("click", savePurchase);

        var searchEl = document.getElementById("purchases-search");
        var dateFromEl = document.getElementById("purchases-date-from");
        var dateToEl = document.getElementById("purchases-date-to");
        var clearBtn = document.getElementById("purchases-clear-filters");

        if (searchEl) {
            searchEl.addEventListener("input", function () {
                window.clearTimeout(searchTimer);
                searchTimer = window.setTimeout(function () {
                    loadPurchases(1);
                }, 300);
            });
        }
        if (dateFromEl) dateFromEl.addEventListener("change", function () { loadPurchases(1); });
        if (dateToEl) dateToEl.addEventListener("change", function () { loadPurchases(1); });
        if (clearBtn) clearBtn.addEventListener("click", clearFilters);

        var paymentTypeAddBtn = document.getElementById("purchase-payment-type-add-btn");
        var paymentTypeSaveBtn = document.getElementById("purchase-payment-type-save-btn");
        var paymentTypeCancelBtn = document.getElementById("purchase-payment-type-cancel-btn");
        var customerAddBtn = document.getElementById("purchase-customer-add-btn");

        if (customerAddBtn) {
            customerAddBtn.addEventListener("click", openAddCustomerModal);
        }

        window.addEventListener("inventory:customer-created", function (e) {
            var customer = e.detail && e.detail.customer;
            loadCustomers(customer && customer.id ? customer.id : "");
        });

        if (paymentTypeAddBtn) {
            paymentTypeAddBtn.addEventListener("click", function () {
                var panel = document.getElementById("purchase-payment-type-new-panel");
                togglePaymentTypePanel(panel.classList.contains("inv-hidden"));
            });
        }
        if (paymentTypeSaveBtn) paymentTypeSaveBtn.addEventListener("click", saveNewPaymentType);
        if (paymentTypeCancelBtn) {
            paymentTypeCancelBtn.addEventListener("click", function () {
                togglePaymentTypePanel(false);
            });
        }

        var tbody = document.getElementById("purchases-table-body");
        if (tbody) {
            tbody.addEventListener("click", function (e) {
                var toggleBtn = e.target.closest(".inv-products-sold-toggle");
                if (toggleBtn) {
                    e.preventDefault();
                    var wrap = toggleBtn.closest(".inv-products-sold");
                    if (!wrap) return;
                    var collapsed = wrap.querySelector(".inv-products-sold-collapsed");
                    var expanded = wrap.querySelector(".inv-products-sold-expanded");
                    if (collapsed) collapsed.classList.toggle("inv-hidden");
                    if (expanded) expanded.classList.toggle("inv-hidden");
                    return;
                }

                var viewBtn = e.target.closest(".inv-purchase-view");
                if (viewBtn) {
                    openViewPurchase(viewBtn.getAttribute("data-id"));
                    return;
                }

                var editBtn = e.target.closest(".inv-purchase-edit");
                if (editBtn) {
                    openEditPurchase(editBtn.getAttribute("data-id"));
                }
            });
        }
    }

    return { init: init };
})();
