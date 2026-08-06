define("auth", function (require, module, exports) {
    "use strict";
    var c = require("constants");

    function setSession(tokens, user) {
        if (tokens) {
            if (tokens.access) localStorage.setItem(c.TOKEN_KEY, tokens.access);
            if (tokens.refresh) localStorage.setItem(c.REFRESH_KEY, tokens.refresh);
        }
        if (user) localStorage.setItem(c.USER_KEY, JSON.stringify(user));
    }

    function getAccessToken() { return localStorage.getItem(c.TOKEN_KEY); }
    function getRefreshToken() { return localStorage.getItem(c.REFRESH_KEY); }
    function setAccessToken(token) { localStorage.setItem(c.TOKEN_KEY, token); }

    function getUser() {
        try { return JSON.parse(localStorage.getItem(c.USER_KEY)); }
        catch (e) { return null; }
    }

    function isAuthenticated() { return !!getAccessToken(); }

    function clear() {
        localStorage.removeItem(c.TOKEN_KEY);
        localStorage.removeItem(c.REFRESH_KEY);
        localStorage.removeItem(c.USER_KEY);
    }

    /** Redirect to login if there is no token (used to guard pages). */
    function requireAuth() {
        if (!isAuthenticated()) {
            window.location.href = c.LOGIN_URL;
            return false;
        }
        return true;
    }

    module.exports = {
        setSession: setSession,
        getAccessToken: getAccessToken,
        getRefreshToken: getRefreshToken,
        setAccessToken: setAccessToken,
        getUser: getUser,
        isAuthenticated: isAuthenticated,
        requireAuth: requireAuth,
        clear: clear
    };
});
