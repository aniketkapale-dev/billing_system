var InventoryActivityLog = (function () {
    "use strict";
    var page = 1;
    var requestNumber = 0;
    var labels = {expenses: "Expenses", sales: "Sales", purchases: "Purchases", payments: "Payments", tax: "Tax and categories", products: "Products", stock: "Stock", customers: "Customers", team: "Team access", settings: "Settings", business: "Business profile"};
    function value(id) { return document.getElementById(id).value.trim(); }
    function dateValue(id) { return InventoryApi.getDateInputValue(document.getElementById(id)); }
    function message(text) {
        document.getElementById("activity-table-body").innerHTML = '<tr><td colspan="4" class="inv-mgmt-empty">' + InventoryApi.escapeHtml(text) + '</td></tr>';
    }
    function load(nextPage) {
        var business = InventoryBusiness.getActiveId();
        if (!business) { message("Select a business to see its activity."); return Promise.resolve(); }
        var from = dateValue("activity-from");
        var to = dateValue("activity-to");
        if (from && to && from > to) { message("The From date must be on or before the To date."); return Promise.resolve(); }
        page = nextPage || 1;
        var sequence = ++requestNumber;
        var params = new URLSearchParams({page: page, page_size: InventoryPagination.getPageSize("activity-pagination"), search: value("activity-search"), area: value("activity-area"), date_from: from, date_to: to});
        return InventoryApi.request("/api/activity-log", "?" + params.toString()).then(function (body) {
            if (sequence !== requestNumber || String(business) !== String(InventoryBusiness.getActiveId())) return;
            if (!body || !body.isSuccess) {
                message(body && body.message || "Unable to load activity. Please try again.");
                InventoryPagination.render("activity-pagination", null, load);
                return;
            }
            var items = body.data.items || [];
            if (!items.length) message("No activity found for these filters. New business changes will appear here.");
            else document.getElementById("activity-table-body").innerHTML = items.map(function (item) {
                return '<tr><td>' + InventoryApi.escapeHtml(InventoryApi.formatDateTime(item.occurred_at)) + '</td><td>' + InventoryApi.escapeHtml(item.actor_name) + '</td><td>' + InventoryApi.escapeHtml(labels[item.area] || item.area) + '</td><td style="white-space:normal;">' + InventoryApi.escapeHtml(item.description) + '</td></tr>';
            }).join("");
            InventoryPagination.render("activity-pagination", body.data.pagination, load, {onPageSizeChange: function () { load(1); }});
        }).catch(function () { if (sequence === requestNumber) message("Unable to load activity. Check your connection and try again."); });
    }
    function init() {
        var timer;
        document.getElementById("activity-search").addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(function () { load(1); }, 300); });
        ["activity-area", "activity-from", "activity-to"].forEach(function (id) { document.getElementById(id).addEventListener("change", function () { load(1); }); });
        document.getElementById("activity-clear").addEventListener("click", function () {
            ["activity-search", "activity-area", "activity-from", "activity-to"].forEach(function (id) { document.getElementById(id).value = ""; });
            load(1);
        });
        InventoryBusiness.whenReady(function () { load(1); });
        window.addEventListener("inventory:business-changed", function () { ++requestNumber; message("Loading activity..."); load(1); });
        InventoryApi.watch(["/api/"], function () { return load(page); });
    }
    return {init: init};
})();
