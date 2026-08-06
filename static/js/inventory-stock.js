var InventoryStock = (function () {
    "use strict";

    var API = "/api/inventory";
    var PAGE_SIZE = (window.InventoryConstants && InventoryConstants.PAGE_SIZE) || 10;
    var searchTimer = null;
    var currentPage = 1;
    var currentSearch = "";

    function request(path, opts) {
        return InventoryApi.request(API, path, opts);
    }

    function formatProfit(value) {
        var num = Number(value || 0);
        var formatted = InventoryApi.formatMoney(num);
        if (num > 0) return "+" + formatted;
        return formatted;
    }

    function renderRows(items) {
        var tbody = document.getElementById("inventory-table-body");
        if (!tbody) return;

        if (!items || !items.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="inv-mgmt-empty">No stock records yet. Add products with quantity first.</td></tr>';
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
                "<td class=\"inv-col-buy\">" + InventoryApi.formatMoney(item.product_purchase_price) + "</td>" +
                "<td class=\"inv-col-sell\">" + InventoryApi.formatMoney(item.product_sale_price) + "</td>" +
                "<td class=\"inv-col-profit " + profitClass + "\"><strong>" + formatProfit(profit) + "</strong></td>" +
                "</tr>"
            );
        }).join("");
    }

    function buildQuery(search, page) {
        var params = new URLSearchParams();
        params.set("page", String(page || 1));
        params.set("page_size", String(PAGE_SIZE));
        if (search) params.set("search", search);
        return "?" + params.toString();
    }

    function loadInventory(search, page) {
        currentSearch = search || "";
        currentPage = page || 1;
        InventoryLoader.show();

        return request(buildQuery(currentSearch, currentPage))
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    renderRows(body.data.items || []);
                    InventoryPagination.render("inventory-pagination", body.data.pagination, function (p) {
                        loadInventory(currentSearch, p);
                    }, { label: "records" });
                } else {
                    renderRows([]);
                    InventoryPagination.render("inventory-pagination", null, function () {});
                    InventoryToast.error(body.message || "Failed to load inventory.");
                }
            })
            .catch(function () {
                renderRows([]);
                InventoryToast.error("Network error while loading inventory.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function init() {
        var searchEl = document.getElementById("inventory-search");

        function boot() {
            if (!InventoryBusiness.getActiveId()) return;
            loadInventory("", 1);
        }

        InventoryBusiness.whenReady(boot);
        window.addEventListener("inventory:business-changed", boot);

        if (searchEl) {
            searchEl.addEventListener("input", function () {
                window.clearTimeout(searchTimer);
                searchTimer = window.setTimeout(function () {
                    loadInventory(searchEl.value.trim(), 1);
                }, 300);
            });
        }
    }

    return { init: init, loadInventory: loadInventory };
})();
