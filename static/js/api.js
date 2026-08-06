define("api", function (require, module, exports) {
    "use strict";
    var c = require("constants");
    var auth = null;
    var loader = require("loader");
    var toast = require("toast");

    var isRefreshing = false;

    try {
        auth = require("auth");
    } catch (e) {
        auth = null;
    }

    function buildUrl(path) {
        if (/^https?:/i.test(path)) return path;
        if (path.charAt(0) !== "/") path = "/" + path;
        return c.API_BASE + path;
    }

    function authHeaders(extra) {
        var headers = extra || {};
            if (auth) {
                var token = auth.getAccessToken();
                if (token) headers["Authorization"] = "Bearer " + token;
            }
        return headers;
    }

    /** Attempt to refresh the access token once. Returns true on success. */
    function tryRefresh() {
        if (!auth)
            return Promise.resolve(false);
        
        var refresh = auth.getRefreshToken();

        if (!refresh) return Promise.resolve(false);
        return fetch(buildUrl("/auth/refresh/"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh: refresh })
        })
            .then(function (res) { return res.json(); })
            .then(function (body) {
                if (body && body.isSuccess && body.data && body.data.access) {
                    auth.setAccessToken(body.data.access);
                    return true;
                }
                return false;
            })
            .catch(function () { return false; });
    }

    /**
     * Core request. Handles JSON + multipart, JWT, one-shot token refresh on 401,
     * the global loader, and uniform error surfacing via toast.
     *
     * opts: { method, body, isForm, silent, showLoader }
     */
    function request(path, opts) {
        opts = opts || {};
        var method = (opts.method || "GET").toUpperCase();
        var showLoader = opts.showLoader !== false;

        function doFetch() {
            var headers = authHeaders({});
            var fetchOpts = { method: method, headers: headers };

            if (opts.body !== undefined && opts.body !== null) {
                if (opts.isForm) {
                    fetchOpts.body = opts.body; // FormData; browser sets boundary
                } else {
                    headers["Content-Type"] = "application/json";
                    fetchOpts.body = JSON.stringify(opts.body);
                }
            }
            return fetch(buildUrl(path), fetchOpts);
        }

        if (showLoader) loader.show();

        return doFetch()
            .then(function (res) {
                // Auto-refresh once on expiry.
                if (auth && res.status === 401 && !isRefreshing && auth.getRefreshToken()) {
                    isRefreshing = true;
                    return tryRefresh().then(function (ok) {
                        isRefreshing = false;
                        if (ok) return doFetch();
                        if (auth)
                            auth.clear();
                        window.location.href = c.LOGIN_URL;
                        return res;
                    });
                }
                return res;
            })
            .then(function (res) {
                var ct = res.headers.get("content-type") || "";
                if (ct.indexOf("application/json") === -1) {
                    return { isSuccess: res.ok, data: {}, errors: [], message: res.statusText, _status: res.status };
                }
                return res.json().then(function (body) {
                    body._status = res.status;
                    return body;
                });
            })
            .then(function (body) {
                if (showLoader) loader.hide();
                if (body && body.isSuccess === false && !opts.silent) {
                    var msg = body.message || "Request failed";
                    if (body.errors && body.errors.length) msg = body.errors.join(" • ");
                    toast.error(msg);
                }
                return body;
            })
            .catch(function (err) {
                if (showLoader) loader.hide();
                if (!opts.silent) toast.error("Network error. Please try again.");
                throw err;
            });
    }

    module.exports = {
        request: request,
        get: function (path, opts) { return request(path, Object.assign({ method: "GET" }, opts)); },
        post: function (path, body, opts) { return request(path, Object.assign({ method: "POST", body: body }, opts)); },
        put: function (path, body, opts) { return request(path, Object.assign({ method: "PUT", body: body }, opts)); },
        patch: function (path, body, opts) { return request(path, Object.assign({ method: "PATCH", body: body }, opts)); },
        del: function (path, opts) { return request(path, Object.assign({ method: "DELETE" }, opts)); },
        postForm: function (path, formData, opts) {
            return request(path, Object.assign({ method: "POST", body: formData, isForm: true }, opts));
        },
        putForm: function (path, formData, opts) {
            return request(path, Object.assign({ method: "PUT", body: formData, isForm: true }, opts));
        }
    };
});
