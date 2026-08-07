var InventoryProducts = (function () {
    "use strict";

    var API = "/api/products";
    var CATALOG_API = "/api/catalog";
    var PAGE_SIZE = (window.InventoryConstants && InventoryConstants.PAGE_SIZE) || 10;
    var searchTimer = null;
    var currentPage = 1;
    var currentSearch = "";
    var editingId = null;
    var units = [];
    var categories = [];
    var brands = [];

    function request(path, opts) {
        return InventoryApi.request(API, path, opts);
    }

    function catalogRequest(resource, path, opts) {
        path = path == null ? "" : String(path);
        var segment = String(resource).replace(/^\/+|\/+$/g, "");
        var urlPath;
        if (path.charAt(0) === "?") {
            urlPath = "/" + segment + "/" + path;
        } else if (!path) {
            urlPath = "/" + segment + "/";
        } else {
            urlPath = "/" + segment + "/" + path.replace(/^\//, "");
        }
        return InventoryApi.request(CATALOG_API, urlPath, opts);
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

    function parseRequiredPrice(inputId, label) {
        var el = document.getElementById(inputId);
        var raw = el ? el.value.trim() : "";
        if (raw === "") {
            InventoryToast.error(label + " is required.");
            return null;
        }
        var num = parseFloat(raw);
        if (isNaN(num) || num < 0) {
            InventoryToast.error(label + " must be 0 or greater.");
            return null;
        }
        return num;
    }

    function formatQty(value) {
        var num = Number(value || 0);
        return Number.isInteger(num) ? String(num) : num.toFixed(2);
    }

    function isEmpty(value) {
        return value === null || value === undefined || String(value).trim() === "";
    }

    function cellText(value) {
        if (isEmpty(value)) return "—";
        return InventoryApi.escapeHtml(String(value));
    }

    function cellQty(value) {
        if (isEmpty(value)) return "—";
        return formatQty(value);
    }

    function cellMoney(value) {
        if (isEmpty(value)) return "—";
        return InventoryApi.formatMoney(value);
    }

    function displayValue(value) {
        if (isEmpty(value)) return "—";
        return InventoryApi.escapeHtml(String(value));
    }

    function actionButtons(item) {
        return (
            '<div class="inv-row-actions">' +
            '<button type="button" class="inv-row-action-btn inv-row-action-btn--view inv-product-view" data-id="' + item.id + '" title="View" aria-label="View product">' +
            '<span class="material-symbols-outlined">visibility</span></button>' +
            '<button type="button" class="inv-row-action-btn inv-row-action-btn--edit inv-product-edit" data-id="' + item.id + '" title="Edit" aria-label="Edit product">' +
            '<span class="material-symbols-outlined">edit</span></button>' +
            '<button type="button" class="inv-row-action-btn inv-row-action-btn--delete inv-product-delete" data-id="' + item.id + '" title="Delete" aria-label="Delete product">' +
            '<span class="material-symbols-outlined">delete</span></button>' +
            "</div>"
        );
    }

    function fillSelect(selectId, items, placeholder, labelFn) {
        var select = document.getElementById(selectId);
        if (!select) return;
        select.innerHTML = '<option value="">' + placeholder + "</option>";
        items.forEach(function (item) {
            var option = document.createElement("option");
            option.value = item.id;
            option.textContent = labelFn(item);
            select.appendChild(option);
        });
    }

    function renderCategorySelect(selectedId) {
        var select = document.getElementById("product-category");
        if (!select) return;
        var current = selectedId !== undefined && selectedId !== null
            ? String(selectedId)
            : select.value;
        fillSelect("product-category", categories, "Select category (optional)", function (item) {
            return item.name;
        });
        if (current) select.value = current;
    }

    function toggleCategoryPanel(show) {
        var panel = document.getElementById("product-category-new-panel");
        if (!panel) return;
        if (show) {
            panel.classList.remove("inv-hidden");
            document.getElementById("product-category-new-name").focus();
        } else {
            panel.classList.add("inv-hidden");
            document.getElementById("product-category-new-name").value = "";
            document.getElementById("product-category-new-desc").value = "";
        }
    }

    function loadCategories(selectedId) {
        return catalogRequest("categories", "?page_size=100").then(function (body) {
            categories = body && body.isSuccess ? (body.data.items || []) : [];
            renderCategorySelect(selectedId);
            return categories;
        });
    }

    function saveNewCategory() {
        var name = document.getElementById("product-category-new-name").value.trim();
        if (!name) {
            InventoryToast.error("Category name is required.");
            return;
        }

        var btn = document.getElementById("product-category-save-btn");
        InventoryLoader.button(btn, true, "Saving...");

        catalogRequest("categories", "", {
            method: "POST",
            body: {
                name: name,
                description: document.getElementById("product-category-new-desc").value.trim()
            }
        })
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    InventoryToast.success("Category added.");
                    toggleCategoryPanel(false);
                    return loadCategories(body.data.id);
                }
                var err = body.message || "Unable to add category.";
                if (body.errors && body.errors.length) err = body.errors.join(" • ");
                InventoryToast.error(err);
            })
            .catch(function () {
                InventoryToast.error("Network error. Please try again.");
            })
            .finally(function () {
                InventoryLoader.button(btn, false);
            });
    }

    function renderBrandSelect(selectedId) {
        var select = document.getElementById("product-brand");
        if (!select) return;
        var current = selectedId !== undefined && selectedId !== null
            ? String(selectedId)
            : select.value;
        fillSelect("product-brand", brands, "Select brand (optional)", function (item) {
            return item.name;
        });
        if (current) select.value = current;
    }

    function toggleBrandPanel(show) {
        var panel = document.getElementById("product-brand-new-panel");
        if (!panel) return;
        if (show) {
            panel.classList.remove("inv-hidden");
            document.getElementById("product-brand-new-name").focus();
        } else {
            panel.classList.add("inv-hidden");
            document.getElementById("product-brand-new-name").value = "";
        }
    }

    function loadBrands(selectedId) {
        return catalogRequest("brands", "?page_size=100").then(function (body) {
            brands = body && body.isSuccess ? (body.data.items || []) : [];
            renderBrandSelect(selectedId);
            return brands;
        });
    }

    function saveNewBrand() {
        var name = document.getElementById("product-brand-new-name").value.trim();
        if (!name) {
            InventoryToast.error("Brand name is required.");
            return;
        }

        var btn = document.getElementById("product-brand-save-btn");
        InventoryLoader.button(btn, true, "Saving...");

        catalogRequest("brands", "", {
            method: "POST",
            body: { name: name }
        })
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    InventoryToast.success("Brand added.");
                    toggleBrandPanel(false);
                    return loadBrands(body.data.id);
                }
                var err = body.message || "Unable to add brand.";
                if (body.errors && body.errors.length) err = body.errors.join(" • ");
                InventoryToast.error(err);
            })
            .catch(function () {
                InventoryToast.error("Network error. Please try again.");
            })
            .finally(function () {
                InventoryLoader.button(btn, false);
            });
    }

    function renderUnitSelect(selectedId) {
        var select = document.getElementById("product-unit");
        if (!select) return;
        var current = selectedId !== undefined && selectedId !== null
            ? String(selectedId)
            : select.value;
        fillSelect("product-unit", units, "Select unit", function (item) {
            return item.name + " (" + item.short_name + ")";
        });
        if (current) select.value = current;
    }

    function toggleUnitPanel(show) {
        var panel = document.getElementById("product-unit-new-panel");
        if (!panel) return;
        if (show) {
            panel.classList.remove("inv-hidden");
            document.getElementById("product-unit-new-name").focus();
        } else {
            panel.classList.add("inv-hidden");
            document.getElementById("product-unit-new-name").value = "";
            document.getElementById("product-unit-new-short").value = "";
        }
    }

    function loadUnits(selectedId) {
        return catalogRequest("units", "?page_size=100").then(function (body) {
            units = body && body.isSuccess ? (body.data.items || []) : [];
            renderUnitSelect(selectedId);
            return units;
        });
    }

    function saveNewUnit() {
        var name = document.getElementById("product-unit-new-name").value.trim();
        var shortName = document.getElementById("product-unit-new-short").value.trim();
        if (!name) {
            InventoryToast.error("Unit name is required.");
            return;
        }
        if (!shortName) {
            InventoryToast.error("Unit short name is required.");
            return;
        }

        var btn = document.getElementById("product-unit-save-btn");
        InventoryLoader.button(btn, true, "Saving...");

        catalogRequest("units", "", {
            method: "POST",
            body: {
                name: name,
                short_name: shortName
            }
        })
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    InventoryToast.success("Unit added.");
                    toggleUnitPanel(false);
                    return loadUnits(body.data.id);
                }
                var err = body.message || "Unable to add unit.";
                if (body.errors && body.errors.length) err = body.errors.join(" • ");
                InventoryToast.error(err);
            })
            .catch(function () {
                InventoryToast.error("Network error. Please try again.");
            })
            .finally(function () {
                InventoryLoader.button(btn, false);
            });
    }

    function loadCatalogOptions() {
        if (!InventoryBusiness.getActiveId()) {
            return Promise.resolve();
        }

        return Promise.all([
            loadUnits(),
            loadCategories(),
            loadBrands(),
        ]);
    }

    function renderRows(items) {
        var tbody = document.getElementById("products-table-body");
        if (!tbody) return;

        if (!items || !items.length) {
            tbody.innerHTML = '<tr><td colspan="10" class="inv-mgmt-empty">No products found.</td></tr>';
            return;
        }

        tbody.innerHTML = items.map(function (item) {
            return (
                "<tr>" +
                "<td class=\"inv-col-name\">" + cellText(item.name) + "</td>" +
                "<td class=\"inv-col-sku\">" + cellText(item.sku) + "</td>" +
                "<td class=\"inv-col-barcode\">" + cellText(item.barcode) + "</td>" +
                "<td class=\"inv-col-category\">" + cellText(item.category_name) + "</td>" +
                "<td class=\"inv-col-brand\">" + cellText(item.brand_name) + "</td>" +
                "<td class=\"inv-col-buy\">" + cellMoney(item.purchase_price) + "</td>" +
                "<td class=\"inv-col-sell\">" + cellMoney(item.sale_price) + "</td>" +
                "<td class=\"inv-col-qty\">" + cellQty(item.quantity) + "</td>" +
                "<td class=\"inv-col-unit\">" + cellText(item.unit_short_name || item.unit_name) + "</td>" +
                "<td class=\"inv-col-action\">" + actionButtons(item) + "</td>" +
                "</tr>"
            );
        }).join("");
    }

    function buildQuery(search, page) {
        var params = new URLSearchParams();
        params.set("page", String(page || 1));
        params.set("page_size", String(InventoryPagination.getPageSize("products-pagination")));
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
                    }, {
                        onPageSizeChange: function () {
                            loadProducts(currentSearch, 1);
                        }
                    });
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

    function setFormMode(mode) {
        var titleEl = document.getElementById("product-modal-title");
        var saveBtn = document.getElementById("product-save-btn");

        if (mode === "edit") {
            titleEl.textContent = "Edit Product";
            saveBtn.textContent = "Update Product";
        } else {
            titleEl.textContent = "Add Product";
            saveBtn.textContent = "Save Product";
        }
    }

    function resetForm() {
        editingId = null;
        setFormMode("add");
        document.getElementById("product-name").value = "";
        document.getElementById("product-sku").value = "";
        document.getElementById("product-barcode").value = "";
        document.getElementById("product-category").value = "";
        document.getElementById("product-brand").value = "";
        document.getElementById("product-unit").value = "";
        document.getElementById("product-quantity").value = "";
        document.getElementById("product-purchase-price").value = "";
        document.getElementById("product-sale-price").value = "";
        document.getElementById("product-description").value = "";
        toggleCategoryPanel(false);
        toggleBrandPanel(false);
        toggleUnitPanel(false);
    }

    function populateForm(product) {
        document.getElementById("product-name").value = product.name || "";
        document.getElementById("product-sku").value = product.sku || "";
        document.getElementById("product-barcode").value = product.barcode || "";
        document.getElementById("product-category").value = product.category || "";
        document.getElementById("product-brand").value = product.brand || "";
        document.getElementById("product-unit").value = product.unit || "";
        document.getElementById("product-quantity").value = product.quantity != null ? product.quantity : "";
        document.getElementById("product-purchase-price").value = product.purchase_price != null ? product.purchase_price : "";
        document.getElementById("product-sale-price").value = product.sale_price != null ? product.sale_price : "";
        document.getElementById("product-description").value = product.description || "";
    }

    function renderViewDetails(product) {
        var container = document.getElementById("product-view-body");
        if (!container) return;

        var rows = [
            { label: "Product Name", value: displayValue(product.name) },
            { label: "Product Code", value: displayValue(product.sku) },
            { label: "Barcode", value: displayValue(product.barcode) },
            { label: "Category", value: displayValue(product.category_name) },
            { label: "Brand", value: displayValue(product.brand_name) },
            { label: "Buy Price", value: cellMoney(product.purchase_price) },
            { label: "Sell Price", value: cellMoney(product.sale_price) },
            { label: "Unit", value: displayValue(product.unit_short_name || product.unit_name) },
            { label: "Quantity", value: displayValue(formatQty(product.quantity)) },
            { label: "Description", value: displayValue(product.description), full: true }
        ];

        container.innerHTML = rows.map(function (row) {
            var cls = row.full ? " inv-product-view-item--full" : "";
            return (
                '<div class="inv-product-view-item' + cls + '">' +
                '<span class="inv-product-view-label">' + row.label + "</span>" +
                '<div class="inv-product-view-value">' + row.value + "</div>" +
                "</div>"
            );
        }).join("");
    }

    function fetchProduct(id) {
        return request("/" + id + "/").then(function (body) {
            if (body && body.isSuccess && body.data) {
                return body.data;
            }
            InventoryToast.error(body.message || "Failed to load product.");
            return null;
        });
    }

    function openAddModal() {
        if (!InventoryBusiness.getActiveId()) {
            InventoryToast.error("Select or create a business first.");
            return;
        }
            loadCatalogOptions().then(function () {
                resetForm();
                InventoryModal.open("product-modal");
                document.getElementById("product-name").focus();
            });
    }

    function openViewModal(id) {
        InventoryLoader.show();
        fetchProduct(id)
            .then(function (product) {
                if (!product) return;
                document.getElementById("product-view-modal-title").textContent = product.name || "Product Details";
                renderViewDetails(product);
                InventoryModal.open("product-view-modal");
            })
            .catch(function () {
                InventoryToast.error("Network error while loading product.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function openEditModal(id) {
        InventoryLoader.show();
        loadCatalogOptions()
            .then(function () {
                return fetchProduct(id);
            })
            .then(function (product) {
                if (!product) return;
                editingId = product.id;
                setFormMode("edit");
                populateForm(product);
                InventoryModal.open("product-modal");
                document.getElementById("product-name").focus();
            })
            .catch(function () {
                InventoryToast.error("Network error while loading product.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function saveProduct() {
        var name = document.getElementById("product-name").value.trim();
        var unitId = document.getElementById("product-unit").value;

        if (!name) {
            InventoryToast.error("Product name is required.");
            return;
        }
        if (!unitId) {
            InventoryToast.error("Unit is required.");
            return;
        }

        var purchasePrice = parseRequiredPrice("product-purchase-price", "Buy price");
        if (purchasePrice === null) return;
        var salePrice = parseRequiredPrice("product-sale-price", "Sell price");
        if (salePrice === null) return;

        var categoryId = document.getElementById("product-category").value;
        var brandId = document.getElementById("product-brand").value;
        var payload = {
            name: name,
            sku: document.getElementById("product-sku").value.trim(),
            barcode: document.getElementById("product-barcode").value.trim(),
            unit_id: Number(unitId),
            description: document.getElementById("product-description").value.trim(),
            purchase_price: purchasePrice,
            sale_price: salePrice
        };

        if (categoryId) payload.category_id = Number(categoryId);
        if (brandId) payload.brand_id = Number(brandId);
        payload.quantity = parseNumber("product-quantity");

        var btn = document.getElementById("product-save-btn");
        InventoryLoader.button(btn, true, editingId ? "Updating..." : "Saving...");

        request(editingId ? "/" + editingId + "/" : "", {
            method: editingId ? "PATCH" : "POST",
            body: payload
        })
            .then(function (body) {
                if (body && body.isSuccess) {
                    var savedProduct = body.data;
                    InventoryToast.success(editingId ? "Product updated successfully." : "Product added successfully.");
                    resetForm();
                    InventoryModal.close("product-modal");
                    if (document.getElementById("products-table-body")) {
                        loadProducts(currentSearch, editingId ? currentPage : 1);
                    }
                    if (savedProduct && !editingId) {
                        window.dispatchEvent(new CustomEvent("inventory:product-created", {
                            detail: { product: savedProduct }
                        }));
                    }
                } else {
                    var err = body.message || "Unable to save product.";
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
        InventoryModal.wire("product-view-modal");

        function boot() {
            if (!InventoryBusiness.getActiveId()) return;
            loadCatalogOptions().then(function () {
                loadProducts("", 1);
            });
        }

        InventoryBusiness.whenReady(boot);
        window.addEventListener("inventory:business-changed", boot);

        if (openBtn) {
            openBtn.addEventListener("click", openAddModal);
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

        var categoryAddBtn = document.getElementById("product-category-add-btn");
        var categorySaveBtn = document.getElementById("product-category-save-btn");
        var categoryCancelBtn = document.getElementById("product-category-cancel-btn");

        if (categoryAddBtn) {
            categoryAddBtn.addEventListener("click", function () {
                var panel = document.getElementById("product-category-new-panel");
                toggleCategoryPanel(panel.classList.contains("inv-hidden"));
            });
        }
        if (categorySaveBtn) categorySaveBtn.addEventListener("click", saveNewCategory);
        if (categoryCancelBtn) categoryCancelBtn.addEventListener("click", function () {
            toggleCategoryPanel(false);
        });

        var brandAddBtn = document.getElementById("product-brand-add-btn");
        var brandSaveBtn = document.getElementById("product-brand-save-btn");
        var brandCancelBtn = document.getElementById("product-brand-cancel-btn");

        if (brandAddBtn) {
            brandAddBtn.addEventListener("click", function () {
                var panel = document.getElementById("product-brand-new-panel");
                toggleBrandPanel(panel.classList.contains("inv-hidden"));
            });
        }
        if (brandSaveBtn) brandSaveBtn.addEventListener("click", saveNewBrand);
        if (brandCancelBtn) brandCancelBtn.addEventListener("click", function () {
            toggleBrandPanel(false);
        });

        var unitAddBtn = document.getElementById("product-unit-add-btn");
        var unitSaveBtn = document.getElementById("product-unit-save-btn");
        var unitCancelBtn = document.getElementById("product-unit-cancel-btn");

        if (unitAddBtn) {
            unitAddBtn.addEventListener("click", function () {
                var panel = document.getElementById("product-unit-new-panel");
                toggleUnitPanel(panel.classList.contains("inv-hidden"));
            });
        }
        if (unitSaveBtn) unitSaveBtn.addEventListener("click", saveNewUnit);
        if (unitCancelBtn) unitCancelBtn.addEventListener("click", function () {
            toggleUnitPanel(false);
        });

        if (tbody) {
            tbody.addEventListener("click", function (e) {
                var viewBtn = e.target.closest(".inv-product-view");
                if (viewBtn) {
                    openViewModal(viewBtn.getAttribute("data-id"));
                    return;
                }
                var editBtn = e.target.closest(".inv-product-edit");
                if (editBtn) {
                    openEditModal(editBtn.getAttribute("data-id"));
                    return;
                }
                var deleteBtn = e.target.closest(".inv-product-delete");
                if (deleteBtn) {
                    deleteProduct(deleteBtn.getAttribute("data-id"), deleteBtn);
                }
            });
        }
    }

    return { init: init, loadProducts: loadProducts, openAddModal: openAddModal };
})();
