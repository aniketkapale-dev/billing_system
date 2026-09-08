/**
 * Shared authenticated API helper for business-owner inventory pages.
 */
var InventoryApi = (function () {
    "use strict";

    var TOKEN_KEY = "vrms_access_token";
    var REFRESH_KEY = "vrms_refresh_token";
    var USER_KEY = "vrms_user";
    var LOGIN_URL = "/login/";
    var AUTH_API = "/api/auth";

    var refreshPromise = null;
    var expiryTimer = null;
    var loggingOut = false;

    function decodeJwtPayload(token) {
        var parts = String(token || "").split(".");
        if (parts.length < 2) return null;

        var base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        var pad = base64.length % 4;
        if (pad) base64 += new Array(5 - pad).join("=");

        try {
            return JSON.parse(atob(base64));
        } catch (e) {
            return null;
        }
    }

    function clearSession() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_KEY);
        localStorage.removeItem(USER_KEY);
    }

    function logoutAndRedirect(message) {
        if (loggingOut) return;
        loggingOut = true;

        if (expiryTimer) {
            clearTimeout(expiryTimer);
            expiryTimer = null;
        }

        clearSession();

        if (message && typeof InventoryToast !== "undefined") {
            InventoryToast.warning(message);
        }

        window.location.replace(LOGIN_URL);
    }

    function tryRefreshToken() {
        if (refreshPromise) return refreshPromise;

        var refresh = localStorage.getItem(REFRESH_KEY);
        if (!refresh) return Promise.resolve(false);

        refreshPromise = fetch(AUTH_API + "/refresh/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh: refresh }),
            cache: "no-store"
        })
            .then(function (res) {
                return res.json();
            })
            .then(function (body) {
                if (body && body.isSuccess && body.data && body.data.access) {
                    localStorage.setItem(TOKEN_KEY, body.data.access);
                    scheduleSessionExpiry();
                    return true;
                }
                return false;
            })
            .catch(function () {
                return false;
            })
            .finally(function () {
                refreshPromise = null;
            });

        return refreshPromise;
    }

    function handleSessionExpired() {
        return tryRefreshToken().then(function (ok) {
            if (!ok) {
                logoutAndRedirect("Your session has expired. Please sign in again.");
            }
            return ok;
        });
    }

    function scheduleSessionExpiry() {
        if (expiryTimer) {
            clearTimeout(expiryTimer);
            expiryTimer = null;
        }

        var token = localStorage.getItem(TOKEN_KEY);
        var payload = decodeJwtPayload(token);
        if (!payload || !payload.exp) return;

        var expiresAt = payload.exp * 1000;
        var delay = expiresAt - Date.now();

        if (delay <= 0) {
            handleSessionExpired();
            return;
        }

        expiryTimer = window.setTimeout(function () {
            handleSessionExpired();
        }, Math.max(delay - 2000, 0));
    }

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

    function parseResponse(res) {
        var ct = res.headers.get("content-type") || "";
        if (ct.indexOf("application/json") === -1) {
            return {
                isSuccess: res.ok,
                data: {},
                errors: [],
                message: res.statusText,
                _status: res.status
            };
        }
        return res.json().then(function (body) {
            body._status = res.status;
            return body;
        });
    }

    function request(basePath, path, opts) {
        opts = opts || {};
        var skipBusiness = opts.skipBusiness;
        if (skipBusiness === undefined) {
            skipBusiness = String(basePath).indexOf("/api/businesses") !== -1;
        }

        function doFetch() {
            var headers = authHeaders({ skipBusiness: skipBusiness });
            var body = undefined;
            if (opts.body instanceof FormData) {
                delete headers["Content-Type"];
                body = opts.body;
            } else if (opts.body) {
                body = JSON.stringify(opts.body);
            }
            return fetch(buildUrl(basePath, path), {
                method: opts.method || "GET",
                headers: headers,
                body: body,
                cache: "no-store"
            });
        }

        function execute(retrying) {
            return doFetch().then(function (res) {
                if (res.status === 401 && !retrying) {
                    return tryRefreshToken().then(function (ok) {
                        if (ok) return execute(true);
                        logoutAndRedirect("Your session has expired. Please sign in again.");
                        return parseResponse(res);
                    });
                }
                return parseResponse(res);
            });
        }

        return execute(false);
    }

    function authFetch(url, fetchOpts, retrying) {
        fetchOpts = fetchOpts || {};
        var headers = Object.assign({}, fetchOpts.headers || {});
        var token = localStorage.getItem(TOKEN_KEY);
        if (token) headers["Authorization"] = "Bearer " + token;

        var nextOpts = Object.assign({}, fetchOpts, {
            headers: headers,
            cache: "no-store"
        });

        return fetch(url, nextOpts).then(function (res) {
            if (res.status === 401 && !retrying) {
                return tryRefreshToken().then(function (ok) {
                    if (ok) return authFetch(url, fetchOpts, true);
                    logoutAndRedirect("Your session has expired. Please sign in again.");
                    return res;
                });
            }
            return res;
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

    function renderViewGrid(rows, options) {
        options = options || {};
        var colsPerRow = options.columns || 4;
        var html = [];
        var buffer = [];

        function renderItem(row) {
            var cls = "inv-product-view-item";
            if (row.full) cls += " inv-product-view-item--full";
            if (row.colStart === 1) cls += " inv-product-view-item--col-1";
            if (row.emphasis) cls += " inv-product-view-item--emphasis";
            if (row.num) cls += " inv-product-view-item--num";
            return (
                '<div class="' + cls + '">' +
                '<span class="inv-product-view-label">' + String(row.label) + "</span>" +
                '<div class="inv-product-view-value">' + row.value + "</div>" +
                "</div>"
            );
        }

        function flushRow() {
            if (!buffer.length) return;
            html.push('<div class="inv-product-view-row">' + buffer.join("") + "</div>");
            buffer = [];
        }

        (rows || []).forEach(function (row) {
            if (row.full) {
                flushRow();
                html.push('<div class="inv-product-view-row">' + renderItem(row) + "</div>");
                return;
            }
            if (row.colStart === 1 && buffer.length) {
                flushRow();
            }
            buffer.push(renderItem(row));
            if (buffer.length >= colsPerRow) {
                flushRow();
            }
        });
        flushRow();
        return html.join("");
    }

    return {
        buildUrl: buildUrl,
        request: request,
        authFetch: authFetch,
        clearSession: clearSession,
        logoutAndRedirect: logoutAndRedirect,
        scheduleSessionExpiry: scheduleSessionExpiry,
        escapeHtml: escapeHtml,
        formatMoney: formatMoney,
        renderViewGrid: renderViewGrid
    };
})();
