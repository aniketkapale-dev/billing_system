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
    var editingPurchaseIsDraft = false;
    var viewingPurchaseId = null;
    var viewingPurchase = null;
    var addPaymentPurchaseId = null;
    var addPaymentPendingAmount = 0;
    var addPaymentMinDate = "";
    var editingSaleStockByProduct = {};
    var PURCHASES_LIST_PANEL = "purchases-list-panel";
    var PURCHASES_FORM_PANEL = "purchases-form-panel";
    var PURCHASES_VIEW_PANEL = "purchases-view-panel";
    var cachedItems = [];
    var bulkSelect = null;
    var SALE_PRINT_META_KEY = "billingSalePrintMeta";

    function readSalePrintMetaStore() {
        try {
            return JSON.parse(localStorage.getItem(SALE_PRINT_META_KEY) || "{}") || {};
        } catch (e) {
            return {};
        }
    }

    function writeSalePrintMetaStore(store) {
        localStorage.setItem(SALE_PRINT_META_KEY, JSON.stringify(store || {}));
    }

    function getSalePrintMetaFromForm() {
        var transportEl = document.getElementById("purchase-invoice-transport");
        var cartonsEl = document.getElementById("purchase-invoice-cartons");
        var ewayEl = document.getElementById("purchase-invoice-eway-bill");
        var dueDateEl = document.getElementById("purchase-invoice-due-date");
        var termsEl = document.getElementById("purchase-invoice-terms");
        return {
            transport: transportEl ? transportEl.value.trim() : "",
            cartons: cartonsEl ? cartonsEl.value.trim() : "",
            eway_bill_no: ewayEl ? ewayEl.value.trim() : "",
            due_date: dueDateEl ? dueDateEl.value.trim() : "",
            terms: termsEl ? termsEl.value.trim() : "",
            is_paid: isFullPaymentReceived()
        };
    }

    function setSalePrintMetaForm(meta, purchase) {
        meta = meta || {};
        if (purchase && purchase.due_date && !meta.due_date) {
            meta.due_date = purchase.due_date;
        }
        var transportEl = document.getElementById("purchase-invoice-transport");
        var cartonsEl = document.getElementById("purchase-invoice-cartons");
        var ewayEl = document.getElementById("purchase-invoice-eway-bill");
        var dueDateEl = document.getElementById("purchase-invoice-due-date");
        var termsEl = document.getElementById("purchase-invoice-terms");
        if (transportEl) transportEl.value = meta.transport || "";
        if (cartonsEl) cartonsEl.value = meta.cartons || "";
        if (ewayEl) ewayEl.value = meta.eway_bill_no || "";
        if (dueDateEl) dueDateEl.value = meta.due_date || "";
        if (termsEl) termsEl.value = meta.terms || "";
    }

    function saveSalePrintMeta(saleId, meta) {
        if (!saleId) return;
        var store = readSalePrintMetaStore();
        store[String(saleId)] = meta || getSalePrintMetaFromForm();
        writeSalePrintMetaStore(store);
    }

    function loadSalePrintMeta(saleId) {
        if (!saleId) return null;
        var store = readSalePrintMetaStore();
        return store[String(saleId)] || null;
    }

    function mergeSalePrintMeta(sale) {
        if (!sale || !sale.id) return sale;
        var meta = loadSalePrintMeta(sale.id);
        if (!meta) return sale;
        return Object.assign({}, sale, {
            invoice_transport: meta.transport || "",
            invoice_cartons: meta.cartons || "",
            invoice_eway_bill_no: meta.eway_bill_no || "",
            due_date: sale.due_date || meta.due_date || "",
            is_paid: meta.is_paid === true || sale.is_paid === true,
            invoice_print_terms: meta.terms || ""
        });
    }

    function clearSalePrintMetaForm() {
        setSalePrintMetaForm({});
    }
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
                    { id: "date", label: "Date", locked: true, cell: function (p) { return "<td>" + InventoryApi.escapeHtml(InventoryApi.formatDisplayDate(p.purchase_date, "—")) + "</td>"; } },
                    { id: "invoice_no", label: "Invoice No.", sortKey: "reference_no", cell: function (p) { return "<td>" + formatInvoiceNoCell(p) + "</td>"; } },
                    { id: "customer", label: "Customer", locked: true, sortKey: "customer_name", cell: function (p) { return "<td>" + formatCustomerDisplay(p) + "</td>"; } },
                    { id: "products", label: "Products Sold", cell: function (p) { return '<td class="inv-col-name">' + formatProductsSoldCell(p.items || [], p.id) + "</td>"; } },
                    { id: "sale_amount", label: "Bill Amount", sortKey: "total_amount", headerClass: "inv-mgmt-cell--num", cell: function (p) { return '<td class="inv-mgmt-cell--num">' + InventoryApi.formatMoney(p.total_amount) + "</td>"; } },
                    { id: "total_paid", label: "Total Paid", headerClass: "inv-mgmt-cell--num", cell: function (p) { return '<td class="inv-mgmt-cell--num">' + InventoryApi.formatMoney(p.total_paid) + "</td>"; } },
                    { id: "pending_bill", label: "Pending Bill", headerClass: "inv-mgmt-cell--num", cell: function (p) { return formatPendingBillCell(p); } },
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
            return results.filter(Boolean).map(mergeSalePrintMeta);
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

    function openAddInvoiceModal() {
        if (window.InventorySettingsInvoice && typeof InventorySettingsInvoice.openAddModal === "function") {
            InventorySettingsInvoice.openAddModal();
            return;
        }
        InventoryToast.error("Invoice form is not available.");
    }

    function openAddTaxModal() {
        if (window.InventorySettingsTax && typeof InventorySettingsTax.openAddModal === "function") {
            InventorySettingsTax.openAddModal();
            return;
        }
        InventoryToast.error("Tax form is not available.");
    }

    function formatCustomerDisplay(purchase) {
        return customerDisplayLabel(
            purchase.customer_name,
            purchase.company_name,
            purchase.customer_mobile
        );
    }

    function fillPaymentTypeSelect(select, selectedId) {
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
            InventorySearchableSelect.rebuild(select);
        }
    }

    function renderPaymentTypeSelect(selectedId) {
        fillPaymentTypeSelect(document.getElementById("purchase-payment-type"), selectedId);
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
        var includeAll = !!opts.includeAll || isDraftFlow();
        return InventoryApi.request(PRODUCTS_API, "?page_size=100")
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    products = (body.data.items || []).filter(function (product) {
                        if (includeAll) return true;
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
        var finalEl = row.querySelector(".inv-item-final-price");
        var totalEl = row.querySelector(".inv-item-total");

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

    function getBillAmount() {
        return calculateSaleTotals().saleAmount;
    }

    function setSaleTotalsDisplay(totalCost, saleAmount) {
        var costEl = document.getElementById("purchase-total-cost");
        var saleEl = document.getElementById("purchase-sale-amount");
        if (costEl) costEl.textContent = InventoryApi.formatMoney(totalCost);
        if (saleEl) saleEl.textContent = InventoryApi.formatMoney(saleAmount);
        syncPaymentFields();
    }

    function updateSaleTotals() {
        var totals = calculateSaleTotals();
        setSaleTotalsDisplay(totals.totalCost, totals.saleAmount);
    }

    function isPaidSegmentSelected() {
        var input = document.getElementById("purchase-mark-paid");
        return !!(input && input.checked);
    }

    function getPaidAmountValue() {
        var paidInput = document.getElementById("purchase-paid-amount");
        if (!paidInput) return 0;
        var value = Number(paidInput.value);
        return Number.isFinite(value) ? value : 0;
    }

    function isPartialPaidAmount() {
        if (!isPaidSegmentSelected()) return false;
        var billAmount = getBillAmount();
        if (billAmount <= 0) return false;
        return getPaidAmountValue() + 0.0001 < billAmount;
    }

    function isFullPaymentReceived() {
        if (!isPaidSegmentSelected()) return false;
        var paidAmount = getPaidAmountValue();
        if (paidAmount <= 0) return false;
        return !isPartialPaidAmount();
    }

    function shouldShowDueDateField() {
        if (!isPaidSegmentSelected()) return true;
        return isPartialPaidAmount();
    }

    function syncPaidAmountFromBill() {
        var paidInput = document.getElementById("purchase-paid-amount");
        if (!paidInput || !isPaidSegmentSelected()) return;
        if (paidInput.dataset.manual === "1") return;
        paidInput.value = getBillAmount().toFixed(2);
    }

    function syncPaymentFields() {
        var dueWrap = document.getElementById("purchase-due-date-wrap");
        var paidWrap = document.getElementById("purchase-paid-amount-wrap");
        var dueInput = document.getElementById("purchase-invoice-due-date");
        var paidSelected = isPaidSegmentSelected();

        if (paidWrap) paidWrap.classList.toggle("inv-hidden", !paidSelected);

        if (paidSelected) {
            syncPaidAmountFromBill();
        } else {
            var paidInput = document.getElementById("purchase-paid-amount");
            if (paidInput) {
                paidInput.value = "";
                paidInput.dataset.manual = "0";
            }
        }

        var showDueDate = shouldShowDueDateField();
        if (dueWrap) dueWrap.classList.toggle("inv-hidden", !showDueDate);
        if (!showDueDate && dueInput) dueInput.value = "";
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
        if (isDraftFlow()) {
            return products.length > 0;
        }
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
            if (!isDraftFlow() && remaining <= 0 && !isSelected) {
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
            qtyInput.min = 0;
            if (Number(qtyInput.value || 0) > available) {
                qtyInput.value = available > 0 ? available : "";
            }
        }
        updateRowPricing(row);
    }

    function applyProductToRow(row, product, options) {
        options = options || {};
        var saleActualInput = row.querySelector(".inv-item-sale-actual");
        if (!product) {
            updateRowQtyLimits(row, null);
            if (saleActualInput) saleActualInput.value = "";
            setRowTaxSelection(row, [], true);
            clearRowDiscount(row);
            updateRowPricing(row);
            return;
        }

        updateRowQtyLimits(row, product);

        if (!options.preserveSalePricing) {
            if (product.tax) {
                setRowTaxSelection(row, [String(product.tax)], true);
            } else {
                setRowTaxSelection(row, [], true);
            }
        }

        if (saleActualInput && options.updatePrice !== false) {
            var shouldSetPrice = options.forcePrice || saleActualInput.value === "";
            if (shouldSetPrice) {
                saleActualInput.value = defaultSalePrice(product);
            }
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
            '<div class="inv-mgmt-field"><label>Quantity</label><input class="inv-mgmt-input inv-item-qty" type="number" min="0" step="0.01" placeholder="1" value="' + (data.quantity != null && data.quantity !== "" ? data.quantity : 1) + '" required/></div>' +
            '<div class="inv-mgmt-field"><label>MRP Price</label><input class="inv-mgmt-input inv-item-sale-actual" type="number" min="0" step="0.01" placeholder="0.00" value="' + (data.sale_actual_price != null && data.sale_actual_price !== "" ? data.sale_actual_price : "") + '" required/></div>' +
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
            updateRowPricing(row);
        });
        row.querySelector(".inv-item-sale-actual").addEventListener("change", function () {
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
                updatePrice: data.sale_actual_price == null || data.sale_actual_price === "",
                preserveSalePricing: !!data.preserveSalePricing
            });
        } else {
            updateRowPricing(row);
        }
        return row;
    }

    function setFormMode(mode) {
        var titleEl = document.getElementById("purchase-form-title");
        var saveBtn = document.getElementById("purchase-save-btn");
        var draftBtn = document.getElementById("purchase-save-draft-btn");
        var finalizeBtn = document.getElementById("purchase-finalize-btn");

        if (mode === "draft") {
            if (titleEl) titleEl.textContent = "Edit Draft Sale";
            if (saveBtn) saveBtn.textContent = "Update Draft";
            if (draftBtn) draftBtn.classList.add("inv-hidden");
            if (finalizeBtn) finalizeBtn.classList.remove("inv-hidden");
            ensureSaleItemsEditablePanel();
            toggleInvoiceSettingField(true);
            toggleMarkPaidField(true);
            return;
        }

        if (mode === "edit") {
            if (titleEl) titleEl.textContent = "Edit Sale";
            if (saveBtn) saveBtn.textContent = "Update Sale";
            if (draftBtn) draftBtn.classList.add("inv-hidden");
            if (finalizeBtn) finalizeBtn.classList.add("inv-hidden");
            ensureSaleItemsReadonlyPanel();
            toggleInvoiceSettingField(false);
            toggleMarkPaidField(false);
        } else {
            if (titleEl) titleEl.textContent = "Add Sale";
            if (saveBtn) saveBtn.textContent = "Create Sale";
            if (draftBtn) draftBtn.classList.remove("inv-hidden");
            if (finalizeBtn) finalizeBtn.classList.add("inv-hidden");
            ensureSaleItemsEditablePanel();
            toggleInvoiceSettingField(true);
            toggleMarkPaidField(true);
        }
    }

    function toggleMarkPaidField(show) {
        var wrap = document.getElementById("purchase-mark-paid-wrap");
        var paidWrap = document.getElementById("purchase-paid-amount-wrap");
        if (wrap) wrap.classList.toggle("inv-hidden", !show);
        if (!show) {
            toggleUnpaidDueDateEdit(false);
            if (paidWrap) paidWrap.classList.add("inv-hidden");
        } else {
            var segment = document.querySelector(".inv-sale-paid-segment");
            if (segment) segment.classList.remove("inv-hidden");
            syncPaymentFields();
        }
    }

    function toggleUnpaidDueDateEdit(show) {
        var wrap = document.getElementById("purchase-mark-paid-wrap");
        var paidWrap = document.getElementById("purchase-paid-amount-wrap");
        var dueWrap = document.getElementById("purchase-due-date-wrap");
        var segment = document.querySelector(".inv-sale-paid-segment");
        if (wrap) wrap.classList.toggle("inv-hidden", !show);
        if (segment) segment.classList.toggle("inv-hidden", show);
        if (paidWrap) paidWrap.classList.add("inv-hidden");
        if (dueWrap) dueWrap.classList.toggle("inv-hidden", !show);
    }

    function setSalePaidToggle(checked) {
        var input = document.getElementById("purchase-mark-paid");
        var paidInput = document.getElementById("purchase-paid-amount");
        if (!input) return;
        input.checked = !!checked;
        if (checked && paidInput) {
            paidInput.dataset.manual = "0";
        }
        syncPaymentFields();
        syncSalePaidSegmentUI(!!checked);
    }

    function syncSalePaidSegmentUI(isPaid) {
        document.querySelectorAll(".inv-sale-paid-segment-btn").forEach(function (btn) {
            var wantPaid = btn.getAttribute("data-paid") === "true";
            btn.classList.toggle("is-active", wantPaid === isPaid);
        });
    }

    function wireSalePaidToggle() {
        var input = document.getElementById("purchase-mark-paid");
        if (!input || input.dataset.wired === "1") return;
        input.dataset.wired = "1";
        document.querySelectorAll(".inv-sale-paid-segment-btn").forEach(function (btn) {
            btn.addEventListener("click", function () {
                setSalePaidToggle(btn.getAttribute("data-paid") === "true");
            });
        });

        var paidInput = document.getElementById("purchase-paid-amount");
        if (paidInput) {
            paidInput.addEventListener("input", function () {
                paidInput.dataset.manual = "1";
                syncPaymentFields();
            });
        }
    }

    function ensureSaleItemsReadonlyPanel() {
        var itemsPanel = document.querySelector("#purchases-form-panel .inv-mgmt-items-panel");
        var addItemBtn = document.getElementById("purchase-add-item-btn");
        var itemsTitle = itemsPanel ? itemsPanel.querySelector("h4") : null;

        if (itemsPanel) itemsPanel.classList.add("inv-sale-items--readonly");
        if (addItemBtn) addItemBtn.classList.add("inv-hidden");
        if (itemsTitle) itemsTitle.textContent = "Products on Invoice";
        setSaleItemsEditable(false);
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
        setSaleItemsEditable(true);
    }

    function setSaleItemsEditable(editable) {
        var container = document.getElementById("purchase-items-container");
        if (!container) return;

        container.querySelectorAll(".inv-item-product").forEach(function (select) {
            select.disabled = !editable;
            if (window.InventorySearchableSelect) {
                InventorySearchableSelect.rebuild(select, function (el) {
                    el.disabled = !editable;
                });
            }
        });

        container.querySelectorAll(
            ".inv-item-qty, .inv-item-sale-actual, .inv-item-discount-value, .inv-item-distributor-discount-value"
        ).forEach(function (input) {
            input.readOnly = !editable;
            input.disabled = !editable;
        });

        container.querySelectorAll(
            ".inv-item-discount-type, .inv-item-distributor-discount-type, .inv-item-remove"
        ).forEach(function (btn) {
            btn.disabled = !editable;
        });

        container.querySelectorAll(".inv-item-sale-gst button, .inv-item-sale-gst input").forEach(function (el) {
            el.disabled = !editable;
        });
    }

    function enhanceSaleItemRows() {
        if (editingPurchaseId && !editingPurchaseIsDraft) {
            setSaleItemsEditable(false);
            return;
        }
        setSaleItemsEditable(true);
    }

    function buildRowDataFromPurchaseLine(line) {
        var productId = getLineProductId(line);
        var product = getProduct(productId);
        var qty = Number(line.quantity || 1) || 1;
        var listPrice = line.list_price != null && line.list_price !== ""
            ? Number(line.list_price)
            : Number(line.unit_price || 0);
        var discountValue = line.discount_value != null && line.discount_value !== ""
            ? line.discount_value
            : "";
        var distributorDiscountValue = line.distributor_discount_value != null && line.distributor_discount_value !== ""
            ? line.distributor_discount_value
            : "";
        var saleTaxIds = Array.isArray(line.sale_tax_ids)
            ? line.sale_tax_ids.map(function (id) { return String(id); })
            : [];

        var discountType = line.discount_type || "percent";

        if ((discountValue === "" || Number(discountValue) === 0) && Number(line.discount_amount || 0) > 0) {
            discountType = "amount";
            discountValue = roundMoney(Number(line.discount_amount) / qty);
        }

        if (!saleTaxIds.length && Number(line.tax_amount || 0) > 0 && product && product.tax) {
            saleTaxIds = [String(product.tax)];
        }

        return {
            product_id: productId,
            quantity: line.quantity,
            sale_actual_price: listPrice,
            discount_type: discountType,
            discount_value: discountValue,
            distributor_discount_type: line.distributor_discount_type || "percent",
            distributor_discount_value: distributorDiscountValue,
            sale_tax_ids: saleTaxIds,
            preserveSalePricing: true
        };
    }

    function populateItemRows(lines) {
        var container = document.getElementById("purchase-items-container");
        container.innerHTML = "";
        if (!editingPurchaseId || editingPurchaseIsDraft) {
            ensureSaleItemsEditablePanel();
        }

        if (!lines || !lines.length) {
            if (!editingPurchaseId || editingPurchaseIsDraft) {
                addItemRow(null, true);
            }
            enhanceSaleItemRows();
            updateSaleTotals();
            return;
        }

        lines.forEach(function (line) {
            container.appendChild(createItemRow(buildRowDataFromPurchaseLine(line)));
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
        setSalePrintMetaForm(loadSalePrintMeta(purchase.id), purchase);
        if (purchase.is_draft) {
            var draftMeta = loadSalePrintMeta(purchase.id) || {};
            setSalePaidToggle(draftMeta.is_paid === true);
        } else if (!purchase.is_paid) {
            toggleUnpaidDueDateEdit(true);
        }
        populateItemRows(purchase.items || []);
    }

    function formatProfit(value) {
        var num = Number(value || 0);
        var formatted = InventoryApi.formatMoney(num);
        if (num > 0) return "+" + formatted;
        return formatted;
    }

    function isDraftFlow() {
        return !!editingPurchaseIsDraft;
    }

    function getSaleRowStatusClass(purchase) {
        if (!purchase) return "";
        if (purchase.is_cancelled) return "inv-sale-row--cancelled";
        if (purchase.is_draft) return "inv-sale-row--draft";
        if (purchase.is_paid || purchase.payment_status === "paid") return "inv-sale-row--paid";
        if (purchase.payment_status === "partial") return "inv-sale-row--partial";
        return "inv-sale-row--pending";
    }

    function formatSaleStatusBadge(purchase) {
        if (!purchase) return "";
        if (purchase.is_cancelled) {
            return '<span class="inv-sale-status-badge inv-sale-status-badge--cancelled">Cancelled</span>';
        }
        if (purchase.is_draft) {
            return '<span class="inv-sale-status-badge inv-sale-status-badge--draft">Draft</span>';
        }
        if (purchase.is_paid || purchase.payment_status === "paid") {
            return '<span class="inv-sale-status-badge inv-sale-status-badge--paid">Paid</span>';
        }
        if (purchase.payment_status === "partial") {
            return '<span class="inv-sale-status-badge inv-sale-status-badge--partial">Partial</span>';
        }
        return '<span class="inv-sale-status-badge inv-sale-status-badge--pending">Pending</span>';
    }

    function formatPaymentStatusLabel(purchase) {
        if (!purchase || purchase.is_draft) return "—";
        if (purchase.is_cancelled) return "—";
        if (purchase.is_paid || purchase.payment_status === "paid") return "Paid";
        if (purchase.payment_status === "partial") return "Partially Paid";
        return "Unpaid";
    }

    function formatInvoiceNoCell(purchase) {
        var ref = displayValue(purchase.reference_no);
        var badge = formatSaleStatusBadge(purchase);
        if (!badge) return ref;
        return ref + ' <span class="inv-sale-status-wrap">' + badge + "</span>";
    }

    function displayValue(value) {
        if (value === null || value === undefined || String(value).trim() === "") return "—";
        return InventoryApi.escapeHtml(String(value));
    }

    function getPendingBillAmount(purchase) {
        if (purchase && purchase.is_draft) return 0;
        if (purchase && purchase.pending_bill != null) {
            return Number(purchase.pending_bill) || 0;
        }
        if (!purchase || purchase.is_cancelled || purchase.is_paid) return 0;
        return Number(purchase.total_amount) || 0;
    }

    function getPendingBillToneClass(amount) {
        return Number(amount) > 0 ? "inv-pending-bill--due" : "inv-pending-bill--clear";
    }

    function formatPendingBillCell(purchase) {
        var amount = getPendingBillAmount(purchase);
        return (
            '<td class="inv-mgmt-cell--num">' +
            '<span class="' + getPendingBillToneClass(amount) + '">' +
            InventoryApi.formatMoney(amount) +
            "</span></td>"
        );
    }

    function formatPendingBillValue(purchase) {
        var amount = getPendingBillAmount(purchase);
        return (
            '<span class="' + getPendingBillToneClass(amount) + '">' +
            InventoryApi.formatMoney(amount) +
            "</span>"
        );
    }

    function actionSlot() {
        return '<span class="inv-row-action-btn inv-row-action-btn--slot" aria-hidden="true"></span>';
    }

    function actionButtons(purchase) {
        var isCancelled = !!purchase.is_cancelled;
        var isDraft = !!purchase.is_draft;

        var editBtn = isCancelled
            ? actionSlot()
            : isDraft
                ? (
                    '<button type="button" class="inv-row-action-btn inv-row-action-btn--finalize inv-purchase-edit" data-id="' + purchase.id + '" title="Finalize sale" aria-label="Finalize sale">' +
                    '<span class="material-symbols-outlined">task_alt</span></button>'
                )
                : (
                    '<button type="button" class="inv-row-action-btn inv-row-action-btn--edit inv-purchase-edit" data-id="' + purchase.id + '" title="Edit" aria-label="Edit sale">' +
                    '<span class="material-symbols-outlined">edit</span></button>'
                );

        var paidBtn = (isCancelled || isDraft)
            ? actionSlot()
            : purchase.is_paid
                ? (
                    '<button type="button" class="inv-row-action-btn inv-row-action-btn--paid" disabled ' +
                    'title="Paid" aria-label="Paid">' +
                    '<span class="material-symbols-outlined">account_balance_wallet</span></button>'
                )
                : (
                    '<button type="button" class="inv-row-action-btn inv-row-action-btn--mark-paid inv-purchase-add-payment" ' +
                    'data-id="' + purchase.id + '" title="Add payment" aria-label="Add payment">' +
                    '<span class="material-symbols-outlined">payments</span></button>'
                );

        var historyBtn = isDraft
            ? actionSlot()
            : (
                '<button type="button" class="inv-row-action-btn inv-row-action-btn--history inv-purchase-invoice-history" ' +
                'data-id="' + purchase.id + '" title="Invoice history" aria-label="Invoice history">' +
                '<span class="material-symbols-outlined">history</span></button>'
            );

        var cancelBtnLabel = isDraft ? "Delete draft" : "Delete sale";

        var cancelBtn = isCancelled
            ? (
                '<button type="button" class="inv-row-action-btn inv-row-action-btn--cancelled" disabled ' +
                'title="Cancelled" aria-label="Cancelled">' +
                '<span class="material-symbols-outlined">cancel</span></button>'
            )
            : (
                '<button type="button" class="inv-row-action-btn inv-row-action-btn--mark-cancelled inv-purchase-mark-cancelled" ' +
                'data-id="' + purchase.id + '" title="' + cancelBtnLabel + '" aria-label="' + cancelBtnLabel + '">' +
                '<span class="material-symbols-outlined">highlight_off</span></button>'
            );

        var viewBtn =
            '<button type="button" class="inv-row-action-btn inv-row-action-btn--view inv-purchase-view" data-id="' + purchase.id + '" title="View" aria-label="View sale">' +
            '<span class="material-symbols-outlined">visibility</span></button>';

        var printBtn =
            '<button type="button" class="inv-row-action-btn inv-row-action-btn--print inv-purchase-print" data-id="' + purchase.id + '" title="Print" aria-label="Print sale">' +
            '<span class="material-symbols-outlined">print</span></button>';

        return (
            '<div class="inv-row-actions inv-row-actions--stacked">' +
                '<div class="inv-row-actions-row">' +
                    viewBtn + editBtn + paidBtn +
                "</div>" +
                '<div class="inv-row-actions-row">' +
                    cancelBtn + historyBtn + printBtn +
                "</div>" +
            "</div>"
        );
    }

    function getLastPaymentDate(purchase) {
        var payments = (purchase && purchase.payments) || [];
        var last = "";
        payments.forEach(function (payment) {
            var dateValue = InventoryApi.toInputDateValue(payment.payment_date);
            if (dateValue && (!last || dateValue > last)) {
                last = dateValue;
            }
        });
        return last;
    }

    function getMinPaymentDate(purchase) {
        var lastPaymentDate = getLastPaymentDate(purchase);
        if (lastPaymentDate) return lastPaymentDate;
        return InventoryApi.toInputDateValue(purchase && purchase.purchase_date) || "";
    }

    function syncAddPaymentNextDueMin() {
        var dateEl = document.getElementById("purchase-add-payment-date");
        var dueEl = document.getElementById("purchase-add-payment-next-due");
        if (!dateEl || !dueEl) return;

        var paymentDate = dateEl.value.trim();
        if (!paymentDate) return;

        dueEl.min = paymentDate;
        if (dueEl.value && dueEl.value < paymentDate) {
            dueEl.value = paymentDate;
        }
    }

    function syncAddPaymentDueField(pendingAmount) {
        var amountEl = document.getElementById("purchase-add-payment-amount");
        var dueWrap = document.getElementById("purchase-add-payment-next-due-wrap");
        var dueEl = document.getElementById("purchase-add-payment-next-due");
        var dateEl = document.getElementById("purchase-add-payment-date");
        if (!amountEl || !dueWrap) return;

        var amount = Number(amountEl.value) || 0;
        var showDue = amount > 0 && amount + 0.0001 < pendingAmount;
        dueWrap.classList.toggle("inv-hidden", !showDue);
        if (!showDue && dueEl) {
            dueEl.value = "";
            return;
        }
        syncAddPaymentNextDueMin();
        if (showDue && dueEl && !dueEl.value) {
            var paymentDate = dateEl ? dateEl.value.trim() : "";
            dueEl.value = paymentDate || dueEl.min || "";
        }
    }

    function populateAddPaymentModal(purchase) {
        purchase = purchase || {};
        addPaymentPurchaseId = purchase.id || null;
        var pending = getPendingBillAmount(purchase);
        addPaymentPendingAmount = pending;
        var totalPaid = Number(purchase.total_paid) || 0;

        document.getElementById("purchase-add-payment-bill").textContent = InventoryApi.formatMoney(purchase.total_amount);
        document.getElementById("purchase-add-payment-paid").textContent = InventoryApi.formatMoney(totalPaid);
        document.getElementById("purchase-add-payment-pending").textContent = InventoryApi.formatMoney(pending);

        var amountEl = document.getElementById("purchase-add-payment-amount");
        var dateEl = document.getElementById("purchase-add-payment-date");
        var notesEl = document.getElementById("purchase-add-payment-notes");
        var dueEl = document.getElementById("purchase-add-payment-next-due");
        if (amountEl) {
            amountEl.value = pending > 0 ? pending.toFixed(2) : "";
            amountEl.max = pending > 0 ? pending.toFixed(2) : "";
        }
        var today = new Date().toISOString().slice(0, 10);
        var minPaymentDate = getMinPaymentDate(purchase);
        addPaymentMinDate = minPaymentDate;
        var defaultPaymentDate = today;
        if (minPaymentDate && defaultPaymentDate < minPaymentDate) {
            defaultPaymentDate = minPaymentDate;
        }
        if (dateEl) {
            dateEl.min = minPaymentDate || "";
            dateEl.value = defaultPaymentDate;
        }
        if (notesEl) notesEl.value = "";
        if (dueEl) {
            var paymentDate = dateEl ? dateEl.value.trim() : defaultPaymentDate;
            var existingDue = purchase.due_date || "";
            dueEl.min = paymentDate;
            dueEl.value = existingDue && existingDue >= paymentDate ? existingDue : paymentDate;
        }

        fillPaymentTypeSelect(
            document.getElementById("purchase-add-payment-type"),
            purchase.payment_type || ""
        );
        syncAddPaymentDueField(pending);
    }

    function openAddPaymentModal(id) {
        if (!id) return;
        InventoryLoader.show();
        fetchPurchase(id)
            .then(function (purchase) {
                if (!purchase) return;
                if (purchase.is_draft) {
                    InventoryToast.error("Draft sales must be finalized before recording payments.");
                    return;
                }
                if (purchase.is_cancelled) {
                    InventoryToast.error("Cancelled invoices cannot receive payments.");
                    return;
                }
                if (purchase.is_paid || getPendingBillAmount(purchase) <= 0) {
                    InventoryToast.info("This invoice is already fully paid.");
                    return;
                }
                return loadPaymentTypes(purchase.payment_type || "").then(function () {
                    populateAddPaymentModal(purchase);
                    InventoryModal.open("purchase-add-payment-modal");
                    var typeSelect = document.getElementById("purchase-add-payment-type");
                    if (window.InventorySearchableSelect && typeSelect) {
                        InventorySearchableSelect.rebuild(typeSelect);
                    }
                    var amountEl = document.getElementById("purchase-add-payment-amount");
                    if (amountEl) amountEl.focus();
                });
            })
            .catch(function () {
                InventoryToast.error("Network error while loading sale.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function submitAddPayment() {
        if (!addPaymentPurchaseId) return;

        var amountEl = document.getElementById("purchase-add-payment-amount");
        var dateEl = document.getElementById("purchase-add-payment-date");
        var typeEl = document.getElementById("purchase-add-payment-type");
        var dueEl = document.getElementById("purchase-add-payment-next-due");
        var notesEl = document.getElementById("purchase-add-payment-notes");
        var amount = Number(amountEl && amountEl.value);
        var pending = addPaymentPendingAmount;
        if (!Number.isFinite(amount) || amount <= 0) {
            InventoryToast.error("Please enter a valid payment amount.");
            if (amountEl) amountEl.focus();
            return;
        }
        if (amount > pending + 0.0001) {
            InventoryToast.error("Payment amount cannot exceed the pending bill.");
            if (amountEl) amountEl.focus();
            return;
        }

        var paymentDate = dateEl ? dateEl.value.trim() : "";
        if (!paymentDate) {
            InventoryToast.error("Please select a payment date.");
            if (dateEl) dateEl.focus();
            return;
        }
        if (addPaymentMinDate && paymentDate < addPaymentMinDate) {
            InventoryToast.error("Payment date cannot be before the last recorded payment date.");
            if (dateEl) dateEl.focus();
            return;
        }

        var payload = {
            amount: amount,
            payment_date: paymentDate,
            notes: notesEl ? notesEl.value.trim() : ""
        };
        if (typeEl && typeEl.value) payload.payment_type_id = Number(typeEl.value);

        var clearsBill = amount + 0.0001 >= pending;
        if (!clearsBill) {
            var nextDue = dueEl ? dueEl.value.trim() : "";
            if (!nextDue) {
                InventoryToast.error("Please enter the next due date for the remaining balance.");
                if (dueEl) dueEl.focus();
                return;
            }
            if (nextDue < paymentDate) {
                InventoryToast.error("Next due date cannot be before the payment date.");
                if (dueEl) dueEl.focus();
                return;
            }
            payload.next_due_date = nextDue;
        }

        var btn = document.getElementById("purchase-add-payment-save-btn");
        InventoryLoader.button(btn, true, "Saving...");
        request("/" + addPaymentPurchaseId + "/payments/", {
            method: "POST",
            body: payload
        })
            .then(function (body) {
                if (body && body.isSuccess) {
                    InventoryToast.success(body.message || "Payment recorded successfully.");
                    InventoryModal.close("purchase-add-payment-modal");
                    addPaymentPurchaseId = null;
                    loadPurchases(currentPage);
                    if (viewingPurchaseId && String(viewingPurchaseId) === String(body.data && body.data.id)) {
                        viewingPurchase = body.data;
                        renderViewDetails(body.data);
                        updateViewPanelActions(body.data);
                    }
                } else {
                    var err = body.message || "Unable to record payment.";
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

    function renderPaymentHistorySummary(purchase) {
        var wrap = document.getElementById("purchase-payment-history-summary");
        if (!wrap) return;
        wrap.innerHTML =
            '<div class="inv-sale-payment-summary-row">' +
                "<span>Invoice</span><strong>" + displayValue(purchase.reference_no) + "</strong>" +
            "</div>" +
            '<div class="inv-sale-payment-summary-row">' +
                "<span>Bill Amount</span><strong>" + InventoryApi.formatMoney(purchase.total_amount) + "</strong>" +
            "</div>" +
            '<div class="inv-sale-payment-summary-row">' +
                "<span>Total Paid</span><strong>" + InventoryApi.formatMoney(purchase.total_paid) + "</strong>" +
            "</div>" +
            '<div class="inv-sale-payment-summary-row inv-sale-payment-summary-row--pending">' +
                "<span>Pending Bill</span><strong>" + InventoryApi.formatMoney(getPendingBillAmount(purchase)) + "</strong>" +
            "</div>";
    }

    function renderPaymentHistoryRows(payments) {
        var tbody = document.getElementById("purchase-payment-history-body");
        if (!tbody) return;

        if (!payments || !payments.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="inv-mgmt-empty">No payments recorded yet.</td></tr>';
            return;
        }

        tbody.innerHTML = payments.map(function (payment) {
            return (
                "<tr>" +
                "<td>" + displayValue(formatViewDateValue(payment.payment_date)) + "</td>" +
                '<td class="inv-mgmt-cell--num">' + InventoryApi.formatMoney(payment.amount) + "</td>" +
                "<td>" + displayValue(payment.payment_type_name) + "</td>" +
                "<td>" + displayValue(formatViewDateValue(payment.next_due_date)) + "</td>" +
                "<td>" + displayValue(payment.notes) + "</td>" +
                "</tr>"
            );
        }).join("");
    }

    function openPaymentHistoryModal(id) {
        if (!id) return;
        InventoryLoader.show();
        fetchPurchase(id)
            .then(function (purchase) {
                if (!purchase) return;
                if (purchase.is_draft) {
                    InventoryToast.error("Draft sales do not have payment history.");
                    return;
                }
                renderPaymentHistorySummary(purchase);
                renderPaymentHistoryRows(purchase.payments || []);
                var titleEl = document.getElementById("purchase-payment-history-title");
                if (titleEl) {
                    titleEl.textContent = "Invoice History — " + (purchase.reference_no || purchase.customer_name || "Sale");
                }
                InventoryModal.open("purchase-payment-history-modal");
            })
            .catch(function () {
                InventoryToast.error("Network error while loading payment history.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function updateViewPanelActions(purchase) {
        var addBtn = document.getElementById("purchase-view-add-payment-btn");
        var historyBtn = document.getElementById("purchase-view-payment-history-btn");
        var showHistory = purchase && !purchase.is_draft;
        var showPaymentActions = purchase && !purchase.is_draft && !purchase.is_cancelled;
        if (historyBtn) historyBtn.classList.toggle("inv-hidden", !showHistory);
        if (addBtn) {
            var showAdd = showPaymentActions && !purchase.is_paid && getPendingBillAmount(purchase) > 0;
            addBtn.classList.toggle("inv-hidden", !showAdd);
        }
    }

    function findCachedPurchase(id) {
        for (var i = 0; i < cachedItems.length; i++) {
            if (String(cachedItems[i].id) === String(id)) return cachedItems[i];
        }
        return null;
    }

    function markPurchaseCancelled(id) {
        if (!id) return;
        var purchase = findCachedPurchase(id);
        if (purchase && purchase.is_draft) {
            InventoryConfirm.ask({
                title: "Delete draft sale?",
                message: "This draft will be removed and its invoice number will be released for reuse.",
                confirmText: "Delete Draft",
                cancelText: "Keep Draft",
                variant: "danger",
                icon: "delete"
            }).then(function (confirmed) {
                if (!confirmed) return;
                request("/" + id + "/mark-cancelled/", { method: "POST", body: {} })
                    .then(function (body) {
                        if (body && body.isSuccess) {
                            InventoryToast.success(body.message || "Draft sale deleted.");
                            loadPurchases(currentPage);
                        } else {
                            InventoryToast.error(body && body.message ? body.message : "Unable to delete draft sale.");
                        }
                    })
                    .catch(function () {
                        InventoryToast.error("Network error. Please try again.");
                    });
            });
            return;
        }

        var minDate = purchase && purchase.purchase_date ? purchase.purchase_date : "";
        InventoryConfirm.prompt({
            title: "Cancel this invoice?",
            message: "The invoice will be marked as cancelled and stock sold on this invoice will be restored.",
            showDate: true,
            dateLabel: "Cancellation Date",
            dateRequired: true,
            minDate: minDate,
            dateErrorMessage: "Cancellation date cannot be before the invoice date.",
            inputLabel: "Cancellation Reason",
            inputPlaceholder: "Enter reason for cancelling this invoice",
            confirmText: "Cancel Invoice",
            cancelText: "Keep Invoice",
            variant: "danger",
            icon: "highlight_off",
            required: true
        }).then(function (result) {
            if (!result) return;
            var reason = result.reason || "";
            var cancellationDate = result.cancellation_date || "";
            if (!reason) return;
            request("/" + id + "/mark-cancelled/", {
                method: "POST",
                body: {
                    cancellation_reason: reason,
                    cancellation_date: cancellationDate
                }
            })
                .then(function (body) {
                    if (body && body.isSuccess) {
                        InventoryToast.success(body.message || "Invoice cancelled.");
                        loadPurchases(currentPage);
                    } else {
                        InventoryToast.error(body && body.message ? body.message : "Unable to cancel invoice.");
                    }
                })
                .catch(function () {
                    InventoryToast.error("Network error. Please try again.");
                });
        });
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
            var rowClass = getSaleRowStatusClass(purchase);
            return (
                '<tr class="' + rowClass + '">' +
                cols.renderRowCells(purchase) +
                '<td class="inv-col-action inv-mgmt-cell--action">' + actionButtons(purchase) + "</td>" +
                "</tr>"
            );
        }).join("");

        if (window.InventoryTableCards) {
            var table = tbody.closest(".inv-mgmt-table");
            if (table) InventoryTableCards.syncTable(table);
        }
    }

    function fetchPurchase(id) {
        return request("/" + id + "/").then(function (body) {
            if (body && body.isSuccess && body.data) {
                return mergeSalePrintMeta(body.data);
            }
            InventoryToast.error(body.message || "Failed to load sale details.");
            return null;
        });
    }

    function formatViewDateValue(value) {
        return InventoryApi.formatDisplayDate(value, "");
    }

    function formatPaymentScheduleViewField(purchase) {
        purchase = mergeSalePrintMeta(purchase || {});

        if (purchase.is_draft) {
            return {
                label: "Due Date",
                value: displayValue(formatViewDateValue(purchase.due_date))
            };
        }

        if (purchase.is_paid) {
            return {
                label: "Payment Date",
                value: displayValue(InventoryApi.formatDateTime(purchase.paid_at, "—"))
            };
        }

        return {
            label: "Due Date",
            value: displayValue(formatViewDateValue(purchase.due_date))
        };
    }

    function getPaymentPayloadForSave(isPaid) {
        var dueDateEl = document.getElementById("purchase-invoice-due-date");
        var payload = {
            is_paid: !!isPaid,
            due_date: isPaid ? null : (dueDateEl && dueDateEl.value.trim() ? dueDateEl.value.trim() : null)
        };
        if (isPaidSegmentSelected()) {
            var paidAmount = getPaidAmountValue();
            if (paidAmount > 0) payload.payment_amount = paidAmount;
        }
        return payload;
    }

    function renderViewDetails(purchase) {
        purchase = mergeSalePrintMeta(purchase || {});
        var container = document.getElementById("purchase-view-body");
        var itemsWrap = document.getElementById("purchase-view-items-wrap");
        if (!container || !itemsWrap) return;

        var rows = [
            { label: "Sale Date", value: displayValue(InventoryApi.formatDisplayDate(purchase.purchase_date, "—")) },
            { label: "Customer", value: formatCustomerDisplay(purchase) }
        ];

        if (purchase.reference_no) {
            rows.push({ label: "Invoice No.", value: displayValue(purchase.reference_no) });
        }

        rows.push(formatPaymentScheduleViewField(purchase));

        rows.push(
            { label: "Billing Address", value: displayValue(purchase.billing_address) },
            { label: "Shipping Address", value: displayValue(purchase.shipping_address) },
            { label: "Invoice Status", value: purchase.is_cancelled ? "Cancelled" : (purchase.is_draft ? "Draft" : "Active") },
            { label: "Payment Status", value: formatPaymentStatusLabel(purchase) },
            { label: "Payment Type", value: displayValue(purchase.payment_type_name) },
            { label: "Bill Amount", value: InventoryApi.formatMoney(purchase.total_amount), colStart: 1, num: true, emphasis: true },
            { label: "Total Paid", value: InventoryApi.formatMoney(purchase.total_paid), num: true },
            { label: "Pending Bill", value: formatPendingBillValue(purchase), num: true },
            { label: "Total Cost", value: InventoryApi.formatMoney(purchase.total_cost), num: true }
        );
        if (purchase.is_cancelled) {
            var cancelDate = purchase.cancellation_date || purchase.cancelled_at;
            rows.push({
                label: "Cancellation Date",
                value: displayValue(InventoryApi.formatDisplayDate(cancelDate, "—"))
            });
            rows.push({
                label: "Cancellation Reason",
                value: displayValue(purchase.cancellation_reason),
                full: true
            });
        }
        if (purchase.notes) {
            rows.push({ label: "Notes", value: displayValue(purchase.notes), full: true });
        }

        container.innerHTML = InventoryApi.renderViewGrid(rows);

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
                if (purchase.is_cancelled) {
                    InventoryToast.error("Cancelled invoices cannot be edited.");
                    return;
                }
                editingPurchaseId = purchase.id;
                editingPurchaseIsDraft = !!purchase.is_draft;
                setEditingSaleStockFromPurchase(purchase);
                setFormMode(purchase.is_draft ? "draft" : "edit");
                return Promise.all([
                    loadProducts({
                        includeAll: purchase.is_draft,
                        includeProductIds: getIncludedEditProductIds()
                    }),
                    loadTaxes(),
                    purchase.is_draft ? loadInvoiceSettings("") : Promise.resolve()
                ]).then(function () {
                    populateForm(purchase);
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
                viewingPurchaseId = purchase.id;
                viewingPurchase = purchase;
                var titleEl = document.getElementById("purchase-view-title");
                if (titleEl) {
                    titleEl.textContent = purchase.customer_name || "Sale Details";
                }
                renderViewDetails(purchase);
                updateViewPanelActions(purchase);
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
        var invoiceStatusFilterEl = document.getElementById("purchases-invoice-status-filter");
        var dateFromEl = document.getElementById("purchases-date-from");
        var dateToEl = document.getElementById("purchases-date-to");
        if (searchEl && searchEl.value.trim()) {
            params.set("search", searchEl.value.trim());
        }
        if (invoiceStatusFilterEl && invoiceStatusFilterEl.value) {
            params.set("invoice_status", invoiceStatusFilterEl.value);
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
        var invoiceStatusFilterEl = document.getElementById("purchases-invoice-status-filter");
        var dateFromEl = document.getElementById("purchases-date-from");
        var dateToEl = document.getElementById("purchases-date-to");
        if (searchEl) searchEl.value = "";
        if (invoiceStatusFilterEl) invoiceStatusFilterEl.value = "";
        if (dateFromEl) dateFromEl.value = "";
        if (dateToEl) dateToEl.value = "";
        loadPurchases(1);
    }

    function applyFiltersFromUrl() {
        var params = new URLSearchParams(window.location.search);
        var invoiceStatus = params.get("invoice_status");
        if (!invoiceStatus) return;

        var normalized = invoiceStatus.toLowerCase();
        var allowed = { paid: true, pending: true, draft: true, cancelled: true };
        if (!allowed[normalized]) return;

        var invoiceStatusFilterEl = document.getElementById("purchases-invoice-status-filter");
        if (invoiceStatusFilterEl) {
            invoiceStatusFilterEl.value = normalized;
        }
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
                InventoryToast.error("Enter an MRP price for " + product.name + ".");
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
                discount_type: getRowDiscountType(row),
                discount_value: getRowDiscountValue(row),
                distributor_discount_type: getRowDiscountType(row, ".inv-item-distributor-discount-type-toggle"),
                distributor_discount_value: getRowDiscountValue(row, ".inv-item-distributor-discount-value"),
                sale_tax_ids: getRowTaxRate(row) > 0
                    ? InventoryTaxSelect.getSelected(row.querySelector(".inv-item-sale-gst")).map(function (id) { return Number(id); })
                    : [],
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
        editingPurchaseIsDraft = false;
        editingSaleStockByProduct = {};
        setFormMode("add");
        loadInvoiceSettings("");
        loadCustomers("");
        document.getElementById("purchase-date").value = new Date().toISOString().slice(0, 10);
        applyCustomerAddressesFromSelection("", false);
        document.getElementById("purchase-payment-type").value = "";
        togglePaymentTypePanel(false);
        clearSalePrintMetaForm();
        var paidInput = document.getElementById("purchase-paid-amount");
        if (paidInput) {
            paidInput.value = "";
            paidInput.dataset.manual = "0";
        }
        setSalePaidToggle(false);
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

    function validateSaleItemsForSave() {
        var items = collectItems();
        if (!items || !items.length) {
            if (items !== null) {
                InventoryToast.error("Add at least one product the customer is purchasing.");
            }
            return null;
        }

        var rowCount = document.querySelectorAll("#purchase-items-container .inv-mgmt-item-row").length;
        if (items.length !== rowCount) {
            InventoryToast.error("Select an available product for each row.");
            return null;
        }
        return items;
    }

    function getUnpaidEditDueDatePayload() {
        var dueWrap = document.getElementById("purchase-due-date-wrap");
        if (!dueWrap || dueWrap.classList.contains("inv-hidden")) return {};
        var dueDateEl = document.getElementById("purchase-invoice-due-date");
        if (!dueDateEl || !dueDateEl.value.trim()) return null;
        return { due_date: dueDateEl.value.trim() };
    }

    function validatePaymentFieldsForFinalize() {
        var isPaid = isFullPaymentReceived();
        if (shouldShowDueDateField()) {
            var dueDateEl = document.getElementById("purchase-invoice-due-date");
            if (!dueDateEl || !dueDateEl.value.trim()) {
                InventoryToast.error("Please enter a due date until the full bill amount is received.");
                if (dueDateEl) dueDateEl.focus();
                return null;
            }
        }

        if (isPaidSegmentSelected()) {
            var paidAmount = getPaidAmountValue();
            if (paidAmount <= 0) {
                InventoryToast.error("Please enter the amount received.");
                var paidInput = document.getElementById("purchase-paid-amount");
                if (paidInput) paidInput.focus();
                return null;
            }
        }
        return isPaid;
    }

    function getSelectedInvoiceSettingId() {
        var invoiceSettingEl = document.getElementById("purchase-invoice-setting");
        if (!invoiceSettingEl || !invoiceSettingEl.value) return null;
        return Number(invoiceSettingEl.value);
    }

    function validateInvoiceSettingRequired() {
        var invoiceSettingEl = document.getElementById("purchase-invoice-setting");
        if (invoiceSettingEl && !invoiceSettingEl.closest(".inv-hidden")) {
            if (!invoiceSettingEl.value) {
                InventoryToast.error("Please select an invoice.");
                invoiceSettingEl.focus();
                return false;
            }
        }
        return true;
    }

    function validateSaleHeaderForCreate(requireInvoice) {
        if (requireInvoice !== false && !validateInvoiceSettingRequired()) {
            return false;
        }

        var customerId = document.getElementById("purchase-customer").value;
        if (!customerId) {
            InventoryToast.error("Please select a customer.");
            document.getElementById("purchase-customer").focus();
            return false;
        }
        return true;
    }

    function savePurchaseDraft() {
        if (!validateSaleHeaderForCreate(false)) return;

        var items = validateSaleItemsForSave();
        if (!items) return;

        var btn = document.getElementById("purchase-save-draft-btn");
        InventoryLoader.button(btn, true, "Saving...");

        request("", {
            method: "POST",
            body: Object.assign(getSaleHeaderPayload(false), readPaymentIntentFromForm(), {
                items: items,
                is_draft: true,
                is_paid: false
            })
        })
            .then(function (body) {
                if (body && body.isSuccess) {
                    if (body.data && body.data.id) {
                        saveSalePrintMeta(body.data.id, getSalePrintMetaFromForm());
                    }
                    InventoryToast.success(body.message || "Sale saved as draft.");
                    resetForm(true);
                    InventoryPagePanel.showList(PURCHASES_LIST_PANEL);
                    loadPurchases(1);
                } else {
                    var err = body.message || "Unable to save draft sale.";
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

    function readDueDateFromForm() {
        var dueDateEl = document.getElementById("purchase-invoice-due-date");
        if (!dueDateEl) return null;
        var dueDate = dueDateEl.value.trim();
        return dueDate || null;
    }

    function readPaymentIntentFromForm() {
        var isPaid = isFullPaymentReceived();
        var payload = {
            is_paid: !!isPaid,
            due_date: readDueDateFromForm()
        };
        if (isPaidSegmentSelected()) {
            var paidAmount = getPaidAmountValue();
            if (paidAmount > 0) payload.payment_amount = paidAmount;
        }
        return payload;
    }

    function saveDraftFinalizeMeta(purchaseId, paymentInfo) {
        var meta = loadSalePrintMeta(purchaseId) || {};
        if (paymentInfo && paymentInfo.is_paid) {
            meta.is_paid = true;
            meta.due_date = "";
        } else if (paymentInfo) {
            meta.is_paid = false;
            if (paymentInfo.due_date) meta.due_date = paymentInfo.due_date;
        }
        saveSalePrintMeta(purchaseId, meta);
    }

    function runDraftFinalize(purchaseId, paymentInfo, updatePayload) {
        function finalizeRequest() {
            saveDraftFinalizeMeta(purchaseId, paymentInfo);
            return request("/" + purchaseId + "/finalize/", {
                method: "POST",
                body: {
                    invoice_setting_id: paymentInfo.invoice_setting_id,
                    is_paid: !!paymentInfo.is_paid,
                    due_date: paymentInfo.is_paid ? null : (paymentInfo.due_date || null),
                    payment_amount: paymentInfo.payment_amount || null
                }
            });
        }

        if (updatePayload) {
            return request("/" + purchaseId + "/", {
                method: "PATCH",
                body: updatePayload
            }).then(function (body) {
                if (!body || !body.isSuccess) return body;
                return finalizeRequest();
            });
        }
        return finalizeRequest();
    }

    function finalizeDraftPurchase() {
        if (!editingPurchaseId || !editingPurchaseIsDraft) return;
        if (!validateSaleHeaderForCreate(true)) return;

        var items = validateSaleItemsForSave();
        if (!items) return;

        if (validatePaymentFieldsForFinalize() == null) return;

        var invoiceSettingId = getSelectedInvoiceSettingId();
        if (!invoiceSettingId) {
            InventoryToast.error("Please select an invoice before finalizing.");
            var invoiceSettingEl = document.getElementById("purchase-invoice-setting");
            if (invoiceSettingEl) invoiceSettingEl.focus();
            return;
        }

        var updatePayload = Object.assign(getSaleHeaderPayload(false), { items: items });
        var paymentInfo = readPaymentIntentFromForm();
        paymentInfo.invoice_setting_id = invoiceSettingId;
        if (paymentInfo.is_paid) {
            paymentInfo.due_date = null;
        }

        var finalizeBtn = document.getElementById("purchase-finalize-btn");
        var updateBtn = document.getElementById("purchase-save-btn");
        InventoryLoader.show();
        InventoryLoader.button(finalizeBtn, true, "Finalizing...");

        runDraftFinalize(editingPurchaseId, paymentInfo, updatePayload)
            .then(function (body) {
                if (body && body.isSuccess) {
                    InventoryToast.success(body.message || "Draft sale finalized.");
                    resetForm(true);
                    InventoryPagePanel.showList(PURCHASES_LIST_PANEL);
                    loadPurchases(currentPage);
                } else {
                    var err = (body && body.message) || "Unable to finalize draft sale.";
                    if (body && body.errors && body.errors.length) err = body.errors.join(" • ");
                    InventoryToast.error(err);
                }
            })
            .catch(function () {
                InventoryToast.error("Network error. Please try again.");
            })
            .finally(function () {
                InventoryLoader.hide();
                InventoryLoader.button(finalizeBtn, false);
                InventoryLoader.button(updateBtn, false);
            });
    }

    function savePurchase() {
        if (!validateSaleHeaderForCreate()) return;

        if (editingPurchaseId && editingPurchaseIsDraft) {
            var items = validateSaleItemsForSave();
            if (!items) return;

            var draftBtn = document.getElementById("purchase-save-btn");
            InventoryLoader.button(draftBtn, true, "Updating...");

            request("/" + editingPurchaseId + "/", {
                method: "PATCH",
                body: Object.assign(getSaleHeaderPayload(false), readPaymentIntentFromForm(), { items: items })
            })
                .then(function (body) {
                    if (body && body.isSuccess) {
                        saveSalePrintMeta(editingPurchaseId, getSalePrintMetaFromForm());
                        InventoryToast.success(body.message || "Draft sale updated successfully.");
                        resetForm(true);
                        InventoryPagePanel.showList(PURCHASES_LIST_PANEL);
                        loadPurchases(currentPage);
                    } else {
                        var err = body.message || "Unable to update draft sale.";
                        if (body.errors && body.errors.length) err = body.errors.join(" • ");
                        InventoryToast.error(err);
                    }
                })
                .catch(function () {
                    InventoryToast.error("Network error. Please try again.");
                })
                .finally(function () {
                    InventoryLoader.button(draftBtn, false);
                });
            return;
        }

        if (editingPurchaseId) {
            var duePayload = getUnpaidEditDueDatePayload();
            if (duePayload === null) {
                InventoryToast.error("Please enter a due date for unpaid sales.");
                var dueDateEl = document.getElementById("purchase-invoice-due-date");
                if (dueDateEl) dueDateEl.focus();
                return;
            }

            var btn = document.getElementById("purchase-save-btn");
            InventoryLoader.button(btn, true, "Updating...");
            request("/" + editingPurchaseId + "/", {
                method: "PATCH",
                body: Object.assign(getSaleHeaderPayload(false), duePayload)
            })
                .then(function (body) {
                    if (body && body.isSuccess) {
                        saveSalePrintMeta(editingPurchaseId, getSalePrintMetaFromForm());
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

        var items = validateSaleItemsForSave();
        if (!items) return;

        var isPaid = validatePaymentFieldsForFinalize();
        if (isPaid == null) return;

        var btn = document.getElementById("purchase-save-btn");
        InventoryLoader.button(btn, true, "Saving...");

        request("", {
            method: "POST",
            body: Object.assign(getSaleHeaderPayload(true), getPaymentPayloadForSave(isPaid), {
                items: items,
                is_draft: false
            })
        })
            .then(function (body) {
                if (body && body.isSuccess) {
                    if (body.data && body.data.id) {
                        saveSalePrintMeta(body.data.id, getSalePrintMetaFromForm());
                    }
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
            applyFiltersFromUrl();
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
        var draftBtn = document.getElementById("purchase-save-draft-btn");
        if (draftBtn) draftBtn.addEventListener("click", savePurchaseDraft);
        var finalizeBtn = document.getElementById("purchase-finalize-btn");
        if (finalizeBtn) finalizeBtn.addEventListener("click", finalizeDraftPurchase);
        wireSalePaidToggle();
        setSalePaidToggle(false);

        var searchEl = document.getElementById("purchases-search");
        var invoiceStatusFilterEl = document.getElementById("purchases-invoice-status-filter");
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
        if (invoiceStatusFilterEl) {
            invoiceStatusFilterEl.addEventListener("change", function () {
                loadPurchases(1);
            });
        }
        if (dateFromEl) dateFromEl.addEventListener("change", function () { loadPurchases(1); });
        if (dateToEl) dateToEl.addEventListener("change", function () { loadPurchases(1); });
        if (clearBtn) clearBtn.addEventListener("click", clearFilters);

        var paymentTypeAddBtn = document.getElementById("purchase-payment-type-add-btn");
        var paymentTypeSaveBtn = document.getElementById("purchase-payment-type-save-btn");
        var paymentTypeCancelBtn = document.getElementById("purchase-payment-type-cancel-btn");
        var customerAddBtn = document.getElementById("purchase-customer-add-btn");
        var invoiceAddBtn = document.getElementById("purchase-invoice-add-btn");
        var taxAddBtn = document.getElementById("purchase-tax-add-btn");

        if (customerAddBtn) {
            customerAddBtn.addEventListener("click", openAddCustomerModal);
        }
        if (invoiceAddBtn) {
            invoiceAddBtn.addEventListener("click", openAddInvoiceModal);
        }
        if (taxAddBtn) {
            taxAddBtn.addEventListener("click", openAddTaxModal);
        }

        window.addEventListener("inventory:customer-created", function (e) {
            var customer = e.detail && e.detail.customer;
            loadCustomers(customer && customer.id ? customer.id : "").then(function () {
                if (customer && customer.id) {
                    applyCustomerAddressesFromSelection(customer.id, false);
                }
            });
        });

        window.addEventListener("inventory:invoice-setting-created", function (e) {
            var invoiceSetting = e.detail && e.detail.invoiceSetting;
            loadInvoiceSettings(invoiceSetting && invoiceSetting.id ? invoiceSetting.id : "");
        });

        window.addEventListener("inventory:tax-created", function () {
            loadTaxes().then(function () {
                refreshAllRowTaxSelects();
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

        if (window.InventoryModal) {
            InventoryModal.wire("purchase-add-payment-modal");
            InventoryModal.wire("purchase-payment-history-modal");
            ["purchase-add-payment-modal", "purchase-payment-history-modal"].forEach(function (modalId) {
                var modal = document.getElementById(modalId);
                if (!modal || modal.dataset.paymentModalCloseWired === "1") return;
                modal.dataset.paymentModalCloseWired = "1";
                modal.addEventListener("click", function (e) {
                    if (
                        e.target.closest("[data-modal-close]") ||
                        e.target.classList.contains("inv-modal-backdrop")
                    ) {
                        if (window.InventorySearchableSelect) {
                            InventorySearchableSelect.closeAll();
                        }
                    }
                });
            });
        }

        var addPaymentSaveBtn = document.getElementById("purchase-add-payment-save-btn");
        if (addPaymentSaveBtn) addPaymentSaveBtn.addEventListener("click", submitAddPayment);

        var addPaymentAmountEl = document.getElementById("purchase-add-payment-amount");
        if (addPaymentAmountEl) {
            addPaymentAmountEl.addEventListener("input", function () {
                syncAddPaymentDueField(addPaymentPendingAmount);
            });
        }

        var addPaymentDateEl = document.getElementById("purchase-add-payment-date");
        if (addPaymentDateEl) {
            addPaymentDateEl.addEventListener("change", function () {
                syncAddPaymentNextDueMin();
                syncAddPaymentDueField(addPaymentPendingAmount);
            });
        }

        var viewAddPaymentBtn = document.getElementById("purchase-view-add-payment-btn");
        if (viewAddPaymentBtn) {
            viewAddPaymentBtn.addEventListener("click", function () {
                if (viewingPurchaseId) openAddPaymentModal(viewingPurchaseId);
            });
        }

        var viewPaymentHistoryBtn = document.getElementById("purchase-view-payment-history-btn");
        if (viewPaymentHistoryBtn) {
            viewPaymentHistoryBtn.addEventListener("click", function () {
                if (viewingPurchaseId) openPaymentHistoryModal(viewingPurchaseId);
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
                    return;
                }

                var addPaymentBtn = e.target.closest(".inv-purchase-add-payment");
                if (addPaymentBtn) {
                    openAddPaymentModal(addPaymentBtn.getAttribute("data-id"));
                    return;
                }

                var historyBtn = e.target.closest(".inv-purchase-invoice-history");
                if (historyBtn) {
                    openPaymentHistoryModal(historyBtn.getAttribute("data-id"));
                    return;
                }

                var cancelBtn = e.target.closest(".inv-purchase-mark-cancelled");
                if (cancelBtn) {
                    markPurchaseCancelled(cancelBtn.getAttribute("data-id"));
                }
            });
        }
    }

    return { init: init };
})();
