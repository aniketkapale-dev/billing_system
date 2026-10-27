var InventoryMultiSelect = (function () {
    "use strict";

    var wiredDocument = false;

    function parseIds(value) {
        if (!value) return [];
        if (Array.isArray(value)) {
            return value.map(String).filter(Boolean);
        }
        return String(value)
            .split(",")
            .map(function (part) { return part.trim(); })
            .filter(Boolean);
    }

    function normalizeIds(ids) {
        var seen = {};
        return parseIds(ids).filter(function (id) {
            if (seen[id]) return false;
            seen[id] = true;
            return true;
        });
    }

    function getConfig(root) {
        return root && root._multiSelectConfig ? root._multiSelectConfig : null;
    }

    function getSelected(root) {
        if (!root) return [];
        var hidden = root.querySelector(".inv-multi-select-values");
        return hidden ? normalizeIds(hidden.value) : [];
    }

    function formatLabel(selectedIds, config) {
        if (!selectedIds.length) {
            return config.placeholder || "Select...";
        }
        var labels = selectedIds.map(function (id) {
            var option = config.options.find(function (item) {
                return String(item.id) === String(id);
            });
            return option ? config.labelFn(option) : "";
        }).filter(Boolean);
        if (!labels.length) {
            return config.placeholder || "Select...";
        }
        if (labels.length <= 2) {
            return labels.join(", ");
        }
        return labels.length + " selected";
    }

    function renderMenu(root, config, selectedIds) {
        var menu = root.querySelector(".inv-multi-select-menu");
        if (!menu) return;

        var searchWrap = menu.querySelector(".inv-multi-select-search-wrap");
        if (!searchWrap) {
            searchWrap = document.createElement("div");
            searchWrap.className = "inv-multi-select-search-wrap";
            searchWrap.innerHTML =
                '<input type="search" class="inv-multi-select-search inv-mgmt-search" placeholder="Search..." autocomplete="off" aria-label="Search options"/>';
            menu.insertBefore(searchWrap, menu.firstChild);
            var searchInput = searchWrap.querySelector(".inv-multi-select-search");
            searchInput.addEventListener("click", function (e) {
                e.stopPropagation();
            });
            searchInput.addEventListener("input", function () {
                renderMenu(root, config, getSelected(root));
            });
            searchInput.addEventListener("keydown", function (e) {
                handleMenuArrowKeys(root, e);
            });
        }

        var query = (searchWrap.querySelector(".inv-multi-select-search").value || "").trim().toLowerCase();
        var optionsHost = menu.querySelector(".inv-multi-select-options");
        if (!optionsHost) {
            optionsHost = document.createElement("div");
            optionsHost.className = "inv-multi-select-options";
            menu.appendChild(optionsHost);
        }

        if (!config.options.length) {
            optionsHost.innerHTML = '<div class="inv-multi-select-empty">No options available</div>';
            return;
        }

        var visibleCount = 0;
        optionsHost.innerHTML = config.options.map(function (option) {
            var id = String(option.id);
            var labelText = config.labelFn(option).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
            if (query && labelText.toLowerCase().indexOf(query) === -1) return "";
            visibleCount += 1;
            var checked = selectedIds.indexOf(id) !== -1;
            return (
                '<label class="inv-multi-select-option">' +
                '<input type="checkbox" value="' + InventoryApi.escapeHtml(id) + '"' +
                (checked ? " checked" : "") + "/>" +
                '<span class="inv-multi-select-check" aria-hidden="true"></span>' +
                '<span class="inv-multi-select-option-label">' + config.labelFn(option) + "</span>" +
                "</label>"
            );
        }).join("");

        if (!visibleCount) {
            optionsHost.innerHTML = '<div class="inv-multi-select-empty">No matches found</div>';
            return;
        }
        highlightInitialMultiOption(optionsHost);
    }

    function multiOptions(root) {
        if (!root) return [];
        return Array.prototype.slice.call(root.querySelectorAll(".inv-multi-select-option"));
    }

    function highlightMultiOption(root, option) {
        multiOptions(root).forEach(function (item) {
            item.classList.toggle("is-highlighted", item === option);
        });
        if (option && typeof option.scrollIntoView === "function") {
            option.scrollIntoView({ block: "nearest" });
        }
        var input = option ? option.querySelector("input") : null;
        if (input) root.dataset.multiHighlight = input.value;
    }

    function highlightInitialMultiOption(optionsHost) {
        var root = optionsHost.closest(".inv-multi-select");
        var options = multiOptions(root);
        if (!options.length) return;
        var saved = root.dataset.multiHighlight || "";
        var match = saved
            ? options.find(function (option) {
                var input = option.querySelector("input");
                return input && String(input.value) === String(saved);
            })
            : null;
        if (match) {
            highlightMultiOption(root, match);
            return;
        }
        var checked = options.find(function (option) {
            var input = option.querySelector("input");
            return input && input.checked;
        });
        highlightMultiOption(root, checked || options[0]);
    }

    function moveMultiHighlight(root, delta) {
        var options = multiOptions(root);
        if (!options.length) return;
        var current = -1;
        options.forEach(function (option, index) {
            if (option.classList.contains("is-highlighted")) current = index;
        });
        var nextIndex = current < 0
            ? (delta > 0 ? 0 : options.length - 1)
            : (current + delta + options.length) % options.length;
        highlightMultiOption(root, options[nextIndex]);
    }

    function toggleHighlightedMultiOption(root) {
        var option = root.querySelector(".inv-multi-select-option.is-highlighted");
        var input = option ? option.querySelector("input") : null;
        if (!input) return;
        input.checked = !input.checked;
        input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function handleMenuArrowKeys(root, e) {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            moveMultiHighlight(root, 1);
            return;
        }
        if (e.key === "ArrowUp") {
            e.preventDefault();
            moveMultiHighlight(root, -1);
            return;
        }
        if (e.key === "Enter") {
            e.preventDefault();
            toggleHighlightedMultiOption(root);
        }
    }

    function updateDisplay(root, selectedIds, silent) {
        var config = getConfig(root);
        if (!config) return;

        selectedIds = normalizeIds(selectedIds);
        var hidden = root.querySelector(".inv-multi-select-values");
        var labelEl = root.querySelector(".inv-multi-select-label");
        if (hidden) hidden.value = selectedIds.join(",");
        if (labelEl) labelEl.textContent = formatLabel(selectedIds, config);
        renderMenu(root, config, selectedIds);
        if (!silent && typeof config.onChange === "function") {
            config.onChange(selectedIds.slice());
        }
    }

    function positionMenu(root) {
        var trigger = root.querySelector(".inv-multi-select-trigger");
        var menu = root.querySelector(".inv-multi-select-menu");
        if (!trigger || !menu) return;

        menu.classList.remove("inv-hidden");
        var rect = trigger.getBoundingClientRect();
        var gap = 4;
        var maxMenuHeight = 220;
        var spaceBelow = window.innerHeight - rect.bottom - gap;
        var spaceAbove = rect.top - gap;
        var openUp = spaceBelow < 120 && spaceAbove > spaceBelow;

        menu.style.position = "fixed";
        menu.style.left = rect.left + "px";
        menu.style.width = rect.width + "px";
        menu.style.right = "auto";
        menu.style.zIndex = "10050";

        if (openUp) {
            var height = Math.min(maxMenuHeight, Math.max(spaceAbove, 80));
            menu.style.top = "auto";
            menu.style.bottom = (window.innerHeight - rect.top + gap) + "px";
            menu.style.maxHeight = height + "px";
        } else {
            var heightDown = Math.min(maxMenuHeight, Math.max(spaceBelow, 80));
            menu.style.top = (rect.bottom + gap) + "px";
            menu.style.bottom = "auto";
            menu.style.maxHeight = heightDown + "px";
        }
    }

    function resetMenuPosition(root) {
        var menu = root.querySelector(".inv-multi-select-menu");
        if (!menu) return;
        menu.style.position = "";
        menu.style.top = "";
        menu.style.bottom = "";
        menu.style.left = "";
        menu.style.width = "";
        menu.style.right = "";
        menu.style.zIndex = "";
        menu.style.maxHeight = "";
    }

    function repositionOpenMenus() {
        document.querySelectorAll(".inv-multi-select.is-open").forEach(function (root) {
            positionMenu(root);
        });
    }

    function close(root) {
        if (!root) return;
        root.classList.remove("is-open");
        var menu = root.querySelector(".inv-multi-select-menu");
        if (menu) menu.classList.add("inv-hidden");
        resetMenuPosition(root);
    }

    function closeAll(except) {
        document.querySelectorAll(".inv-multi-select.is-open").forEach(function (root) {
            if (except && root === except) return;
            close(root);
        });
    }

    function open(root) {
        closeAll(root);
        root.classList.add("is-open");
        var menu = root.querySelector(".inv-multi-select-menu");
        if (menu) menu.classList.remove("inv-hidden");
        var searchInput = root.querySelector(".inv-multi-select-search");
        if (searchInput) {
            searchInput.value = "";
        }
        positionMenu(root);
        var config = getConfig(root);
        if (config) {
            renderMenu(root, config, getSelected(root));
        }
        if (searchInput) {
            searchInput.focus();
        }
    }

    function wireDocument() {
        if (wiredDocument) return;
        wiredDocument = true;
        document.addEventListener("click", function () {
            closeAll();
        });
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") closeAll();
        });
        window.addEventListener("resize", repositionOpenMenus);
        window.addEventListener("scroll", repositionOpenMenus, true);
    }

    function init(root, config) {
        if (!root || !config) return;
        wireDocument();

        root._multiSelectConfig = {
            options: config.options || [],
            placeholder: config.placeholder || "Select...",
            labelFn: config.labelFn || function (item) { return String(item.label || item.id || ""); },
            onChange: config.onChange || null
        };

        if (root.dataset.multiSelectWired === "1") {
            setSelected(root, config.selectedIds || [], true);
            return;
        }
        root.dataset.multiSelectWired = "1";

        var trigger = root.querySelector(".inv-multi-select-trigger");
        var menu = root.querySelector(".inv-multi-select-menu");

        if (trigger) {
            trigger.addEventListener("click", function (e) {
                e.stopPropagation();
                if (root.classList.contains("is-open")) {
                    close(root);
                } else {
                    open(root);
                }
            });
            trigger.addEventListener("keydown", function (e) {
                if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                if (!root.classList.contains("is-open")) {
                    open(root);
                    return;
                }
                if (e.key === "ArrowDown") moveMultiHighlight(root, 1);
                if (e.key === "ArrowUp") moveMultiHighlight(root, -1);
                if (e.key === "Enter") toggleHighlightedMultiOption(root);
            });
        }

        if (menu) {
            menu.addEventListener("click", function (e) {
                e.stopPropagation();
            });
            menu.addEventListener("mousemove", function (e) {
                var option = e.target.closest(".inv-multi-select-option");
                if (!option) return;
                highlightMultiOption(root, option);
            });
            menu.addEventListener("change", function (e) {
                var checkbox = e.target;
                if (!checkbox || checkbox.type !== "checkbox") return;
                var selected = getSelected(root);
                var id = String(checkbox.value);
                if (checkbox.checked) {
                    if (selected.indexOf(id) === -1) selected.push(id);
                } else {
                    selected = selected.filter(function (value) {
                        return value !== id;
                    });
                }
                updateDisplay(root, selected, false);
            });
        }

        setSelected(root, config.selectedIds || [], true);
    }

    function setSelected(root, selectedIds, silent) {
        if (!root) return;
        updateDisplay(root, selectedIds, silent);
    }

    function refresh(root, options, selectedIds) {
        var config = getConfig(root);
        if (!config) return;
        config.options = options || [];
        var current = selectedIds !== undefined ? selectedIds : getSelected(root);
        updateDisplay(root, current, true);
    }

    return {
        init: init,
        refresh: refresh,
        setSelected: setSelected,
        getSelected: getSelected,
        parseIds: parseIds,
        closeAll: closeAll
    };
})();
