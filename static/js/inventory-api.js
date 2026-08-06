/**
 * Shared authenticated API helper for business-owner inventory pages.
 */
var InventoryApi = (function () {
    "use strict";

    var TOKEN_KEY = "vrms_access_token";

    function buildUrl(basePath, path) {
        path = path == null ? "" : String(path);
        var base = basePath.replace(/\/+$/, "");
        if (!path) {
            return base + "/";
        }
        if (path.charAt(0) === "?") {
            return base + "/" + path;
        }
        if (path.charAt(0) !== "/") {
            path = "/" + path;
        }
        return base + path;
    }

    function authHeaders(opts) {
        opts = opts || {};
        var headers = { "Content-Type": "application/json" };
        var token = localStorage.getItem(TOKEN_KEY);
        if (token) headers["Authorization"] = "Bearer " + token;

        if (!opts.skipBusiness && window.InventoryBusiness) {
            var businessId = InventoryBusiness.getActiveId();
            if (businessId) headers["X-Business-Id"] = businessId;
        }
        return headers;
    }

    function request(basePath, path, opts) {
        opts = opts || {};
        var skipBusiness = opts.skipBusiness;
        if (skipBusiness === undefined) {
            skipBusiness = String(basePath).indexOf("/api/businesses") !== -1;
        }
        return fetch(buildUrl(basePath, path), {
            method: opts.method || "GET",
            headers: authHeaders({ skipBusiness: skipBusiness }),
            body: opts.body ? JSON.stringify(opts.body) : undefined,
            cache: "no-store"
        }).then(function (res) {
            return res.json();
        });
    }

    function escapeHtml(str) {
        var div = document.createElement("div");
        div.textContent = str == null ? "" : String(str);
        return div.innerHTML;
    }

    function formatMoney(value) {
        var num = Number(value || 0);
        return num.toFixed(2);
    }

    return {
        buildUrl: buildUrl,
        request: request,
        escapeHtml: escapeHtml,
        formatMoney: formatMoney
    };
})();
