var InventorySettingsInvoice = (function () {
    "use strict";

    var API = "/api/settings/invoice-settings";
    var LIST_PANEL = "settings-invoice-list-panel";
    var FORM_PANEL = "settings-invoice-form-panel";
    var PAGINATION_ID = "settings-invoice-pagination";
    var currentPage = 1;
    var editingId = null;
    var qrFile = null;
    var clearQr = false;

    function request(path, opts) {
        return InventoryApi.request(API, path, opts);
    }

    function buildQuery(page) {
        var params = new URLSearchParams();
        params.set("page", String(page || 1));
        params.set("page_size", String(InventoryPagination.getPageSize(PAGINATION_ID)));
        params.set("ordering", "-year");
        return "?" + params.toString();
    }

    function displayText(value) {
        if (value === null || value === undefined || String(value).trim() === "") return "—";
        return InventoryApi.escapeHtml(String(value));
    }

    function renderRows(items) {
        var tbody = document.getElementById("settings-invoice-table-body");
        if (!tbody) return;

        if (!items || !items.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="inv-mgmt-empty">No invoice settings yet. Add one to get started.</td></tr>';
            return;
        }

        tbody.innerHTML = items.map(function (item) {
            return (
                "<tr>" +
                '<td class="inv-mgmt-cell--num"><strong>' + displayText(item.year) + "</strong></td>" +
                "<td>" + displayText(item.prefix) + "</td>" +
                "<td>" + displayText(item.suffix) + "</td>" +
                '<td class="inv-mgmt-cell--num">' + displayText(item.counter) + "</td>" +
                '<td class="inv-mgmt-cell--num">' + displayText(item.current_counter) + "</td>" +
                "<td>" + displayText(item.end_counter) + "</td>" +
                '<td class="inv-mgmt-cell--action"><div class="inv-row-actions">' +
                '<button type="button" class="inv-row-action-btn inv-row-action-btn--edit" data-invoice-edit="' + item.id + '" title="Edit" aria-label="Edit">' +
                '<span class="material-symbols-outlined">edit</span></button>' +
                '<button type="button" class="inv-row-action-btn inv-row-action-btn--delete" data-invoice-delete="' + item.id + '" title="Delete" aria-label="Delete">' +
                '<span class="material-symbols-outlined">delete</span></button>' +
                "</div></td></tr>"
            );
        }).join("");
    }

    function loadSettings(page) {
        currentPage = page || 1;
        InventoryLoader.show();

        return request(buildQuery(currentPage))
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    renderRows(body.data.items || []);
                    InventoryPagination.render(PAGINATION_ID, body.data.pagination, loadSettings, {
                        onPageSizeChange: function () {
                            loadSettings(1);
                        }
                    });
                } else {
                    renderRows([]);
                    InventoryPagination.render(PAGINATION_ID, null, function () {});
                    InventoryToast.error(body.message || "Failed to load invoice settings.");
                }
            })
            .catch(function () {
                renderRows([]);
                InventoryToast.error("Network error while loading invoice settings.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function getTermsEditor() {
        return document.getElementById("settings-invoice-terms");
    }

    function getTermsValue() {
        var editor = getTermsEditor();
        if (!editor || !window.InventoryTermsHtml) return "";
        return InventoryTermsHtml.normalizeEditorHtml(editor);
    }

    function resetTermsEditor() {
        var editor = getTermsEditor();
        if (!editor) return;
        editor.innerHTML = "";
    }

    function setTermsEditorValue(value) {
        var editor = getTermsEditor();
        if (!editor || !window.InventoryTermsHtml) return;
        InventoryTermsHtml.setEditorContent(editor, value || "");
    }

    function initTermsEditor() {
        var editor = getTermsEditor();
        var boldBtn = document.getElementById("settings-invoice-terms-bold");
        if (!editor || !window.InventoryTermsHtml || initTermsEditor._wired) return;
        initTermsEditor._wired = true;

        editor.addEventListener("focus", function () {
            InventoryTermsHtml.ensureEditorList(editor);
        });

        editor.addEventListener("keydown", function (e) {
            if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === "b") {
                e.preventDefault();
                InventoryTermsHtml.ensureEditorList(editor);
                document.execCommand("bold");
            }
        });

        editor.addEventListener("paste", function (e) {
            e.preventDefault();
            var text = (e.clipboardData || window.clipboardData).getData("text/plain");
            document.execCommand("insertText", false, text);
        });

        if (boldBtn) {
            boldBtn.addEventListener("click", function (e) {
                e.preventDefault();
                InventoryTermsHtml.ensureEditorList(editor);
                editor.focus();
                document.execCommand("bold");
            });
        }
    }

    function setQrPreview(url) {
        var preview = document.getElementById("settings-invoice-qr-preview");
        var clearBtn = document.getElementById("settings-invoice-qr-clear");
        if (!preview) return;

        if (url) {
            preview.innerHTML = '<img src="' + InventoryApi.escapeHtml(url) + '" alt="Invoice QR code"/>';
            preview.setAttribute("aria-hidden", "false");
            if (clearBtn) clearBtn.classList.remove("inv-hidden");
        } else {
            preview.innerHTML = '<span class="material-symbols-outlined">qr_code_2</span>';
            preview.setAttribute("aria-hidden", "true");
            if (clearBtn) clearBtn.classList.add("inv-hidden");
        }
    }

    function resetQrState() {
        qrFile = null;
        clearQr = false;
        var input = document.getElementById("settings-invoice-qr");
        if (input) input.value = "";
        setQrPreview(null);
    }

    function openForm(isEdit) {
        var title = document.getElementById("settings-invoice-form-title");
        if (!title) return;

        if (!isEdit) {
            editingId = null;
            document.getElementById("settings-invoice-year").value = String(new Date().getFullYear());
            document.getElementById("settings-invoice-prefix").value = "";
            document.getElementById("settings-invoice-suffix").value = "";
            document.getElementById("settings-invoice-start-counter").value = "1";
            document.getElementById("settings-invoice-end-counter").value = "";
            resetTermsEditor();
            resetQrState();
            title.textContent = "Add Invoice Setting";
        } else {
            title.textContent = "Edit Invoice Setting";
        }

        InventoryPagePanel.showPanel(LIST_PANEL, FORM_PANEL);
        document.getElementById("settings-invoice-year").focus();
    }

    function closeForm() {
        editingId = null;
        resetTermsEditor();
        resetQrState();
        InventoryPagePanel.showList(LIST_PANEL);
    }

    function collectPayload() {
        var payload = {
            year: document.getElementById("settings-invoice-year").value.trim(),
            prefix: document.getElementById("settings-invoice-prefix").value.trim(),
            suffix: document.getElementById("settings-invoice-suffix").value.trim(),
            counter: document.getElementById("settings-invoice-start-counter").value.trim(),
            end_counter: document.getElementById("settings-invoice-end-counter").value.trim() || null,
            terms_conditions: getTermsValue()
        };

        if (qrFile || clearQr) {
            var formData = new FormData();
            formData.append("year", payload.year);
            formData.append("prefix", payload.prefix);
            formData.append("suffix", payload.suffix);
            formData.append("counter", payload.counter);
            if (payload.end_counter) formData.append("end_counter", payload.end_counter);
            formData.append("terms_conditions", payload.terms_conditions);
            if (qrFile) formData.append("qr_image", qrFile);
            if (clearQr) formData.append("clear_qr", "true");
            return formData;
        }

        return payload;
    }

    function validatePayload(payload) {
        if (!payload.year) return "Year is required.";
        var year = Number(payload.year);
        if (!Number.isInteger(year) || year < 2000 || year > 2100) {
            return "Year must be between 2000 and 2100.";
        }
        if (payload.counter === "") return "Start counter is required.";
        var startCounter = Number(payload.counter);
        if (!Number.isInteger(startCounter) || startCounter < 0) {
            return "Start counter must be a whole number of 0 or more.";
        }
        return null;
    }

    function saveSetting() {
        var payload = collectPayload();
        var error = validatePayload(payload instanceof FormData ? {
            year: payload.get("year"),
            prefix: payload.get("prefix"),
            suffix: payload.get("suffix"),
            counter: payload.get("counter"),
            end_counter: payload.get("end_counter")
        } : payload);
        if (error) {
            InventoryToast.error(error);
            return;
        }

        if (!(payload instanceof FormData)) {
            payload.year = Number(payload.year);
            payload.counter = Number(payload.counter);
        }

        var btn = document.getElementById("settings-invoice-save-btn");
        InventoryLoader.button(btn, true);

        var path = editingId ? "/" + editingId + "/" : "/";
        var method = editingId ? "PATCH" : "POST";

        request(path, { method: method, body: payload })
            .then(function (body) {
                if (body && body.isSuccess) {
                    InventoryToast.success(body.message || (editingId ? "Invoice settings updated." : "Invoice settings added."));
                    closeForm();
                    loadSettings(editingId ? currentPage : 1);
                } else {
                    InventoryToast.error(body.message || "Failed to save invoice settings.");
                }
            })
            .catch(function () {
                InventoryToast.error("Network error while saving invoice settings.");
            })
            .finally(function () {
                InventoryLoader.button(btn, false);
            });
    }

    function editSetting(id) {
        InventoryLoader.show();
        request("/" + id + "/")
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    editingId = id;
                    document.getElementById("settings-invoice-year").value = body.data.year || "";
                    document.getElementById("settings-invoice-prefix").value = body.data.prefix || "";
                    document.getElementById("settings-invoice-suffix").value = body.data.suffix || "";
                    document.getElementById("settings-invoice-start-counter").value = body.data.counter != null ? body.data.counter : "1";
                    document.getElementById("settings-invoice-end-counter").value = body.data.end_counter || "";
                    setTermsEditorValue(body.data.terms_conditions || "");
                    qrFile = null;
                    clearQr = false;
                    var qrInput = document.getElementById("settings-invoice-qr");
                    if (qrInput) qrInput.value = "";
                    setQrPreview(body.data.qr_image_url || null);
                    openForm(true);
                } else {
                    InventoryToast.error(body.message || "Failed to load invoice settings.");
                }
            })
            .catch(function () {
                InventoryToast.error("Network error while loading invoice settings.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function deleteSetting(id) {
        InventoryConfirm.delete({
            title: "Delete invoice setting?",
            message: "This invoice setting will be removed."
        }).then(function (confirmed) {
            if (!confirmed) return;

            InventoryLoader.show();
            request("/" + id + "/", { method: "DELETE" })
                .then(function (body) {
                    if (body && body.isSuccess) {
                        InventoryToast.success(body.message || "Invoice setting deleted.");
                        loadSettings(currentPage);
                    } else {
                        InventoryToast.error(body.message || "Failed to delete invoice setting.");
                    }
                })
                .catch(function () {
                    InventoryToast.error("Network error while deleting invoice settings.");
                })
                .finally(function () {
                    InventoryLoader.hide();
                });
        });
    }

    function init() {
        if (init._wired) return;

        var tableBody = document.getElementById("settings-invoice-table-body");
        if (!tableBody) return;

        init._wired = true;

        var addBtn = document.getElementById("settings-invoice-add-btn");
        var saveBtn = document.getElementById("settings-invoice-save-btn");

        if (window.InventoryPagePanel) {
            InventoryPagePanel.init();
        }

        initTermsEditor();

        if (addBtn) {
            addBtn.addEventListener("click", function () {
                if (!InventoryBusiness.getActiveId()) {
                    InventoryToast.error("Select or create a business first.");
                    return;
                }
                openForm(false);
            });
        }

        if (saveBtn) saveBtn.addEventListener("click", saveSetting);

        var qrInput = document.getElementById("settings-invoice-qr");
        var qrClearBtn = document.getElementById("settings-invoice-qr-clear");
        if (qrInput) {
            qrInput.addEventListener("change", function () {
                var file = qrInput.files && qrInput.files[0] ? qrInput.files[0] : null;
                if (!file) return;
                qrFile = file;
                clearQr = false;
                setQrPreview(URL.createObjectURL(file));
            });
        }
        if (qrClearBtn) {
            qrClearBtn.addEventListener("click", function () {
                qrFile = null;
                clearQr = true;
                if (qrInput) qrInput.value = "";
                setQrPreview(null);
            });
        }

        tableBody.addEventListener("click", function (e) {
            var editBtn = e.target.closest("[data-invoice-edit]");
            var deleteBtn = e.target.closest("[data-invoice-delete]");
            if (editBtn) {
                editSetting(editBtn.getAttribute("data-invoice-edit"));
            } else if (deleteBtn) {
                deleteSetting(deleteBtn.getAttribute("data-invoice-delete"));
            }
        });

        InventoryBusiness.whenReady(function () {
            if (!InventoryBusiness.getActiveId()) return;
            loadSettings(1);
            if (window.InventorySidebar && InventorySidebar.consumeAddAction()) {
                openForm(false);
            }
        });

        window.addEventListener("inventory:business-changed", function () {
            closeForm();
            if (InventoryBusiness.getActiveId()) loadSettings(1);
            else renderRows([]);
        });
    }

    return { init: init };
})();
