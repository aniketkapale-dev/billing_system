define("filter", function (require, module, exports) {
    "use strict";

    /**
     * Maintains a simple set of query filters and exposes them as an object that
     * can be merged into list requests. Reusable across listing pages.
     */
    function create() {
        var state = {};
        return {
            set: function (key, value) {
                if (value === null || value === undefined || value === "") {
                    delete state[key];
                } else {
                    state[key] = value;
                }
                return this;
            },
            get: function (key) { return state[key]; },
            clear: function () { state = {}; return this; },
            params: function () { return Object.assign({}, state); }
        };
    }

    module.exports = { create: create };
});
