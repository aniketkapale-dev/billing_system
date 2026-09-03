/**
 * Card-style list tables: copy column titles into each cell as data-label.
 */
var InventoryTableCards = (function () {
    "use strict";

    function headerLabel(th) {
        if (th.classList.contains("inv-col-check") || th.classList.contains("d-none")) {
            return null;
        }
        var cardLabel = th.getAttribute("data-card-label");
        if (cardLabel) {
            return cardLabel;
        }
        var sortLabel = th.querySelector(".inv-col-sort-label");
        var text = sortLabel ? sortLabel.textContent : th.textContent;
        text = String(text || "").replace(/\s+/g, " ").trim();
        return text || null;
    }

    function getHeaderLabels(table) {
        var labels = [];
        table.querySelectorAll("thead th").forEach(function (th) {
            var label = headerLabel(th);
            if (label) labels.push(label);
        });
        return labels;
    }

    function isDashboardTable(table) {
        if (!table) return false;
        if (table.classList.contains("inv-mgmt-table--dashboard")) return true;
        return !!table.closest(".inv-dashboard-page");
    }

    function syncTable(table) {
        if (!table || !table.classList.contains("inv-mgmt-table")) return;
        if (isDashboardTable(table)) return;

        var labels = getHeaderLabels(table);
        if (!labels.length) return;

        table.querySelectorAll("tbody tr").forEach(function (tr) {
            if (tr.querySelector(".inv-mgmt-empty")) return;

            var cells = tr.querySelectorAll("td:not(.inv-mgmt-empty)");
            cells.forEach(function (td, index) {
                if (td.getAttribute("data-label")) return;

                if (td.classList.contains("inv-col-action") || td.classList.contains("inv-mgmt-cell--action")) {
                    td.setAttribute("data-label", "Action");
                    return;
                }

                if (labels[index]) {
                    td.setAttribute("data-label", labels[index]);
                }
            });
        });
    }

    function syncAll(root) {
        (root || document).querySelectorAll(".inv-mgmt-table-wrap > .inv-mgmt-table").forEach(syncTable);
    }

    function wireTable(table) {
        if (!table || table.dataset.cardSyncWired === "1") return;
        if (isDashboardTable(table)) return;
        table.dataset.cardSyncWired = "1";

        var tbody = table.querySelector("tbody");
        if (!tbody) return;

        syncTable(table);

        var observer = new MutationObserver(function () {
            syncTable(table);
        });
        observer.observe(tbody, { childList: true, subtree: true });
    }

    function init() {
        document.querySelectorAll(".inv-mgmt-table-wrap > .inv-mgmt-table").forEach(function (table) {
            if (!isDashboardTable(table)) wireTable(table);
        });

        var addedObserver = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                mutation.addedNodes.forEach(function (node) {
                    if (node.nodeType !== 1) return;
                    if (node.matches && node.matches(".inv-mgmt-table-wrap > .inv-mgmt-table")) {
                        if (!isDashboardTable(node)) wireTable(node);
                    }
                    if (node.querySelectorAll) {
                        node.querySelectorAll(".inv-mgmt-table-wrap > .inv-mgmt-table").forEach(function (table) {
                            if (!isDashboardTable(table)) wireTable(table);
                        });
                    }
                });
            });
        });
        addedObserver.observe(document.body, { childList: true, subtree: true });
    }

    return {
        init: init,
        syncAll: syncAll,
        syncTable: syncTable
    };
})();

document.addEventListener("DOMContentLoaded", function () {
    InventoryTableCards.init();
});
