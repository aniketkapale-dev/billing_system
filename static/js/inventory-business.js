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

    function businessLabel(item) {
        return item.business_name || item.name || "Business";
    }

    function notifyChange() {
        window.dispatchEvent(new CustomEvent("inventory:business-changed", {
            detail: { business: getActiveBusiness() }
        }));
    }

    function renderSelector() {
        var tabsEl = document.getElementById("inv-business-tabs");
        if (!tabsEl) return;

        if (!businesses.length) {
            tabsEl.innerHTML = '<span class="inv-business-tabs-empty">No business yet</span>';
            return;
        }

        var activeId = getActiveId();
        tabsEl.innerHTML = businesses.map(function (item) {
            var isActive = String(item.id) === String(activeId);
            return (
                '<button type="button" class="inv-business-tab' + (isActive ? " inv-business-tab--active" : "") + '"' +
                ' role="tab" aria-selected="' + (isActive ? "true" : "false") + '"' +
                ' data-business-id="' + item.id + '">' +
                escapeHtml(businessLabel(item)) +
                "</button>"
            );
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

    function resetBusinessForm() {
        var fields = [
            "business-name",
            "business-gst",
            "business-phone",
            "business-email",
            "business-address",
            "business-logo"
        ];
        fields.forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.value = "";
        });
    }

    function collectBusinessPayload(useFormData) {
        var businessName = document.getElementById("business-name").value.trim();
        var gst = document.getElementById("business-gst").value.trim();
        var phone = document.getElementById("business-phone").value.trim();
        var email = document.getElementById("business-email").value.trim();
        var address = document.getElementById("business-address").value.trim();
        var logoInput = document.getElementById("business-logo");
        var logoFile = logoInput && logoInput.files && logoInput.files[0] ? logoInput.files[0] : null;

        if (!businessName) {
            InventoryToast.error("Business name is required.");
            return null;
        }

        if (useFormData || logoFile) {
            var formData = new FormData();
            formData.append("business_name", businessName);
            if (gst) formData.append("gst_number", gst);
            if (phone) formData.append("phone", phone);
            if (email) formData.append("email", email);
            if (address) formData.append("address", address);
            if (logoFile) formData.append("logo", logoFile);
            return formData;
        }

        var payload = { business_name: businessName };
        if (gst) payload.gst_number = gst;
        if (phone) payload.phone = phone;
        if (email) payload.email = email;
        if (address) payload.address = address;
        return payload;
    }

    function saveBusiness() {
        var saveBtn = document.getElementById("business-save-btn");
        var logoInput = document.getElementById("business-logo");
        var hasLogo = logoInput && logoInput.files && logoInput.files.length > 0;
        var payload = collectBusinessPayload(hasLogo);
        if (!payload) return;

        InventoryLoader.button(saveBtn, true, "Saving...");
        return InventoryApi.request(API, "", {
            method: "POST",
            skipBusiness: true,
            body: payload
        })
            .then(function (body) {
                if (body && body.isSuccess) {
                    InventoryToast.success("Business created.");
                    resetBusinessForm();
                    InventoryModal.close("business-modal");
                    return loadBusinesses().then(function () {
                        if (body.data && body.data.id) {
                            selectBusiness(body.data.id);
                        } else if (businesses.length) {
                            selectBusiness(businesses[0].id);
                        }
                    });
                }
                var err = body.message || "Unable to create business.";
                if (body.errors && body.errors.length) err = body.errors.join(" • ");
                InventoryToast.error(err);
            })
            .catch(function () {
                InventoryToast.error("Network error. Please try again.");
            })
            .finally(function () {
                InventoryLoader.button(saveBtn, false);
            });
    }

    function wireUi() {
        var tabsEl = document.getElementById("inv-business-tabs");
        var addBtn = document.getElementById("inv-business-add-btn");
        var saveBtn = document.getElementById("business-save-btn");

        if (tabsEl) {
            tabsEl.addEventListener("click", function (e) {
                var tab = e.target.closest(".inv-business-tab");
                if (!tab) return;
                selectBusiness(tab.getAttribute("data-business-id"));
            });
        }

        if (addBtn) {
            addBtn.addEventListener("click", function () {
                resetBusinessForm();
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
