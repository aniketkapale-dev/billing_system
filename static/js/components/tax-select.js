var InventoryTaxSelect = (function () {
    "use strict";

    function label(tax) {
        return tax.key + " (" + tax.value + "%)";
    }

    function html(rootClass, placeholder) {
        rootClass = rootClass || "inv-item-tax-select";
        return (
            '<div class="inv-multi-select ' + rootClass + '">' +
            '<button type="button" class="inv-multi-select-trigger" aria-haspopup="listbox">' +
            '<span class="inv-multi-select-label">' + InventoryApi.escapeHtml(placeholder || "No Tax") + "</span>" +
            '<span class="material-symbols-outlined inv-multi-select-icon">expand_more</span>' +
            "</button>" +
            '<div class="inv-multi-select-menu inv-hidden" role="listbox"></div>' +
            '<input type="hidden" class="inv-multi-select-values" value=""/>' +
            "</div>"
        );
    }

    function init(root, config) {
        if (!root || !window.InventoryMultiSelect) return;

        InventoryMultiSelect.init(root, {
            options: config.taxes || [],
            selectedIds: config.selectedIds || [],
            placeholder: config.placeholder || "No Tax",
            labelFn: function (tax) {
                return InventoryApi.escapeHtml(label(tax));
            },
            onChange: config.onChange || null
        });
    }

    function getSelected(root) {
        if (!root || !window.InventoryMultiSelect) return [];
        return InventoryMultiSelect.getSelected(root);
    }

    function setSelected(root, selectedIds, silent) {
        if (!root || !window.InventoryMultiSelect) return;
        InventoryMultiSelect.setSelected(root, selectedIds || [], silent !== false);
    }

    function refresh(root, taxes, selectedIds) {
        if (!root || !window.InventoryMultiSelect) return;
        InventoryMultiSelect.refresh(root, taxes, selectedIds);
    }

    function getCombinedRate(taxes, selectedIds) {
        var ids = window.InventoryMultiSelect
            ? InventoryMultiSelect.parseIds(selectedIds)
            : [];
        return ids.reduce(function (sum, id) {
            var tax = (taxes || []).find(function (item) {
                return String(item.id) === String(id);
            });
            return sum + (tax ? Number(tax.value || 0) : 0);
        }, 0);
    }

    function refreshAll(selector, taxes) {
        document.querySelectorAll(selector).forEach(function (root) {
            refresh(root, taxes, getSelected(root));
        });
    }

    return {
        label: label,
        html: html,
        init: init,
        getSelected: getSelected,
        setSelected: setSelected,
        refresh: refresh,
        refreshAll: refreshAll,
        getCombinedRate: getCombinedRate
    };
})();
