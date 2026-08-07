/**
 * Sidebar expandable nav groups.
 */
var InventorySidebar = (function () {
    "use strict";

    function init() {
        document.querySelectorAll(".inv-nav-group").forEach(function (group) {
            var toggle = group.querySelector(".inv-nav-group-toggle");
            if (!toggle || toggle.dataset.sidebarWired === "1") return;
            toggle.dataset.sidebarWired = "1";

            toggle.addEventListener("click", function () {
                var isOpen = group.classList.toggle("inv-nav-group--open");
                toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
            });
        });
    }

    return { init: init };
})();

document.addEventListener("DOMContentLoaded", function () {
    InventorySidebar.init();
});
