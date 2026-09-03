BUSINESS_TAB_DEFINITIONS = [
    {"code": "dashboard", "label": "Dashboard", "group": "General"},
    {"code": "products", "label": "Items", "group": "Manage Products"},
    {"code": "products-units", "label": "Units", "group": "Manage Products"},
    {"code": "products-categories", "label": "Categories", "group": "Manage Products"},
    {"code": "products-brands", "label": "Brands", "group": "Manage Products"},
    {"code": "stock-in", "label": "Purchase (Stock In)", "group": "Inventory"},
    {"code": "stock-in-vendors", "label": "Vendors", "group": "Inventory"},
    {"code": "inventory", "label": "Stock", "group": "Inventory"},
    {"code": "purchases", "label": "Create Invoice", "group": "Manage Sales"},
    {"code": "customers", "label": "Customers", "group": "Manage Sales"},
    {"code": "settings-tax", "label": "Tax", "group": "Settings"},
    {"code": "settings-invoice", "label": "Invoice", "group": "Settings"},
]

ALL_BUSINESS_TAB_CODES = [item["code"] for item in BUSINESS_TAB_DEFINITIONS]

OWNER_ONLY_TAB_CODES = {"business"}
