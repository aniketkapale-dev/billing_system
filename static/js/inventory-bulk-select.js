/**
 * Row selection with bulk action toolbar (PDF, print, delete).
 */
var InventoryBulkSelect = (function () {
    "use strict";

    function create(options) {
        var selectedIds = new Set();
        var tbodyId = options.tbodyId;
        var tableSelector = options.tableSelector;
        var entitySingular = options.entitySingular || "Record";
        var entityPlural = options.entityPlural || "Records";
        var enableDelete = options.enableDelete !== false;
        var enablePdf = options.enablePdf !== false;
        var enablePrint = options.enablePrint !== false;
        var onDelete = options.onDelete;
        var onPdf = options.onPdf;
        var onPrint = options.onPrint;
        var isRowSelectable = options.isRowSelectable || function () { return true; };
        var toolbar = null;

        function ensureToolbar() {
            if (toolbar) return toolbar;

            var table = document.querySelector(tableSelector);
            if (!table) return null;

            var tableWrap = table.closest(".inv-mgmt-table-wrap");
            if (!tableWrap) return null;

            toolbar = document.createElement("div");
            toolbar.className = "inv-bulk-toolbar inv-hidden";
            toolbar.innerHTML =
                '<div class="inv-bulk-toolbar-inner">' +
                '<div class="inv-bulk-toolbar-actions">' +
                (enablePdf
                    ? '<button type="button" class="inv-bulk-action-btn" data-bulk-action="pdf" title="Download PDF" aria-label="Download PDF">' +
                      '<span class="material-symbols-outlined">picture_as_pdf</span></button>'
                    : "") +
                (enablePrint
                    ? '<button type="button" class="inv-bulk-action-btn" data-bulk-action="print" title="Print" aria-label="Print">' +
                      '<span class="material-symbols-outlined">print</span></button>'
                    : "") +
                (enableDelete
                    ? '<button type="button" class="inv-bulk-action-btn inv-bulk-action-btn--delete" data-bulk-action="delete" title="Delete" aria-label="Delete">' +
                      '<span class="material-symbols-outlined">delete</span></button>'
                    : "") +
                "</div>" +
                '<p class="inv-bulk-toolbar-count"></p>' +
                "</div>";

            tableWrap.parentNode.insertBefore(toolbar, tableWrap);

            toolbar.addEventListener("click", function (e) {
                var btn = e.target.closest("[data-bulk-action]");
                if (!btn) return;

                var ids = getSelectedIds();
                if (!ids.length) return;

                var action = btn.getAttribute("data-bulk-action");
                if (action === "delete" && typeof onDelete === "function") onDelete(ids);
                if (action === "pdf" && typeof onPdf === "function") onPdf(ids);
                if (action === "print" && typeof onPrint === "function") onPrint(ids);
            });

            return toolbar;
        }

        function getSelectedIds() {
            return Array.from(selectedIds);
        }

        function syncSelectAllCheckbox() {
            var table = document.querySelector(tableSelector);
            if (!table) return;

            var selectAll = table.querySelector(".inv-bulk-select-all");
            if (!selectAll) return;

            var rowChecks = table.querySelectorAll(".inv-bulk-select-row:not(:disabled)");
            var checkedCount = 0;

            rowChecks.forEach(function (cb) {
                if (cb.checked) checkedCount++;
            });

            selectAll.checked = rowChecks.length > 0 && checkedCount === rowChecks.length;
            selectAll.indeterminate = checkedCount > 0 && checkedCount < rowChecks.length;
        }

        function setRowSelected(row, selected) {
            if (row) row.classList.toggle("inv-table-row--selected", selected);
        }

        function toggleRow(id, row, checked) {
            if (checked) selectedIds.add(String(id));
            else selectedIds.delete(String(id));
            setRowSelected(row, checked);
            updateToolbar();
        }

        function updateToolbar() {
            ensureToolbar();
            if (!toolbar) return;

            var count = selectedIds.size;
            if (!count) {
                toolbar.classList.add("inv-hidden");
                syncSelectAllCheckbox();
                return;
            }

            toolbar.classList.remove("inv-hidden");
            var countEl = toolbar.querySelector(".inv-bulk-toolbar-count");
            if (countEl) {
                countEl.innerHTML =
                    '<span class="inv-bulk-toolbar-dot" aria-hidden="true"></span>' +
                    count + " " + (count === 1 ? entitySingular : entityPlural) + " Selected";
            }
            syncSelectAllCheckbox();
        }

        function clearSelection() {
            selectedIds.clear();

            var tbody = document.getElementById(tbodyId);
            if (tbody) {
                tbody.querySelectorAll(".inv-bulk-select-row").forEach(function (cb) {
                    cb.checked = false;
                });
                tbody.querySelectorAll("tr.inv-table-row--selected").forEach(function (row) {
                    row.classList.remove("inv-table-row--selected");
                });
            }

            updateToolbar();
        }

        function removeId(id) {
            selectedIds.delete(String(id));
            updateToolbar();
        }

        function headerCellHtml() {
            return '<th class="inv-col-check"><input type="checkbox" class="inv-bulk-select-all" aria-label="Select all"/></th>';
        }

        function rowCellHtml(id, item) {
            if (options.hidden) return "";
            var selectable = isRowSelectable(item);
            var disabled = selectable ? "" : " disabled";
            var checked = selectedIds.has(String(id)) ? " checked" : "";
            return (
                '<td class="inv-col-check">' +
                '<input type="checkbox" class="inv-bulk-select-row" data-id="' + id + '"' + disabled + checked + "/>" +
                "</td>"
            );
        }

        function injectHeaderCheckbox() {
            if (options.hidden) return;
            var table = document.querySelector(tableSelector);
            if (!table) return;

            var headRow = table.querySelector("thead tr");
            if (!headRow || headRow.querySelector(".inv-col-check")) return;
            headRow.insertAdjacentHTML("afterbegin", headerCellHtml());
        }

        function bindEvents() {
            injectHeaderCheckbox();
            ensureToolbar();

            var table = document.querySelector(tableSelector);
            if (!table) return;

            if (!table.dataset.bulkSelectWired) {
                table.dataset.bulkSelectWired = "1";

                table.addEventListener("change", function (e) {
                    if (e.target.classList.contains("inv-bulk-select-all")) {
                        var checked = e.target.checked;
                        table.querySelectorAll(".inv-bulk-select-row:not(:disabled)").forEach(function (cb) {
                            cb.checked = checked;
                            toggleRow(cb.getAttribute("data-id"), cb.closest("tr"), checked);
                        });
                        return;
                    }

                    if (e.target.classList.contains("inv-bulk-select-row")) {
                        toggleRow(
                            e.target.getAttribute("data-id"),
                            e.target.closest("tr"),
                            e.target.checked
                        );
                    }
                });
            }

            var tbody = document.getElementById(tbodyId);
            if (!tbody) return;

            tbody.querySelectorAll(".inv-bulk-select-row").forEach(function (cb) {
                var id = cb.getAttribute("data-id");
                var row = cb.closest("tr");
                var shouldCheck = selectedIds.has(String(id));
                cb.checked = shouldCheck;
                setRowSelected(row, shouldCheck);
            });

            syncSelectAllCheckbox();
        }

        function afterRender() {
            bindEvents();
            updateToolbar();
        }

        bindEvents();

        return {
            headerCellHtml: headerCellHtml,
            rowCellHtml: rowCellHtml,
            afterRender: afterRender,
            clearSelection: clearSelection,
            getSelectedIds: getSelectedIds,
            removeId: removeId
        };
    }

    return { create: create };
})();
