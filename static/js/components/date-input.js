/**
 * Text date inputs shown as DD/MM/YYYY with an optional calendar picker.
 * Values read/written as ISO YYYY-MM-DD for APIs.
 */
var InventoryDateInput = (function () {
    "use strict";

    var PLACEHOLDER = "dd/mm/yyyy";
    var MONTH_NAMES = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    var WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
    var openPickerEl = null;
    var openInputEl = null;
    var pickerAnchorEl = null;
    var documentCloseWired = false;

    function formatDigitsToDisplay(digits) {
        digits = String(digits || "").replace(/\D/g, "").slice(0, 8);
        var day = digits.slice(0, 2);
        var month = digits.slice(2, 4);
        var year = digits.slice(4, 8);
        var out = day;
        if (month) out += "/" + month;
        if (year) out += "/" + year;
        return out;
    }

    function parseValue(value) {
        if (typeof InventoryDateFormat !== "undefined") {
            return InventoryDateFormat.toInputDateValue(value);
        }
        return value == null ? "" : String(value).trim();
    }

    function formatValue(iso) {
        if (typeof InventoryDateFormat !== "undefined") {
            return InventoryDateFormat.formatDisplayDate(iso, "");
        }
        return iso || "";
    }

    function isoToParts(iso) {
        if (!iso) return null;
        var match = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return null;
        return {
            year: Number(match[1]),
            month: Number(match[2]) - 1,
            day: Number(match[3])
        };
    }

    function partsToIso(year, month, day) {
        return (
            String(year) + "-" +
            String(month + 1).padStart(2, "0") + "-" +
            String(day).padStart(2, "0")
        );
    }

    function todayIso() {
        var now = new Date();
        return partsToIso(now.getFullYear(), now.getMonth(), now.getDate());
    }

    function isDisabledDate(iso, min, max) {
        if (!iso) return true;
        if (min && iso < min) return true;
        if (max && iso > max) return true;
        return false;
    }

    function dispatchChange(input) {
        if (!input) return;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function wire(input) {
        if (!input || input.dataset.dateInputWired === "1") return input;
        input.dataset.dateInputWired = "1";
        input.addEventListener("input", onInput);
        input.addEventListener("blur", onBlur);
        input.addEventListener("keydown", onKeyDown);
        return input;
    }

    function onKeyDown(e) {
        if (e.key !== "Enter") return;
        e.target.blur();
    }

    function onInput(e) {
        var input = e.target;
        var digits = input.value.replace(/\D/g, "").slice(0, 8);
        input.value = formatDigitsToDisplay(digits);
        input.classList.remove("inv-date-input--invalid");
    }

    function onBlur(e) {
        var input = e.target;
        var raw = input.value.trim();
        if (!raw) {
            input.classList.remove("inv-date-input--invalid");
            return;
        }
        var iso = parseValue(raw);
        if (!iso) {
            input.classList.add("inv-date-input--invalid");
            return;
        }
        input.classList.remove("inv-date-input--invalid");
        input.value = formatValue(iso);
        enforceMinMax(input, iso);
    }

    function enforceMinMax(input, iso) {
        iso = iso || parseValue(input.value);
        if (!iso) return iso;
        var min = getMin(input);
        var max = getMax(input);
        if (min && iso < min) {
            setValue(input, min, false);
            return min;
        }
        if (max && iso > max) {
            setValue(input, max, false);
            return max;
        }
        return iso;
    }

    function isOutsidePicker(target) {
        if (!openPickerEl || !openInputEl) return false;
        if (openPickerEl.contains(target)) return false;
        var wrap = openInputEl.closest(".inv-date-field");
        if (wrap && wrap.contains(target)) return false;
        return true;
    }

    function ensureDocumentClose() {
        if (documentCloseWired) return;
        documentCloseWired = true;

        document.addEventListener("mousedown", function (e) {
            if (!openPickerEl || !isOutsidePicker(e.target)) return;
            closePicker();
        });

        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") closePicker();
        });

        window.addEventListener("resize", function () {
            if (openPickerEl && openInputEl) {
                positionPicker(openPickerEl, openInputEl);
            }
        });
    }

    function resetPickerPosition(picker) {
        if (!picker) return;
        picker.style.position = "";
        picker.style.left = "";
        picker.style.top = "";
        picker.style.width = "";
        picker.style.zIndex = "";
    }

    function positionPicker(picker, input) {
        var rect = input.getBoundingClientRect();
        var width = 300;
        var left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
        var top = rect.bottom + 6;
        var estimatedHeight = 360;

        if (top + estimatedHeight > window.innerHeight - 8) {
            top = Math.max(8, rect.top - estimatedHeight - 6);
        }

        picker.style.position = "fixed";
        picker.style.left = left + "px";
        picker.style.top = top + "px";
        picker.style.width = width + "px";
        picker.style.zIndex = "10050";
    }

    function closePicker() {
        if (openPickerEl) {
            openPickerEl.classList.add("inv-hidden");
            resetPickerPosition(openPickerEl);
            if (pickerAnchorEl && openPickerEl.parentNode === document.body) {
                pickerAnchorEl.appendChild(openPickerEl);
            }
        }
        openPickerEl = null;
        openInputEl = null;
        pickerAnchorEl = null;
    }

    function getViewMonth(input) {
        if (openPickerEl) {
            return {
                year: Number(openPickerEl.dataset.viewYear),
                month: Number(openPickerEl.dataset.viewMonth)
            };
        }
        var iso = getValue(input);
        var parts = isoToParts(iso);
        if (parts) return { year: parts.year, month: parts.month };
        var now = new Date();
        return { year: now.getFullYear(), month: now.getMonth() };
    }

    function getYearRange(input) {
        var min = getMin(input);
        var max = getMax(input);
        var currentYear = new Date().getFullYear();
        var start = min ? Number(min.slice(0, 4)) : currentYear - 100;
        var end = max ? Number(max.slice(0, 4)) : currentYear + 20;
        if (end < start) end = start;
        return { start: start, end: end };
    }

    function buildMonthOptions(selectedMonth) {
        var html = "";
        for (var i = 0; i < 12; i++) {
            html += '<option value="' + i + '"' + (i === selectedMonth ? " selected" : "") + ">" +
                MONTH_NAMES[i] + "</option>";
        }
        return html;
    }

    function buildYearOptions(input, selectedYear) {
        var range = getYearRange(input);
        var html = "";
        for (var year = range.end; year >= range.start; year--) {
            html += '<option value="' + year + '"' + (year === selectedYear ? " selected" : "") + ">" +
                year + "</option>";
        }
        return html;
    }

    function renderPicker(picker, input, year, month) {
        picker.dataset.viewYear = String(year);
        picker.dataset.viewMonth = String(month);

        var firstDay = new Date(year, month, 1);
        var startOffset = firstDay.getDay();
        var daysInMonth = new Date(year, month + 1, 0).getDate();
        var selectedIso = getValue(input);
        var min = getMin(input);
        var max = getMax(input);
        var today = todayIso();

        var html = "";
        html += '<div class="inv-date-picker__header">';
        html += '<button type="button" class="inv-date-picker__nav" data-nav="prev" aria-label="Previous month">';
        html += '<span class="material-symbols-outlined">chevron_left</span></button>';
        html += '<div class="inv-date-picker__selects">';
        html += '<select class="inv-date-picker__month" data-picker-month aria-label="Month">';
        html += buildMonthOptions(month);
        html += "</select>";
        html += '<select class="inv-date-picker__year" data-picker-year aria-label="Year">';
        html += buildYearOptions(input, year);
        html += "</select>";
        html += "</div>";
        html += '<button type="button" class="inv-date-picker__nav" data-nav="next" aria-label="Next month">';
        html += '<span class="material-symbols-outlined">chevron_right</span></button>';
        html += "</div>";

        html += '<div class="inv-date-picker__weekdays">';
        WEEKDAY_LABELS.forEach(function (label) {
            html += '<span class="inv-date-picker__weekday">' + label + "</span>";
        });
        html += "</div>";

        html += '<div class="inv-date-picker__grid">';
        for (var i = 0; i < startOffset; i++) {
            html += '<span class="inv-date-picker__day inv-date-picker__day--empty"></span>';
        }
        for (var day = 1; day <= daysInMonth; day++) {
            var iso = partsToIso(year, month, day);
            var classes = ["inv-date-picker__day"];
            if (iso === selectedIso) classes.push("is-selected");
            if (iso === today) classes.push("is-today");
            if (isDisabledDate(iso, min, max)) classes.push("is-disabled");
            html += '<button type="button" class="' + classes.join(" ") + '" data-date="' + iso + '"' +
                (isDisabledDate(iso, min, max) ? " disabled" : "") + ">" + day + "</button>";
        }
        html += "</div>";

        html += '<div class="inv-date-picker__footer">';
        html += '<button type="button" class="inv-date-picker__today" data-action="today">Today</button>';
        html += '<button type="button" class="inv-date-picker__clear" data-action="clear">Clear</button>';
        html += "</div>";

        picker.innerHTML = html;
    }

    function shiftMonth(picker, input, delta) {
        var year = Number(picker.dataset.viewYear);
        var month = Number(picker.dataset.viewMonth) + delta;
        while (month < 0) {
            month += 12;
            year -= 1;
        }
        while (month > 11) {
            month -= 12;
            year += 1;
        }
        renderPicker(picker, input, year, month);
    }

    function openPicker(input) {
        if (!input) return;
        ensureDocumentClose();
        var wrap = input.closest(".inv-date-field");
        if (!wrap) return;
        var picker = wrap.querySelector(".inv-date-picker");
        if (!picker) return;

        if (openPickerEl && openPickerEl !== picker) {
            closePicker();
        }

        pickerAnchorEl = wrap;
        if (picker.parentNode !== document.body) {
            document.body.appendChild(picker);
        }

        var view = getViewMonth(input);
        renderPicker(picker, input, view.year, view.month);
        picker.classList.remove("inv-hidden");
        positionPicker(picker, input);
        openPickerEl = picker;
        openInputEl = input;
    }

    function handlePickerInteraction(e, input, picker) {
        e.stopPropagation();

        var navBtn = e.target.closest("[data-nav]");
        if (navBtn) {
            e.preventDefault();
            shiftMonth(picker, input, navBtn.getAttribute("data-nav") === "prev" ? -1 : 1);
            return;
        }

        if (e.target.matches("[data-picker-month], [data-picker-year]")) {
            if (e.type === "change") {
                var year = Number(picker.querySelector("[data-picker-year]").value);
                var month = Number(picker.querySelector("[data-picker-month]").value);
                renderPicker(picker, input, year, month);
            }
            return;
        }

        var dayBtn = e.target.closest(".inv-date-picker__day[data-date]");
        if (dayBtn && !dayBtn.disabled) {
            e.preventDefault();
            setValue(input, dayBtn.getAttribute("data-date"), true);
            closePicker();
            return;
        }

        var actionBtn = e.target.closest("[data-action]");
        if (!actionBtn) return;
        e.preventDefault();
        var action = actionBtn.getAttribute("data-action");
        if (action === "today") {
            var today = todayIso();
            if (!isDisabledDate(today, getMin(input), getMax(input))) {
                setValue(input, today, true);
                closePicker();
            }
            return;
        }
        if (action === "clear") {
            setValue(input, "", true);
            closePicker();
        }
    }

    function attachPickerUI(input) {
        if (!input || input.dataset.datePickerAttached === "1") return input;

        var wrap = document.createElement("div");
        wrap.className = "inv-date-field";
        input.parentNode.insertBefore(wrap, input);
        wrap.appendChild(input);

        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "inv-date-field__btn";
        btn.setAttribute("aria-label", "Open calendar");
        btn.innerHTML = '<span class="material-symbols-outlined">calendar_today</span>';
        wrap.appendChild(btn);

        var picker = document.createElement("div");
        picker.className = "inv-date-picker inv-hidden";
        picker.setAttribute("role", "dialog");
        picker.setAttribute("aria-label", "Choose date");
        wrap.appendChild(picker);

        btn.addEventListener("mousedown", function (e) {
            e.preventDefault();
        });

        btn.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (openPickerEl === picker && openInputEl === input) {
                closePicker();
                return;
            }
            openPicker(input);
        });

        picker.addEventListener("mousedown", function (e) {
            e.stopPropagation();
        });

        picker.addEventListener("click", function (e) {
            handlePickerInteraction(e, input, picker);
        });

        picker.addEventListener("change", function (e) {
            handlePickerInteraction(e, input, picker);
        });

        input.dataset.datePickerAttached = "1";
        return input;
    }

    function upgrade(input) {
        if (!input) return input;

        if (input.dataset.dateInputUpgraded !== "1") {
            var isoValue = "";
            if (input.type === "date") {
                isoValue = input.value || input.getAttribute("value") || "";
                input.removeAttribute("min");
                input.removeAttribute("max");
            } else {
                isoValue = parseValue(input.value || input.getAttribute("value") || "");
            }

            var min = input.getAttribute("min") || input.dataset.minDate || "";
            var max = input.getAttribute("max") || input.dataset.maxDate || "";

            input.type = "text";
            input.classList.add("inv-date-input");
            input.setAttribute("inputmode", "numeric");
            input.setAttribute("autocomplete", "off");
            if (!input.getAttribute("placeholder")) {
                input.placeholder = PLACEHOLDER;
            }

            input.dataset.dateInputUpgraded = "1";
            if (min) input.dataset.minDate = min;
            if (max) input.dataset.maxDate = max;

            wire(input);
            setValue(input, isoValue, false);
        }

        if (input.dataset.datePickerAttached !== "1") {
            attachPickerUI(input);
        }

        return input;
    }

    function init(root) {
        var scope = root || document;
        scope.querySelectorAll('input[type="date"], input.inv-date-input').forEach(function (input) {
            upgrade(input);
        });
    }

    function getValue(input) {
        if (!input) return "";
        return parseValue(input.value);
    }

    function setValue(input, iso, fireChange) {
        if (!input) return;
        input.value = iso ? formatValue(iso) : "";
        input.classList.remove("inv-date-input--invalid");
        if (fireChange) dispatchChange(input);
    }

    function getMin(input) {
        return input && input.dataset.minDate ? input.dataset.minDate : "";
    }

    function getMax(input) {
        return input && input.dataset.maxDate ? input.dataset.maxDate : "";
    }

    function setMin(input, iso) {
        if (!input) return;
        if (iso) input.dataset.minDate = iso;
        else delete input.dataset.minDate;
        var current = getValue(input);
        if (current) enforceMinMax(input, current);
        if (openInputEl === input && openPickerEl) {
            var view = getViewMonth(input);
            renderPicker(openPickerEl, input, view.year, view.month);
            positionPicker(openPickerEl, input);
        }
    }

    function setMax(input, iso) {
        if (!input) return;
        if (iso) input.dataset.maxDate = iso;
        else delete input.dataset.maxDate;
        var current = getValue(input);
        if (current) enforceMinMax(input, current);
        if (openInputEl === input && openPickerEl) {
            var view = getViewMonth(input);
            renderPicker(openPickerEl, input, view.year, view.month);
            positionPicker(openPickerEl, input);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
            init();
        });
    } else {
        init();
    }

    return {
        init: init,
        upgrade: upgrade,
        wire: wire,
        getValue: getValue,
        setValue: setValue,
        getMin: getMin,
        getMax: getMax,
        setMin: setMin,
        setMax: setMax,
        closePicker: closePicker
    };
})();
