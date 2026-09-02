var InventoryProducts = (function () {
    "use strict";

    var API = "/api/products";
    var CATALOG_API = "/api/catalog";
    var TAXES_API = "/api/settings/taxes";
    var PAGE_SIZE = (window.InventoryConstants && InventoryConstants.PAGE_SIZE) || 10;
    var searchTimer = null;
    var currentPage = 1;
    var currentSearch = "";
    var currentOrdering = "name";
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
                sortDefault: "name",
                onSortChange: function (ordering) {
                    currentOrdering = ordering;
                    loadProducts(currentSearch, 1);
                },
                columns: [
                    { id: "name", label: "Name", locked: true, sortKey: "name", headerClass: "inv-col-name", cell: function (item) { return '<td class="inv-col-name">' + cellText(item.name) + "</td>"; } },
                    { id: "sku", label: "SKU", sortKey: "sku", headerClass: "inv-col-sku", cell: function (item) { return '<td class="inv-col-sku">' + cellText(item.sku) + "</td>"; } },
                    { id: "category", label: "Category", sortKey: "category", headerClass: "inv-col-category", cell: function (item) { return '<td class="inv-col-category">' + cellText(item.category_name) + "</td>"; } },
                    { id: "brand", label: "Brand", sortKey: "brand", headerClass: "inv-col-brand", cell: function (item) { return '<td class="inv-col-brand">' + cellText(item.brand_name) + "</td>"; } },
                    { id: "actual_price", label: "Actual Price", sortKey: "actual_price", headerClass: "inv-col-actual inv-mgmt-cell--num", cell: function (item) { return '<td class="inv-col-actual inv-mgmt-cell--num">' + cellMoney(item.actual_price) + "</td>"; } },
                    { id: "gst", label: "Tax", sortKey: "tax", headerClass: "inv-col-gst", cell: function (item) { return '<td class="inv-col-gst">' + formatTaxCell(item) + "</td>"; } },
                    { id: "buy_price", label: "Buy Price", sortKey: "purchase_price", headerClass: "inv-col-buy inv-mgmt-cell--num", cell: function (item) { return '<td class="inv-col-buy inv-mgmt-cell--num">' + cellMoney(item.purchase_price) + "</td>"; } },
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
            ["Name", "SKU", "Category", "Brand", "Actual Price", "Tax", "Buy Price", "Qty", "Unit"],
            items.map(function (item) {
                return [
                    item.name || "",
                    item.sku || "",
                    item.category_name || "",
                    item.brand_name || "",
                    item.actual_price || "",
                    item.tax_key ? item.tax_key + " (" + item.tax_value + "%)" : "",
                    item.purchase_price || "",
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
            ["Name", "SKU", "Category", "Brand", "Actual Price", "Tax", "Buy Price", "Qty", "Unit"],
            items.map(function (item) {
                return [
                    item.name || "",
                    item.sku || "",
                    item.category_name || "",
                    item.brand_name || "",
                    item.actual_price || "",
                    item.tax_key ? item.tax_key + " (" + item.tax_value + "%)" : "",
                    item.purchase_price || "",
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
        var select = document.getElementById("product-tax");
        if (!select || !select.value) return 0;
        var tax = taxes.find(function (entry) {
            return String(entry.id) === String(select.value);
        });
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
        if (isEmpty(value)) return "—";
        var d = new Date(value);
        if (isNaN(d.getTime())) return "—";
        return d.toLocaleDateString(undefined, {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    }

    function cellOpeningQty(item) {
        var qtyText = cellQty(item.opening_quantity != null ? item.opening_quantity : 0);
        var dateText = formatDate(item.created_at);
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

    function fillSelect(selectId, items, placeholder, labelFn) {
        var select = document.getElementById(selectId);
        if (!select) return;
        select.innerHTML = '<option value="">' + placeholder + "</option>";
        items.forEach(function (item) {
            var option = document.createElement("option");
            option.value = item.id;
            option.textContent = labelFn(item);
            select.appendChild(option);
        });
    }

    function renderCategorySelect(selectedId) {
        var select = document.getElementById("product-category");
        if (!select) return;
        var current = selectedId !== undefined && selectedId !== null
            ? String(selectedId)
            : select.value;
        fillSelect("product-category", categories, "Select category", function (item) {
            return item.name;
        });
        if (current) select.value = current;
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

    function loadCategories(selectedId) {
        return catalogRequest("categories", "?page_size=100").then(function (body) {
            categories = body && body.isSuccess ? (body.data.items || []) : [];
            renderCategorySelect(selectedId);
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
                    return loadCategories(body.data.id);
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

    function renderBrandSelect(selectedId) {
        var select = document.getElementById("product-brand");
        if (!select) return;
        var current = selectedId !== undefined && selectedId !== null
            ? String(selectedId)
            : select.value;
        fillSelect("product-brand", brands, "Select brand (optional)", function (item) {
            return item.name;
        });
        if (current) select.value = current;
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

    function loadBrands(selectedId) {
        return catalogRequest("brands", "?page_size=100").then(function (body) {
            brands = body && body.isSuccess ? (body.data.items || []) : [];
            renderBrandSelect(selectedId);
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
                    return loadBrands(body.data.id);
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

    function renderManufacturerSelect(selectedId) {
        var select = document.getElementById("product-manufacturer");
        if (!select) return;
        var current = selectedId !== undefined && selectedId !== null
            ? String(selectedId)
            : select.value;
        fillSelect("product-manufacturer", manufacturers, "Select manufacturer (optional)", function (item) {
            return item.name;
        });
        if (current) select.value = current;
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

    function loadManufacturers(selectedId) {
        return catalogRequest("manufacturers", "?page_size=100").then(function (body) {
            manufacturers = body && body.isSuccess ? (body.data.items || []) : [];
            renderManufacturerSelect(selectedId);
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
                    return loadManufacturers(body.data.id);
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

    function renderUnitSelect(selectedId) {
        var select = document.getElementById("product-unit");
        if (!select) return;
        var current = selectedId !== undefined && selectedId !== null
            ? String(selectedId)
            : select.value;
        fillSelect("product-unit", units, "Select unit", function (item) {
            return item.name + " (" + item.short_name + ")";
        });
        if (current) select.value = current;
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

    function loadUnits(selectedId) {
        return catalogRequest("units", "?page_size=100").then(function (body) {
            units = body && body.isSuccess ? (body.data.items || []) : [];
            renderUnitSelect(selectedId);
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
                    return loadUnits(body.data.id);
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

    function renderTaxSelect(selectedId) {
        var select = document.getElementById("product-tax");
        if (!select) return;
        var current = selectedId !== undefined && selectedId !== null
            ? String(selectedId)
            : select.value;
        fillSelect("product-tax", taxes, "Select Tax (optional)", taxLabel);
        if (current) select.value = current;
        updateBuyPriceDisplay();
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

    function loadTaxes(selectedId) {
        return taxRequest("?page_size=100&ordering=key").then(function (body) {
            taxes = body && body.isSuccess ? (body.data.items || []) : [];
            renderTaxSelect(selectedId);
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

    function loadCatalogOptions() {
        if (!InventoryBusiness.getActiveId()) {
            return Promise.resolve();
        }

        return Promise.all([
            loadUnits(),
            loadCategories(),
            loadBrands(),
            loadManufacturers(),
            loadTaxes(),
        ]);
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
        return "?" + params.toString();
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
        } else {
            if (titleEl) titleEl.textContent = "Add Product";
            if (saveBtn) saveBtn.textContent = "Save Product";
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

    function resetForm() {
        editingId = null;
        setFormMode("add");
        document.getElementById("product-name").value = "";
        document.getElementById("product-sku").value = "";
        document.getElementById("product-barcode").value = "";
        document.getElementById("product-category").value = "";
        document.getElementById("product-brand").value = "";
        document.getElementById("product-manufacturer").value = "";
        document.getElementById("product-unit").value = "";
        document.getElementById("product-quantity").value = "";
        document.getElementById("product-actual-price").value = "";
        document.getElementById("product-tax").value = "";
        document.getElementById("product-purchase-price").value = "";
        document.getElementById("product-description").value = "";
        updateBuyPriceDisplay();
        toggleCategoryPanel(false);
        toggleBrandPanel(false);
        toggleManufacturerPanel(false);
        toggleUnitPanel(false);
        toggleTaxPanel(false);
    }

    function populateForm(product) {
        document.getElementById("product-name").value = product.name || "";
        document.getElementById("product-sku").value = product.sku || "";
        document.getElementById("product-barcode").value = product.barcode || "";
        document.getElementById("product-category").value = product.category || "";
        document.getElementById("product-brand").value = product.brand || "";
        document.getElementById("product-manufacturer").value = product.manufacturer || "";
        document.getElementById("product-unit").value = product.unit || "";
        document.getElementById("product-quantity").value = product.quantity != null ? product.quantity : "";
        document.getElementById("product-actual-price").value = product.actual_price != null ? product.actual_price : "";
        document.getElementById("product-tax").value = product.tax || "";
        updateBuyPriceDisplay();
        document.getElementById("product-description").value = product.description || "";
    }

    function renderViewDetails(product) {
        var container = document.getElementById("product-view-body");
        if (!container) return;

        var rows = [
            { label: "Product Name", value: displayValue(product.name) },
            { label: "SKU", value: displayValue(product.sku) },
            { label: "Barcode", value: displayValue(product.barcode) },
            { label: "Category", value: displayValue(product.category_name) },
            { label: "Brand", value: displayValue(product.brand_name) },
            { label: "Manufacturer", value: displayValue(product.manufacturer_name) },
            { label: "Actual Price", value: cellMoney(product.actual_price) },
            { label: "Tax", value: product.tax_key ? displayValue(product.tax_key + " (" + product.tax_value + "%)") : "—" },
            { label: "Buy Price", value: cellMoney(product.purchase_price) },
            { label: "Sell Price", value: cellMoney(product.sale_price) },
            { label: "Unit", value: displayValue(product.unit_short_name || product.unit_name) },
            { label: "Quantity", value: displayValue(formatQty(product.quantity)) },
            { label: "Description", value: displayValue(product.description), full: true }
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
                fetchNextSku().then(function (sku) {
                    if (sku) {
                        document.getElementById("product-sku").value = sku;
                    }
                    showProductFormPanel();
                    document.getElementById("product-name").focus();
                });
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

    function openEditModal(id) {
        InventoryLoader.show();
        loadCatalogOptions()
            .then(function () {
                return fetchProduct(id);
            })
            .then(function (product) {
                if (!product) return;
                editingId = product.id;
                setFormMode("edit");
                populateForm(product);
                showProductFormPanel();
                document.getElementById("product-name").focus();
            })
            .catch(function () {
                InventoryToast.error("Network error while loading product.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function saveProduct() {
        var name = document.getElementById("product-name").value.trim();
        var unitId = document.getElementById("product-unit").value;
        var categoryId = document.getElementById("product-category").value;

        if (!name) {
            InventoryToast.error("Product name is required.");
            return;
        }
        if (!unitId) {
            InventoryToast.error("Unit is required.");
            return;
        }
        if (!editingId && !categoryId) {
            InventoryToast.error("Category is required.");
            return;
        }

        var sku = document.getElementById("product-sku").value.trim();
        if (!sku) {
            InventoryToast.error("SKU is required.");
            return;
        }

        var openingStock = parseOpeningStock();
        if (openingStock < 0) {
            InventoryToast.error("Opening stock cannot be negative.");
            return;
        }

        var actualPrice = parsePrice("product-actual-price");
        if (actualPrice < 0) {
            InventoryToast.error("Actual price must be 0 or greater.");
            return;
        }
        if (openingStock > 0) {
            var requiredActualPrice = parseRequiredPrice("product-actual-price", "Actual price");
            if (requiredActualPrice === null) return;
            if (requiredActualPrice <= 0) {
                InventoryToast.error("Actual price must be greater than 0 when opening stock is added.");
                return;
            }
            actualPrice = requiredActualPrice;
        }
        actualPrice = roundMoney(actualPrice);

        var brandId = document.getElementById("product-brand").value;
        var manufacturerId = document.getElementById("product-manufacturer").value;
        var taxId = document.getElementById("product-tax").value;
        var payload = {
            name: name,
            sku: sku,
            barcode: document.getElementById("product-barcode").value.trim(),
            unit_id: Number(unitId),
            description: document.getElementById("product-description").value.trim(),
            quantity: openingStock,
            actual_price: actualPrice
        };

        if (categoryId) payload.category_id = Number(categoryId);
        if (brandId) payload.brand_id = Number(brandId);
        if (manufacturerId) payload.manufacturer_id = Number(manufacturerId);
        if (taxId) {
            payload.tax_id = Number(taxId);
        } else if (editingId) {
            payload.tax_id = null;
        }

        var btn = document.getElementById("product-save-btn");
        InventoryLoader.button(btn, true, editingId ? "Updating..." : "Saving...");

        request(editingId ? "/" + editingId + "/" : "", {
            method: editingId ? "PATCH" : "POST",
            body: payload
        })
            .then(function (body) {
                if (body && body.isSuccess) {
                    var savedProduct = body.data;
                    InventoryToast.success(editingId ? "Product updated successfully." : "Product added successfully.");
                    resetForm();
                    hideProductFormPanel();
                    if (document.getElementById("products-table-body")) {
                        loadProducts(currentSearch, editingId ? currentPage : 1);
                    }
                    if (savedProduct && !editingId) {
                        window.dispatchEvent(new CustomEvent("inventory:product-created", {
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

    function init() {
        var searchEl = document.getElementById("products-search");
        var saveBtn = document.getElementById("product-save-btn");
        var openBtn = document.getElementById("product-open-modal-btn");
        var tbody = document.getElementById("products-table-body");

        if (document.getElementById("product-modal")) {
            InventoryModal.wire("product-modal");
        }
        if (window.InventoryPagePanel) {
            InventoryPagePanel.init();
        }

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

        if (saveBtn) saveBtn.addEventListener("click", saveProduct);

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

        var taxAddBtn = document.getElementById("product-tax-add-btn");
        var taxSaveBtn = document.getElementById("product-tax-save-btn");
        var taxCancelBtn = document.getElementById("product-tax-cancel-btn");

        if (taxAddBtn) {
            taxAddBtn.addEventListener("click", function () {
                var panel = document.getElementById("product-tax-new-panel");
                toggleTaxPanel(panel.classList.contains("inv-hidden"));
            });
        }
        if (taxSaveBtn) taxSaveBtn.addEventListener("click", saveNewTax);
        if (taxCancelBtn) taxCancelBtn.addEventListener("click", function () {
            toggleTaxPanel(false);
        });

        var actualPriceEl = document.getElementById("product-actual-price");
        var taxSelectEl = document.getElementById("product-tax");
        if (actualPriceEl) {
            actualPriceEl.addEventListener("input", updateBuyPriceDisplay);
        }
        if (taxSelectEl) {
            taxSelectEl.addEventListener("change", updateBuyPriceDisplay);
        }

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

    return { init: init, loadProducts: loadProducts, openAddModal: openAddModal };
})();
