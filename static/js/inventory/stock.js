var InventoryStock = (function () {
    "use strict";

    var SUMMARY_API = "/api/inventory";
    var BATCH_API = "/api/invoicing/batches";
    var CATALOG_API = "/api/catalog";
    var PAGE_SIZE = (window.InventoryConstants && InventoryConstants.PAGE_SIZE) || 10;
    var searchTimer = null;
    var batchSearchTimer = null;
    var currentPage = 1;
    var currentSearch = "";
    var batchPage = 1;
    var batchSearch = "";
    var units = [];
    var currentSummaryOrdering = "product__name";
    var currentBatchOrdering = "created_at";
    var activeTab = "summary";
    var LIST_PANEL = "inventory-list-panel";
    var VIEW_PANEL = "inventory-view-panel";
    var cachedSummaryItems = [];
    var cachedBatchItems = [];
    var summaryColumnCtrl = null;
    var batchColumnCtrl = null;

    function getSummaryColumnCtrl() {
        if (!summaryColumnCtrl) {
            summaryColumnCtrl = InventoryColumnCustomize.create({
                tableKey: "inventory-summary",
                theadSelector: ".inv-mgmt-table--inventory thead tr",
                toolbarSelector: "#inventory-summary-panel .inv-mgmt-toolbar",
                includeBulkCheck: false,
                sortDefault: "product__name",
                onSortChange: function (ordering) {
                    currentSummaryOrdering = ordering;
                    loadSummary(currentSearch, 1);
                },
                columns: [
                    {
                        id: "product",
                        label: "Product",
                        locked: true,
                        sortKey: "product__name",
                        headerClass: "inv-col-name",
                        cell: function (item) {
                            return '<td class="inv-col-name">' + InventoryApi.escapeHtml(item.product_name) + "</td>";
                        }
                    },
                    {
                        id: "sku",
                        label: "SKU",
                        sortKey: "product__sku",
                        headerClass: "inv-col-sku",
                        cell: function (item) {
                            return '<td class="inv-col-sku">' + InventoryApi.escapeHtml(item.product_sku || "—") + "</td>";
                        }
                    },
                    {
                        id: "unit",
                        label: "Unit",
                        sortKey: "product__unit__short_name",
                        headerClass: "inv-col-unit",
                        cell: function (item) {
                            return '<td class="inv-col-unit">' + InventoryApi.escapeHtml(item.product_unit || "pcs") + "</td>";
                        }
                    },
                    {
                        id: "qty",
                        label: "In Stock",
                        sortKey: "quantity",
                        headerClass: "inv-col-qty inv-mgmt-cell--num",
                        cell: function (item) {
                            return '<td class="inv-col-qty inv-mgmt-cell--num"><strong>' + InventoryApi.escapeHtml(item.quantity) + "</strong></td>";
                        }
                    }
                ],
                onApply: function () {
                    renderSummaryRows(cachedSummaryItems);
                }
            });
            summaryColumnCtrl.mount();
            summaryColumnCtrl.renderHeader();
        }
        return summaryColumnCtrl;
    }

    function getBatchColumnCtrl() {
        if (!batchColumnCtrl) {
            batchColumnCtrl = InventoryColumnCustomize.create({
                tableKey: "inventory-batches",
                theadSelector: ".inv-mgmt-table--batches thead tr",
                toolbarSelector: "#inventory-batches-panel .inv-mgmt-toolbar",
                includeBulkCheck: false,
                includeAction: false,
                sortDefault: "created_at",
                onSortChange: function (ordering) {
                    currentBatchOrdering = ordering;
                    loadBatches(batchSearch, 1);
                },
                columns: [
                    {
                        id: "fifo",
                        label: "FIFO #",
                        locked: true,
                        cell: function (item) {
                            return "<td><strong>" + (item._fifoIndex || "—") + "</strong></td>";
                        }
                    },
                    {
                        id: "product",
                        label: "Product",
                        locked: true,
                        sortKey: "product_name",
                        cell: function (item) {
                            return "<td>" + InventoryApi.escapeHtml(item.product_name) + "</td>";
                        }
                    },
                    {
                        id: "batch_no",
                        label: "Batch No.",
                        sortKey: "batch_number",
                        cell: function (item) {
                            return "<td><code>" + InventoryApi.escapeHtml(item.batch_number || "—") + "</code></td>";
                        }
                    },
                    {
                        id: "invoice",
                        label: "Purchase Invoice",
                        sortKey: "invoice_number",
                        cell: function (item) {
                            return "<td>" + InventoryApi.escapeHtml(item.invoice_number || "—") + "</td>";
                        }
                    },
                    {
                        id: "available",
                        label: "Available",
                        sortKey: "available_quantity",
                        headerClass: "inv-mgmt-cell--num",
                        cell: function (item) {
                            var avail = Number(item.available_quantity || 0);
                            var availClass = avail > 0 ? "inv-batch-available" : "inv-batch-empty";
                            return '<td class="inv-mgmt-cell--num ' + availClass + '"><strong>' +
                                InventoryApi.escapeHtml(item.available_quantity) + "</strong></td>";
                        }
                    },
                    {
                        id: "buy_price",
                        label: "Buy Price",
                        sortKey: "purchase_price",
                        headerClass: "inv-mgmt-cell--num",
                        cell: function (item) {
                            return '<td class="inv-mgmt-cell--num">' + InventoryApi.formatMoney(item.purchase_price) + "</td>";
                        }
                    },
                    {
                        id: "sell_price",
                        label: "Sell Price",
                        sortKey: "selling_price",
                        headerClass: "inv-mgmt-cell--num",
                        cell: function (item) {
                            var sell = Number(item.product_sale_price != null ? item.product_sale_price : item.selling_price || 0);
                            return '<td class="inv-mgmt-cell--num">' + InventoryApi.formatMoney(sell) + "</td>";
                        }
                    },
                    {
                        id: "expiry",
                        label: "Expiry",
                        sortKey: "expiry_date",
                        cell: function (item) {
                            return "<td>" + formatDate(item.expiry_date) + "</td>";
                        }
                    },
                    {
                        id: "received",
                        label: "Received",
                        sortKey: "created_at",
                        cell: function (item) {
                            return "<td>" + formatDate(String(item.created_at || "").slice(0, 10)) + "</td>";
                        }
                    }
                ],
                onApply: function () {
                    renderBatchRows(cachedBatchItems, batchPage, InventoryPagination.getPageSize("batch-pagination"));
                }
            });
            batchColumnCtrl.mount();
            batchColumnCtrl.renderHeader();
        }
        return batchColumnCtrl;
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

    function fillSelect(selectId, items, placeholder, labelFn) {
        var select = document.getElementById(selectId);
        if (!select) return;
        var current = select.value;
        select.innerHTML = '<option value="">' + placeholder + "</option>";
        items.forEach(function (item) {
            var option = document.createElement("option");
            option.value = item.id;
            option.textContent = labelFn(item);
            select.appendChild(option);
        });
        if (current) select.value = current;
    }

    function renderUnitFilterSelects() {
        fillSelect("inventory-unit-filter", units, "All units", function (item) {
            return item.name + " (" + item.short_name + ")";
        });
        fillSelect("batch-unit-filter", units, "All units", function (item) {
            return item.name + " (" + item.short_name + ")";
        });

        if (window.InventorySearchableSelect) {
            var summaryFilter = document.getElementById("inventory-unit-filter");
            var batchFilter = document.getElementById("batch-unit-filter");
            if (summaryFilter) InventorySearchableSelect.rebuild(summaryFilter);
            if (batchFilter) InventorySearchableSelect.rebuild(batchFilter);
        }
    }

    function loadUnits() {
        return catalogRequest("units", "?page_size=100").then(function (body) {
            units = body && body.isSuccess ? (body.data.items || []) : [];
            renderUnitFilterSelects();
            return units;
        });
    }

    function getSummaryUnitFilter() {
        var el = document.getElementById("inventory-unit-filter");
        return el && el.value ? el.value : "";
    }

    function getBatchUnitFilter() {
        var el = document.getElementById("batch-unit-filter");
        return el && el.value ? el.value : "";
    }

    function clearSummaryFilters() {
        var searchEl = document.getElementById("inventory-search");
        var unitFilter = document.getElementById("inventory-unit-filter");
        if (searchEl) searchEl.value = "";
        if (unitFilter) unitFilter.value = "";
        if (window.InventorySearchableSelect && unitFilter) {
            InventorySearchableSelect.refresh(unitFilter);
        }
        loadSummary("", 1);
    }

    function clearBatchFilters() {
        var searchEl = document.getElementById("batch-search");
        var unitFilter = document.getElementById("batch-unit-filter");
        var inStockEl = document.getElementById("batch-in-stock-only");
        if (searchEl) searchEl.value = "";
        if (unitFilter) unitFilter.value = "";
        if (inStockEl) inStockEl.checked = true;
        if (window.InventorySearchableSelect && unitFilter) {
            InventorySearchableSelect.refresh(unitFilter);
        }
        loadBatches("", 1);
    }

    function summaryRequest(path, opts) {
        return InventoryApi.request(SUMMARY_API, path, opts);
    }

    function batchRequest(path, opts) {
        return InventoryApi.request(BATCH_API, path, opts);
    }

    function formatDate(value) {
        return InventoryApi.escapeHtml(InventoryApi.formatDisplayDate(value, "—"));
    }

    function displayValue(value) {
        if (value === null || value === undefined || String(value).trim() === "") return "—";
        return InventoryApi.escapeHtml(String(value));
    }

    function actionButtons(item) {
        return (
            '<div class="inv-row-actions">' +
            '<button type="button" class="inv-row-action-btn inv-row-action-btn--view inv-stock-view" data-id="' + item.id + '" title="View" aria-label="View stock">' +
            '<span class="material-symbols-outlined">visibility</span></button>' +
            "</div>"
        );
    }

    function renderSummaryRows(items) {
        var tbody = document.getElementById("inventory-table-body");
        if (!tbody) return;

        var cols = getSummaryColumnCtrl();
        var colspan = cols.getColspan();

        if (!items || !items.length) {
            tbody.innerHTML = '<tr><td colspan="' + colspan + '" class="inv-mgmt-empty">No stock yet. Record a purchase to add inventory.</td></tr>';
            return;
        }

        cachedSummaryItems = items;

        tbody.innerHTML = items.map(function (item) {
            return (
                "<tr>" +
                cols.renderRowCells(item) +
                '<td class="inv-col-action inv-mgmt-cell--action">' + actionButtons(item) + "</td>" +
                "</tr>"
            );
        }).join("");
    }

    function fetchStock(id) {
        return summaryRequest("/" + id + "/").then(function (body) {
            if (body && body.isSuccess && body.data) {
                return body.data;
            }
            InventoryToast.error(body.message || "Failed to load stock details.");
            return null;
        });
    }

    function renderViewDetails(stock) {
        var container = document.getElementById("inventory-view-body");
        var purchasesWrap = document.getElementById("inventory-view-purchases-wrap");
        if (!container || !purchasesWrap) return;

        var rows = [
            { label: "Product", value: displayValue(stock.product_name), emphasis: true },
            { label: "SKU", value: displayValue(stock.product_sku) },
            { label: "Unit", value: displayValue(stock.product_unit || "pcs") },
            { label: "In Stock", value: displayValue(stock.quantity), num: true }
        ];

        container.innerHTML = InventoryApi.renderViewGrid(rows);

        var sources = stock.purchase_sources || [];
        if (!sources.length) {
            purchasesWrap.innerHTML =
                '<h4 class="inv-stockin-view-items-title">Purchase Sources</h4>' +
                '<p class="inv-mgmt-empty" style="padding:16px 0;">No purchase batches found for this product.</p>';
            return;
        }

        purchasesWrap.innerHTML =
            '<h4 class="inv-stockin-view-items-title">Purchase Sources</h4>' +
            '<div class="inv-mgmt-table-wrap">' +
            '<table class="inv-mgmt-table">' +
            "<thead><tr>" +
            "<th>Invoice No.</th><th>Purchase Date</th><th>Batch No.</th><th>Available Qty</th><th>Buy Price</th>" +
            "</tr></thead><tbody>" +
            sources.map(function (source) {
                return (
                    "<tr>" +
                    "<td><strong>" + displayValue(source.invoice_number) + "</strong></td>" +
                    "<td>" + formatDate(source.invoice_date) + "</td>" +
                    "<td><code>" + displayValue(source.batch_number || "—") + "</code></td>" +
                    "<td class=\"inv-mgmt-cell--num\"><strong>" + displayValue(source.available_quantity) + "</strong></td>" +
                    "<td class=\"inv-mgmt-cell--num\">" + InventoryApi.formatMoney(source.purchase_price) + "</td>" +
                    "</tr>"
                );
            }).join("") +
            "</tbody></table></div>";
    }

    function openViewStock(id) {
        InventoryLoader.show();
        fetchStock(id)
            .then(function (stock) {
                if (!stock) return;
                var titleEl = document.getElementById("inventory-view-title");
                if (titleEl) {
                    titleEl.textContent = stock.product_name || "Stock Details";
                }
                renderViewDetails(stock);
                InventoryPagePanel.showPanel(LIST_PANEL, VIEW_PANEL);
            })
            .catch(function () {
                InventoryToast.error("Network error while loading stock.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function renderBatchRows(items, page, pageSize) {
        var tbody = document.getElementById("batch-table-body");
        if (!tbody) return;

        var cols = getBatchColumnCtrl();
        var colspan = cols.getColspan();

        if (!items || !items.length) {
            tbody.innerHTML = '<tr><td colspan="' + colspan + '" class="inv-mgmt-empty">No batches yet. Step 1: Record a purchase invoice to add stock.</td></tr>';
            return;
        }

        cachedBatchItems = items;
        var offset = ((page || 1) - 1) * (pageSize || PAGE_SIZE);

        tbody.innerHTML = items.map(function (item, index) {
            item._fifoIndex = offset + index + 1;
            return "<tr>" + cols.renderRowCells(item) + "</tr>";
        }).join("");
    }

    function buildQuery(search, page, extra, containerId) {
        var params = new URLSearchParams();
        params.set("page", String(page || 1));
        params.set("page_size", String(InventoryPagination.getPageSize(containerId)));
        if (search) params.set("search", search);
        if (extra) {
            Object.keys(extra).forEach(function (key) {
                if (extra[key] !== undefined && extra[key] !== null && extra[key] !== "") {
                    params.set(key, extra[key]);
                }
            });
        }
        return "?" + params.toString();
    }

    function loadSummary(search, page) {
        currentSearch = search || "";
        currentPage = page || 1;
        InventoryLoader.show();

        return summaryRequest(buildQuery(currentSearch, currentPage, {
            ordering: currentSummaryOrdering,
            unit_id: getSummaryUnitFilter()
        }, "inventory-pagination"))
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    renderSummaryRows(body.data.items || []);
                    InventoryPagination.render("inventory-pagination", body.data.pagination, function (p) {
                        loadSummary(currentSearch, p);
                    }, {
                        onPageSizeChange: function () {
                            loadSummary(currentSearch, 1);
                        }
                    });
                } else {
                    renderSummaryRows([]);
                    InventoryPagination.render("inventory-pagination", null, function () {});
                    InventoryToast.error(body.message || "Failed to load inventory.");
                }
            })
            .catch(function () {
                renderSummaryRows([]);
                InventoryToast.error("Network error while loading inventory.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function loadBatches(search, page) {
        batchSearch = search || "";
        batchPage = page || 1;
        var inStockEl = document.getElementById("batch-in-stock-only");
        var extra = {
            ordering: currentBatchOrdering,
            unit_id: getBatchUnitFilter()
        };
        if (inStockEl && inStockEl.checked) {
            extra.in_stock = "true";
        }

        InventoryLoader.show();
        return batchRequest(buildQuery(batchSearch, batchPage, extra, "batch-pagination"))
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    renderBatchRows(body.data.items || [], batchPage, InventoryPagination.getPageSize("batch-pagination"));
                    InventoryPagination.render("batch-pagination", body.data.pagination, function (p) {
                        loadBatches(batchSearch, p);
                    }, {
                        onPageSizeChange: function () {
                            loadBatches(batchSearch, 1);
                        }
                    });
                } else {
                    renderBatchRows([]);
                    InventoryPagination.render("batch-pagination", null, function () {});
                    InventoryToast.error(body.message || "Failed to load batches.");
                }
            })
            .catch(function () {
                renderBatchRows([]);
                InventoryToast.error("Network error while loading batches.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function switchTab(tab) {
        activeTab = tab;
        var summaryPanel = document.getElementById("inventory-summary-panel");
        var batchPanel = document.getElementById("inventory-batches-panel");
        document.querySelectorAll(".inv-mgmt-tab").forEach(function (btn) {
            var isActive = btn.getAttribute("data-tab") === tab;
            btn.classList.toggle("inv-mgmt-tab--active", isActive);
            btn.setAttribute("aria-selected", isActive ? "true" : "false");
        });

        if (summaryPanel) summaryPanel.classList.toggle("inv-hidden", tab !== "summary");
        if (batchPanel) batchPanel.classList.toggle("inv-hidden", tab !== "batches");

        if (tab === "summary") {
            loadSummary(currentSearch, currentPage);
        } else {
            loadBatches(batchSearch, batchPage);
        }
    }

    function init() {
        getSummaryColumnCtrl();
        getBatchColumnCtrl();

        var searchEl = document.getElementById("inventory-search");
        var batchSearchEl = document.getElementById("batch-search");
        var inStockEl = document.getElementById("batch-in-stock-only");

        function boot() {
            if (!InventoryBusiness.getActiveId()) return;
            loadUnits().then(function () {
                switchTab(activeTab);
            });
        }

        InventoryBusiness.whenReady(boot);
        window.addEventListener("inventory:business-changed", function () {
            currentPage = 1;
            batchPage = 1;
            boot();
        });

        document.querySelectorAll(".inv-mgmt-tab").forEach(function (btn) {
            btn.addEventListener("click", function () {
                switchTab(btn.getAttribute("data-tab"));
            });
        });

        if (searchEl) {
            searchEl.addEventListener("input", function () {
                window.clearTimeout(searchTimer);
                searchTimer = window.setTimeout(function () {
                    loadSummary(searchEl.value.trim(), 1);
                }, 300);
            });
        }

        var unitFilterEl = document.getElementById("inventory-unit-filter");
        if (unitFilterEl) {
            unitFilterEl.addEventListener("change", function () {
                loadSummary(currentSearch, 1);
            });
        }

        var clearSummaryBtn = document.getElementById("inventory-clear-filters");
        if (clearSummaryBtn) {
            clearSummaryBtn.addEventListener("click", clearSummaryFilters);
        }

        if (batchSearchEl) {
            batchSearchEl.addEventListener("input", function () {
                window.clearTimeout(batchSearchTimer);
                batchSearchTimer = window.setTimeout(function () {
                    loadBatches(batchSearchEl.value.trim(), 1);
                }, 300);
            });
        }

        if (inStockEl) {
            inStockEl.addEventListener("change", function () {
                loadBatches(batchSearch, 1);
            });
        }

        var batchUnitFilterEl = document.getElementById("batch-unit-filter");
        if (batchUnitFilterEl) {
            batchUnitFilterEl.addEventListener("change", function () {
                loadBatches(batchSearch, 1);
            });
        }

        var clearBatchBtn = document.getElementById("batch-clear-filters");
        if (clearBatchBtn) {
            clearBatchBtn.addEventListener("click", clearBatchFilters);
        }

        var summaryBody = document.getElementById("inventory-table-body");
        if (summaryBody) {
            summaryBody.addEventListener("click", function (e) {
                var viewBtn = e.target.closest(".inv-stock-view");
                if (viewBtn) {
                    openViewStock(viewBtn.getAttribute("data-id"));
                }
            });
        }
    }

    return { init: init, loadSummary: loadSummary, loadBatches: loadBatches };
})();
