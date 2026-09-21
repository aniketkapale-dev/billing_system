"""
Generate 4-page e-Way Bill integration guide for DailyBasket Billing System.
Run: python scripts/generate_eway_bill_guide.py
Output: docs/EWay_Bill_Integration_Guide.pptx
"""

from pathlib import Path

from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN

OUTPUT = Path(__file__).resolve().parent.parent / "docs" / "EWay_Bill_Integration_Guide.pptx"

GREEN = RGBColor(0x2E, 0x7D, 0x32)
DARK = RGBColor(0x1A, 0x1A, 0x2E)
GRAY = RGBColor(0x55, 0x55, 0x55)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
LIGHT_BG = RGBColor(0xF5, 0xF9, 0xF5)
AMBER = RGBColor(0xE6, 0x5C, 0x00)


def set_slide_bg(slide, color):
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = color


def add_title_slide(prs, title, subtitle=""):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_bg(slide, GREEN)

    box = slide.shapes.add_textbox(Inches(0.8), Inches(2.0), Inches(8.4), Inches(1.8))
    tf = box.text_frame
    p = tf.paragraphs[0]
    p.text = title
    p.font.size = Pt(36)
    p.font.bold = True
    p.font.color.rgb = WHITE
    p.alignment = PP_ALIGN.CENTER

    if subtitle:
        box2 = slide.shapes.add_textbox(Inches(0.8), Inches(3.9), Inches(8.4), Inches(1.6))
        tf2 = box2.text_frame
        tf2.word_wrap = True
        p2 = tf2.paragraphs[0]
        p2.text = subtitle
        p2.font.size = Pt(18)
        p2.font.color.rgb = WHITE
        p2.alignment = PP_ALIGN.CENTER


def add_page_slide(prs, page_num, title, bullets, note=""):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_bg(slide, LIGHT_BG)

    bar = slide.shapes.add_shape(1, Inches(0), Inches(0), Inches(10), Inches(1.05))
    bar.fill.solid()
    bar.fill.fore_color.rgb = GREEN
    bar.line.fill.background()

    page_box = slide.shapes.add_textbox(Inches(8.6), Inches(0.2), Inches(1.2), Inches(0.5))
    pp = page_box.text_frame.paragraphs[0]
    pp.text = f"Page {page_num}/4"
    pp.font.size = Pt(12)
    pp.font.color.rgb = WHITE
    pp.alignment = PP_ALIGN.RIGHT

    title_box = slide.shapes.add_textbox(Inches(0.5), Inches(0.15), Inches(8.0), Inches(0.75))
    tp = title_box.text_frame.paragraphs[0]
    tp.text = title
    tp.font.size = Pt(24)
    tp.font.bold = True
    tp.font.color.rgb = WHITE

    body = slide.shapes.add_textbox(Inches(0.55), Inches(1.25), Inches(8.9), Inches(5.5))
    tf = body.text_frame
    tf.word_wrap = True

    for i, item in enumerate(bullets):
        if i == 0:
            p = tf.paragraphs[0]
        else:
            p = tf.add_paragraph()
        if isinstance(item, tuple):
            text, level = item
            p.text = text
            p.level = level
        else:
            p.text = item
            p.level = 0
        p.font.size = Pt(16 if p.level == 0 else 14)
        p.font.color.rgb = DARK
        p.space_after = Pt(8)

    if note:
        note_box = slide.shapes.add_textbox(Inches(0.55), Inches(6.55), Inches(8.9), Inches(0.55))
        np = note_box.text_frame.paragraphs[0]
        np.text = note
        np.font.size = Pt(12)
        np.font.italic = True
        np.font.color.rgb = GRAY


