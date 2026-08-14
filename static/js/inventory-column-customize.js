/**
 * Customize table columns: show/hide, reorder, persist per table.
 */
var InventoryColumnCustomize = (function () {
    "use strict";

    var STORAGE_PREFIX = "inv_table_cols_";
    var modalEl = null;
    var activeCtrl = null;
    var draftState = null;

    function loadState(tableKey, columns) {
        try {
            var raw = localStorage.getItem(STORAGE_PREFIX + tableKey);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }

    function saveState(tableKey, state) {
        localStorage.setItem(STORAGE_PREFIX + tableKey, JSON.stringify(state));
    }

    function defaultState(columns) {
        return {
            order: columns.map(function (col) { return col.id; }),
            visible: columns.reduce(function (acc, col) {
                acc[col.id] = col.defaultVisible !== false;
                return acc;
            }, {})
        };
    }

    function normalizeState(columns, saved) {
        var base = defaultState(columns);
        if (!saved || !saved.order || !saved.visible) return base;

        var known = columns.reduce(function (acc, col) {
            acc[col.id] = col;
            return acc;
        }, {});

        var order = saved.order.filter(function (id) { return known[id]; });
        columns.forEach(function (col) {
            if (order.indexOf(col.id) === -1) order.push(col.id);
        });

        var visible = {};
        columns.forEach(function (col) {
            if (col.locked) {
                visible[col.id] = true;
            } else if (Object.prototype.hasOwnProperty.call(saved.visible, col.id)) {
                visible[col.id] = !!saved.visible[col.id];
            } else {
                visible[col.id] = base.visible[col.id];
            }
        });

        return { order: order, visible: visible };
    }

    function ensureModal() {
        if (modalEl) return modalEl;

        modalEl = document.createElement("div");
        modalEl.id = "inv-columns-modal";
        modalEl.className = "inv-modal inv-hidden";
        modalEl.setAttribute("aria-hidden", "true");
        modalEl.innerHTML =
            '<div class="inv-modal-backdrop" data-columns-close></div>' +
            '<div class="inv-modal-dialog inv-columns-dialog" role="dialog" aria-modal="true" aria-labelledby="inv-columns-modal-title">' +
            '<div class="inv-modal-header inv-columns-modal-header">' +
            '<div class="inv-columns-modal-title-wrap">' +
            '<span class="material-symbols-outlined">view_column</span>' +
            '<h3 id="inv-columns-modal-title">Customize Columns</h3>' +
            "</div>" +
            '<div class="inv-columns-modal-meta">' +
            '<span id="inv-columns-selected-count"></span>' +
            '<button type="button" class="inv-modal-close" data-columns-close aria-label="Close">' +
            '<span class="material-symbols-outlined">close</span></button>' +
            "</div></div>" +
            '<div class="inv-modal-body inv-columns-modal-body">' +
            '<input type="search" id="inv-columns-search" class="inv-mgmt-search inv-columns-search" placeholder="Search" aria-label="Search columns"/>' +
            '<ul id="inv-columns-list" class="inv-columns-list"></ul>' +
            "</div>" +
            '<div class="inv-modal-footer">' +
            '<button type="button" class="inv-mgmt-btn inv-mgmt-btn--primary" id="inv-columns-save-btn">Save</button>' +
            '<button type="button" class="inv-mgmt-btn" data-columns-close>Cancel</button>' +
            "</div></div>";

        document.body.appendChild(modalEl);

        modalEl.querySelectorAll("[data-columns-close]").forEach(function (btn) {
            btn.addEventListener("click", closeModal);
        });

        document.getElementById("inv-columns-save-btn").addEventListener("click", function () {
            if (!activeCtrl || !draftState) return;

            var ctrl = activeCtrl;
            ctrl.state = {
                order: draftState.order.slice(),
                visible: Object.assign({}, draftState.visible)
            };
            saveState(ctrl.tableKey, ctrl.state);
            closeModal();
            ctrl.renderHeader();
            if (typeof ctrl.onApply === "function") {
                ctrl.onApply();
            }
        });

        document.getElementById("inv-columns-search").addEventListener("input", function (e) {
            filterList(e.target.value.trim().toLowerCase());
        });

        return modalEl;
    }

    function closeModal() {
        if (!modalEl) return;
        modalEl.classList.add("inv-hidden");
        modalEl.setAttribute("aria-hidden", "true");
        activeCtrl = null;
        draftState = null;
    }

    function filterList(query) {
        var list = document.getElementById("inv-columns-list");
        if (!list) return;
        list.querySelectorAll(".inv-columns-item").forEach(function (item) {
            var label = (item.getAttribute("data-label") || "").toLowerCase();
            item.classList.toggle("inv-hidden", query && label.indexOf(query) === -1);
        });
    }

    function updateSelectedCount() {
        var countEl = document.getElementById("inv-columns-selected-count");
        if (!countEl || !activeCtrl || !draftState) return;

        var total = activeCtrl.columns.length;
        var selected = activeCtrl.columns.filter(function (col) {
            return draftState.visible[col.id];
        }).length;
        countEl.textContent = selected + " of " + total + " Selected";
    }

    function renderModalList() {
        var list = document.getElementById("inv-columns-list");
        if (!list || !activeCtrl || !draftState) return;

        list.innerHTML = draftState.order.map(function (id) {
            var col = activeCtrl.columnMap[id];
            if (!col) return "";

            var locked = !!col.locked;
            var checked = !!draftState.visible[id];
            var control = locked
                ? '<span class="inv-columns-lock" title="Required column"><span class="material-symbols-outlined">lock</span></span>'
                : '<input type="checkbox" class="inv-columns-check" data-col-id="' + id + '"' + (checked ? " checked" : "") + "/>";

            return (
                '<li class="inv-columns-item" draggable="true" data-col-id="' + id + '" data-label="' +
                String(col.label).replace(/"/g, "&quot;") + '">' +
                '<span class="inv-columns-drag" aria-hidden="true"><span class="material-symbols-outlined">drag_indicator</span></span>' +
                control +
                '<span class="inv-columns-label">' + col.label + "</span></li>"
            );
        }).join("");

        wireListEvents(list);
        updateSelectedCount();
    }

    function wireListEvents(list) {
        var dragId = null;

        list.querySelectorAll(".inv-columns-item").forEach(function (item) {
            item.addEventListener("dragstart", function () {
                dragId = item.getAttribute("data-col-id");
                item.classList.add("inv-columns-item--dragging");
            });
            item.addEventListener("dragend", function () {
                item.classList.remove("inv-columns-item--dragging");
                dragId = null;
            });
            item.addEventListener("dragover", function (e) {
                e.preventDefault();
            });
            item.addEventListener("drop", function (e) {
                e.preventDefault();
                var targetId = item.getAttribute("data-col-id");
                if (!dragId || !targetId || dragId === targetId) return;

                var order = draftState.order.slice();
                var from = order.indexOf(dragId);
                var to = order.indexOf(targetId);
                if (from === -1 || to === -1) return;
                order.splice(from, 1);
                order.splice(to, 0, dragId);
                draftState.order = order;
                renderModalList();
            });
        });

        list.querySelectorAll(".inv-columns-check").forEach(function (input) {
            input.addEventListener("change", function () {
                var id = input.getAttribute("data-col-id");
                draftState.visible[id] = input.checked;
                updateSelectedCount();
            });
        });
    }

    function openModal(ctrl) {
        ensureModal();
        activeCtrl = ctrl;
        draftState = {
            order: ctrl.state.order.slice(),
            visible: Object.assign({}, ctrl.state.visible)
        };

        document.getElementById("inv-columns-search").value = "";
        filterList("");
        renderModalList();

        modalEl.classList.remove("inv-hidden");
        modalEl.setAttribute("aria-hidden", "false");
    }

    function syncColgroup(ctrl) {
        var row = document.querySelector(ctrl.theadSelector);
        if (!row) return;
        var table = row.closest("table");
        if (!table) return;

        var colCount = ctrl.getColspan();
        var colgroup = table.querySelector("colgroup");
        if (!colgroup) {
            colgroup = document.createElement("colgroup");
            var thead = table.querySelector("thead");
            table.insertBefore(colgroup, thead || table.firstChild);
        }

        colgroup.innerHTML = "";
        var colWidth = (100 / colCount).toFixed(4) + "%";
        for (var i = 0; i < colCount; i++) {
            var col = document.createElement("col");
            col.style.width = colWidth;
            if (ctrl.includeBulkCheck && i === 0) {
                col.className = "inv-col-check-col";
            }
            colgroup.appendChild(col);
        }
    }

    function renderSortHeader(ctrl, col) {
        var thClass = col.headerClass ? col.headerClass + " inv-col-sortable" : "inv-col-sortable";
        var sortKey = col.sortKey;
        var ascActive = ctrl.ordering === sortKey;
        var descActive = ctrl.ordering === "-" + sortKey;
        var btnClass = "inv-col-sort-btn";
        if (ascActive) btnClass += " inv-col-sort-btn--asc";
        if (descActive) btnClass += " inv-col-sort-btn--desc";
        var labelHtml = col.headerHtml || col.label;

        return (
            '<th class="' + thClass + '">' +
            '<button type="button" class="' + btnClass + '" data-sort-key="' + sortKey + '" title="Sort by ' + col.label + '">' +
            '<span class="inv-col-sort-label">' + labelHtml + "</span>" +
            '<span class="inv-col-sort-icons" aria-hidden="true">' +
            '<span class="material-symbols-outlined inv-col-sort-up">arrow_drop_up</span>' +
            '<span class="material-symbols-outlined inv-col-sort-down">arrow_drop_down</span>' +
            "</span></button></th>"
        );
    }

    function renderPlainHeader(col) {
        if (col.headerHtml) {
            return "<th" + (col.headerClass ? ' class="' + col.headerClass + '"' : "") + ">" + col.headerHtml + "</th>";
        }
        return "<th" + (col.headerClass ? ' class="' + col.headerClass + '"' : "") + ">" + col.label + "</th>";
    }

    function wireSortEvents(ctrl) {
        if (ctrl._sortWired || !ctrl.onSortChange) return;
        var row = document.querySelector(ctrl.theadSelector);
        if (!row) return;
        var table = row.closest("table");
        if (!table) return;

        ctrl._sortWired = true;
        table.addEventListener("click", function (e) {
            var btn = e.target.closest(".inv-col-sort-btn");
            if (!btn) return;
            e.preventDefault();
            var sortKey = btn.getAttribute("data-sort-key");
            if (!sortKey) return;
            ctrl.toggleOrdering(sortKey);
        });
    }

    function create(config) {
        var tableKey = config.tableKey;
        var columns = config.columns || [];
        var columnMap = columns.reduce(function (acc, col) {
            acc[col.id] = col;
            return acc;
        }, {});

        var ctrl = {
            tableKey: tableKey,
            columns: columns,
            columnMap: columnMap,
            theadSelector: config.theadSelector,
            toolbarSelector: config.toolbarSelector,
            includeBulkCheck: !!config.includeBulkCheck,
            includeAction: config.includeAction !== false,
            actionHeader: config.actionHeader || "Action",
            bulkHeaderHtml: config.bulkHeaderHtml || "",
            onApply: config.onApply || null,
            onSortChange: config.onSortChange || null,
            sortDefault: config.sortDefault || "",
            ordering: config.sortDefault || "",
            state: normalizeState(columns, loadState(tableKey, columns)),
            mounted: false,
            _sortWired: false
        };

        ctrl.toggleOrdering = function (sortKey) {
            if (!sortKey || !ctrl.onSortChange) return;

            if (ctrl.ordering === sortKey) {
                ctrl.ordering = "-" + sortKey;
            } else if (ctrl.ordering === "-" + sortKey) {
                // When default is the same desc sort, toggle to asc instead of no-op reset.
                if (ctrl.sortDefault === "-" + sortKey) {
                    ctrl.ordering = sortKey;
                } else {
                    ctrl.ordering = ctrl.sortDefault || "";
                }
            } else {
                ctrl.ordering = sortKey;
            }

            ctrl.renderHeader();
            ctrl.onSortChange(ctrl.ordering);
        };

        ctrl.getOrdering = function () {
            return ctrl.ordering || "";
        };

        ctrl.getVisibleColumns = function () {
            return ctrl.state.order.filter(function (id) {
                return ctrl.state.visible[id] && columnMap[id];
            }).map(function (id) { return columnMap[id]; });
        };

        ctrl.getColspan = function () {
            return ctrl.getVisibleColumns().length +
                (ctrl.includeBulkCheck ? 1 : 0) +
                (ctrl.includeAction ? 1 : 0);
        };

        ctrl.renderHeader = function () {
            var row = document.querySelector(ctrl.theadSelector);
            if (!row) return;

            var html = "";
            if (ctrl.includeBulkCheck && ctrl.bulkHeaderHtml) {
                html += ctrl.bulkHeaderHtml;
            }
            ctrl.getVisibleColumns().forEach(function (col) {
                if (col.sortKey && ctrl.onSortChange) {
                    html += renderSortHeader(ctrl, col);
                } else {
                    html += renderPlainHeader(col);
                }
            });
            if (ctrl.includeAction) {
                html += '<th class="inv-col-action inv-mgmt-cell--action">' + ctrl.actionHeader + "</th>";
            }
            row.innerHTML = html;
            syncColgroup(ctrl);
        };

        ctrl.renderRowCells = function (item) {
            return ctrl.getVisibleColumns().map(function (col) {
                return col.cell(item);
            }).join("");
        };

        ctrl.mount = function () {
            if (ctrl.mounted) return;
            var toolbar = document.querySelector(ctrl.toolbarSelector);
            if (!toolbar) return;

            if (toolbar.querySelector(".inv-columns-btn")) {
                ctrl.mounted = true;
                return;
            }

            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "inv-columns-btn";
            btn.title = "Customize columns";
            btn.setAttribute("aria-label", "Customize columns");
            btn.innerHTML = '<span class="material-symbols-outlined">view_column</span>';
            btn.addEventListener("click", function () {
                openModal(ctrl);
            });

            var wrap = document.createElement("div");
            wrap.className = "inv-columns-btn-wrap";
            wrap.appendChild(btn);
            toolbar.appendChild(wrap);
            ctrl.mounted = true;
            wireSortEvents(ctrl);
        };

        wireSortEvents(ctrl);

        return ctrl;
    }

    return { create: create };
})();
