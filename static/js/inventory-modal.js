/**
 * Reusable form modal for inventory management pages.
 */
var InventoryModal = (function () {
    "use strict";

    function open(modalId) {
        var modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.remove("inv-hidden");
        modal.setAttribute("aria-hidden", "false");
        document.body.classList.add("inv-modal-open");
    }

    function close(modalId) {
        var modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.add("inv-hidden");
        modal.setAttribute("aria-hidden", "true");
        if (!document.querySelector(".inv-modal:not(.inv-hidden)")) {
            document.body.classList.remove("inv-modal-open");
        }
    }

    function wire(modalId) {
        var modal = document.getElementById(modalId);
        if (!modal || modal.dataset.modalWired === "true") return;
        modal.dataset.modalWired = "true";

        modal.addEventListener("click", function (e) {
            if (e.target.closest("[data-modal-close]")) {
                e.preventDefault();
                close(modalId);
                return;
            }
            if (e.target.classList.contains("inv-modal-backdrop")) {
                close(modalId);
            }
        });
    }

    function wireAll() {
        document.querySelectorAll(".inv-modal[id]").forEach(function (node) {
            wire(node.id);
        });
    }

    function bindEscape() {
        if (document.documentElement.dataset.invModalEscapeBound === "true") return;
        document.documentElement.dataset.invModalEscapeBound = "true";
        document.addEventListener("keydown", function (e) {
            if (e.key !== "Escape") return;
            var openModal = document.querySelector(".inv-modal:not(.inv-hidden)");
            if (openModal && openModal.id) {
                close(openModal.id);
            }
        });
    }

    function init() {
        wireAll();
        bindEscape();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    return {
        open: open,
        close: close,
        wire: wire,
        wireAll: wireAll
    };
})();
