var InventoryDashboard = (function () {
    "use strict";

    var API = "/api/dashboard";
    var RECENT_LIMIT = 5;

    var STAT_CARDS = [
        {
            key: "products",
            label: "Total Products",
            icon: "inventory",
            tone: "primary",
            link: "/dashboard/products/"
        },
        {
            key: "purchases",
            label: "Total Purchases",
            icon: "shopping_cart",
            tone: "teal",
            link: "/dashboard/stock-in/"
        },
        {
            key: "sales",
            label: "Total Sales",
            icon: "receipt_long",
            tone: "amber",
            link: "/dashboard/purchases/"
        },
        {
            key: "in_stock_products",
            label: "In Stock Items",
            icon: "shelves",
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

    function formatShortDate(value) {
        if (!value) return "—";
        var date = new Date(value);
        if (isNaN(date.getTime())) {
            return escapeCell(value);
        }
        return date.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric"
        });
    }

    function chartRows(rows) {
        return (rows || []).slice(0, RECENT_LIMIT).sort(function (a, b) {
            var aTime = new Date(a.date || 0).getTime();
            var bTime = new Date(b.date || 0).getTime();
            return aTime - bTime;
        });
    }

    function emptyTableRow() {
        return (
            '<tr class="inv-dashboard-table-row--empty" aria-hidden="true">' +
            "<td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>" +
            "</tr>"
        );
    }

    function renderRecentTable(tbodyId, rows, emptyMessage, renderRow) {
        var tbody = document.getElementById(tbodyId);
        if (!tbody) return;

        var items = (rows || []).slice(0, RECENT_LIMIT);
        var html = "";

        if (!items.length) {
            html +=
                '<tr class="inv-dashboard-table-row--message">' +
                '<td colspan="4" class="inv-mgmt-empty">' + escapeCell(emptyMessage) + "</td>" +
                "</tr>";
        } else {
            html += items.map(renderRow).join("");
        }

        var placeholderCount = RECENT_LIMIT - (items.length || 1);
        for (var i = 0; i < placeholderCount; i += 1) {
            html += emptyTableRow();
        }

        tbody.innerHTML = html;
    }

    function renderAmountChart(containerId, rows, tone) {
        var container = document.getElementById(containerId);
        if (!container) return;

        var series = chartRows(rows);
        if (!series.length) {
            container.innerHTML = '<div class="inv-dashboard-chart-empty">No data yet.</div>';
            return;
        }

        var maxValue = Math.max.apply(
            null,
            series.map(function (row) {
                return Number(row.amount) || 0;
            })
        );
        if (!maxValue) {
            maxValue = 1;
        }

        var width = 560;
        var height = 210;
        var padX = 28;
        var padTop = 18;
        var padBottom = 28;
        var chartHeight = height - padTop - padBottom;
        var chartWidth = width - padX * 2;
        var step = series.length > 1 ? chartWidth / (series.length - 1) : 0;
        var points = series.map(function (row, index) {
            var amount = Number(row.amount) || 0;
            var x = padX + (series.length > 1 ? step * index : chartWidth / 2);
            var y = padTop + chartHeight - (amount / maxValue) * chartHeight;
            return {
                x: x,
                y: y,
                amount: amount,
                label: formatShortDate(row.date)
            };
        });
        var linePoints = points.map(function (point) {
            return point.x + "," + point.y;
        }).join(" ");
        var areaPoints = [
            padX + "," + (padTop + chartHeight),
            points.map(function (point) {
                return point.x + "," + point.y;
            }).join(" "),
            (padX + chartWidth) + "," + (padTop + chartHeight)
        ].join(" ");

        var stroke = tone === "purchase" ? "#00796B" : "#0067FF";
        var fill = tone === "purchase" ? "rgba(0, 121, 107, 0.14)" : "rgba(0, 103, 255, 0.14)";
        var gridLines = [0.25, 0.5, 0.75, 1].map(function (ratio) {
            var y = padTop + chartHeight - chartHeight * ratio;
            return (
                '<line x1="' + padX + '" y1="' + y + '" x2="' + (padX + chartWidth) + '" y2="' + y + '" stroke="#E5E7EB" stroke-width="1"></line>'
            );
        }).join("");

        var dots = points.map(function (point) {
            return (
                '<circle cx="' + point.x + '" cy="' + point.y + '" r="4.5" fill="#FFFFFF" stroke="' + stroke + '" stroke-width="2"></circle>' +
                '<title>' + escapeCell(point.label) + " • ₹ " + InventoryApi.formatMoney(point.amount) + "</title>"
            );
        }).join("");

        container.innerHTML =
            '<svg viewBox="0 0 ' + width + " " + height + '" preserveAspectRatio="none" role="img" aria-label="Amount trend chart">' +
            gridLines +
            '<polygon points="' + areaPoints + '" fill="' + fill + '"></polygon>' +
            '<polyline points="' + linePoints + '" fill="none" stroke="' + stroke + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>' +
            dots +
            "</svg>" +
            '<div class="inv-dashboard-chart-labels" style="--chart-columns:' + series.length + '">' +
            points.map(function (point) {
                return '<div class="inv-dashboard-chart-label">' + escapeCell(point.label) + "</div>";
            }).join("") +
            "</div>";
    }

    function renderStatCards(totals) {
        var grid = document.getElementById("dashboard-stat-cards");
        if (!grid) return;

        grid.innerHTML = STAT_CARDS.map(function (card) {
            var value = totals && totals[card.key] != null ? totals[card.key] : 0;
            return (
                '<a href="' + card.link + '" class="inv-dashboard-stat-card inv-dashboard-stat-card--' + card.tone + '">' +
                '<span class="inv-dashboard-stat-shine" aria-hidden="true"></span>' +
                '<span class="inv-dashboard-stat-icon-wrap">' +
                '<span class="material-symbols-outlined inv-dashboard-stat-icon">' + card.icon + "</span>" +
                "</span>" +
                '<div class="inv-dashboard-stat-body">' +
                '<div class="inv-dashboard-stat-label">' + card.label + "</div>" +
                '<div class="inv-dashboard-stat-value">' + escapeCell(value) + "</div>" +
                "</div>" +
                '<span class="material-symbols-outlined inv-dashboard-stat-arrow" aria-hidden="true">arrow_outward</span>' +
                "</a>"
            );
        }).join("");
    }

    function renderRecentPurchases(rows) {
        renderRecentTable(
            "dashboard-recent-purchases",
            rows,
            "No purchases yet.",
            function (row) {
                return (
                    "<tr>" +
                    "<td>" + formatShortDate(row.date) + "</td>" +
                    "<td><strong>" + escapeCell(row.invoice_number) + "</strong></td>" +
                    "<td class=\"inv-mgmt-cell--num\">" + escapeCell(row.items_count) + "</td>" +
                    "<td class=\"inv-mgmt-cell--num\">" + InventoryApi.formatMoney(row.amount) + "</td>" +
                    "</tr>"
                );
            }
        );
    }

    function renderRecentSales(rows) {
        renderRecentTable(
            "dashboard-recent-sales",
            rows,
            "No sales yet.",
            function (row) {
                return (
                    "<tr>" +
                    "<td>" + formatShortDate(row.date) + "</td>" +
                    "<td>" + escapeCell(row.customer_name) + "</td>" +
                    "<td class=\"inv-mgmt-cell--num\">" + escapeCell(row.items_count) + "</td>" +
                    "<td class=\"inv-mgmt-cell--num\">" + InventoryApi.formatMoney(row.amount) + "</td>" +
                    "</tr>"
                );
            }
        );
    }

    function loadDashboard() {
        if (!InventoryBusiness.getActiveId()) {
            renderStatCards({});
            renderAmountChart("dashboard-sales-chart", [], "sale");
            renderAmountChart("dashboard-purchases-chart", [], "purchase");
            renderRecentPurchases([]);
            renderRecentSales([]);
            return;
        }

        InventoryLoader.show();
        request("/stats/")
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    var recentPurchases = body.data.recent_purchases || [];
                    var recentSales = body.data.recent_sales || [];
                    renderStatCards(body.data.totals || {});
                    renderAmountChart("dashboard-sales-chart", recentSales, "sale");
                    renderAmountChart("dashboard-purchases-chart", recentPurchases, "purchase");
                    renderRecentSales(recentSales);
                    renderRecentPurchases(recentPurchases);
                } else {
                    renderStatCards({});
                    renderAmountChart("dashboard-sales-chart", [], "sale");
                    renderAmountChart("dashboard-purchases-chart", [], "purchase");
                    renderRecentPurchases([]);
                    renderRecentSales([]);
                    InventoryToast.error(body.message || "Failed to load dashboard.");
                }
            })
            .catch(function () {
                renderStatCards({});
                renderAmountChart("dashboard-sales-chart", [], "sale");
                renderAmountChart("dashboard-purchases-chart", [], "purchase");
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
