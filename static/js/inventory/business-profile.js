var InventoryBusinessProfile = (function () {
    "use strict";

    var API = "/api/businesses";
    var currentBusiness = null;
    var logoFile = null;
    var clearLogo = false;
    var previewBlobUrl = null;

    function request(path, opts) {
        return InventoryApi.request(API, path, opts);
    }

    function formatDateParts(value) {
        if (!value) {
            return { date: "—", time: "—" };
        }
        var parsed = new Date(value);
        if (isNaN(parsed.getTime())) {
            return { date: "—", time: "—" };
        }
        return {
            date: parsed.toLocaleDateString(undefined, {
                day: "numeric",
                month: "long",
                year: "numeric"
            }),
            time: parsed.toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
                second: "2-digit"
            })
        };
    }

    function setMetaDate(prefix, value) {
        var parts = formatDateParts(value);
        var dateEl = document.getElementById(prefix + "-date");
        var timeEl = document.getElementById(prefix + "-time");
        if (dateEl) dateEl.textContent = parts.date;
        if (timeEl) timeEl.textContent = parts.time;
    }

    function togglePanels(hasBusiness) {
        var empty = document.getElementById("business-profile-empty");
        var panel = document.getElementById("business-profile-panel");

        if (empty) empty.classList.toggle("inv-hidden", hasBusiness);
        if (panel) panel.classList.toggle("inv-hidden", !hasBusiness);

        if (window.InventoryBusinessUsers && typeof InventoryBusinessUsers.syncUi === "function") {
            InventoryBusinessUsers.syncUi({ hasBusiness: hasBusiness });
        }
    }

    function revokePreviewBlob() {
        if (previewBlobUrl) {
            URL.revokeObjectURL(previewBlobUrl);
            previewBlobUrl = null;
        }
    }

    function setLogoPreview(url) {
        var preview = document.getElementById("business-profile-logo-preview");
        var clearBtn = document.getElementById("business-profile-logo-clear");
        if (!preview) return;

        if (url) {
            preview.innerHTML = '<img src="' + InventoryApi.escapeHtml(url) + '" alt="Business logo"/>';
            if (clearBtn) clearBtn.classList.remove("inv-hidden");
            return;
        }

        preview.innerHTML = '<span class="material-symbols-outlined">storefront</span>';
        if (clearBtn) clearBtn.classList.add("inv-hidden");
    }

    function clearLogoInput() {
        logoFile = null;
        var input = document.getElementById("business-profile-logo");
        if (input) input.value = "";
    }

    function resetLogoState() {
        clearLogo = false;
        clearLogoInput();
        revokePreviewBlob();
    }

    function populateForm(business) {
        currentBusiness = business;
        document.getElementById("business-profile-name").value = business.business_name || "";
        document.getElementById("business-profile-gst").value = business.gst_number || "";
        document.getElementById("business-profile-phone").value = business.phone || "";
        document.getElementById("business-profile-email").value = business.email || "";
        document.getElementById("business-profile-address").value = business.address || "";
        document.getElementById("business-profile-owner").textContent = business.owner_name || "—";
        setMetaDate("business-profile-created", business.created_at);
        setMetaDate("business-profile-updated", business.updated_at);

        resetLogoState();
        setLogoPreview(business.logo_url || null);
        togglePanels(true);
        window.dispatchEvent(new CustomEvent("inventory:business-profile-loaded"));
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

        var phone = document.getElementById("business-profile-phone").value.trim();
        if (phone && (!window.InventoryAuth || !InventoryAuth.isValidMobile(phone))) {
            InventoryToast.error("Enter a valid 10-digit mobile number.");
            var phoneInput = document.getElementById("business-profile-phone");
            if (phoneInput) phoneInput.focus();
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
                clearLogo = false;
                revokePreviewBlob();
                logoFile = file;
                previewBlobUrl = URL.createObjectURL(file);
                setLogoPreview(previewBlobUrl);
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener("click", function () {
                clearLogo = true;
                clearLogoInput();
                revokePreviewBlob();
                setLogoPreview(null);
            });
        }

        if (emptyAddBtn) {
            emptyAddBtn.addEventListener("click", function () {
                var addBtn = document.getElementById("inv-business-add-btn");
                if (addBtn) addBtn.click();
            });
        }

        if (window.InventoryAuth && typeof InventoryAuth.wireMobileInput === "function") {
            InventoryAuth.wireMobileInput(document.getElementById("business-profile-phone"));
        }

        InventoryBusiness.whenReady(loadActiveBusiness);
        window.addEventListener("inventory:business-changed", loadActiveBusiness);
        window.addEventListener("inventory:nav-access-changed", function () {
            togglePanels(!!currentBusiness);
        });
    }

    return { init: init, loadActiveBusiness: loadActiveBusiness };
})();
