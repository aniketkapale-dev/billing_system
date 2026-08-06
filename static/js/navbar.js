define("navbar", function (require, module, exports) {
    "use strict";

    /** Highlights the active sidebar item and wires the collapse toggle. */
    function init(active) {
        var items = document.querySelectorAll(".nav-item[data-nav]");
        items.forEach(function (item) {
            if (item.getAttribute("data-nav") === active) {
                item.classList.add("active");
            }
        });

        var toggle = document.getElementById("sidebar-toggle");
        var sidebar = document.getElementById("sidebar");
        if (toggle && sidebar) {
            toggle.addEventListener("click", function () {
                sidebar.classList.toggle("collapsed");
            });
        }
    }

    module.exports = { init: init };
});
