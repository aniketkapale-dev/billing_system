define("excel", function (require, module, exports) {
    "use strict";
    var toast = require("toast");

    /**
     * Exports an array of row objects to .xlsx using SheetJS.
     * columns: [{ key, label }]; rows: array of plain objects.
     */
    function exportRows(filename, columns, rows) {
        if (typeof XLSX === "undefined") {
            toast.error("Excel library not loaded.");
            return;
        }
        if (!rows || !rows.length) {
            toast.warning("Nothing to export.");
            return;
        }

        var header = columns.map(function (c) { return c.label; });
        var data = rows.map(function (row) {
            return columns.map(function (c) {
                var val = row[c.key];
                if (Array.isArray(val)) val = val.join(", ");
                if (val === null || val === undefined) val = "";
                return val;
            });
        });

        var sheet = XLSX.utils.aoa_to_sheet([header].concat(data));
        var book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, sheet, "Data");
        XLSX.writeFile(book, filename + "_" + Date.now() + ".xlsx");
        toast.success("Export started.");
    }

    module.exports = { exportRows: exportRows };
});
