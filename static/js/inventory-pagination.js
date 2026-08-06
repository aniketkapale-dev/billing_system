/**
 * Reusable pagination renderer for InventoryPro API responses.
 */
var InventoryPagination = (function () {
    "use strict";

    function render(containerId, pagination, onChange, options) {
        var root = document.getElementById(containerId);
        if (!root) return;

        root.innerHTML = "";
        if (!pagination) return;

        options = options || {};
        var label = options.label || "records";
        var pageSize = pagination.page_size || ((window.InventoryConstants && InventoryConstants.PAGE_SIZE) || 10);
        var current = pagination.page;
        var total = pagination.total_pages || 1;
        var count = pagination.count || 0;
        var start = count ? (current - 1) * pageSize + 1 : 0;
        var end = count ? Math.min(current * pageSize, count) : 0;

        var info = document.createElement("div");
        info.className = "inv-pagination-info";
        if (count) {
            info.textContent =
                "Showing " + start + "\u2013" + end + " of " + count + " " + label +
                " \u2022 " + pageSize + " per page \u2022 Page " + current + " of " + total;
        } else {
            info.textContent = "No " + label + " found";
        }

        root.appendChild(info);
        if (total <= 1) return;

        var nav = document.createElement("ul");
        nav.className = "inv-pagination-nav";

        function addButton(label, page, disabled, active) {
            var li = document.createElement("li");
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "inv-pagination-btn" + (active ? " inv-pagination-btn--active" : "");
            btn.innerHTML = label;
            btn.disabled = !!disabled;
            if (!disabled && !active) {
                btn.addEventListener("click", function () {
                    onChange(page);
                });
            }
            li.appendChild(btn);
            nav.appendChild(li);
        }

        addButton("&laquo;", current - 1, !pagination.has_previous, false);

        var start = Math.max(1, current - 2);
        var end = Math.min(total, current + 2);

        if (start > 1) addButton("1", 1, false, current === 1);
        if (start > 2) addButton("...", current, true, false);

        for (var p = start; p <= end; p++) {
            addButton(String(p), p, false, p === current);
        }

        if (end < total - 1) addButton("...", current, true, false);
        if (end < total) addButton(String(total), total, false, current === total);

        addButton("&raquo;", current + 1, !pagination.has_next, false);

        root.appendChild(nav);
    }

    return { render: render };
})();
