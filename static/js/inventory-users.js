/**
 * Superadmin users list — activate / deactivate accounts.
 */
var InventoryUsers = (function () {
    "use strict";

    var API = "/api/users";
    var TOKEN_KEY = "vrms_access_token";
    var PAGE_SIZE = (window.InventoryConstants && InventoryConstants.PAGE_SIZE) || 10;
    var searchTimer = null;
    var currentPage = 1;
    var currentSearch = "";

    function getToken() {
        return localStorage.getItem(TOKEN_KEY);
    }

    function authHeaders() {
        var headers = { "Content-Type": "application/json" };
        var token = getToken();
        if (token) headers["Authorization"] = "Bearer " + token;
        return headers;
    }

    function request(path, opts) {
        opts = opts || {};
        return fetch(InventoryApi.buildUrl(API, path), {
            method: opts.method || "GET",
            headers: authHeaders(),
            body: opts.body ? JSON.stringify(opts.body) : undefined,
            cache: "no-store"
        }).then(function (res) {
            return res.json();
        });
    }

    function escapeHtml(str) {
        var div = document.createElement("div");
        div.textContent = str == null ? "" : String(str);
        return div.innerHTML;
    }

    function renderRows(items) {
        var tbody = document.getElementById("users-table-body");
        if (!tbody) return;

        if (!items || !items.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="inv-users-empty">No users found.</td></tr>';
            return;
        }

        tbody.innerHTML = items.map(function (user) {
            var roles = (user.roles && user.roles.length) ? user.roles.join(", ") : "—";
            var isActive = user.is_active;
            var statusClass = isActive ? "inv-status-badge--active" : "inv-status-badge--inactive";
            var statusText = isActive ? "Active" : "Inactive";
            var actionIcon = isActive ? "block" : "check_circle";
            var actionTooltip = isActive ? "Deactivate user" : "Activate user";
            var actionClass = isActive ? "inv-user-action-btn--deactivate" : "inv-user-action-btn--activate";

            return (
                "<tr data-user-id=\"" + user.id + "\">" +
                "<td>" + escapeHtml(user.full_name) + "</td>" +
                "<td>" + escapeHtml(user.email) + "</td>" +
                "<td>" + escapeHtml(user.mobile_number) + "</td>" +
                "<td>" + escapeHtml(roles) + "</td>" +
                "<td><span class=\"inv-status-badge " + statusClass + "\">" + statusText + "</span></td>" +
                "<td class=\"inv-users-actions\">" +
                "<button type=\"button\" class=\"inv-user-action-btn inv-user-action-btn--icon inv-tooltip " + actionClass + "\" " +
                "data-id=\"" + user.id + "\" data-active=\"" + isActive + "\" " +
                "data-tooltip=\"" + actionTooltip + "\" aria-label=\"" + actionTooltip + "\">" +
                "<span class=\"material-symbols-outlined\">" + actionIcon + "</span></button>" +
                "<button type=\"button\" class=\"inv-user-action-btn inv-user-action-btn--icon inv-user-action-btn--delete inv-tooltip\" " +
                "data-id=\"" + user.id + "\" data-name=\"" + escapeHtml(user.full_name) + "\" " +
                "data-tooltip=\"Delete user\" aria-label=\"Delete user\">" +
                "<span class=\"material-symbols-outlined\">delete</span></button>" +
                "</td>" +
                "</tr>"
            );
        }).join("");
    }

    function buildQuery(search, page) {
        var params = new URLSearchParams();
        params.set("page", String(page || 1));
        params.set("page_size", String(PAGE_SIZE));
        if (search) params.set("search", search);
        return "?" + params.toString();
    }

    function loadUsers(search, page) {
        currentSearch = search || "";
        currentPage = page || 1;

        InventoryLoader.show();
        return request(buildQuery(currentSearch, currentPage))
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    renderRows(body.data.items || []);
                    InventoryPagination.render("users-pagination", body.data.pagination, function (p) {
                        loadUsers(currentSearch, p);
                    }, { label: "users" });
                } else {
                    renderRows([]);
                    InventoryPagination.render("users-pagination", null, function () {});
                    InventoryToast.error(body.message || "Failed to load users.");
                }
            })
            .catch(function () {
                renderRows([]);
                InventoryPagination.render("users-pagination", null, function () {});
                InventoryToast.error("Network error while loading users.");
            })
            .finally(function () {
                InventoryLoader.hide();
            });
    }

    function toggleUserStatus(userId, activate, btn) {
        return request("/" + userId + "/", {
            method: "PATCH",
            body: { is_active: activate }
        })
            .then(function (body) {
                if (body && body.isSuccess) {
                    InventoryToast.success(activate ? "User activated successfully." : "User deactivated successfully.");
                    return loadUsers(currentSearch, currentPage);
                }
                InventoryToast.error(body.message || "Unable to update user status.");
            })
            .catch(function () {
                InventoryToast.error("Network error. Please try again.");
            })
            .finally(function () {
                if (btn) InventoryLoader.button(btn, false);
            });
    }

    function deleteUser(userId, btn) {
        return fetch(InventoryApi.buildUrl(API, "/" + userId + "/"), {
            method: "DELETE",
            headers: authHeaders(),
            cache: "no-store"
        })
            .then(function (res) {
                return res.json();
            })
            .then(function (body) {
                if (body && body.isSuccess) {
                    InventoryToast.success("User deleted successfully.");
                    return loadUsers(currentSearch, currentPage);
                }
                InventoryToast.error(body.message || "Unable to delete user.");
            })
            .catch(function () {
                InventoryToast.error("Network error. Please try again.");
            })
            .finally(function () {
                if (btn) InventoryLoader.button(btn, false);
            });
    }

    function init() {
        var tbody = document.getElementById("users-table-body");
        var searchEl = document.getElementById("users-search");

        loadUsers("", 1);

        if (searchEl) {
            searchEl.addEventListener("input", function () {
                window.clearTimeout(searchTimer);
                searchTimer = window.setTimeout(function () {
                    loadUsers(searchEl.value.trim(), 1);
                }, 300);
            });
        }

        if (tbody) {
            tbody.addEventListener("click", function (e) {
                var deleteBtn = e.target.closest(".inv-user-action-btn--delete");
                if (deleteBtn && !deleteBtn.disabled) {
                    var deleteId = deleteBtn.getAttribute("data-id");
                    var userName = deleteBtn.getAttribute("data-name") || "this user";

                    InventoryConfirm.delete({
                        title: "Delete user?",
                        message: "Are you sure you want to delete " + userName + "? This action cannot be undone."
                    }).then(function (confirmed) {
                        if (!confirmed) return;
                        InventoryLoader.button(deleteBtn, true);
                        deleteUser(deleteId, deleteBtn);
                    });
                    return;
                }

                var btn = e.target.closest(".inv-user-action-btn");
                if (!btn || btn.disabled) return;

                var userId = btn.getAttribute("data-id");
                var isActive = btn.getAttribute("data-active") === "true";
                var activate = !isActive;

                InventoryLoader.button(btn, true, "");
                toggleUserStatus(userId, activate, btn);
            });
        }
    }

    return { init: init };
})();