def build_presentation():
    prs = Presentation()
    prs.slide_width = Inches(10)
    prs.slide_height = Inches(7.5)

    add_title_slide(
        prs,
        "e-Way Bill Integration Guide",
        "How to generate e-Way Bills after invoice creation\n"
        "DailyBasket Billing System — R&D & Recommended Approach\n"
        "September 2026",
    )

    # Page 1 — What & When
    add_page_slide(
        prs,
        1,
        "Page 1 — What Is an e-Way Bill & When Is It Required?",
        [
            "An e-Way Bill (EWB) is a GST document required when goods move by road/rail/air/ship. "
            "It is issued electronically on the NIC/GSTN portal and must be carried by the person in charge of the vehicle.",
            "",
            "When mandatory (Rule 138, CGST Rules):",
            ("• Consignment value exceeds ₹50,000 (including tax) for supply or other movement", 1),
            ("• Applies to inter-state movement at ₹50,000; intra-state limits vary by state (often ₹50,000–₹1,00,000)", 1),
            ("• Can be generated voluntarily below ₹50,000 if the business chooses", 1),
            "",
            "What the printed e-Way Bill contains (as in your sample):",
            ("• EWB number, QR code, generated date, valid upto date", 1),
            ("• Supplier (From) & recipient (To) GSTIN, name, state, dispatch/ship-to address", 1),
            ("• Document type & invoice number, transport mode, distance, transaction type", 1),
            ("• Line items: HSN, product description, quantity, taxable value, tax rate (CGST/SGST/IGST)", 1),
            "",
            "Not required when: only services (no goods movement), exempt goods, or specific notified exceptions.",
        ],
        note="Official docs: docs.ewaybillgst.gov.in | ewaybillgst.gov.in",
    )

    # Page 2 — Prerequisites
    add_page_slide(
        prs,
        2,
        "Page 2 — Prerequisites & Requirements (Before Integration)",
        [
            "A. Business / legal prerequisites:",
            ("• Active GSTIN registered on e-Way Bill portal (ewaybillgst.gov.in)", 1),
            ("• Portal login credentials (username + password) for API authentication", 1),
            ("• API access: enroll as taxpayer for API on portal OR sign up with a licensed GSP (e.g. MasterGST, ClearTax)", 1),
            ("• Sandbox testing credentials before going live", 1),
            "",
            "B. Master data your billing system must store:",
            ("• Business: GSTIN, legal name, address, state code, pin code", 1),
            ("• Customer: GSTIN (B2B), billing & shipping address, state, pin code, place of supply", 1),
            ("• Product: HSN code (mandatory — EWB cannot be generated with only SAC/service codes)", 1),
            ("• Invoice: finalized invoice no., date, line qty, taxable value, tax split (CGST/SGST/IGST)", 1),
            "",
            "C. Transport details (Part B of EWB-01):",
            ("• Mode: Road / Rail / Air / Ship", 1),
            ("• Approx. distance (km) — validated against pin-to-pin distance (±10% rule)", 1),
            ("• Vehicle number OR transporter ID (if goods handed to transporter)", 1),
            "",
            "D. Current system gaps (DailyBasket today):",
            ("• Transport / cartons / e-Way Bill no. are print-only fields in browser localStorage — not saved in database", 1),
            ("• No HSN on products, no API integration, no EWB PDF/QR generation", 1),
        ],
        note="Blocked GSTIN (non-filing) will reject e-Way Bill generation at API level.",
    )

    # Page 3 — Best approach (R&D)
    add_page_slide(
        prs,
        3,
        "Page 3 — Recommended Approach (R&D Summary)",
        [
            "Three integration options evaluated:",
            "",
            "Option A — Direct NIC/GSTN API (docs.ewaybillgst.gov.in)",
            ("• Site-to-site integration; full control; no per-call GSP fee", 1),
            ("• Complex: encrypted auth, app key, token refresh, strict validations (2025 rules)", 1),
            ("• Best for large ERP vendors with dedicated compliance team", 1),
            "",
            "Option B — GSP / ASP provider (RECOMMENDED for DailyBasket)",
            ("• Licensed providers (MasterGST, ClearTax, etc.) expose REST JSON APIs", 1),
            ("• Faster integration, sandbox, error dashboards, usage billing", 1),
            ("• Your Django backend calls GSP → GSP calls GSTN → returns EWB no. + QR data", 1),
            "",
            "Option C — Generate via e-Invoice IRN",
            ("• If invoice is e-invoiced (IRN generated), EWB can be created from same IRN", 1),
            ("• Only applicable if business is under e-invoicing mandate (turnover threshold)", 1),
            "",
            "Recommended phased plan:",
            ("Phase 1: Add HSN, pin codes, persist transport/EWB fields on invoice (DB)", 1),
            ("Phase 2: Backend service + GSP API — Generate EWB from finalized sale invoice", 1),
            ("Phase 3: UI button on invoice + print/download EWB PDF with QR code", 1),
            ("Phase 4 (optional): Part-B update, cancel, extend validity, consolidated EWB", 1),
        ],
        note="Recommended: Option B (GSP) — best balance of speed, compliance, and maintainability.",
    )

    # Page 4 — User flow & implementation
    add_page_slide(
        prs,
        4,
        "Page 4 — Proposed User Flow & Next Steps",
        [
            "Proposed flow after implementation:",
            ("1. User creates & finalizes GST invoice (Create Invoice page — already exists)", 1),
            ("2. System checks: goods invoice, value ≥ ₹50,000 (or user chooses), HSN present", 1),
            ("3. User clicks “Generate e-Way Bill” on invoice row / invoice detail", 1),
            ("4. Modal collects: transport mode, distance, vehicle no. or transporter ID, ship-to if different", 1),
            ("5. Backend builds EWB payload from invoice + business + customer data → calls GSP API", 1),
            ("6. On success: save EWB no., valid upto, QR; show on invoice print; download/print EWB PDF", 1),
            ("7. On failure: show GSTN error (invalid GSTIN, distance, missing HSN, blocked taxpayer)", 1),
            "",
            "Technical architecture (clean layers):",
            ("• apps/ewaybill/ — models (EwayBillRecord), service, GSP client, serializers", 1),
            ("• POST /api/purchases/{id}/generate-ewaybill/ — controller", 1),
            ("• purchases.js — button + modal; document-export.js — EWB section on print", 1),
            "",
            "Immediate action items:",
            ("1. Confirm: Is business under e-invoicing? Choose GSP vendor & get sandbox keys", 1),
            ("2. Add HSN field to Product model + mandatory validation for EWB-eligible sales", 1),
            ("3. Move transport/EWB fields from localStorage to Purchase model", 1),
            ("4. Pilot in sandbox with 2–3 test invoices before production API keys", 1),
        ],
        note="Est. effort: Phase 1 (data model) ~3–5 days | Phase 2–3 (API + UI) ~2–3 weeks with GSP sandbox.",
    )

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    prs.save(str(OUTPUT))
    print(f"Created: {OUTPUT}")
    return OUTPUT


if __name__ == "__main__":
    build_presentation()
