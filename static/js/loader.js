define("loader", function (require, module, exports) {
    "use strict";
    var count = 0;

    function el() { return document.getElementById("app-loader"); }

    function show() {
        count += 1;
        var node = el();
        if (node) node.classList.remove("d-none");
    }

    function hide() {
        count = Math.max(0, count - 1);
        if (count === 0) {
            var node = el();
            if (node) node.classList.add("d-none");
        }
    }

    function forceHide() {
        count = 0;
        var node = el();
        if (node) node.classList.add("d-none");
    }

    /** Toggle a button into a busy state ("Save" -> "Saving...") */
    function button(btn, busy, busyText) {
        if (!btn) return;
        if (busy) {
            btn.dataset.originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML =
                '<span class="spinner-border spinner-border-sm me-1"></span>' +
                (busyText || "Please wait...");
        } else {
            btn.disabled = false;
            if (btn.dataset.originalText) btn.innerHTML = btn.dataset.originalText;
        }
    }

    module.exports = { show: show, hide: hide, forceHide: forceHide, button: button };
});
