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

    var USERS_LIST_PANEL = "users-list-panel";
    var USERS_VIEW_PANEL = "users-view-panel";

    function formatDate(value) {
        if (value === null || value === undefined || String(value).trim() === "") return "—";
        var d = new Date(value);
        if (isNaN(d.getTime())) return "—";
        return d.toLocaleDateString(undefined, {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    }

    function displayValue(value) {
        if (value === null || value === undefined || String(value).trim() === "") return "—";
        return escapeHtml(String(value));
    }

    function renderRows(items) {
        var tbody = document.getElementById("users-table-body");
        if (!tbody) return;

        if (!items || !items.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="inv-mgmt-empty">No users found.</td></tr>';
            return;
        }

        tbody.innerHTML = items.map(function (user) {
            var roles = (user.roles && user.roles.length) ? user.roles.join(", ") : "—";
            var isActive = user.is_active;
            var statusClass = isActive ? "inv-status-badge--active" : "inv-status-badge--inactive";
            var statusText = isActive ? "Active" : "Inactive";
            var actionIcon = isActive ? "block" : "check_circle";
            var actionTooltip = isActive ? "Deactivate user" : "Activate user";
            var toggleClass = isActive
                ? "inv-user-toggle-btn--deactivate"
                : "inv-user-toggle-btn--activate";

            return (
                "<tr data-user-id=\"" + user.id + "\">" +
                "<td>" + displayValue(user.full_name) + "</td>" +
                "<td>" + displayValue(user.email) + "</td>" +
                "<td>" + displayValue(user.mobile_number) + "</td>" +
                "<td>" + escapeHtml(formatDate(user.created_at)) + "</td>" +
                "<td>" + escapeHtml(formatDate(user.approved_at)) + "</td>" +
                "<td>" + escapeHtml(roles) + "</td>" +
                "<td><span class=\"inv-status-badge " + statusClass + "\">" + statusText + "</span></td>" +
                '<td class="inv-mgmt-cell--action"><div class="inv-row-actions">' +
                '<button type="button" class="inv-row-action-btn inv-row-action-btn--view inv-user-view" data-id="' + user.id + '" ' +
                'title="View" aria-label="View user">' +
                '<span class="material-symbols-outlined">visibility</span></button>' +
                '<button type="button" class="inv-row-action-btn inv-user-toggle-btn ' + toggleClass + '" ' +
                'data-id="' + user.id + '" data-active="' + isActive + '" ' +
                'title="' + actionTooltip + '" aria-label="' + actionTooltip + '">' +
                '<span class="material-symbols-outlined">' + actionIcon + "</span></button>" +
                '<button type="button" class="inv-row-action-btn inv-row-action-btn--delete inv-user-delete" ' +
                'data-id="' + user.id + '" data-name="' + escapeHtml(user.full_name) + '" ' +
                'title="Delete" aria-label="Delete user">' +
                '<span class="material-symbols-outlined">delete</span></button>' +
                "</div></td>" +
                "</tr>"
            );
        }).join("");
    }

    function buildQuery(search, page) {
        var params = new URLSearchParams();
        params.set("page", String(page || 1));
        params.set("page_size", String(InventoryPagination.getPageSize("users-pagination")));
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
                    }, {
                        onPageSizeChange: function () {
                            loadUsers(currentSearch, 1);
                        }
                    });
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

    function renderDetailField(label, value, options) {
        options = options || {};
        var cls = options.full ? " inv-product-view-item--full" : "";
        var content = options.html ? value : displayValue(value);
        return (
            '<div class="inv-product-view-item' + cls + '">' +
            '<span class="inv-product-view-label">' + label + "</span>" +
            '<div class="inv-product-view-value">' + content + "</div>" +
            "</div>"
        );
    }

    function renderUserDetail(user) {
        var container = document.getElementById("user-detail-body");
        var businessesWrap = document.getElementById("user-detail-businesses-wrap");
        var titleEl = document.getElementById("user-detail-title");
        if (!container || !businessesWrap) return;

        if (titleEl) {
            titleEl.textContent = user.full_name || "User Details";
        }

        var roles = (user.roles && user.roles.length) ? user.roles.join(", ") : "—";
        var isActive = user.is_active;
        var statusClass = isActive ? "inv-status-badge--active" : "inv-status-badge--inactive";
        var statusText = isActive ? "Active" : "Inactive";
        var profileHtml = "—";

        if (user.profile_image_url) {
            profileHtml =
                '<img src="' + escapeHtml(user.profile_image_url) + '" alt="" class="inv-user-detail-avatar">';
        }

        container.innerHTML = [
            renderDetailField("Full Name", user.full_name),
            renderDetailField("Email", user.email),
            renderDetailField("Mobile", user.mobile_number),
            renderDetailField("Role", roles),
            renderDetailField(
                "Status",
                '<span class="inv-status-badge ' + statusClass + '">' + statusText + "</span>",
                { html: true }
            ),
            renderDetailField("Registered", formatDate(user.created_at)),
            renderDetailField("Approved", formatDate(user.approved_at)),
            renderDetailField("Profile Photo", profileHtml, { html: true })
        ].join("");

        var businesses = user.businesses || [];
        if (!businesses.length) {
            businessesWrap.innerHTML =
                '<h4 class="inv-mgmt-view-section-title">Businesses</h4>' +
                '<p class="inv-mgmt-empty" style="padding:8px 0;">No businesses created yet.</p>';
            return;
        }

        businessesWrap.innerHTML =
            '<div class="inv-mgmt-view-section">' +
            '<h4 class="inv-mgmt-view-section-title">Businesses (' + businesses.length + ")</h4>" +
            '<div class="inv-mgmt-table-wrap">' +
            '<table class="inv-mgmt-table">' +
            "<thead><tr>" +
            "<th>Business Name</th><th>GST</th><th>Phone</th><th>Email</th><th>Address</th><th>Status</th><th>Created</th>" +
            "</tr></thead><tbody>" +
            businesses.map(function (business) {
                var bizStatusClass = business.is_active
                    ? "inv-status-badge--active"
                    : "inv-status-badge--inactive";
                var bizStatusText = business.is_active ? "Active" : "Inactive";
                return (
                    "<tr>" +
                    "<td>" + displayValue(business.business_name) + "</td>" +
                    "<td>" + displayValue(business.gst_number) + "</td>" +
                    "<td>" + displayValue(business.phone) + "</td>" +
                    "<td>" + displayValue(business.email) + "</td>" +
                    "<td>" + displayValue(business.address) + "</td>" +
                    "<td><span class=\"inv-status-badge " + bizStatusClass + "\">" + bizStatusText + "</span></td>" +
                    "<td>" + escapeHtml(formatDate(business.created_at)) + "</td>" +
                    "</tr>"
                );
            }).join("") +
            "</tbody></table></div></div>";
    }

    function openUserDetail(userId) {
        InventoryLoader.show();
        return request("/" + userId + "/")
            .then(function (body) {
                if (body && body.isSuccess && body.data) {
                    renderUserDetail(body.data);
                    InventoryPagePanel.showPanel(USERS_LIST_PANEL, USERS_VIEW_PANEL);
                    return;
                }
                InventoryToast.error(body.message || "Failed to load user details.");
            })
            .catch(function () {
                InventoryToast.error("Network error while loading user details.");
            })
            .finally(function () {
                InventoryLoader.hide();
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
                var viewBtn = e.target.closest(".inv-user-view");
                if (viewBtn && !viewBtn.disabled) {
                    openUserDetail(viewBtn.getAttribute("data-id"));
                    return;
                }

                var deleteBtn = e.target.closest(".inv-user-delete");
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

                var toggleBtn = e.target.closest(
                    ".inv-user-toggle-btn--activate, .inv-user-toggle-btn--deactivate"
                );
                if (!toggleBtn || toggleBtn.disabled) return;

                var userId = toggleBtn.getAttribute("data-id");
                var isActive = toggleBtn.getAttribute("data-active") === "true";
                var activate = !isActive;

                InventoryLoader.button(toggleBtn, true, "");
                toggleUserStatus(userId, activate, toggleBtn);
            });
        }
    }

    return { init: init };
})();
