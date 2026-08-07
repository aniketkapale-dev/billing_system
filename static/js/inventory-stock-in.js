var InventoryStockIn = (function () {
    "use strict";

    var API = "/api/invoicing/purchase-invoices";
    var PRODUCTS_API = "/api/products";
    var PAGE_SIZE = (window.InventoryConstants && InventoryConstants.PAGE_SIZE) || 10;
    var currentPage = 1;
    var products = [];

    function request(path, opts) {
        return InventoryApi.request(API, path, opts);
    }

    function loadProducts() {
        return InventoryApi.request(PRODUCTS_API, "?page_size=100")
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    products = body.data.items || [];
                } else {
                    products = [];
                }
            });
    }

    function productOptions(selectedId) {
        if (!products.length) {
            return '<option value="">No products — add products first</option>';
        }
        var options = '<option value="">Select product</option>';
        options += products.map(function (product) {
            var sku = product.sku ? " (" + product.sku + ")" : "";
            var selected = String(product.id) === String(selectedId) ? " selected" : "";
            return '<option value="' + product.id + '"' + selected + '>' +
                InventoryApi.escapeHtml(product.name) + sku + "</option>";
        }).join("");
        return options;
    }

    function getProduct(productId) {
        return products.find(function (p) {
            return String(p.id) === String(productId);
        });
    }

    function applyProductToRow(row, product) {
        if (!product) return;
        row.querySelector(".inv-item-buy").value = "";
    }

    function createItemRow(data) {
        data = data || {};
        var row = document.createElement("div");
        row.className = "inv-mgmt-item-row inv-mgmt-item-row--stockin";
        row.innerHTML =
            '<div class="inv-mgmt-field"><label>Product</label><select class="inv-mgmt-select inv-item-product" required>' + productOptions(data.product_id) + "</select></div>" +
            '<div class="inv-mgmt-field"><label>Quantity</label><input class="inv-mgmt-input inv-item-qty" type="number" min="0.01" step="0.01" value="' + (data.quantity || 1) + '" required/></div>' +
            '<div class="inv-mgmt-field"><label>Buy Price</label><input class="inv-mgmt-input inv-item-buy" type="number" min="0" step="0.01" value="' + (data.purchase_price || 0) + '" required/></div>' +
            '<div class="inv-mgmt-field"><label>Batch No.</label><input class="inv-mgmt-input inv-item-batch" type="text" placeholder="B001" value="' + InventoryApi.escapeHtml(data.batch_number || "") + '"/></div>' +
            '<div class="inv-mgmt-field"><label>Expiry</label><input class="inv-mgmt-input inv-item-expiry" type="date" value="' + (data.expiry_date || "") + '"/></div>' +
            '<div class="inv-mgmt-field"><label>&nbsp;</label><button type="button" class="inv-mgmt-btn inv-mgmt-btn--danger inv-item-remove">Remove</button></div>';

        row.querySelector(".inv-item-remove").addEventListener("click", function () {
            row.remove();
        });
        row.querySelector(".inv-item-product").addEventListener("change", function () {
            applyProductToRow(row, getProduct(this.value));
        });

        if (data.product_id) {
            applyProductToRow(row, getProduct(data.product_id));
        }
        return row;
    }

    function renderRows(items) {
        var tbody = document.getElementById("stockin-table-body");
        if (!tbody) return;

        if (!items || !items.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="inv-mgmt-empty">No purchase invoices yet.</td></tr>';
            return;
        }

        tbody.innerHTML = items.map(function (item) {
            var itemCount = (item.items || []).length;
            var names = (item.items || []).slice(0, 3).map(function (line) {
                return InventoryApi.escapeHtml(line.product_name);
            }).join(", ");
            if (itemCount > 3) names += " +" + (itemCount - 3) + " more";
            return (
                "<tr>" +
                "<td>" + InventoryApi.escapeHtml(item.invoice_date) + "</td>" +
                "<td><strong>" + InventoryApi.escapeHtml(item.invoice_number) + "</strong></td>" +
                "<td>" + (names || "—") + "</td>" +
                "<td class=\"inv-mgmt-cell--num\">" + InventoryApi.formatMoney(item.subtotal) + "</td>" +
                "<td class=\"inv-mgmt-cell--num\"><strong>" + InventoryApi.formatMoney(item.grand_total) + "</strong></td>" +
                "</tr>"
            );
        }).join("");
    }

    function loadInvoices(page) {
        currentPage = page || 1;
        InventoryLoader.show();
        var params = new URLSearchParams();
        params.set("page", String(currentPage));
        params.set("page_size", String(PAGE_SIZE));

        return request("?" + params.toString())
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    renderRows(body.data.items || []);
                    InventoryPagination.render("stockin-pagination", body.data.pagination, loadInvoices, { label: "invoices" });
                } else {
                    renderRows([]);
                    InventoryPagination.render("stockin-pagination", null, function () {});
                    InventoryToast.error(body.message || "Failed to load invoices.");
                }
            })
            .catch(function () {
                renderRows([]);
                InventoryToast.error("Network error while loading invoices.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function openModal() {
        document.getElementById("stockin-invoice-no").value = "";
        document.getElementById("stockin-remarks").value = "";
        var dateEl = document.getElementById("stockin-invoice-date");
        if (dateEl) {
            dateEl.value = new Date().toISOString().slice(0, 10);
        }
        var container = document.getElementById("stockin-items-container");
        container.innerHTML = "";
        container.appendChild(createItemRow());
        InventoryModal.open("stockin-modal");
    }

    function collectItems() {
        var rows = document.querySelectorAll("#stockin-items-container .inv-mgmt-item-row");
        var items = [];
        rows.forEach(function (row) {
            var productId = row.querySelector(".inv-item-product").value;
            if (!productId) return;
            var expiry = row.querySelector(".inv-item-expiry").value;
            items.push({
                product_id: Number(productId),
                quantity: row.querySelector(".inv-item-qty").value,
                purchase_price: row.querySelector(".inv-item-buy").value,
                batch_number: row.querySelector(".inv-item-batch").value.trim(),
                expiry_date: expiry || null,
            });
        });
        return items;
    }

    function saveInvoice() {
        var invoiceNumber = document.getElementById("stockin-invoice-no").value.trim();
        if (!invoiceNumber) {
            InventoryToast.error("Invoice number is required.");
            return;
        }

        var items = collectItems();
        if (!items.length) {
            InventoryToast.error("Add at least one product row.");
            return;
        }

        var payload = {
            invoice_number: invoiceNumber,
            invoice_date: document.getElementById("stockin-invoice-date").value || undefined,
            remarks: document.getElementById("stockin-remarks").value.trim(),
            items: items,
        };

        InventoryLoader.show();
        request("/", { method: "POST", body: payload })
            .then(function (body) {
                if (body && body.isSuccess) {
                    InventoryToast.success(body.message || "Purchase invoice saved.");
                    InventoryModal.close("stockin-modal");
                    loadInvoices(1);
                } else {
                    var err = body.message || "Failed to save invoice.";
                    if (body.errors && body.errors.length) err = body.errors.join(" • ");
                    InventoryToast.error(err);
                }
            })
            .catch(function () {
                InventoryToast.error("Network error while saving invoice.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function init() {
        InventoryModal.wire("stockin-modal");

        var openBtn = document.getElementById("stockin-open-modal-btn");
        var addItemBtn = document.getElementById("stockin-add-item-btn");
        var saveBtn = document.getElementById("stockin-save-btn");

        function boot() {
            if (!InventoryBusiness.getActiveId()) return;
            loadProducts().then(function () {
                loadInvoices(1);
            });
        }

        InventoryBusiness.whenReady(boot);
        window.addEventListener("inventory:business-changed", boot);

        if (openBtn) openBtn.addEventListener("click", openModal);
        if (addItemBtn) {
            addItemBtn.addEventListener("click", function () {
                document.getElementById("stockin-items-container").appendChild(createItemRow());
            });
        }
        if (saveBtn) saveBtn.addEventListener("click", saveInvoice);
    }

    return { init: init };
})();
