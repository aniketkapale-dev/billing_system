define("form", function (require, module, exports) {
    "use strict";
    var helpers = require("helpers");
    var api = require("api");

    var EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    var MOBILE_RE = /^[0-9]{7,15}$/;

    // -- validation --------------------------------------------------------
    function validateField(field, value) {
        if (field.required && field.type !== "checkbox" &&
            (value === null || value === undefined || value === "")) {
            return field.label + " is required.";
        }
        if (value) {
            if (field.type === "email" && !EMAIL_RE.test(value)) {
                return "Enter a valid email address.";
            }
            if (field.type === "mobile" && !MOBILE_RE.test(String(value).replace(/[\s-]/g, ""))) {
                return "Enter a valid mobile number (7-15 digits).";
            }
        }
        return null;
    }

    function showError(formEl, name, message) {
        var input = formEl.querySelector('[name="' + name + '"]');
        if (!input) return;
        input.classList.add("is-invalid");
        var feedback = input.parentElement.querySelector(".invalid-feedback");
        if (feedback) feedback.textContent = message;
    }

    function clearErrors(formEl) {
        formEl.querySelectorAll(".is-invalid").forEach(function (el) {
            el.classList.remove("is-invalid");
        });
    }

    /** Validate a config-driven form. Returns true when valid. */
    function validate(formEl, fields) {
        clearErrors(formEl);
        var values = readValues(formEl, fields);
        var ok = true;
        fields.forEach(function (field) {
            var error = validateField(field, values[field.name]);
            if (error) { showError(formEl, field.name, error); ok = false; }
        });
        return ok;
    }

    // -- read / build ------------------------------------------------------
    function readValues(formEl, fields) {
        var values = {};
        fields.forEach(function (field) {
            var input = formEl.querySelector('[name="' + field.name + '"]');
            if (!input) return;
            if (field.type === "checkbox") {
                values[field.name] = input.checked;
            } else if (field.type === "image") {
                values[field.name] = input.files && input.files[0] ? input.files[0] : null;
            } else {
                values[field.name] = input.value;
            }
        });
        return values;
    }

    /** Build a JSON object or FormData payload depending on `multipart`. */
    function buildPayload(formEl, fields, multipart) {
        var values = readValues(formEl, fields);
        if (multipart) {
            var fd = new FormData();
            fields.forEach(function (field) {
                var v = values[field.name];
                if (field.type === "image") {
                    if (v) fd.append(field.name, v); // skip when unchanged
                } else if (field.type === "checkbox") {
                    fd.append(field.name, v ? "true" : "false");
                } else if (v !== null && v !== undefined && v !== "") {
                    fd.append(field.name, v);
                }
            });
            return fd;
        }
        var obj = {};
        fields.forEach(function (field) {
            var v = values[field.name];
            if (field.type === "image") return;
            if (v !== null && v !== undefined) obj[field.name] = v;
        });
        return obj;
    }

    // -- rendering ---------------------------------------------------------
    function renderFields(container, fields, record, layout) {

        record = record || {};

        container.innerHTML = "";

        if (layout === "horizontal") {

            var row = document.createElement("div");
            row.className = "row g-3";

            fields.forEach(function(field){

                if(field.createOnly && record.id)
                    return;

                row.appendChild(buildFieldNode(field, record, true));

            });

            container.appendChild(row);

        }
        else{

            fields.forEach(function(field){

                if(field.createOnly && record.id)
                    return;

                container.appendChild(buildFieldNode(field, record, false));

            });

        }

        fields.forEach(function (field) {

            if (field.type === "select")
                initSelect(field, record, fields);

        });
        // Trigger dependent dropdowns in edit mode
        if (record && record.id) {
            setTimeout(function () {
                fields.forEach(function (field) {
                    if (field.type === "select" && record[field.name]) {
                        window.jQuery('select[name="' + field.name + '"]')
                            .trigger("change");
                    }
                });
            }, 100);
        }

    }

    function buildFieldNode(field, record, horizontal) {
        var wrap;

        if(horizontal){

            wrap = document.createElement("div");
            wrap.className = field.col || "col-md-4";

        }
        else{

            wrap = document.createElement("div");
            wrap.className = "mb-3";

        }
        var value = record[field.name];
        var labelHtml = '<label class="form-label">' + helpers.escapeHtml(field.label) +
            (field.required ? ' <span class="text-danger">*</span>' : "") + "</label>";

        if (field.type === "textarea") {
            wrap.innerHTML = labelHtml +
                '<textarea class="form-control" name="' + field.name + '" rows="3">' +
                helpers.escapeHtml(value || "") + "</textarea>" +
                '<div class="invalid-feedback"></div>';
        } else if (field.type === "checkbox") {
            var checked = (value === undefined ? field.default : value) ? "checked" : "";
            wrap.className = "mb-3 form-check form-switch";
            wrap.innerHTML =
                '<input class="form-check-input" type="checkbox" name="' + field.name + '" ' + checked + ">" +
                '<label class="form-check-label ms-2">' + helpers.escapeHtml(field.label) + "</label>";
        } else if (field.type === "select") {
            wrap.innerHTML = labelHtml +
                '<select class="form-select" name="' + field.name + '" style="width:100%"></select>' +
                '<div class="invalid-feedback"></div>';
        } else if (field.type === "choice") {
            var opts = (field.options || []).map(function (o) {
                var sel = String(value) === String(o[0]) ? "selected" : "";
                return '<option value="' + o[0] + '" ' + sel + ">" + helpers.escapeHtml(o[1]) + "</option>";
            }).join("");
            wrap.innerHTML = labelHtml +
                '<select class="form-select" name="' + field.name + '">' + opts + "</select>" +
                '<div class="invalid-feedback"></div>';
        } else if (field.type === "image") {

            var imageSrc = record.image_url || "";

            var fileName = "";

            if (imageSrc) {
                fileName = imageSrc.split("/").pop();
            }

            wrap.className = horizontal ? "col-md-6" : "mb-3";

            wrap.innerHTML =
                labelHtml +
                '<div class="row align-items-start">' +

                    '<div class="col-md-7">' +

                        '<input class="form-control" type="file" accept="image/*" name="' + field.name + '" />' +

                        (fileName
                            ? '<small class="text-muted d-block mt-2">Current File: ' + fileName + '</small>'
                            : '<small class="text-muted d-block mt-2">No image selected</small>') +

                        '<div class="invalid-feedback"></div>' +

                    '</div>' +

                    '<div class="col-md-5 text-center">' +

                        '<img src="' + imageSrc + '" ' +
                        'id="preview-' + field.name + '" ' +
                        'class="img-thumbnail ' + (imageSrc ? '' : 'd-none') + '" ' +
                        'style="width:150px;height:120px;object-fit:cover;">' +

                    '</div>' +

                '</div>';
        } else {
            var inputType = field.type === "number" ? "number"
                : field.type === "password" ? "password"
                : (field.type === "email" ? "email" : "text");
            var val = value !== undefined && value !== null ? value
                : (field.default !== undefined ? field.default : "");
            var readonly = (field.readOnlyOnEdit && record.id)
                ? ' readonly style="background-color:#e9ecef;cursor:not-allowed;"'
                : "";
            wrap.innerHTML = labelHtml +
                '<input class="form-control" type="' + inputType + '" name="' + field.name + '" value="' +
                helpers.escapeHtml(val) + '"' + readonly + ' />' +
                '<div class="invalid-feedback"></div>';
        }
        return wrap;
    }

    /** Loads options into a Select2 dropdown for a foreign-key field. */
function initSelect(field, record, fields) {

    var $select = window.jQuery('select[name="' + field.name + '"]');

    if (!$select.length)
        return;

    var labelKey = field.optionLabel || "name";

    // Load immediately only if this field has no parent.
    if (!field.dependsOn || field.dependsOn.length === 0) {
        loadOptions();
    } else {

        $select.empty();

        $select.append(
            new Option("Select " + field.label, "")
        );

    }

    $select.select2({
        theme: "bootstrap-5",
        dropdownParent: window.jQuery("#crud-modal"),
        placeholder: "Select " + field.label,
        width: "100%"
    });

    function loadOptions() {

        var url = "/" + field.optionsEndpoint + "/?page_size=100";

        if (field.dependsOn) {

            field.dependsOn.forEach(function (parent) {

                var value = window.jQuery('select[name="' + parent + '"]').val();

                if (value)
                    url += "&" + parent + "=" + value;

            });

        }

        // Don't load until every parent has a value.
        if (field.dependsOn) {

            var ready = true;

            field.dependsOn.forEach(function(parent){

                var value = window.jQuery('select[name="' + parent + '"]').val();

                if(!value)
                    ready = false;

            });

            if(!ready){

                $select.empty();

                $select.append(
                    new Option("Select " + field.label, "")
                );

                $select.trigger("change.select2");

                return;
            }
        }
        api.get(url,{silent:true}).then(function(body){

            var items = body.data.items || [];

            $select.empty();

            $select.append(new Option("Select " + field.label, ""));

            items.forEach(function (item) {

                $select.append(
                    new Option(
                        item[labelKey],
                        item.id,
                        false,
                        false
                    )
                );

            });

            if (record && record[field.name]) {
                $select.val(String(record[field.name])).trigger("change");
            } else {
                $select.trigger("change.select2");
            }

        });

    }

    if(field.dependsOn){

        field.dependsOn.forEach(function(parent){

            window.jQuery(document)
                .off("change.dep_" + field.name + "_" + parent)

                .on(
                    "change.dep_" + field.name + "_" + parent,
                    'select[name="' + parent + '"]',
                    function(){

                    $select.empty();

                    $select.append(
                        new Option("Loading...", "")
                    );

                    $select.trigger("change.select2");

                    loadOptions();

                });

        });

    }

}

    function bindImagePreview(container) {

        container.querySelectorAll('input[type="file"]').forEach(function (input) {

            input.addEventListener("change", function () {

                var img = document.getElementById("preview-" + input.name);

                if (!img)
                    return;

                if (input.files && input.files[0]) {

                    img.src = URL.createObjectURL(input.files[0]);

                    img.classList.remove("d-none");

                    var text = input.parentElement.querySelector("small");

                    if (text) {
                        text.textContent = input.files[0].name;
                    }
                }

            });

        });

    }

    module.exports = {
        validate: validate,
        readValues: readValues,
        buildPayload: buildPayload,
        renderFields: renderFields,
        bindImagePreview: bindImagePreview,
        clearErrors: clearErrors,
        showError: showError
    };
});
