var InventoryDashboard = (function () {
    "use strict";

    var API = "/api/dashboard";

    var STAT_CARDS = [
        {
            key: "products",
            label: "Total Products",
            icon: "inventory_2",
            tone: "primary",
            link: "/dashboard/products/"
        },
        {
            key: "purchases",
            label: "Total Purchases",
            icon: "input",
            tone: "teal",
            link: "/dashboard/stock-in/"
        },
        {
            key: "sales",
            label: "Total Sales",
            icon: "point_of_sale",
            tone: "amber",
            link: "/dashboard/purchases/"
        },
        {
            key: "in_stock_products",
            label: "In Stock Items",
            icon: "warehouse",
            tone: "green",
            link: "/dashboard/inventory/"
        }
    ];

    function request(path) {
        return InventoryApi.request(API, path || "/stats/");
    }

    function escapeCell(value) {
        if (value === null || value === undefined || String(value).trim() === "") {
            return "—";
        }
        return InventoryApi.escapeHtml(String(value));
    }

    function renderStatCards(totals) {
        var grid = document.getElementById("dashboard-stat-cards");
        if (!grid) return;

        grid.innerHTML = STAT_CARDS.map(function (card) {
            var value = totals && totals[card.key] != null ? totals[card.key] : 0;
            return (
                '<a href="' + card.link + '" class="inv-dashboard-stat-card inv-dashboard-stat-card--' + card.tone + '">' +
                '<span class="material-symbols-outlined inv-dashboard-stat-icon">' + card.icon + "</span>" +
                '<div class="inv-dashboard-stat-body">' +
                '<div class="inv-dashboard-stat-value">' + escapeCell(value) + "</div>" +
                '<div class="inv-dashboard-stat-label">' + card.label + "</div>" +
                "</div>" +
                "</a>"
            );
        }).join("");
    }

    function renderRecentPurchases(rows) {
        var tbody = document.getElementById("dashboard-recent-purchases");
        if (!tbody) return;

        if (!rows || !rows.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="inv-mgmt-empty">No purchases yet.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(function (row) {
            return (
                "<tr>" +
                "<td>" + escapeCell(row.date) + "</td>" +
                "<td><strong>" + escapeCell(row.invoice_number) + "</strong></td>" +
                "<td class=\"inv-mgmt-cell--num\">" + escapeCell(row.items_count) + "</td>" +
                "<td class=\"inv-mgmt-cell--num\">" + InventoryApi.formatMoney(row.amount) + "</td>" +
                "</tr>"
            );
        }).join("");
    }

    function renderRecentSales(rows) {
        var tbody = document.getElementById("dashboard-recent-sales");
        if (!tbody) return;

        if (!rows || !rows.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="inv-mgmt-empty">No sales yet.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(function (row) {
            return (
                "<tr>" +
                "<td>" + escapeCell(row.date) + "</td>" +
                "<td>" + escapeCell(row.customer_name) + "</td>" +
                "<td>" + escapeCell(row.products_summary) + "</td>" +
                "<td class=\"inv-mgmt-cell--num\">" + InventoryApi.formatMoney(row.amount) + "</td>" +
                "</tr>"
            );
        }).join("");
    }

    function loadDashboard() {
        if (!InventoryBusiness.getActiveId()) {
            renderStatCards({});
            renderRecentPurchases([]);
            renderRecentSales([]);
            return;
        }

        InventoryLoader.show();
        request("/stats/")
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    renderStatCards(body.data.totals || {});
                    renderRecentPurchases(body.data.recent_purchases || []);
                    renderRecentSales(body.data.recent_sales || []);
                } else {
                    renderStatCards({});
                    renderRecentPurchases([]);
                    renderRecentSales([]);
                    InventoryToast.error(body.message || "Failed to load dashboard.");
                }
            })
            .catch(function () {
                renderStatCards({});
                renderRecentPurchases([]);
                renderRecentSales([]);
                InventoryToast.error("Network error while loading dashboard.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function init() {
        function boot() {
            loadDashboard();
        }

        InventoryBusiness.whenReady(boot);
        window.addEventListener("inventory:business-changed", boot);
    }

    return { init: init };
})();
