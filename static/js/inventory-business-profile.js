var InventoryBusinessProfile = (function () {
    "use strict";

    var API = "/api/businesses";
    var currentBusiness = null;
    var logoFile = null;
    var clearLogo = false;

    function request(path, opts) {
        return InventoryApi.request(API, path, opts);
    }

    function formatDate(value) {
        if (!value) return "—";
        var date = new Date(value);
        if (isNaN(date.getTime())) return "—";
        return date.toLocaleString();
    }

    function togglePanels(hasBusiness) {
        var empty = document.getElementById("business-profile-empty");
        var panel = document.getElementById("business-profile-panel");
        if (empty) empty.classList.toggle("inv-hidden", hasBusiness);
        if (panel) panel.classList.toggle("inv-hidden", !hasBusiness);
    }

    function setLogoPreview(url) {
        var preview = document.getElementById("business-profile-logo-preview");
        var clearBtn = document.getElementById("business-profile-logo-clear");
        if (!preview) return;

        if (url) {
            preview.innerHTML = '<img src="' + InventoryApi.escapeHtml(url) + '" alt="Business logo"/>';
            if (clearBtn) clearBtn.classList.remove("inv-hidden");
        } else {
            preview.innerHTML = '<span class="material-symbols-outlined">storefront</span>';
            if (clearBtn) clearBtn.classList.add("inv-hidden");
        }
    }

    function resetLogoState() {
        logoFile = null;
        clearLogo = false;
        var input = document.getElementById("business-profile-logo");
        if (input) input.value = "";
    }

    function populateForm(business) {
        currentBusiness = business;
        document.getElementById("business-profile-name").value = business.business_name || "";
        document.getElementById("business-profile-gst").value = business.gst_number || "";
        document.getElementById("business-profile-phone").value = business.phone || "";
        document.getElementById("business-profile-email").value = business.email || "";
        document.getElementById("business-profile-address").value = business.address || "";
        document.getElementById("business-profile-owner").textContent = business.owner_name || "—";
        document.getElementById("business-profile-created").textContent = formatDate(business.created_at);
        document.getElementById("business-profile-updated").textContent = formatDate(business.updated_at);

        resetLogoState();
        setLogoPreview(business.logo_url || null);
        togglePanels(true);
    }

    function loadActiveBusiness() {
        var activeId = InventoryBusiness.getActiveId();
        if (!activeId) {
            currentBusiness = null;
            togglePanels(false);
            return Promise.resolve();
        }

        InventoryLoader.show();
        return request("/" + activeId + "/")
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    populateForm(body.data);
                    return;
                }
                currentBusiness = null;
                togglePanels(false);
                InventoryToast.error(body && body.message ? body.message : "Failed to load business.");
            })
            .catch(function () {
                currentBusiness = null;
                togglePanels(false);
                InventoryToast.error("Network error while loading business.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function collectPayload() {
        var businessName = document.getElementById("business-profile-name").value.trim();
        if (!businessName) {
            InventoryToast.error("Business name is required.");
            return null;
        }

        if (logoFile || clearLogo) {
            var formData = new FormData();
            formData.append("business_name", businessName);
            formData.append("gst_number", document.getElementById("business-profile-gst").value.trim());
            formData.append("phone", document.getElementById("business-profile-phone").value.trim());
            formData.append("email", document.getElementById("business-profile-email").value.trim());
            formData.append("address", document.getElementById("business-profile-address").value.trim());
            if (logoFile) formData.append("logo", logoFile);
            if (clearLogo) formData.append("clear_logo", "true");
            return formData;
        }

        return {
            business_name: businessName,
            gst_number: document.getElementById("business-profile-gst").value.trim(),
            phone: document.getElementById("business-profile-phone").value.trim(),
            email: document.getElementById("business-profile-email").value.trim(),
            address: document.getElementById("business-profile-address").value.trim()
        };
    }

    function saveBusiness(e) {
        if (e) e.preventDefault();
        if (!currentBusiness || !currentBusiness.id) {
            InventoryToast.error("No active business selected.");
            return;
        }

        var payload = collectPayload();
        if (!payload) return;

        var btn = document.getElementById("business-profile-save-btn");
        InventoryLoader.button(btn, true, "Saving...");

        request("/" + currentBusiness.id + "/", {
            method: "PATCH",
            body: payload
        })
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    InventoryToast.success("Business updated successfully.");
                    populateForm(body.data);
                    return InventoryBusiness.reload();
                }
                var err = body.message || "Unable to update business.";
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

    function init() {
        var form = document.getElementById("business-profile-form");
        var logoInput = document.getElementById("business-profile-logo");
        var clearBtn = document.getElementById("business-profile-logo-clear");
        var emptyAddBtn = document.getElementById("business-profile-empty-add-btn");

        if (form) form.addEventListener("submit", saveBusiness);

        if (logoInput) {
            logoInput.addEventListener("change", function () {
                var file = logoInput.files && logoInput.files[0] ? logoInput.files[0] : null;
                if (!file) return;
                logoFile = file;
                clearLogo = false;
                setLogoPreview(URL.createObjectURL(file));
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener("click", function () {
                logoFile = null;
                clearLogo = true;
                resetLogoState();
                setLogoPreview(null);
            });
        }

        if (emptyAddBtn) {
            emptyAddBtn.addEventListener("click", function () {
                var addBtn = document.getElementById("inv-business-add-btn");
                if (addBtn) addBtn.click();
            });
        }

        InventoryBusiness.whenReady(loadActiveBusiness);
        window.addEventListener("inventory:business-changed", loadActiveBusiness);
    }

    return { init: init, loadActiveBusiness: loadActiveBusiness };
})();
