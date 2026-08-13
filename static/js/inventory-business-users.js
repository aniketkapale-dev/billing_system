var InventoryBusinessUsers = (function () {
    "use strict";

    var API = "/api/business-users";
    var ROLES_API = "/api/business-users/roles/";
    var TABS_API = "/api/business-users/tabs/";
    var tabOptions = [];
    var roles = [];
    var members = [];
    var editingId = null;

    function request(path, opts) {
        return InventoryApi.request(API, path, opts);
    }

    function rolesRequest(path, opts) {
        return InventoryApi.request(ROLES_API, path, opts);
    }

    function showMainView() {
        var main = document.getElementById("business-main-content");
        var form = document.getElementById("business-user-form-panel");
        if (main) main.classList.remove("inv-hidden");
        if (form) form.classList.add("inv-hidden");
    }

    function showFormView() {
        var main = document.getElementById("business-main-content");
        var form = document.getElementById("business-user-form-panel");
        if (main) main.classList.add("inv-hidden");
        if (form) form.classList.remove("inv-hidden");
    }

    function toggleOwnerPanel(show) {
        var panel = document.getElementById("business-users-panel");
        if (panel) panel.classList.toggle("inv-hidden", !show);
    }

    function renderRoleTabOptions(containerId, selectedTabs) {
        var container = document.getElementById(containerId);
        if (!container) return;
        var selected = selectedTabs || [];
        if (!tabOptions.length) {
            container.innerHTML = '<p class="inv-mgmt-empty">Loading tab options...</p>';
            return;
        }
        container.innerHTML = tabOptions.map(function (tab) {
            var checked = selected.indexOf(tab.code) !== -1 ? " checked" : "";
            return (
                '<label class="inv-tab-check">' +
                '<input type="checkbox" value="' + InventoryApi.escapeHtml(tab.code) + '"' + checked + "/>" +
                "<span>" + InventoryApi.escapeHtml(tab.label) + "</span>" +
                "</label>"
            );
        }).join("");
    }

    function collectRoleTabs(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return [];
        return Array.prototype.slice.call(container.querySelectorAll('input[type="checkbox"]:checked'))
            .map(function (input) { return input.value; });
    }

    function renderRoleSelect(selectedId) {
        var select = document.getElementById("business-user-role");
        if (!select) return;

        var html = '<option value="">Select role</option>';
        if (!roles.length) {
            html = '<option value="">No roles yet — add a role first</option>';
        } else {
            roles.forEach(function (role) {
                var selected = String(role.id) === String(selectedId) ? " selected" : "";
                html += '<option value="' + role.id + '"' + selected + ">" +
                    InventoryApi.escapeHtml(role.role_name) + "</option>";
            });
        }
        select.innerHTML = html;
        if (selectedId) select.value = String(selectedId);
    }

    function toggleRolePanel(show) {
        var panel = document.getElementById("business-user-role-new-panel");
        if (!panel) return;
        panel.classList.toggle("inv-hidden", !show);
        if (show) {
            renderRoleTabOptions("business-user-role-tabs", []);
            document.getElementById("business-user-role-new-name").focus();
        } else {
            document.getElementById("business-user-role-new-name").value = "";
        }
    }

    function loadRoles(selectedId) {
        return rolesRequest("?page_size=100").then(function (body) {
            roles = body && body.isSuccess ? (body.data.items || []) : [];
            renderRoleSelect(selectedId);
            return roles;
        });
    }

    function loadTabOptions() {
        return InventoryApi.request(TABS_API, "", { skipBusiness: true })
            .then(function (body) {
                tabOptions = body && body.isSuccess ? (body.data.items || []) : [];
            });
    }

    function renderRows(items) {
        var tbody = document.getElementById("business-users-table-body");
        if (!tbody) return;
        if (!items.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="inv-mgmt-empty">No users added yet. Click Add User to create one.</td></tr>';
            return;
        }
        tbody.innerHTML = items.map(function (item) {
            return (
                "<tr>" +
                "<td><strong>" + InventoryApi.escapeHtml(item.full_name) + "</strong><br/>" +
                '<span class="inv-text-muted">' + InventoryApi.escapeHtml(item.mobile_number) + "</span></td>" +
                "<td>" + InventoryApi.escapeHtml(item.email || "—") + "</td>" +
                "<td>" + InventoryApi.escapeHtml(item.role_name || "—") + "</td>" +
                '<td class="inv-mgmt-cell--action"><div class="inv-row-actions">' +
                '<button type="button" class="inv-row-action-btn inv-row-action-btn--edit" data-user-edit="' + item.id + '" title="Edit" aria-label="Edit user">' +
                '<span class="material-symbols-outlined">edit</span></button>' +
                '<button type="button" class="inv-row-action-btn inv-row-action-btn--delete" data-user-delete="' + item.id + '" title="Remove" aria-label="Remove user">' +
                '<span class="material-symbols-outlined">delete</span></button>' +
                "</div></td></tr>"
            );
        }).join("");
    }

    function loadMembers() {
        if (!InventoryNavAccess.isOwner()) {
            members = [];
            renderRows(members);
            return Promise.resolve();
        }
        return request("?page_size=100")
            .then(function (body) {
                members = body && body.isSuccess ? (body.data.items || []) : [];
                renderRows(members);
            });
    }

    function resetForm() {
        editingId = null;
        document.getElementById("business-user-form-title").textContent = "Add User";
        document.getElementById("business-user-full-name").value = "";
        document.getElementById("business-user-email").value = "";
        document.getElementById("business-user-mobile").value = "";
        document.getElementById("business-user-password").value = "";
        document.getElementById("business-user-password-label").textContent = "Password";
        document.getElementById("business-user-password").required = true;
        toggleRolePanel(false);
        renderRoleSelect("");
    }

    function openForm(member) {
        resetForm();
        loadRoles(member && member.role_id ? member.role_id : "").then(function () {
            if (member) {
                editingId = member.id;
                document.getElementById("business-user-form-title").textContent = "Edit User";
                document.getElementById("business-user-full-name").value = member.full_name || "";
                document.getElementById("business-user-email").value = member.email || "";
                document.getElementById("business-user-mobile").value = member.mobile_number || "";
                document.getElementById("business-user-password").value = "";
                document.getElementById("business-user-password-label").textContent = "Password (leave blank to keep current)";
                document.getElementById("business-user-password").required = false;
                renderRoleSelect(member.role_id || "");
            }
            showFormView();
            document.getElementById("business-user-full-name").focus();
        });
    }

    function saveRole() {
        var name = document.getElementById("business-user-role-new-name").value.trim();
        var allowedTabs = collectRoleTabs("business-user-role-tabs");
        if (!name) {
            InventoryToast.error("Role name is required.");
            return;
        }
        if (!allowedTabs.length) {
            InventoryToast.error("Select at least one tab for this role.");
            return;
        }

        var btn = document.getElementById("business-user-role-save-btn");
        InventoryLoader.button(btn, true, "Saving...");

        rolesRequest("", {
            method: "POST",
            body: { role_name: name, allowed_tabs: allowedTabs }
        })
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    InventoryToast.success(body.message || "Role added.");
                    toggleRolePanel(false);
                    return loadRoles(body.data.id);
                }
                var err = body.message || "Unable to add role.";
                if (body.errors && body.errors.length) err = body.errors.join(" • ");
                InventoryToast.error(err);
            })
            .catch(function () {
                InventoryToast.error("Network error while saving role.");
            })
            .finally(function () {
                InventoryLoader.button(btn, false);
            });
    }

    function saveUser() {
        var roleId = document.getElementById("business-user-role").value;
        var payload = {
            full_name: document.getElementById("business-user-full-name").value.trim(),
            email: document.getElementById("business-user-email").value.trim(),
            mobile_number: document.getElementById("business-user-mobile").value.trim(),
            role_id: roleId ? Number(roleId) : null
        };
        var password = document.getElementById("business-user-password").value;
        if (!payload.full_name) {
            InventoryToast.error("Full name is required.");
            return;
        }
        if (!payload.mobile_number) {
            InventoryToast.error("Mobile number is required.");
            return;
        }
        if (!payload.role_id) {
            InventoryToast.error("Please select a role.");
            document.getElementById("business-user-role").focus();
            return;
        }
        if (!editingId && !password) {
            InventoryToast.error("Password is required.");
            return;
        }
        if (password) payload.password = password;

        var btn = document.getElementById("business-user-save-btn");
        InventoryLoader.button(btn, true, "Saving...");
        var req = editingId
            ? request("/" + editingId + "/", { method: "PATCH", body: payload })
            : request("", { method: "POST", body: payload });

        req.then(function (body) {
            if (body && body.isSuccess) {
                InventoryToast.success(body.message || "User saved.");
                showMainView();
                loadMembers();
                return;
            }
            var err = body.message || "Unable to save user.";
            if (body.errors && body.errors.length) err = body.errors.join(" • ");
            InventoryToast.error(err);
        }).catch(function () {
            InventoryToast.error("Network error. Please try again.");
        }).finally(function () {
            InventoryLoader.button(btn, false);
        });
    }

    function deleteUser(id) {
        InventoryConfirm.ask("Remove this user from the business?", function () {
            request("/" + id + "/", { method: "DELETE" })
                .then(function (body) {
                    if (body && body.isSuccess) {
                        InventoryToast.success(body.message || "User removed.");
                        loadMembers();
                        return;
                    }
                    InventoryToast.error(body.message || "Unable to remove user.");
                })
                .catch(function () {
                    InventoryToast.error("Network error. Please try again.");
                });
        });
    }

    function wireEvents() {
        var addBtn = document.getElementById("business-user-add-btn");
        var saveBtn = document.getElementById("business-user-save-btn");
        var cancelBtn = document.getElementById("business-user-cancel-btn");
        var backBtn = document.getElementById("business-user-form-back-btn");
        var roleAddBtn = document.getElementById("business-user-role-add-btn");
        var roleSaveBtn = document.getElementById("business-user-role-save-btn");
        var roleCancelBtn = document.getElementById("business-user-role-cancel-btn");
        var tbody = document.getElementById("business-users-table-body");

        if (addBtn) addBtn.addEventListener("click", function () { openForm(null); });
        if (saveBtn) saveBtn.addEventListener("click", saveUser);
        if (cancelBtn) cancelBtn.addEventListener("click", showMainView);
        if (backBtn) backBtn.addEventListener("click", showMainView);

        if (roleAddBtn) {
            roleAddBtn.addEventListener("click", function () {
                var panel = document.getElementById("business-user-role-new-panel");
                toggleRolePanel(panel.classList.contains("inv-hidden"));
            });
        }
        if (roleSaveBtn) roleSaveBtn.addEventListener("click", saveRole);
        if (roleCancelBtn) roleCancelBtn.addEventListener("click", function () { toggleRolePanel(false); });

        if (tbody) {
            tbody.addEventListener("click", function (e) {
                var editBtn = e.target.closest("[data-user-edit]");
                var deleteBtn = e.target.closest("[data-user-delete]");
                if (editBtn) {
                    var id = editBtn.getAttribute("data-user-edit");
                    var member = members.find(function (item) { return String(item.id) === String(id); });
                    if (member) openForm(member);
                }
                if (deleteBtn) {
                    deleteUser(deleteBtn.getAttribute("data-user-delete"));
                }
            });
        }

        window.addEventListener("inventory:nav-access-changed", function (e) {
            var access = e.detail;
            toggleOwnerPanel(access && access.is_owner);
            if (access && access.is_owner) {
                loadRoles();
                loadMembers();
            }
        });

        window.addEventListener("inventory:business-changed", function () {
            showMainView();
            if (InventoryNavAccess.isOwner()) {
                loadRoles();
                loadMembers();
            }
        });

        if (window.InventoryAuth && typeof InventoryAuth.wireMobileInput === "function") {
            InventoryAuth.wireMobileInput(document.getElementById("business-user-mobile"));
        }
    }

    function init() {
        if (init._wired) return;
        init._wired = true;
        wireEvents();
        loadTabOptions().then(function () {
            toggleOwnerPanel(InventoryNavAccess.isOwner());
            if (InventoryNavAccess.isOwner()) {
                loadRoles();
                loadMembers();
            }
        });
    }

    return { init: init };
})();
