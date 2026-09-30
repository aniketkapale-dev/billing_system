var InventorySettingsCategoryTax = (function () {
    "use strict";

    var CATEGORIES_API = "/api/catalog/categories";
    var TAXES_API = "/api/settings/taxes";
    var PAGINATION_ID = "settings-category-tax-pagination";
    var MODAL_ID = "category-tax-apply-modal";

    var taxes = [];
    var allCategories = [];
    var modalCategorySelection = {};
    var modalTaxSelection = {};
    var lastCategoryItems = [];
    var currentPage = 1;
    var MODAL_TAX_RADIO_NAME = "category-tax-modal-tax";
    var listSearch = "";
    var listTaxAssignment = "";
    var listTaxId = "";

    function requestCategories(path, opts) {
        return InventoryApi.request(CATEGORIES_API, path, opts);
    }

    function requestTaxes(path, opts) {
        return InventoryApi.request(TAXES_API, path, opts);
    }

    function buildQuery(page) {
        var params = new URLSearchParams();
        params.set("page", String(page || 1));
        params.set("page_size", String(InventoryPagination.getPageSize(PAGINATION_ID)));
        params.set("ordering", "name");
        if (listSearch) params.set("search", listSearch);
        if (listTaxAssignment) params.set("tax_assignment", listTaxAssignment);
        if (listTaxId) params.set("sale_tax_id", listTaxId);
        return "?" + params.toString();
    }

    function hasActiveListFilters() {
        return !!(listSearch || listTaxAssignment || listTaxId);
    }

    function renderTaxFilterOptions() {
        var select = document.getElementById("settings-category-tax-tax-filter");
        if (!select) return;
        var current = select.value;
        var html = '<option value="">All taxes</option>';
        taxes.forEach(function (tax) {
            html += '<option value="' + tax.id + '">' + InventoryApi.escapeHtml(formatTaxLabel(tax)) + "</option>";
        });
        select.innerHTML = html;
        if (current) select.value = current;
    }

    function clearListFilters() {
        listSearch = "";
        listTaxAssignment = "";
        listTaxId = "";
        var searchEl = document.getElementById("settings-category-tax-search");
        var assignmentEl = document.getElementById("settings-category-tax-assignment-filter");
        var taxEl = document.getElementById("settings-category-tax-tax-filter");
        if (searchEl) searchEl.value = "";
        if (assignmentEl) assignmentEl.value = "";
        if (taxEl) taxEl.value = "";
        loadCategories(1);
    }

    function formatTaxLabel(tax) {
        return tax.key + " (" + tax.value + "%)";
    }

    function formatTaxesAssignedCell(labels) {
        if (!labels || !labels.length) {
            return '<span class="inv-text-muted">—</span>';
        }
        var tax = labels[0];
        return (
            '<div class="inv-category-tax-assigned-wrap">' +
            '<span class="inv-category-tax-assigned-text">' +
            InventoryApi.escapeHtml(formatTaxLabel(tax)) +
            "</span></div>"
        );
    }

    function formatRowActions(item) {
        var categoryId = item.id;
        var hasTaxes = item.sale_tax_labels && item.sale_tax_labels.length;
        if (!hasTaxes) {
            return (
                '<div class="inv-row-actions">' +
                '<button type="button" class="inv-row-action-btn inv-row-action-btn--edit inv-category-tax-row-apply"' +
                ' data-category-id="' + categoryId + '" title="Apply tax" aria-label="Apply tax">' +
                '<span class="material-symbols-outlined">sell</span></button>' +
                "</div>"
            );
        }
            return (
                '<div class="inv-row-actions">' +
                '<button type="button" class="inv-row-action-btn inv-row-action-btn--edit inv-category-tax-row-change"' +
                ' data-category-id="' + categoryId + '" title="Change tax" aria-label="Change tax">' +
                '<span class="material-symbols-outlined">edit</span></button>' +
                '<button type="button" class="inv-row-action-btn inv-row-action-btn--delete inv-category-tax-row-clear"' +
                ' data-category-id="' + categoryId + '" title="Remove tax" aria-label="Remove tax">' +
                '<span class="material-symbols-outlined">delete</span></button>' +
                "</div>"
            );
    }

    function renderRows(items) {
        var tbody = document.getElementById("settings-category-tax-table-body");
        if (!tbody) return;

        lastCategoryItems = items || [];

        if (!lastCategoryItems.length) {
            var emptyMessage = hasActiveListFilters()
                ? "No categories match your filters."
                : "No categories found. Add categories first.";
            tbody.innerHTML = '<tr><td colspan="3" class="inv-mgmt-empty">' + emptyMessage + "</td></tr>";
            return;
        }

        tbody.innerHTML = lastCategoryItems.map(function (item) {
            var taxIds = (item.sale_tax_ids || []).join(",");
            return (
                "<tr data-category-id=\"" + item.id + "\" data-sale-tax-ids=\"" + taxIds + "\">" +
                "<td>" + InventoryApi.escapeHtml(item.name) + "</td>" +
                '<td class="inv-category-tax-assigned-cell">' +
                formatTaxesAssignedCell(item.sale_tax_labels) +
                "</td>" +
                '<td class="inv-col-action inv-mgmt-cell--action">' + formatRowActions(item) + "</td>" +
                "</tr>"
            );
        }).join("");

        if (window.InventoryTableCards && typeof InventoryTableCards.syncAll === "function") {
            var table = tbody.closest(".inv-mgmt-table");
            if (table) InventoryTableCards.syncAll(table.parentElement || document);
        }
    }

    function loadTaxes() {
        return requestTaxes("?page_size=100&ordering=key")
            .then(function (body) {
                taxes = body && body.isSuccess ? (body.data.items || []) : [];
            })
            .catch(function () {
                taxes = [];
            });
    }

    function loadAllCategories() {
        return requestCategories("?page_size=500&ordering=name")
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    allCategories = body.data.items || [];
                    return allCategories;
                }
                allCategories = [];
                return [];
            })
            .catch(function () {
                allCategories = [];
                return [];
            });
    }

    function loadCategories(page, silent) {
        currentPage = page || 1;
        if (!silent) InventoryLoader.show();

        return requestCategories(buildQuery(currentPage))
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    renderRows(body.data.items || []);
                    InventoryPagination.render(PAGINATION_ID, body.data.pagination, loadCategories, {
                        onPageSizeChange: function () {
                            loadCategories(1);
                        }
                    });
                } else {
                    renderRows([]);
                    InventoryPagination.render(PAGINATION_ID, null, function () {});
                    if (!silent) InventoryToast.error(body.message || "Failed to load categories.");
                }
            })
            .catch(function () {
                renderRows([]);
                if (!silent) InventoryToast.error("Network error while loading categories.");
            })
            .finally(function () {
                if (!silent) InventoryLoader.hide();
            });
    }

    function getFilteredModalCategories() {
        var searchEl = document.getElementById("category-tax-modal-search");
        var query = searchEl ? searchEl.value.trim().toLowerCase() : "";
        if (!query) return allCategories.slice();
        return allCategories.filter(function (item) {
            return String(item.name || "").toLowerCase().indexOf(query) !== -1;
        });
    }

    function getFilteredModalTaxes() {
        var searchEl = document.getElementById("category-tax-modal-tax-search");
        var query = searchEl ? searchEl.value.trim().toLowerCase() : "";
        if (!query) return taxes.slice();
        return taxes.filter(function (item) {
            var label = formatTaxLabel(item).toLowerCase();
            return label.indexOf(query) !== -1 || String(item.key || "").toLowerCase().indexOf(query) !== -1;
        });
    }

    function countSelected(selection) {
        return Object.keys(selection).filter(function (id) {
            return selection[id];
        }).length;
    }

    function updatePanelCount(elementId, selectedCount, totalCount) {
        var el = document.getElementById(elementId);
        if (!el) return;
        if (!totalCount) {
            el.textContent = "";
            return;
        }
        if (selectedCount > 0) {
            el.textContent = selectedCount + " selected";
            return;
        }
        el.textContent = totalCount + (totalCount === 1 ? " item" : " items");
    }

    function renderModalCategories() {
        var container = document.getElementById("category-tax-modal-categories");
        if (!container) return;

        var items = getFilteredModalCategories();
        if (!items.length) {
            container.innerHTML = '<p class="inv-mgmt-empty">No categories found.</p>';
            syncModalSelectAll("category");
            updatePanelCount("category-tax-category-count", countSelected(modalCategorySelection), 0);
            return;
        }

        container.innerHTML = items.map(function (item) {
            var id = String(item.id);
            var checked = modalCategorySelection[id] ? " checked" : "";
            return (
                '<label class="inv-category-tax-check-item">' +
                '<input type="checkbox" class="category-tax-modal-check" data-id="' + id + '"' + checked + "/>" +
                "<span>" + InventoryApi.escapeHtml(item.name) + "</span>" +
                "</label>"
            );
        }).join("");
        syncModalSelectAll("category");
        updatePanelCount(
            "category-tax-category-count",
            countSelected(modalCategorySelection),
            allCategories.length
        );
    }

    function renderModalTaxes() {
        var container = document.getElementById("category-tax-modal-taxes");
        if (!container) return;

        var items = getFilteredModalTaxes();
        if (!taxes.length) {
            container.innerHTML =
                '<p class="inv-mgmt-empty">No taxes yet. Click Add to create one.</p>';
            updatePanelCount("category-tax-tax-count", 0, 0);
            return;
        }

        if (!items.length) {
            container.innerHTML = '<p class="inv-mgmt-empty">No taxes match your search.</p>';
            updatePanelCount("category-tax-tax-count", getModalTaxIds().length ? 1 : 0, taxes.length);
            return;
        }

        var selectedTaxId = getModalTaxIds()[0] || null;
        container.innerHTML = items.map(function (item) {
            var id = String(item.id);
            var checked = selectedTaxId === id ? " checked" : "";
            return (
                '<label class="inv-category-tax-check-item">' +
                '<input type="radio" class="category-tax-modal-tax-check" name="' + MODAL_TAX_RADIO_NAME +
                '" data-id="' + id + '"' + checked + "/>" +
                "<span>" + InventoryApi.escapeHtml(formatTaxLabel(item)) + "</span>" +
                "</label>"
            );
        }).join("");
        updatePanelCount("category-tax-tax-count", selectedTaxId ? 1 : 0, taxes.length);
    }

    function syncModalSelectAll(kind) {
        if (kind === "category") {
            var selectAll = document.getElementById("category-tax-modal-select-all-categories");
            var checks = document.querySelectorAll("#category-tax-modal-categories .category-tax-modal-check");
            syncSelectAllState(selectAll, checks);
            return;
        }

    }

    function syncSelectAllState(selectAll, checks) {
        if (!selectAll) return;
        if (!checks.length) {
            selectAll.checked = false;
            selectAll.indeterminate = false;
            selectAll.disabled = true;
            return;
        }
        selectAll.disabled = false;
        var checkedCount = 0;
        checks.forEach(function (el) {
            if (el.checked) checkedCount += 1;
        });
        selectAll.checked = checkedCount === checks.length;
        selectAll.indeterminate = checkedCount > 0 && checkedCount < checks.length;
    }

    function toggleInlinePanel(panelId, show, focusId) {
        var panel = document.getElementById(panelId);
        if (!panel) return;
        if (show) {
            panel.classList.remove("inv-hidden");
            if (focusId) {
                var focusEl = document.getElementById(focusId);
                if (focusEl) focusEl.focus();
            }
            return;
        }
        panel.classList.add("inv-hidden");
    }

    function clearCategoryPanel() {
        var nameEl = document.getElementById("category-tax-new-name");
        var descEl = document.getElementById("category-tax-new-desc");
        if (nameEl) nameEl.value = "";
        if (descEl) descEl.value = "";
    }

    function clearTaxPanel() {
        var keyEl = document.getElementById("category-tax-new-key");
        var valueEl = document.getElementById("category-tax-new-value");
        if (keyEl) keyEl.value = "";
        if (valueEl) valueEl.value = "";
    }

    function resetModalState() {
        modalCategorySelection = {};
        modalTaxSelection = {};
        var searchEl = document.getElementById("category-tax-modal-search");
        var taxSearchEl = document.getElementById("category-tax-modal-tax-search");
        if (searchEl) searchEl.value = "";
        if (taxSearchEl) taxSearchEl.value = "";
        toggleInlinePanel("category-tax-new-panel", false);
        toggleInlinePanel("category-tax-new-tax-panel", false);
        clearCategoryPanel();
        clearTaxPanel();
    }

    function validateTaxPayload(key, value) {
        if (!key) return "Tax key is required (e.g. gst12%).";
        if (value === "") return "Tax value is required (e.g. 12).";
        var num = Number(value);
        if (Number.isNaN(num)) return "Tax value must be a number.";
        if (num < 0 || num > 100) return "Tax value must be between 0 and 100.";
        return null;
    }

    function saveNewCategory() {
        var nameEl = document.getElementById("category-tax-new-name");
        var name = nameEl ? nameEl.value.trim() : "";
        if (!name) {
            InventoryToast.error("Category name is required.");
            return;
        }

        var descEl = document.getElementById("category-tax-new-desc");
        var btn = document.getElementById("category-tax-save-category-btn");
        InventoryLoader.button(btn, true, "Saving...");

        requestCategories("/", {
            method: "POST",
            body: {
                name: name,
                description: descEl ? descEl.value.trim() : ""
            }
        })
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    InventoryToast.success("Category added.");
                    toggleInlinePanel("category-tax-new-panel", false);
                    clearCategoryPanel();
                    modalCategorySelection[String(body.data.id)] = true;
                    return loadAllCategories().then(function () {
                        renderModalCategories();
                        return loadCategories(currentPage, true);
                    });
                }
                var err = body && body.message ? body.message : "Unable to add category.";
                if (body && body.errors && body.errors.length) err = body.errors.join(" • ");
                InventoryToast.error(err);
            })
            .catch(function () {
                InventoryToast.error("Network error while adding category.");
            })
            .finally(function () {
                InventoryLoader.button(btn, false);
            });
    }

    function saveNewTax() {
        var keyEl = document.getElementById("category-tax-new-key");
        var valueEl = document.getElementById("category-tax-new-value");
        var key = keyEl ? keyEl.value.trim() : "";
        var value = valueEl ? valueEl.value.trim() : "";
        var error = validateTaxPayload(key, value);
        if (error) {
            InventoryToast.error(error);
            return;
        }

        var btn = document.getElementById("category-tax-save-tax-btn");
        InventoryLoader.button(btn, true, "Saving...");

        requestTaxes("/", {
            method: "POST",
            body: { key: key, value: value }
        })
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    InventoryToast.success("Tax added.");
                    toggleInlinePanel("category-tax-new-tax-panel", false);
                    clearTaxPanel();
                    modalTaxSelection = {};
                    modalTaxSelection[String(body.data.id)] = true;
                    return loadTaxes().then(function () {
                        renderModalTaxes();
                    });
                }
                var err = body && body.message ? body.message : "Unable to add tax.";
                if (body && body.errors && body.errors.length) err = body.errors.join(" • ");
                InventoryToast.error(err);
            })
            .catch(function () {
                InventoryToast.error("Network error while adding tax.");
            })
            .finally(function () {
                InventoryLoader.button(btn, false);
            });
    }

    function setModalSelection(categoryIds, taxIds) {
        modalCategorySelection = {};
        modalTaxSelection = {};
        (categoryIds || []).forEach(function (id) {
            modalCategorySelection[String(id)] = true;
        });
        var firstTaxId = (taxIds || [])[0];
        if (firstTaxId != null && firstTaxId !== "") {
            modalTaxSelection[String(firstTaxId)] = true;
        }
    }

    function parseRowTaxIds(row) {
        if (!row) return [];
        return String(row.getAttribute("data-sale-tax-ids") || "")
            .split(",")
            .map(function (part) { return part.trim(); })
            .filter(Boolean);
    }

    function openApplyModal(categoryIds, taxIds) {
        resetModalState();
        if (categoryIds && categoryIds.length) {
            setModalSelection(categoryIds, taxIds || []);
        }
        InventoryLoader.show();

        Promise.all([loadTaxes(), loadAllCategories()])
            .then(function () {
                renderModalCategories();
                renderModalTaxes();
                InventoryModal.open(MODAL_ID);
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function openApplyModalForRow(categoryId, taxIds) {
        openApplyModal([String(categoryId)], taxIds || []);
    }

    function updateCategoryTaxes(categoryId, taxIds) {
        return requestCategories("/" + categoryId + "/", {
            method: "PATCH",
            body: {
                sale_tax_ids: (taxIds || [])
                    .map(function (id) { return Number(id); })
                    .slice(0, 1)
            }
        }).then(function (body) {
            if (!body || !body.isSuccess) {
                throw new Error(body && body.message ? body.message : "Unable to update taxes.");
            }
            return body;
        });
    }

    function clearCategoryTaxes(categoryId) {
        InventoryLoader.show();
        return updateCategoryTaxes(categoryId, [])
            .then(function () {
                InventoryToast.success("Tax removed.");
                return loadCategories(currentPage, true);
            })
            .catch(function (err) {
                InventoryToast.error(err && err.message ? err.message : "Unable to remove taxes.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function handleRowActionsClick(e) {
        var applyBtn = e.target.closest(".inv-category-tax-row-apply");
        if (applyBtn) {
            openApplyModalForRow(applyBtn.getAttribute("data-category-id"), []);
            return;
        }

        var changeBtn = e.target.closest(".inv-category-tax-row-change");
        if (changeBtn) {
            var changeRow = changeBtn.closest("tr[data-category-id]");
            openApplyModalForRow(
                changeBtn.getAttribute("data-category-id"),
                parseRowTaxIds(changeRow)
            );
            return;
        }

        var clearBtn = e.target.closest(".inv-category-tax-row-clear");
        if (clearBtn) {
            clearCategoryTaxes(clearBtn.getAttribute("data-category-id"));
        }
    }

    function getSelectedModalCategoryIds() {
        return Object.keys(modalCategorySelection).filter(function (id) {
            return modalCategorySelection[id];
        });
    }

    function getModalTaxIds() {
        return Object.keys(modalTaxSelection).filter(function (id) {
            return modalTaxSelection[id];
        }).slice(0, 1);
    }

    function applyTaxesFromModal() {
        var categoryIds = getSelectedModalCategoryIds();
        if (!categoryIds.length) {
            InventoryToast.error("Select at least one category.");
            return;
        }

        var taxIds = getModalTaxIds().map(function (id) { return Number(id); });
        if (taxIds.length > 1) {
            InventoryToast.error("Select only one tax per category.");
            return;
        }

        var btn = document.getElementById("category-tax-modal-apply-btn");
        InventoryLoader.button(btn, true, "Applying...");

        var chain = Promise.resolve();
        categoryIds.forEach(function (categoryId) {
            chain = chain.then(function () {
                return requestCategories("/" + categoryId + "/", {
                    method: "PATCH",
                    body: { sale_tax_ids: taxIds }
                }).then(function (body) {
                    if (!body || !body.isSuccess) {
                        throw new Error(body && body.message ? body.message : "Unable to apply taxes.");
                    }
                });
            });
        });

        chain
            .then(function () {
                InventoryToast.success("Tax applied to selected categories.");
                InventoryModal.close(MODAL_ID);
                return loadCategories(currentPage);
            })
            .catch(function (err) {
                InventoryToast.error(err && err.message ? err.message : "Unable to apply taxes.");
            })
            .finally(function () {
                InventoryLoader.button(btn, false);
            });
    }

    function init() {
        var openBtn = document.getElementById("settings-category-tax-apply-open-btn");
        var applyBtn = document.getElementById("category-tax-modal-apply-btn");
        var selectAllCategories = document.getElementById("category-tax-modal-select-all-categories");
        var searchEl = document.getElementById("category-tax-modal-search");
        var taxSearchEl = document.getElementById("category-tax-modal-tax-search");
        var categoriesContainer = document.getElementById("category-tax-modal-categories");
        var taxesContainer = document.getElementById("category-tax-modal-taxes");

        InventoryModal.wire(MODAL_ID);

        loadTaxes().then(function () {
            renderTaxFilterOptions();
        });
        loadCategories(1);

        var listSearchEl = document.getElementById("settings-category-tax-search");
        var listAssignmentEl = document.getElementById("settings-category-tax-assignment-filter");
        var listTaxFilterEl = document.getElementById("settings-category-tax-tax-filter");
        var clearFiltersBtn = document.getElementById("settings-category-tax-clear-filters");

        if (listSearchEl) {
            var listSearchTimer = null;
            listSearchEl.addEventListener("input", function () {
                window.clearTimeout(listSearchTimer);
                listSearchTimer = window.setTimeout(function () {
                    listSearch = listSearchEl.value.trim();
                    loadCategories(1);
                }, 300);
            });
        }
        if (listAssignmentEl) {
            listAssignmentEl.addEventListener("change", function () {
                listTaxAssignment = listAssignmentEl.value || "";
                loadCategories(1);
            });
        }
        if (listTaxFilterEl) {
            listTaxFilterEl.addEventListener("change", function () {
                listTaxId = listTaxFilterEl.value || "";
                loadCategories(1);
            });
        }
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener("click", clearListFilters);
        }

        var tableBody = document.getElementById("settings-category-tax-table-body");
        if (tableBody) {
            tableBody.addEventListener("click", handleRowActionsClick);
        }

        if (openBtn) {
            openBtn.addEventListener("click", function () {
                openApplyModal();
            });
        }

        if (applyBtn) {
            applyBtn.addEventListener("click", applyTaxesFromModal);
        }

        if (searchEl) {
            searchEl.addEventListener("input", renderModalCategories);
        }

        if (taxSearchEl) {
            taxSearchEl.addEventListener("input", renderModalTaxes);
        }

        if (selectAllCategories) {
            selectAllCategories.addEventListener("change", function () {
                var checked = !!selectAllCategories.checked;
                getFilteredModalCategories().forEach(function (item) {
                    modalCategorySelection[String(item.id)] = checked;
                });
                renderModalCategories();
            });
        }

        if (categoriesContainer) {
            categoriesContainer.addEventListener("change", function (e) {
                var check = e.target.closest(".category-tax-modal-check");
                if (!check) return;
                var id = check.getAttribute("data-id");
                if (id) modalCategorySelection[id] = check.checked;
                syncModalSelectAll("category");
                updatePanelCount(
                    "category-tax-category-count",
                    countSelected(modalCategorySelection),
                    allCategories.length
                );
            });
        }

        if (taxesContainer) {
            taxesContainer.addEventListener("change", function (e) {
                var check = e.target.closest(".category-tax-modal-tax-check");
                if (!check) return;
                var id = check.getAttribute("data-id");
                modalTaxSelection = {};
                if (id && check.checked) {
                    modalTaxSelection[id] = true;
                }
                updatePanelCount(
                    "category-tax-tax-count",
                    getModalTaxIds().length ? 1 : 0,
                    taxes.length
                );
            });
        }

        var addCategoryBtn = document.getElementById("category-tax-add-category-btn");
        var saveCategoryBtn = document.getElementById("category-tax-save-category-btn");
        var cancelCategoryBtn = document.getElementById("category-tax-cancel-category-btn");
        var addTaxBtn = document.getElementById("category-tax-add-tax-btn");
        var saveTaxBtn = document.getElementById("category-tax-save-tax-btn");
        var cancelTaxBtn = document.getElementById("category-tax-cancel-tax-btn");

        if (addCategoryBtn) {
            addCategoryBtn.addEventListener("click", function () {
                toggleInlinePanel("category-tax-new-panel", true, "category-tax-new-name");
                toggleInlinePanel("category-tax-new-tax-panel", false);
            });
        }
        if (cancelCategoryBtn) {
            cancelCategoryBtn.addEventListener("click", function () {
                toggleInlinePanel("category-tax-new-panel", false);
                clearCategoryPanel();
            });
        }
        if (saveCategoryBtn) {
            saveCategoryBtn.addEventListener("click", saveNewCategory);
        }

        if (addTaxBtn) {
            addTaxBtn.addEventListener("click", function () {
                toggleInlinePanel("category-tax-new-tax-panel", true, "category-tax-new-key");
                toggleInlinePanel("category-tax-new-panel", false);
            });
        }
        if (cancelTaxBtn) {
            cancelTaxBtn.addEventListener("click", function () {
                toggleInlinePanel("category-tax-new-tax-panel", false);
                clearTaxPanel();
            });
        }
        if (saveTaxBtn) {
            saveTaxBtn.addEventListener("click", saveNewTax);
        }
    }

    return { init: init };
})();
