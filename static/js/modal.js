define("modal", function (require, module, exports) {
    "use strict";

    /** Thin wrapper around Bootstrap's modal for the shared CRUD form modal. */
    function controller(elementId) {
        var node = document.getElementById(elementId);
        var instance = node ? bootstrap.Modal.getOrCreateInstance(node) : null;
        return {
            node: node,
            show: function () { if (instance) instance.show(); },
            hide: function () { if (instance) instance.hide(); },
            onHidden: function (cb) {
                if (node) node.addEventListener("hidden.bs.modal", cb);
            }
        };
    }

    module.exports = { controller: controller };
});
