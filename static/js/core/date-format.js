/**
 * Shared date display formatting for the Billing System UI.
 * API inputs and <input type="date"> values stay YYYY-MM-DD.
 */
var InventoryDateFormat = (function () {
    "use strict";

    function parseDateParts(value) {
        if (value === null || value === undefined) return null;
        var str = String(value).trim();
        if (!str) return null;

        var iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (iso) {
            return { day: iso[3], month: iso[2], year: iso[1] };
        }

        var dmy = str.match(/^(\d{2})-(\d{2})-(\d{4})/);
        if (dmy) {
            return { day: dmy[1], month: dmy[2], year: dmy[3] };
        }

        var dmySlash = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
        if (dmySlash) {
            return { day: dmySlash[1], month: dmySlash[2], year: dmySlash[3] };
        }

        var parsed = new Date(str);
        if (isNaN(parsed.getTime())) return null;
        return {
            day: String(parsed.getDate()).padStart(2, "0"),
            month: String(parsed.getMonth() + 1).padStart(2, "0"),
            year: String(parsed.getFullYear())
        };
    }

    function formatDisplayDate(value, emptyValue) {
        if (value === null || value === undefined || String(value).trim() === "") {
            return emptyValue !== undefined ? emptyValue : "";
        }
        var parts = parseDateParts(value);
        if (!parts) return String(value);
        return parts.day + "-" + parts.month + "-" + parts.year;
    }

    function hasTimeComponent(value) {
        return /T\d{2}:\d{2}/.test(String(value || "")) || /\d{1,2}:\d{2}(:\d{2})?/.test(String(value || ""));
    }

    function formatDateTime(value, emptyValue) {
        if (value === null || value === undefined || String(value).trim() === "") {
            return emptyValue !== undefined ? emptyValue : "";
        }
        var datePart = formatDisplayDate(value);
        if (!hasTimeComponent(value)) return datePart;

        var parsed = new Date(String(value).trim());
        if (isNaN(parsed.getTime())) return datePart;

        var hours = String(parsed.getHours()).padStart(2, "0");
        var mins = String(parsed.getMinutes()).padStart(2, "0");
        return datePart + " " + hours + ":" + mins;
    }

    function toInputDateValue(value) {
        if (value === null || value === undefined || String(value).trim() === "") return "";
        var str = String(value).trim();
        var iso = str.match(/^(\d{4}-\d{2}-\d{2})/);
        if (iso) return iso[1];
        var dmy = str.match(/^(\d{2})-(\d{2})-(\d{4})/);
        if (dmy) return dmy[3] + "-" + dmy[2] + "-" + dmy[1];
        var parsed = new Date(str);
        if (isNaN(parsed.getTime())) return "";
        return parsed.toISOString().slice(0, 10);
    }

    function formatBarcodeDate(value) {
        var parts = parseDateParts(value || new Date().toISOString());
        if (!parts) return "";
        return parts.year + parts.month + parts.day;
    }

    return {
        formatDisplayDate: formatDisplayDate,
        formatDateTime: formatDateTime,
        toInputDateValue: toInputDateValue,
        formatBarcodeDate: formatBarcodeDate
    };
})();
