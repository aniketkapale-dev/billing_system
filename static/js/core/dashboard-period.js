/**
 * Dashboard period helpers — date ranges aligned with apps/dashboard/services.py
 */
var InventoryDashboardPeriod = (function () {
    "use strict";

    var KPI_PERIODS = { day: true, week: true, month: true };

    function normalizePeriod(period) {
        period = (period || "week").toLowerCase();
        return KPI_PERIODS[period] ? period : "week";
    }

    function todayLocal() {
        var now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    function formatIsoDate(date) {
        var y = date.getFullYear();
        var m = String(date.getMonth() + 1).padStart(2, "0");
        var d = String(date.getDate()).padStart(2, "0");
        return y + "-" + m + "-" + d;
    }

    function getKpiDateRange(period) {
        period = normalizePeriod(period);
        var today = todayLocal();
        var from;
        var to;

        if (period === "day") {
            from = today;
            to = today;
        } else if (period === "month") {
            from = new Date(today.getFullYear(), today.getMonth(), 1);
            to = today;
        } else {
            from = new Date(today.getTime());
            from.setDate(from.getDate() - 6);
            to = today;
        }

        return {
            period: period,
            from: formatIsoDate(from),
            to: formatIsoDate(to)
        };
    }

    function getExpiringDateRange(period) {
        period = normalizePeriod(period);
        var today = todayLocal();
        var from;
        var to;

        if (period === "day") {
            from = today;
            to = today;
        } else if (period === "month") {
            from = today;
            var nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
            to = new Date(nextMonth.getTime() - 86400000);
        } else {
            from = today;
            to = new Date(today.getTime());
            to.setDate(to.getDate() + 6);
        }

        return {
            period: period,
            from: formatIsoDate(from),
            to: formatIsoDate(to)
        };
    }

    function buildStockInLink(period) {
        var range = getKpiDateRange(period);
        var params = new URLSearchParams();
        params.set("period", range.period);
        params.set("date_from", range.from);
        params.set("date_to", range.to);
        return "/dashboard/stock-in/?" + params.toString();
    }

    function buildSalesLink(period, extra) {
        var range = getKpiDateRange(period);
        var params = new URLSearchParams();
        params.set("period", range.period);
        params.set("date_from", range.from);
        params.set("date_to", range.to);
        // Match dashboard KPI: finalized sales only (exclude drafts & cancelled).
        if (!extra || !extra.invoice_status) {
            params.set("invoice_status", "finalized");
        }
        if (extra) {
            Object.keys(extra).forEach(function (key) {
                if (extra[key] !== undefined && extra[key] !== null && extra[key] !== "") {
                    params.set(key, extra[key]);
                }
            });
        }
        return "/dashboard/purchases/?" + params.toString();
    }

    function buildInventoryExpiringLink(period) {
        var range = getExpiringDateRange(period);
        var params = new URLSearchParams();
        params.set("tab", "batches");
        params.set("period", range.period);
        params.set("expiry_from", range.from);
        params.set("expiry_to", range.to);
        return "/dashboard/inventory/?" + params.toString();
    }

    function applyDateRangeInputs(fromEl, toEl, period) {
        if (!fromEl || !toEl) return;
        var range = getKpiDateRange(period);
        if (typeof InventoryApi !== "undefined") {
            InventoryApi.setDateInputValue(fromEl, range.from);
            InventoryApi.setDateInputValue(toEl, range.to);
            return;
        }
        fromEl.value = range.from;
        toEl.value = range.to;
    }

    function parseUrlPeriodFilters() {
        var params = new URLSearchParams(window.location.search);
        return {
            period: params.get("period"),
            dateFrom: params.get("date_from"),
            dateTo: params.get("date_to"),
            expiryFrom: params.get("expiry_from"),
            expiryTo: params.get("expiry_to"),
            tab: params.get("tab"),
            invoiceStatus: params.get("invoice_status")
        };
    }

    return {
        normalizePeriod: normalizePeriod,
        getKpiDateRange: getKpiDateRange,
        getExpiringDateRange: getExpiringDateRange,
        buildStockInLink: buildStockInLink,
        buildSalesLink: buildSalesLink,
        buildInventoryExpiringLink: buildInventoryExpiringLink,
        applyDateRangeInputs: applyDateRangeInputs,
        parseUrlPeriodFilters: parseUrlPeriodFilters
    };
})();
