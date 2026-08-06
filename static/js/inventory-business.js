/**
 * Active business context for multi-business inventory management.
 */
var InventoryBusiness = (function () {
    "use strict";

    var API = "/api/businesses";
    var STORAGE_KEY = "vrms_active_business_id";
    var businesses = [];
    var readyPromise = null;

    function getActiveId() {
        return localStorage.getItem(STORAGE_KEY);
    }

    function setActiveId(id) {
        if (id == null || id === "") {
            localStorage.removeItem(STORAGE_KEY);
            return;
        }
        localStorage.setItem(STORAGE_KEY, String(id));
    }

    function getActiveBusiness() {
        var activeId = getActiveId();
        if (!activeId) return null;
        return businesses.find(function (item) {
            return String(item.id) === String(activeId);
        }) || null;
    }

    function escapeHtml(str) {
        var div = document.createElement("div");
        div.textContent = str == null ? "" : String(str);
        return div.innerHTML;
    }

    function notifyChange() {
        window.dispatchEvent(new CustomEvent("inventory:business-changed", {
            detail: { business: getActiveBusiness() }
        }));
    }

    function renderSelector() {
        var select = document.getElementById("inv-business-select");
        if (!select) return;

        if (!businesses.length) {
            select.innerHTML = '<option value="">No business yet</option>';
            select.disabled = true;
            return;
        }

        select.disabled = false;
        select.innerHTML = businesses.map(function (item) {
            var selected = String(item.id) === String(getActiveId()) ? " selected" : "";
            return '<option value="' + item.id + '"' + selected + ">" +
                escapeHtml(item.name) + "</option>";
        }).join("");
    }

    function toggleEmptyState(show) {
        var banner = document.getElementById("inv-business-empty");
        if (banner) {
            banner.classList.toggle("inv-hidden", !show);
        }
    }

    function selectBusiness(id, notify) {
        if (notify === undefined) notify = true;
        setActiveId(id);
        renderSelector();
        toggleEmptyState(false);
        if (notify) notifyChange();
    }

    function loadBusinesses() {
        return InventoryApi.request(API, "?page_size=100", { skipBusiness: true })
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    businesses = body.data.items || [];
                    renderSelector();
                    if (!businesses.length) {
                        setActiveId(null);
                        toggleEmptyState(true);
                        return;
                    }
                    toggleEmptyState(false);
                    var activeId = getActiveId();
                    var exists = businesses.some(function (item) {
                        return String(item.id) === String(activeId);
                    });
                    if (!exists) {
                        selectBusiness(businesses[0].id, false);
                    }
                    return;
                }
                businesses = [];
                renderSelector();
                toggleEmptyState(true);
                InventoryToast.error(body && body.message ? body.message : "Failed to load businesses.");
            })
            .catch(function () {
                businesses = [];
                renderSelector();
                toggleEmptyState(true);
                InventoryToast.error("Network error while loading businesses.");
            });
    }

    function saveBusiness() {
        var nameInput = document.getElementById("business-name");
        var saveBtn = document.getElementById("business-save-btn");
        var name = nameInput ? nameInput.value.trim() : "";
        if (!name) {
            InventoryToast.error("Business name is required.");
            return;
        }

        InventoryLoader.button(saveBtn, true, "Saving...");
        return InventoryApi.request(API, "", {
            method: "POST",
            skipBusiness: true,
            body: { name: name }
        })
            .then(function (body) {
                if (body && body.isSuccess) {
                    InventoryToast.success("Business created.");
                    if (nameInput) nameInput.value = "";
                    InventoryModal.close("business-modal");
                    return loadBusinesses().then(function () {
                        if (body.data && body.data.id) {
                            selectBusiness(body.data.id);
                        } else if (businesses.length) {
                            selectBusiness(businesses[0].id);
                        }
                    });
                }
                InventoryToast.error(body.message || "Unable to create business.");
            })
            .catch(function () {
                InventoryToast.error("Network error. Please try again.");
            })
            .finally(function () {
                InventoryLoader.button(saveBtn, false);
            });
    }

    function wireUi() {
        var select = document.getElementById("inv-business-select");
        var addBtn = document.getElementById("inv-business-add-btn");
        var saveBtn = document.getElementById("business-save-btn");

        if (select) {
            select.addEventListener("change", function () {
                if (!select.value) return;
                selectBusiness(select.value);
            });
        }

        if (addBtn) {
            addBtn.addEventListener("click", function () {
                InventoryModal.open("business-modal");
                var input = document.getElementById("business-name");
                if (input) input.focus();
            });
        }

        if (saveBtn) {
            saveBtn.addEventListener("click", saveBusiness);
        }

        InventoryModal.wire("business-modal");
    }

    function init() {
        if (!readyPromise) {
            wireUi();
            readyPromise = loadBusinesses().then(function () {
                notifyChange();
            });
        }
        return readyPromise;
    }

    function whenReady(callback) {
        init().then(function () {
            if (typeof callback === "function") callback(getActiveBusiness());
        });
    }

    return {
        init: init,
        whenReady: whenReady,
        getActiveId: getActiveId,
        getActiveBusiness: getActiveBusiness,
        reload: loadBusinesses
    };
})();
