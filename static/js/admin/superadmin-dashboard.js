var InventorySuperadminDashboard = (function () {
    "use strict";

    var API = "/api/dashboard";

    var STAT_CARDS = [
        {
            key: "total",
            label: "Total Users",
            icon: "groups",
            tone: "primary",
            link: "/superadmin/users/"
        },
        {
            key: "active",
            label: "Active Users",
            icon: "check_circle",
            tone: "green",
            link: "/superadmin/users/"
        },
        {
            key: "inactive",
            label: "Inactive Users",
            icon: "block",
            tone: "amber",
            link: "/superadmin/users/"
        }
    ];

    var LINE_SERIES = [
        { key: "total", label: "Total Users", color: "#0067FF", fill: "rgba(0, 103, 255, 0.12)" },
        { key: "active", label: "Active Users", color: "#2E7D32", fill: "rgba(46, 125, 50, 0.12)" },
        { key: "inactive", label: "Inactive Users", color: "#EF6C00", fill: "rgba(239, 108, 0, 0.12)" }
    ];

    function request(path) {
        return InventoryApi.request(API, path || "/superadmin-stats/", { skipBusiness: true });
    }

    function escapeCell(value) {
        if (value === null || value === undefined || String(value).trim() === "") {
            return "—";
        }
        return InventoryApi.escapeHtml(String(value));
    }

    function renderStatCards(totals) {
        var grid = document.getElementById("superadmin-dashboard-stat-cards");
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

    function buildSeriesPoints(rows, key, padX, padTop, chartWidth, chartHeight, maxValue) {
        var count = rows.length;
        var step = count > 1 ? chartWidth / (count - 1) : 0;
        return rows.map(function (row, index) {
            var value = Number(row[key]) || 0;
            var x = padX + (count > 1 ? step * index : chartWidth / 2);
            var y = padTop + chartHeight - (value / maxValue) * chartHeight;
            return {
                x: x,
                y: y,
                value: value,
                label: row.label
            };
        });
    }

    function renderLineChart(monthlyTrend) {
        var container = document.getElementById("superadmin-users-line-chart");
        if (!container) return;

        var rows = monthlyTrend || [];
        if (!rows.length) {
            container.innerHTML = '<div class="inv-dashboard-chart-empty">No user data yet.</div>';
            return;
        }

        var maxValue = Math.max.apply(
            null,
            rows.map(function (row) {
                return Math.max(Number(row.total) || 0, Number(row.active) || 0, Number(row.inactive) || 0);
            })
        );
        if (!maxValue) {
            maxValue = 1;
        }

        var width = 1100;
        var height = 360;
        var padX = 48;
        var padTop = 28;
        var padBottom = 42;
        var chartHeight = height - padTop - padBottom;
        var chartWidth = width - padX * 2;

        var gridLines = [0, 0.25, 0.5, 0.75, 1].map(function (ratio) {
            var y = padTop + chartHeight - chartHeight * ratio;
            var label = Math.round(maxValue * ratio);
            return (
                '<line x1="' + padX + '" y1="' + y + '" x2="' + (padX + chartWidth) + '" y2="' + y + '" stroke="#E5E7EB" stroke-width="1"></line>' +
                '<text x="' + (padX - 10) + '" y="' + (y + 4) + '" text-anchor="end" class="inv-superadmin-line-axis">' + label + "</text>"
            );
        }).join("");

        var seriesSvg = LINE_SERIES.map(function (series) {
            var points = buildSeriesPoints(rows, series.key, padX, padTop, chartWidth, chartHeight, maxValue);
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
            var dots = points.map(function (point) {
                return (
                    '<circle cx="' + point.x + '" cy="' + point.y + '" r="5" fill="#FFFFFF" stroke="' + series.color + '" stroke-width="2.5"></circle>' +
                    '<title>' + escapeCell(point.label) + " • " + series.label + ": " + point.value + "</title>"
                );
            }).join("");
            return (
                '<polygon points="' + areaPoints + '" fill="' + series.fill + '"></polygon>' +
                '<polyline points="' + linePoints + '" fill="none" stroke="' + series.color + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>' +
                dots
            );
        }).join("");

        container.innerHTML =
            '<svg viewBox="0 0 ' + width + " " + height + '" preserveAspectRatio="none" role="img" aria-label="User analytics line chart">' +
            gridLines +
            seriesSvg +
            "</svg>" +
            '<div class="inv-dashboard-chart-labels inv-superadmin-line-labels" style="--chart-columns:' + rows.length + '">' +
            rows.map(function (row) {
                return '<div class="inv-dashboard-chart-label">' + escapeCell(row.label) + "</div>";
            }).join("") +
            "</div>" +
            '<div class="inv-superadmin-line-legend">' +
            LINE_SERIES.map(function (series) {
                return (
                    '<span class="inv-superadmin-line-legend-item">' +
                    '<i class="inv-superadmin-line-legend-dot" style="background:' + series.color + '"></i>' +
                    escapeCell(series.label) +
                    "</span>"
                );
            }).join("") +
            "</div>";
    }

    function loadDashboard() {
        InventoryLoader.show();
        request("/superadmin-stats/")
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    renderStatCards(body.data.totals || {});
                    renderLineChart(body.data.monthly_trend || []);
                } else {
                    renderStatCards({});
                    renderLineChart([]);
                    InventoryToast.error(body.message || "Failed to load dashboard.");
                }
            })
            .catch(function () {
                renderStatCards({});
                renderLineChart([]);
                InventoryToast.error("Network error while loading dashboard.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function init() {
        loadDashboard();
    }

    return { init: init };
})();
