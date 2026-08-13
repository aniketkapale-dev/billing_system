/**
 * Sidebar and quick-access visibility based on business tab permissions.
 */
var InventoryNavAccess = (function () {
    "use strict";

    var API = "/api/business-users/my-access/";
    var access = null;

    function fetchAccess() {
        if (!InventoryBusiness.getActiveId()) {
            access = null;
            applyAccess();
            return Promise.resolve(null);
        }
        return InventoryApi.request(API, "", { skipBusiness: false })
            .then(function (body) {
                access = body && body.isSuccess ? body.data : null;
                applyAccess();
                return access;
            })
            .catch(function () {
                access = null;
                applyAccess();
                return null;
            });
    }

    function canViewTab(tabCode) {
        if (!access) return true;
        if (access.is_owner) return true;
        return (access.allowed_tabs || []).indexOf(tabCode) !== -1;
    }

    function applyAccess() {
        document.querySelectorAll("[data-nav-tab]").forEach(function (el) {
            var tab = el.getAttribute("data-nav-tab");
            var allowed = canViewTab(tab);
            el.classList.toggle("inv-hidden", !allowed);
        });

        document.querySelectorAll(".inv-nav-group[data-nav-group]").forEach(function (group) {
            var tabs = (group.getAttribute("data-nav-group") || "").split(/\s+/).filter(Boolean);
            var visible = !access || access.is_owner || tabs.some(canViewTab);
            group.classList.toggle("inv-hidden", !visible);
        });

        var addBusinessBtn = document.querySelector('[data-add-action="business"]');
        if (addBusinessBtn) {
            var owner = !access || access.is_owner;
            addBusinessBtn.classList.toggle("inv-hidden", !owner);
        }

        var emptyAddBtn = document.getElementById("inv-business-empty-add-btn");
        if (emptyAddBtn) {
            var showOwnerActions = !access || access.is_owner;
            emptyAddBtn.classList.toggle("inv-hidden", !showOwnerActions);
        }

        var businessAddBtn = document.getElementById("inv-business-add-btn");
        if (businessAddBtn) {
            businessAddBtn.classList.toggle("inv-hidden", access && !access.is_owner);
        }

        window.dispatchEvent(new CustomEvent("inventory:nav-access-changed", { detail: access }));
    }

    function init() {
        window.addEventListener("inventory:business-changed", function () {
            fetchAccess();
        });
        if (InventoryBusiness.whenReady) {
            InventoryBusiness.whenReady(function () {
                fetchAccess();
            });
        }
    }

    return {
        init: init,
        refresh: fetchAccess,
        getAccess: function () { return access; },
        isOwner: function () { return !!(access && access.is_owner); },
        canViewTab: canViewTab
    };
})();
