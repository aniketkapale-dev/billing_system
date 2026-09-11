/**
 * Sale invoice print preview with per-invoice Terms & Conditions overrides.
 */
var InventorySalePrintPreview = (function () {
    "use strict";

    var refreshTimer = null;
    var state = {
        sales: [],
        taxes: [],
        settingsTerms: "",
        termsEditorFocused: false
    };

    function getEditor() {
        return document.getElementById("sale-print-terms-editor");
    }

    function getPreviewFrame() {
        return document.getElementById("sale-print-preview-frame");
    }

    function isSingleSale() {
        return state.sales.length === 1;
    }

    function getOverridesFromEditor() {
        var editor = getEditor();
        return {
            terms_conditions: editor && window.InventoryTermsHtml
                ? InventoryTermsHtml.normalizeEditorHtml(editor)
                : ""
        };
    }

    function mergeSaleWithOverrides(sale, overrides) {
        var merged = Object.assign({}, sale);
        merged.invoice_terms_conditions = overrides.terms_conditions;
        return merged;
    }

    function buildPreviewSales() {
        if (!isSingleSale()) {
            return state.sales.slice();
        }
        return [mergeSaleWithOverrides(state.sales[0], getOverridesFromEditor())];
    }

    function getFirstPageTermsTarget(doc) {
        if (!doc) return null;
        var firstPage = doc.querySelector(".sale-invoice-page");
        if (!firstPage) return null;
        return firstPage.querySelector(".inv-invoice-bottom")
            || firstPage.querySelector(".inv-terms")
            || firstPage;
    }

    function scrollPreviewToFirstPageTerms() {
        if (!state.termsEditorFocused) return;

        var frame = getPreviewFrame();
        if (!frame) return;

        var wrap = frame.closest(".inv-sale-print-preview-frame-wrap");
        var doc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
        var win = frame.contentWindow;
        if (!doc || !win) return;

        var target = getFirstPageTermsTarget(doc);
        if (!target) return;

        var targetRect = target.getBoundingClientRect();
        var innerScrollHeight = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight);
        var innerViewport = win.innerHeight;
        var innerScrollTop = win.pageYOffset || doc.documentElement.scrollTop || doc.body.scrollTop || 0;
        var targetBottomDocY = innerScrollTop + targetRect.bottom;

        if (innerScrollHeight > innerViewport + 2) {
            win.scrollTo({
                top: Math.max(0, targetBottomDocY - innerViewport + 20),
                behavior: "smooth"
            });
            return;
        }

        if (wrap && wrap.scrollHeight > wrap.clientHeight + 2) {
            var frameRect = frame.getBoundingClientRect();
            var targetBottomInFrame = targetRect.bottom - frameRect.top + wrap.scrollTop;
            wrap.scrollTo({
                top: Math.max(0, targetBottomInFrame - wrap.clientHeight + 20),
                behavior: "smooth"
            });
        }
    }

    function fitPreviewToFrame() {
        var frame = getPreviewFrame();
        if (!frame) return;
        var doc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
        if (!doc) return;

        var pages = doc.querySelectorAll(".sale-invoice-page");
        if (!pages.length) return;

        var availableWidth = frame.clientWidth;
        if (availableWidth < 80) return;

        Array.prototype.forEach.call(pages, function (page) {
            page.style.zoom = "1";
            page.style.transform = "";
        });

        var pageWidth = pages[0].offsetWidth || pages[0].scrollWidth || 794;
        var scale = Math.min(1, (availableWidth - 32) / pageWidth);

        Array.prototype.forEach.call(pages, function (page) {
            page.style.zoom = String(scale);
        });

        var totalScaledHeight = 24;
        Array.prototype.forEach.call(pages, function (page, index) {
            totalScaledHeight += page.getBoundingClientRect().height;
            if (index < pages.length - 1) {
                totalScaledHeight += 16 * scale;
            }
        });

        var maxFrameHeight = Math.max(480, window.innerHeight - 200);
        frame.style.height = Math.min(totalScaledHeight, maxFrameHeight) + "px";

        if (state.termsEditorFocused) {
            window.requestAnimationFrame(scrollPreviewToFirstPageTerms);
        }
    }

    function writePreviewHtml(html) {
        var frame = getPreviewFrame();
        if (!frame) return;
        var doc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
        if (!doc) return;
        doc.open();
        doc.write(html);
        doc.close();
        window.requestAnimationFrame(function () {
            fitPreviewToFrame();
        });
    }

    function refreshPreview() {
        if (!window.InventoryDocumentExport || !state.sales.length) return;
        var html = InventoryDocumentExport.buildSalesDocumentHtml(buildPreviewSales(), {
            taxes: state.taxes,
            preview: true
        });
        writePreviewHtml(html);
    }

    function scheduleRefreshPreview() {
        window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(function () {
            refreshPreview();
            if (state.termsEditorFocused) {
                window.setTimeout(scrollPreviewToFirstPageTerms, 60);
            }
        }, 180);
    }

    function setEditorContent(value) {
        var editor = getEditor();
        if (!editor || !window.InventoryTermsHtml) return;
        InventoryTermsHtml.setEditorContent(editor, value || "");
    }

    function populateEditor(initial) {
        initial = initial || {};
        setEditorContent(initial.terms_conditions || "");
    }

    function resetEditorToSettings() {
        populateEditor({
            terms_conditions: state.settingsTerms || ""
        });
        scheduleRefreshPreview();
    }

    function wireTermsEditor() {
        var editor = getEditor();
        var boldBtn = document.getElementById("sale-print-terms-bold");
        if (!editor || !window.InventoryTermsHtml || wireTermsEditor._wired) return;
        wireTermsEditor._wired = true;

        editor.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                e.preventDefault();
                InventoryTermsHtml.ensureEditorList(editor);
                document.execCommand("insertParagraph");
                InventoryTermsHtml.ensureEditorList(editor);
                scheduleRefreshPreview();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
                e.preventDefault();
                document.execCommand("bold");
                scheduleRefreshPreview();
            }
        });

        editor.addEventListener("input", scheduleRefreshPreview);

        editor.addEventListener("focus", function () {
            state.termsEditorFocused = true;
            window.setTimeout(scrollPreviewToFirstPageTerms, 80);
        });

        editor.addEventListener("blur", function () {
            state.termsEditorFocused = false;
        });

        editor.addEventListener("click", function () {
            if (state.termsEditorFocused) {
                window.setTimeout(scrollPreviewToFirstPageTerms, 40);
            }
        });

        if (boldBtn) {
            boldBtn.addEventListener("click", function () {
                editor.focus();
                document.execCommand("bold");
                scheduleRefreshPreview();
            });
        }
    }

    function open(sales, taxes, options) {
        options = options || {};
        state.sales = sales || [];
        state.taxes = taxes || [];
        state.settingsTerms = isSingleSale()
            ? (state.sales[0].invoice_terms_conditions || "")
            : "";

        var editPanel = document.getElementById("sale-print-preview-edit-panel");
        if (editPanel) {
            editPanel.classList.toggle("inv-hidden", !isSingleSale());
        }

        var titleEl = document.getElementById("sale-invoice-print-preview-title");
        if (titleEl) {
            titleEl.textContent = state.sales.length === 1
                ? "Sale Invoice Preview"
                : "Sale Invoices Preview (" + state.sales.length + ")";
        }

        if (isSingleSale()) {
            var initial = typeof options.getInitialOverrides === "function"
                ? options.getInitialOverrides(state.sales[0])
                : {
                    terms_conditions: state.settingsTerms
                };
            populateEditor(initial);
            wireTermsEditor();
        }

        refreshPreview();
        if (window.InventoryModal) {
            InventoryModal.open("sale-invoice-print-preview-modal");
        }
        window.setTimeout(fitPreviewToFrame, 60);
    }

    function printCurrentPreview() {
        if (!window.InventoryDocumentExport || !state.sales.length) return;

        var salesToPrint = buildPreviewSales();
        var html = InventoryDocumentExport.buildSalesDocumentHtml(salesToPrint, {
            taxes: state.taxes
        });
        var printTitle = salesToPrint.length === 1
            ? "Sale Invoice" + (salesToPrint[0].reference_no ? " - " + salesToPrint[0].reference_no : "")
            : "Sales Invoices";

        if (isSingleSale() && typeof state.onSaveOverrides === "function") {
            state.onSaveOverrides(state.sales[0].id, getOverridesFromEditor());
        }

        InventoryDocumentExport.printHtml(printTitle, html);
        if (window.InventoryModal) {
            InventoryModal.close("sale-invoice-print-preview-modal");
        }
    }

    function init(options) {
        options = options || {};
        state.onSaveOverrides = options.onSaveOverrides || null;

        if (window.InventoryModal) {
            InventoryModal.wire("sale-invoice-print-preview-modal");
        }

        if (!init._resizeWired) {
            init._resizeWired = true;
            window.addEventListener("resize", function () {
                var modal = document.getElementById("sale-invoice-print-preview-modal");
                if (modal && !modal.classList.contains("inv-hidden")) {
                    fitPreviewToFrame();
                }
            });
        }

        var resetBtn = document.getElementById("sale-print-terms-reset-btn");
        if (resetBtn) {
            resetBtn.addEventListener("click", resetEditorToSettings);
        }

        var printBtn = document.getElementById("sale-print-preview-print-btn");
        if (printBtn) {
            printBtn.addEventListener("click", printCurrentPreview);
        }
    }

    return {
        init: init,
        open: open
    };
})();
