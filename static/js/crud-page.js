define("crud-page", function (require, module, exports) {
    "use strict";
    var api = require("api");
    var auth = require("auth");
    var toast = require("toast");
    var loader = require("loader");
    var confirm = require("confirm");
    var form = require("form");
    var helpers = require("helpers");
    var pagination = require("pagination");
    var search = require("search");
    var excel = require("excel");

    function init(config) {
            // Configure modal size
        var dialog = document.getElementById("crud-dialog");

        dialog.className = "modal-dialog modal-dialog-centered";

        if (config.modalClass) {
            dialog.classList.add(config.modalClass);
        }
        // Reset previous screen
        document.getElementById("crud-thead-row").innerHTML = "";
        // document.getElementById("crud-title").textContent = config.title;
        document.getElementById("crud-tbody").innerHTML = "";
        document.getElementById("crud-empty").classList.add("d-none");
        document.getElementById("crud-count").textContent = "";
        document.getElementById("crud-pagination").innerHTML = "";
        document.getElementById("crud-search").value = "";
        if (!auth.requireAuth()) return;

        var state = {
            page: 1,
            search: "",
            filters: {},
            ordering: "-created_at",
            includeDeleted: false,
            rows: [],
            editingId: null
        };

        var base = "/" + config.endpoint + "/";

        // -- table head ----------------------------------------------------
        function renderHead() {
            var row = document.getElementById("crud-thead-row");
            var html = config.columns.map(function (col) {
                if (col.type === "image" || col.type === "list") {
                    return "<th>" + helpers.escapeHtml(col.label) + "</th>";
                }
                var arrow = "";
                if (state.ordering === col.key) arrow = ' <i class="bi bi-caret-up-fill"></i>';
                else if (state.ordering === "-" + col.key) arrow = ' <i class="bi bi-caret-down-fill"></i>';
                return '<th class="sortable" data-key="' + col.key + '">' +
                    helpers.escapeHtml(col.label) + arrow + "</th>";
            }).join("");
            if (config.showActions !== false) {
                row.innerHTML = html + '<th class="text-end">Actions</th>';
            } else {
                row.innerHTML = html;
            }

            row.querySelectorAll(".sortable").forEach(function (th) {
                th.addEventListener("click", function () {
                    var key = th.getAttribute("data-key");
                    state.ordering = state.ordering === key ? "-" + key : key;
                    state.page = 1;
                    load();
                });
            });
        }

        // -- cell formatting ----------------------------------------------
        function formatCell(col, row) {
            var val = row[col.key];
            if (col.type === "status") {
                if (row.is_deleted) {
                    return '<span class="badge bg-danger">Deleted</span>';
                }
                var checked = row.is_active ? "checked" : "";
                return '<div class="form-check form-switch d-inline-block">' +
                    '<input class="form-check-input status-toggle" type="checkbox" role="switch" data-id="' + row.id + '" ' + checked + ' style="cursor:pointer;" />' +
                    '</div>';
            }
            if (col.type === "datetime") {
                return val ? helpers.formatDate(val) : '<span class="text-muted">—</span>';
            }
            if (col.type === "boolean") {
                return val
                    ? '<i class="bi bi-check-circle-fill text-success"></i>'
                    : '<i class="bi bi-dash-circle text-muted"></i>';
            }
            if (col.type === "image") {
                return val
                    ? '<img src="' + val + '" class="table-thumb" />'
                    : '<span class="text-muted">—</span>';
            }
            if (col.type === "list") {
                return (Array.isArray(val) && val.length)
                    ? val.map(function (v) { return '<span class="badge bg-light text-dark">' + helpers.escapeHtml(v) + "</span>"; }).join(" ")
                    : '<span class="text-muted">—</span>';
            }
            if (col.type === "booking_status") {
                switch (row.booking_status) {
                    case "Approved":
                        return '<span class="badge bg-success no-cursor">Approved</span>';
                    case "Rejected":
                        return '<span class="badge bg-danger no-cursor">Rejected</span>';
                    case "Completed":
                        return '<span class="badge bg-primary no-cursor">Completed</span>';
                    default:
                        return '<span class="badge bg-warning text-dark no-cursor">Pending</span>';
                }
            }
            return helpers.escapeHtml(val);
        }

        // -- rows ----------------------------------------------------------
        function renderRows() {
            var tbody = document.getElementById("crud-tbody");
            var empty = document.getElementById("crud-empty");
            tbody.innerHTML = "";

            if (!state.rows.length) {
                empty.classList.remove("d-none");
                return;
            }
            empty.classList.add("d-none");

            state.rows.forEach(function (row) {
                var tr = document.createElement("tr");
                var cells = config.columns.map(function (col) {
                    return "<td>" + formatCell(col, row) + "</td>";
                }).join("");

            if (config.showActions !== false) {
                var actions = '<td class="text-end actions">';
                var hasAction = false;

                if (row.is_deleted) {

                    if (config.showRestore !== false) {
                        hasAction = true;
                        actions += '<button class="btn btn-sm btn-outline-success" data-act="restore" data-id="' + row.id + '"><i class="bi bi-arrow-counterclockwise"></i></button>';
                    }

                } else {

                    if (config.showEdit !== false) {
                        hasAction = true;
                        actions += '<button class="btn btn-sm btn-outline-primary" data-act="edit" data-id="' + row.id + '" ' + 'title="Update"><i class="bi bi-pencil"></i></button> ';
                    }

                    if (config.showDelete !== false) {
                        hasAction = true;
                        actions += '<button class="btn btn-sm btn-outline-primary" data-act="delete" data-id="' + row.id + '" ' + 'title="Delete"><i class="bi bi-trash"></i></button>';
                    }

                    if (
                        config.showApproveButton === true &&
                        row.booking_status === "Pending" &&
                        row.vehicle_is_hold === true
                    ) {
                        hasAction = true;
                        actions +=
                            '<button class="btn btn-sm btn-outline-primary" data-act="approve" data-id="' + row.vehicle_id + '" ' + 'title="Approve Ride">' + '<i class="bi bi-check-circle"></i></button>';
                        actions +=
                            '<button class="btn btn-sm btn-outline-primary" ' + 'data-act="reject" data-id="' + row.vehicle_id + '" ' + 'title="Reject Ride">' + '<i class="bi bi-x-circle"></i>' + '</button>';
                    }
                    if (config.showCompleteRideButton === true && row.booking_status === "Approved") 
                    {
                        hasAction = true;
                        actions +=
                            '<button class="btn btn-sm btn-outline-primary" ' + 'data-act="complete" data-id="' + row.id + '" ' + 'title="Complete Ride">' + '<i class="bi bi-flag-fill"></i>' + '</button>';
                    }
                    if (!hasAction) {
                        actions += '<span class="text-muted small fst-italic">No actions available</span>';
                    }
                }

                actions += "</td>";
                tr.innerHTML = cells + actions;
            } else {
                tr.innerHTML = cells;
            }
                tbody.appendChild(tr);
            });

            tbody.querySelectorAll("[data-act]").forEach(function (btn) {
                btn.addEventListener("click", function () {
                    var id = btn.getAttribute("data-id");
                    var act = btn.getAttribute("data-act");
                    if (act === "edit") openForm(id);
                    else if (act === "delete") removeRecord(id);
                    else if (act === "restore") restoreRecord(id);
                    else if (act === "approve") approveVehicle(id);
                    else if (act === "reject") rejectVehicle(id);
                    else if (act === "complete")completeRide(id);
                });
            });

            tbody.querySelectorAll(".status-toggle").forEach(function (checkbox) {
                checkbox.addEventListener("change", function () {
                    var id = checkbox.getAttribute("data-id");
                    var isActive = checkbox.checked;
                    checkbox.disabled = true;
                    api.patch(base + id + "/", { is_active: isActive })
                        .then(function (body) {
                            checkbox.disabled = false;
                            if (body && body.isSuccess) {
                                toast.success(config.title + " status updated");
                                var found = state.rows.find(function (r) { return String(r.id) === String(id); });
                                if (found) found.is_active = isActive;
                            } else {
                                checkbox.checked = !isActive;
                            }
                        })
                        .catch(function () {
                            checkbox.disabled = false;
                            checkbox.checked = !isActive;
                        });
                });
            });
        }

        // -- list ----------------------------------------------------------
        function load() {
            renderHead();
            var params = {
                page: state.page,
                ordering: state.ordering,
                search: state.search
            };
            Object.keys(state.filters).forEach(function (key) {
                if (state.filters[key]) {
                    params[key] = state.filters[key];
                }
            });
            if (state.includeDeleted) params.include_deleted = "true";
            api.get(base + helpers.getQueryString(params)).then(function (body) {
                if (!body || !body.isSuccess) return;
                state.rows = body.data.items || [];
                renderRows();
                pagination.render("crud-pagination", body.data.pagination, function (p) {
                    state.page = p; load();
                });
                var pg = body.data.pagination || {};
                document.getElementById("crud-count").textContent =
                    "Total: " + (pg.count || 0) + " record(s)";
            });
        }

        // -- create / edit -------------------------------------------------
        function openForm(id) {
            state.editingId = id || null;
            var modalEl = document.getElementById("crud-modal");
            var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            document.getElementById("crud-modal-title").textContent =
                (id ? "Edit " : "Add ") + config.title;

            var fieldsContainer = document.getElementById("crud-form-fields");

            var dialog = document.getElementById("crud-dialog");
            var body = document.getElementById("crud-form-fields");

            // Reset
            dialog.className = "modal-dialog modal-dialog-centered";
            body.classList.remove("row");

            // Vehicle page
            if (config.formLayout === "horizontal") {
                dialog.classList.add("modal-xl");
                body.classList.add("row");
            }

            function fillAndShow(record) {
                form.renderFields(fieldsContainer, config.fields, record || {}, config.formLayout);
                form.bindImagePreview(fieldsContainer);
                modal.show();
            }

            if (id) {
                api.get(base + id + "/").then(function (body) {
                    if (body && body.isSuccess) fillAndShow(body.data);
                });
            } else {
                fillAndShow({});
            }
        }

        function submitForm(e) {
            e.preventDefault();
            var formEl = document.getElementById("crud-form");
            if (!form.validate(formEl, config.fields)) return;

            var saveBtn = document.getElementById("crud-save");
            loader.button(saveBtn, true, "Saving...");

            var id = state.editingId;
            var promise;
            if (config.multipart) {
                var fd = form.buildPayload(formEl, config.fields, true);
                promise = id ? api.putForm(base + id + "/", fd) : api.postForm(base, fd);
            } else {
                var payload = form.buildPayload(formEl, config.fields, false);
                promise = id ? api.put(base + id + "/", payload) : api.post(base, payload);
            }

            promise.then(function (body) {
                loader.button(saveBtn, false);
                if (body && body.isSuccess) {
                    toast.success(config.title + (id ? " updated" : " created"));
                    bootstrap.Modal.getOrCreateInstance(document.getElementById("crud-modal")).hide();
                    load();
                }
            }).catch(function () { loader.button(saveBtn, false); });
        }

        // -- delete / restore ---------------------------------------------
        function removeRecord(id) {
            confirm.ask({
                title: "Delete " + config.title + "?",
                message: "This record will be moved to the deleted state.",
                confirmText: "Delete"
            }).then(function (ok) {
                if (!ok) return;
                api.del(base + id + "/").then(function (body) {
                    if (body && body.isSuccess) { toast.success("Deleted"); load(); }
                });
            });
        }

        function restoreRecord(id) {
            confirm.ask({
                title: "Restore " + config.title + "?",
                message: "This record will be reactivated.",
                confirmText: "Restore",
                variant: "success"
            }).then(function (ok) {
                if (!ok) return;
                api.post(base + id + "/restore/").then(function (body) {
                    if (body && body.isSuccess) { toast.success("Restored"); load(); }
                });
            });
        }

        function approveVehicle(vehicleId) {
            confirm.ask({
                title: "Approve Vehicle?",
                message: "This will release hold and make vehicle available again.",
                confirmText: "Approve",
                variant: "success"
            }).then(function (ok) {
                if (!ok) return;

                api.post("/vehicles/" + vehicleId + "/approve/", {})
                    .then(function (body) {
                        if (body && body.isSuccess) {
                            toast.success("Vehicle approved successfully");
                            load();
                        }
                    });
            });
        }

        function rejectVehicle(vehicleId) {

            confirm.ask({
                title: "Reject Booking?",
                message: "This will reject the booking and release the vehicle.",
                confirmText: "Reject",
                variant: "danger"
            }).then(function (ok) {

                if (!ok)
                    return;

                api.post("/vehicles/" + vehicleId + "/reject/", {})
                    .then(function (body) {

                        if (body && body.isSuccess) {

                            toast.success("Booking rejected successfully");

                            load();

                        }

                    });

            });

        }

        // -- export --------------------------------------------------------
        function exportData() {
            var cols = config.columns.filter(function (c) { return c.type !== "image"; });
            excel.exportRows(config.endpoint, cols, state.rows);
        }

        function completeRide(id) {

            confirm.ask({
                title: "Complete Ride?",
                message: "This will mark the ride as completed and make the vehicle available again.",
                confirmText: "Complete",
                variant: "success"
            }).then(function (ok) {

                if (!ok)
                    return;

                api.post("/vehicles/" + id + "/complete/", {})
                    .then(function (body) {

                        if (body && body.isSuccess) {

                            toast.success("Ride completed successfully");

                            load();
                        }

                    });

            });

        }

        function renderFilters() {

            if (!config.filters)
                return;

            var container = document.getElementById("crud-filters");

            container.innerHTML = "";

            config.filters.forEach(function(filter){

                container.insertAdjacentHTML(
                    "beforeend",

                    `<input
                        class="form-control form-control-sm crud-filter"
                        data-name="${filter.name}"
                        placeholder="${filter.label}">`
                );

            });

            container.querySelectorAll(".crud-filter")
                .forEach(function(input){

                    input.addEventListener("keyup",function(){

                        state.filters[input.dataset.name]=input.value;

                        state.page=1;

                        load();

                    });

                });

        }

        // -- wire ----------------------------------------------------------
        var addBtn = document.getElementById("crud-add");

        if (config.showAddButton === false) {
            addBtn.style.display = "none";
        } else {
            addBtn.style.display = "";
            addBtn.onclick = function () {
                openForm(null);
            };
        }
        document.getElementById("crud-form").onsubmit = submitForm;

        document.getElementById("crud-export").onclick = exportData;

        // var toggleBtn = document.getElementById("crud-toggle-deleted");
        // toggleBtn.onclick = function () {
        //     state.includeDeleted = !state.includeDeleted;
        //     toggleBtn.classList.toggle("active", state.includeDeleted);
        //     toggleBtn.querySelector("span").textContent =
        //         state.includeDeleted ? "Hide Deleted" : "Show Deleted";
        //     state.page = 1;
        //     load();
        // };

        search.bind("crud-search", function (term) {
            state.search = term; state.page = 1; load();
        });

        renderFilters();
        load();
    }

    module.exports = { init: init };
});
