var InventorySettingsBarcode = (function () {
    "use strict";

    var API = "/api/settings/barcodes";
    var PRODUCTS_API = "/api/products";
    var LIST_PANEL = "settings-barcode-list-panel";
    var FORM_PANEL = "settings-barcode-form-panel";
    var PAGINATION_ID = "settings-barcode-pagination";
    var currentPage = 1;
    var currentSearch = "";
    var editingId = null;
    var products = [];
    var activeTab = "generate";

    function request(path, opts) {
        return InventoryApi.request(API, path, opts);
    }

    function isModalMode() {
        return !!document.getElementById("barcode-modal");
    }

    function isListPage() {
        return !!document.getElementById("settings-barcode-table-body");
    }

    function wantsListView() {
        return new URLSearchParams(window.location.search).get("view") === "list";
    }

    function showListView() {
        if (!isListPage()) return;
        InventoryPagePanel.showList(LIST_PANEL);
        loadBarcodes(currentPage || 1);
    }

    function showGenerateView() {
        if (!isListPage()) return;
        openForm(false);
    }

    function formatBarcodeDateHint() {
        if (window.InventoryDateFormat && typeof InventoryDateFormat.formatBarcodeDate === "function") {
            return InventoryDateFormat.formatBarcodeDate();
        }
        var now = new Date();
        var day = String(now.getDate()).padStart(2, "0");
        var month = String(now.getMonth() + 1).padStart(2, "0");
        var year = String(now.getFullYear());
        return year + month + day;
    }

    function updateDateHint() {
        document.querySelectorAll("#settings-barcode-date-hint").forEach(function (el) {
            el.textContent = formatBarcodeDateHint();
        });
    }

    function buildQuery(page) {
        var params = new URLSearchParams();
        params.set("page", String(page || 1));
        params.set("page_size", String(InventoryPagination.getPageSize(PAGINATION_ID)));
        params.set("ordering", "model_label");
        if (currentSearch) params.set("search", currentSearch);
        return "?" + params.toString();
    }

    function displayText(value) {
        if (value === null || value === undefined || String(value).trim() === "") return "—";
        return InventoryApi.escapeHtml(String(value));
    }

    function skuLabel(item) {
        return displayText(item.model_label || item.product_sku || "—");
    }

    function normalizeBarcodeQuantity(value, fallback) {
        var qty = Number(value);
        if (isNaN(qty)) qty = fallback != null ? Number(fallback) : 0;
        if (isNaN(qty)) qty = 0;
        qty = Math.round(qty);
        if (qty < 0) qty = 0;
        return Math.min(500, qty);
    }

    function applyQuantityFieldValue(qtyEl, value, fallback) {
        var normalized = normalizeBarcodeQuantity(value, fallback);
        if (qtyEl) qtyEl.value = String(normalized);
        return normalized;
    }

    function getProductStockQuantity(product) {
        return normalizeBarcodeQuantity(product && product.quantity != null ? product.quantity : 0, 0);
    }

    function renderProductSkuSelect() {
        var select = document.getElementById("settings-barcode-product-sku");
        if (!select) return;

        var html = '<option value="">Select SKU</option>';
        products.forEach(function (item) {
            if (!item.sku) return;
            html += '<option value="' + item.id + '">' +
                InventoryApi.escapeHtml(item.sku) + " — " + InventoryApi.escapeHtml(item.name) +
                "</option>";
        });
        select.innerHTML = html;
        if (window.InventorySearchableSelect) {
            InventorySearchableSelect.rebuild(select);
        }
    }

    function applyModalProductPrefill() {
        var modal = document.getElementById("barcode-modal");
        var skuEl = document.getElementById("settings-barcode-product-sku");
        if (!modal || !skuEl) return;

        var prefillId = modal.dataset.prefillProductId || "";
        if (!prefillId) {
            updateQuantityFromSelectedSku();
            return;
        }

        var hasOption = Array.prototype.some.call(skuEl.options, function (option) {
            return String(option.value) === String(prefillId);
        });
        if (!hasOption) {
            updateQuantityFromSelectedSku();
            return;
        }

        skuEl.value = String(prefillId);
        if (window.InventorySearchableSelect) {
            InventorySearchableSelect.refresh(skuEl);
        }
        updateQuantityFromSelectedSku();
    }

    function loadProducts() {
        return InventoryApi.request(PRODUCTS_API, "?page_size=500&ordering=-created_at").then(function (body) {
            products = body && body.isSuccess ? (body.data.items || []) : [];
            renderProductSkuSelect();
            return products;
        });
    }

    function productLabel(item) {
        if (item.product_name) return displayText(item.product_name);
        return '<span class="inv-text-muted">Unassigned</span>';
    }

    function renderRows(items) {
        var tbody = document.getElementById("settings-barcode-table-body");
        if (!tbody) return;

        if (!items || !items.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="inv-mgmt-empty">No barcodes yet. Generate some to get started.</td></tr>';
            return;
        }

        tbody.innerHTML = items.map(function (item) {
            return (
                "<tr>" +
                "<td><strong>" + productLabel(item) + "</strong></td>" +
                "<td>" + skuLabel(item) + "</td>" +
                "<td>" + displayText(item.value) + "</td>" +
                '<td class="inv-mgmt-cell--action"><div class="inv-row-actions">' +
                '<button type="button" class="inv-row-action-btn inv-row-action-btn--edit" data-barcode-edit="' + item.id + '" title="View" aria-label="View">' +
                '<span class="material-symbols-outlined">visibility</span></button>' +
                '<button type="button" class="inv-row-action-btn inv-row-action-btn--delete" data-barcode-delete="' + item.id + '" title="Delete" aria-label="Delete">' +
                '<span class="material-symbols-outlined">delete</span></button>' +
                "</div></td></tr>"
            );
        }).join("");
    }

    function loadBarcodes(page) {
        currentPage = page || 1;
        if (!isListPage()) return Promise.resolve([]);
        InventoryLoader.show();

        return request(buildQuery(currentPage))
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    renderRows(body.data.items || []);
                    InventoryPagination.render(PAGINATION_ID, body.data.pagination, loadBarcodes, {
                        onPageSizeChange: function () {
                            loadBarcodes(1);
                        }
                    });
                    return body.data.items || [];
                }
                renderRows([]);
                InventoryPagination.render(PAGINATION_ID, null, function () {});
                InventoryToast.error(body.message || "Failed to load barcodes.");
                return [];
            })
            .catch(function () {
                renderRows([]);
                InventoryToast.error("Network error while loading barcodes.");
                return [];
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function resetReprintForm() {
        var valueEl = document.getElementById("settings-barcode-reprint-value");
        var qtyEl = document.getElementById("settings-barcode-reprint-quantity");
        if (valueEl) valueEl.value = "";
        if (qtyEl) qtyEl.value = "1";
    }

    function setActiveTab(tab) {
        activeTab = tab || "generate";
        document.querySelectorAll(".inv-barcode-tab").forEach(function (btn) {
            btn.classList.toggle("inv-barcode-tab--active", btn.getAttribute("data-barcode-tab") === activeTab);
        });
        var generatePanel = document.getElementById("settings-barcode-tab-generate");
        var reprintPanel = document.getElementById("settings-barcode-tab-reprint");
        if (generatePanel) generatePanel.classList.toggle("inv-hidden", activeTab !== "generate");
        if (reprintPanel) reprintPanel.classList.toggle("inv-hidden", activeTab !== "reprint");
        toggleGenerateViews(false);
    }

    function toggleGenerateViews(isEdit) {
        var editView = document.getElementById("settings-barcode-edit-view");
        var generateView = document.getElementById("settings-barcode-generate-view");
        var generateBtn = document.getElementById("settings-barcode-generate-btn");
        var reprintBtn = document.getElementById("settings-barcode-reprint-btn");
        if (editView) editView.classList.toggle("inv-hidden", !isEdit);
        if (generateView) generateView.classList.toggle("inv-hidden", isEdit);
        if (generateBtn) generateBtn.classList.toggle("inv-hidden", isEdit || activeTab !== "generate");
        if (reprintBtn) reprintBtn.classList.toggle("inv-hidden", isEdit || activeTab !== "reprint");
    }

    function resetGenerateForm() {
        editingId = null;
        var skuEl = document.getElementById("settings-barcode-product-sku");
        var qtyEl = document.getElementById("settings-barcode-quantity");
        if (skuEl) skuEl.value = "";
        if (qtyEl) qtyEl.value = "1";
        if (window.InventorySearchableSelect && skuEl) {
            InventorySearchableSelect.refresh(skuEl);
        }
        updateDateHint();
        resetReprintForm();
        setActiveTab("generate");
    }

    function updateQuantityFromSelectedSku() {
        var skuEl = document.getElementById("settings-barcode-product-sku");
        var qtyEl = document.getElementById("settings-barcode-quantity");
        if (!skuEl || !qtyEl) return;

        var productId = skuEl.value;
        if (!productId) {
            applyQuantityFieldValue(qtyEl, 1, 1);
            return;
        }

        var product = products.find(function (item) {
            return String(item.id) === String(productId);
        });
        applyQuantityFieldValue(qtyEl, getProductStockQuantity(product), 1);
    }

    function wireSkuQuantitySync() {
        var skuEl = document.getElementById("settings-barcode-product-sku");
        if (!skuEl || skuEl._barcodeQtyWired) return;
        skuEl._barcodeQtyWired = true;
        skuEl.addEventListener("change", updateQuantityFromSelectedSku);
    }

    function wireQuantityRounding(inputId) {
        var qtyEl = document.getElementById(inputId);
        if (!qtyEl || qtyEl._barcodeQtyRounded) return;
        qtyEl._barcodeQtyRounded = true;
        qtyEl.addEventListener("blur", function () {
            applyQuantityFieldValue(qtyEl, qtyEl.value, 1);
        });
    }

    function openAddModal() {
        if (!InventoryBusiness.getActiveId()) {
            InventoryToast.error("Select or create a business first.");
            return;
        }
        loadProducts().then(function () {
            editingId = null;
            if (isModalMode()) {
                var skuEl = document.getElementById("settings-barcode-product-sku");
                var qtyEl = document.getElementById("settings-barcode-quantity");
                if (skuEl) skuEl.value = "";
                if (qtyEl) qtyEl.value = "1";
                updateDateHint();

                InventoryModal.open("barcode-modal");

                if (window.InventorySearchableSelect && skuEl) {
                    InventorySearchableSelect.rebuild(skuEl);
                }
                applyModalProductPrefill();

                if (skuEl) {
                    var trigger = skuEl.closest(".inv-search-select");
                    var focusTarget = trigger
                        ? trigger.querySelector(".inv-search-select-trigger")
                        : skuEl;
                    if (focusTarget) focusTarget.focus();
                }
                return;
            }
            resetGenerateForm();
            openForm(false);
        });
    }

    function openForm(isEdit) {
        var title = document.getElementById("settings-barcode-form-title");
        if (!title) return;

        if (!isEdit) {
            resetGenerateForm();
            title.textContent = "Generate Barcode";
        } else {
            title.textContent = "Barcode Details";
        }

        toggleGenerateViews(isEdit);
        InventoryPagePanel.showPanel(LIST_PANEL, FORM_PANEL);
        if (!isEdit) {
            var skuEl = document.getElementById("settings-barcode-product-sku");
            if (skuEl) skuEl.focus();
        }
    }

    function closeForm() {
        editingId = null;
        if (isListPage()) {
            InventoryPagePanel.showList(LIST_PANEL);
        }
    }

    function collectBulkPayload() {
        return {
            product_id: Number(document.getElementById("settings-barcode-product-sku").value),
            quantity: normalizeBarcodeQuantity(
                document.getElementById("settings-barcode-quantity").value,
                1
            )
        };
    }

    function validateBulkPayload(payload) {
        if (!payload.product_id) return "SKU is required.";
        if (!payload.quantity || payload.quantity < 1 || payload.quantity > 500) {
            return "Quantity must be between 1 and 500.";
        }
        return null;
    }

    function dispatchBarcodeCreated(items) {
        if (!items || !items.length) return;
        window.dispatchEvent(new CustomEvent("inventory:barcode-created", {
            detail: {
                barcode: items[0],
                barcodes: items
            }
        }));
    }

    function downloadPdf(items, filename) {
        if (!window.InventoryBarcodePdf) {
            InventoryToast.error("PDF generator is not available.");
            return Promise.reject(new Error("PDF generator missing"));
        }
        return InventoryBarcodePdf.download(items, filename || "Generated_Barcodes.pdf").then(function (result) {
            if (result && result.files > 1 && window.InventoryToast) {
                InventoryToast.success(
                    "Downloaded " + result.files + " PDF files (" + result.count + " barcodes total)."
                );
            }
            return items;
        });
    }

    function buildReprintLabels(barcodeItem, qty) {
        var label = {
            value: barcodeItem.value,
            model_label: barcodeItem.model_label || barcodeItem.product_sku || ""
        };
        var items = [];
        var count = normalizeBarcodeQuantity(qty, 1);
        for (var i = 0; i < count; i++) {
            items.push(label);
        }
        return items;
    }

    function reprintBarcodes() {
        var barcodeNo = (document.getElementById("settings-barcode-reprint-value").value || "").trim();
        var qty = normalizeBarcodeQuantity(
            document.getElementById("settings-barcode-reprint-quantity").value,
            1
        );

        if (!barcodeNo) {
            InventoryToast.error("Barcode number is required.");
            return Promise.resolve(null);
        }
        if (qty < 1 || qty > 500) {
            InventoryToast.error("Quantity must be between 1 and 500.");
            return Promise.resolve(null);
        }

        var btn = document.getElementById("settings-barcode-reprint-btn");
        InventoryLoader.button(btn, true);

        return request("?page_size=500&search=" + encodeURIComponent(barcodeNo))
            .then(function (body) {
                if (!(body && body.isSuccess && body.data)) {
                    InventoryToast.error(body.message || "Failed to find barcode.");
                    return null;
                }
                var matched = (body.data.items || []).filter(function (item) {
                    return String(item.value).toLowerCase() === barcodeNo.toLowerCase();
                });
                if (!matched.length) {
                    InventoryToast.error("Barcode not found.");
                    return null;
                }
                var printItems = buildReprintLabels(matched[0], qty);
                return downloadPdf(printItems, "Reprint_Barcodes.pdf").then(function () {
                    InventoryToast.success("Barcode PDF downloaded.");
                    return printItems;
                }).catch(function (pdfErr) {
                    InventoryToast.error(pdfErr.message || "Unable to print barcode.");
                    return null;
                });
            })
            .catch(function () {
                InventoryToast.error("Network error while loading barcode.");
                return null;
            })
            .finally(function () {
                InventoryLoader.button(btn, false);
            });
    }

    function bulkGenerate(options) {
        options = options || {};
        var payload = collectBulkPayload();
        var error = validateBulkPayload(payload);
        if (error) {
            InventoryToast.error(error);
            return Promise.resolve(null);
        }

        var btn = document.getElementById("settings-barcode-generate-btn");
        InventoryLoader.button(btn, true);

        return request("/bulk-generate/", { method: "POST", body: payload })
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    var items = body.data.items || [];
                    InventoryToast.success(body.message || "Barcodes generated.");
                    if (options.downloadPdf !== false && items.length) {
                        return downloadPdf(items).then(function () {
                            return items;
                        }).catch(function (pdfErr) {
                            InventoryToast.error(pdfErr.message || "Barcodes saved but PDF download failed.");
                            return items;
                        });
                    }
                    return items;
                }
                var err = body.message || "Failed to generate barcodes.";
                if (body.errors && body.errors.length) err = body.errors.join(" • ");
                InventoryToast.error(err);
                return null;
            })
            .catch(function () {
                InventoryToast.error("Network error while generating barcodes.");
                return null;
            })
            .finally(function () {
                InventoryLoader.button(btn, false);
            });
    }

    function handleGenerate() {
        bulkGenerate({ downloadPdf: !isModalMode() }).then(function (items) {
            if (!items || !items.length) return;
            if (isModalMode()) {
                InventoryModal.close("barcode-modal");
                resetGenerateForm();
                dispatchBarcodeCreated(items);
            } else {
                closeForm();
                loadBarcodes(1);
            }
        });
    }

    function viewBarcode(id) {
        InventoryLoader.show();
        request("/" + id + "/")
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    editingId = id;
                    document.getElementById("settings-barcode-edit-product").value = body.data.product_name || "Unassigned";
                    document.getElementById("settings-barcode-edit-sku").value = body.data.model_label || "";
                    document.getElementById("settings-barcode-edit-value").value = body.data.value || "";
                    openForm(true);
                } else {
                    InventoryToast.error(body.message || "Failed to load barcode.");
                }
            })
            .catch(function () {
                InventoryToast.error("Network error while loading barcode.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function deleteBarcode(id) {
        InventoryConfirm.delete({
            title: "Delete barcode?",
            message: "This barcode will be removed from your list."
        }).then(function (confirmed) {
            if (!confirmed) return;

            InventoryLoader.show();
            request("/" + id + "/", { method: "DELETE" })
                .then(function (body) {
                    if (body && body.isSuccess) {
                        InventoryToast.success(body.message || "Barcode deleted.");
                        loadBarcodes(currentPage);
                    } else {
                        InventoryToast.error(body.message || "Failed to delete barcode.");
                    }
                })
                .catch(function () {
                    InventoryToast.error("Network error while deleting barcode.");
                })
                .finally(function () {
                    InventoryLoader.hide();
                });
        });
    }

    function init() {
        if (init._wired) return;
        if (!isModalMode() && !isListPage()) return;
        init._wired = true;

        updateDateHint();

        if (isModalMode()) {
            InventoryModal.wire("barcode-modal");
        }

        var addBtn = document.getElementById("settings-barcode-add-btn");
        var generateBtn = document.getElementById("settings-barcode-generate-btn");
        var reprintBtn = document.getElementById("settings-barcode-reprint-btn");
        var searchEl = document.getElementById("settings-barcode-search");
        var tableBody = document.getElementById("settings-barcode-table-body");

        if (window.InventoryPagePanel && isListPage()) {
            InventoryPagePanel.init();
        }

        document.querySelectorAll(".inv-barcode-tab").forEach(function (btn) {
            btn.addEventListener("click", function () {
                setActiveTab(btn.getAttribute("data-barcode-tab"));
            });
        });

        if (addBtn) {
            addBtn.addEventListener("click", function () {
                showGenerateView();
            });
        }
        if (generateBtn) generateBtn.addEventListener("click", handleGenerate);
        if (reprintBtn) reprintBtn.addEventListener("click", reprintBarcodes);

        wireSkuQuantitySync();
        wireQuantityRounding("settings-barcode-quantity");
        wireQuantityRounding("settings-barcode-reprint-quantity");

        if (searchEl) {
            var searchTimer = null;
            searchEl.addEventListener("input", function () {
                window.clearTimeout(searchTimer);
                searchTimer = window.setTimeout(function () {
                    currentSearch = searchEl.value.trim();
                    loadBarcodes(1);
                }, 300);
            });
        }

        if (tableBody) {
            tableBody.addEventListener("click", function (e) {
                var editBtn = e.target.closest("[data-barcode-edit]");
                var deleteBtn = e.target.closest("[data-barcode-delete]");
                if (editBtn) {
                    viewBarcode(editBtn.getAttribute("data-barcode-edit"));
                } else if (deleteBtn) {
                    deleteBarcode(deleteBtn.getAttribute("data-barcode-delete"));
                }
            });
        }

        InventoryBusiness.whenReady(function () {
            if (!InventoryBusiness.getActiveId()) {
                renderRows([]);
                return;
            }
            loadProducts().then(function () {
                if (!isListPage()) return;
                if (wantsListView()) {
                    showListView();
                    return;
                }
                showGenerateView();
            });
            if (isListPage() && window.InventorySidebar && InventorySidebar.consumeAddAction()) {
                showGenerateView();
            }
        });

        if (isListPage()) {
            window.addEventListener("inventory:business-changed", function () {
                closeForm();
                if (InventoryBusiness.getActiveId()) {
                    loadProducts().then(function () {
                        loadBarcodes(1);
                    });
                } else {
                    renderRows([]);
                }
            });
        }
    }

    return {
        init: init,
        openAddModal: openAddModal,
        loadBarcodes: loadBarcodes
    };
})();
