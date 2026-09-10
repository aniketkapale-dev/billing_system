/**
 * Generate printable barcode label PDFs (CODE128).
 */
var InventoryBarcodePdf = (function () {
    "use strict";

    var jsPdfPromise = null;
    var jsBarcodePromise = null;
    var CHUNK_SIZE = 500;

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

    function getRenderScale(labelCount) {
        if (labelCount > 300) return 1.5;
        if (labelCount > 150) return 2;
        if (labelCount > 60) return 3;
        return 4;
    }

    function shouldUseJpeg(labelCount) {
        return labelCount > 60;
    }

    function renderBarcodeDataUrl(JsBarcode, value, scale, useJpeg) {
        var text = String(value || "").trim();
        if (!text) {
            throw new Error("Barcode value is empty.");
        }

        var canvas = document.createElement("canvas");
        try {
            JsBarcode(canvas, text, {
                format: "CODE128",
                width: Math.max(1, Math.round(2 * scale)),
                height: Math.max(20, Math.round(80 * scale)),
                displayValue: false,
                margin: Math.max(4, Math.round(12 * scale)),
                background: "#ffffff",
                lineColor: "#000000"
            });
        } catch (err) {
            throw new Error("Unable to render barcode \"" + text + "\": " + (err.message || err));
        }

        var imageFormat = useJpeg ? "JPEG" : "PNG";
        var dataUrl = useJpeg
            ? canvas.toDataURL("image/jpeg", 0.92)
            : canvas.toDataURL("image/png");

        return {
            dataUrl: dataUrl,
            width: canvas.width,
            height: canvas.height,
            imageFormat: imageFormat
        };
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

    function getSlotLayout(pageWidth, pageHeight) {
        var cols = 2;
        var rows = 3;
        var marginX = 8;
        var marginTop = 8;
        var marginBottom = 8;
        var gapX = 8;
        var gapY = 6;
        var usableWidth = pageWidth - marginX * 2;
        var usableHeight = pageHeight - marginTop - marginBottom;
        var cellWidth = (usableWidth - gapX * (cols - 1)) / cols;
        var slotHeight = (usableHeight - gapY * (rows - 1)) / rows;
        var slotPadding = 3;
        var textZoneHeight = 14;
        var barcodeMaxHeight = slotHeight - textZoneHeight - slotPadding * 2;

        return {
            cols: cols,
            rows: rows,
            labelsPerPage: cols * rows,
            marginX: marginX,
            marginTop: marginTop,
            gapX: gapX,
            gapY: gapY,
            cellWidth: cellWidth,
            slotHeight: slotHeight,
            barcodeMaxWidth: cellWidth - 4,
            barcodeMaxHeight: barcodeMaxHeight,
            barcodeTopPad: slotPadding,
            valueTextY: slotHeight - 9,
            skuTextY: slotHeight - 4,
            textBgHeight: textZoneHeight,
            fontSizeValue: 11,
            fontSizeSku: 9
        };
    }

    function getLabelSlot(layout, indexOnPage) {
        var col = indexOnPage % layout.cols;
        var row = Math.floor(indexOnPage / layout.cols);
        return {
            cellX: layout.marginX + col * (layout.cellWidth + layout.gapX),
            slotY: layout.marginTop + row * (layout.slotHeight + layout.gapY),
            textX: layout.marginX + col * (layout.cellWidth + layout.gapX) + layout.cellWidth / 2
        };
    }

    function buildPdf(labels, filename, jsPDF, JsBarcode) {
        var doc = new jsPDF({ unit: "mm", format: "a4" });
        var pageWidth = doc.internal.pageSize.getWidth();
        var pageHeight = doc.internal.pageSize.getHeight();
        var layout = getSlotLayout(pageWidth, pageHeight);
        var scale = getRenderScale(labels.length);
        var useJpeg = shouldUseJpeg(labels.length);
        var pageEntries = [];

        labels.forEach(function (label, index) {
            if (index > 0 && index % layout.labelsPerPage === 0) {
                renderPdfPage(doc, pageEntries, layout, useJpeg);
                pageEntries = [];
                doc.addPage();
            }

            var indexOnPage = index % layout.labelsPerPage;
            var slot = getLabelSlot(layout, indexOnPage);
            var rendered = renderBarcodeDataUrl(JsBarcode, label.value, scale, useJpeg);
            var aspect = rendered.width / rendered.height;
            var imgWidth = layout.barcodeMaxWidth;
            var imgHeight = imgWidth / aspect;

            if (imgHeight > layout.barcodeMaxHeight) {
                imgHeight = layout.barcodeMaxHeight;
                imgWidth = imgHeight * aspect;
            }

            var minBarcodeHeight = Math.min(24, layout.barcodeMaxHeight);
            if (imgHeight < minBarcodeHeight) {
                var scaleUp = minBarcodeHeight / imgHeight;
                imgHeight = minBarcodeHeight;
                imgWidth = Math.min(layout.barcodeMaxWidth, imgWidth * scaleUp);
            }

            pageEntries.push({
                label: label,
                rendered: rendered,
                slot: slot,
                imgWidth: imgWidth,
                imgHeight: imgHeight,
                imgX: slot.cellX + (layout.cellWidth - imgWidth) / 2,
                imgY: slot.slotY + layout.barcodeTopPad +
                    Math.max(0, (layout.barcodeMaxHeight - imgHeight) / 2)
            });
        });

        if (pageEntries.length) {
            renderPdfPage(doc, pageEntries, layout, useJpeg);
        }

        doc.save(filename);
    }

    function renderPdfPage(doc, entries, layout, useJpeg) {
        entries.forEach(function (entry) {
            doc.addImage(
                entry.rendered.dataUrl,
                entry.rendered.imageFormat,
                entry.imgX,
                entry.imgY,
                entry.imgWidth,
                entry.imgHeight,
                undefined,
                useJpeg ? "FAST" : "NONE"
            );
        });

        entries.forEach(function (entry) {
            var slot = entry.slot;
            doc.setFillColor(255, 255, 255);
            doc.rect(
                slot.cellX + 1,
                slot.slotY + layout.slotHeight - layout.textBgHeight - 1,
                layout.cellWidth - 2,
                layout.textBgHeight,
                "F"
            );

            doc.setTextColor(0, 0, 0);
            doc.setFontSize(layout.fontSizeValue);
            doc.text(
                entry.label.value,
                slot.textX,
                slot.slotY + layout.valueTextY,
                { align: "center", maxWidth: layout.cellWidth - 6 }
            );

            if (entry.label.model_label) {
                doc.setFontSize(layout.fontSizeSku);
                doc.text(
                    "SKU - " + entry.label.model_label,
                    slot.textX,
                    slot.slotY + layout.skuTextY,
                    { align: "center", maxWidth: layout.cellWidth - 6 }
                );
            }
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
            var baseName = (filename || "Generated_Barcodes.pdf").replace(/\.pdf$/i, "");

            if (labels.length <= CHUNK_SIZE) {
                buildPdf(labels, baseName + ".pdf", jsPDF, JsBarcode);
                return { files: 1, count: labels.length };
            }

            var chunks = [];
            for (var i = 0; i < labels.length; i += CHUNK_SIZE) {
                chunks.push(labels.slice(i, i + CHUNK_SIZE));
            }

            return chunks.reduce(function (chain, chunk, index) {
                return chain.then(function () {
                    var partName = baseName + "_Part" + (index + 1) + "_of_" + chunks.length + ".pdf";
                    buildPdf(chunk, partName, jsPDF, JsBarcode);
                });
            }, Promise.resolve()).then(function () {
                return { files: chunks.length, count: labels.length };
            });
        });
    }

    return {
        download: download
    };
})();
