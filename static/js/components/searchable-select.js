/**
 * Searchable single-select dropdown for native <select> elements.
 * Keeps the native select in sync for existing form logic and validation.
 */
var InventorySearchableSelect = (function () {
    "use strict";

    var WRAP_CLASS = "inv-search-select";
    var SELECTOR = "select.inv-mgmt-select:not(.inv-pagination-size-select)";
    var wiredDocument = false;
    var domObserver = null;

    function getWrap(select) {
        if (!select) return null;
        return select.closest("." + WRAP_CLASS);
    }

    function getMenu(wrap) {
        if (!wrap) return null;
        if (wrap._searchSelectMenu) return wrap._searchSelectMenu;
        var menu = wrap.querySelector(".inv-search-select-menu");
        if (menu) wrap._searchSelectMenu = menu;
        return menu;
    }

    function isInModal(wrap) {
        if (!wrap) return false;
        var modal = wrap.closest(".inv-modal");
        return !!(modal && !modal.classList.contains("inv-hidden"));
    }

    function attachMenuForOpen(wrap) {
        var menu = getMenu(wrap);
        if (!menu) return null;
        if (isInModal(wrap)) {
            if (menu.parentNode !== document.body) {
                document.body.appendChild(menu);
            }
        } else if (menu.parentNode !== wrap) {
            wrap.appendChild(menu);
        }
        return menu;
    }

    function restoreMenuHome(wrap) {
        var menu = getMenu(wrap);
        if (!menu || !wrap) return;
        if (!isInModal(wrap) && menu.parentNode !== wrap) {
            wrap.appendChild(menu);
        }
    }

    function selectedLabel(select) {
        var option = select.options[select.selectedIndex];
        return option ? option.textContent : "";
    }

    function isPlaceholder(select) {
        var option = select.options[select.selectedIndex];
        return !option || !option.value;
    }

    function syncTriggerState(wrap) {
        var select = wrap.querySelector("select");
        var trigger = wrap.querySelector(".inv-search-select-trigger");
        if (!select || !trigger) return;

        trigger.disabled = !!select.disabled;
        var labelEl = trigger.querySelector(".inv-search-select-label");
        if (labelEl) {
            labelEl.textContent = selectedLabel(select) || "Select...";
        }
        trigger.classList.toggle("is-placeholder", isPlaceholder(select));
    }

    function renderOptions(wrap, highlightValue) {
        var select = wrap.querySelector("select");
        var menu = getMenu(wrap);
        var list = menu ? menu.querySelector(".inv-search-select-list") : null;
        var searchInput = menu ? menu.querySelector(".inv-search-select-input") : null;
        if (!select || !list) return;

        var query = searchInput ? searchInput.value.trim().toLowerCase() : "";
        var html = "";
        var visibleCount = 0;

        Array.prototype.forEach.call(select.options, function (option) {
            var label = option.textContent || "";
            if (query && label.toLowerCase().indexOf(query) === -1) return;
            visibleCount += 1;
            var value = option.value;
            var classes = ["inv-search-select-option"];
            if (!value) classes.push("is-placeholder-option");
            if (value === select.value) classes.push("is-selected");
            if (highlightValue != null && String(value) === String(highlightValue)) {
                classes.push("is-highlighted");
            }
            html +=
                '<li class="' + classes.join(" ") + '" data-value="' +
                InventoryApi.escapeHtml(value) + '" role="option" aria-selected="' +
                (value === select.value ? "true" : "false") + '">' +
                InventoryApi.escapeHtml(label) + "</li>";
        });

        if (!visibleCount) {
            html = '<li class="inv-search-select-empty">No matches found</li>';
        }

        list.innerHTML = html;
        syncTriggerState(wrap);
        highlightInitialOption(list, select.value);
    }

    function visibleOptions(list) {
        if (!list) return [];
        return Array.prototype.filter.call(
            list.querySelectorAll(".inv-search-select-option"),
            function (option) {
                return !option.classList.contains("inv-search-select-empty");
            }
        );
    }

    function highlightOption(list, option) {
        visibleOptions(list).forEach(function (item) {
            item.classList.toggle("is-highlighted", item === option);
        });
        if (option && typeof option.scrollIntoView === "function") {
            option.scrollIntoView({ block: "nearest" });
        }
    }

    function highlightInitialOption(list, selectedValue) {
        var options = visibleOptions(list);
        if (!options.length) return;
        var selected = options.find(function (option) {
            return String(option.getAttribute("data-value")) === String(selectedValue);
        });
        highlightOption(list, selected || options[0]);
    }

    function moveHighlight(list, delta) {
        var options = visibleOptions(list);
        if (!options.length) return;
        var current = -1;
        options.forEach(function (option, index) {
            if (option.classList.contains("is-highlighted")) current = index;
        });
        var nextIndex;
        if (current < 0) {
            nextIndex = delta > 0 ? 0 : options.length - 1;
        } else {
            nextIndex = (current + delta + options.length) % options.length;
        }
        highlightOption(list, options[nextIndex]);
    }

    function chooseHighlighted(wrap, list) {
        if (!list) return;
        var highlighted = list.querySelector(".inv-search-select-option.is-highlighted");
        var option = highlighted || list.querySelector(".inv-search-select-option:not(.inv-search-select-empty)");
        if (!option) return;
        choose(wrap, option.getAttribute("data-value"));
    }

    function resetMenuPosition(wrap) {
        var menu = getMenu(wrap);
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

    function positionMenu(wrap) {
        var select = wrap.querySelector("select");
        var trigger = wrap.querySelector(".inv-search-select-trigger");
        var menu = attachMenuForOpen(wrap);
        if (!trigger || !menu) return;

        menu.classList.remove("inv-hidden");
        var rect = trigger.getBoundingClientRect();
        var gap = 4;
        var maxMenuHeight = 260;
        var spaceBelow = window.innerHeight - rect.bottom - gap;
        var spaceAbove = rect.top - gap;
        var openUp = spaceBelow < 140 && spaceAbove > spaceBelow;
        var inModal = isInModal(wrap);

        var menuWidth = rect.width;
        if (select && select.classList.contains("inv-item-barcode")) {
            menuWidth = Math.max(menuWidth, 280);
        }

        menu.style.position = "fixed";
        menu.style.left = rect.left + "px";
        menu.style.width = menuWidth + "px";
        menu.style.right = "auto";
        menu.style.zIndex = inModal ? "10051" : "10050";

        if (openUp) {
            var heightUp = Math.min(maxMenuHeight, Math.max(spaceAbove, 100));
            menu.style.top = "auto";
            menu.style.bottom = (window.innerHeight - rect.top + gap) + "px";
            menu.style.maxHeight = heightUp + "px";
        } else {
            var heightDown = Math.min(maxMenuHeight, Math.max(spaceBelow, 100));
            menu.style.top = (rect.bottom + gap) + "px";
            menu.style.bottom = "auto";
            menu.style.maxHeight = heightDown + "px";
        }
    }

    function repositionOpenMenus() {
        document.querySelectorAll("." + WRAP_CLASS + ".is-open").forEach(positionMenu);
    }

    function close(wrap) {
        if (!wrap) return;
        wrap.classList.remove("is-open");
        var menu = getMenu(wrap);
        if (menu) menu.classList.add("inv-hidden");
        resetMenuPosition(wrap);
        restoreMenuHome(wrap);
    }

    function closeAll(except) {
        document.querySelectorAll("." + WRAP_CLASS + ".is-open").forEach(function (wrap) {
            if (except && wrap === except) return;
            close(wrap);
        });
    }

    function choose(wrap, value) {
        var select = wrap.querySelector("select");
        if (!select) return;
        select.value = value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        close(wrap);
        renderOptions(wrap);
    }

    function open(wrap) {
        var select = wrap.querySelector("select");
        if (!select || select.disabled) return;
        closeAll(wrap);
        wrap.classList.add("is-open");
        positionMenu(wrap);
        renderOptions(wrap);
        var menu = getMenu(wrap);
        var searchInput = menu ? menu.querySelector(".inv-search-select-input") : null;
        if (searchInput) {
            searchInput.value = "";
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

    function buildWrap(select) {
        var existing = getWrap(select);
        if (existing) return existing;

        var wrap = document.createElement("div");
        wrap.className = WRAP_CLASS;
        select.parentNode.insertBefore(wrap, select);
        wrap.appendChild(select);

        select.classList.add("inv-search-select-native");
        select.setAttribute("tabindex", "-1");
        select.setAttribute("aria-hidden", "true");

        var trigger = document.createElement("button");
        trigger.type = "button";
        trigger.className = "inv-search-select-trigger inv-mgmt-select";
        trigger.innerHTML =
            '<span class="inv-search-select-label"></span>' +
            '<span class="material-symbols-outlined inv-search-select-icon" aria-hidden="true">expand_more</span>';

        var menu = document.createElement("div");
        menu.className = "inv-search-select-menu inv-hidden";
        menu.innerHTML =
            '<div class="inv-search-select-search">' +
            '<input type="search" class="inv-search-select-input" placeholder="Search..." autocomplete="off" aria-label="Search options"/>' +
            "</div>" +
            '<ul class="inv-search-select-list" role="listbox"></ul>';

        wrap.appendChild(trigger);
        wrap.appendChild(menu);
        wrap._searchSelectMenu = menu;
        return wrap;
    }

    function wireWrap(wrap) {
        if (wrap.dataset.searchSelectWired === "1") return;
        wrap.dataset.searchSelectWired = "1";

        var select = wrap.querySelector("select");
        var trigger = wrap.querySelector(".inv-search-select-trigger");
        var menu = getMenu(wrap);
        var searchInput = menu ? menu.querySelector(".inv-search-select-input") : null;
        var list = menu ? menu.querySelector(".inv-search-select-list") : null;

        trigger.addEventListener("click", function (e) {
            e.stopPropagation();
            if (wrap.classList.contains("is-open")) {
                close(wrap);
            } else {
                open(wrap);
            }
        });

        trigger.addEventListener("keydown", function (e) {
            if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter" && e.key !== " ") {
                return;
            }
            e.preventDefault();
            var wasOpen = wrap.classList.contains("is-open");
            if (!wasOpen) {
                open(wrap);
                return;
            }
            if (e.key === "ArrowDown") moveHighlight(list, 1);
            if (e.key === "ArrowUp") moveHighlight(list, -1);
            if (e.key === "Enter") chooseHighlighted(wrap, list);
        });

        if (menu) {
            menu.addEventListener("click", function (e) {
                e.stopPropagation();
            });
        }

        if (searchInput) {
            searchInput.addEventListener("input", function () {
                renderOptions(wrap);
            });
            searchInput.addEventListener("keydown", function (e) {
                if (e.key === "ArrowDown") {
                    e.preventDefault();
                    e.stopPropagation();
                    moveHighlight(list, 1);
                    return;
                }
                if (e.key === "ArrowUp") {
                    e.preventDefault();
                    e.stopPropagation();
                    moveHighlight(list, -1);
                    return;
                }
                if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    chooseHighlighted(wrap, list);
                    return;
                }
                if (e.key === "Escape") {
                    e.preventDefault();
                    close(wrap);
                    trigger.focus();
                }
            });
        }

        if (list) {
            list.addEventListener("mousemove", function (e) {
                var option = e.target.closest(".inv-search-select-option");
                if (!option || option.classList.contains("inv-search-select-empty")) return;
                highlightOption(list, option);
            });
            list.addEventListener("click", function (e) {
                var option = e.target.closest(".inv-search-select-option");
                if (!option || option.classList.contains("inv-search-select-empty")) return;
                choose(wrap, option.getAttribute("data-value"));
            });
        }

        select.addEventListener("change", function () {
            syncTriggerState(wrap);
            renderOptions(wrap);
        });

        var observer = new MutationObserver(function () {
            syncTriggerState(wrap);
            renderOptions(wrap);
        });
        observer.observe(select, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["disabled", "value"]
        });
        wrap._searchSelectObserver = observer;

        syncTriggerState(wrap);
        renderOptions(wrap);
    }

    function enhance(select) {
        if (!select || select.tagName !== "SELECT") return;
        if (select.classList.contains("inv-search-select-native")) return;
        if (select.classList.contains("inv-pagination-size-select")) return;
        if (!select.matches(SELECTOR)) return;

        wireDocument();
        var wrap = buildWrap(select);
        wireWrap(wrap);
    }

    function refresh(select) {
        var wrap = getWrap(select);
        if (wrap) {
            syncTriggerState(wrap);
            renderOptions(wrap);
        }
    }

    function rebuild(select, applyFn) {
        if (!select) return;
        enhance(select);
        if (typeof applyFn === "function") {
            applyFn(select);
        }
        refresh(select);
    }

    function enhanceAll(root) {
        (root || document).querySelectorAll(SELECTOR).forEach(function (select) {
            if (!select.classList.contains("inv-search-select-native")) {
                enhance(select);
            }
        });
    }

    function watchDom() {
        if (domObserver || typeof MutationObserver === "undefined") return;
        domObserver = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                mutation.addedNodes.forEach(function (node) {
                    if (!node || node.nodeType !== 1) return;
                    if (node.matches && node.matches(SELECTOR)) enhance(node);
                    if (node.querySelectorAll) {
                        node.querySelectorAll(SELECTOR).forEach(enhance);
                    }
                });
            });
        });
        domObserver.observe(document.body, { childList: true, subtree: true });
    }

    function boot() {
        enhanceAll();
        watchDom();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }

    return {
        enhance: enhance,
        refresh: refresh,
        rebuild: rebuild,
        enhanceAll: enhanceAll,
        closeAll: closeAll
    };
})();
