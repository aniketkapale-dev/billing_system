/**
 * Reusable form modal for inventory management pages.
 */
var InventoryModal = (function () {
    "use strict";

    function open(modalId) {
        var modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.remove("inv-hidden");
        document.body.classList.add("inv-modal-open");
    }

    function close(modalId) {
        var modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.add("inv-hidden");
        if (!document.querySelector(".inv-modal:not(.inv-hidden)")) {
            document.body.classList.remove("inv-modal-open");
        }
    }

    function wire(modalId) {
        var modal = document.getElementById(modalId);
        if (!modal) return;

        modal.querySelectorAll("[data-modal-close]").forEach(function (el) {
            el.addEventListener("click", function () {
                close(modalId);
            });
        });

        var backdrop = modal.querySelector(".inv-modal-backdrop");
        if (backdrop) {
            backdrop.addEventListener("click", function () {
                close(modalId);
            });
        }

        window.addEventListener("keydown", function onKeydown(e) {
            if (e.key === "Escape" && !modal.classList.contains("inv-hidden")) {
                close(modalId);
            }
        });
    }

    return {
        open: open,
        close: close,
        wire: wire
    };
})();
