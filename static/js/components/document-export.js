/**
 * PDF download and print helpers for selected list records.
 */
var InventoryDocumentExport = (function () {
    "use strict";

    var jsPdfPromise = null;

    function escapeHtml(value) {
        if (window.InventoryApi && typeof InventoryApi.escapeHtml === "function") {
            return InventoryApi.escapeHtml(value);
        }
        var div = document.createElement("div");
        div.textContent = value == null ? "" : String(value);
        return div.innerHTML;
    }

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

    function loadAutoTable(doc) {
        if (doc.autoTable) return Promise.resolve(doc);

        return new Promise(function (resolve, reject) {
            var script = document.createElement("script");
            script.src = "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js";
            script.onload = function () { resolve(doc); };
            script.onerror = function () { reject(new Error("Unable to load PDF table plugin.")); };
            document.head.appendChild(script);
        });
    }

    function getBusinessName() {
        if (window.InventoryBusiness && typeof InventoryBusiness.getActiveBusiness === "function") {
            var business = InventoryBusiness.getActiveBusiness();
            if (business) return business.business_name || business.name || "Business";
        }
        return "Business";
    }

    function buildTableHtml(title, headers, rows) {
        var head = headers.map(function (h) {
            return "<th>" + escapeHtml(h) + "</th>";
        }).join("");

        var body = rows.map(function (row) {
            return "<tr>" + row.map(function (cell) {
                return "<td>" + escapeHtml(cell) + "</td>";
            }).join("") + "</tr>";
        }).join("");

        return (
            "<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><title>" + escapeHtml(title) + "</title>" +
            "<style>" +
            "body{font-family:Arial,sans-serif;color:#222;padding:24px;}" +
            "h1{font-size:20px;margin:0 0 4px;}" +
            ".meta{color:#666;font-size:12px;margin-bottom:20px;}" +
            "table{width:100%;border-collapse:collapse;font-size:12px;}" +
            "th,td{border:1px solid #ddd;padding:8px;text-align:left;vertical-align:top;}" +
            "th{background:#f5f5f5;}" +
            "</style></head><body>" +
            "<h1>" + escapeHtml(title) + "</h1>" +
            '<p class="meta">' + escapeHtml(getBusinessName()) + " · Generated " + new Date().toLocaleString() + "</p>" +
            "<table><thead><tr>" + head + "</tr></thead><tbody>" + body + "</tbody></table>" +
            "</body></html>"
        );
    }

    function printHtml(title, html) {
        var win = window.open("", "_blank");
        if (!win) {
            if (window.InventoryToast) InventoryToast.error("Allow pop-ups to print records.");
            return;
        }
        win.document.open();
        win.document.write(html);
        win.document.close();
        win.focus();
        win.onload = function () {
            win.print();
        };
    }

    function downloadTablePdf(title, headers, rows, filename) {
        if (window.InventoryLoader) InventoryLoader.show();
        loadJsPdf()
            .then(function (jsPDF) {
                var doc = new jsPDF({ orientation: rows[0] && rows[0].length > 5 ? "landscape" : "portrait" });
                return loadAutoTable(doc).then(function (docWithTable) {
                    docWithTable.setFontSize(16);
                    docWithTable.text(title, 14, 16);
                    docWithTable.setFontSize(10);
                    docWithTable.text(getBusinessName(), 14, 24);
                    docWithTable.text("Generated " + new Date().toLocaleString(), 14, 30);

                    docWithTable.autoTable({
                        head: [headers],
                        body: rows,
                        startY: 36,
                        styles: { fontSize: 9, cellPadding: 3 },
                        headStyles: { fillColor: [27, 33, 45] }
                    });

                    docWithTable.save(filename || "export.pdf");
                });
            })
            .catch(function (err) {
                if (window.InventoryToast) {
                    InventoryToast.error(err && err.message ? err.message : "Unable to generate PDF.");
                }
            })
            .finally(function () {
                if (window.InventoryLoader) InventoryLoader.hide();
            });
    }

    function buildSaleInvoiceHtml(sale, businessName) {
        var items = sale.items || [];
        var itemRows = items.map(function (line) {
            return (
                "<tr>" +
                "<td>" + escapeHtml(line.product_name) + "</td>" +
                "<td>" + escapeHtml(line.quantity) + "</td>" +
                "<td>" + escapeHtml(line.unit_price) + "</td>" +
                "<td>" + escapeHtml(line.line_total) + "</td>" +
                "</tr>"
            );
        }).join("");

        return (
            '<section class="invoice">' +
            "<h2>Sale Invoice</h2>" +
            "<p><strong>Business:</strong> " + escapeHtml(businessName) + "</p>" +
            "<p><strong>Date:</strong> " + escapeHtml(sale.purchase_date || "—") + "</p>" +
            "<p><strong>Customer:</strong> " + escapeHtml(sale.customer_name || "—") +
            (sale.customer_mobile ? " (" + escapeHtml(sale.customer_mobile) + ")" : "") + "</p>" +
            (sale.reference_no ? "<p><strong>Reference:</strong> " + escapeHtml(sale.reference_no) + "</p>" : "") +
            (sale.payment_type_name ? "<p><strong>Payment:</strong> " + escapeHtml(sale.payment_type_name) + "</p>" : "") +
            '<table><thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead><tbody>' +
            itemRows +
            "</tbody></table>" +
            "<p><strong>Sale Amount:</strong> " + escapeHtml(sale.total_amount) + "</p>" +
            "<p><strong>Total Cost:</strong> " + escapeHtml(sale.total_cost) + "</p>" +
            "<p><strong>Profit:</strong> " + escapeHtml(sale.total_profit) + "</p>" +
            "</section>"
        );
    }

    function buildSalesDocumentHtml(sales) {
        var businessName = getBusinessName();
        var sections = (sales || []).map(function (sale) {
            return buildSaleInvoiceHtml(sale, businessName);
        }).join('<hr style="margin:24px 0;border:none;border-top:1px solid #ddd;"/>');

        return (
            "<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><title>Sales Export</title>" +
            "<style>" +
            "body{font-family:Arial,sans-serif;color:#222;padding:24px;}" +
            "h1{font-size:22px;margin:0 0 16px;}" +
            "h2{font-size:16px;margin:0 0 12px;}" +
            "table{width:100%;border-collapse:collapse;font-size:12px;margin:12px 0;}" +
            "th,td{border:1px solid #ddd;padding:8px;text-align:left;}" +
            "th{background:#f5f5f5;}" +
            "p{margin:4px 0;font-size:13px;}" +
            "</style></head><body>" +
            "<h1>Sales Export</h1>" +
            sections +
            "</body></html>"
        );
    }

    function downloadSalesPdf(sales, filename) {
        if (!sales || !sales.length) return;

        if (window.InventoryLoader) InventoryLoader.show();

        loadJsPdf()
            .then(function (jsPDF) {
                var doc = new jsPDF();
                var businessName = getBusinessName();

                function renderSale(index) {
                    if (index >= sales.length) {
                        doc.save(filename || "sales.pdf");
                        return Promise.resolve();
                    }

                    var sale = sales[index];
                    if (index > 0) doc.addPage();

                    var y = 16;
                    doc.setFontSize(16);
                    doc.text("Sale Invoice", 14, y);
                    y += 8;
                    doc.setFontSize(10);
                    doc.text("Business: " + businessName, 14, y);
                    y += 6;
                    doc.text("Date: " + (sale.purchase_date || "—"), 14, y);
                    y += 6;
                    doc.text("Customer: " + (sale.customer_name || "—"), 14, y);
                    y += 6;
                    if (sale.reference_no) {
                        doc.text("Reference: " + sale.reference_no, 14, y);
                        y += 6;
                    }

                    var body = (sale.items || []).map(function (line) {
                        return [
                            String(line.product_name || ""),
                            String(line.quantity || ""),
                            String(line.unit_price || ""),
                            String(line.line_total || "")
                        ];
                    });

                    return loadAutoTable(doc).then(function (docWithTable) {
                        docWithTable.autoTable({
                            head: [["Product", "Qty", "Unit Price", "Total"]],
                            body: body,
                            startY: y + 4,
                            styles: { fontSize: 9, cellPadding: 3 },
                            headStyles: { fillColor: [27, 33, 45] }
                        });

                        var finalY = docWithTable.lastAutoTable.finalY + 8;
                        docWithTable.text("Sale Amount: " + (sale.total_amount || "0"), 14, finalY);
                        docWithTable.text("Total Cost: " + (sale.total_cost || "0"), 14, finalY + 6);
                        docWithTable.text("Profit: " + (sale.total_profit || "0"), 14, finalY + 12);
                        return renderSale(index + 1);
                    });
                }

                return renderSale(0);
            })
            .catch(function (err) {
                if (window.InventoryToast) {
                    InventoryToast.error(err && err.message ? err.message : "Unable to generate PDF.");
                }
            })
            .finally(function () {
                if (window.InventoryLoader) InventoryLoader.hide();
            });
    }

    return {
        buildTableHtml: buildTableHtml,
        printHtml: printHtml,
        downloadTablePdf: downloadTablePdf,
        buildSalesDocumentHtml: buildSalesDocumentHtml,
        downloadSalesPdf: downloadSalesPdf
    };
})();
