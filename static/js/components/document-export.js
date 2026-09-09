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
        var business = getBusinessDetails();
        return business.business_name || business.name || "Business";
    }

    function getBusinessDetails() {
        if (window.InventoryBusiness && typeof InventoryBusiness.getActiveBusiness === "function") {
            return InventoryBusiness.getActiveBusiness() || {};
        }
        return {};
    }

    function formatMoney(value) {
        if (window.InventoryApi && typeof InventoryApi.formatMoney === "function") {
            return InventoryApi.formatMoney(value);
        }
        return Number(value || 0).toFixed(2);
    }

    function displayText(value) {
        if (value === null || value === undefined || String(value).trim() === "") return "—";
        return escapeHtml(String(value));
    }

    function formatMultiline(value) {
        if (value === null || value === undefined || String(value).trim() === "") return "—";
        return escapeHtml(String(value)).replace(/\r?\n/g, "<br/>");
    }

    function formatDisplayDate(value) {
        if (typeof InventoryDateFormat !== "undefined") {
            return escapeHtml(InventoryDateFormat.formatDisplayDate(value, "—"));
        }
        if (!value) return "—";
        return escapeHtml(String(value));
    }

    function formatQty(value) {
        var num = Number(value || 0);
        if (Number.isInteger(num)) return String(num);
        return num.toFixed(2).replace(/\.?0+$/, "");
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
        if (paise > 0) {
            words += " and " + convertIndian(paise) + " Paise";
        }
        return words + " Only";
    }

    function getPaymentInfo(business) {
        business = business || {};
        return {
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
            String(info.accountHolder || "").trim() ||
            String(info.accountNumber || "").trim() ||
            String(info.ifsc || "").trim() ||
            String(info.bank || "").trim() ||
            String(info.branch || "").trim()
        );
    }

    function buildInlineDetailField(label, value, hideIfEmpty) {
        if (hideIfEmpty && (value === null || value === undefined || String(value).trim() === "")) {
            return "";
        }
        var isMultiline = value !== null && value !== undefined && String(value).indexOf("\n") !== -1;
        var display = value === null || value === undefined || String(value).trim() === ""
            ? "—"
            : (isMultiline ? formatMultiline(value) : displayText(value));
        var multilineClass = isMultiline ? " inv-detail-field--multiline" : "";
        return (
            '<div class="inv-detail-field inv-detail-field--table' + multilineClass + '">' +
            '<span class="inv-detail-label">' + escapeHtml(String(label).toUpperCase()) + "</span>" +
            '<span class="inv-detail-colon">:</span>' +
            '<span class="inv-detail-value">' + display + "</span>" +
            "</div>"
        );
    }

    function buildInlineContactRow(mobile, email) {
        var mobileStr = mobile ? String(mobile).trim() : "";
        var emailStr = email ? String(email).trim() : "";
        if (!mobileStr && !emailStr) return "";

        var html = '<div class="inv-detail-field inv-detail-field--inline inv-detail-field--split">';
        if (mobileStr) {
            html += '<span class="inv-contact-item">' +
                '<span class="inv-detail-label">MOBILE:</span> ' +
                '<span class="inv-detail-value">' + displayText(mobileStr) + "</span></span>";
        }
        if (emailStr) {
            if (mobileStr) html += '<span class="inv-contact-sep">|</span>';
            html += '<span class="inv-contact-item">' +
                '<span class="inv-detail-label">EMAIL:</span> ' +
                '<span class="inv-detail-value">' + displayText(emailStr) + "</span></span>";
        }
        html += "</div>";
        return html;
    }

    function wrapHeaderPanel(bodyHtml, extraClass) {
        return (
            '<div class="inv-header-panel' + (extraClass ? " " + extraClass : "") + '">' +
            bodyHtml +
            "</div>"
        );
    }

    function hasCustomerCompany(sale) {
        return !!(sale.company_name && String(sale.company_name).trim());
    }

    function getCustomerCompanyDisplayName(sale) {
        var name = hasCustomerCompany(sale)
            ? sale.company_name
            : (sale.customer_name || "Customer");
        name = String(name).trim();
        return name || "Customer";
    }

    function buildHeaderAddressLines(value) {
        if (value === null || value === undefined || String(value).trim() === "") {
            return "";
        }
        return '<div class="inv-header-address-lines">' + formatMultiline(value) + "</div>";
    }

    function buildCustomerCompanyColumn(sale) {
        var companyName = getCustomerCompanyDisplayName(sale);
        var gstNo = sale.customer_gst_number || "";
        var companyAddress = hasCustomerCompany(sale)
            ? (sale.company_address || sale.billing_address || "")
            : (sale.customer_address || sale.billing_address || "");

        var body =
            '<p class="inv-header-customer-name">' + escapeHtml(companyName) + "</p>" +
            buildHeaderAddressLines(companyAddress);
        if (hasCustomerCompany(sale)) {
            body += buildInlineDetailField("GST No", gstNo, true);
        }

        return wrapHeaderPanel(body, "inv-header-panel--company");
    }

    function buildBusinessColumn(business, businessName) {
        var body =
            '<p class="inv-header-panel-title">GST Invoice</p>' +
            '<p class="inv-header-business-name">' + escapeHtml(businessName) + "</p>" +
            buildInlineDetailField("GST No", business.gst_number, false) +
            buildInlineDetailField("Address", business.address, false);

        if (business.phone) {
            body += buildInlineDetailField("Tel. No.", business.phone, true);
        }
        if (business.email) {
            body += buildInlineDetailField("Email", business.email, true);
        }

        return wrapHeaderPanel(body, "inv-header-panel--business");
    }

    function buildInvoiceDetailsColumn(sale, invoiceNo, invoiceDate) {
        return wrapHeaderPanel(
            '<p class="inv-header-panel-title">Original Copy</p>' +
            buildInlineDetailField("Invoice No", invoiceNo, false) +
            buildInlineDetailField("Invoice Date", invoiceDate, false) +
            buildInlineDetailField("Bill Date", invoiceDate, false) +
            buildInlineDetailField("Transport", sale.invoice_transport, true) +
            buildInlineDetailField("No. of Cartons", sale.invoice_cartons, true) +
            buildInlineDetailField("E-Way Bill No", sale.invoice_eway_bill_no, true) +
            buildInlineDetailField("Due Date", sale.due_date ? formatDisplayDate(sale.due_date) : "", true) +
            buildInlineDetailField("Terms", sale.invoice_print_terms, true) +
            buildInlineDetailField("PO Number", sale.po_number || sale.po_no || "", true) +
            buildInlineDetailField("Payment", sale.payment_type_name || "", true),
            "inv-header-panel--invoice"
        );
    }

    function buildInvoiceHeaderRow(sale, business, businessName, invoiceNo, invoiceDate) {
        return (
            '<section class="inv-header-row">' +
            buildCustomerCompanyColumn(sale) +
            buildBusinessColumn(business, businessName) +
            buildInvoiceDetailsColumn(sale, invoiceNo, invoiceDate) +
            "</section>"
        );
    }

    function buildMetaLine(label, value, hideIfEmpty) {
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

    function buildPaymentInfoSection(paymentInfo) {
        if (!hasPaymentInfo(paymentInfo)) return "";

        return (
            '<section class="inv-payment-info">' +
            "<h3>Payment Information</h3>" +
            '<div class="inv-info-list">' +
            buildMetaLine("Account Holder", paymentInfo.accountHolder, true) +
            buildMetaLine("Account Number", paymentInfo.accountNumber, true) +
            buildMetaLine("IFSC", paymentInfo.ifsc, true) +
            buildMetaLine("Bank", paymentInfo.bank, true) +
            buildMetaLine("Branch", paymentInfo.branch, true) +
            "</div></section>"
        );
    }

    function buildAuthorizedSignatureSection(sale) {
        var customerCompany = getCustomerCompanyDisplayName(sale);

        return (
            '<div class="inv-signature-block">' +
            '<div class="inv-signature-inner">' +
            '<p class="inv-signature-company">For ' + escapeHtml(customerCompany) + "</p>" +
            '<div class="inv-signature-line"></div>' +
            '<p class="inv-signature-label">Authorized Signature</p>' +
            "</div></div>"
        );
    }

    function buildTermsBodyHtml(sale) {
        var termsText = (sale.invoice_terms_conditions && String(sale.invoice_terms_conditions).trim())
            || (sale.notes && String(sale.notes).trim())
            || "";
        if (!termsText) return "";

        return window.InventoryTermsHtml
            ? InventoryTermsHtml.renderForPrint(termsText)
            : formatMultiline(termsText);
    }

    function buildTermsAndPaymentFooterSection(sale) {
        var termsBodyHtml = buildTermsBodyHtml(sale);
        var qrUrl = sale.invoice_qr_image_url && String(sale.invoice_qr_image_url).trim()
            ? String(sale.invoice_qr_image_url).trim()
            : "";

        if (!termsBodyHtml && !qrUrl) return "";

        var termsBlock = termsBodyHtml
            ? (
                '<div class="inv-invoice-bottom-terms">' +
                '<section class="inv-terms">' +
                "<h3>Terms &amp; Conditions</h3>" +
                '<div class="inv-terms-body">' + termsBodyHtml + "</div>" +
                "</section></div>"
            )
            : "";

        var qrBlock = qrUrl
            ? (
                '<div class="inv-invoice-bottom-qr">' +
                "<h3>Scan to Pay</h3>" +
                '<div class="inv-qr-wrap">' +
                '<img class="inv-qr" src="' + escapeHtml(qrUrl) + '" alt="Payment QR Code"/>' +
                "</div></div>"
            )
            : "";

        var rowClass = termsBlock && qrBlock
            ? "inv-invoice-bottom-row"
            : "inv-invoice-bottom-row inv-invoice-bottom-row--single";

        return (
            '<footer class="inv-invoice-bottom">' +
            '<div class="' + rowClass + '">' +
            termsBlock +
            qrBlock +
            "</div></footer>"
        );
    }

    function applyLineDiscount(basePrice, discountValue, discountType) {
        var base = Number(basePrice || 0);
        if (isNaN(base) || base < 0) base = 0;
        var discount = Number(discountValue || 0);
        if (isNaN(discount) || discount <= 0) return roundMoney(base);

        if (discountType === "percent") {
            var pct = Math.min(discount, 100);
            return roundMoney(Math.max(0, base * (1 - pct / 100)));
        }
        return roundMoney(Math.max(0, base - discount));
    }

    function getLineDiscountAmounts(line) {
        var qty = Number(line.quantity || 0);
        if (qty <= 0) {
            return {
                simplePerUnit: 0,
                distributorPerUnit: 0,
                simplePercent: 0,
                distributorPercent: 0,
                afterSimple: 0,
                afterDistributor: 0
            };
        }

        var sellPrice = Number(
            line.list_price != null && line.list_price !== ""
                ? line.list_price
                : (line.unit_price || 0)
        );
        var discountType = line.discount_type === "amount" ? "amount" : "percent";
        var discountValue = Number(line.discount_value || 0);
        var distributorType = line.distributor_discount_type === "amount" ? "amount" : "percent";
        var distributorValue = Number(line.distributor_discount_value || 0);
        var afterSimple = applyLineDiscount(sellPrice, discountValue, discountType);
        var afterDistributor = applyLineDiscount(afterSimple, distributorValue, distributorType);
        var simplePerUnit = roundMoney(Math.max(0, sellPrice - afterSimple));
        var distributorPerUnit = roundMoney(Math.max(0, afterSimple - afterDistributor));

        if (simplePerUnit === 0 && distributorPerUnit === 0 && Number(line.discount_amount || 0) > 0) {
            simplePerUnit = roundMoney(Number(line.discount_amount) / qty);
            if (sellPrice > 0) {
                afterSimple = roundMoney(Math.max(0, sellPrice - simplePerUnit));
                afterDistributor = afterSimple;
            }
        }

        var simplePercent = discountType === "percent"
            ? Math.min(discountValue, 100)
            : (sellPrice > 0 ? roundMoney((simplePerUnit / sellPrice) * 100) : 0);
        var distributorPercent = distributorType === "percent"
            ? Math.min(distributorValue, 100)
            : (afterSimple > 0 ? roundMoney((distributorPerUnit / afterSimple) * 100) : 0);

        return {
            simplePerUnit: simplePerUnit,
            distributorPerUnit: distributorPerUnit,
            simplePercent: simplePercent,
            distributorPercent: distributorPercent,
            afterSimple: afterSimple,
            afterDistributor: afterDistributor
        };
    }

    function getLineTaxPercent(line, discounts) {
        discounts = discounts || getLineDiscountAmounts(line);
        var taxableBase = Number(discounts.afterDistributor || 0);
        if (taxableBase <= 0) return 0;

        var qty = Number(line.quantity || 0);
        if (qty <= 0) return 0;

        var taxPerUnit = roundMoney(Number(line.tax_amount || 0) / qty);
        return roundMoney((taxPerUnit / taxableBase) * 100);
    }

    function formatPercent(value) {
        var num = Number(value || 0);
        if (isNaN(num) || num <= 0) return "—";
        var formatted = num.toFixed(2).replace(/\.?0+$/, "");
        return formatted + "%";
    }

    function buildInvoicePrintRows(sale) {
        var rows = [];
        var serial = 0;

        (sale.items || []).forEach(function (line) {
            var batchLines = line.batch_lines && line.batch_lines.length
                ? line.batch_lines
                : [{ quantity: line.quantity, batch_number: "", expiry_date: null }];
            var lineQty = Number(line.quantity || 0);
            var lineTotal = Number(line.line_total || 0);
            var lineTax = Number(line.tax_amount || 0);
            var lineNet = Math.max(0, lineTotal - lineTax);
            var discounts = getLineDiscountAmounts(line);
            var unitPrice = Number(
                line.list_price != null && line.list_price !== ""
                    ? line.list_price
                    : (line.unit_price || 0)
            );

            batchLines.forEach(function (batchLine) {
                serial += 1;
                var batchQty = Number(batchLine.quantity || 0);
                var ratio = lineQty > 0 ? batchQty / lineQty : 1;

                rows.push({
                    serial: serial,
                    product_name: line.product_name,
                    product_sku: line.product_sku,
                    quantity: batchQty,
                    unit: line.product_unit || "pcs",
                    batch_number: batchLine.batch_number || "",
                    expiry_date: batchLine.expiry_date,
                    price: unitPrice,
                    simple_discount: roundMoney(discounts.simplePerUnit * batchQty),
                    simple_discount_percent: discounts.simplePercent,
                    distributor_discount: roundMoney(discounts.distributorPerUnit * batchQty),
                    distributor_discount_percent: discounts.distributorPercent,
                    tax: roundMoney(lineTax * ratio),
                    tax_percent: getLineTaxPercent(line, discounts),
                    amount: roundMoney(lineNet * ratio)
                });
            });
        });

        return rows;
    }

    function buildInvoiceLinesColgroup() {
        return (
            "<colgroup>" +
            '<col class="inv-col-sr"/>' +
            '<col class="inv-col-product"/>' +
            '<col class="inv-col-qty"/>' +
            '<col class="inv-col-unit"/>' +
            '<col class="inv-col-exp"/>' +
            '<col class="inv-col-price"/>' +
            '<col class="inv-col-simple-amt"/>' +
            '<col class="inv-col-simple-pct"/>' +
            '<col class="inv-col-dist-amt"/>' +
            '<col class="inv-col-dist-pct"/>' +
            '<col class="inv-col-tax-amt"/>' +
            '<col class="inv-col-tax-pct"/>' +
            '<col class="inv-col-amount"/>' +
            "</colgroup>"
        );
    }

    function buildInvoiceItemRowsHtml(sale) {
        var printRows = buildInvoicePrintRows(sale);
        if (!printRows.length) {
            return '<tr class="inv-empty-row"><td colspan="13">No products on this invoice</td></tr>';
        }

        return printRows.map(function (row) {
            var itemHtml = displayText(row.product_name);
            if (row.product_sku) {
                itemHtml += '<div class="inv-item-sku">SKU: ' + displayText(row.product_sku) + "</div>";
            }

            return (
                "<tr>" +
                '<td class="center inv-col-sr">' + row.serial + "</td>" +
                '<td class="item-name inv-col-product">' + itemHtml + "</td>" +
                '<td class="num inv-col-qty">' + displayText(formatQty(row.quantity)) + "</td>" +
                '<td class="center inv-col-unit">' + displayText(row.unit) + "</td>" +
                '<td class="center inv-col-exp">' + formatDisplayDate(row.expiry_date) + "</td>" +
                '<td class="num inv-col-price">' + formatMoney(row.price) + "</td>" +
                '<td class="num inv-col-simple-amt">' + formatMoney(row.simple_discount) + "</td>" +
                '<td class="center inv-col-simple-pct">' + displayText(formatPercent(row.simple_discount_percent)) + "</td>" +
                '<td class="num inv-col-dist-amt">' + formatMoney(row.distributor_discount) + "</td>" +
                '<td class="center inv-col-dist-pct">' + displayText(formatPercent(row.distributor_discount_percent)) + "</td>" +
                '<td class="num inv-col-tax-amt">' + formatMoney(row.tax) + "</td>" +
                '<td class="center inv-col-tax-pct">' + displayText(formatPercent(row.tax_percent)) + "</td>" +
                '<td class="num inv-col-amount">' + formatMoney(row.amount) + "</td>" +
                "</tr>"
            );
        }).join("");
    }

    function saleInvoiceStyles() {
        return (
            "@page{size:A4 portrait;margin:10mm 12mm;}" +
            "*{box-sizing:border-box;}" +
            "html,body{margin:0;padding:0;background:#e8e8e8;color:#111;font-family:'Segoe UI',Calibri,'Helvetica Neue',Helvetica,sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;-webkit-print-color-adjust:exact;print-color-adjust:exact;}" +
            "body{padding:16px 0;}" +
            ".sale-invoice-page{width:210mm;min-height:277mm;max-width:210mm;margin:0 auto 16px;padding:10mm 12mm 12mm;background:#fff;border:1px solid #cfcfcf;page-break-after:always;position:relative;font-family:'Segoe UI',Calibri,'Helvetica Neue',Helvetica,sans-serif;font-size:11px;line-height:1.5;color:#111;letter-spacing:.01em;}" +
            ".sale-invoice-page:last-child{page-break-after:auto;margin-bottom:0;}" +
            ".inv-header-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));width:100%;max-width:100%;box-sizing:border-box;border:1px solid #333;margin:0 0 10px 0;}" +
            ".inv-header-panel{padding:6px 8px;border-right:1px solid #333;min-width:0;font-size:10px;line-height:1.2;display:flex;flex-direction:column;gap:2px;}" +
            ".inv-header-panel:last-child{border-right:none;}" +
            ".inv-header-panel .inv-detail-field--table{display:grid;grid-template-columns:var(--inv-header-label-width,92px) 8px minmax(0,1fr);column-gap:2px;align-items:start;line-height:1.2;margin:0;}" +
            ".inv-header-panel--company{--inv-header-label-width:98px;}" +
            ".inv-header-panel--business{--inv-header-label-width:72px;}" +
            ".inv-header-panel--invoice{--inv-header-label-width:98px;}" +
            ".inv-header-panel .inv-detail-label{text-align:left;font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#333;word-break:break-word;}" +
            ".inv-header-panel .inv-detail-colon{text-align:center;font-weight:800;color:#333;}" +
            ".inv-header-panel .inv-detail-value{font-weight:700;color:#000;word-break:break-word;min-width:0;}" +
            ".inv-header-panel-title{margin:0 0 2px;font-size:11px;font-weight:800;text-align:center;text-transform:uppercase;letter-spacing:.06em;color:#000;}" +
            ".inv-header-name-row{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px;margin-bottom:2px;}" +
            ".inv-header-panel-heading{margin:0;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#333;flex-shrink:0;}" +
            ".inv-header-customer-name{margin:0 0 2px;font-size:12px;font-weight:800;text-transform:uppercase;line-height:1.15;color:#000;letter-spacing:.05em;}" +
            ".inv-header-address-lines{margin:0 0 2px;font-size:10px;font-weight:600;line-height:1.2;color:#000;}" +
            ".inv-header-business-name{margin:0 0 2px;font-size:10px;font-weight:800;text-transform:uppercase;line-height:1.15;color:#000;}" +
            ".inv-detail-field--inline{line-height:1.5;font-size:10px;}" +
            ".inv-detail-field--inline .inv-detail-label{font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#333;}" +
            ".inv-detail-field--inline .inv-detail-value{font-weight:700;color:#000;word-break:break-word;}" +
            ".inv-detail-field--inline.inv-detail-field--multiline .inv-detail-value{display:block;margin-top:2px;}" +
            ".inv-detail-field--split{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;}" +
            ".inv-contact-item{white-space:nowrap;}" +
            ".inv-contact-sep{color:#999;font-weight:400;padding:0 2px;}" +
            ".inv-meta-block{display:flex;flex-direction:column;align-items:flex-end;gap:6px;font-size:11px;}" +
            ".inv-meta-line{display:flex;justify-content:flex-end;align-items:baseline;gap:8px;max-width:100%;}" +
            ".inv-meta-label{font-weight:700;color:#333;white-space:nowrap;}" +
            ".inv-meta-value{font-weight:800;color:#000;text-align:right;}" +
            ".inv-lines-wrap{width:100%;max-width:100%;overflow-x:visible;margin-bottom:10px;}" +
            ".inv-lines{width:100%;max-width:100%;border-collapse:collapse;font-size:8px;table-layout:fixed;}" +
            ".inv-lines col.inv-col-sr{width:4%;}" +
            ".inv-lines col.inv-col-product{width:30%;}" +
            ".inv-lines col.inv-col-qty{width:4%;}" +
            ".inv-lines col.inv-col-unit{width:4%;}" +
            ".inv-lines col.inv-col-exp{width:6%;}" +
            ".inv-lines col.inv-col-price{width:6.5%;}" +
            ".inv-lines col.inv-col-simple-amt{width:6.5%;}" +
            ".inv-lines col.inv-col-simple-pct{width:5%;}" +
            ".inv-lines col.inv-col-dist-amt{width:6.5%;}" +
            ".inv-lines col.inv-col-dist-pct{width:5%;}" +
            ".inv-lines col.inv-col-tax-amt{width:6%;}" +
            ".inv-lines col.inv-col-tax-pct{width:4.5%;}" +
            ".inv-lines col.inv-col-amount{width:12%;}" +
            ".inv-lines th.inv-col-sr,.inv-lines td.inv-col-sr{text-align:center;}" +
            ".inv-lines th.inv-col-product,.inv-lines td.inv-col-product{word-wrap:break-word;overflow-wrap:anywhere;}" +
            ".inv-lines-page-header-cell{padding:0 0 8px 0;border:none;vertical-align:top;background:#fff;width:100%;}" +
            ".inv-lines thead tr.inv-lines-page-header td{border:none;padding:0;}" +
            ".inv-lines th,.inv-lines td{border:1px solid #333;padding:4px 5px;vertical-align:top;word-wrap:break-word;overflow-wrap:anywhere;}" +
            ".inv-lines thead th{background:#f5f5f5;font-weight:800;font-size:8px;line-height:1.2;text-align:center;color:#000;}" +
            ".inv-lines td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:700;}" +
            ".inv-lines td.center{text-align:center;font-weight:700;}" +
            ".inv-lines td.item-name{font-weight:800;color:#000;font-size:9px;line-height:1.35;}" +
            ".inv-item-sku{font-size:8px;color:#444;font-weight:600;margin-top:2px;}" +
            ".inv-amount-words{margin:10px 0 12px;padding:0;font-size:12px;line-height:1.6;font-weight:600;}" +
            ".inv-amount-words strong{font-weight:800;color:#000;}" +
            ".inv-footer-grid{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:16px;}" +
            ".inv-signature-block{flex:1;min-width:0;display:flex;align-items:flex-end;}" +
            ".inv-signature-inner{text-align:center;min-width:220px;max-width:300px;}" +
            ".inv-signature-company{margin:0 0 48px;font-size:14px;font-weight:800;color:#111;text-transform:uppercase;letter-spacing:.04em;}" +
            ".inv-signature-line{border-top:1px solid #333;height:0;margin:0 auto 8px;min-width:200px;}" +
            ".inv-signature-label{margin:0;font-size:11px;font-weight:700;color:#333;letter-spacing:.02em;}" +
            ".inv-payment-row{margin-bottom:16px;}" +
            ".inv-payment-info{flex:1;min-width:0;max-width:52%;}" +
            ".inv-payment-info h3,.inv-terms h3,.inv-invoice-bottom-qr h3{margin:0 0 8px;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#000;}" +
            ".inv-info-list{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:600;}" +
            ".inv-info-list .inv-meta-line{justify-content:flex-start;}" +
            ".inv-totals-wrap{min-width:250px;flex-shrink:0;margin-left:auto;}" +
            ".inv-totals{width:100%;border-collapse:collapse;font-size:12px;}" +
            ".inv-totals td{border:1px solid #999;padding:7px 10px;}" +
            ".inv-totals td:first-child{background:#f5f5f5;font-weight:800;width:55%;}" +
            ".inv-totals td:last-child{text-align:right;font-weight:800;font-variant-numeric:tabular-nums;}" +
            ".inv-totals tr.inv-total-final td{background:#efefef;font-size:13px;font-weight:800;}" +
            ".inv-invoice-bottom{margin-top:18px;padding-top:14px;border-top:1px solid #bbb;}" +
            ".inv-invoice-bottom-row{display:flex;align-items:flex-start;gap:24px;}" +
            ".inv-invoice-bottom-terms{flex:0 0 65%;min-width:0;}" +
            ".inv-invoice-bottom-qr{flex:0 0 35%;min-width:0;text-align:center;}" +
            ".inv-invoice-bottom-row--single .inv-invoice-bottom-terms," +
            ".inv-invoice-bottom-row--single .inv-invoice-bottom-qr{flex:1 1 100%;max-width:100%;}" +
            ".inv-invoice-bottom-row--single .inv-invoice-bottom-qr{text-align:center;}" +
            ".inv-terms{margin:0;padding:0;font-size:11px;line-height:1.6;color:#333;font-weight:600;}" +
            ".inv-terms-body{margin:0;}" +
            ".inv-terms-body ol,.inv-terms-body ul{margin:0;padding-left:1.35em;}" +
            ".inv-terms-body li{margin:4px 0;}" +
            ".inv-terms-body b,.inv-terms-body strong{font-weight:800;color:#000;}" +
            ".inv-terms p{margin:0;white-space:pre-wrap;}" +
            ".inv-qr-wrap{margin:0 auto;text-align:center;}" +
            ".inv-qr{width:120px;height:120px;object-fit:contain;display:inline-block;}" +
            ".inv-bottom-note{margin-top:16px;padding:0;text-align:center;font-size:13px;font-weight:800;color:#000;}" +
            ".inv-empty-row td{text-align:center;color:#666;font-style:italic;padding:14px;}" +
            "@media print{" +
            "@page{size:A4 portrait;margin:0;}" +
            "html,body{background:#fff;padding:0;}" +
            ".sale-invoice-page{border:none;margin:0;box-shadow:none;width:auto;min-height:auto;max-width:none;padding:10mm 12mm 12mm;}" +
            ".inv-lines thead{display:table-header-group;}" +
            ".inv-lines tfoot{display:table-footer-group;}" +
            ".inv-lines tbody tr{page-break-inside:avoid;break-inside:avoid;}" +
            ".inv-lines-page-header-cell{background:#fff;}" +
            "}"
        );
    }

    function computeInvoiceRoundTotals(totalAmount, totalTax, fallbackTotal) {
        var preRoundTotal = roundMoney(Number(totalAmount || 0) + Number(totalTax || 0));
        if (!preRoundTotal && fallbackTotal) {
            preRoundTotal = roundMoney(fallbackTotal);
        }
        var roundedGrandTotal = Math.round(preRoundTotal);
        var roundOff = roundMoney(roundedGrandTotal - preRoundTotal);
        return {
            preRoundTotal: preRoundTotal,
            roundOff: roundOff,
            grandTotal: roundedGrandTotal
        };
    }

    function formatRoundOff(value) {
        var num = roundMoney(value);
        if (num > 0) return "+" + formatMoney(num);
        return formatMoney(num);
    }

    function buildSaleInvoiceHtml(sale) {
        var business = getBusinessDetails();
        var businessName = sale.business_name || business.business_name || business.name || "Business";
        var paymentInfo = getPaymentInfo(business);

        var items = sale.items || [];
        var subtotal = 0;
        var totalTax = 0;
        var totalAmount = 0;
        items.forEach(function (line) {
            subtotal += Number(line.line_total || 0);
            totalTax += Number(line.tax_amount || 0);
            totalAmount += Math.max(0, Number(line.line_total || 0) - Number(line.tax_amount || 0));
        });

        var itemRows = buildInvoiceItemRowsHtml(sale);

        subtotal = roundMoney(subtotal);
        totalTax = roundMoney(totalTax);
        totalAmount = roundMoney(totalAmount);
        var saleTotal = roundMoney(Number(sale.total_amount || subtotal));
        if (!subtotal && saleTotal) subtotal = saleTotal;
        var roundTotals = computeInvoiceRoundTotals(totalAmount, totalTax, saleTotal);

        var invoiceNo = sale.reference_no || ("SALE-" + sale.id);
        var invoiceDate = formatDisplayDate(sale.purchase_date);
        var paymentFooterHtml = buildTermsAndPaymentFooterSection(sale);

        var headerRowHtml = buildInvoiceHeaderRow(sale, business, businessName, invoiceNo, invoiceDate);

        return (
            '<section class="sale-invoice-page">' +
            '<div class="inv-lines-wrap"><table class="inv-lines">' +
            buildInvoiceLinesColgroup() +
            "<thead>" +
            '<tr class="inv-lines-page-header"><td colspan="13" class="inv-lines-page-header-cell">' +
            headerRowHtml +
            "</td></tr>" +
            "<tr>" +
            '<th class="center inv-col-sr">Sr.</th>' +
            '<th class="center inv-col-product">Product</th>' +
            '<th class="center inv-col-qty">Qty</th>' +
            '<th class="center inv-col-unit">Unit</th>' +
            '<th class="center inv-col-exp">Exp.</th>' +
            '<th class="center inv-col-price">Price (₹)</th>' +
            '<th class="center inv-col-simple-amt">Simple<br/>Discount (₹)</th>' +
            '<th class="center inv-col-simple-pct">Simple<br/>Discount (%)</th>' +
            '<th class="center inv-col-dist-amt">Distributor<br/>Discount (₹)</th>' +
            '<th class="center inv-col-dist-pct">Distributor<br/>Discount (%)</th>' +
            '<th class="center inv-col-tax-amt">Tax (₹)</th>' +
            '<th class="center inv-col-tax-pct">Tax (%)</th>' +
            '<th class="center inv-col-amount">Amount (₹)</th>' +
            "</tr></thead><tbody>" + itemRows + "</tbody></table></div>" +
            '<div class="inv-amount-words"><strong>Amount in words:</strong> ' +
            escapeHtml(amountInWordsInr(roundTotals.grandTotal)) + "</div>" +
            '<div class="inv-footer-grid">' +
            buildAuthorizedSignatureSection(sale) +
            '<div class="inv-totals-wrap">' +
            '<table class="inv-totals">' +
            "<tr><td>Amount (₹)</td><td>" + formatMoney(totalAmount || roundTotals.preRoundTotal) + "</td></tr>" +
            "<tr><td>Tax (₹)</td><td>" + formatMoney(totalTax) + "</td></tr>" +
            "<tr><td>Total (₹)</td><td>" + formatMoney(roundTotals.preRoundTotal) + "</td></tr>" +
            "<tr><td>Round Off (₹)</td><td>" + formatRoundOff(roundTotals.roundOff) + "</td></tr>" +
            "<tr class=\"inv-total-final\"><td>Grand Total (₹)</td><td>" + formatMoney(roundTotals.grandTotal) + "</td></tr>" +
            "</table></div></div>" +
            (hasPaymentInfo(paymentInfo)
                ? '<div class="inv-payment-row">' + buildPaymentInfoSection(paymentInfo) + "</div>"
                : "") +
            paymentFooterHtml +
            '<div class="inv-bottom-note">Thank you</div>' +
            "</section>"
        );
    }

    function roundMoney(value) {
        return Math.round(Number(value || 0) * 100) / 100;
    }

    function buildSalesDocumentHtml(sales) {
        var list = sales || [];
        var sections = list.map(function (sale) {
            return buildSaleInvoiceHtml(sale);
        }).join("");

        return (
            "<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><title></title>" +
            "<style>" + saleInvoiceStyles() + "</style></head><body>" +
            sections +
            "</body></html>"
        );
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
            '<p class="meta">' + escapeHtml(getBusinessName()) + " · Generated " + escapeHtml(InventoryDateFormat.formatDateTime(new Date().toISOString())) + "</p>" +
            "<table><thead><tr>" + head + "</tr></thead><tbody>" + body + "</tbody></table>" +
            "</body></html>"
        );
    }

    var printFrame = null;

    function getPrintFrame() {
        if (printFrame && printFrame.parentNode) {
            return printFrame;
        }
        printFrame = document.createElement("iframe");
        printFrame.setAttribute("title", "Print document");
        printFrame.setAttribute("aria-hidden", "true");
        printFrame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
        document.body.appendChild(printFrame);
        return printFrame;
    }

    function printHtml(title, html) {
        var frame = getPrintFrame();
        var frameWin = frame.contentWindow;
        var frameDoc = frame.contentDocument || frameWin.document;
        if (!frameWin || !frameDoc) {
            if (window.InventoryToast) InventoryToast.error("Unable to prepare print view.");
            return;
        }

        var printed = false;
        function triggerPrint() {
            if (printed) return;
            printed = true;
            frameWin.print();
            window.focus();
        }

        frameDoc.open();
        frameDoc.write(html);
        frameDoc.close();
        window.setTimeout(triggerPrint, 100);
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
                    docWithTable.text("Generated " + InventoryDateFormat.formatDateTime(new Date().toISOString()), 14, 30);

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
                    doc.text("Date: " + formatDisplayDate(sale.purchase_date), 14, y);
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
