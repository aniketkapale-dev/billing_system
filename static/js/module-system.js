/**
 * Minimal CommonJS-style module system for the browser (no bundler required).
 * Each module file registers itself with define("name", factory) and other
 * modules pull dependencies via require("name"). Mirrors Node's module/exports
 * semantics so the codebase stays true CommonJS without a build step.
 */
(function (global) {
    "use strict";
    var registry = {};
    var cache = {};

    global.define = function (name, factory) {
        if (registry[name]) {
            console.warn("Module redefined: " + name);
        }
        registry[name] = factory;
    };

    global.require = function (name) {
        if (cache[name]) return cache[name].exports;
        var factory = registry[name];
        if (!factory) throw new Error("Module not found: " + name);
        var module = { exports: {} };
        cache[name] = module;
        factory(global.require, module, module.exports);
        return module.exports;
    };
})(window);
