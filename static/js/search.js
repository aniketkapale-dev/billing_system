define("search", function (require, module, exports) {
    "use strict";
    var helpers = require("helpers");

    /** Wires a debounced search input to a callback(term). */
    function bind(inputId, onSearch) {
        var input = document.getElementById(inputId);
        if (!input) return;
        var handler = helpers.debounce(function () {
            onSearch(input.value.trim());
        }, 350);
        input.addEventListener("input", handler);
    }

    module.exports = { bind: bind };
});
