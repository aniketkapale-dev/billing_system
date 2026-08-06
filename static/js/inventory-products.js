var InventoryProducts = (function () {
    "use strict";

    var API = "/api/products";
    var PAGE_SIZE = (window.InventoryConstants && InventoryConstants.PAGE_SIZE) || 10;
    var searchTimer = null;
    var currentPage = 1;
    var currentSearch = "";

    function request(path, opts) {
        return InventoryApi.request(API, path, opts);
    }

    function parseNumber(inputId) {
        var raw = document.getElementById(inputId).value;
        if (raw === "" || raw === null || raw === undefined) {
            return 0;
        }
        var num = parseFloat(raw);
        return isNaN(num) ? 0 : num;
    }

    function parsePrice(inputId) {
        return parseNumber(inputId);
    }

    function formatQty(value) {
        var num = Number(value || 0);
        return Number.isInteger(num) ? String(num) : num.toFixed(2);
    }

    function renderRows(items) {
        var tbody = document.getElementById("products-table-body");
        if (!tbody) return;

        if (!items || !items.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="inv-mgmt-empty">No products found.</td></tr>';
            return;
        }

        tbody.innerHTML = items.map(function (item) {
            return (
                "<tr>" +
                "<td class=\"inv-col-name\">" + InventoryApi.escapeHtml(item.name) + "</td>" +
                "<td class=\"inv-col-sku\">" + InventoryApi.escapeHtml(item.sku || "—") + "</td>" +
                "<td class=\"inv-col-unit\">" + InventoryApi.escapeHtml(item.unit || "pcs") + "</td>" +
                "<td class=\"inv-col-qty\">" + formatQty(item.quantity) + "</td>" +
                "<td class=\"inv-col-buy\">" + InventoryApi.formatMoney(item.purchase_price) + "</td>" +
                "<td class=\"inv-col-sell\">" + InventoryApi.formatMoney(item.sale_price) + "</td>" +
                "<td class=\"inv-col-action\"><button type=\"button\" class=\"inv-mgmt-btn inv-mgmt-btn--danger inv-product-delete\" data-id=\"" + item.id + "\">Delete</button></td>" +
                "</tr>"
            );
        }).join("");
    }

    function buildQuery(search, page) {
        var params = new URLSearchParams();
        params.set("page", String(page || 1));
        params.set("page_size", String(PAGE_SIZE));
        if (search) params.set("search", search);
        return "?" + params.toString();
    }

    function loadProducts(search, page) {
        currentSearch = search || "";
        currentPage = page || 1;
        InventoryLoader.show();

        return request(buildQuery(currentSearch, currentPage))
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    renderRows(body.data.items || []);
                    InventoryPagination.render("products-pagination", body.data.pagination, function (p) {
                        loadProducts(currentSearch, p);
                    }, { label: "products" });
                } else {
                    renderRows([]);
                    InventoryPagination.render("products-pagination", null, function () {});
                    InventoryToast.error(body.message || "Failed to load products.");
                }
            })
            .catch(function () {
                renderRows([]);
                InventoryToast.error("Network error while loading products.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function resetForm() {
        document.getElementById("product-name").value = "";
        document.getElementById("product-sku").value = "";
        document.getElementById("product-unit").value = "pcs";
        document.getElementById("product-quantity").value = "";
        document.getElementById("product-purchase-price").value = "";
        document.getElementById("product-sale-price").value = "";
        document.getElementById("product-description").value = "";
    }

    function saveProduct() {
        var name = document.getElementById("product-name").value.trim();
        if (!name) {
            InventoryToast.error("Product name is required.");
            return;
        }

        var btn = document.getElementById("product-save-btn");
        InventoryLoader.button(btn, true, "Saving...");

        request("", {
            method: "POST",
            body: {
                name: name,
                sku: document.getElementById("product-sku").value.trim(),
                unit: document.getElementById("product-unit").value.trim() || "pcs",
                quantity: parseNumber("product-quantity"),
                purchase_price: parsePrice("product-purchase-price"),
                sale_price: parsePrice("product-sale-price"),
                description: document.getElementById("product-description").value.trim()
            }
        })
            .then(function (body) {
                if (body && body.isSuccess) {
                    InventoryToast.success("Product added successfully.");
                    resetForm();
                    InventoryModal.close("product-modal");
                    loadProducts(currentSearch, 1);
                } else {
                    InventoryToast.error(body.message || "Unable to add product.");
                }
            })
            .catch(function () {
                InventoryToast.error("Network error. Please try again.");
            })
            .finally(function () {
                InventoryLoader.button(btn, false);
            });
    }

    function deleteProduct(id, btn) {
        InventoryConfirm.delete({
            title: "Delete product?",
            message: "This product will be removed from your catalog."
        }).then(function (confirmed) {
            if (!confirmed) return;
            InventoryLoader.button(btn, true, "");
            request("/" + id + "/", { method: "DELETE" })
                .then(function (body) {
                    if (body && body.isSuccess) {
                        InventoryToast.success("Product deleted.");
                        loadProducts(currentSearch, currentPage);
                    } else {
                        InventoryToast.error(body.message || "Unable to delete product.");
                    }
                })
                .catch(function () {
                    InventoryToast.error("Network error. Please try again.");
                })
                .finally(function () {
                    InventoryLoader.button(btn, false);
                });
        });
    }

    function init() {
        var searchEl = document.getElementById("products-search");
        var saveBtn = document.getElementById("product-save-btn");
        var openBtn = document.getElementById("product-open-modal-btn");
        var tbody = document.getElementById("products-table-body");

        InventoryModal.wire("product-modal");

        function boot() {
            if (!InventoryBusiness.getActiveId()) return;
            loadProducts("", 1);
        }

        InventoryBusiness.whenReady(boot);
        window.addEventListener("inventory:business-changed", boot);

        if (openBtn) {
            openBtn.addEventListener("click", function () {
                if (!InventoryBusiness.getActiveId()) {
                    InventoryToast.error("Select or create a business first.");
                    return;
                }
                resetForm();
                InventoryModal.open("product-modal");
                document.getElementById("product-name").focus();
            });
        }

        if (searchEl) {
            searchEl.addEventListener("input", function () {
                window.clearTimeout(searchTimer);
                searchTimer = window.setTimeout(function () {
                    loadProducts(searchEl.value.trim(), 1);
                }, 300);
            });
        }

        if (saveBtn) saveBtn.addEventListener("click", saveProduct);

        if (tbody) {
            tbody.addEventListener("click", function (e) {
                var btn = e.target.closest(".inv-product-delete");
                if (!btn) return;
                deleteProduct(btn.getAttribute("data-id"), btn);
            });
        }
    }

    return { init: init, loadProducts: loadProducts };
})();
