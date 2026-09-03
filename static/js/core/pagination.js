/**
 * Reusable pagination renderer for Billing System API responses.
 */
var InventoryPagination = (function () {
    "use strict";

    var PAGE_SIZE_OPTIONS = [10, 25, 50];
    var pageSizeState = {};

    function getPageSize(containerId) {
        return pageSizeState[containerId] || PAGE_SIZE_OPTIONS[0];
    }

    function setPageSize(containerId, size) {
        pageSizeState[containerId] = size;
    }

    function createPageSizeSelect(containerId, onChange, options) {
        var wrap = document.createElement("div");
        wrap.className = "inv-pagination-size";

        var label = document.createElement("label");
        label.className = "inv-pagination-size-label";
        label.textContent = "Records per page";
        label.setAttribute("for", containerId + "-page-size");

        var select = document.createElement("select");
        select.id = containerId + "-page-size";
        select.className = "inv-pagination-size-select";
        select.setAttribute("aria-label", "Select number of records per page");

        PAGE_SIZE_OPTIONS.forEach(function (size) {
            var option = document.createElement("option");
            option.value = String(size);
            option.textContent = String(size);
            if (size === getPageSize(containerId)) {
                option.selected = true;
            }
            select.appendChild(option);
        });

        select.addEventListener("change", function () {
            var newSize = Number(select.value);
            setPageSize(containerId, newSize);
            if (options && typeof options.onPageSizeChange === "function") {
                options.onPageSizeChange(newSize);
            } else if (typeof onChange === "function") {
                onChange(1);
            }
        });

        wrap.appendChild(label);
        wrap.appendChild(select);
        return wrap;
    }

    function createPageInfo(pagination) {
        var info = document.createElement("div");
        info.className = "inv-pagination-page-info";
        var current = pagination && pagination.page ? pagination.page : 1;
        var total = pagination && pagination.total_pages ? pagination.total_pages : 1;
        info.textContent = "Page " + current + " of " + total;
        return info;
    }

    function render(containerId, pagination, onChange, options) {
        var root = document.getElementById(containerId);
        if (!root) return;

        options = options || {};
        root.innerHTML = "";

        root.appendChild(createPageSizeSelect(containerId, onChange, options));

        var right = document.createElement("div");
        right.className = "inv-pagination-right";
        right.appendChild(createPageInfo(pagination));

        var total = pagination && pagination.total_pages ? pagination.total_pages : 1;

        if (pagination && total > 1) {
            var current = pagination.page;

            var controls = document.createElement("div");
            controls.className = "inv-pagination-controls";

            var nav = document.createElement("ul");
            nav.className = "inv-pagination-nav";
            nav.setAttribute("aria-label", "Pagination");

            function addButton(label, page, disabled, active, ariaLabel) {
                var li = document.createElement("li");
                var btn = document.createElement("button");
                btn.type = "button";
                btn.className = "inv-pagination-btn" + (active ? " inv-pagination-btn--active" : "");
                btn.innerHTML = label;
                btn.disabled = !!disabled;
                if (ariaLabel) btn.setAttribute("aria-label", ariaLabel);
                if (active) btn.setAttribute("aria-current", "page");
                if (!disabled && !active) {
                    btn.addEventListener("click", function () {
                        onChange(page);
                    });
                }
                li.appendChild(btn);
                nav.appendChild(li);
            }

            addButton('<span class="material-symbols-outlined">chevron_left</span>', current - 1, !pagination.has_previous, false, "Previous page");

            var rangeStart = Math.max(1, current - 2);
            var rangeEnd = Math.min(total, current + 2);

            if (rangeStart > 1) addButton("1", 1, false, current === 1);
            if (rangeStart > 2) addButton("&hellip;", current, true, false);

            for (var p = rangeStart; p <= rangeEnd; p++) {
                addButton(String(p), p, false, p === current);
            }

            if (rangeEnd < total - 1) addButton("&hellip;", current, true, false);
            if (rangeEnd < total) addButton(String(total), total, false, current === total);

            addButton('<span class="material-symbols-outlined">chevron_right</span>', current + 1, !pagination.has_next, false, "Next page");

            controls.appendChild(nav);
            right.appendChild(controls);
        }

        root.appendChild(right);
    }

    return {
        render: render,
        getPageSize: getPageSize,
        PAGE_SIZE_OPTIONS: PAGE_SIZE_OPTIONS
    };
})();
