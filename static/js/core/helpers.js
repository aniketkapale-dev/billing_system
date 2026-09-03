define("helpers", function (require, module, exports) {
    "use strict";

    function escapeHtml(value) {
        if (value === null || value === undefined) return "";
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function formatDate(value) {
        if (!value) return "";
        var d = new Date(value);
        if (isNaN(d.getTime())) return value;
        return d.toLocaleString();
    }

    function debounce(fn, wait) {
        var timer;
        return function () {
            var ctx = this, args = arguments;
            clearTimeout(timer);
            timer = setTimeout(function () { fn.apply(ctx, args); }, wait || 300);
        };
    }

    function getQueryString(params) {
        var parts = [];
        Object.keys(params || {}).forEach(function (key) {
            var val = params[key];
            if (val !== null && val !== undefined && val !== "") {
                parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(val));
            }
        });
        return parts.length ? "?" + parts.join("&") : "";
    }

    function titleCase(str) {
        if (!str) return "";
        return String(str).replace(/_/g, " ").replace(/\b\w/g, function (c) {
            return c.toUpperCase();
        });
    }

    module.exports = {
        escapeHtml: escapeHtml,
        formatDate: formatDate,
        debounce: debounce,
        getQueryString: getQueryString,
        titleCase: titleCase
    };
});
