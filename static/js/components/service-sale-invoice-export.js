/**
 * Service sale tax invoice print/PDF.
 * Uses templates/partials/service_sale_invoice.html (product document-export.js untouched).
 */
var InventoryServiceSaleInvoiceExport = (function () {
    "use strict";

    function escapeHtml(value) {
        if (window.InventoryApi && typeof InventoryApi.escapeHtml === "function") {
            return InventoryApi.escapeHtml(value);
        }
        var div = document.createElement("div");
        div.textContent = value == null ? "" : String(value);
        return div.innerHTML;
    }

    function displayText(value) {
        if (value === null || value === undefined || String(value).trim() === "") return "—";
        return escapeHtml(String(value));
    }

    function formatMultiline(value) {
        return escapeHtml(String(value || "")).replace(/\n/g, "<br/>");
    }

    function roundMoney(value) {
        return Math.round(Number(value || 0) * 100) / 100;
    }

    function invoiceMoney(value) {
        return Number(value || 0).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function formatDisplayDate(value) {
        if (window.InventoryApi && typeof InventoryApi.formatDisplayDate === "function") {
            return InventoryApi.formatDisplayDate(value, "—");
        }
        return value || "—";
    }

    function getBusinessDetails() {
        if (window.InventoryBusiness && typeof InventoryBusiness.getActive === "function") {
            return InventoryBusiness.getActive() || {};
        }
        return {};
    }

    function detailField(label, value, hideIfEmpty) {
        if (hideIfEmpty && (value === null || value === undefined || String(value).trim() === "")) {
            return "";
        }
        var display = value === null || value === undefined || String(value).trim() === ""
            ? "—"
            : displayText(value);
        return (
            '<div class="inv-detail-field inv-detail-field--table">' +
            '<span class="inv-detail-label">' + escapeHtml(String(label).toUpperCase()) + "</span>" +
            '<span class="inv-detail-colon">:</span>' +
            '<span class="inv-detail-value">' + display + "</span>" +
            "</div>"
        );
    }

    function amountInWordsInr(amount) {
        var num = Math.round(Number(amount || 0) * 100) / 100;
        if (isNaN(num) || num <= 0) return "Zero Rupees Only";
        var ones = [
            "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
            "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
            "Seventeen", "Eighteen", "Nineteen"
        ];
        var tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
        function twoDigits(n) {
            if (n < 20) return ones[n];
            return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
        }
        function threeDigits(n) {
            if (n < 100) return twoDigits(n);
            return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + twoDigits(n % 100) : "");
        }
        function convertIndian(n) {
            n = Math.floor(n);
            if (n === 0) return "";
            if (n < 1000) return threeDigits(n);
            var crore = Math.floor(n / 10000000);
            n %= 10000000;
            var lakh = Math.floor(n / 100000);
            n %= 100000;
            var thousand = Math.floor(n / 1000);
            n %= 1000;
            var parts = [];
            if (crore) parts.push(convertIndian(crore) + " Crore");
            if (lakh) parts.push(twoDigits(lakh) + " Lakh");
            if (thousand) parts.push(twoDigits(thousand) + " Thousand");
            if (n) parts.push(threeDigits(n));
            return parts.join(" ");
        }
        var rupees = Math.floor(num);
        var paise = Math.round((num - rupees) * 100);
        var words = convertIndian(rupees) + " Rupee" + (rupees === 1 ? "" : "s");
        if (paise > 0) words += " and " + convertIndian(paise) + " Paise";
        return words + " Only";
    }

    function getPaymentInfo(business) {
        business = business || {};
        return {
            details: business.bank_details || "",
            accountHolder: business.account_holder_name || business.account_holder || "",
            accountNumber: business.account_number || "",
            ifsc: business.ifsc || business.ifsc_code || "",
            bank: business.bank_name || business.bank || "",
            branch: business.bank_branch || business.branch || ""
        };
    }

    function hasPaymentInfo(info) {
        if (!info) return false;
        return !!(
            String(info.details || "").trim() ||
            String(info.accountHolder || "").trim() ||
            String(info.accountNumber || "").trim() ||
            String(info.ifsc || "").trim() ||
            String(info.bank || "").trim() ||
            String(info.branch || "").trim()
        );
    }

    function metaLine(label, value, hideIfEmpty) {
        if (hideIfEmpty && (value === null || value === undefined || String(value).trim() === "" || value === "—")) {
            return "";
        }
        return (
            '<div class="inv-meta-line">' +
            '<span class="inv-meta-label">' + escapeHtml(label) + "</span>" +
            '<span class="inv-meta-value">' + displayText(value) + "</span>" +
            "</div>"
        );
    }

    function buildFooterHtml(sale, businessName, paymentInfo) {
        var termsText = (sale.invoice_terms_conditions && String(sale.invoice_terms_conditions).trim())
            || (sale.notes && String(sale.notes).trim())
            || "";
        var termsBody = termsText
            ? (window.InventoryTermsHtml
                ? InventoryTermsHtml.renderForPrint(termsText)
                : formatMultiline(termsText))
            : "&mdash;";
        var qrUrl = sale.invoice_qr_image_url && String(sale.invoice_qr_image_url).trim()
            ? String(sale.invoice_qr_image_url).trim()
            : "";

        return (
            '<footer class="inv-invoice-bottom">' +
            '<section class="inv-payment-info">' +
            "<h3>Bank Details <span>:</span></h3>" +
            '<div class="inv-info-list">' +
            (!hasPaymentInfo(paymentInfo) ? "&mdash;" : "") +
            (paymentInfo.details ? '<div class="inv-bank-details">' + formatMultiline(paymentInfo.details) + "</div>" : "") +
            metaLine("Account Holder", paymentInfo.accountHolder, true) +
            metaLine("Account Number", paymentInfo.accountNumber, true) +
            metaLine("IFSC", paymentInfo.ifsc, true) +
            metaLine("Bank", paymentInfo.bank, true) +
            metaLine("Branch", paymentInfo.branch, true) +
            "</div></section>" +
            '<div class="inv-invoice-bottom-row">' +
            '<section class="inv-invoice-bottom-terms inv-terms">' +
            "<h3>Terms &amp; Conditions</h3>" +
            '<div class="inv-terms-body">' + termsBody + "</div></section>" +
            '<section class="inv-invoice-bottom-qr"><h3>Payment QR Code</h3>' +
            (qrUrl
                ? '<div class="inv-qr-wrap"><img class="inv-qr" crossorigin="anonymous" src="' +
                  escapeHtml(qrUrl) +
                  '" alt="Payment QR Code"/></div>'
                : "") +
            "</section>" +
            '<div class="inv-signature-block">' +
            '<div class="inv-receiver-signature">Receiver&#39;s Signature <span>:</span></div>' +
            '<div class="inv-signature-inner">' +
            '<p class="inv-signature-company">For ' + escapeHtml(businessName) + "</p>" +
            '<p class="inv-signature-label">Authorised Signatory</p>' +
            "</div></div>" +
            "</div></footer>"
        );
    }

    function buildPrintRows(sale, taxes) {
        return (sale.items || []).map(function (line, index) {
            var qty = Number(line.quantity != null ? line.quantity : 1) || 1;
            var total = Number(line.line_total || 0);
            var tax = Number(line.tax_amount || 0);
            var taxable = roundMoney(Math.max(0, total - tax));
            var listPrice = Number(
                line.list_price != null && line.list_price !== ""
                    ? line.list_price
                    : line.base_price != null
                      ? line.base_price
                      : line.unit_price || 0
            );
            var rate = line.gst_rate != null && line.gst_rate !== "" ? Number(line.gst_rate) : 0;
            if (!rate && tax > 0 && taxable > 0) {
                rate = roundMoney((tax / taxable) * 100);
            }
            var taxableRatio = total > 0 ? taxable / total : 1 / (1 + rate / 100);
            var taxIds = line.sale_tax_ids || [];
            var taxId = taxIds.find(function (id) {
                return /^\d+$/.test(String(id));
            });
            var taxObj = (taxes || []).find(function (item) {
                return String(item.id) === String(taxId);
            });
            return {
                serial: index + 1,
                product_name: line.product_name || line.service_name || "",
                hsn: line.product_hsn_code || line.hsn_code || "",
                quantity: qty,
                unit: line.product_unit || "svc",
                list_price: listPrice * taxableRatio,
                price: qty > 0 ? taxable / qty : 0,
                amount: taxable,
                tax: roundMoney(tax),
                tax_name: taxObj && taxObj.key ? taxObj.key : rate > 0 ? "GST" : "Tax",
                tax_percent: rate
            };
        });
    }

    function buildItemRowsHtml(rows) {
        if (!rows.length) {
            return '<tr class="inv-empty-row"><td colspan="3">No services on this invoice</td></tr>';
        }
        return rows
            .map(function (row) {
                return (
                    "<tr>" +
                    '<td class="num">' +
                    row.serial +
                    ".</td>" +
                    '<td class="item-name">' +
                    displayText(row.product_name) +
                    "</td>" +
                    '<td class="num">' +
                    invoiceMoney(row.amount) +
                    "</td></tr>"
                );
            })
            .join("");
    }

    function buildTaxSummary(rows) {
        var byKey = {};
        rows.forEach(function (row) {
            if (!row.tax_percent || row.tax <= 0) return;
            var key = row.tax_name + "|" + row.tax_percent;
            if (!byKey[key]) {
                byKey[key] = {
                    name: row.tax_name,
                    rate: row.tax_percent,
                    taxable: 0,
                    amount: 0
                };
            }
            byKey[key].taxable = roundMoney(byKey[key].taxable + row.amount);
            byKey[key].amount = roundMoney(byKey[key].amount + row.tax);
        });
        var additions = Object.keys(byKey).map(function (k) {
            return byKey[k];
        });
        var taxableTotal = roundMoney(
            rows.reduce(function (sum, row) {
                return sum + Number(row.amount || 0);
            }, 0)
        );
        var taxTotal = roundMoney(
            rows.reduce(function (sum, row) {
                return sum + Number(row.tax || 0);
            }, 0)
        );
        var html = "";
        if (additions.length) {
            html =
                '<table class="inv-tax-summary"><thead><tr>' +
                "<th>Tax</th><th class=\"num\">Rate</th><th class=\"num\">Taxable</th><th class=\"num\">Amount</th>" +
                "</tr></thead><tbody>" +
                additions
                    .map(function (tax) {
                        return (
                            "<tr><td>" +
                            escapeHtml(tax.name) +
                            '</td><td class="num">' +
                            invoiceMoney(tax.rate) +
                            ' %</td><td class="num">' +
                            invoiceMoney(tax.taxable) +
                            '</td><td class="num">' +
                            invoiceMoney(tax.amount) +
                            "</td></tr>"
                        );
                    })
                    .join("") +
                '</tbody><tfoot><tr><th colspan="2">Total</th>' +
                '<th class="num">' +
                invoiceMoney(taxableTotal) +
                '</th><th class="num">' +
                invoiceMoney(taxTotal) +
                "</th></tr></tfoot></table>";
        }
        return {
            html: html,
            totals: { taxable: taxableTotal, tax: taxTotal },
            additions: additions
        };
    }

    function buildTotalsRowsHtml(rows, summary, roundTotals) {
        var hasTax =
            Number(summary.totals.tax || 0) > 0 ||
            (summary.additions && summary.additions.length > 0);
        var html = "";
        if (hasTax) {
            html =
                '<tr class="inv-subtotal"><td colspan="2">Taxable Amount</td><td class="num">' +
                invoiceMoney(summary.totals.taxable) +
                "</td></tr>";
        }
        (summary.additions || []).forEach(function (tax) {
            html +=
                '<tr><td colspan="2" class="inv-tax-addition">Add : ' +
                escapeHtml(tax.name) +
                " @ " +
                invoiceMoney(tax.rate) +
                ' %</td><td class="num">' +
                invoiceMoney(tax.amount) +
                "</td></tr>";
        });
        if (roundTotals.roundOff) {
            html +=
                '<tr><td colspan="2">Round Off</td><td class="num">' +
                invoiceMoney(roundTotals.roundOff) +
                "</td></tr>";
        }
        return (
            html +
            '<tr class="inv-grand-total"><td colspan="2">Grand Total</td><td class="num">' +
            invoiceMoney(roundTotals.grandTotal) +
            "</td></tr>"
        );
    }

    function computeRoundTotals(taxable, tax, fallbackTotal) {
        var preRoundTotal = roundMoney(Number(taxable || 0) + Number(tax || 0));
        if (!preRoundTotal && fallbackTotal) preRoundTotal = roundMoney(fallbackTotal);
        var roundedGrandTotal = Math.round(preRoundTotal);
        return {
            preRoundTotal: preRoundTotal,
            roundOff: roundMoney(roundedGrandTotal - preRoundTotal),
            grandTotal: roundedGrandTotal
        };
    }

    function setField(root, name, htmlOrText, asHtml) {
        var el = root.querySelector('[data-field="' + name + '"]');
        if (!el) return;
        if (asHtml) el.innerHTML = htmlOrText || "";
        else el.textContent = htmlOrText == null ? "" : String(htmlOrText);
    }

    function fillTemplate(sale, taxes) {
        var tpl = document.getElementById("service-sale-invoice-template");
        if (!tpl) {
            throw new Error("Service invoice template not found.");
        }
        var root = tpl.content.firstElementChild.cloneNode(true);
        var business = getBusinessDetails();
        var businessName = sale.business_name || business.business_name || business.name || "Business";
        var paymentInfo = getPaymentInfo(business);
        var invoiceNo = sale.reference_no || ("SALE-" + sale.id);
        var invoiceDate = formatDisplayDate(sale.sale_date || sale.purchase_date);
        var customerName = (sale.company_name && String(sale.company_name).trim())
            ? sale.company_name
            : sale.customer_name || "Customer";
        var address = sale.billing_address || sale.company_address || sale.customer_address || "";

        setField(root, "business_gstin", business.gst_number || "—");
        setField(root, "business_name", businessName);
        setField(root, "business_address", formatMultiline(business.address || ""), true);
        var contactParts = [];
        if (business.phone) contactParts.push("MOBILE: " + business.phone);
        if (business.email) contactParts.push("EMAIL: " + business.email);
        setField(root, "business_contact", contactParts.length ? escapeHtml(contactParts.join(" | ")) : "", true);

        var invoiceDetails = root.querySelector('[data-slot="invoice-details"]');
        if (invoiceDetails) {
            invoiceDetails.innerHTML =
                detailField("Invoice No.", invoiceNo, false) +
                detailField("Dated", invoiceDate, false) +
                detailField("Due Date", sale.due_date ? formatDisplayDate(sale.due_date) : "", true) +
                detailField("Terms", sale.invoice_print_terms, true) +
                detailField("Payment", sale.payment_type_name, true);
        }

        setField(root, "customer_name", String(customerName).trim() || "Customer");
        setField(root, "customer_address", address ? formatMultiline(address) : "", true);
        var customerDetails = root.querySelector('[data-slot="customer-details"]');
        if (customerDetails) {
            customerDetails.innerHTML =
                detailField("Mobile", sale.company_mobile || sale.customer_mobile, true) +
                detailField("Email", sale.customer_email, true);
        }

        var printRows = buildPrintRows(sale, taxes);
        var taxSummary = buildTaxSummary(printRows);
        var saleTotal = roundMoney(Number(sale.total_amount || 0));
        var roundTotals = computeRoundTotals(taxSummary.totals.taxable, taxSummary.totals.tax, saleTotal);

        var itemsSlot = root.querySelector('[data-slot="items"]');
        if (itemsSlot) itemsSlot.innerHTML = buildItemRowsHtml(printRows);
        var totalsSlot = root.querySelector('[data-slot="totals"]');
        if (totalsSlot) totalsSlot.innerHTML = buildTotalsRowsHtml(printRows, taxSummary, roundTotals);
        setField(root, "amount_words", amountInWordsInr(roundTotals.grandTotal));

        var footerSlot = root.querySelector('[data-slot="footer"]');
        if (footerSlot) footerSlot.innerHTML = buildFooterHtml(sale, businessName, paymentInfo);

        return root;
    }

    function getProductInvoiceStyles() {
        if (!window.InventoryDocumentExport || typeof InventoryDocumentExport.buildSalesDocumentHtml !== "function") {
            return "";
        }
        var html = InventoryDocumentExport.buildSalesDocumentHtml([], {});
        var match = html.match(/<style>([\s\S]*?)<\/style>/i);
        return match ? match[1] : "";
    }

    function buildSalesDocumentHtml(sales, options) {
        options = options || {};
        var taxes = options.taxes || [];
        var list = sales || [];
        var holder = document.createElement("div");
        list.forEach(function (sale) {
            holder.appendChild(fillTemplate(sale, taxes));
        });
        var styles = getProductInvoiceStyles();
        var serviceTableStyles =
            ".inv-lines.inv-lines--service col.inv-col-sr{width:8%;}" +
            ".inv-lines.inv-lines--service col.inv-col-product{width:72%;}" +
            ".inv-lines.inv-lines--service col.inv-col-amount{width:20%;}";
        var previewStyles = options.preview
            ? "html,body{overflow-x:hidden;overflow-y:auto;}body{padding:12px 0;}" +
              ".sale-invoice-preview-scale{display:flex;flex-direction:column;align-items:center;gap:16px;width:100%;}" +
              ".sale-invoice-page{margin:0;transform-origin:top center;}"
            : "";
        var bodyClass = options.preview ? ' class="inv-sale-invoice-preview"' : "";
        var wrapperStart = options.preview ? '<div class="sale-invoice-preview-scale">' : "";
        var wrapperEnd = options.preview ? "</div>" : "";
        return (
            "<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><title></title>" +
            "<style>" +
            styles +
            serviceTableStyles +
            previewStyles +
            "</style></head><body" +
            bodyClass +
            ">" +
            wrapperStart +
            holder.innerHTML +
            wrapperEnd +
            "</body></html>"
        );
    }

    function generatePdfBlob(sale, taxes) {
        if (!window.InventoryDocumentExport) {
            return Promise.reject(new Error("Document export is not available."));
        }
        var html = buildSalesDocumentHtml([sale], { taxes: taxes || [] });
        return InventoryDocumentExport.generateSaleInvoicePdfBlob
            ? // Use product PDF pipeline with service HTML by temporarily swapping builder
              (function () {
                  var original = InventoryDocumentExport.buildSalesDocumentHtml;
                  InventoryDocumentExport.buildSalesDocumentHtml = function (sales, opts) {
                      return buildSalesDocumentHtml(sales, opts || { taxes: taxes || [] });
                  };
                  return InventoryDocumentExport.generateSaleInvoicePdfBlob(sale, taxes).finally(function () {
                      InventoryDocumentExport.buildSalesDocumentHtml = original;
                  });
              })()
            : Promise.reject(new Error("PDF export is not available."));
    }

    return {
        buildSalesDocumentHtml: buildSalesDocumentHtml,
        generatePdfBlob: generatePdfBlob
    };
})();
