/**
 * Pin code inputs: digits only, max 6 characters.
 */
var InventoryPinCodeInput = (function () {
    "use strict";

    var SELECTOR = "input.inv-pin-code-input";
    var wiredDocument = false;
    var domObserver = null;

    function normalize(value) {
        return String(value || "").replace(/\D/g, "").slice(0, 6);
    }

    function isValid(value, optional) {
        var pin = normalize(value);
        if (!pin) return !!optional;
        return /^\d{6}$/.test(pin);
    }

    function applyAttributes(input) {
        if (!input) return;
        input.setAttribute("inputmode", "numeric");
        input.setAttribute("maxlength", "6");
        input.setAttribute("autocomplete", "postal-code");
        if (!input.getAttribute("placeholder")) {
            input.setAttribute("placeholder", "6-digit pin code");
        }
    }

    function onInput(e) {
        var input = e.target;
        var next = normalize(input.value);
        if (input.value !== next) input.value = next;
    }

    function wire(input) {
        if (!input || input.dataset.pinCodeWired === "1") return;
        input.classList.add("inv-pin-code-input");
        input.dataset.pinCodeWired = "1";
        applyAttributes(input);
        input.addEventListener("input", onInput);
        input.addEventListener("paste", function (e) {
            e.preventDefault();
            var pasted = (e.clipboardData || window.clipboardData).getData("text") || "";
            input.value = normalize(pasted);
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
    }

    function wireAll(root) {
        (root || document).querySelectorAll(SELECTOR).forEach(wire);
    }

    function watchDom() {
        if (domObserver || typeof MutationObserver === "undefined") return;
        domObserver = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                mutation.addedNodes.forEach(function (node) {
                    if (!node || node.nodeType !== 1) return;
                    if (node.matches && node.matches(SELECTOR)) wire(node);
                    if (node.querySelectorAll) node.querySelectorAll(SELECTOR).forEach(wire);
                });
            });
        });
        domObserver.observe(document.body, { childList: true, subtree: true });
    }

    function boot() {
        wireAll();
        watchDom();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }

    return {
        normalize: normalize,
        isValid: isValid,
        wire: wire,
        wireAll: wireAll
    };
})();
