define("dashboard", function (require, module, exports) {
    "use strict";
    var api = require("api");
    var helpers = require("helpers");
    var toast = require("toast");

    // Users / Roles / User-Roles intentionally hidden from the UI.
    // `link` makes each card clickable and routes to the matching module page.
    var CARDS = [
        { key: "vehicle_types", label: "Vehicle Types", icon: "bi-tags-fill", color: "amber", link: "/vehicle-types/?tab=types" },
        { key: "vehicle_categories", label: "Vehicle Categories", icon: "bi-collection-fill", color: "purple", link: "/vehicle-types/?tab=categories" },
        { key: "fuel_types", label: "Fuel Types", icon: "bi-droplet-fill", color: "danger", link: "/vehicle-types/?tab=fuels" },
        { key: "pickup_locations", label: "Pickup Locations", icon: "bi-geo-alt-fill", color: "teal", link: "/pickup-locations/" },
        { key: "vehicles", label: "Total Vehicles", icon: "bi-car-front-fill", color: "primary", link: "/vehicles/" },
        { key: "rented_vehicles", label: "Booking Requests", icon: "bi-car-front", color: "warning", link: "/rented-vehicles/" },
        { key: "active_rentals", label: "Ongoing Rentals", icon: "bi-check2-circle", color: "success", link: "/active-rentals/" },
        { key: "enquiries", label: "Enquiries", icon: "bi-chat-dots-fill", color: "info", link: "/enquiries/" },
        { key: "active_vehicles", label: "Active Vehicles", icon: "bi-check2-circle", color: "success", link: "/vehicles/" },
        { key: "inactive_vehicles", label: "Inactive Vehicles", icon: "bi-pause-circle", color: "slate", link: "/vehicles/" }
    ];

    function skeletons() {
        var grid = document.getElementById("stat-cards");
        grid.innerHTML = CARDS.map(function () {
            return '<div class="stat-card skeleton"><div class="sk-line"></div><div class="sk-line short"></div></div>';
        }).join("");
    }

    function renderCards(totals) {
        var grid = document.getElementById("stat-cards");
        grid.innerHTML = CARDS.map(function (card, i) {
            return '' +
                '<a href="' + card.link + '" class="stat-card stat-' + card.color + ' fade-in-up" style="animation-delay:' + (i * 0.07) + 's">' +
                    '<div class="stat-icon"><i class="bi ' + card.icon + '"></i></div>' +
                    '<div class="stat-body">' +
                        '<div class="stat-value" data-count="' + (totals[card.key] || 0) + '">0</div>' +
                        '<div class="stat-label">' + card.label + '</div>' +
                    '</div>' +
                    '<i class="bi bi-arrow-right-short stat-go"></i>' +
                '</a>';
        }).join("");
        animateCounters();
    }

    function animateCounters() {
        document.querySelectorAll(".stat-value[data-count]").forEach(function (el) {
            var target = parseInt(el.getAttribute("data-count"), 10) || 0;
            if (target === 0) { el.textContent = "0"; return; }
            var step = Math.max(1, Math.ceil(target / 30));
            var current = 0;
            var timer = setInterval(function () {
                current += step;
                if (current >= target) { current = target; clearInterval(timer); }
                el.textContent = current;
            }, 25);
        });
    }

    function renderRecentVehicles(rows) {
        var tbody = document.getElementById("recent-vehicles");
        tbody.innerHTML = (rows || []).map(function (v) {
            return "<tr><td>" + helpers.escapeHtml(v.vehicle_name) + "</td><td>" +
                helpers.escapeHtml(v.vehicle_type) + "</td><td>" + helpers.formatDate(v.created_at) + "</td></tr>";
        }).join("") ||
            '<tr><td colspan="3"><div class="empty-state sm"><i class="bi bi-inbox"></i><p>No vehicles yet</p></div></td></tr>';
    }

    function init() {
        var msg = sessionStorage.getItem("login_success");
        if (msg) {
            sessionStorage.removeItem("login_success");
            toast.success(msg);
        }
        skeletons();
        api.get("/dashboard/stats/").then(function (body) {
            if (!body || !body.isSuccess) return;
            renderCards(body.data.totals || {});
            renderRecentVehicles(body.data.recent_vehicles);
        });
    }

    module.exports = { init: init };
});
