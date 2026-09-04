var InventoryPurchases = (function () {
    "use strict";

    var API = "/api/purchases";
    var PRODUCTS_API = "/api/products";
    var CATALOG_API = "/api/catalog";
    var CUSTOMERS_API = "/api/customers";
    var TAXES_API = "/api/settings/taxes";
    var INVOICE_SETTINGS_API = "/api/settings/invoice-settings";
    var PAGE_SIZE = (window.InventoryConstants && InventoryConstants.PAGE_SIZE) || 10;
    var currentPage = 1;
    var currentOrdering = "-purchase_date";
    var searchTimer = null;
    var products = [];
    var taxes = [];
    var paymentTypes = [];
    var customers = [];
    var invoiceSettings = [];
    var editingPurchaseId = null;
    var editingSaleStockByProduct = {};
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
                includeBulkCheck: false,
                bulkHeaderHtml: '<th class="inv-col-check d-none"><input type="checkbox" class="inv-bulk-select-all" aria-label="Select all"/></th>',
                sortDefault: "-purchase_date",
                onSortChange: function (ordering) {
                    currentOrdering = ordering;
                    loadPurchases(1);
                },
                columns: [
                    { id: "date", label: "Date", locked: true, cell: function (p) { return "<td>" + InventoryApi.escapeHtml(p.purchase_date) + "</td>"; } },
                    { id: "invoice_no", label: "Invoice No.", sortKey: "reference_no", cell: function (p) { return "<td>" + displayValue(p.reference_no) + "</td>"; } },
                    { id: "customer", label: "Customer", locked: true, sortKey: "customer_name", cell: function (p) { return "<td>" + formatCustomerDisplay(p) + "</td>"; } },
                    { id: "products", label: "Products Sold", cell: function (p) { return '<td class="inv-col-name">' + formatProductsSoldCell(p.items || [], p.id) + "</td>"; } },
                    { id: "sale_amount", label: "Sale Amount", sortKey: "total_amount", headerClass: "inv-mgmt-cell--num", cell: function (p) { return '<td class="inv-mgmt-cell--num">' + InventoryApi.formatMoney(p.total_amount) + "</td>"; } },
                    { id: "total_cost", label: "Total Cost", sortKey: "total_cost", headerClass: "inv-mgmt-cell--num", cell: function (p) { return '<td class="inv-mgmt-cell--num">' + InventoryApi.formatMoney(p.total_cost) + "</td>"; } }
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
                var printTitle = sales.length === 1
                    ? "Sale Invoice" + (sales[0].reference_no ? " - " + sales[0].reference_no : "")
                    : "Sales Invoices";
                InventoryDocumentExport.printHtml(printTitle, html);
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

    function customerDisplayLabel(name, companyName, mobile) {
        name = name ? String(name).trim() : "—";
        companyName = companyName ? String(companyName).trim() : "";
        mobile = mobile ? String(mobile).trim() : "";
        if (companyName) {
            return InventoryApi.escapeHtml(companyName) + " (" + InventoryApi.escapeHtml(name) + ")";
        }
        if (mobile) {
            return InventoryApi.escapeHtml(name) + " (" + InventoryApi.escapeHtml(mobile) + ")";
        }
        return InventoryApi.escapeHtml(name);
    }

    function customerHasCompany(customer) {
        return !!(customer && customer.company_name && String(customer.company_name).trim());
    }

    function findCustomerById(id) {
        if (!id) return null;
        for (var i = 0; i < customers.length; i++) {
            if (String(customers[i].id) === String(id)) return customers[i];
        }
        return null;
    }

    function setAddressFieldLabels(isCompany) {
        var billingLabel = document.querySelector('label[for="purchase-billing-address"]');
        var shippingLabel = document.querySelector('label[for="purchase-shipping-address"]');
        if (billingLabel) {
            billingLabel.innerHTML = isCompany
                ? 'Company Address <span class="inv-field-optional">(optional)</span>'
                : 'Billing Address <span class="inv-field-optional">(optional)</span>';
        }
        if (shippingLabel) {
            shippingLabel.innerHTML = 'Shipping Address <span class="inv-field-optional">(optional)</span>';
        }
    }

    function setAddressPlaceholders(isCompany) {
        var billingEl = document.getElementById("purchase-billing-address");
        var shippingEl = document.getElementById("purchase-shipping-address");
        if (billingEl) {
            billingEl.placeholder = isCompany ? "Company address" : "Billing address";
        }
        if (shippingEl) {
            shippingEl.placeholder = "Shipping address";
        }
    }

    function applyCustomerAddressesFromSelection(customerId, preserveExisting) {
        var billingEl = document.getElementById("purchase-billing-address");
        var shippingEl = document.getElementById("purchase-shipping-address");
        if (!billingEl || !shippingEl) return;

        if (!customerId) {
            setAddressFieldLabels(false);
            setAddressPlaceholders(false);
            if (!preserveExisting) {
                billingEl.value = "";
                shippingEl.value = "";
            }
            return;
        }

        var customer = findCustomerById(customerId);
        if (!customer) return;

        var isCompany = customerHasCompany(customer);
        setAddressFieldLabels(isCompany);
        setAddressPlaceholders(isCompany);

        if (preserveExisting) return;

        if (isCompany) {
            billingEl.value = (customer.business_address || "").trim();
            shippingEl.value = (customer.shipping_address || "").trim();
        } else {
            var address = (customer.address || "").trim();
            billingEl.value = address;
            shippingEl.value = address;
        }
    }

    function onCustomerSelectionChange() {
        var customerSelect = document.getElementById("purchase-customer");
        if (!customerSelect) return;
        applyCustomerAddressesFromSelection(customerSelect.value, false);
    }

    function customerLabel(customer) {
        return customerDisplayLabel(customer.name, customer.company_name, customer.mobile);
    }

    function formatInvoiceNumber(prefix, counter, suffix) {
        var parts = [];
        var prefixText = String(prefix || "").trim();
        var suffixText = String(suffix || "").trim();
        if (prefixText) parts.push(prefixText);
        parts.push(String(counter != null ? counter : 0));
        if (suffixText) parts.push(suffixText);
        return parts.join("/");
    }

    function invoiceSettingLabel(item) {
        var number = formatInvoiceNumber(item.prefix, item.current_counter, item.suffix);
        return number || "—";
    }

    function renderInvoiceSettingSelect(selectedId) {
        var select = document.getElementById("purchase-invoice-setting");
        if (!select) return;

        var html;
        if (!invoiceSettings.length) {
            html = '<option value="">No invoice settings — add one in Settings first</option>';
        } else {
            html = '<option value="">Select invoice</option>';
            invoiceSettings.forEach(function (item) {
                var selected = String(item.id) === String(selectedId) ? " selected" : "";
                html += '<option value="' + item.id + '"' + selected + ">" +
                    InventoryApi.escapeHtml(invoiceSettingLabel(item)) + "</option>";
            });
        }
        select.innerHTML = html;
        if (selectedId) {
            select.value = String(selectedId);
        }
        if (window.InventorySearchableSelect) {
            InventorySearchableSelect.refresh(select);
        }
    }

    function isInvoiceSettingSelectable(item) {
        if (!item.end_counter) return true;
        var today = new Date().toISOString().slice(0, 10);
        return item.end_counter >= today;
    }

    function loadInvoiceSettings(selectedId) {
        return InventoryApi.request(INVOICE_SETTINGS_API, "?page_size=100&ordering=-year").then(function (body) {
            var items = body && body.isSuccess ? (body.data.items || []) : [];
            var activeItems = items.filter(isInvoiceSettingSelectable);
            invoiceSettings = activeItems.length ? activeItems : items;
            renderInvoiceSettingSelect(selectedId);
            return invoiceSettings;
        });
    }

    function toggleInvoiceSettingField(show) {
        var field = document.getElementById("purchase-invoice-setting-field");
        if (field) {
            field.classList.toggle("inv-hidden", !show);
        }
    }

    function renderCustomerSelect(selectedId) {
        var select = document.getElementById("purchase-customer");
        if (!select) return;

        var applyOptions = function (el) {
            var html;
            if (!customers.length) {
                html = '<option value="">No customers — add a customer first</option>';
            } else {
                html = '<option value="">Select customer or company</option>';
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
        return customerDisplayLabel(
            purchase.customer_name,
            purchase.company_name,
            purchase.customer_mobile
        );
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
        if (window.InventorySearchableSelect) {
            InventorySearchableSelect.refresh(select);
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

    function loadProducts(opts) {
        opts = opts || {};
        var includeProductIds = (opts.includeProductIds || []).map(String);
        return InventoryApi.request(PRODUCTS_API, "?page_size=100")
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    products = (body.data.items || []).filter(function (product) {
                        if (includeProductIds.indexOf(String(product.id)) !== -1) return true;
                        return Number(product.quantity || 0) > 0;
                    });
                } else {
                    products = [];
                }
            });
    }

    function setEditingSaleStockFromPurchase(purchase) {
        editingSaleStockByProduct = {};
        (purchase.items || []).forEach(function (line) {
            var productId = String(getLineProductId(line));
            if (!productId || productId === "undefined" || productId === "null") return;
            editingSaleStockByProduct[productId] =
                (editingSaleStockByProduct[productId] || 0) + Number(line.quantity || 0);
        });
    }

    function getEditingStockBonus(productId) {
        if (!editingPurchaseId) return 0;
        return Number(editingSaleStockByProduct[String(productId)] || 0);
    }

    function getIncludedEditProductIds() {
        return Object.keys(editingSaleStockByProduct || {});
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

    function computeWithGst(actualPrice, taxRate) {
        var actual = Number(actualPrice || 0);
        var rate = Number(taxRate || 0);
        if (isNaN(actual)) actual = 0;
        if (isNaN(rate)) rate = 0;
        return roundMoney(actual * (1 + rate / 100));
    }

    function computeGstAmount(actualPrice, taxRate) {
        var actual = Number(actualPrice || 0);
        var rate = Number(taxRate || 0);
        if (isNaN(actual)) actual = 0;
        if (isNaN(rate)) rate = 0;
        return roundMoney(actual * rate / 100);
    }

    function getCombinedTaxRate(taxIds) {
        return InventoryTaxSelect.getCombinedRate(taxes, taxIds);
    }

    function normalizeIds(ids) {
        return InventoryMultiSelect ? InventoryMultiSelect.parseIds(ids) : [];
    }

    function rowTaxMultiSelectHtml() {
        return InventoryTaxSelect.html("inv-item-sale-gst", "No Tax");
    }

    function initRowTaxMultiSelect(row, selectedIds) {
        var root = row.querySelector(".inv-item-sale-gst");
        if (!root || !window.InventoryTaxSelect) return;

        InventoryTaxSelect.init(root, {
            taxes: taxes,
            selectedIds: normalizeIds(selectedIds),
            placeholder: "No Tax",
            onChange: function () {
                updateRowPricing(row);
            }
        });
    }

    function getRowTaxRate(row) {
        var root = row.querySelector(".inv-item-sale-gst");
        if (!root || !window.InventoryTaxSelect) return 0;
        return getCombinedTaxRate(InventoryTaxSelect.getSelected(root));
    }

    function setRowTaxSelection(row, selectedIds, silent) {
        var root = row.querySelector(".inv-item-sale-gst");
        if (!root || !window.InventoryTaxSelect) return;
        InventoryTaxSelect.setSelected(root, normalizeIds(selectedIds), silent !== false);
    }

    function refreshAllRowTaxSelects() {
        InventoryTaxSelect.refreshAll("#purchase-items-container .inv-item-sale-gst", taxes);
    }

    function loadTaxes() {
        return InventoryApi.request(TAXES_API, "?page_size=100&ordering=key").then(function (body) {
            taxes = body && body.isSuccess ? (body.data.items || []) : [];
            refreshAllRowTaxSelects();
        });
    }

    function getProductBuyDetails(product) {
        if (!product) {
            return { actual: 0, gstAmount: 0, buyPrice: 0 };
        }
        var rate = product.tax ? Number(product.tax_value || 0) : 0;
        var actual = Number(product.actual_price || 0);
        if (!actual && product.purchase_price) {
            actual = rate > 0
                ? roundMoney(Number(product.purchase_price) / (1 + rate / 100))
                : Number(product.purchase_price);
        }
        var gstAmount = computeGstAmount(actual, rate);
        var buyPrice = Number(product.purchase_price || 0) || computeWithGst(actual, rate);
        return {
            actual: actual,
            gstAmount: gstAmount,
            buyPrice: buyPrice
        };
    }

    function getRowDiscountValue(row, inputSelector) {
        var el = row.querySelector(inputSelector || ".inv-item-discount-value");
        var val = Number(el ? el.value : 0);
        if (isNaN(val) || val < 0) return 0;
        return val;
    }

    function getRowDiscountType(row, toggleSelector) {
        var toggle = row.querySelector(toggleSelector || ".inv-item-discount-type-toggle");
        if (!toggle) return "percent";
        return toggle.getAttribute("data-discount-type") === "amount" ? "amount" : "percent";
    }

    function setRowDiscountType(row, type, toggleSelector, buttonSelector) {
        var toggle = row.querySelector(toggleSelector || ".inv-item-discount-type-toggle");
        if (!toggle) return;
        var normalized = type === "amount" ? "amount" : "percent";
        toggle.setAttribute("data-discount-type", normalized);
        toggle.querySelectorAll(buttonSelector || ".inv-item-discount-type").forEach(function (btn) {
            var isActive = btn.getAttribute("data-type") === normalized;
            btn.classList.toggle("is-active", isActive);
            btn.setAttribute("aria-pressed", isActive ? "true" : "false");
        });
    }

    function wireRowDiscountTypeToggle(row, options) {
        options = options || {};
        var toggleSelector = options.toggleSelector || ".inv-item-discount-type-toggle";
        var buttonSelector = options.buttonSelector || ".inv-item-discount-type";
        var inputSelector = options.inputSelector || ".inv-item-discount-value";
        var toggle = row.querySelector(toggleSelector);
        if (!toggle || toggle.dataset.wired === "1") return;
        toggle.dataset.wired = "1";
        toggle.querySelectorAll(buttonSelector).forEach(function (btn) {
            btn.addEventListener("click", function () {
                setRowDiscountType(row, btn.getAttribute("data-type") || "percent", toggleSelector, buttonSelector);
                updateRowPricing(row);
            });
        });
        var inputEl = row.querySelector(inputSelector);
        if (inputEl && !inputEl.dataset.discountWired) {
            inputEl.dataset.discountWired = "1";
            inputEl.addEventListener("input", function () {
                if (getRowDiscountType(row, toggleSelector) === "percent") {
                    var discountVal = getRowDiscountValue(row, inputSelector);
                    if (discountVal > 100) inputEl.value = "100";
                }
                updateRowPricing(row);
            });
            inputEl.addEventListener("change", function () {
                updateRowPricing(row);
            });
        }
    }

    function applyDiscountToPrice(basePrice, discountValue, discountType) {
        var base = Number(basePrice || 0);
        if (isNaN(base) || base < 0) base = 0;
        var discount = Number(discountValue || 0);
        if (isNaN(discount) || discount <= 0) return roundMoney(base);

        if (discountType === "percent") {
            var pct = Math.min(discount, 100);
            return roundMoney(Math.max(0, base * (1 - pct / 100)));
        }
        return roundMoney(Math.max(0, base - discount));
    }

    function getRowSellPrice(row) {
        var saleActualEl = row.querySelector(".inv-item-sale-actual");
        if (!saleActualEl) return 0;
        var base = Number(saleActualEl.value || 0);
        if (isNaN(base) || base < 0) base = 0;
        return base;
    }

    function getRowNewSalePrice(row) {
        return applyDiscountToPrice(
            getRowSellPrice(row),
            getRowDiscountValue(row, ".inv-item-discount-value"),
            getRowDiscountType(row, ".inv-item-discount-type-toggle")
        );
    }

    function getRowAfterDistributorPrice(row) {
        return applyDiscountToPrice(
            getRowNewSalePrice(row),
            getRowDiscountValue(row, ".inv-item-distributor-discount-value"),
            getRowDiscountType(row, ".inv-item-distributor-discount-type-toggle")
        );
    }

    function getRowFinalSalePrice(row) {
        return computeWithGst(getRowAfterDistributorPrice(row), getRowTaxRate(row));
    }

    function getRowDiscountAmount(row, quantity) {
        var qty = Number(quantity || 0);
        if (isNaN(qty) || qty <= 0) return 0;
        var sellPrice = getRowSellPrice(row);
        var afterDiscounts = getRowAfterDistributorPrice(row);
        return roundMoney(Math.max(0, (sellPrice - afterDiscounts) * qty));
    }

    function getRowTaxAmount(row, quantity) {
        var qty = Number(quantity || 0);
        if (isNaN(qty) || qty <= 0) return 0;
        var afterDiscounts = getRowAfterDistributorPrice(row);
        var rate = getRowTaxRate(row);
        return roundMoney(afterDiscounts * (rate / 100) * qty);
    }

    function clearRowDiscount(row) {
        var valueEl = row.querySelector(".inv-item-discount-value");
        if (valueEl) valueEl.value = "";
        setRowDiscountType(row, "percent");
        var distributorValueEl = row.querySelector(".inv-item-distributor-discount-value");
        if (distributorValueEl) distributorValueEl.value = "";
        setRowDiscountType(row, "percent", ".inv-item-distributor-discount-type-toggle", ".inv-item-distributor-discount-type");
    }

    function discountFieldHtml(config) {
        config = config || {};
        var label = config.label || "Discount";
        var valueClass = config.valueClass || "inv-item-discount-value";
        var toggleClass = config.toggleClass || "inv-item-discount-type-toggle";
        var buttonClass = config.buttonClass || "inv-item-discount-type";
        var discountType = config.discount_type === "amount" ? "amount" : "percent";
        var discountValue = config.discount_value != null && config.discount_value !== "" ? config.discount_value : "";

        return (
            '<div class="inv-mgmt-field inv-mgmt-field--discount">' +
            '<label>' + label + ' <span class="inv-field-optional">(optional)</span></label>' +
            '<div class="inv-discount-inline">' +
            '<input class="inv-mgmt-input ' + valueClass + '" type="number" min="0" step="0.01" placeholder="0" value="' + discountValue + '"/>' +
            '<div class="' + toggleClass + ' inv-discount-type-toggle" role="group" aria-label="' + label + ' type" data-discount-type="' + discountType + '">' +
            '<button type="button" class="inv-discount-type-btn ' + buttonClass + (discountType === "percent" ? " is-active" : "") + '" data-type="percent" aria-pressed="' + (discountType === "percent" ? "true" : "false") + '" title="Percentage discount">%</button>' +
            '<button type="button" class="inv-discount-type-btn ' + buttonClass + (discountType === "amount" ? " is-active" : "") + '" data-type="amount" aria-pressed="' + (discountType === "amount" ? "true" : "false") + '" title="Fixed amount discount">₹</button>' +
            "</div></div></div>"
        );
    }

    function updateRowPricing(row, skipTotals) {
        if (!row) return;
        var product = getProduct(row.querySelector(".inv-item-product").value);
        var priceWithTaxEl = row.querySelector(".inv-item-price-with-tax");
        var finalEl = row.querySelector(".inv-item-final-price");
        var totalEl = row.querySelector(".inv-item-total");

        if (priceWithTaxEl) {
            if (product) {
                priceWithTaxEl.value = InventoryApi.formatMoney(getProductBuyDetails(product).buyPrice);
            } else {
                priceWithTaxEl.value = InventoryApi.formatMoney(0);
            }
        }

        var newSaleEl = row.querySelector(".inv-item-new-sale-price");
        var newSalePrice = getRowNewSalePrice(row);
        if (newSaleEl) newSaleEl.value = InventoryApi.formatMoney(newSalePrice);

        var finalUnit = getRowFinalSalePrice(row);
        if (finalEl) finalEl.value = InventoryApi.formatMoney(finalUnit);
        var qty = Number(row.querySelector(".inv-item-qty").value || 0);
        if (isNaN(qty) || qty <= 0) qty = 0;
        if (totalEl) totalEl.value = InventoryApi.formatMoney(roundMoney(finalUnit * (qty || 1)));
        if (!skipTotals) {
            updateSaleTotals();
        }
    }

    function getRowSaleAmounts(row) {
        var productId = row.querySelector(".inv-item-product").value;
        if (!productId) {
            return { saleAmount: 0, totalCost: 0, profit: 0 };
        }
        var product = getProduct(productId);
        if (!product) {
            return { saleAmount: 0, totalCost: 0, profit: 0 };
        }
        var qty = Number(row.querySelector(".inv-item-qty").value || 0);
        if (isNaN(qty) || qty <= 0) qty = 0;
        var saleAmount = roundMoney(getRowFinalSalePrice(row) * (qty || 1));
        var totalCost = roundMoney(getProductBuyDetails(product).buyPrice * (qty || 1));
        return {
            saleAmount: saleAmount,
            totalCost: totalCost,
            profit: roundMoney(saleAmount - totalCost)
        };
    }

    function calculateSaleTotals() {
        var saleAmount = 0;
        var totalCost = 0;
        var profit = 0;
        document.querySelectorAll("#purchase-items-container .inv-mgmt-item-row").forEach(function (row) {
            if (!row.querySelector(".inv-item-product").value) return;
            var amounts = getRowSaleAmounts(row);
            saleAmount += amounts.saleAmount;
            totalCost += amounts.totalCost;
            profit += amounts.profit;
        });
        return {
            saleAmount: roundMoney(saleAmount),
            totalCost: roundMoney(totalCost),
            profit: roundMoney(profit)
        };
    }

    function setSaleTotalsDisplay(totalCost, saleAmount) {
        var costEl = document.getElementById("purchase-total-cost");
        var saleEl = document.getElementById("purchase-sale-amount");
        if (costEl) costEl.textContent = InventoryApi.formatMoney(totalCost);
        if (saleEl) saleEl.textContent = InventoryApi.formatMoney(saleAmount);
    }

    function updateSaleTotals() {
        var totals = calculateSaleTotals();
        setSaleTotalsDisplay(totals.totalCost, totals.saleAmount);
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
        var base = Number(product.quantity || 0) + getEditingStockBonus(productId);
        return Math.max(0, base - (allocated[productId] || 0));
    }

    function hasAvailableProducts(excludeRow) {
        var allocated = getAllocatedByProduct(excludeRow);
        return products.some(function (product) {
            var remaining = Number(product.quantity || 0) + getEditingStockBonus(product.id) -
                (allocated[product.id] || 0);
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
            var remaining = Number(product.quantity || 0) + getEditingStockBonus(product.id) -
                (allocated[product.id] || 0);
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
            if (window.InventorySearchableSelect) {
                InventorySearchableSelect.refresh(select);
            }
        });
    }

    function getProductMrp(product) {
        if (!product) return 0;
        var mrp = Number(product.mrp || 0);
        if (isNaN(mrp) || mrp < 0) return 0;
        return mrp;
    }

    function defaultSalePrice(product) {
        if (!product) return "";
        var mrp = getProductMrp(product);
        if (mrp > 0) return mrp;
        if (product.sale_price != null && product.sale_price !== "" && Number(product.sale_price) > 0) {
            return product.sale_price;
        }
        return "";
    }

    function updateRowSalePriceLimits(row, product) {
        var saleActualInput = row.querySelector(".inv-item-sale-actual");
        if (!saleActualInput) return;

        var mrp = getProductMrp(product);
        var label = saleActualInput.closest(".inv-mgmt-field");
        label = label ? label.querySelector("label") : null;

        if (mrp > 0) {
            saleActualInput.max = mrp;
            saleActualInput.setAttribute("title", "Maximum sell price: " + InventoryApi.formatMoney(mrp));
            row.dataset.productMrp = String(mrp);
            if (label) {
                label.innerHTML = 'Sell Price <span class="inv-field-optional">(max MRP ' +
                    InventoryApi.escapeHtml(InventoryApi.formatMoney(mrp)) + ")</span>";
            }
        } else {
            saleActualInput.removeAttribute("max");
            saleActualInput.removeAttribute("title");
            delete row.dataset.productMrp;
            if (label) label.textContent = "Sell Price";
        }
    }

    function enforceRowSalePriceLimit(row, showWarning) {
        var saleActualInput = row.querySelector(".inv-item-sale-actual");
        if (!saleActualInput) return true;

        var mrp = Number(row.dataset.productMrp || 0);
        if (mrp <= 0) return true;

        var val = Number(saleActualInput.value || 0);
        if (isNaN(val) || val <= mrp) return true;

        saleActualInput.value = mrp;
        if (showWarning) {
            InventoryToast.warning("Sell price cannot exceed MRP (" + InventoryApi.formatMoney(mrp) + ").");
        }
        return false;
    }

    function updateRowQtyLimits(row, product) {
        var qtyInput = row.querySelector(".inv-item-qty");
        if (!qtyInput) return;

        if (!product) {
            qtyInput.removeAttribute("max");
            row.dataset.maxQty = "";
            updateRowPricing(row);
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
        updateRowPricing(row);
    }

    function applyProductToRow(row, product, options) {
        options = options || {};
        var saleActualInput = row.querySelector(".inv-item-sale-actual");
        if (!product) {
            updateRowQtyLimits(row, null);
            updateRowSalePriceLimits(row, null);
            if (saleActualInput) saleActualInput.value = "";
            setRowTaxSelection(row, [], true);
            clearRowDiscount(row);
            updateRowPricing(row);
            return;
        }

        updateRowQtyLimits(row, product);
        updateRowSalePriceLimits(row, product);

        if (product.tax) {
            setRowTaxSelection(row, [String(product.tax)], true);
        } else {
            setRowTaxSelection(row, [], true);
        }

        if (saleActualInput && options.updatePrice !== false) {
            var shouldSetPrice = options.forcePrice || saleActualInput.value === "";
            if (shouldSetPrice) {
                saleActualInput.value = defaultSalePrice(product);
            }
            enforceRowSalePriceLimit(row, false);
        }
        updateRowPricing(row);
    }

    function updateRowTotal(row) {
        updateRowPricing(row);
    }

    function createItemRow(data) {
        data = data || {};
        var row = document.createElement("div");
        row.className = "inv-mgmt-item-row inv-mgmt-item-row--sale";
        row.innerHTML =
            '<div class="inv-mgmt-field"><label>Available Product</label><select class="inv-mgmt-select inv-item-product" required>' + productOptions(data.product_id, row) + "</select></div>" +
            '<div class="inv-mgmt-field"><label>Quantity</label><input class="inv-mgmt-input inv-item-qty" type="number" min="0.01" step="0.01" value="' + (data.quantity || 1) + '" required/></div>' +
            '<div class="inv-mgmt-field"><label>Actual Price with Tax (per product)</label><input class="inv-mgmt-input inv-item-price-with-tax" type="text" readonly value="0.00"/></div>' +
            '<div class="inv-mgmt-field"><label>Sell Price</label><input class="inv-mgmt-input inv-item-sale-actual" type="number" min="0" step="0.01" placeholder="0.00" value="' + (data.sale_actual_price != null && data.sale_actual_price !== "" ? data.sale_actual_price : "") + '" required/></div>' +
            discountFieldHtml({
                label: "Discount",
                discount_type: data.discount_type,
                discount_value: data.discount_value
            }) +
            '<div class="inv-mgmt-field"><label>New Sale Price</label><input class="inv-mgmt-input inv-item-new-sale-price" type="text" readonly value="0.00"/></div>' +
            discountFieldHtml({
                label: "Distributor Discount",
                valueClass: "inv-item-distributor-discount-value",
                toggleClass: "inv-item-distributor-discount-type-toggle",
                buttonClass: "inv-item-distributor-discount-type",
                discount_type: data.distributor_discount_type,
                discount_value: data.distributor_discount_value
            }) +
            '<div class="inv-mgmt-field"><label>Tax for Sale</label>' + rowTaxMultiSelectHtml() + "</div>" +
            '<div class="inv-mgmt-field"><label>Final Price</label><input class="inv-mgmt-input inv-item-final-price" type="text" readonly value="0.00"/></div>' +
            '<div class="inv-mgmt-field"><label>Total Price</label><input class="inv-mgmt-input inv-item-total" type="text" readonly value="0.00"/></div>' +
            '<div class="inv-mgmt-item-row-remove">' +
            '<button type="button" class="inv-row-action-btn inv-row-action-btn--delete inv-item-remove" title="Remove" aria-label="Remove product row">' +
            '<span class="material-symbols-outlined">delete</span></button></div>';

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
            updateRowPricing(row);
            refreshAllProductSelects();
        });
        row.querySelector(".inv-item-sale-actual").addEventListener("input", function () {
            enforceRowSalePriceLimit(row, true);
            updateRowPricing(row);
        });
        row.querySelector(".inv-item-sale-actual").addEventListener("change", function () {
            enforceRowSalePriceLimit(row, true);
            updateRowPricing(row);
        });
        wireRowDiscountTypeToggle(row);
        wireRowDiscountTypeToggle(row, {
            toggleSelector: ".inv-item-distributor-discount-type-toggle",
            buttonSelector: ".inv-item-distributor-discount-type",
            inputSelector: ".inv-item-distributor-discount-value"
        });
        initRowTaxMultiSelect(row, data.sale_tax_ids || data.sale_tax_id || []);
        row.querySelector(".inv-item-remove").addEventListener("click", function () {
            row.remove();
            refreshAllProductSelects();
            updateSaleTotals();
        });

        var select = row.querySelector(".inv-item-product");
        select.addEventListener("change", function () {
            applyProductToRow(row, getProduct(select.value), { forcePrice: true });
            refreshAllProductSelects();
        });

        if (data.product_id) {
            applyProductToRow(row, getProduct(data.product_id), {
                updatePrice: data.sale_actual_price == null || data.sale_actual_price === ""
            });
        } else {
            updateRowPricing(row);
        }
        return row;
    }

    function setFormMode(mode) {
        var titleEl = document.getElementById("purchase-form-title");
        var saveBtn = document.getElementById("purchase-save-btn");

        if (mode === "edit") {
            if (titleEl) titleEl.textContent = "Edit Sale";
            if (saveBtn) saveBtn.textContent = "Update Sale";
            ensureSaleItemsEditablePanel();
            toggleInvoiceSettingField(false);
        } else {
            if (titleEl) titleEl.textContent = "Add Sale";
            if (saveBtn) saveBtn.textContent = "Create Sale";
            ensureSaleItemsEditablePanel();
            toggleInvoiceSettingField(true);
        }
    }

    function getLineProductId(line) {
        if (!line) return null;
        return line.product_id != null ? line.product_id : line.product;
    }

    function ensureSaleItemsEditablePanel() {
        var itemsPanel = document.querySelector("#purchases-form-panel .inv-mgmt-items-panel");
        var addItemBtn = document.getElementById("purchase-add-item-btn");
        var itemsTitle = itemsPanel ? itemsPanel.querySelector("h4") : null;

        if (itemsPanel) itemsPanel.classList.remove("inv-sale-items--readonly");
        if (addItemBtn) addItemBtn.classList.remove("inv-hidden");
        if (itemsTitle) itemsTitle.textContent = "Products to Sell";
    }

    function enhanceSaleItemRows() {
        var container = document.getElementById("purchase-items-container");
        if (!container) return;

        container.querySelectorAll(".inv-item-product").forEach(function (select) {
            if (window.InventorySearchableSelect) {
                InventorySearchableSelect.rebuild(select, function (el) {
                    el.disabled = false;
                });
            } else {
                select.disabled = false;
            }
        });

        container.querySelectorAll(".inv-item-qty, .inv-item-sale-actual").forEach(function (input) {
            input.readOnly = false;
            input.disabled = false;
        });

        container.querySelectorAll(".inv-item-remove").forEach(function (btn) {
            btn.classList.remove("inv-hidden");
            btn.disabled = false;
        });
    }

    function populateItemRows(lines) {
        var container = document.getElementById("purchase-items-container");
        container.innerHTML = "";
        ensureSaleItemsEditablePanel();

        if (!lines || !lines.length) {
            addItemRow(null, true);
            enhanceSaleItemRows();
            updateSaleTotals();
            return;
        }

        lines.forEach(function (line) {
            var row = createItemRow({
                product_id: getLineProductId(line),
                quantity: line.quantity,
                sale_actual_price: line.unit_price
            });
            container.appendChild(row);
            var select = row.querySelector(".inv-item-product");
            var productId = getLineProductId(line);
            if (select && productId) {
                select.value = String(productId);
                applyProductToRow(row, getProduct(productId), {
                    updatePrice: false
                });
            }
        });
        refreshAllProductSelects();
        enhanceSaleItemRows();
        updateSaleTotals();
    }

    function populateForm(purchase) {
        loadCustomers(purchase.customer || "").then(function () {
            applyCustomerAddressesFromSelection(purchase.customer, true);
            document.getElementById("purchase-billing-address").value = purchase.billing_address || "";
            document.getElementById("purchase-shipping-address").value = purchase.shipping_address || "";
        });
        document.getElementById("purchase-date").value = purchase.purchase_date || "";
        loadPaymentTypes(purchase.payment_type || "");
        populateItemRows(purchase.items || []);
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
            '<button type="button" class="inv-row-action-btn inv-row-action-btn--view inv-purchase-print" data-id="' + purchase.id + '" title="Print" aria-label="Print sale">' +
            '<span class="material-symbols-outlined">print</span></button>' +
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
            return;
        }

        cachedItems = items;

        tbody.innerHTML = items.map(function (purchase) {
            return (
                "<tr>" +
                cols.renderRowCells(purchase) +
                '<td class="inv-col-action inv-mgmt-cell--action">' + actionButtons(purchase) + "</td>" +
                "</tr>"
            );
        }).join("");
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

        var rows = [
            { label: "Sale Date", value: displayValue(purchase.purchase_date) },
            { label: "Customer", value: formatCustomerDisplay(purchase) }
        ];

        if (purchase.reference_no) {
            rows.push({ label: "Invoice No.", value: displayValue(purchase.reference_no) });
            rows.push({ label: "Payment Type", value: displayValue(purchase.payment_type_name) });
        } else {
            rows.push({ label: "Payment Type", value: displayValue(purchase.payment_type_name) });
        }

        rows.push(
            { label: "Billing Address", value: displayValue(purchase.billing_address) },
            { label: "Shipping Address", value: displayValue(purchase.shipping_address) },
            { label: "Sale Amount", value: InventoryApi.formatMoney(purchase.total_amount), colStart: 1 },
            { label: "Total Cost", value: InventoryApi.formatMoney(purchase.total_cost) }
        );
        if (purchase.notes) {
            rows.push({ label: "Notes", value: displayValue(purchase.notes), full: true });
        }

        container.innerHTML = rows.map(function (row) {
            var cls = row.full ? " inv-product-view-item--full" : "";
            if (row.colStart === 1) cls += " inv-product-view-item--col-1";
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
            "<th>Product</th><th>SKU</th><th>Unit</th><th>Qty</th><th>Sale Price</th><th>Total Price</th><th>Total Cost</th>" +
            "</tr></thead><tbody>" +
            lines.map(function (line) {
                return (
                    "<tr>" +
                    "<td>" + displayValue(line.product_name) + "</td>" +
                    "<td>" + displayValue(line.product_sku) + "</td>" +
                    "<td>" + displayValue(line.product_unit || "pcs") + "</td>" +
                    "<td class=\"inv-mgmt-cell--num\">" + displayValue(formatQty(line.quantity)) + "</td>" +
                    "<td class=\"inv-mgmt-cell--num\">" + InventoryApi.formatMoney(line.unit_price) + "</td>" +
                    "<td class=\"inv-mgmt-cell--num\">" + InventoryApi.formatMoney(line.line_total) + "</td>" +
                    "<td class=\"inv-mgmt-cell--num\">" + InventoryApi.formatMoney(line.cost_amount) + "</td>" +
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
                setEditingSaleStockFromPurchase(purchase);
                setFormMode("edit");
                return Promise.all([
                    loadProducts({ includeProductIds: getIncludedEditProductIds() }),
                    loadTaxes()
                ]).then(function () {
                    populateForm(purchase);
                    ensureSaleItemsEditablePanel();
                    enhanceSaleItemRows();
                    InventoryPagePanel.showPanel(PURCHASES_LIST_PANEL, PURCHASES_FORM_PANEL);
                    document.getElementById("purchase-customer").focus();
                });
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
            var saleActualEl = row.querySelector(".inv-item-sale-actual");
            var unitPrice = getRowFinalSalePrice(row);
            if (!productId) continue;

            var product = getProduct(productId);
            if (!product) {
                InventoryToast.error("Selected product is no longer available.");
                return null;
            }

            if (!saleActualEl || saleActualEl.value === "") {
                InventoryToast.error("Enter a sell price for " + product.name + ".");
                return null;
            }

            var saleBase = Number(saleActualEl.value || 0);
            var mrp = getProductMrp(product);
            if (mrp > 0 && saleBase > mrp) {
                InventoryToast.error(
                    product.name + ": sell price cannot exceed MRP (" + InventoryApi.formatMoney(mrp) + ")."
                );
                saleActualEl.focus();
                return null;
            }

            if (unitPrice < 0) {
                InventoryToast.error("Sale price cannot be negative.");
                return null;
            }

            var available = getRemainingQty(productId, row);
            var stockLimit = Number(product.quantity || 0) + getEditingStockBonus(productId);
            totalsByProduct[productId] = (totalsByProduct[productId] || 0) + quantity;
            if (totalsByProduct[productId] > stockLimit) {
                InventoryToast.error(
                    product.name + ": total quantity (" + formatQty(totalsByProduct[productId]) +
                    ") exceeds available stock (" + formatQty(stockLimit) + ")."
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
                unit_price: unitPrice,
                list_price: getRowSellPrice(row),
                discount_amount: getRowDiscountAmount(row, quantity),
                tax_amount: getRowTaxAmount(row, quantity)
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
        editingSaleStockByProduct = {};
        setFormMode("add");
        loadInvoiceSettings("");
        loadCustomers("");
        document.getElementById("purchase-date").value = new Date().toISOString().slice(0, 10);
        applyCustomerAddressesFromSelection("", false);
        document.getElementById("purchase-payment-type").value = "";
        togglePaymentTypePanel(false);
        document.getElementById("purchase-items-container").innerHTML = "";
        addItemRow(null, isSilent !== false);
        updateSaleTotals();
    }

    function getSaleHeaderPayload(includeInvoiceSetting) {
        var paymentTypeEl = document.getElementById("purchase-payment-type");
        var paymentTypeId = paymentTypeEl ? paymentTypeEl.value : "";
        var customerId = document.getElementById("purchase-customer").value;
        var payload = {
            customer_id: customerId ? Number(customerId) : null,
            purchase_date: document.getElementById("purchase-date").value || undefined,
            billing_address: document.getElementById("purchase-billing-address").value.trim(),
            shipping_address: document.getElementById("purchase-shipping-address").value.trim(),
            payment_type_id: paymentTypeId ? Number(paymentTypeId) : null
        };
        if (includeInvoiceSetting) {
            var invoiceSettingEl = document.getElementById("purchase-invoice-setting");
            var invoiceSettingId = invoiceSettingEl ? invoiceSettingEl.value : "";
            payload.invoice_setting_id = invoiceSettingId ? Number(invoiceSettingId) : null;
        }
        return payload;
    }

    function savePurchase() {
        var invoiceSettingEl = document.getElementById("purchase-invoice-setting");
        if (!editingPurchaseId && invoiceSettingEl && !invoiceSettingEl.closest(".inv-hidden")) {
            if (!invoiceSettingEl.value) {
                InventoryToast.error("Please select an invoice.");
                invoiceSettingEl.focus();
                return;
            }
        }

        var customerId = document.getElementById("purchase-customer").value;
        if (!customerId) {
            InventoryToast.error("Please select a customer.");
            document.getElementById("purchase-customer").focus();
            return;
        }

        if (editingPurchaseId) {
            var editItems = collectItems();
            if (!editItems || !editItems.length) {
                if (editItems !== null) {
                    InventoryToast.error("Add at least one product the customer is purchasing.");
                }
                return;
            }

            var editRowCount = document.querySelectorAll("#purchase-items-container .inv-mgmt-item-row").length;
            if (editItems.length !== editRowCount) {
                InventoryToast.error("Select an available product for each row.");
                return;
            }

            var btn = document.getElementById("purchase-save-btn");
            InventoryLoader.button(btn, true, "Updating...");
            request("/" + editingPurchaseId + "/", {
                method: "PATCH",
                body: Object.assign(getSaleHeaderPayload(false), { items: editItems })
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
            body: Object.assign(getSaleHeaderPayload(true), { items: items })
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
                loadTaxes();
                loadInvoiceSettings();
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
                return Promise.all([loadTaxes(), loadPaymentTypes(), loadCustomers(), loadInvoiceSettings()]);
            }).then(function () {
                resetForm(true);
                if (!hasAvailableProducts(null)) {
                    InventoryToast.warning("No products with remaining stock available.");
                }
                if (!invoiceSettings.length) {
                    InventoryToast.warning("No invoice settings found. Add one in Settings first.");
                }
                if (!customers.length) {
                    InventoryToast.warning("No customers found. Add a customer first.");
                }
                InventoryPagePanel.showPanel(PURCHASES_LIST_PANEL, PURCHASES_FORM_PANEL);
                var invoiceSelect = document.getElementById("purchase-invoice-setting");
                if (invoiceSelect && !invoiceSelect.closest(".inv-hidden")) {
                    invoiceSelect.focus();
                } else {
                    var customerSelect = document.getElementById("purchase-customer");
                    if (customerSelect) customerSelect.focus();
                }
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
            loadCustomers(customer && customer.id ? customer.id : "").then(function () {
                if (customer && customer.id) {
                    applyCustomerAddressesFromSelection(customer.id, false);
                }
            });
        });

        var customerSelect = document.getElementById("purchase-customer");
        if (customerSelect) {
            customerSelect.addEventListener("change", onCustomerSelectionChange);
        }

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
                    return;
                }

                var printBtn = e.target.closest(".inv-purchase-print");
                if (printBtn) {
                    exportSalesPrint([printBtn.getAttribute("data-id")]);
                }
            });
        }
    }

    return { init: init };
})();
