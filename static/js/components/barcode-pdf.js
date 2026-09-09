/**
 * Generate printable barcode label PDFs (CODE128).
 */
var InventoryBarcodePdf = (function () {
    "use strict";

    var jsPdfPromise = null;
    var jsBarcodePromise = null;

    function loadJsPdf() {
        if (window.jspdf && window.jspdf.jsPDF) {
            return Promise.resolve(window.jspdf.jsPDF);
        }
        if (jsPdfPromise) return jsPdfPromise;

        jsPdfPromise = new Promise(function (resolve, reject) {
            var script = document.createElement("script");
            script.src = "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js";
            script.onload = function () {
                if (window.jspdf && window.jspdf.jsPDF) resolve(window.jspdf.jsPDF);
                else reject(new Error("jsPDF failed to load."));
            };
            script.onerror = function () {
                reject(new Error("Unable to load PDF library."));
            };
            document.head.appendChild(script);
        });

        return jsPdfPromise;
    }

    function loadJsBarcode() {
        if (window.JsBarcode) return Promise.resolve(window.JsBarcode);
        if (jsBarcodePromise) return jsBarcodePromise;

        jsBarcodePromise = new Promise(function (resolve, reject) {
            var script = document.createElement("script");
            script.src = "https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js";
            script.onload = function () {
                if (window.JsBarcode) resolve(window.JsBarcode);
                else reject(new Error("JsBarcode failed to load."));
            };
            script.onerror = function () {
                reject(new Error("Unable to load barcode library."));
            };
            document.head.appendChild(script);
        });

        return jsBarcodePromise;
    }

    function renderBarcodeDataUrl(JsBarcode, value) {
        var canvas = document.createElement("canvas");
        JsBarcode(canvas, String(value), {
            format: "CODE128",
            width: 2,
            height: 60,
            displayValue: false,
            margin: 4
        });
        return canvas.toDataURL("image/png");
    }

    function normalizeItems(items) {
        return (items || []).map(function (item) {
            return {
                value: String(item.value || ""),
                model_label: String(item.model_label || "").trim()
            };
        }).filter(function (item) {
            return item.value;
        });
    }

    function download(items, filename) {
        var labels = normalizeItems(items);
        if (!labels.length) {
            return Promise.reject(new Error("No barcodes to print."));
        }

        return Promise.all([loadJsPdf(), loadJsBarcode()]).then(function (libs) {
            var jsPDF = libs[0];
            var JsBarcode = libs[1];
            var doc = new jsPDF({ unit: "mm", format: "a4" });
            var pageWidth = doc.internal.pageSize.getWidth();
            var pageHeight = doc.internal.pageSize.getHeight();
            var marginX = 15;
            var labelHeight = 38;
            var y = 15;

            labels.forEach(function (label, index) {
                if (index > 0 && y + labelHeight > pageHeight - 15) {
                    doc.addPage();
                    y = 15;
                }

                var imgData = renderBarcodeDataUrl(JsBarcode, label.value);
                var imgWidth = pageWidth - marginX * 2;
                doc.addImage(imgData, "PNG", marginX, y, imgWidth, 18);
                doc.setFontSize(10);
                doc.text(label.value, pageWidth / 2, y + 22, { align: "center" });
                if (label.model_label) {
                    doc.setFontSize(9);
                    doc.text("Model - " + label.model_label, pageWidth / 2, y + 28, { align: "center" });
                }
                y += labelHeight;
            });

            doc.save(filename || "Generated_Barcodes.pdf");
        });
    }

    return {
        download: download
    };
})();
