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

    function loadHtml2Canvas() {
        if (window.html2canvas) return Promise.resolve(window.html2canvas);
        return new Promise(function (resolve, reject) {
            var script = document.createElement("script");
            script.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
            script.onload = function () {
                if (window.html2canvas) resolve(window.html2canvas);
                else reject(new Error("html2canvas failed to load."));
            };
            script.onerror = function () {
                reject(new Error("Unable to load invoice renderer."));
            };
            document.head.appendChild(script);
        });
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

    function generateSaleInvoicePdfBlob(sale, taxes) {
        return appendSaleInvoicePdf(sale, taxes).then(function (pdf) {
            return pdf.output("blob");
        });
    }

    function appendSaleInvoicePdf(sale, taxes, existingPdf) {
        return Promise.all([loadJsPdf(), loadHtml2Canvas()]).then(function (loaded) {
            var jsPDF = loaded[0];
            var html2canvas = loaded[1];
            return renderInvoiceFrame(buildSalesDocumentHtml([sale], { taxes: taxes || [] })).then(function (frame) {
                var frameDoc = frame.contentDocument;
                var pages = Array.prototype.slice.call(frameDoc.querySelectorAll(".sale-invoice-page"));
                var captureWidth = Math.max(frameDoc.documentElement.scrollWidth, frameDoc.body.scrollWidth);
                var captureHeight = Math.max(frameDoc.documentElement.scrollHeight, frameDoc.body.scrollHeight);
                var pdf = existingPdf || new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
                var chain = Promise.resolve();
                pages.forEach(function (page, index) {
                    chain = chain.then(function () {
                        var originalStyle = page.getAttribute("style");
                        var pageWidth = page.offsetWidth;
                        var pageHeight = page.offsetHeight;
                        page.style.position = "fixed";
                        page.style.top = "0";
                        page.style.left = "0";
                        page.style.margin = "0";
                        page.style.zoom = "1";
                        return html2canvas(page, {
                            scale: 2,
                            foreignObjectRendering: true,
                            useCORS: true,
                            backgroundColor: "#ffffff",
                            width: pageWidth,
                            height: pageHeight,
                            windowWidth: Math.max(captureWidth, pageWidth),
                            windowHeight: Math.max(captureHeight, pageHeight),
                            scrollX: 0,
                            scrollY: 0
                        }).finally(function () {
                            if (originalStyle === null) page.removeAttribute("style");
                            else page.setAttribute("style", originalStyle);
                        });
                    }).then(function (canvas) {
                        if (existingPdf || index > 0) pdf.addPage("a4", "portrait");
                        pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0,
                            pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight(), undefined, "FAST");
                    });
                });
                return chain.then(function () { return pdf; }).finally(function () { frame.remove(); });
            });
        });
    }

    function renderInvoiceFrame(html) {
        return new Promise(function (resolve, reject) {
            var frame = document.createElement("iframe");
            frame.setAttribute("aria-hidden", "true");
            frame.style.cssText = "position:fixed;left:0;top:0;width:210mm;height:297mm;border:0;opacity:0.01;pointer-events:none;background:#fff;";
            document.body.appendChild(frame);
            var frameDoc = frame.contentDocument || frame.contentWindow.document;
            frameDoc.open();
            frameDoc.write(html);
            frameDoc.close();
            var fit = frameDoc.createElement("style");
            fit.textContent =
                "@page{size:A4 portrait;margin:0;}" +
                "html,body{margin:0!important;padding:0!important;background:#fff!important;width:210mm!important;min-height:297mm!important;overflow:visible!important;}" +
                ".sale-invoice-page{width:210mm!important;height:297mm!important;min-height:297mm!important;max-width:210mm!important;margin:0!important;border:0!important;box-sizing:border-box!important;padding:10mm 12mm 12mm!important;}";
            frameDoc.head.appendChild(fit);
            prepareSalesDocument(frameDoc, true).then(function () {
                frame.style.height = Math.max(frameDoc.documentElement.scrollHeight, frameDoc.body.scrollHeight, 1123) + "px";
                resolve(frame);
            }).catch(function (err) {
                frame.remove();
                reject(err);
            });
        });
    }

    function prepareSalesDocument(doc, embedImages) {
        var assets = Array.prototype.map.call(doc.images, function (img) {
            return new Promise(function (resolve, reject) {
                var timer;
                function finish() {
                    window.clearTimeout(timer);
                    img.removeEventListener("load", finish);
                    img.removeEventListener("error", finish);
                    if (!img.complete || !img.naturalWidth) {
                        reject(new Error("Unable to load the invoice image. Please try again."));
                        return;
                    }
                    if (!embedImages) { resolve(); return; }
                    try {
                        var canvas = doc.createElement("canvas");
                        canvas.width = img.naturalWidth;
                        canvas.height = img.naturalHeight;
                        canvas.getContext("2d").drawImage(img, 0, 0);
                        img.src = canvas.toDataURL("image/png");
                        if (img.decode) img.decode().then(resolve, reject);
                        else resolve();
                    } catch (err) {
                        reject(new Error("Unable to prepare the invoice image. Please try again."));
                    }
                }
                if (img.complete) { finish(); return; }
                img.addEventListener("load", finish);
                img.addEventListener("error", finish);
                timer = window.setTimeout(finish, 15000);
            });
        });
        if (doc.fonts) assets.push(doc.fonts.ready);
        return Promise.all(assets).then(function () {
            paginateSalesDocument(doc);
        });
    }

    // Measure real DOM rows before capture. Preview, browser print and PDF all
    // consume these same A4 sheets; no bitmap is cut through text or table cells.
    function paginateSalesDocument(doc) {
        var sources = Array.prototype.slice.call(doc.querySelectorAll('.sale-invoice-page:not([data-paginated])'));
        sources.forEach(function (source) {
            var header = source.querySelector('.inv-invoice-header');
            var sourceTable = source.querySelector('.inv-lines');
            if (!header || !sourceTable) return;
            var pages = [];
            var content;
            var currentTable;
            var currentBody;
            function newPage() {
                var page = source.cloneNode(false);
                page.setAttribute('data-paginated', 'true');
                page.style.zoom = '1';
                content = doc.createElement('div');
                content.className = 'inv-page-content';
                if (!pages.length) content.appendChild(header.cloneNode(true));
                page.appendChild(content);
                source.parentNode.insertBefore(page, source);
                pages.push(page);
                currentTable = null;
                currentBody = null;
            }
            function fits() {
                return content.lastElementChild.getBoundingClientRect().bottom <= content.getBoundingClientRect().bottom + 0.25;
            }
            function hasContent() { return content.children.length > 1; }
            function fitOversized(block) {
                // A single exceptionally large row/block cannot be divided safely.
                // Scale that block to the printable space instead of clipping text.
                var room = content.getBoundingClientRect().bottom - block.getBoundingClientRect().top;
                var height = block.getBoundingClientRect().height;
                if (height > room && room > 0) block.style.zoom = String(Math.max(0.01, (room - 1) / height));
            }
            function makeItemTable() {
                var wrap = doc.createElement('div');
                wrap.className = 'inv-lines-wrap';
                currentTable = sourceTable.cloneNode(false);
                currentTable.appendChild(sourceTable.querySelector('colgroup').cloneNode(true));
                var head = sourceTable.tHead.cloneNode(true);
                head.querySelector('.inv-lines-page-header').remove();
                currentTable.appendChild(head);
                currentBody = doc.createElement('tbody');
                currentTable.appendChild(currentBody);
                wrap.appendChild(currentTable);
                content.appendChild(wrap);
                return wrap;
            }
            function appendBlock(block) {
                var alreadyPopulated = hasContent();
                content.appendChild(block);
                if (fits()) return;
                block.remove();
                if (alreadyPopulated) newPage();
                content.appendChild(block);
                if (!fits()) fitOversized(block);
            }
            function appendTaxSection(sourceSection) {
                var completeSection = sourceSection.cloneNode(true);
                var alreadyPopulated = hasContent();
                content.appendChild(completeSection);
                if (fits()) return;

                completeSection.remove();
                if (alreadyPopulated) newPage();
                completeSection = sourceSection.cloneNode(true);
                content.appendChild(completeSection);
                if (fits()) return;
                completeSection.remove();

                var sourceTaxTable = sourceSection.querySelector(".inv-tax-summary");
                var sourceTaxBody = sourceTaxTable && sourceTaxTable.tBodies[0];
                if (!sourceTaxTable || !sourceTaxBody) {
                    appendBlock(sourceSection.cloneNode(true));
                    return;
                }

                var currentTaxSection;
                var currentTaxTable;
                var currentTaxBody;
                function startTaxSection() {
                    currentTaxSection = sourceSection.cloneNode(false);
                    currentTaxTable = sourceTaxTable.cloneNode(false);
                    currentTaxTable.appendChild(sourceTaxTable.tHead.cloneNode(true));
                    currentTaxBody = doc.createElement("tbody");
                    currentTaxTable.appendChild(currentTaxBody);
                    currentTaxSection.appendChild(currentTaxTable);
                    content.appendChild(currentTaxSection);
                }
                function startTaxPage() {
                    newPage();
                    startTaxSection();
                }
                function addTaxRow(originalRow) {
                    var row = originalRow.cloneNode(true);
                    currentTaxBody.appendChild(row);
                    if (fits()) return;

                    row.remove();
                    if (currentTaxBody.rows.length) {
                        startTaxPage();
                        currentTaxBody.appendChild(row);
                    } else {
                        currentTaxBody.appendChild(row);
                        fitOversized(currentTaxSection);
                        return;
                    }
                    if (!fits()) fitOversized(row);
                }

                startTaxSection();
                Array.prototype.forEach.call(sourceTaxBody.rows, addTaxRow);

                if (sourceTaxTable.tFoot) {
                    currentTaxTable.appendChild(sourceTaxTable.tFoot.cloneNode(true));
                    if (!fits()) {
                        currentTaxTable.tFoot.remove();
                        startTaxPage();
                        currentTaxTable.appendChild(sourceTaxTable.tFoot.cloneNode(true));
                        if (!fits()) fitOversized(currentTaxSection);
                    }
                }

                var amountWords = sourceSection.querySelector(".inv-amount-words");
                if (amountWords) {
                    var words = amountWords.cloneNode(true);
                    currentTaxSection.appendChild(words);
                    if (!fits()) {
                        words.remove();
                        startTaxPage();
                        currentTaxSection.appendChild(words);
                        if (!fits()) fitOversized(words);
                    }
                }
            }
            newPage();
            var wrap = makeItemTable();
            Array.prototype.forEach.call(sourceTable.tBodies[0].rows, function (original) {
                var row = original.cloneNode(true);
                currentBody.appendChild(row);
                if (!fits()) {
                    row.remove();
                    if (currentBody.rows.length) {
                        newPage();
                        wrap = makeItemTable();
                    }
                    currentBody.appendChild(row);
                    if (!fits()) fitOversized(wrap);
                }
            });
            var totals = sourceTable.querySelector('.inv-invoice-totals').cloneNode(true);
            currentTable.appendChild(totals);
            if (!fits()) {
                totals.remove();
                newPage();
                var totalsWrap = doc.createElement('div');
                totalsWrap.className = 'inv-lines-wrap';
                var totalsTable = sourceTable.cloneNode(false);
                totalsTable.appendChild(sourceTable.querySelector('colgroup').cloneNode(true));
                totalsTable.appendChild(totals);
                totalsWrap.appendChild(totalsTable);
                appendBlock(totalsWrap);
            }
            appendTaxSection(source.querySelector('.inv-tax-section'));
            appendBlock(source.querySelector('.inv-invoice-bottom').cloneNode(true));
            pages.forEach(function (page, index) {
                var label = doc.createElement('div');
                label.className = 'inv-page-number';
                label.textContent = 'Page ' + (index + 1) + ' of ' + pages.length;
                page.appendChild(label);
            });
            source.remove();
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

    function buildCustomerCompanyColumn(sale, shipping) {
        var billingAddress = sale.billing_address || sale.company_address || sale.customer_address || "";
        var address = shipping ? (sale.shipping_address || billingAddress) : billingAddress;
        var body = '<p class="inv-party-title">' + (shipping ? "Shipped to :" : "Billed to :") + "</p>" +
            '<p class="inv-header-customer-name">' + escapeHtml(getCustomerCompanyDisplayName(sale)) + "</p>" +
            buildHeaderAddressLines(address) +
            buildInlineDetailField("GSTIN / UIN", sale.customer_gst_number, false) +
            buildInlineDetailField("Mobile", sale.company_mobile || sale.customer_mobile, true) +
            buildInlineDetailField("Email", sale.customer_email, true);
        return wrapHeaderPanel(body, "inv-header-panel--company");
    }

    function buildBusinessColumn(business, businessName) {
        return '<div class="inv-business-heading">' +
            '<div class="inv-business-topline"><strong>GSTIN / UIN : ' + displayText(business.gst_number) + '</strong><em>Original Copy</em></div>' +
            '<p class="inv-header-panel-title">TAX INVOICE</p>' +
            '<h1 class="inv-header-business-name">' + escapeHtml(businessName) + '</h1>' +
            '<div class="inv-business-address">' + formatMultiline(business.address) + '</div>' +
            (business.phone || business.email ? '<div class="inv-business-contact">' +
                buildInlineContactRow(business.phone, business.email) + '</div>' : '') + '</div>';
    }

    function buildInvoiceDetailsColumn(sale, invoiceNo, invoiceDate) {
        return wrapHeaderPanel(
            '<p class="inv-box-title">Invoice Details</p>' +
            buildInlineDetailField("Invoice No.", invoiceNo, false) +
            buildInlineDetailField("Dated", invoiceDate, false) +
            buildInlineDetailField("Place of Supply", sale.customer_place_of_supply || sale.place_of_supply, false) +
            buildInlineDetailField("Reverse Charge", sale.reverse_charge || "N", false) +
            buildInlineDetailField("Due Date", sale.due_date ? formatDisplayDate(sale.due_date) : "", true) +
            buildInlineDetailField("Terms", sale.invoice_print_terms, true) +
            buildInlineDetailField("PO Number", sale.po_number || sale.po_no, true) +
            buildInlineDetailField("Payment", sale.payment_type_name, true),
            "inv-header-panel--invoice");
    }

    function buildTransportDetailsColumn(sale) {
        return wrapHeaderPanel(
            '<p class="inv-box-title">Transport Details</p>' +
            buildInlineDetailField("GR/RR No.", sale.invoice_gr_rr_no, false) +
            buildInlineDetailField("Transport", sale.invoice_transport, false) +
            buildInlineDetailField("Vehicle No.", sale.invoice_vehicle_no, false) +
            buildInlineDetailField("Station", sale.invoice_station, false) +
            buildInlineDetailField("No. of Cartons", sale.invoice_cartons, true) +
            buildInlineDetailField("E-Way Bill No", sale.invoice_eway_bill_no, true),
            "inv-header-panel--transport");
    }

    function buildInvoiceHeaderRow(sale, business, businessName, invoiceNo, invoiceDate) {
        return '<section class="inv-invoice-header">' + buildBusinessColumn(business, businessName) +
            '<div class="inv-header-row inv-header-row--details">' +
            buildInvoiceDetailsColumn(sale, invoiceNo, invoiceDate) + buildTransportDetailsColumn(sale) + '</div>' +
            '<div class="inv-header-row inv-header-row--parties">' +
            buildCustomerCompanyColumn(sale, false) + buildCustomerCompanyColumn(sale, true) + '</div></section>';
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
        return (
            '<section class="inv-payment-info">' +
            "<h3>Bank Details <span>:</span></h3>" +
            '<div class="inv-info-list">' +
            (!hasPaymentInfo(paymentInfo) ? "&mdash;" : "") +
            (paymentInfo.details ? '<div class="inv-bank-details">' + formatMultiline(paymentInfo.details) + "</div>" : "") +
            buildMetaLine("Account Holder", paymentInfo.accountHolder, true) +
            buildMetaLine("Account Number", paymentInfo.accountNumber, true) +
            buildMetaLine("IFSC", paymentInfo.ifsc, true) +
            buildMetaLine("Bank", paymentInfo.bank, true) +
            buildMetaLine("Branch", paymentInfo.branch, true) +
            "</div></section>"
        );
    }

    function buildAuthorizedSignatureSection(businessName) {
        return '<div class="inv-signature-block">' +
            '<div class="inv-receiver-signature">Receiver&#39;s Signature <span>:</span></div>' +
            '<div class="inv-signature-inner">' +
            '<p class="inv-signature-company">For ' + escapeHtml(businessName) + '</p>' +
            '<p class="inv-signature-label">Authorised Signatory</p>' +
            '</div></div>';
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

    function getTermsCaption() {
        return escapeHtml("Terms & Conditions");
    }

    function buildTermsAndPaymentFooterSection(sale, businessName, paymentInfo) {
        var termsBodyHtml = buildTermsBodyHtml(sale);
        var qrUrl = sale.invoice_qr_image_url && String(sale.invoice_qr_image_url).trim()
            ? String(sale.invoice_qr_image_url).trim()
            : "";
        return '<footer class="inv-invoice-bottom">' +
            buildPaymentInfoSection(paymentInfo) +
            '<div class="inv-invoice-bottom-row">' +
            '<section class="inv-invoice-bottom-terms inv-terms">' +
            '<h3>' + getTermsCaption() + '</h3>' +
            '<div class="inv-terms-body">' + (termsBodyHtml || '&mdash;') + '</div></section>' +
            '<section class="inv-invoice-bottom-qr"><h3>Payment QR Code</h3>' +
            (qrUrl ? '<div class="inv-qr-wrap"><img class="inv-qr" crossorigin="anonymous" src="' + escapeHtml(qrUrl) + '" alt="Payment QR Code"/></div>' : '') +
            '</section>' + buildAuthorizedSignatureSection(businessName) +
            '</div></footer>';
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

    function getLineTaxPercent(line, discounts, taxes) {
        if (line.gst_rate != null && line.gst_rate !== "") {
            return Number(line.gst_rate);
        }

        discounts = discounts || getLineDiscountAmounts(line);
        var inclusiveBase = Number(discounts.afterDistributor || 0);
        if (inclusiveBase <= 0) return 0;

        var qty = Number(line.quantity || 0);
        if (qty <= 0) return 0;

        var taxPerUnit = roundMoney(Number(line.tax_amount || 0) / qty);
        var taxableBase = roundMoney(inclusiveBase - taxPerUnit);
        if (taxableBase <= 0) return 0;
        return roundMoney((taxPerUnit / taxableBase) * 100);
    }

    function formatPercent(value) {
        var num = Number(value || 0);
        if (isNaN(num) || num <= 0) return "—";
        var formatted = num.toFixed(2).replace(/\.?0+$/, "");
        return formatted + "%";
    }

    function formatTaxPercent(value) {
        var num = Number(value || 0);
        if (isNaN(num) || num <= 0) return "—";
        return num.toFixed(2) + "%";
    }

    function invoiceMoney(value) {
        return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function getLineTaxName(line, taxes) {
        if (line.sale_tax_name) return line.sale_tax_name;
        var taxIds = line.sale_tax_ids || [];
        var taxId = taxIds.find(function (id) { return /^\d+$/.test(String(id)); });
        var tax = (taxes || []).find(function (item) { return String(item.id) === String(taxId); });
        return tax && tax.key ? tax.key : "Tax";
    }

    function buildInvoicePrintRows(sale, taxes) {
        return (sale.items || []).map(function (line, index) {
            var qty = Number(line.quantity || 0);
            var total = Number(line.line_total || 0);
            var tax = Number(line.tax_amount || 0);
            var taxable = roundMoney(Math.max(0, total - tax));
            var listPrice = Number(line.list_price != null && line.list_price !== "" ? line.list_price : line.unit_price || 0);
            var rate = getLineTaxPercent(line, null, taxes);
            // Stored prices include GST. Use the saved tax allocation to keep the
            // printed taxable price and discount consistent with the saved total.
            var taxableRatio = total > 0 ? taxable / total : 1 / (1 + rate / 100);
            var gross = listPrice * qty;
            var discountPercent = gross > 0 ? Math.max(0, (gross - total) / gross * 100) : 0;
            return {
                serial: index + 1,
                product_name: line.product_name,
                hsn: line.product_hsn_code || line.hsn_code || "",
                quantity: qty,
                unit: line.product_unit || "pcs",
                list_price: listPrice * taxableRatio,
                discount_percent: discountPercent,
                price: qty > 0 ? taxable / qty : 0,
                amount: taxable,
                tax: roundMoney(tax),
                tax_name: getLineTaxName(line, taxes),
                tax_percent: rate
            };
        });
    }

    function buildInvoiceLinesColgroup() {
        return '<colgroup>' + ['sr', 'product', 'hsn', 'qty', 'unit', 'list-price', 'discount', 'price', 'amount'].map(function (name) {
            return '<col class="inv-col-' + name + '"/>';
        }).join('') + '</colgroup>';
    }

    function buildInvoiceItemRowsHtml(rows) {
        if (!rows.length) return '<tr class="inv-empty-row"><td colspan="9">No products on this invoice</td></tr>';
        return rows.map(function (row) {
            return '<tr>' +
                '<td class="num">' + row.serial + '.</td>' +
                '<td class="item-name">' + displayText(row.product_name) + '</td>' +
                '<td>' + displayText(row.hsn) + '</td>' +
                '<td class="num">' + invoiceMoney(row.quantity) + '</td>' +
                '<td>' + displayText(row.unit) + '</td>' +
                '<td class="num">' + invoiceMoney(row.list_price) + '</td>' +
                '<td class="num">' + invoiceMoney(row.discount_percent) + ' %</td>' +
                '<td class="num">' + invoiceMoney(row.price) + '</td>' +
                '<td class="num">' + invoiceMoney(row.amount) + '</td></tr>';
        }).join('');
    }

    function invoiceTaxKind(sale, business) {
        var seller = String(business.state_code || business.gst_number || '').match(/^(\d{2})/);
        var supply = String(sale.customer_place_of_supply || sale.place_of_supply || '');
        var buyer = supply.match(/(?:^|\()(\d{2})(?:\)|$)/);
        // An explicit supply location takes precedence over the customer's GSTIN.
        if (!buyer && !supply) buyer = String(sale.customer_gst_number || '').match(/^(\d{2})/);
        if (!seller || !buyer) return 'GST';
        return seller[1] === buyer[1] ? 'local' : 'IGST';
    }

    function buildInvoiceTaxSummary(rows, sale, business) {
        var kind = invoiceTaxKind(sale, business);
        var groups = {};
        rows.forEach(function (row) {
            var key = JSON.stringify([row.hsn, row.tax_percent]);
            if (!groups[key]) groups[key] = { hsn: row.hsn, rate: row.tax_percent, taxable: 0, tax: 0 };
            groups[key].taxable = roundMoney(groups[key].taxable + row.amount);
            groups[key].tax = roundMoney(groups[key].tax + row.tax);
        });
        var totals = { taxable: 0, tax: 0, first: 0, second: 0 };
        var additions = {};
        rows.forEach(function (row) {
            if (!row.tax) return;
            var key = JSON.stringify([row.tax_name, row.tax_percent]);
            if (!additions[key]) additions[key] = { name: row.tax_name, rate: row.tax_percent, amount: 0 };
            additions[key].amount = roundMoney(additions[key].amount + row.tax);
        });
        var body = Object.keys(groups).map(function (key) {
            var group = groups[key];
            var first = kind === 'local' ? roundMoney(group.tax / 2) : group.tax;
            var second = roundMoney(group.tax - first);
            totals.taxable = roundMoney(totals.taxable + group.taxable);
            totals.tax = roundMoney(totals.tax + group.tax);
            totals.first = roundMoney(totals.first + first);
            totals.second = roundMoney(totals.second + second);
            return '<tr><td>' + displayText(group.hsn) + '</td><td>' + escapeHtml(String(group.rate)) + '%</td>' +
                '<td class="num">' + invoiceMoney(group.taxable) + '</td><td class="num">' + invoiceMoney(first) + '</td>' +
                (kind === 'local' ? '<td class="num">' + invoiceMoney(second) + '</td>' : '') +
                '<td class="num">' + invoiceMoney(group.tax) + '</td></tr>';
        }).join('');
        var table = '<table class="inv-tax-summary"><thead><tr><th>HSN/SAC</th><th>Tax Rate</th><th class="num">Taxable Amt.</th>' +
            (kind === 'local' ? '<th class="num">CGST Amt.</th><th class="num">SGST Amt.</th>' : '<th class="num">' + kind + ' Amt.</th>') +
            '<th class="num">Total Tax</th></tr></thead><tbody>' + body + '</tbody><tfoot><tr><th colspan="2">Total</th>' +
            '<td class="num">' + invoiceMoney(totals.taxable) + '</td><td class="num">' + invoiceMoney(totals.first) + '</td>' +
            (kind === 'local' ? '<td class="num">' + invoiceMoney(totals.second) + '</td>' : '') +
            '<td class="num">' + invoiceMoney(totals.tax) + '</td></tr></tfoot></table>';
        return { html: table, additions: Object.keys(additions).map(function (key) { return additions[key]; }), totals: totals };
    }

    function buildInvoiceTotalsRows(rows, summary, roundTotals) {
        var html = '<tr class="inv-subtotal"><td colspan="8">Taxable Amount</td><td class="num">' + invoiceMoney(summary.totals.taxable) + '</td></tr>';
        summary.additions.forEach(function (tax) {
            html += '<tr><td colspan="8" class="inv-tax-addition">Add : ' + escapeHtml(tax.name) + ' @ ' + invoiceMoney(tax.rate) + ' %</td><td class="num">' + invoiceMoney(tax.amount) + '</td></tr>';
        });
        if (roundTotals.roundOff) html += '<tr><td colspan="8">Round Off</td><td class="num">' + invoiceMoney(roundTotals.roundOff) + '</td></tr>';
        var quantities = {};
        rows.forEach(function (row) { quantities[row.unit] = (quantities[row.unit] || 0) + row.quantity; });
        var quantityText = Object.keys(quantities).map(function (unit) { return invoiceMoney(quantities[unit]) + ' ' + escapeHtml(unit); }).join(' / ');
        return html + '<tr class="inv-grand-total"><td colspan="8">Grand Total <span class="inv-total-quantity">' + quantityText + '</span></td><td class="num">' + invoiceMoney(roundTotals.grandTotal) + '</td></tr>';
    }

    function saleInvoiceStyles() {
        return (
            "@page{size:A4 portrait;margin:10mm 12mm;}" +
            "*{box-sizing:border-box;}" +
            "html,body{margin:0;padding:0;background:#e8e8e8;color:#111;font-family:'Segoe UI',Calibri,'Helvetica Neue',Helvetica,sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;-webkit-print-color-adjust:exact;print-color-adjust:exact;}" +
            "body{padding:16px 0;}" +
            ".sale-invoice-page{width:210mm;min-height:277mm;max-width:210mm;margin:0 auto 16px;padding:10mm 12mm 12mm;background:#fff;border:1px solid #cfcfcf;page-break-after:always;position:relative;font-family:'Segoe UI',Calibri,'Helvetica Neue',Helvetica,sans-serif;font-size:11px;line-height:1.5;color:#111;letter-spacing:.01em;}" +
            ".sale-invoice-page:last-child{page-break-after:auto;margin-bottom:0;}" +
            ".sale-invoice-page[data-paginated]{height:297mm;min-height:297mm;border:0;outline:1px solid #cfcfcf;padding:10mm 12mm 12mm;}" +
            ".inv-page-content{height:275mm;display:flow-root;}" +
            ".inv-page-number{position:absolute;bottom:4mm;left:12mm;right:12mm;text-align:right;font-size:9px;color:#555;}" +
            ".inv-invoice-header{border:1px solid #333;margin:0;width:100%;box-sizing:border-box;}" +
            ".inv-business-heading{text-align:center;padding:8px 10px 12px;}" +
            ".inv-business-topline{display:flex;justify-content:space-between;gap:12px;text-align:left;font-size:11px;margin-bottom:4px;}" +
            ".inv-business-topline em{white-space:nowrap;font-weight:400;}" +
            ".inv-business-address{font-size:12px;line-height:1.35;}" +
            ".inv-business-contact{display:flex;justify-content:center;margin-top:4px;}" +
            ".inv-header-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));width:100%;box-sizing:border-box;border-top:1px solid #333;margin:0;}" +
            ".inv-header-panel{padding:8px 9px;border-right:1px solid #333;min-width:0;font-size:11px;line-height:1.35;display:flex;flex-direction:column;gap:3px;}" +
            ".inv-header-panel:last-child{border-right:none;}" +
            ".inv-header-panel .inv-detail-field--table{display:grid;grid-template-columns:100px 8px minmax(0,1fr);column-gap:3px;align-items:start;line-height:1.3;margin:0;}" +
            ".inv-header-panel .inv-detail-label{text-align:left;font-size:10px;font-weight:500;color:#111;overflow-wrap:anywhere;}" +
            ".inv-header-panel .inv-detail-colon{text-align:center;color:#111;}" +
            ".inv-header-panel .inv-detail-value{font-weight:500;color:#000;min-width:0;overflow-wrap:anywhere;}" +
            ".inv-header-panel-title{margin:0 0 3px;font-size:14px;font-weight:800;text-align:center;text-decoration:underline;color:#000;}" +
            ".inv-box-title{margin:0 0 4px;font-size:11px;font-weight:700;}" +
            ".inv-party-title{margin:0 0 3px;font-size:12px;font-weight:700;font-style:italic;}" +
            ".inv-header-name-row{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px;margin-bottom:2px;}" +
            ".inv-header-panel-heading{margin:0;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#333;flex-shrink:0;}" +
            ".inv-header-customer-name{margin:0 0 2px;font-size:12px;font-weight:600;text-transform:uppercase;line-height:1.3;color:#000;}" +
            ".inv-header-address-lines{margin:0 0 2px;font-size:11px;font-weight:400;line-height:1.35;color:#000;}" +
            ".inv-header-business-name{margin:0 0 2px;font-size:22px;font-weight:800;text-transform:uppercase;line-height:1.2;color:#000;}" +
            ".inv-detail-field--inline{line-height:1.5;font-size:10px;}" +
            ".inv-detail-field--inline .inv-detail-label{font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#333;}" +
            ".inv-detail-field--inline .inv-detail-value{font-weight:700;color:#000;min-width:0;overflow-wrap:anywhere;word-break:break-all;}" +
            ".inv-detail-field--inline.inv-detail-field--multiline .inv-detail-value{display:block;margin-top:2px;}" +
            ".inv-detail-field--split{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;}" +
            ".inv-contact-item{white-space:normal;max-width:100%;overflow-wrap:anywhere;word-break:break-all;}" +
            ".inv-contact-sep{color:#999;font-weight:400;padding:0 2px;}" +
            ".inv-meta-block{display:flex;flex-direction:column;align-items:flex-end;gap:6px;font-size:11px;}" +
            ".inv-meta-line{display:flex;justify-content:flex-end;align-items:baseline;gap:8px;max-width:100%;}" +
            ".inv-meta-label{font-weight:700;color:#333;white-space:nowrap;}" +
            ".inv-meta-value{font-weight:800;color:#000;text-align:right;}" +
            ".inv-lines-wrap{width:100%;margin-bottom:0;}" +
            ".inv-lines{width:100%;border-collapse:collapse;font-size:10px;table-layout:fixed;}" +
            ".inv-lines col.inv-col-sr{width:4%;}.inv-lines col.inv-col-product{width:29%;}.inv-lines col.inv-col-hsn{width:8%;}" +
            ".inv-lines col.inv-col-qty{width:7%;}.inv-lines col.inv-col-unit{width:6%;}.inv-lines col.inv-col-list-price{width:11%;}" +
            ".inv-lines col.inv-col-discount{width:10%;}.inv-lines col.inv-col-price{width:11%;}.inv-lines col.inv-col-amount{width:14%;}" +
            ".inv-lines th,.inv-lines td{border-left:1px solid #555;border-right:1px solid #555;padding:4px;vertical-align:top;overflow-wrap:anywhere;}" +
            ".inv-lines thead th{border-top:1px solid #555;border-bottom:1px solid #555;padding:8px 4px;text-align:left;font-size:10px;line-height:1.3;font-weight:700;}" +
            ".inv-lines .inv-lines-page-header td{border:0;padding:0;}" +
            ".inv-lines tbody td{padding-top:3px;padding-bottom:3px;font-weight:400;}" +
            ".inv-lines tbody tr:first-child td{padding-top:10px;}" +
            ".inv-lines tbody tr:last-child td{padding-bottom:18px;}" +
            ".inv-lines .num,.inv-tax-summary .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}" +
            ".inv-lines td.item-name{text-align:left;line-height:1.35;}" +
            ".inv-invoice-totals td:first-child{text-align:right;padding-right:18px;}" +
            ".inv-invoice-totals tr:first-child td{border-top:1px solid #555;padding-top:8px;font-weight:700;}" +
            ".inv-invoice-totals .inv-tax-addition{font-style:italic;}" +
            ".inv-invoice-totals .inv-grand-total td{border-top:1px solid #555;border-bottom:1px solid #555;padding-top:9px;padding-bottom:9px;font-size:12px;font-weight:700;}" +
            ".inv-total-quantity{display:inline-block;margin-left:18px;}" +
            ".inv-tax-summary{border-collapse:collapse;font-size:10px;width:auto;max-width:100%;margin:0 0 8px;}" +
            ".inv-tax-summary th,.inv-tax-summary td{padding:2px 7px;text-align:left;}" +
            ".inv-tax-summary thead{display:table-header-group;}" +
            ".inv-tax-summary thead th{border-bottom:1px solid #555;}" +
            ".inv-tax-summary tr{break-inside:avoid;page-break-inside:avoid;}" +
            ".inv-tax-summary tfoot th,.inv-tax-summary tfoot td{border-top:1px solid #555;border-bottom:1px solid #555;font-weight:700;}" +
            ".inv-tax-section,.inv-invoice-totals{break-inside:avoid;page-break-inside:avoid;}" +
            ".inv-tax-section{border-left:1px solid #555;border-right:1px solid #555;padding:10px 6px 8px;}" +
            ".inv-amount-words{margin:0;padding:10px 0 14px;font-size:13px;line-height:1.4;font-weight:700;}" +
            ".inv-invoice-bottom{margin:0;border:1px solid #555;break-inside:avoid;page-break-inside:avoid;}" +
            ".inv-payment-info{display:flex;align-items:flex-start;gap:10px;padding:8px 6px;min-width:0;border-bottom:1px solid #555;}" +
            ".inv-payment-info h3{flex:0 0 95px;margin:0;font-size:12px;line-height:1.4;font-weight:700;}" +
            ".inv-payment-info h3 span{float:right;}" +
            ".inv-info-list{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;font-size:12px;line-height:1.4;font-weight:400;}" +
            ".inv-info-list .inv-meta-line{justify-content:flex-start;}" +
            ".inv-info-list .inv-meta-value{text-align:left;overflow-wrap:anywhere;font-weight:400;}" +
            ".inv-bank-details{overflow-wrap:anywhere;}" +
            ".inv-invoice-bottom-row{display:grid;grid-template-columns:minmax(0,31.5fr) minmax(0,22.5fr) minmax(0,46fr);min-height:165px;}" +
            ".inv-invoice-bottom-terms{padding:7px 6px;border-right:1px solid #555;min-width:0;}" +
            ".inv-invoice-bottom-qr{padding:7px 6px;border-right:1px solid #555;min-width:0;text-align:center;}" +
            ".inv-terms h3,.inv-invoice-bottom-qr h3{margin:0 0 7px;font-size:10px;line-height:1.3;font-weight:700;color:#000;}" +
            ".inv-terms h3{text-decoration:underline;text-underline-offset:3px;}" +
            ".inv-terms{font-size:10px;line-height:1.5;color:#111;font-weight:400;overflow-wrap:anywhere;}" +
            ".inv-signature-block{min-width:0;display:flex;flex-direction:column;}" +
            ".inv-receiver-signature{min-height:44px;padding:7px 5px;border-bottom:1px solid #555;font-size:10px;font-weight:700;}" +
            ".inv-receiver-signature span{margin-left:12px;}" +
            ".inv-signature-inner{flex:1;min-height:120px;padding:12px 6px 6px;display:flex;flex-direction:column;justify-content:flex-end;text-align:right;gap:30px;}" +
            ".inv-signature-company{margin:0;font-size:12px;font-weight:700;line-height:1.3;overflow-wrap:anywhere;}" +
            ".inv-signature-label{margin:0;font-size:12px;font-weight:700;}" +
            ".inv-terms-body{margin:0;}" +
            ".inv-terms-body ol{margin:0;padding:0;list-style:none;counter-reset:invoice-terms;}" +
            ".inv-terms-body ul{margin:0;padding-left:1.35em;}" +
            ".inv-terms-body ol>li{display:flex;align-items:baseline;gap:2px;margin:4px 0;counter-increment:invoice-terms;}" +
            ".inv-terms-body ol>li::before{content:counter(invoice-terms) '.';flex:0 0 1em;text-align:right;}" +
            ".inv-terms-body ul>li{margin:4px 0;}" +
            ".inv-terms-body li>p{display:block;flex:1;margin:0;}" +
            ".inv-terms-body b,.inv-terms-body strong{font-weight:800;color:#000;}" +
            ".inv-terms p{margin:0;white-space:pre-wrap;}" +
            ".inv-qr-wrap{margin:0 auto;text-align:center;}" +
            ".inv-qr{width:128px;height:auto;max-width:100%;aspect-ratio:1;object-fit:contain;display:block;margin:0 auto;}" +
            ".inv-bottom-note{margin-top:16px;padding:0;text-align:center;font-size:13px;font-weight:800;color:#000;}" +
            ".inv-empty-row td{text-align:center;color:#666;font-style:italic;padding:14px;}" +
            "@media print{" +
            "@page{size:A4 portrait;margin:0;}" +
            "html,body{background:#fff;padding:0!important;margin:0!important;overflow:visible!important;}" +
            ".sale-invoice-page{border:none;margin:0;box-shadow:none;width:auto;min-height:auto;max-width:none;padding:10mm 12mm 12mm;}" +
            ".sale-invoice-page[data-paginated]{width:210mm;height:297mm;min-height:297mm;max-width:210mm;outline:0;zoom:1!important;break-after:page;break-inside:avoid;}" +
            ".sale-invoice-page[data-paginated]:last-child{break-after:auto;}" +
            ".sale-invoice-preview-scale{display:block!important;}" +
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

    function buildSaleInvoiceHtml(sale, taxes) {
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

        var printRows = buildInvoicePrintRows(sale, taxes);
        var itemRows = buildInvoiceItemRowsHtml(printRows);
        var taxSummary = buildInvoiceTaxSummary(printRows, sale, business);

        subtotal = roundMoney(subtotal);
        totalTax = roundMoney(totalTax);
        totalAmount = roundMoney(totalAmount);
        var saleTotal = roundMoney(Number(sale.total_amount || subtotal));
        if (!subtotal && saleTotal) subtotal = saleTotal;
        var roundTotals = computeInvoiceRoundTotals(totalAmount, totalTax, saleTotal);

        var invoiceNo = sale.reference_no || ("SALE-" + sale.id);
        var invoiceDate = formatDisplayDate(sale.purchase_date);
        var paymentFooterHtml = buildTermsAndPaymentFooterSection(sale, businessName, paymentInfo);

        var headerRowHtml = buildInvoiceHeaderRow(sale, business, businessName, invoiceNo, invoiceDate);

        return (
            '<section class="sale-invoice-page">' +
            '<div class="inv-lines-wrap"><table class="inv-lines">' +
            buildInvoiceLinesColgroup() +
            "<thead>" +
            '<tr class="inv-lines-page-header"><td colspan="9" class="inv-lines-page-header-cell">' +
            headerRowHtml +
            "</td></tr>" +
            "<tr>" +
            '<th class="num">S.N.</th><th>Description of Goods</th><th>HSN/SAC<br/>Code</th>' +
            '<th class="num">Qty.</th><th>Unit</th><th class="num">List Price</th><th class="num">Discount</th>' +
            '<th class="num">Price</th><th class="num">Amount (&#8377;)</th>' +
            '</tr></thead><tbody>' + itemRows + '</tbody>' +
            '<tbody class="inv-invoice-totals">' + buildInvoiceTotalsRows(printRows, taxSummary, roundTotals) + '</tbody></table></div>' +
            '<section class="inv-tax-section">' + taxSummary.html +
            '<div class="inv-amount-words">' + escapeHtml(amountInWordsInr(roundTotals.grandTotal)) + '</div></section>' +
            paymentFooterHtml +
            "</section>"
        );
    }

    function roundMoney(value) {
        return Math.round(Number(value || 0) * 100) / 100;
    }

    function saleInvoicePreviewStyles() {
        return (
            "html,body{overflow-x:hidden;overflow-y:auto;}" +
            "body{padding:12px 0;}" +
            ".sale-invoice-preview-scale{display:flex;flex-direction:column;align-items:center;gap:16px;width:100%;}" +
            ".sale-invoice-page{margin:0;transform-origin:top center;}"
        );
    }

    function buildSalesDocumentHtml(sales, options) {
        options = options || {};
        var taxes = options.taxes || [];
        var list = sales || [];
        var sections = list.map(function (sale) {
            return buildSaleInvoiceHtml(sale, taxes);
        }).join("");
        var previewStyles = options.preview ? saleInvoicePreviewStyles() : "";
        var bodyClass = options.preview ? ' class="inv-sale-invoice-preview"' : "";
        var wrapperStart = options.preview ? '<div class="sale-invoice-preview-scale">' : "";
        var wrapperEnd = options.preview ? "</div>" : "";

        return (
            "<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><title></title>" +
            "<style>" + saleInvoiceStyles() + previewStyles + "</style></head><body" + bodyClass + ">" +
            wrapperStart + sections + wrapperEnd +
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
        printFrame.style.cssText = "position:fixed;left:0;top:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none;";
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
        prepareSalesDocument(frameDoc).then(triggerPrint).catch(function (err) {
            if (window.InventoryToast) InventoryToast.error(err.message || "Unable to prepare print view.");
        });
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
        var chain = Promise.resolve(null);
        sales.forEach(function (sale) {
            chain = chain.then(function (pdf) { return appendSaleInvoicePdf(sale, [], pdf); });
        });
        return chain.then(function (pdf) {
            pdf.save(filename || "sales.pdf");
        }).catch(function (err) {
            if (window.InventoryToast) InventoryToast.error(err && err.message ? err.message : "Unable to generate PDF.");
        }).finally(function () {
            if (window.InventoryLoader) InventoryLoader.hide();
        });
    }

    return {
        buildTableHtml: buildTableHtml,
        printHtml: printHtml,
        downloadTablePdf: downloadTablePdf,
        buildSalesDocumentHtml: buildSalesDocumentHtml,
        prepareSalesDocument: prepareSalesDocument,
        downloadSalesPdf: downloadSalesPdf,
        generateSaleInvoicePdfBlob: generateSaleInvoicePdfBlob
    };
})();
