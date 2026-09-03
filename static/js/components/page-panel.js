/**
 * Toggle between list view and full-page form/detail panels.
 */
var InventoryPagePanel = (function () {
    "use strict";

    function showList(listPanelId) {
        document.querySelectorAll(".inv-mgmt-page-panel").forEach(function (el) {
            el.classList.add("inv-hidden");
        });
        var list = document.getElementById(listPanelId);
        if (list) {
            list.classList.remove("inv-hidden");
        }
    }

    function showPanel(listPanelId, panelId) {
        var list = document.getElementById(listPanelId);
        if (list) {
            list.classList.add("inv-hidden");
        }
        document.querySelectorAll(".inv-mgmt-page-panel").forEach(function (el) {
            el.classList.add("inv-hidden");
        });
        var panel = document.getElementById(panelId);
        if (panel) {
            panel.classList.remove("inv-hidden");
        }
    }

    function wireBackButtons() {
        document.querySelectorAll("[data-page-back]").forEach(function (btn) {
            if (btn.dataset.pagePanelWired === "1") return;
            btn.dataset.pagePanelWired = "1";
            btn.addEventListener("click", function () {
                showList(btn.getAttribute("data-page-back"));
            });
        });
    }

    function init() {
        wireBackButtons();
    }

    return {
        init: init,
        showList: showList,
        showPanel: showPanel,
        wireBackButtons: wireBackButtons
    };
})();
