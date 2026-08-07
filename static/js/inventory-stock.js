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

    function summaryRequest(path, opts) {
        return InventoryApi.request(SUMMARY_API, path, opts);
    }

    function batchRequest(path, opts) {
        return InventoryApi.request(BATCH_API, path, opts);
    }

    function formatProfit(value) {
        var num = Number(value || 0);
        var formatted = InventoryApi.formatMoney(num);
        if (num > 0) return "+" + formatted;
        return formatted;
    }

    function formatDate(value) {
        if (!value) return "—";
        return InventoryApi.escapeHtml(value);
    }

    function renderSummaryRows(items) {
        var tbody = document.getElementById("inventory-table-body");
        if (!tbody) return;

        if (!items || !items.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="inv-mgmt-empty">No stock records yet. Add products or record a purchase invoice.</td></tr>';
            return;
        }

        tbody.innerHTML = items.map(function (item) {
            var profit = Number(item.total_profit || 0);
            var profitClass = profit >= 0 ? "inv-profit-positive" : "inv-profit-negative";
            return (
                "<tr>" +
                "<td class=\"inv-col-name\">" + InventoryApi.escapeHtml(item.product_name) + "</td>" +
                "<td class=\"inv-col-sku\">" + InventoryApi.escapeHtml(item.product_sku || "—") + "</td>" +
                "<td class=\"inv-col-unit\">" + InventoryApi.escapeHtml(item.product_unit || "pcs") + "</td>" +
                "<td class=\"inv-col-qty\"><strong>" + InventoryApi.escapeHtml(item.quantity) + "</strong></td>" +
                "<td class=\"inv-col-buy\">" + InventoryApi.formatMoney(item.avg_batch_cost) + "</td>" +
                "<td class=\"inv-col-sell\">" + InventoryApi.formatMoney(item.avg_batch_sell) + "</td>" +
                "<td class=\"inv-col-profit " + profitClass + "\"><strong>" + formatProfit(profit) + "</strong></td>" +
                "</tr>"
            );
        }).join("");
    }

    function renderBatchRows(items, page, pageSize) {
        var tbody = document.getElementById("batch-table-body");
        if (!tbody) return;

        if (!items || !items.length) {
            tbody.innerHTML = '<tr><td colspan="10" class="inv-mgmt-empty">No batches yet. Step 1: Record a purchase invoice to add stock.</td></tr>';
            return;
        }

        var offset = ((page || 1) - 1) * (pageSize || PAGE_SIZE);
        tbody.innerHTML = items.map(function (item, index) {
            var avail = Number(item.available_quantity || 0);
            var availClass = avail > 0 ? "inv-batch-available" : "inv-batch-empty";
            var buy = Number(item.purchase_price || 0);
            var sell = Number(item.selling_price || 0);
            var unitProfit = sell - buy;
            var profitClass = unitProfit >= 0 ? "inv-profit-positive" : "inv-profit-negative";
            return (
                "<tr>" +
                "<td><strong>" + (offset + index + 1) + "</strong></td>" +
                "<td>" + InventoryApi.escapeHtml(item.product_name) + "</td>" +
                "<td><code>" + InventoryApi.escapeHtml(item.batch_number || "—") + "</code></td>" +
                "<td>" + InventoryApi.escapeHtml(item.invoice_number || "—") + "</td>" +
                "<td class=\"inv-mgmt-cell--num " + availClass + "\"><strong>" + InventoryApi.escapeHtml(item.available_quantity) + "</strong></td>" +
                "<td class=\"inv-mgmt-cell--num\">" + InventoryApi.formatMoney(item.purchase_price) + "</td>" +
                "<td class=\"inv-mgmt-cell--num\">" + InventoryApi.formatMoney(item.selling_price) + "</td>" +
                "<td class=\"inv-mgmt-cell--num " + profitClass + "\">" + formatProfit(unitProfit) + "</td>" +
                "<td>" + formatDate(item.expiry_date) + "</td>" +
                "<td>" + formatDate(String(item.created_at || "").slice(0, 10)) + "</td>" +
                "</tr>"
            );
        }).join("");
    }

    function buildQuery(search, page, extra) {
        var params = new URLSearchParams();
        params.set("page", String(page || 1));
        params.set("page_size", String(PAGE_SIZE));
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

        return summaryRequest(buildQuery(currentSearch, currentPage))
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    renderSummaryRows(body.data.items || []);
                    InventoryPagination.render("inventory-pagination", body.data.pagination, function (p) {
                        loadSummary(currentSearch, p);
                    }, { label: "records" });
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
        return batchRequest(buildQuery(batchSearch, batchPage, extra))
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    renderBatchRows(body.data.items || [], batchPage, PAGE_SIZE);
                    InventoryPagination.render("batch-pagination", body.data.pagination, function (p) {
                        loadBatches(batchSearch, p);
                    }, { label: "batches" });
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
    }

    return { init: init, loadSummary: loadSummary, loadBatches: loadBatches };
})();
