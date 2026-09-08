var InventoryDashboard = (function () {
    "use strict";

    var API = "/api/dashboard";
    var salesChartPeriod = "week";
    var pendingPaymentsPeriod = "week";
    var purchasesKpiPeriod = "week";
    var salesKpiPeriod = "week";
    var expiringProductsPeriod = "week";

    var KPI_CAPTIONS = {
        purchases: {
            day: "Purchases today",
            week: "Purchases this week",
            month: "Purchases this month"
        },
        sales: {
            day: "Sales today",
            week: "Sales this week",
            month: "Sales this month"
        },
        expiring: {
            day: "Expiring today",
            week: "Expiring this week",
            month: "Expiring this month"
        }
    };

    var STAT_CARDS = [
        {
            key: "purchases",
            label: "Total Purchases",
            icon: "shopping_cart",
            tone: "green",
            link: "/dashboard/stock-in/"
        },
        {
            key: "sales",
            label: "Total Sales",
            icon: "receipt_long",
            tone: "primary",
            link: "/dashboard/purchases/"
        },
        {
            key: "expiring",
            label: "Expiring Products",
            icon: "event_busy",
            tone: "orange",
            link: "/dashboard/inventory/"
        }
    ];

    function apiRequest(path, opts) {
        return InventoryApi.request(API, path, opts);
    }

    function escapeCell(value) {
        if (value === null || value === undefined || String(value).trim() === "") {
            return "—";
        }
        return InventoryApi.escapeHtml(String(value));
    }

    function parseChartDate(value) {
        if (!value) return null;
        var parts = String(value).slice(0, 10).split("-");
        if (parts.length === 3) {
            return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        }
        var date = new Date(value);
        return isNaN(date.getTime()) ? null : date;
    }

    function formatShortDate(value) {
        var date = parseChartDate(value);
        if (!date) return "—";
        return date.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric"
        });
    }

    function formatChartLabel(value, period) {
        var date = parseChartDate(value);
        if (!date) return "—";
        if (period === "all") {
            return date.toLocaleDateString("en-IN", {
                month: "short",
                year: "numeric"
            });
        }
        if (period === "day") {
            return date.toLocaleDateString("en-IN", {
                weekday: "short",
                day: "numeric",
                month: "short"
            });
        }
        return date.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short"
        });
    }

    function sortChartRows(rows) {
        return (rows || []).slice().sort(function (a, b) {
            var aDate = parseChartDate(a.date);
            var bDate = parseChartDate(b.date);
            return (aDate ? aDate.getTime() : 0) - (bDate ? bDate.getTime() : 0);
        });
    }

    function renderAmountChart(containerId, rows, tone, period) {
        var container = document.getElementById(containerId);
        if (!container) return;

        var series = sortChartRows(rows);
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

        var availableWidth = Math.max(container.clientWidth - 28, 320);
        var width = Math.max(availableWidth, series.length * 56);
        var height = 280;
        var padX = 32;
        var padTop = 20;
        var padBottom = 46;
        var chartHeight = height - padTop - padBottom;
        var chartWidth = width - padX * 2;
        var baselineY = padTop + chartHeight;
        var step = series.length > 1 ? chartWidth / (series.length - 1) : 0;
        var labelPeriod = period || salesChartPeriod;
        var points = series.map(function (row, index) {
            var amount = Number(row.amount) || 0;
            var x = padX + (series.length > 1 ? step * index : chartWidth / 2);
            var y = padTop + chartHeight - (amount / maxValue) * chartHeight;
            return {
                x: x,
                y: y,
                amount: amount,
                label: formatChartLabel(row.date, labelPeriod)
            };
        });
        var linePoints = points.map(function (point) {
            return point.x + "," + point.y;
        }).join(" ");
        var areaPoints = [
            padX + "," + baselineY,
            points.map(function (point) {
                return point.x + "," + point.y;
            }).join(" "),
            (padX + chartWidth) + "," + baselineY
        ].join(" ");

        var stroke = tone === "purchase" ? "#00796B" : "#0067FF";
        var fill = tone === "purchase" ? "rgba(0, 121, 107, 0.14)" : "rgba(0, 103, 255, 0.14)";
        var gridLines = [0.25, 0.5, 0.75, 1].map(function (ratio) {
            var y = padTop + chartHeight - chartHeight * ratio;
            return (
                '<line x1="' + padX + '" y1="' + y + '" x2="' + (padX + chartWidth) + '" y2="' + y + '" stroke="#E5E7EB" stroke-width="1"></line>'
            );
        }).join("");

        var baseline =
            '<line x1="' + padX + '" y1="' + baselineY + '" x2="' + (padX + chartWidth) + '" y2="' + baselineY + '" stroke="#CBD5E1" stroke-width="1"></line>';

        var dots = points.map(function (point) {
            var tooltip = escapeCell(point.label) + " • ₹ " + InventoryApi.formatMoney(point.amount);
            return (
                '<g class="inv-dashboard-chart-point">' +
                "<title>" + tooltip + "</title>" +
                '<circle cx="' + point.x + '" cy="' + point.y + '" r="12" fill="transparent" pointer-events="all"></circle>' +
                '<circle cx="' + point.x + '" cy="' + point.y + '" r="4.5" fill="#FFFFFF" stroke="' + stroke + '" stroke-width="2" pointer-events="none"></circle>' +
                "</g>"
            );
        }).join("");

        var axisLabels = points.map(function (point) {
            return (
                '<text x="' + point.x + '" y="' + (height - 10) + '" text-anchor="middle" class="inv-dashboard-chart-svg-label">' +
                escapeCell(point.label) +
                "</text>"
            );
        }).join("");

        container.innerHTML =
            '<div class="inv-dashboard-chart-scroll">' +
            '<div class="inv-dashboard-chart-inner" style="width:' + width + 'px">' +
            '<svg width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + " " + height + '" preserveAspectRatio="xMinYMid meet" role="img" aria-label="Amount trend chart">' +
            gridLines +
            baseline +
            '<polygon points="' + areaPoints + '" fill="' + fill + '"></polygon>' +
            '<polyline points="' + linePoints + '" fill="none" stroke="' + stroke + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>' +
            dots +
            axisLabels +
            "</svg>" +
            "</div></div>";
    }

    function getKpiPeriod(key) {
        if (key === "purchases") return purchasesKpiPeriod;
        if (key === "sales") return salesKpiPeriod;
        if (key === "expiring") return expiringProductsPeriod;
        return "week";
    }

    function buildInteractiveKpiCardHtml(card) {
        var period = getKpiPeriod(card.key);
        var caption = (KPI_CAPTIONS[card.key] && KPI_CAPTIONS[card.key][period]) || "";
        return (
            '<div class="inv-dashboard-stat-card inv-dashboard-stat-card--' + card.tone + ' inv-dashboard-stat-card--interactive-kpi">' +
            '<span class="inv-dashboard-stat-shine" aria-hidden="true"></span>' +
            '<span class="inv-dashboard-stat-icon-wrap">' +
            '<span class="material-symbols-outlined inv-dashboard-stat-icon">' + card.icon + "</span>" +
            "</span>" +
            '<div class="inv-dashboard-stat-body">' +
            '<div class="inv-dashboard-stat-label">' + card.label + "</div>" +
            '<div id="dashboard-' + card.key + '-kpi-count" class="inv-dashboard-stat-value">—</div>' +
            '<div class="inv-dashboard-stat-kpi-filters" id="dashboard-' + card.key + '-kpi-filters" data-kpi="' + card.key + '" role="tablist" aria-label="' + card.label + ' period">' +
            '<button type="button" class="inv-dashboard-stat-kpi-filter' + (period === "day" ? " is-active" : "") + '" data-period="day" role="tab"' + (period === "day" ? ' aria-selected="true"' : "") + ">Day</button>" +
            '<button type="button" class="inv-dashboard-stat-kpi-filter' + (period === "week" ? " is-active" : "") + '" data-period="week" role="tab"' + (period === "week" ? ' aria-selected="true"' : "") + ">Week</button>" +
            '<button type="button" class="inv-dashboard-stat-kpi-filter' + (period === "month" ? " is-active" : "") + '" data-period="month" role="tab"' + (period === "month" ? ' aria-selected="true"' : "") + ">Month</button>" +
            "</div>" +
            '<div id="dashboard-' + card.key + '-kpi-caption" class="inv-dashboard-stat-kpi-caption">' +
            caption +
            "</div>" +
            "</div>" +
            '<a href="' + card.link + '" class="inv-dashboard-stat-arrow inv-dashboard-stat-arrow--link" aria-label="View ' + card.label.toLowerCase() + '">' +
            '<span class="material-symbols-outlined" aria-hidden="true">arrow_outward</span>' +
            "</a>" +
            "</div>"
        );
    }

    function renderStatCards() {
        var grid = document.getElementById("dashboard-stat-cards");
        if (!grid) return;

        grid.innerHTML = STAT_CARDS.map(buildInteractiveKpiCardHtml).join("");
    }

    function setKpiPeriod(key, period) {
        if (key === "purchases") {
            purchasesKpiPeriod = period;
        } else if (key === "sales") {
            salesKpiPeriod = period;
        } else if (key === "expiring") {
            expiringProductsPeriod = period;
        }

        var filters = document.getElementById("dashboard-" + key + "-kpi-filters");
        if (filters) {
            filters.querySelectorAll("[data-period]").forEach(function (btn) {
                var active = btn.getAttribute("data-period") === period;
                btn.classList.toggle("is-active", active);
                btn.setAttribute("aria-selected", active ? "true" : "false");
            });
        }

        var labelEl = document.getElementById("dashboard-" + key + "-kpi-caption");
        if (labelEl && KPI_CAPTIONS[key]) {
            labelEl.textContent = KPI_CAPTIONS[key][period] || KPI_CAPTIONS[key].week;
        }
    }

    function updateKpiCount(key, count) {
        var countEl = document.getElementById("dashboard-" + key + "-kpi-count");
        if (countEl) {
            countEl.textContent = String(count != null ? count : 0);
        }
        setKpiPeriod(key, getKpiPeriod(key));
    }

    function updateKpiCounts(data) {
        if (!data) return;
        if (data.purchases) {
            if (data.purchases.period) {
                setKpiPeriod("purchases", data.purchases.period);
            }
            updateKpiCount("purchases", data.purchases.count);
        }
        if (data.sales) {
            if (data.sales.period) {
                setKpiPeriod("sales", data.sales.period);
            }
            updateKpiCount("sales", data.sales.count);
        }
    }

    function setSalesChartPeriod(period) {
        salesChartPeriod = period;
        var filters = document.getElementById("dashboard-sales-chart-filters");
        if (!filters) return;
        filters.querySelectorAll("[data-period]").forEach(function (btn) {
            var active = btn.getAttribute("data-period") === period;
            btn.classList.toggle("is-active", active);
            btn.setAttribute("aria-selected", active ? "true" : "false");
        });
    }

    function setPendingPaymentsPeriod(period) {
        pendingPaymentsPeriod = period;
        var filters = document.getElementById("dashboard-pending-payments-filters");
        if (!filters) return;
        filters.querySelectorAll("[data-period]").forEach(function (btn) {
            var active = btn.getAttribute("data-period") === period;
            btn.classList.toggle("is-active", active);
            btn.setAttribute("aria-selected", active ? "true" : "false");
        });
    }

    function formatPendingCustomer(item) {
        var name = item.customer_name ? String(item.customer_name).trim() : "—";
        var companyName = item.company_name ? String(item.company_name).trim() : "";
        var mobile = item.customer_mobile ? String(item.customer_mobile).trim() : "";
        if (companyName) {
            return escapeCell(companyName) + " (" + escapeCell(name) + ")";
        }
        if (mobile) {
            return escapeCell(name) + " (" + escapeCell(mobile) + ")";
        }
        return escapeCell(name);
    }

    function formatPendingDate(value) {
        if (!value) return "—";
        return escapeCell(String(value).slice(0, 10));
    }

    function formatPendingProductsCell(lines, itemId) {
        if (!lines || !lines.length) return "—";

        var parts = lines.map(function (line) {
            return escapeCell(line);
        });

        if (parts.length <= 2) {
            return parts.join(" · ");
        }

        var short = parts.slice(0, 2).join(" · ");
        var full = parts.join(" · ");
        var moreCount = parts.length - 2;

        return (
            '<span class="inv-products-sold" data-pending-id="' + itemId + '">' +
            '<span class="inv-products-sold-collapsed">' + short + " · " +
            '<button type="button" class="inv-products-sold-toggle">see more (+' + moreCount + ")</button></span>" +
            '<span class="inv-products-sold-expanded inv-hidden">' + full + " · " +
            '<button type="button" class="inv-products-sold-toggle inv-products-sold-toggle--less">show less</button></span>' +
            "</span>"
        );
    }

    function syncPendingPaymentsCards() {
        var table = document.querySelector(".inv-dashboard-pending-table");
        if (table && window.InventoryTableCards) {
            InventoryTableCards.syncTable(table);
        }
    }

    function setExpiringProductsPeriod(period) {
        setKpiPeriod("expiring", period);
    }

    function loadKpiCounts(options) {
        options = options || {};
        if (options.purchasesPeriod) {
            setKpiPeriod("purchases", options.purchasesPeriod);
        }
        if (options.salesPeriod) {
            setKpiPeriod("sales", options.salesPeriod);
        }

        if (!InventoryBusiness.getActiveId()) {
            updateKpiCounts({
                purchases: { count: 0, period: purchasesKpiPeriod },
                sales: { count: 0, period: salesKpiPeriod }
            });
            return Promise.resolve();
        }

        if (options.showLoading) {
            if (!options.salesOnly) {
                var purchasesEl = document.getElementById("dashboard-purchases-kpi-count");
                if (purchasesEl) purchasesEl.textContent = "…";
            }
            if (!options.purchasesOnly) {
                var salesEl = document.getElementById("dashboard-sales-kpi-count");
                if (salesEl) salesEl.textContent = "…";
            }
        }

        var params = new URLSearchParams();
        params.set("purchases_period", purchasesKpiPeriod);
        params.set("sales_period", salesKpiPeriod);

        return apiRequest("/kpi-counts/?" + params.toString())
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    updateKpiCounts(body.data);
                } else {
                    updateKpiCounts({
                        purchases: { count: 0, period: purchasesKpiPeriod },
                        sales: { count: 0, period: salesKpiPeriod }
                    });
                    if (!options.silent) {
                        InventoryToast.error(body.message || "Failed to load KPI counts.");
                    }
                }
            })
            .catch(function () {
                updateKpiCounts({
                    purchases: { count: 0, period: purchasesKpiPeriod },
                    sales: { count: 0, period: salesKpiPeriod }
                });
                if (!options.silent) {
                    InventoryToast.error("Network error while loading KPI counts.");
                }
            });
    }

    function loadExpiringProducts(period, options) {
        options = options || {};
        if (period) {
            setExpiringProductsPeriod(period);
        }

        if (!InventoryBusiness.getActiveId()) {
            updateKpiCount("expiring", 0);
            return Promise.resolve();
        }

        var countEl = document.getElementById("dashboard-expiring-kpi-count");
        if (countEl && options.showLoading) {
            countEl.textContent = "…";
        }

        return apiRequest("/expiring-products/?period=" + encodeURIComponent(expiringProductsPeriod))
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    if (body.data.period) {
                        setKpiPeriod("expiring", body.data.period);
                    }
                    updateKpiCount("expiring", body.data.count);
                } else {
                    updateKpiCount("expiring", 0);
                    if (!options.silent) {
                        InventoryToast.error(body.message || "Failed to load expiring products.");
                    }
                }
            })
            .catch(function () {
                updateKpiCount("expiring", 0);
                if (!options.silent) {
                    InventoryToast.error("Network error while loading expiring products.");
                }
            });
    }

    function renderPendingPaymentsTable(data) {
        var tbody = document.getElementById("dashboard-pending-payments-body");
        var totalEl = document.getElementById("dashboard-pending-payments-total");
        if (!tbody) return;

        var items = (data && data.items) || [];
        if (!items.length) {
            tbody.innerHTML =
                '<tr class="inv-dashboard-table-row--empty">' +
                '<td colspan="5" class="inv-mgmt-empty">No pending payments for this period.</td>' +
                "</tr>";
            if (totalEl) {
                totalEl.hidden = true;
                totalEl.textContent = "";
            }
            return;
        }

        tbody.innerHTML = items.map(function (item) {
            var invoiceNo = item.reference_no ? escapeCell(item.reference_no) : "—";
            var products = formatPendingProductsCell(item.products_sold_lines, item.id);
            return (
                "<tr>" +
                '<td class="inv-col-date">' + formatPendingDate(item.purchase_date) + "</td>" +
                '<td class="inv-col-invoice">' + invoiceNo + "</td>" +
                '<td class="inv-col-name">' + formatPendingCustomer(item) + "</td>" +
                '<td class="inv-col-name inv-col-products">' + products + "</td>" +
                '<td class="inv-mgmt-cell--num inv-col-amount">₹ ' + InventoryApi.formatMoney(item.amount) + "</td>" +
                "</tr>"
            );
        }).join("");

        syncPendingPaymentsCards();

        if (totalEl) {
            var total = Number(data.total_amount) || 0;
            var totalCount = Number(data.count) || items.length;
            totalEl.hidden = false;
            totalEl.textContent = totalCount + " unpaid • Total ₹ " + InventoryApi.formatMoney(total);
        }
    }

    function loadPendingPayments(period, options) {
        options = options || {};
        if (period) {
            setPendingPaymentsPeriod(period);
        }

        if (!InventoryBusiness.getActiveId()) {
            renderPendingPaymentsTable({ items: [] });
            return Promise.resolve();
        }

        var tbody = document.getElementById("dashboard-pending-payments-body");
        if (tbody && options.showLoading) {
            tbody.innerHTML =
                '<tr class="inv-dashboard-table-row--message">' +
                "<td colspan=\"5\">Loading...</td>" +
                "</tr>";
        }

        return apiRequest("/pending-payments/?period=" + encodeURIComponent(pendingPaymentsPeriod))
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    renderPendingPaymentsTable(body.data);
                } else {
                    renderPendingPaymentsTable({ items: [] });
                    if (!options.silent) {
                        InventoryToast.error(body.message || "Failed to load pending payments.");
                    }
                }
            })
            .catch(function () {
                renderPendingPaymentsTable({ items: [] });
                if (!options.silent) {
                    InventoryToast.error("Network error while loading pending payments.");
                }
            });
    }

    function loadSalesChart(period, options) {
        options = options || {};
        if (period) {
            setSalesChartPeriod(period);
        }

        if (!InventoryBusiness.getActiveId()) {
            renderAmountChart("dashboard-sales-chart", [], "sale", salesChartPeriod);
            return Promise.resolve();
        }

        var container = document.getElementById("dashboard-sales-chart");
        if (container && options.showLoading) {
            container.innerHTML = '<div class="inv-dashboard-chart-empty">Loading...</div>';
        }

        return apiRequest("/sales-chart/?period=" + encodeURIComponent(salesChartPeriod))
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    renderAmountChart(
                        "dashboard-sales-chart",
                        body.data.series || [],
                        "sale",
                        body.data.period || salesChartPeriod
                    );
                } else {
                    renderAmountChart("dashboard-sales-chart", [], "sale", salesChartPeriod);
                    if (!options.silent) {
                        InventoryToast.error(body.message || "Failed to load sales chart.");
                    }
                }
            })
            .catch(function () {
                renderAmountChart("dashboard-sales-chart", [], "sale", salesChartPeriod);
                if (!options.silent) {
                    InventoryToast.error("Network error while loading sales chart.");
                }
            });
    }

    function loadDashboard() {
        if (!InventoryBusiness.getActiveId()) {
            renderStatCards();
            updateKpiCounts({
                purchases: { count: 0, period: purchasesKpiPeriod },
                sales: { count: 0, period: salesKpiPeriod }
            });
            updateKpiCount("expiring", 0);
            renderAmountChart("dashboard-sales-chart", [], "sale", salesChartPeriod);
            renderPendingPaymentsTable({ items: [] });
            return;
        }

        renderStatCards();
        InventoryLoader.show();
        Promise.all([
            loadKpiCounts({ showLoading: true, silent: true }),
            loadSalesChart(salesChartPeriod, { showLoading: true, silent: true }),
            loadPendingPayments(pendingPaymentsPeriod, { showLoading: true, silent: true }),
            loadExpiringProducts(expiringProductsPeriod, { showLoading: true, silent: true })
        ])
            .catch(function () {
                InventoryToast.error("Network error while loading dashboard.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function initChartFilters() {
        var filters = document.getElementById("dashboard-sales-chart-filters");
        if (!filters) return;

        filters.addEventListener("click", function (event) {
            var btn = event.target.closest("[data-period]");
            if (!btn) return;
            var period = btn.getAttribute("data-period");
            if (!period || period === salesChartPeriod) return;
            loadSalesChart(period, { showLoading: true });
        });
    }

    function initPendingPaymentsFilters() {
        var filters = document.getElementById("dashboard-pending-payments-filters");
        if (!filters) return;

        filters.addEventListener("click", function (event) {
            var btn = event.target.closest("[data-period]");
            if (!btn) return;
            var period = btn.getAttribute("data-period");
            if (!period || period === pendingPaymentsPeriod) return;
            loadPendingPayments(period, { showLoading: true });
        });
    }

    function initPendingProductsToggle() {
        var tbody = document.getElementById("dashboard-pending-payments-body");
        if (!tbody) return;

        tbody.addEventListener("click", function (e) {
            var toggleBtn = e.target.closest(".inv-products-sold-toggle");
            if (!toggleBtn) return;
            e.preventDefault();
            e.stopPropagation();
            var wrap = toggleBtn.closest(".inv-products-sold");
            if (!wrap) return;
            var collapsed = wrap.querySelector(".inv-products-sold-collapsed");
            var expanded = wrap.querySelector(".inv-products-sold-expanded");
            if (collapsed) collapsed.classList.toggle("inv-hidden");
            if (expanded) expanded.classList.toggle("inv-hidden");
        });
    }

    function initStatKpiFilters() {
        var grid = document.getElementById("dashboard-stat-cards");
        if (!grid || grid.dataset.statKpiWired === "1") return;
        grid.dataset.statKpiWired = "1";

        grid.addEventListener("click", function (event) {
            var btn = event.target.closest(".inv-dashboard-stat-kpi-filters [data-period]");
            if (!btn) return;
            event.preventDefault();
            event.stopPropagation();

            var filters = btn.closest(".inv-dashboard-stat-kpi-filters");
            var kpiKey = filters.getAttribute("data-kpi");
            var period = btn.getAttribute("data-period");
            if (!kpiKey || !period || period === getKpiPeriod(kpiKey)) return;

            if (kpiKey === "expiring") {
                loadExpiringProducts(period, { showLoading: true });
                return;
            }
            if (kpiKey === "purchases") {
                loadKpiCounts({ purchasesPeriod: period, purchasesOnly: true, showLoading: true });
                return;
            }
            if (kpiKey === "sales") {
                loadKpiCounts({ salesPeriod: period, salesOnly: true, showLoading: true });
            }
        });
    }

    function init() {
        initChartFilters();
        initPendingPaymentsFilters();
        initStatKpiFilters();
        initPendingProductsToggle();

        function boot() {
            loadDashboard();
        }

        InventoryBusiness.whenReady(boot);
        window.addEventListener("inventory:business-changed", boot);
    }

    return { init: init };
})();
