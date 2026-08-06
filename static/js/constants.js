define("constants", function (require, module, exports) {
    "use strict";
    module.exports = {
        API_BASE: "/api",
        TOKEN_KEY: "vrms_access_token",
        REFRESH_KEY: "vrms_refresh_token",
        USER_KEY: "vrms_user",
        LOGIN_URL: "/admin/",
        DASHBOARD_URL: "/dashboard/",
        PAGE_SIZE: 10,
        TOAST_TIMEOUT: 3500
    };
});
