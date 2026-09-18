var InventoryProducts = (function () {
    "use strict";

    var API = "/api/products";
    var CATALOG_API = "/api/catalog";
    var TAXES_API = "/api/settings/taxes";
    var PAGE_SIZE = (window.InventoryConstants && InventoryConstants.PAGE_SIZE) || 10;
    var searchTimer = null;
    var currentPage = 1;
    var currentSearch = "";
    var currentOrdering = "-created_at";
    var editingId = null;
    var PRODUCTS_LIST_PANEL = "products-list-panel";
    var PRODUCTS_FORM_PANEL = "products-form-panel";
    var PRODUCTS_VIEW_PANEL = "products-view-panel";
    var units = [];
    var categories = [];
    var brands = [];
    var manufacturers = [];
    var taxes = [];
    var cachedItems = [];
    var bulkSelect = null;
    var columnCtrl = null;

    function getColumnCtrl() {
        if (!columnCtrl) {
            columnCtrl = InventoryColumnCustomize.create({
                tableKey: "products",
                theadSelector: ".inv-mgmt-table--products thead tr",
                toolbarSelector: "#products-list-panel .inv-mgmt-toolbar",
                includeBulkCheck: false,
                bulkHeaderHtml: '<th class="inv-col-check d-none"><input type="checkbox" class="inv-bulk-select-all" aria-label="Select all"/></th>',
                sortDefault: "-created_at",
                onSortChange: function (ordering) {
                    currentOrdering = ordering;
                    loadProducts(currentSearch, 1);
                },
                columns: [
                    { id: "name", label: "Name", locked: true, sortKey: "name", headerClass: "inv-col-name", cell: function (item) { return '<td class="inv-col-name">' + cellText(item.name) + "</td>"; } },
                    { id: "sku", label: "SKU", sortKey: "sku", headerClass: "inv-col-sku", cell: function (item) { return '<td class="inv-col-sku">' + cellText(item.sku) + "</td>"; } },
                    { id: "category", label: "Category", sortKey: "category", headerClass: "inv-col-category", cell: function (item) { return '<td class="inv-col-category">' + cellText(item.category_name) + "</td>"; } },
                    { id: "brand", label: "Brand", sortKey: "brand", headerClass: "inv-col-brand", cell: function (item) { return '<td class="inv-col-brand">' + cellText(item.brand_name) + "</td>"; } },
                    {
                        id: "price_with_tax",
                        label: "Cost Price with Tax (per product)",
                        cardLabel: "Cost Price\nwith Tax\n(per product)",
                        headerHtml: 'Cost Price<br/>with Tax<br/><span class="inv-th-sub">(per product)</span>',
                        sortKey: "purchase_price",
                        headerClass: "inv-col-price-with-tax inv-col-price-with-tax-hd inv-mgmt-cell--num",
                        cell: function (item) {
                            return '<td class="inv-col-price-with-tax inv-mgmt-cell--num">' + cellPriceWithTax(item) + "</td>";
                        }
                    },
                    { id: "qty", label: "Qty", headerClass: "inv-col-qty inv-mgmt-cell--num", cell: function (item) { return '<td class="inv-col-qty inv-mgmt-cell--num">' + cellQty(item.quantity) + "</td>"; } },
                    {
                        id: "opening_qty",
                        label: "Opening Qty (Added)",
                        headerClass: "inv-col-opening-hd",
                        headerHtml: 'Opening Qty<br/><span class="inv-th-sub">(Added)</span>',
                        cell: function (item) { return '<td class="inv-col-opening">' + cellOpeningQty(item) + "</td>"; }
                    },
                    { id: "unit", label: "Unit", sortKey: "unit", headerClass: "inv-col-unit", cell: function (item) { return '<td class="inv-col-unit">' + cellText(item.unit_short_name || item.unit_name) + "</td>"; } }
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

    function productHasSales(item) {
        return item.has_sales === true || Number(item.sold_quantity || 0) > 0;
    }

    function getBulkSelect() {
        if (!bulkSelect) {
            bulkSelect = InventoryBulkSelect.create({
                tbodyId: "products-table-body",
                tableSelector: ".inv-mgmt-table--products",
                entitySingular: "Product",
                entityPlural: "Products",
                onDelete: bulkDeleteProducts,
                onPdf: exportProductsPdf,
                onPrint: exportProductsPrint
            });
        }
        return bulkSelect;
    }

    function getSelectedItems(ids) {
        return cachedItems.filter(function (item) {
            return ids.indexOf(String(item.id)) !== -1;
        });
    }

    function exportProductsPdf(ids) {
        var items = getSelectedItems(ids);
        if (!items.length) return;
        InventoryDocumentExport.downloadTablePdf(
            "Products",
            ["Name", "SKU", "Category", "Brand", "Cost Price with Tax (per product)", "Qty", "Unit"],
            items.map(function (item) {
                return [
                    item.name || "",
                    item.sku || "",
                    item.category_name || "",
                    item.brand_name || "",
                    item.purchase_price || item.actual_price || "",
                    item.quantity || "",
                    item.unit_short_name || item.unit_name || ""
                ];
            }),
            "products.pdf"
        );
    }

    function exportProductsPrint(ids) {
        var items = getSelectedItems(ids);
        if (!items.length) return;
        var html = InventoryDocumentExport.buildTableHtml(
            "Products",
            ["Name", "SKU", "Category", "Brand", "Cost Price with Tax (per product)", "Qty", "Unit"],
            items.map(function (item) {
                return [
                    item.name || "",
                    item.sku || "",
                    item.category_name || "",
                    item.brand_name || "",
                    item.purchase_price || item.actual_price || "",
                    item.quantity || "",
                    item.unit_short_name || item.unit_name || ""
                ];
            })
        );
        InventoryDocumentExport.printHtml("Products", html);
    }

    function bulkDeleteProducts(ids) {
        var deletable = ids.filter(function (id) {
            var item = cachedItems.find(function (row) { return String(row.id) === String(id); });
            return item && !productHasSales(item);
        });

        if (!deletable.length) {
            InventoryToast.error("Selected products with sales cannot be deleted.");
            return;
        }

        if (deletable.length < ids.length) {
            InventoryToast.warning("Products with sales will be skipped.");
        }

        InventoryConfirm.delete({
            title: "Delete selected products?",
            message: deletable.length + " product(s) will be removed."
        }).then(function (confirmed) {
            if (!confirmed) return;

            InventoryLoader.show();
            var chain = Promise.resolve();
            var deleted = 0;
            var failed = 0;

            deletable.forEach(function (id) {
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
                if (deleted) InventoryToast.success(deleted + " product(s) deleted.");
                if (failed) InventoryToast.error(failed + " product(s) could not be deleted.");
                getBulkSelect().clearSelection();
                loadProducts(currentSearch, currentPage);
            });
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

    function taxRequest(path, opts) {
        return InventoryApi.request(TAXES_API, path, opts);
    }

    function taxLabel(item) {
        return item.key + " (" + item.value + "%)";
    }

    function formatTaxCell(item) {
        if (!item.tax_key) return "—";
        return InventoryApi.escapeHtml(item.tax_key + " (" + item.tax_value + "%)");
    }

    function getSelectedTaxRate() {
        var root = getProductTaxRoot();
        if (!root) return 0;
        return InventoryTaxSelect.getCombinedRate(taxes, InventoryTaxSelect.getSelected(root));
    }

    function getProductTaxRoot() {
        var wrap = document.getElementById("product-tax-select");
        return wrap ? wrap.querySelector(".inv-item-tax-select") : null;
    }

    function initProductTaxSelect(selectedIds) {
        var wrap = document.getElementById("product-tax-select");
        if (!wrap || !window.InventoryTaxSelect) return;

        if (!wrap.querySelector(".inv-item-tax-select")) {
            wrap.innerHTML = InventoryTaxSelect.html("inv-item-tax-select", "No Tax");
        }

        InventoryTaxSelect.init(wrap.querySelector(".inv-item-tax-select"), {
            taxes: taxes,
            selectedIds: selectedIds || [],
            placeholder: "No Tax",
            onChange: updateBuyPriceDisplay
        });
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

    function updateBuyPriceDisplay() {
        var buyEl = document.getElementById("product-purchase-price");
        if (!buyEl) return;
        var actualPrice = parsePrice("product-actual-price");
        buyEl.value = InventoryApi.formatMoney(computeBuyPrice(actualPrice, getSelectedTaxRate()));
    }

    function parseOpeningStock() {
        var el = document.getElementById("product-quantity");
        var raw = el ? el.value.trim() : "";
        if (raw === "") {
            return 0;
        }
        var num = parseFloat(raw);
        return isNaN(num) ? 0 : num;
    }

    function formatDate(value) {
        return InventoryApi.formatDisplayDate(value, "—");
    }

    function cellOpeningQty(item) {
        var qtyText = cellQty(item.opening_quantity != null ? item.opening_quantity : 0);
        var dateText = formatDate(item.opening_added_at || item.created_at);
        if (qtyText === "—" && dateText === "—") return "—";
        return (
            '<span class="inv-opening-qty">' + qtyText + "</span>" +
            ' <span class="inv-opening-date">(' + InventoryApi.escapeHtml(dateText) + ")</span>"
        );
    }

    function parseNumber(inputId) {
        var raw = document.getElementById(inputId).value;
        if (raw === "" || raw === null || raw === undefined) {
            return 0;
        }
        var num = parseFloat(raw);
        return isNaN(num) ? 0 : num;
    }

    function parsePrice(inputId) {
        return parseNumber(inputId);
    }

    function parseRequiredPrice(inputId, label) {
        var el = document.getElementById(inputId);
        var raw = el ? el.value.trim() : "";
        if (raw === "") {
            InventoryToast.error(label + " is required.");
            return null;
        }
        var num = parseFloat(raw);
        if (isNaN(num) || num < 0) {
            InventoryToast.error(label + " must be 0 or greater.");
            return null;
        }
        return num;
    }

    function formatQty(value) {
        var num = Number(value || 0);
        return Number.isInteger(num) ? String(num) : num.toFixed(2);
    }

    function isEmpty(value) {
        return value === null || value === undefined || String(value).trim() === "";
    }

    function cellText(value) {
        if (isEmpty(value)) return "—";
        return InventoryApi.escapeHtml(String(value));
    }

    function cellQty(value) {
        if (isEmpty(value)) return "—";
        return formatQty(value);
    }

    function cellMoney(value) {
        if (isEmpty(value)) return "—";
        return InventoryApi.formatMoney(value);
    }

    function cellPriceWithTax(item) {
        var price = item.purchase_price != null && Number(item.purchase_price) > 0
            ? item.purchase_price
            : item.actual_price;
        return cellMoney(price);
    }

    function displayValue(value) {
        if (isEmpty(value)) return "—";
        return InventoryApi.escapeHtml(String(value));
    }

    function actionButtons(item) {
        var hasSales = productHasSales(item);
        var html =
            '<button type="button" class="inv-row-action-btn inv-row-action-btn--view inv-product-view" data-id="' + item.id + '" title="View" aria-label="View product">' +
            '<span class="material-symbols-outlined">visibility</span></button>';

        if (!hasSales) {
            html +=
                '<button type="button" class="inv-row-action-btn inv-row-action-btn--edit inv-product-edit" data-id="' + item.id + '" title="Edit" aria-label="Edit product">' +
                '<span class="material-symbols-outlined">edit</span></button>' +
                '<button type="button" class="inv-row-action-btn inv-row-action-btn--delete inv-product-delete" data-id="' + item.id + '" title="Delete" aria-label="Delete product">' +
                '<span class="material-symbols-outlined">delete</span></button>';
        }

        return '<div class="inv-row-actions">' + html + "</div>";
    }

    function getProductFormRowsContainer() {
        return document.getElementById("product-form-rows");
    }

    function getProductFormRows() {
        var container = getProductFormRowsContainer();
        if (!container) return [];
        return Array.prototype.slice.call(container.querySelectorAll(".inv-product-form-row"));
    }

    function rowField(row, selector) {
        return row ? row.querySelector(selector) : null;
    }

    function rowFieldValue(row, selector) {
        var el = rowField(row, selector);
        return el ? el.value : "";
    }

    function removeExtraFormRows() {
        var rows = getProductFormRows();
        for (var i = rows.length - 1; i > 0; i--) {
            rows[i].remove();
        }
        ensureRowHeads();
    }

    function clearRowFields(row) {
        if (!row) return;
        var fields = [
            ".inv-product-field-name",
            ".inv-product-field-sku",
            ".inv-product-field-quantity",
            ".inv-product-field-price",
            ".inv-product-field-mrp",
            ".inv-product-field-description"
        ];
        fields.forEach(function (selector) {
            var el = rowField(row, selector);
            if (el) el.value = "";
        });
        ["category", "brand", "manufacturer", "unit"].forEach(function (key) {
            var el = rowField(row, ".inv-product-field-" + key);
            if (el) el.value = "";
        });
        refreshRowSelectDisplays(row);
    }

    function refreshRowSelectDisplays(row) {
        if (!window.InventorySearchableSelect || !row) return;
        row.querySelectorAll(
            ".inv-product-field-category, .inv-product-field-brand, .inv-product-field-manufacturer, .inv-product-field-unit"
        ).forEach(function (el) {
            InventorySearchableSelect.refresh(el);
        });
    }

    function fillRowSelects(row) {
        var categoryEl = rowField(row, ".inv-product-field-category");
        var brandEl = rowField(row, ".inv-product-field-brand");
        var manufacturerEl = rowField(row, ".inv-product-field-manufacturer");
        var unitEl = rowField(row, ".inv-product-field-unit");
        if (categoryEl) {
            fillSelect(categoryEl, categories, "Select category", function (item) { return item.name; });
        }
        if (brandEl) {
            fillSelect(brandEl, brands, "Select brand (optional)", function (item) { return item.name; });
        }
        if (manufacturerEl) {
            fillSelect(manufacturerEl, manufacturers, "Select manufacturer (optional)", function (item) { return item.name; });
        }
        if (unitEl) {
            fillSelect(unitEl, units, "Select unit", function (item) { return item.name + " (" + item.short_name + ")"; });
        }
    }

    function initRowSearchableSelects(row) {
        if (!window.InventorySearchableSelect || !row) return;
        InventorySearchableSelect.enhanceAll(row);
    }

    function getRowCatalogPanel(row, catalog) {
        if (!row) return null;
        return row.querySelector('.inv-product-row-catalog-panel[data-catalog="' + catalog + '"]');
    }

    function toggleRowCatalogPanel(row, catalog, show) {
        var panel = getRowCatalogPanel(row, catalog);
        if (!panel) return;
        if (show) {
            panel.classList.remove("inv-hidden");
            var nameInput = panel.querySelector('[data-field="name"]');
            if (nameInput) nameInput.focus();
        } else {
            panel.classList.add("inv-hidden");
            panel.querySelectorAll("input").forEach(function (input) {
                input.value = "";
            });
        }
    }

    function closeAllRowCatalogPanels() {
        getProductFormRows().forEach(function (row) {
            row.querySelectorAll(".inv-product-row-catalog-panel").forEach(function (panel) {
                panel.classList.add("inv-hidden");
                panel.querySelectorAll("input").forEach(function (input) {
                    input.value = "";
                });
            });
        });
    }

    function saveRowCatalogItem(row, catalog, btn) {
        var panel = getRowCatalogPanel(row, catalog);
        if (!panel) return;

        var nameEl = panel.querySelector('[data-field="name"]');
        var name = nameEl ? nameEl.value.trim() : "";
        if (!name) {
            var labelMap = {
                category: "Category name",
                brand: "Brand name",
                manufacturer: "Manufacturer name",
                unit: "Unit name"
            };
            InventoryToast.error((labelMap[catalog] || "Name") + " is required.");
            return;
        }

        var body = { name: name };
        var requestPath = "";
        var reloadFn = null;

        if (catalog === "category") {
            var descEl = panel.querySelector('[data-field="description"]');
            body.description = descEl ? descEl.value.trim() : "";
            requestPath = "categories";
            reloadFn = loadCategories;
        } else if (catalog === "brand") {
            requestPath = "brands";
            reloadFn = loadBrands;
        } else if (catalog === "manufacturer") {
            requestPath = "manufacturers";
            reloadFn = loadManufacturers;
        } else if (catalog === "unit") {
            var shortEl = panel.querySelector('[data-field="short_name"]');
            var shortName = shortEl ? shortEl.value.trim() : "";
            if (!shortName) {
                InventoryToast.error("Unit short name is required.");
                return;
            }
            body.short_name = shortName;
            requestPath = "units";
            reloadFn = loadUnits;
        } else {
            return;
        }

        InventoryLoader.button(btn, true, "Saving...");
        catalogRequest(requestPath, "", { method: "POST", body: body })
            .then(function (response) {
                if (response && response.isSuccess && response.data) {
                    var successMap = {
                        category: "Category added.",
                        brand: "Brand added.",
                        manufacturer: "Manufacturer added.",
                        unit: "Unit added."
                    };
                    InventoryToast.success(successMap[catalog] || "Saved.");
                    toggleRowCatalogPanel(row, catalog, false);
                    var selectedId = response.data.id;
                    return reloadFn(selectedId, row).then(function () {
                        refreshRowSelectDisplays(row);
                    });
                }
                var err = response.message || "Unable to save.";
                if (response.errors && response.errors.length) err = response.errors.join(" • ");
                InventoryToast.error(err);
            })
            .catch(function () {
                InventoryToast.error("Network error. Please try again.");
            })
            .finally(function () {
                InventoryLoader.button(btn, false);
            });
    }

    function ensureRowHeads() {
        var rows = getProductFormRows();
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
            label.textContent = "Product " + (idx + 1);
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

    function updateSaveButtonLabel() {
        var saveBtn = document.getElementById("product-save-btn");
        if (!saveBtn || editingId) return;
        var count = getProductFormRows().length;
        saveBtn.textContent = count > 1 ? "Save " + count + " Products" : "Save Product";
    }

    function toggleAddMoreButton(show) {
        var btn = document.getElementById("product-add-more-btn");
        if (btn) btn.classList.toggle("inv-hidden", !show);
    }

    function addProductFormRow() {
        if (editingId) return;
        var tpl = document.getElementById("product-form-row-template");
        var container = getProductFormRowsContainer();
        if (!tpl || !container) return;

        var rows = getProductFormRows();
        var clone = tpl.content.firstElementChild.cloneNode(true);
        clone.setAttribute("data-row-index", String(rows.length));
        container.appendChild(clone);
        fillRowSelects(clone);
        initRowSearchableSelects(clone);
        ensureRowHeads();
        updateSaveButtonLabel();

        fetchNextUniqueFormSku(clone).then(function (sku) {
            var skuEl = rowField(clone, ".inv-product-field-sku");
            if (skuEl && sku) skuEl.value = sku;
            var nameEl = rowField(clone, ".inv-product-field-name");
            if (nameEl) nameEl.focus();
        });
    }

    function removeProductFormRow(row) {
        if (editingId || !row) return;
        if (getProductFormRows().length <= 1) return;
        row.remove();
        getProductFormRows().forEach(function (r, idx) {
            r.setAttribute("data-row-index", String(idx));
        });
        renumberFormRowSkus();
        ensureRowHeads();
        updateSaveButtonLabel();
    }

    function parseOpeningStockFromRow(row) {
        var raw = rowFieldValue(row, ".inv-product-field-quantity").trim();
        if (raw === "") return 0;
        var num = parseFloat(raw);
        return isNaN(num) ? 0 : num;
    }

    function parsePriceFromRow(row, selector) {
        var raw = rowFieldValue(row, selector).trim();
        if (raw === "") return 0;
        var num = parseFloat(raw);
        return isNaN(num) ? 0 : num;
    }

    function collectPayloadFromRow(row, rowLabel) {
        var prefix = rowLabel ? " (Product " + rowLabel + ")" : "";
        var name = rowFieldValue(row, ".inv-product-field-name").trim();
        var unitId = rowFieldValue(row, ".inv-product-field-unit");
        var categoryId = rowFieldValue(row, ".inv-product-field-category");
        var sku = rowFieldValue(row, ".inv-product-field-sku").trim();

        if (!name) {
            InventoryToast.error("Product name is required" + prefix + ".");
            return { ok: false };
        }
        if (!unitId) {
            InventoryToast.error("Unit is required" + prefix + ".");
            return { ok: false };
        }
        if (!categoryId) {
            InventoryToast.error("Category is required" + prefix + ".");
            return { ok: false };
        }
        if (!sku) {
            InventoryToast.error("SKU is required" + prefix + ".");
            return { ok: false };
        }

        var openingStock = parseOpeningStockFromRow(row);
        if (openingStock < 0) {
            InventoryToast.error("Opening stock cannot be negative" + prefix + ".");
            return { ok: false };
        }

        var priceWithTax = parsePriceFromRow(row, ".inv-product-field-price");
        if (priceWithTax < 0) {
            InventoryToast.error("Cost price with tax (per product) must be 0 or greater" + prefix + ".");
            return { ok: false };
        }
        if (openingStock > 0) {
            var priceRaw = rowFieldValue(row, ".inv-product-field-price").trim();
            if (priceRaw === "") {
                InventoryToast.error("Cost price with tax (per product) is required" + prefix + ".");
                return { ok: false };
            }
            if (priceWithTax <= 0) {
                InventoryToast.error("Cost price with tax (per product) must be greater than 0 when opening stock is added" + prefix + ".");
                return { ok: false };
            }
        }
        priceWithTax = roundMoney(priceWithTax);

        var mrp = parsePriceFromRow(row, ".inv-product-field-mrp");
        if (mrp < 0) {
            InventoryToast.error("MRP must be 0 or greater" + prefix + ".");
            return { ok: false };
        }
        mrp = roundMoney(mrp);

        var brandId = rowFieldValue(row, ".inv-product-field-brand");
        var manufacturerId = rowFieldValue(row, ".inv-product-field-manufacturer");
        var payload = {
            name: name,
            sku: sku,
            unit_id: Number(unitId),
            category_id: Number(categoryId),
            description: rowFieldValue(row, ".inv-product-field-description").trim(),
            quantity: openingStock,
            actual_price: priceWithTax,
            tax_ids: [],
            mrp: mrp
        };
        if (brandId) payload.brand_id = Number(brandId);
        if (manufacturerId) payload.manufacturer_id = Number(manufacturerId);
        return { ok: true, payload: payload };
    }

    function saveProductsSequential(payloads, btn) {
        InventoryLoader.button(btn, true, "Saving...");
        var saved = [];
        var chain = Promise.resolve();

        payloads.forEach(function (payload, index) {
            chain = chain.then(function () {
                return request("", { method: "POST", body: payload }).then(function (body) {
                    if (body && body.isSuccess && body.data) {
                        saved.push(body.data);
                        return;
                    }
                    var err = body && body.message ? body.message : "Unable to save product.";
                    if (body && body.errors && body.errors.length) err = body.errors.join(" • ");
                    var rowNum = index + 1;
                    throw new Error(err + (payloads.length > 1 ? " (Product " + rowNum + ")" : ""));
                });
            });
        });

        chain
            .then(function () {
                var count = saved.length;
                InventoryToast.success(count === 1 ? "Product added successfully." : count + " products added successfully.");
                resetForm();
                hideProductFormPanel();
                if (document.getElementById("products-table-body")) {
                    loadProducts(currentSearch, 1);
                }
                saved.forEach(function (product) {
                    window.dispatchEvent(new CustomEvent("inventory:product-created", {
                        detail: { product: product }
                    }));
                });
            })
            .catch(function (err) {
                var msg = err && err.message ? err.message : "Network error. Please try again.";
                InventoryToast.error(msg);
                if (saved.length) {
                    loadProducts(currentSearch, 1);
                }
            })
            .finally(function () {
                InventoryLoader.button(btn, false);
                updateSaveButtonLabel();
            });
    }

    function fillSelect(selectOrId, items, placeholder, labelFn) {
        var select = typeof selectOrId === "string" ? document.getElementById(selectOrId) : selectOrId;
        if (!select) return;
        select.innerHTML = '<option value="">' + placeholder + "</option>";
        items.forEach(function (item) {
            var option = document.createElement("option");
            option.value = item.id;
            option.textContent = labelFn(item);
            select.appendChild(option);
        });
        if (window.InventorySearchableSelect) {
            InventorySearchableSelect.refresh(select);
        }
    }

    function renderCategorySelect(selectedId, targetRow) {
        getProductFormRows().forEach(function (row) {
            var select = rowField(row, ".inv-product-field-category");
            if (!select) return;
            var current = select.value;
            if (targetRow && row === targetRow && selectedId !== undefined && selectedId !== null) {
                current = String(selectedId);
            }
            fillSelect(select, categories, "Select category", function (item) {
                return item.name;
            });
            if (current) select.value = current;
        });
    }

    function toggleCategoryPanel(show) {
        var panel = document.getElementById("product-category-new-panel");
        if (!panel) return;
        if (show) {
            panel.classList.remove("inv-hidden");
            document.getElementById("product-category-new-name").focus();
        } else {
            panel.classList.add("inv-hidden");
            document.getElementById("product-category-new-name").value = "";
            document.getElementById("product-category-new-desc").value = "";
        }
    }

    function loadCategories(selectedId, targetRow) {
        return catalogRequest("categories", "?page_size=100").then(function (body) {
            categories = body && body.isSuccess ? (body.data.items || []) : [];
            renderCategorySelect(selectedId, targetRow);
            if (document.getElementById("products-category-filter")) {
                renderProductFilterSelects();
            }
            return categories;
        });
    }

    function saveNewCategory() {
        var name = document.getElementById("product-category-new-name").value.trim();
        if (!name) {
            InventoryToast.error("Category name is required.");
            return;
        }

        var btn = document.getElementById("product-category-save-btn");
        InventoryLoader.button(btn, true, "Saving...");

        catalogRequest("categories", "", {
            method: "POST",
            body: {
                name: name,
                description: document.getElementById("product-category-new-desc").value.trim()
            }
        })
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    InventoryToast.success("Category added.");
                    toggleCategoryPanel(false);
                    return loadCategories(body.data.id, getProductFormRows()[0] || null);
                }
                var err = body.message || "Unable to add category.";
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

    function renderBrandSelect(selectedId, targetRow) {
        getProductFormRows().forEach(function (row) {
            var select = rowField(row, ".inv-product-field-brand");
            if (!select) return;
            var current = select.value;
            if (targetRow && row === targetRow && selectedId !== undefined && selectedId !== null) {
                current = String(selectedId);
            }
            fillSelect(select, brands, "Select brand (optional)", function (item) {
                return item.name;
            });
            if (current) select.value = current;
        });
    }

    function toggleBrandPanel(show) {
        var panel = document.getElementById("product-brand-new-panel");
        if (!panel) return;
        if (show) {
            panel.classList.remove("inv-hidden");
            document.getElementById("product-brand-new-name").focus();
        } else {
            panel.classList.add("inv-hidden");
            document.getElementById("product-brand-new-name").value = "";
        }
    }

    function loadBrands(selectedId, targetRow) {
        return catalogRequest("brands", "?page_size=100").then(function (body) {
            brands = body && body.isSuccess ? (body.data.items || []) : [];
            renderBrandSelect(selectedId, targetRow);
            return brands;
        });
    }

    function saveNewBrand() {
        var name = document.getElementById("product-brand-new-name").value.trim();
        if (!name) {
            InventoryToast.error("Brand name is required.");
            return;
        }

        var btn = document.getElementById("product-brand-save-btn");
        InventoryLoader.button(btn, true, "Saving...");

        catalogRequest("brands", "", {
            method: "POST",
            body: { name: name }
        })
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    InventoryToast.success("Brand added.");
                    toggleBrandPanel(false);
                    return loadBrands(body.data.id, getProductFormRows()[0] || null);
                }
                var err = body.message || "Unable to add brand.";
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

    function renderManufacturerSelect(selectedId, targetRow) {
        getProductFormRows().forEach(function (row) {
            var select = rowField(row, ".inv-product-field-manufacturer");
            if (!select) return;
            var current = select.value;
            if (targetRow && row === targetRow && selectedId !== undefined && selectedId !== null) {
                current = String(selectedId);
            }
            fillSelect(select, manufacturers, "Select manufacturer (optional)", function (item) {
                return item.name;
            });
            if (current) select.value = current;
        });
    }

    function toggleManufacturerPanel(show) {
        var panel = document.getElementById("product-manufacturer-new-panel");
        if (!panel) return;
        if (show) {
            panel.classList.remove("inv-hidden");
            document.getElementById("product-manufacturer-new-name").focus();
        } else {
            panel.classList.add("inv-hidden");
            document.getElementById("product-manufacturer-new-name").value = "";
        }
    }

    function loadManufacturers(selectedId, targetRow) {
        return catalogRequest("manufacturers", "?page_size=100").then(function (body) {
            manufacturers = body && body.isSuccess ? (body.data.items || []) : [];
            renderManufacturerSelect(selectedId, targetRow);
            return manufacturers;
        });
    }

    function saveNewManufacturer() {
        var name = document.getElementById("product-manufacturer-new-name").value.trim();
        if (!name) {
            InventoryToast.error("Manufacturer name is required.");
            return;
        }

        var btn = document.getElementById("product-manufacturer-save-btn");
        InventoryLoader.button(btn, true, "Saving...");

        catalogRequest("manufacturers", "", {
            method: "POST",
            body: { name: name }
        })
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    InventoryToast.success("Manufacturer added.");
                    toggleManufacturerPanel(false);
                    return loadManufacturers(body.data.id, getProductFormRows()[0] || null);
                }
                var err = body.message || "Unable to add manufacturer.";
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

    function renderUnitSelect(selectedId, targetRow) {
        getProductFormRows().forEach(function (row) {
            var select = rowField(row, ".inv-product-field-unit");
            if (!select) return;
            var current = select.value;
            if (targetRow && row === targetRow && selectedId !== undefined && selectedId !== null) {
                current = String(selectedId);
            }
            fillSelect(select, units, "Select unit", function (item) {
                return item.name + " (" + item.short_name + ")";
            });
            if (current) select.value = current;
        });
    }

    function toggleUnitPanel(show) {
        var panel = document.getElementById("product-unit-new-panel");
        if (!panel) return;
        if (show) {
            panel.classList.remove("inv-hidden");
            document.getElementById("product-unit-new-name").focus();
        } else {
            panel.classList.add("inv-hidden");
            document.getElementById("product-unit-new-name").value = "";
            document.getElementById("product-unit-new-short").value = "";
        }
    }

    function loadUnits(selectedId, targetRow) {
        return catalogRequest("units", "?page_size=100").then(function (body) {
            units = body && body.isSuccess ? (body.data.items || []) : [];
            renderUnitSelect(selectedId, targetRow);
            if (document.getElementById("products-unit-filter")) {
                renderProductFilterSelects();
            }
            return units;
        });
    }

    function saveNewUnit() {
        var name = document.getElementById("product-unit-new-name").value.trim();
        var shortName = document.getElementById("product-unit-new-short").value.trim();
        if (!name) {
            InventoryToast.error("Unit name is required.");
            return;
        }
        if (!shortName) {
            InventoryToast.error("Unit short name is required.");
            return;
        }

        var btn = document.getElementById("product-unit-save-btn");
        InventoryLoader.button(btn, true, "Saving...");

        catalogRequest("units", "", {
            method: "POST",
            body: {
                name: name,
                short_name: shortName
            }
        })
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    InventoryToast.success("Unit added.");
                    toggleUnitPanel(false);
                    return loadUnits(body.data.id, getProductFormRows()[0] || null);
                }
                var err = body.message || "Unable to add unit.";
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

    function toggleTaxPanel(show) {
        var panel = document.getElementById("product-tax-new-panel");
        if (!panel) return;
        if (show) {
            panel.classList.remove("inv-hidden");
            document.getElementById("product-tax-new-key").focus();
        } else {
            panel.classList.add("inv-hidden");
            document.getElementById("product-tax-new-key").value = "";
            document.getElementById("product-tax-new-value").value = "";
        }
    }

    function loadTaxes(selectedIds) {
        return taxRequest("?page_size=100&ordering=key").then(function (body) {
            taxes = body && body.isSuccess ? (body.data.items || []) : [];
            var current = selectedIds;
            if (current === undefined || current === null) {
                current = InventoryTaxSelect.getSelected(getProductTaxRoot());
            } else if (!Array.isArray(current)) {
                current = [current];
            }
            initProductTaxSelect(current);
            return taxes;
        });
    }

    function saveNewTax() {
        var key = document.getElementById("product-tax-new-key").value.trim();
        var valueRaw = document.getElementById("product-tax-new-value").value.trim();
        if (!key) {
            InventoryToast.error("Tax key is required (e.g. gst12%).");
            return;
        }
        if (valueRaw === "") {
            InventoryToast.error("Tax value is required (e.g. 12).");
            return;
        }
        var value = parseFloat(valueRaw);
        if (Number.isNaN(value) || value < 0 || value > 100) {
            InventoryToast.error("Tax value must be between 0 and 100.");
            return;
        }

        var btn = document.getElementById("product-tax-save-btn");
        InventoryLoader.button(btn, true, "Saving...");

        taxRequest("", {
            method: "POST",
            body: { key: key, value: value }
        })
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    InventoryToast.success("Tax added.");
                    toggleTaxPanel(false);
                    return loadTaxes(body.data.id);
                }
                var err = body.message || "Unable to add tax.";
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

    function renderProductFilterSelects() {
        fillSelect("products-category-filter", categories, "All categories", function (item) {
            return item.name;
        });
        fillSelect("products-unit-filter", units, "All units", function (item) {
            return item.name + " (" + item.short_name + ")";
        });

        if (window.InventorySearchableSelect) {
            var categoryFilter = document.getElementById("products-category-filter");
            var unitFilter = document.getElementById("products-unit-filter");
            if (categoryFilter) InventorySearchableSelect.rebuild(categoryFilter);
            if (unitFilter) InventorySearchableSelect.rebuild(unitFilter);
        }
    }

    function loadCatalogOptions() {
        if (!InventoryBusiness.getActiveId()) {
            return Promise.resolve();
        }

        return Promise.all([
            loadUnits(),
            loadCategories(),
            loadBrands(),
            loadManufacturers(),
        ]).then(function () {
            renderProductFilterSelects();
        });
    }

    function renderRows(items) {
        var tbody = document.getElementById("products-table-body");
        if (!tbody) return;

        var cols = getColumnCtrl();
        var colspan = cols.getColspan();

        if (!items || !items.length) {
            tbody.innerHTML = '<tr><td colspan="' + colspan + '" class="inv-mgmt-empty">No products found.</td></tr>';
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

    function buildQuery(search, page) {
        var params = new URLSearchParams();
        params.set("page", String(page || 1));
        params.set("page_size", String(InventoryPagination.getPageSize("products-pagination")));
        if (search) params.set("search", search);
        if (currentOrdering) params.set("ordering", currentOrdering);

        var categoryFilter = document.getElementById("products-category-filter");
        var unitFilter = document.getElementById("products-unit-filter");
        if (categoryFilter && categoryFilter.value) {
            params.set("category_id", categoryFilter.value);
        }
        if (unitFilter && unitFilter.value) {
            params.set("unit_id", unitFilter.value);
        }

        return "?" + params.toString();
    }

    function clearProductFilters() {
        var searchEl = document.getElementById("products-search");
        var categoryFilter = document.getElementById("products-category-filter");
        var unitFilter = document.getElementById("products-unit-filter");
        if (searchEl) searchEl.value = "";
        if (categoryFilter) categoryFilter.value = "";
        if (unitFilter) unitFilter.value = "";
        if (window.InventorySearchableSelect) {
            if (categoryFilter) InventorySearchableSelect.refresh(categoryFilter);
            if (unitFilter) InventorySearchableSelect.refresh(unitFilter);
        }
        loadProducts("", 1);
    }

    function loadProducts(search, page) {
        currentSearch = search || "";
        currentPage = page || 1;
        InventoryLoader.show();

        return request(buildQuery(currentSearch, currentPage))
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    renderRows(body.data.items || []);
                    InventoryPagination.render("products-pagination", body.data.pagination, function (p) {
                        loadProducts(currentSearch, p);
                    }, {
                        onPageSizeChange: function () {
                            loadProducts(currentSearch, 1);
                        }
                    });
                } else {
                    renderRows([]);
                    InventoryPagination.render("products-pagination", null, function () {});
                    InventoryToast.error(body.message || "Failed to load products.");
                }
            })
            .catch(function () {
                renderRows([]);
                InventoryToast.error("Network error while loading products.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function setFormMode(mode) {
        var titleEl = document.getElementById("product-form-title") ||
            document.getElementById("product-modal-title");
        var saveBtn = document.getElementById("product-save-btn");

        if (mode === "edit") {
            if (titleEl) titleEl.textContent = "Edit Product";
            if (saveBtn) saveBtn.textContent = "Update Product";
            toggleAddMoreButton(false);
        } else {
            if (titleEl) titleEl.textContent = "Add Product";
            updateSaveButtonLabel();
            toggleAddMoreButton(!!document.getElementById("product-add-more-btn"));
        }
    }

    function showProductFormPanel() {
        if (document.getElementById(PRODUCTS_FORM_PANEL)) {
            InventoryPagePanel.showPanel(PRODUCTS_LIST_PANEL, PRODUCTS_FORM_PANEL);
            return;
        }
        if (document.getElementById("product-modal")) {
            InventoryModal.open("product-modal");
        }
    }

    function hideProductFormPanel() {
        if (document.getElementById(PRODUCTS_LIST_PANEL)) {
            InventoryPagePanel.showList(PRODUCTS_LIST_PANEL);
            return;
        }
        if (document.getElementById("product-modal")) {
            InventoryModal.close("product-modal");
        }
    }

    function showProductViewPanel() {
        if (document.getElementById(PRODUCTS_VIEW_PANEL)) {
            InventoryPagePanel.showPanel(PRODUCTS_LIST_PANEL, PRODUCTS_VIEW_PANEL);
        }
    }

    function clearMrpEditContext() {
        var field = document.getElementById("product-mrp-field");
        var hint = document.getElementById("product-mrp-hint");
        if (field) field.classList.remove("inv-mgmt-field--highlight");
        if (hint) {
            hint.textContent = "";
            hint.classList.add("inv-hidden");
        }
    }

    function applyMrpEditContext(options) {
        options = options || {};
        clearMrpEditContext();
        if (!options.highlightMrp) return;

        var field = document.getElementById("product-mrp-field");
        var hint = document.getElementById("product-mrp-hint");
        if (field) field.classList.add("inv-mgmt-field--highlight");
        if (hint && options.purchasePriceHint != null && options.purchasePriceHint !== "") {
            hint.textContent =
                "Cost Price with Tax (per product) on purchase: " +
                InventoryApi.formatMoney(options.purchasePriceHint);
            hint.classList.remove("inv-hidden");
        }
    }

    function resetForm() {
        editingId = null;
        clearMrpEditContext();
        removeExtraFormRows();
        setFormMode("add");
        var firstRow = getProductFormRows()[0];
        if (firstRow) clearRowFields(firstRow);
        toggleCategoryPanel(false);
        toggleBrandPanel(false);
        toggleManufacturerPanel(false);
        toggleUnitPanel(false);
        toggleTaxPanel(false);
        closeAllRowCatalogPanels();
        syncProductSelectDisplays();
        updateSaveButtonLabel();
    }

    function syncProductSelectDisplays() {
        getProductFormRows().forEach(refreshRowSelectDisplays);
    }

    function populateForm(product) {
        document.getElementById("product-name").value = product.name || "";
        document.getElementById("product-sku").value = product.sku || "";
        document.getElementById("product-category").value = product.category || "";
        document.getElementById("product-brand").value = product.brand || "";
        document.getElementById("product-manufacturer").value = product.manufacturer || "";
        document.getElementById("product-unit").value = product.unit || "";
        document.getElementById("product-quantity").value = product.quantity != null ? product.quantity : "";
        var priceWithTax = product.purchase_price != null && Number(product.purchase_price) > 0
            ? product.purchase_price
            : product.actual_price;
        document.getElementById("product-price-with-tax").value = priceWithTax != null ? priceWithTax : "";
        document.getElementById("product-mrp").value = product.mrp != null ? product.mrp : "";
        document.getElementById("product-description").value = product.description || "";
        syncProductSelectDisplays();
    }

    function renderViewDetails(product) {
        var container = document.getElementById("product-view-body");
        if (!container) return;

        var rows = [
            { label: "Product Name", value: displayValue(product.name), emphasis: true },
            { label: "SKU", value: displayValue(product.sku) },
            { label: "Barcode", value: displayValue(product.barcode) },
            { label: "Category", value: displayValue(product.category_name) },
            { label: "Brand", value: displayValue(product.brand_name) },
            { label: "Manufacturer", value: displayValue(product.manufacturer_name) },
            { label: "Cost Price with Tax (per product)", value: cellMoney(product.purchase_price || product.actual_price), num: true },
            { label: "MRP", value: cellMoney(product.mrp), num: true },
            { label: "Unit", value: displayValue(product.unit_short_name || product.unit_name) },
            { label: "Quantity", value: displayValue(formatQty(product.quantity)), num: true },
            { label: "Description", value: displayValue(product.description), full: true }
        ];

        container.innerHTML = InventoryApi.renderViewGrid(rows);
    }

    function fetchNextSku() {
        return request("/next-sku/").then(function (body) {
            if (body && body.isSuccess && body.data && body.data.sku) {
                return body.data.sku;
            }
            return "";
        }).catch(function () {
            return "";
        });
    }

    function parseSkuNumber(sku) {
        var match = /^SKU-(\d+)$/i.exec(String(sku || "").trim());
        return match ? parseInt(match[1], 10) : null;
    }

    function formatSkuNumber(num) {
        return "SKU-" + String(num).padStart(6, "0");
    }

    function getUsedFormSkus(excludeRow) {
        var used = {};
        getProductFormRows().forEach(function (row) {
            if (excludeRow && row === excludeRow) return;
            var sku = rowFieldValue(row, ".inv-product-field-sku").trim();
            if (sku) used[sku.toLowerCase()] = true;
        });
        return used;
    }

    function nextUniqueFormSku(baseSku, used) {
        var candidate = String(baseSku || "").trim();
        if (!candidate) return "";
        if (!used[candidate.toLowerCase()]) return candidate;

        var num = parseSkuNumber(candidate);
        if (num == null) return candidate;

        do {
            num += 1;
            candidate = formatSkuNumber(num);
        } while (used[candidate.toLowerCase()]);
        return candidate;
    }

    function fetchNextUniqueFormSku(excludeRow) {
        var used = getUsedFormSkus(excludeRow);
        return fetchNextSku().then(function (sku) {
            return nextUniqueFormSku(sku, used);
        });
    }

    function renumberFormRowSkus() {
        var rows = getProductFormRows();
        if (!rows.length) return Promise.resolve();

        var firstSkuEl = rowField(rows[0], ".inv-product-field-sku");
        var baseNum = parseSkuNumber(firstSkuEl ? firstSkuEl.value : "");

        function applyFromBase(startNum) {
            rows.forEach(function (row, idx) {
                var skuEl = rowField(row, ".inv-product-field-sku");
                if (skuEl) skuEl.value = formatSkuNumber(startNum + idx);
            });
        }

        if (baseNum != null) {
            applyFromBase(baseNum);
            return Promise.resolve();
        }

        return fetchNextSku().then(function (sku) {
            var num = parseSkuNumber(sku);
            if (num == null) return;
            applyFromBase(num);
        });
    }

    function fetchProduct(id) {
        return request("/" + id + "/").then(function (body) {
            if (body && body.isSuccess && body.data) {
                return body.data;
            }
            InventoryToast.error(body.message || "Failed to load product.");
            return null;
        });
    }

    function openAddModal() {
        if (!InventoryBusiness.getActiveId()) {
            InventoryToast.error("Select or create a business first.");
            return;
        }
            loadCatalogOptions().then(function () {
                resetForm();
                return fetchNextSku();
            }).then(function (sku) {
                if (sku) {
                    document.getElementById("product-sku").value = sku;
                }
                showProductFormPanel();
                document.getElementById("product-name").focus();
            });
    }

    function openViewModal(id) {
        InventoryLoader.show();
        fetchProduct(id)
            .then(function (product) {
                if (!product) return;
                var viewTitle = document.getElementById("product-view-title") ||
                    document.getElementById("product-view-modal-title");
                if (viewTitle) viewTitle.textContent = product.name || "Product Details";
                renderViewDetails(product);
                showProductViewPanel();
            })
            .catch(function () {
                InventoryToast.error("Network error while loading product.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function openEditModal(id, options) {
        options = options || {};
        InventoryLoader.show();
        loadCatalogOptions()
            .then(function () {
                return fetchProduct(id);
            })
            .then(function (product) {
                if (!product) return;
                editingId = product.id;
                removeExtraFormRows();
                setFormMode("edit");
                populateForm(product);
                applyMrpEditContext(options);
            })
            .then(function () {
                showProductFormPanel();
                var focusEl = options.highlightMrp
                    ? document.getElementById("product-mrp")
                    : document.getElementById("product-name");
                if (focusEl) focusEl.focus();
            })
            .catch(function () {
                InventoryToast.error("Network error while loading product.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function saveProduct() {
        var btn = document.getElementById("product-save-btn");
        var rows = getProductFormRows();
        var firstRow = rows[0];

        if (editingId) {
            if (!firstRow) return;
            var editResult = collectPayloadFromRow(firstRow, null);
            if (!editResult.ok) return;

            var editPayload = editResult.payload;
            if (!editPayload.category_id) {
                InventoryToast.error("Category is required.");
                return;
            }

            InventoryLoader.button(btn, true, "Updating...");
            request("/" + editingId + "/", {
                method: "PATCH",
                body: editPayload
            })
                .then(function (body) {
                    if (body && body.isSuccess) {
                        var savedProduct = body.data;
                        InventoryToast.success("Product updated successfully.");
                        resetForm();
                        hideProductFormPanel();
                        if (document.getElementById("products-table-body")) {
                            loadProducts(currentSearch, currentPage);
                        }
                        if (savedProduct) {
                            window.dispatchEvent(new CustomEvent("inventory:product-updated", {
                                detail: { product: savedProduct }
                            }));
                        }
                    } else {
                        var err = body.message || "Unable to save product.";
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
        var seenSkus = {};
        for (var i = 0; i < rows.length; i++) {
            var rowLabel = rows.length > 1 ? String(i + 1) : null;
            var result = collectPayloadFromRow(rows[i], rowLabel);
            if (!result.ok) return;

            var skuKey = result.payload.sku.toLowerCase();
            if (seenSkus[skuKey]) {
                InventoryToast.error("Duplicate SKU in Product " + seenSkus[skuKey] + " and Product " + (i + 1) + ".");
                return;
            }
            seenSkus[skuKey] = i + 1;
            payloads.push(result.payload);
        }

        if (payloads.length === 1) {
            var singlePayload = payloads[0];
            InventoryLoader.button(btn, true, "Saving...");
            request("", { method: "POST", body: singlePayload })
                .then(function (body) {
                    if (body && body.isSuccess) {
                        var savedProduct = body.data;
                        InventoryToast.success("Product added successfully.");
                        resetForm();
                        hideProductFormPanel();
                        if (document.getElementById("products-table-body")) {
                            loadProducts(currentSearch, 1);
                        }
                        if (savedProduct) {
                            window.dispatchEvent(new CustomEvent("inventory:product-created", {
                                detail: { product: savedProduct }
                            }));
                        }
                    } else {
                        var singleErr = body.message || "Unable to save product.";
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

        saveProductsSequential(payloads, btn);
    }

    function deleteProduct(id, btn) {
        var item = cachedItems.find(function (row) {
            return String(row.id) === String(id);
        });
        if (item && productHasSales(item)) {
            InventoryToast.error("Products with sales cannot be deleted.");
            return;
        }

        InventoryConfirm.delete({
            title: "Delete product?",
            message: "This product will be removed from your catalog."
        }).then(function (confirmed) {
            if (!confirmed) return;
            InventoryLoader.button(btn, true, "");
            request("/" + id + "/", { method: "DELETE" })
                .then(function (body) {
                    if (body && body.isSuccess) {
                        InventoryToast.success("Product deleted.");
                        loadProducts(currentSearch, currentPage);
                    } else {
                        InventoryToast.error(body.message || "Unable to delete product.");
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

    function isProductsPage() {
        return !!document.getElementById("products-table-body");
    }

    function init() {
        var searchEl = document.getElementById("products-search");
        var saveBtn = document.getElementById("product-save-btn");
        var openBtn = document.getElementById("product-open-modal-btn");
        var tbody = document.getElementById("products-table-body");

        if (document.getElementById("product-modal")) {
            InventoryModal.wire("product-modal");
            document.getElementById("product-modal").addEventListener("click", function (e) {
                if (e.target.closest("[data-modal-close]")) {
                    clearMrpEditContext();
                }
            });
        }
        if (window.InventoryPagePanel) {
            InventoryPagePanel.init();
        }

        if (isProductsPage()) {
            getColumnCtrl();

            function boot() {
                if (!InventoryBusiness.getActiveId()) return;
                loadCatalogOptions().then(function () {
                    loadProducts("", 1);
                });
            }

            InventoryBusiness.whenReady(function () {
                boot();
                if (window.InventorySidebar && InventorySidebar.consumeAddAction()) {
                    openAddModal();
                }
            });
            window.addEventListener("inventory:business-changed", boot);
        }

        if (openBtn) {
            openBtn.addEventListener("click", openAddModal);
        }

        if (searchEl) {
            searchEl.addEventListener("input", function () {
                window.clearTimeout(searchTimer);
                searchTimer = window.setTimeout(function () {
                    loadProducts(searchEl.value.trim(), 1);
                }, 300);
            });
        }

        var categoryFilterEl = document.getElementById("products-category-filter");
        var unitFilterEl = document.getElementById("products-unit-filter");
        var clearFiltersBtn = document.getElementById("products-clear-filters");

        if (categoryFilterEl) {
            categoryFilterEl.addEventListener("change", function () {
                loadProducts(currentSearch, 1);
            });
        }
        if (unitFilterEl) {
            unitFilterEl.addEventListener("change", function () {
                loadProducts(currentSearch, 1);
            });
        }
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener("click", clearProductFilters);
        }

        if (saveBtn) saveBtn.addEventListener("click", saveProduct);

        var addMoreBtn = document.getElementById("product-add-more-btn");
        if (addMoreBtn) {
            addMoreBtn.addEventListener("click", addProductFormRow);
        }

        var formRowsContainer = getProductFormRowsContainer();
        if (formRowsContainer) {
            formRowsContainer.addEventListener("click", function (e) {
                var removeBtn = e.target.closest(".inv-product-row-remove");
                if (removeBtn) {
                    var removeRow = removeBtn.closest(".inv-product-form-row");
                    if (removeRow) removeProductFormRow(removeRow);
                    return;
                }

                var catalogAddBtn = e.target.closest(".inv-product-row-catalog-add");
                if (catalogAddBtn) {
                    var addRow = catalogAddBtn.closest(".inv-product-form-row");
                    var addCatalog = catalogAddBtn.getAttribute("data-catalog");
                    if (addRow && addCatalog) {
                        var panel = getRowCatalogPanel(addRow, addCatalog);
                        toggleRowCatalogPanel(addRow, addCatalog, panel && panel.classList.contains("inv-hidden"));
                    }
                    return;
                }

                var catalogSaveBtn = e.target.closest(".inv-product-row-catalog-save");
                if (catalogSaveBtn) {
                    var saveRow = catalogSaveBtn.closest(".inv-product-form-row");
                    var saveCatalog = catalogSaveBtn.getAttribute("data-catalog");
                    if (saveRow && saveCatalog) saveRowCatalogItem(saveRow, saveCatalog, catalogSaveBtn);
                    return;
                }

                var catalogCancelBtn = e.target.closest(".inv-product-row-catalog-cancel");
                if (catalogCancelBtn) {
                    var cancelRow = catalogCancelBtn.closest(".inv-product-form-row");
                    var cancelCatalog = catalogCancelBtn.getAttribute("data-catalog");
                    if (cancelRow && cancelCatalog) toggleRowCatalogPanel(cancelRow, cancelCatalog, false);
                }
            });
        }

        var categoryAddBtn = document.getElementById("product-category-add-btn");
        var categorySaveBtn = document.getElementById("product-category-save-btn");
        var categoryCancelBtn = document.getElementById("product-category-cancel-btn");

        if (categoryAddBtn) {
            categoryAddBtn.addEventListener("click", function () {
                var panel = document.getElementById("product-category-new-panel");
                toggleCategoryPanel(panel.classList.contains("inv-hidden"));
            });
        }
        if (categorySaveBtn) categorySaveBtn.addEventListener("click", saveNewCategory);
        if (categoryCancelBtn) categoryCancelBtn.addEventListener("click", function () {
            toggleCategoryPanel(false);
        });

        var brandAddBtn = document.getElementById("product-brand-add-btn");
        var brandSaveBtn = document.getElementById("product-brand-save-btn");
        var brandCancelBtn = document.getElementById("product-brand-cancel-btn");

        if (brandAddBtn) {
            brandAddBtn.addEventListener("click", function () {
                var panel = document.getElementById("product-brand-new-panel");
                toggleBrandPanel(panel.classList.contains("inv-hidden"));
            });
        }
        if (brandSaveBtn) brandSaveBtn.addEventListener("click", saveNewBrand);
        if (brandCancelBtn) brandCancelBtn.addEventListener("click", function () {
            toggleBrandPanel(false);
        });

        var manufacturerAddBtn = document.getElementById("product-manufacturer-add-btn");
        var manufacturerSaveBtn = document.getElementById("product-manufacturer-save-btn");
        var manufacturerCancelBtn = document.getElementById("product-manufacturer-cancel-btn");

        if (manufacturerAddBtn) {
            manufacturerAddBtn.addEventListener("click", function () {
                var panel = document.getElementById("product-manufacturer-new-panel");
                toggleManufacturerPanel(panel.classList.contains("inv-hidden"));
            });
        }
        if (manufacturerSaveBtn) manufacturerSaveBtn.addEventListener("click", saveNewManufacturer);
        if (manufacturerCancelBtn) manufacturerCancelBtn.addEventListener("click", function () {
            toggleManufacturerPanel(false);
        });

        var unitAddBtn = document.getElementById("product-unit-add-btn");
        var unitSaveBtn = document.getElementById("product-unit-save-btn");
        var unitCancelBtn = document.getElementById("product-unit-cancel-btn");

        if (unitAddBtn) {
            unitAddBtn.addEventListener("click", function () {
                var panel = document.getElementById("product-unit-new-panel");
                toggleUnitPanel(panel.classList.contains("inv-hidden"));
            });
        }
        if (unitSaveBtn) unitSaveBtn.addEventListener("click", saveNewUnit);
        if (unitCancelBtn) unitCancelBtn.addEventListener("click", function () {
            toggleUnitPanel(false);
        });

        if (tbody) {
            tbody.addEventListener("click", function (e) {
                var viewBtn = e.target.closest(".inv-product-view");
                if (viewBtn) {
                    openViewModal(viewBtn.getAttribute("data-id"));
                    return;
                }
                var editBtn = e.target.closest(".inv-product-edit");
                if (editBtn) {
                    openEditModal(editBtn.getAttribute("data-id"));
                    return;
                }
                var deleteBtn = e.target.closest(".inv-product-delete");
                if (deleteBtn) {
                    deleteProduct(deleteBtn.getAttribute("data-id"), deleteBtn);
                }
            });
        }
    }

    return {
        init: init,
        loadProducts: loadProducts,
        openAddModal: openAddModal,
        openEditModal: openEditModal
    };
})();
