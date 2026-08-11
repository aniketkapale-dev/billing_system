var InventoryStock = (function () {
    "use strict";

    var SUMMARY_API = "/api/inventory";
    var BATCH_API = "/api/invoicing/batches";
    var PAGE_SIZE = (window.InventoryConstants && InventoryConstants.PAGE_SIZE) || 10;
    var searchTimer = null;
    var batchSearchTimer = null;
    var currentPage = 1;
    var currentSearch = "";
    var batchPage = 1;
    var batchSearch = "";
    var activeTab = "summary";
    var LIST_PANEL = "inventory-list-panel";
    var VIEW_PANEL = "inventory-view-panel";

    function summaryRequest(path, opts) {
        return InventoryApi.request(SUMMARY_API, path, opts);
    }

    function batchRequest(path, opts) {
        return InventoryApi.request(BATCH_API, path, opts);
    }

    function formatDate(value) {
        if (!value) return "—";
        return InventoryApi.escapeHtml(value);
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

        if (!items || !items.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="inv-mgmt-empty">No stock yet. Record a purchase to add inventory.</td></tr>';
            return;
        }

        tbody.innerHTML = items.map(function (item) {
            return (
                "<tr>" +
                "<td class=\"inv-col-name\">" + InventoryApi.escapeHtml(item.product_name) + "</td>" +
                "<td class=\"inv-col-sku\">" + InventoryApi.escapeHtml(item.product_sku || "—") + "</td>" +
                "<td class=\"inv-col-unit\">" + InventoryApi.escapeHtml(item.product_unit || "pcs") + "</td>" +
                "<td class=\"inv-col-qty\"><strong>" + InventoryApi.escapeHtml(item.quantity) + "</strong></td>" +
                "<td class=\"inv-col-action\">" + actionButtons(item) + "</td>" +
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
            { label: "Product", value: displayValue(stock.product_name) },
            { label: "SKU", value: displayValue(stock.product_sku) },
            { label: "Unit", value: displayValue(stock.product_unit || "pcs") },
            { label: "In Stock", value: displayValue(stock.quantity) }
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

        if (!items || !items.length) {
            tbody.innerHTML = '<tr><td colspan="9" class="inv-mgmt-empty">No batches yet. Step 1: Record a purchase invoice to add stock.</td></tr>';
            return;
        }

        var offset = ((page || 1) - 1) * (pageSize || PAGE_SIZE);
        tbody.innerHTML = items.map(function (item, index) {
            var avail = Number(item.available_quantity || 0);
            var availClass = avail > 0 ? "inv-batch-available" : "inv-batch-empty";
            var buy = Number(item.purchase_price || 0);
            var sell = Number(item.product_sale_price != null ? item.product_sale_price : item.selling_price || 0);
            return (
                "<tr>" +
                "<td><strong>" + (offset + index + 1) + "</strong></td>" +
                "<td>" + InventoryApi.escapeHtml(item.product_name) + "</td>" +
                "<td><code>" + InventoryApi.escapeHtml(item.batch_number || "—") + "</code></td>" +
                "<td>" + InventoryApi.escapeHtml(item.invoice_number || "—") + "</td>" +
                "<td class=\"inv-mgmt-cell--num " + availClass + "\"><strong>" + InventoryApi.escapeHtml(item.available_quantity) + "</strong></td>" +
                "<td class=\"inv-mgmt-cell--num\">" + InventoryApi.formatMoney(buy) + "</td>" +
                "<td class=\"inv-mgmt-cell--num\">" + InventoryApi.formatMoney(sell) + "</td>" +
                "<td>" + formatDate(item.expiry_date) + "</td>" +
                "<td>" + formatDate(String(item.created_at || "").slice(0, 10)) + "</td>" +
                "</tr>"
            );
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

        return summaryRequest(buildQuery(currentSearch, currentPage, null, "inventory-pagination"))
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
        var extra = {};
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
        var searchEl = document.getElementById("inventory-search");
        var batchSearchEl = document.getElementById("batch-search");
        var inStockEl = document.getElementById("batch-in-stock-only");

        function boot() {
            if (!InventoryBusiness.getActiveId()) return;
            switchTab(activeTab);
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
