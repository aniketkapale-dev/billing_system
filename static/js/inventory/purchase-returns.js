var InventoryPurchaseReturns = (function () {
    "use strict";

    var API = "/api/invoicing/purchase-returns";
    var PAGE_ID = "purchase-returns-pagination";
    var purchaseInvoiceId = new URLSearchParams(window.location.search).get("purchase_invoice_id");
    var invoice = null;
    var currentPage = 1;
    var searchTimer = null;

    function request(path, options) {
        return InventoryApi.request(API, path, options);
    }

    function formatQuantity(value) {
        var quantity = Number(value || 0);
        return Number.isFinite(quantity) ? quantity.toFixed(2) : "0.00";
    }

    function showError(body, fallback) {
        var message = body && body.message ? body.message : fallback;
        if (body && body.errors && body.errors.length) {
            message += " " + body.errors.join(" ");
        }
        InventoryToast.error(message);
    }

    function renderReturns(rows) {
        var body = document.getElementById("purchase-returns-table-body");
        if (!rows.length) {
            body.innerHTML = '<tr><td colspan="6" class="inv-mgmt-empty">No returned products yet.</td></tr>';
            return;
        }
        body.innerHTML = rows.map(function (row) {
            var sku = row.product_sku
                ? " <span class=\"inv-field-optional\">(" + InventoryApi.escapeHtml(row.product_sku) + ")</span>"
                : "";
            return (
                "<tr>" +
                "<td>" + InventoryApi.escapeHtml(InventoryApi.formatDateTime(row.returned_at, "-")) + "</td>" +
                "<td><a href=\"/dashboard/purchase-returns/?purchase_invoice_id=" +
                encodeURIComponent(row.invoice_id) + "\"><strong>" +
                InventoryApi.escapeHtml(row.invoice_number || "-") + "</strong></a></td>" +
                "<td>" + InventoryApi.escapeHtml(row.product_name || "Product") + sku + "</td>" +
                "<td>" + InventoryApi.escapeHtml(row.batch_number || "-") + "</td>" +
                "<td>" + formatQuantity(row.quantity) + "</td>" +
                "<td>" + InventoryApi.escapeHtml(row.reason || "-") + "</td>" +
                "</tr>"
            );
        }).join("");
    }

    function renderInvoiceItems() {
        var body = document.getElementById("purchase-return-items-body");
        document.getElementById("purchase-return-invoice-label").textContent =
            "Invoice " + (invoice.invoice_number || "-") + " - " +
            InventoryApi.formatDisplayDate(invoice.invoice_date, "-");

        if (!invoice.items || !invoice.items.length) {
            body.innerHTML = '<tr><td colspan="7" class="inv-mgmt-empty">This purchase has no products.</td></tr>';
            return;
        }

        body.innerHTML = invoice.items.map(function (item) {
            var returnable = Number(item.returnable_quantity || 0);
            var unavailable = returnable <= 0;
            var productName = InventoryApi.escapeHtml(item.product_name || "Product");
            var sku = item.product_sku
                ? " <span class=\"inv-field-optional\">(" + InventoryApi.escapeHtml(item.product_sku) + ")</span>"
                : "";
            var unit = item.product_unit ? " " + InventoryApi.escapeHtml(item.product_unit) : "";
            return (
                "<tr>" +
                "<td>" + productName + sku + "</td>" +
                "<td>" + InventoryApi.escapeHtml(item.batch_number || "-") + "</td>" +
                "<td>" + formatQuantity(item.quantity) + unit + "</td>" +
                "<td>" + formatQuantity(item.returned_quantity) + unit + "</td>" +
                "<td><strong>" + formatQuantity(item.returnable_quantity) + unit + "</strong></td>" +
                '<td><input class="inv-mgmt-input purchase-return-quantity" type="number" min="0.01" step="0.01" max="' +
                InventoryApi.escapeHtml(item.returnable_quantity) + '" aria-label="Return quantity for ' +
                productName + '"' + (unavailable ? " disabled" : "") + "/></td>" +
                "<td>" + (unavailable
                    ? '<span class="inv-field-optional">Not returnable</span>'
                    : '<button type="button" class="inv-mgmt-btn inv-mgmt-btn--primary" data-return-item="' +
                      item.id + '">Return</button>') +
                "</td></tr>"
            );
        }).join("");
    }

    function loadInvoice() {
        InventoryLoader.show();
        return request("/?purchase_invoice_id=" + encodeURIComponent(purchaseInvoiceId))
            .then(function (response) {
                if (!response || !response.isSuccess || !response.data) {
                    showError(response, "Failed to load purchase products.");
                    return;
                }
                invoice = response.data;
                renderInvoiceItems();
            })
            .catch(function () {
                InventoryToast.error("Network error while loading purchase products.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function loadReturns(page) {
        currentPage = page || 1;
        var params = new URLSearchParams({
            page: String(currentPage),
            page_size: String(InventoryPagination.getPageSize(PAGE_ID))
        });
        var search = document.getElementById("purchase-returns-search").value.trim();
        if (search) params.set("search", search);

        InventoryLoader.show();
        return request("/?" + params.toString())
            .then(function (response) {
                if (!response || !response.isSuccess || !response.data) {
                    renderReturns([]);
                    InventoryPagination.render(PAGE_ID, null, loadReturns);
                    showError(response, "Failed to load returned products.");
                    return;
                }
                renderReturns(response.data.items || []);
                InventoryPagination.render(PAGE_ID, response.data.pagination, loadReturns, {
                    onPageSizeChange: function () {
                        loadReturns(1);
                    }
                });
            })
            .catch(function () {
                renderReturns([]);
                InventoryToast.error("Network error while loading returned products.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function submitReturn(button) {
        if (!invoice) return;
        var row = button.closest("tr");
        var quantityInput = row.querySelector(".purchase-return-quantity");
        var quantity = Number(quantityInput.value);
        var itemId = button.getAttribute("data-return-item");
        var item = invoice.items.find(function (entry) {
            return String(entry.id) === String(itemId);
        });
        if (!item || !Number.isFinite(quantity) || quantity <= 0) {
            InventoryToast.error("Enter a return quantity greater than zero.");
            return;
        }
        if (quantity > Number(item.returnable_quantity)) {
            InventoryToast.error("Return quantity cannot exceed the available quantity.");
            return;
        }

        button.disabled = true;
        InventoryLoader.show();
        request("/", {
            method: "POST",
            body: {
                purchase_invoice_id: Number(purchaseInvoiceId),
                items: [{
                    purchase_invoice_item_id: Number(itemId),
                    quantity: quantity.toFixed(2)
                }],
                reason: document.getElementById("purchase-return-reason").value.trim()
            }
        })
            .then(function (response) {
                if (!response || !response.isSuccess) {
                    showError(response, "Failed to return this product.");
                    return;
                }
                InventoryToast.success(response.message || "Purchase return recorded and stock updated.");
                return loadInvoice();
            })
            .catch(function () {
                InventoryToast.error("Network error while recording this return.");
            })
            .finally(function () {
                button.disabled = false;
                InventoryLoader.hide();
            });
    }

    function init() {
        if (purchaseInvoiceId) {
            InventoryPagePanel.showPanel("purchase-returns-list-panel", "purchase-return-items-panel");
            document.getElementById("purchase-return-items-body").addEventListener("click", function (event) {
                var button = event.target.closest("[data-return-item]");
                if (button && !button.disabled) submitReturn(button);
            });
            loadInvoice();
            return;
        }

        document.getElementById("purchase-returns-list-panel").classList.remove("inv-hidden");
        document.getElementById("purchase-return-items-panel").classList.add("inv-hidden");
        document.getElementById("purchase-returns-search").addEventListener("input", function () {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(function () {
                loadReturns(1);
            }, 250);
        });
        InventoryApi.watch(["/api/invoicing/purchase-returns"], function () {
            return loadReturns(currentPage);
        });
        loadReturns(1);
    }

    return { init: init };
})();
