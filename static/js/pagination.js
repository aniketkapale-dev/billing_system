define("pagination", function (require, module, exports) {
    "use strict";

    /**
     * Renders Bootstrap pagination into `containerId` from a pagination object
     * { page, total_pages, has_next, has_previous }. Calls onChange(page).
     */
    function render(containerId, pagination, onChange) {
        var el = document.getElementById(containerId);
        if (!el) return;
        el.innerHTML = "";
        if (!pagination || pagination.total_pages <= 1) return;

        var current = pagination.page;
        var total = pagination.total_pages;

        function item(label, page, disabled, active) {
            var li = document.createElement("li");
            li.className = "page-item" + (disabled ? " disabled" : "") + (active ? " active" : "");
            var a = document.createElement("a");
            a.className = "page-link";
            a.href = "#";
            a.innerHTML = label;
            a.addEventListener("click", function (e) {
                e.preventDefault();
                if (!disabled && !active) onChange(page);
            });
            li.appendChild(a);
            return li;
        }

        el.appendChild(item("&laquo;", current - 1, !pagination.has_previous, false));

        var start = Math.max(1, current - 2);
        var end = Math.min(total, current + 2);
        if (start > 1) el.appendChild(item("1", 1, false, current === 1));
        if (start > 2) el.appendChild(item("...", current, true, false));
        for (var p = start; p <= end; p++) {
            el.appendChild(item(String(p), p, false, p === current));
        }
        if (end < total - 1) el.appendChild(item("...", current, true, false));
        if (end < total) el.appendChild(item(String(total), total, false, current === total));

        el.appendChild(item("&raquo;", current + 1, !pagination.has_next, false));
    }

    module.exports = { render: render };
});
