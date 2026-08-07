var InventoryPurchases = (function () {
    "use strict";

    var API = "/api/purchases";
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
                    products = (body.data.items || []).filter(function (product) {
                        return Number(product.quantity || 0) > 0;
                    });
                } else {
                    products = [];
                }
            });
    }

    function formatQty(value) {
        var num = Number(value || 0);
        return Number.isInteger(num) ? String(num) : num.toFixed(2);
    }

    function getProduct(productId) {
        return products.find(function (p) {
            return String(p.id) === String(productId);
        });
    }

    function productLabel(product) {
        var sku = product.sku ? " (" + product.sku + ")" : "";
        return InventoryApi.escapeHtml(product.name) + sku +
            " — Available: " + formatQty(product.quantity);
    }

    function productOptions(selectedId) {
        if (!products.length) {
            return '<option value="">No products in stock — add products with quantity first</option>';
        }
        var options = '<option value="">Select product</option>';
        options += products.map(function (product) {
            var selected = String(product.id) === String(selectedId) ? " selected" : "";
            return '<option value="' + product.id + '"' + selected + '>' +
                productLabel(product) + "</option>";
        }).join("");
        return options;
    }

    function defaultSalePrice(product) {
        if (!product || product.sale_price == null || product.sale_price === "") {
            return "";
        }
        return product.sale_price;
    }

    function applyProductToRow(row, product) {
        var qtyInput = row.querySelector(".inv-item-qty");
        var priceInput = row.querySelector(".inv-item-price");
        if (!product) {
            qtyInput.removeAttribute("max");
            row.dataset.maxQty = "";
            if (priceInput) priceInput.value = "";
            updateRowTotal(row);
            return;
        }
        var available = Number(product.quantity || 0);
        row.dataset.maxQty = String(available);
        qtyInput.max = available;
        qtyInput.min = available > 0 ? 0.01 : 0;
        if (Number(qtyInput.value || 0) > available) {
            qtyInput.value = available > 0 ? available : "";
        }
        if (priceInput) {
            priceInput.value = defaultSalePrice(product);
        }
        updateRowTotal(row);
    }

    function updateRowTotal(row) {
        var qty = Number(row.querySelector(".inv-item-qty").value || 0);
        var price = Number(row.querySelector(".inv-item-price").value || 0);
        row.querySelector(".inv-item-total").value = InventoryApi.formatMoney(qty * price);
    }

    function createItemRow(data) {
        data = data || {};
        var row = document.createElement("div");
        row.className = "inv-mgmt-item-row inv-mgmt-item-row--sale";
        row.innerHTML =
            '<div class="inv-mgmt-field"><label>Available Product</label><select class="inv-mgmt-select inv-item-product" required>' + productOptions(data.product_id) + "</select></div>" +
            '<div class="inv-mgmt-field"><label>Quantity</label><input class="inv-mgmt-input inv-item-qty" type="number" min="0.01" step="0.01" value="' + (data.quantity || 1) + '" required/></div>' +
            '<div class="inv-mgmt-field"><label>Sale Price</label><input class="inv-mgmt-input inv-item-price" type="number" min="0" step="0.01" placeholder="0.00" value="' + (data.unit_price != null && data.unit_price !== "" ? data.unit_price : "") + '" required/></div>' +
            '<div class="inv-mgmt-field"><label>Line Total</label><input class="inv-mgmt-input inv-item-total" type="text" readonly value="0.00"/></div>' +
            '<div class="inv-mgmt-field"><label>&nbsp;</label><button type="button" class="inv-mgmt-btn inv-mgmt-btn--danger inv-item-remove">Remove</button></div>';

        row.querySelector(".inv-item-qty").addEventListener("input", function () {
            var product = getProduct(row.querySelector(".inv-item-product").value);
            if (product) {
                var max = Number(product.quantity || 0);
                var val = Number(row.querySelector(".inv-item-qty").value || 0);
                if (val > max) {
                    row.querySelector(".inv-item-qty").value = max;
                    InventoryToast.warning("Quantity cannot exceed available stock (" + formatQty(max) + ").");
                }
            }
            updateRowTotal(row);
        });
        row.querySelector(".inv-item-price").addEventListener("input", function () {
            updateRowTotal(row);
        });
        row.querySelector(".inv-item-remove").addEventListener("click", function () {
            row.remove();
        });

        var select = row.querySelector(".inv-item-product");
        select.addEventListener("change", function () {
            applyProductToRow(row, getProduct(select.value));
        });

        if (data.product_id) {
            applyProductToRow(row, getProduct(data.product_id));
        } else {
            updateRowTotal(row);
        }
        return row;
    }

    function renderPurchaseRows(items) {
        var tbody = document.getElementById("purchases-table-body");
        if (!tbody) return;

        if (!items || !items.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="inv-mgmt-empty">No sales yet. Record a purchase first, then create a sale.</td></tr>';
            return;
        }

        tbody.innerHTML = items.map(function (purchase) {
            var productNames = (purchase.items || []).map(function (item) {
                var qty = formatQty(item.quantity);
                return InventoryApi.escapeHtml(item.product_name) + " × " + qty;
            }).join(", ");
            if (!productNames) productNames = "—";

            var profit = Number(purchase.total_profit || 0);
            var profitClass = profit >= 0 ? "inv-profit-positive" : "inv-profit-negative";

            return (
                "<tr>" +
                "<td>" + InventoryApi.escapeHtml(purchase.purchase_date) + "</td>" +
                "<td>" + InventoryApi.escapeHtml(purchase.customer_name || "—") + "</td>" +
                "<td class=\"inv-col-name\">" + productNames + "</td>" +
                "<td class=\"inv-mgmt-cell--num\">" + InventoryApi.formatMoney(purchase.total_amount) + "</td>" +
                "<td class=\"inv-mgmt-cell--num\">" + InventoryApi.formatMoney(purchase.total_cost) + "</td>" +
                "<td class=\"inv-mgmt-cell--num " + profitClass + "\"><strong>" + formatProfit(profit) + "</strong></td>" +
                "</tr>"
            );
        }).join("");
    }

    function formatProfit(value) {
        var num = Number(value || 0);
        var formatted = InventoryApi.formatMoney(num);
        if (num > 0) return "+" + formatted;
        return formatted;
    }

    function buildQuery(page) {
        var params = new URLSearchParams();
        params.set("page", String(page || 1));
        params.set("page_size", String(InventoryPagination.getPageSize("purchases-pagination")));
        return "?" + params.toString();
    }

    function loadPurchases(page) {
        currentPage = page || 1;
        InventoryLoader.show();

        return request(buildQuery(currentPage))
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    renderPurchaseRows(body.data.items || []);
                    InventoryPagination.render("purchases-pagination", body.data.pagination, function (p) {
                        loadPurchases(p);
                    }, {
                        onPageSizeChange: function () {
                            loadPurchases(1);
                        }
                    });
                } else {
                    renderPurchaseRows([]);
                    InventoryPagination.render("purchases-pagination", null, function () {});
                    InventoryToast.error(body.message || "Failed to load sales.");
                }
            })
            .catch(function () {
                renderPurchaseRows([]);
                InventoryToast.error("Network error while loading sales.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function collectItems() {
        var rows = document.querySelectorAll("#purchase-items-container .inv-mgmt-item-row");
        var items = [];
        var totalsByProduct = {};

        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            var productId = row.querySelector(".inv-item-product").value;
            var quantity = Number(row.querySelector(".inv-item-qty").value || 0);
            var unitPrice = Number(row.querySelector(".inv-item-price").value || 0);
            if (!productId) continue;

            var product = getProduct(productId);
            if (!product) {
                InventoryToast.error("Selected product is no longer available.");
                return null;
            }

            if (row.querySelector(".inv-item-price").value === "") {
                InventoryToast.error("Enter a sale price for " + product.name + ".");
                return null;
            }
            if (unitPrice < 0) {
                InventoryToast.error("Sale price cannot be negative.");
                return null;
            }

            var available = Number(product.quantity || 0);
            totalsByProduct[productId] = (totalsByProduct[productId] || 0) + quantity;
            if (totalsByProduct[productId] > available) {
                InventoryToast.error(
                    product.name + ": total quantity (" + formatQty(totalsByProduct[productId]) +
                    ") exceeds available stock (" + formatQty(available) + ")."
                );
                return null;
            }
            if (quantity <= 0) {
                InventoryToast.error("Quantity must be greater than zero.");
                return null;
            }

            items.push({
                product_id: Number(productId),
                quantity: quantity,
                unit_price: unitPrice
            });
        }

        return items;
    }

    function resetForm() {
        document.getElementById("purchase-customer").value = "";
        document.getElementById("purchase-date").value = new Date().toISOString().slice(0, 10);
        document.getElementById("purchase-items-container").innerHTML = "";
        addItemRow();
    }

    function savePurchase() {
        var customer = document.getElementById("purchase-customer").value.trim();
        var items = collectItems();

        if (!customer) {
            InventoryToast.error("Customer name is required.");
            return;
        }
        if (!items || !items.length) {
            if (items !== null) {
                InventoryToast.error("Add at least one product the customer is purchasing.");
            }
            return;
        }

        var rowCount = document.querySelectorAll("#purchase-items-container .inv-mgmt-item-row").length;
        if (items.length !== rowCount) {
            InventoryToast.error("Select an available product for each row.");
            return;
        }

        var btn = document.getElementById("purchase-save-btn");
        InventoryLoader.button(btn, true, "Saving...");

        request("", {
            method: "POST",
            body: {
                customer_name: customer,
                purchase_date: document.getElementById("purchase-date").value,
                items: items
            }
        })
            .then(function (body) {
                if (body && body.isSuccess) {
                    InventoryToast.success(body.message || "Sale saved. FIFO applied and profit calculated.");
                    resetForm();
                    InventoryModal.close("purchase-modal");
                    loadPurchases(1);
                } else {
                    var err = body.message || "Unable to create sale.";
                    if (body.errors && body.errors.length) err = body.errors.join(" • ");
                    InventoryToast.error(err);
                }
            })
            .catch(function () {
                InventoryToast.error("Network error. Please try again.");
            })
            .finally(function () {
                InventoryLoader.button(btn, false);
            });
    }

    function addItemRow(data) {
        var container = document.getElementById("purchase-items-container");
        container.appendChild(createItemRow(data));
    }

    function init() {
        InventoryModal.wire("purchase-modal");

        function boot() {
            if (!InventoryBusiness.getActiveId()) return;
            loadProducts().then(function () {
                loadPurchases(1);
            });
        }

        InventoryBusiness.whenReady(boot);
        window.addEventListener("inventory:business-changed", boot);

        document.getElementById("purchase-open-modal-btn").addEventListener("click", function () {
            if (!InventoryBusiness.getActiveId()) {
                InventoryToast.error("Select or create a business first.");
                return;
            }
            loadProducts().then(function () {
                if (!products.length) {
                    InventoryToast.warning("No products in stock. Add a purchase invoice first.");
                }
                resetForm();
                InventoryModal.open("purchase-modal");
                document.getElementById("purchase-customer").focus();
            });
        });

        document.getElementById("purchase-add-item-btn").addEventListener("click", function () {
            if (!products.length) {
                InventoryToast.warning("No products in stock.");
                return;
            }
            addItemRow();
        });
        document.getElementById("purchase-save-btn").addEventListener("click", savePurchase);
    }

    return { init: init };
})();
