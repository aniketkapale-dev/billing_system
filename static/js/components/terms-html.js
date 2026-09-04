/**
 * Terms & Conditions HTML helpers — numbered list + bold support.
 */
var InventoryTermsHtml = (function () {
    "use strict";

    var ALLOWED_TAGS = {
        OL: true,
        UL: true,
        LI: true,
        B: true,
        STRONG: true,
        BR: true,
        P: true
    };

    function escapeHtml(str) {
        var div = document.createElement("div");
        div.textContent = str == null ? "" : String(str);
        return div.innerHTML;
    }

    function looksLikeHtml(value) {
        return /<[a-z][\s\S]*>/i.test(String(value || ""));
    }

    function stripLineNumber(line) {
        return String(line || "").replace(/^\s*\d+[\).\s]+/, "").trim();
    }

    function plainToHtml(text) {
        if (!text || !String(text).trim()) return "";

        if (looksLikeHtml(text)) {
            return sanitize(text);
        }

        var lines = String(text)
            .split(/\r?\n/)
            .map(stripLineNumber)
            .filter(Boolean);

        if (!lines.length) return "";

        return (
            "<ol>" +
            lines.map(function (line) {
                return "<li>" + escapeHtml(line) + "</li>";
            }).join("") +
            "</ol>"
        );
    }

    function sanitize(html) {
        if (!html || !String(html).trim()) return "";

        var doc = new DOMParser().parseFromString("<div>" + String(html) + "</div>", "text/html");
        var root = doc.body.firstChild;

        function cloneNode(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                return doc.createTextNode(node.textContent);
            }
            if (node.nodeType !== Node.ELEMENT_NODE) {
                return null;
            }

            var tag = node.tagName;
            if (!ALLOWED_TAGS[tag]) {
                var frag = doc.createDocumentFragment();
                Array.prototype.forEach.call(node.childNodes, function (child) {
                    var cloned = cloneNode(child);
                    if (cloned) frag.appendChild(cloned);
                });
                return frag;
            }

            var el = doc.createElement(tag.toLowerCase());
            Array.prototype.forEach.call(node.childNodes, function (child) {
                var cloned = cloneNode(child);
                if (cloned) el.appendChild(cloned);
            });
            return el;
        }

        var output = doc.createElement("div");
        Array.prototype.forEach.call(root.childNodes, function (child) {
            var cloned = cloneNode(child);
            if (cloned) output.appendChild(cloned);
        });

        var result = output.innerHTML.trim();
        if (!output.textContent.trim()) return "";
        return result;
    }

    function createEmptyEditorHtml() {
        return "<ol><li><br></li></ol>";
    }

    function isEditorEmpty(editor) {
        if (!editor) return true;
        return !String(editor.textContent || "").trim();
    }

    function normalizeEditorHtml(editor) {
        if (!editor) return "";
        if (isEditorEmpty(editor)) return "";

        var items = editor.querySelectorAll("li");
        if (items.length) {
            var parts = [];
            items.forEach(function (li) {
                if (!String(li.textContent || "").trim()) return;
                var inner = sanitize(li.innerHTML).trim();
                if (!inner) {
                    inner = escapeHtml(String(li.textContent || "").trim());
                }
                parts.push("<li>" + inner + "</li>");
            });
            return parts.length ? "<ol>" + parts.join("") + "</ol>" : "";
        }

        return plainToHtml(editor.textContent);
    }

    function setEditorContent(editor, value) {
        if (!editor) return;

        if (!value || !String(value).trim()) {
            editor.innerHTML = "";
            return;
        }

        if (looksLikeHtml(value)) {
            editor.innerHTML = sanitize(value);
        } else {
            editor.innerHTML = plainToHtml(value);
        }

        if (!editor.querySelector("ol, ul")) {
            editor.innerHTML = plainToHtml(editor.textContent);
        }
    }

    function renderForPrint(value) {
        if (!value || !String(value).trim()) return "";
        if (looksLikeHtml(value)) return sanitize(value);
        return plainToHtml(value);
    }

    function placeCaretInElement(el) {
        if (!el) return;
        el.focus();
        var range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        var sel = window.getSelection();
        if (!sel) return;
        sel.removeAllRanges();
        sel.addRange(range);
    }

    function ensureEditorList(editor) {
        if (!editor) return;
        if (!isEditorEmpty(editor) || editor.querySelector("ol, ul")) return;
        editor.innerHTML = createEmptyEditorHtml();
        var li = editor.querySelector("li");
        placeCaretInElement(li || editor);
    }

    return {
        sanitize: sanitize,
        plainToHtml: plainToHtml,
        looksLikeHtml: looksLikeHtml,
        createEmptyEditorHtml: createEmptyEditorHtml,
        isEditorEmpty: isEditorEmpty,
        normalizeEditorHtml: normalizeEditorHtml,
        setEditorContent: setEditorContent,
        renderForPrint: renderForPrint,
        ensureEditorList: ensureEditorList,
        placeCaretInElement: placeCaretInElement
    };
})();
