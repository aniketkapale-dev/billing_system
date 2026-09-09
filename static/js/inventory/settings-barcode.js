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
    var activeTab = "bulk";

    function request(path, opts) {
        return InventoryApi.request(API, path, opts);
    }

    function isModalMode() {
        return !!document.getElementById("barcode-modal");
    }

    function isListPage() {
        return !!document.getElementById("settings-barcode-table-body");
    }

    function formatBarcodeDateHint() {
        if (window.InventoryDateFormat && typeof InventoryDateFormat.formatBarcodeDate === "function") {
            return InventoryDateFormat.formatBarcodeDate();
        }
        var now = new Date();
        var day = String(now.getDate()).padStart(2, "0");
        var month = String(now.getMonth() + 1).padStart(2, "0");
        var year = String(now.getFullYear());
        return day + month + year;
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

    function renderReprintProductSelect() {
        var select = document.getElementById("settings-barcode-reprint-product");
        if (!select) return;

        var html = '<option value="">All products</option>';
        products.forEach(function (item) {
            html += '<option value="' + item.id + '">' + InventoryApi.escapeHtml(item.name) + "</option>";
        });
        select.innerHTML = html;
        if (window.InventorySearchableSelect) {
            InventorySearchableSelect.refresh(select);
        }
    }

    function loadProducts() {
        return InventoryApi.request(PRODUCTS_API, "?page_size=500&ordering=name").then(function (body) {
            products = body && body.isSuccess ? (body.data.items || []) : [];
            renderReprintProductSelect();
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
                "<td>" + displayText(item.model_label) + "</td>" +
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

    function resetGenerateForm() {
        editingId = null;
        var modelEl = document.getElementById("settings-barcode-model-number");
        var qtyEl = document.getElementById("settings-barcode-quantity");
        if (modelEl) modelEl.value = "";
        if (qtyEl) qtyEl.value = "1";
        updateDateHint();
        setActiveTab("bulk");
        toggleGenerateViews(false);
    }

    function toggleGenerateViews(isEdit) {
        var editView = document.getElementById("settings-barcode-edit-view");
        var generateView = document.getElementById("settings-barcode-generate-view");
        var generateBtn = document.getElementById("settings-barcode-generate-btn");
        var reprintBtn = document.getElementById("settings-barcode-reprint-btn");
        if (editView) editView.classList.toggle("inv-hidden", !isEdit);
        if (generateView) generateView.classList.toggle("inv-hidden", isEdit);
        if (generateBtn) generateBtn.classList.toggle("inv-hidden", isEdit || activeTab === "reprint");
        if (reprintBtn) reprintBtn.classList.toggle("inv-hidden", isEdit || activeTab !== "reprint");
    }

    function setActiveTab(tab) {
        activeTab = tab || "bulk";
        document.querySelectorAll(".inv-barcode-tab").forEach(function (btn) {
            btn.classList.toggle("inv-barcode-tab--active", btn.getAttribute("data-barcode-tab") === activeTab);
        });
        var bulkPanel = document.getElementById("settings-barcode-tab-bulk");
        var reprintPanel = document.getElementById("settings-barcode-tab-reprint");
        if (bulkPanel) bulkPanel.classList.toggle("inv-hidden", activeTab !== "bulk");
        if (reprintPanel) reprintPanel.classList.toggle("inv-hidden", activeTab !== "reprint");
        toggleGenerateViews(false);
    }

    function openAddModal() {
        if (!InventoryBusiness.getActiveId()) {
            InventoryToast.error("Select or create a business first.");
            return;
        }
        editingId = null;
        resetGenerateForm();
        if (isModalMode()) {
            InventoryModal.open("barcode-modal");
            var modelEl = document.getElementById("settings-barcode-model-number");
            if (modelEl) modelEl.focus();
            return;
        }
        openForm(false);
    }

    function openForm(isEdit) {
        var title = document.getElementById("settings-barcode-form-title");
        if (!title) return;

        if (!isEdit) {
            resetGenerateForm();
            title.textContent = "Generate Barcodes";
        } else {
            title.textContent = "Barcode Details";
        }

        toggleGenerateViews(isEdit);
        InventoryPagePanel.showPanel(LIST_PANEL, FORM_PANEL);
        if (!isEdit) {
            var modelEl = document.getElementById("settings-barcode-model-number");
            if (modelEl) modelEl.focus();
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
            model_number: document.getElementById("settings-barcode-model-number").value.trim(),
            quantity: Number(document.getElementById("settings-barcode-quantity").value)
        };
    }

    function validateBulkPayload(payload) {
        if (!payload.model_number) return "Model number is required.";
        if (!/^[A-Za-z0-9]+$/.test(payload.model_number)) {
            return "Model number can only contain letters and numbers.";
        }
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

    function downloadPdf(items) {
        if (!window.InventoryBarcodePdf) {
            InventoryToast.error("PDF generator is not available.");
            return Promise.reject(new Error("PDF generator missing"));
        }
        return InventoryBarcodePdf.download(items, "Generated_Barcodes.pdf");
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

    function reprintBarcodes() {
        var modelNumber = (document.getElementById("settings-barcode-reprint-model").value || "").trim();
        var productId = document.getElementById("settings-barcode-reprint-product").value;
        if (!modelNumber) {
            InventoryToast.error("Model number is required.");
            return;
        }

        var params = new URLSearchParams();
        params.set("page_size", "500");
        params.set("search", modelNumber);
        if (productId) params.set("product_id", productId);

        var btn = document.getElementById("settings-barcode-reprint-btn");
        InventoryLoader.button(btn, true);

        request("?" + params.toString())
            .then(function (body) {
                if (!(body && body.isSuccess && body.data)) {
                    InventoryToast.error(body.message || "Failed to load barcodes.");
                    return;
                }
                var items = (body.data.items || []).filter(function (item) {
                    return String(item.model_label || "").toLowerCase() === modelNumber.toLowerCase();
                });
                if (!items.length) {
                    InventoryToast.error("No barcodes found for this model number.");
                    return;
                }
                return downloadPdf(items);
            })
            .catch(function () {
                InventoryToast.error("Network error while loading barcodes.");
            })
            .finally(function () {
                InventoryLoader.button(btn, false);
            });
    }

    function viewBarcode(id) {
        InventoryLoader.show();
        request("/" + id + "/")
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    editingId = id;
                    document.getElementById("settings-barcode-edit-product").value = body.data.product_name || "Unassigned";
                    document.getElementById("settings-barcode-edit-model").value = body.data.model_label || "";
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
                openAddModal(null);
            });
        }
        if (generateBtn) generateBtn.addEventListener("click", handleGenerate);
        if (reprintBtn) reprintBtn.addEventListener("click", reprintBarcodes);

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

        if (isListPage()) {
            InventoryBusiness.whenReady(function () {
                if (!InventoryBusiness.getActiveId()) return;
                loadProducts().then(function () {
                    loadBarcodes(1);
                });
                if (window.InventorySidebar && InventorySidebar.consumeAddAction()) {
                    openAddModal(null);
                }
            });

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
