"use node";
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from "pdf-lib";

// ── ACORD 25-style Certificate of Insurance PDF ──

interface CoiInput {
  certificateDate: string;
  producerName: string;
  producerAddress?: string;
  producerPhone?: string;
  producerEmail?: string;
  insurerName: string;
  insuredName: string;
  insuredAddress?: string;
  policyNumber: string;
  policyType: string;
  effectiveDate: string;
  expirationDate: string;
  coverages: Array<{ name: string; limit?: string; deductible?: string }>;
  holderName: string;
  holderAddress?: string;
  purpose?: string;
}

// Colors
const BLACK = rgb(0, 0, 0);
const DARK = rgb(0.15, 0.15, 0.15);
const LABEL_GRAY = rgb(0.4, 0.4, 0.4);
const LINE_GRAY = rgb(0.7, 0.7, 0.7);
const HEADER_BG = rgb(0.15, 0.22, 0.35);
const SECTION_BG = rgb(0.95, 0.95, 0.95);
const WHITE = rgb(1, 1, 1);

function hLine(page: PDFPage, x: number, y: number, w: number, thickness = 0.5) {
  page.drawLine({ start: { x, y }, end: { x: x + w, y }, thickness, color: LINE_GRAY });
}

function vLine(page: PDFPage, x: number, y: number, h: number, thickness = 0.5) {
  page.drawLine({ start: { x, y }, end: { x, y: y - h }, thickness, color: LINE_GRAY });
}

function box(page: PDFPage, x: number, y: number, w: number, h: number, fill?: any) {
  if (fill) {
    page.drawRectangle({ x, y: y - h, width: w, height: h, color: fill });
  }
  // Draw border lines
  hLine(page, x, y, w);
  hLine(page, x, y - h, w);
  vLine(page, x, y, h);
  vLine(page, x + w, y, h);
}

function label(page: PDFPage, font: PDFFont, text: string, x: number, y: number) {
  page.drawText(text, { x, y, size: 6, font, color: LABEL_GRAY });
}

function value(page: PDFPage, font: PDFFont, text: string, x: number, y: number, size = 8.5) {
  page.drawText(text, { x, y, size, font, color: DARK });
}

function boldValue(page: PDFPage, font: PDFFont, text: string, x: number, y: number, size = 8.5) {
  page.drawText(text, { x, y, size, font, color: BLACK });
}

export async function generateCoiPdf(input: CoiInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // US Letter
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const m = 40; // margin
  const w = 612 - 2 * m; // content width
  let y = 792 - m;

  // ═══════════════════════════════════════════════════
  // HEADER BAR
  // ═══════════════════════════════════════════════════
  const headerH = 36;
  page.drawRectangle({ x: m, y: y - headerH, width: w, height: headerH, color: HEADER_BG });
  page.drawText("CERTIFICATE OF INSURANCE", {
    x: m + 12, y: y - 23, size: 16, font: bold, color: WHITE,
  });
  page.drawText(input.certificateDate, {
    x: m + w - 80, y: y - 23, size: 10, font: regular, color: WHITE,
  });
  y -= headerH + 2;

  // Disclaimer
  page.drawText(
    "This certificate is issued as a matter of information only and confers no rights upon the certificate holder.",
    { x: m + 2, y: y - 10, size: 5.5, font: regular, color: LABEL_GRAY }
  );
  y -= 16;

  // ═══════════════════════════════════════════════════
  // PRODUCER / INSURED
  // ═══════════════════════════════════════════════════
  const topRowH = 76;
  const colW = w / 2;

  box(page, m, y, colW, topRowH);
  box(page, m + colW, y, colW, topRowH);

  // Producer
  label(page, bold, "PRODUCER", m + 6, y - 10);
  boldValue(page, bold, input.producerName, m + 6, y - 24, 9);
  let py = y - 38;
  if (input.producerAddress) {
    // Split address into lines
    const lines = input.producerAddress.split("\n").length > 1
      ? input.producerAddress.split("\n")
      : input.producerAddress.split(",").map(s => s.trim());
    for (const line of lines) {
      value(page, regular, line, m + 6, py);
      py -= 12;
    }
  }
  if (input.producerPhone) { value(page, regular, `Tel  ${input.producerPhone}`, m + 6, py); py -= 11; }
  if (input.producerEmail) { value(page, regular, input.producerEmail, m + 6, py); }

  // Insured
  const ix = m + colW + 6;
  label(page, bold, "INSURED", ix, y - 10);
  boldValue(page, bold, input.insuredName, ix, y - 24, 9);
  if (input.insuredAddress) {
    const addrParts = input.insuredAddress.split(",").map(s => s.trim());
    addrParts.forEach((part, i) => {
      value(page, regular, part, ix, y - 38 - (i * 12));
    });
  }

  y -= topRowH + 2;

  // ═══════════════════════════════════════════════════
  // INSURER(S) AFFORDING COVERAGE
  // ═══════════════════════════════════════════════════
  const insurerH = 28;
  box(page, m, y, w, insurerH, SECTION_BG);
  label(page, bold, "INSURER(S) AFFORDING COVERAGE", m + 6, y - 10);
  boldValue(page, bold, `INSURER A:  ${input.insurerName}`, m + 6, y - 22, 8.5);
  y -= insurerH + 2;

  // ═══════════════════════════════════════════════════
  // POLICY SUMMARY
  // ═══════════════════════════════════════════════════
  const policyHeaderH = 14;
  box(page, m, y, w, policyHeaderH, HEADER_BG);
  page.drawText("COVERAGES", { x: m + 6, y: y - 10, size: 7, font: bold, color: WHITE });
  y -= policyHeaderH;

  // Column headers
  const colHeaderH = 14;
  box(page, m, y, w, colHeaderH, SECTION_BG);

  const cols = [
    { label: "TYPE OF INSURANCE", x: m + 6 },
    { label: "POLICY NUMBER", x: m + 170 },
    { label: "EFFECTIVE", x: m + 310 },
    { label: "EXPIRATION", x: m + 400 },
  ];
  for (const col of cols) {
    label(page, bold, col.label, col.x, y - 10);
  }
  y -= colHeaderH;

  // Policy row
  const policyRowH = 18;
  box(page, m, y, w, policyRowH);
  boldValue(page, bold, input.policyType, m + 6, y - 12, 8);
  value(page, regular, input.policyNumber, m + 170, y - 12, 8);
  value(page, regular, input.effectiveDate, m + 310, y - 12, 8);
  value(page, regular, input.expirationDate, m + 400, y - 12, 8);
  y -= policyRowH + 2;

  // ═══════════════════════════════════════════════════
  // COVERAGES TABLE
  // ═══════════════════════════════════════════════════
  const covHeaderH = 14;
  box(page, m, y, w, covHeaderH, SECTION_BG);
  label(page, bold, "COVERAGE", m + 6, y - 10);
  label(page, bold, "LIMIT", m + 330, y - 10);
  label(page, bold, "DEDUCTIBLE", m + 440, y - 10);
  y -= covHeaderH;

  const maxCov = Math.min(input.coverages.length, 15);
  for (let i = 0; i < maxCov; i++) {
    const c = input.coverages[i];
    const rowH = 16;
    box(page, m, y, w, rowH);
    value(page, regular, c.name.slice(0, 55), m + 6, y - 11, 8);
    if (c.limit) value(page, regular, c.limit, m + 330, y - 11, 8);
    if (c.deductible) value(page, regular, c.deductible, m + 440, y - 11, 8);
    y -= rowH;
  }
  y -= 4;

  // ═══════════════════════════════════════════════════
  // DESCRIPTION OF OPERATIONS
  // ═══════════════════════════════════════════════════
  if (input.purpose) {
    const descH = 36;
    box(page, m, y, w, descH);
    label(page, bold, "DESCRIPTION OF OPERATIONS / LOCATIONS / VEHICLES", m + 6, y - 10);
    value(page, regular, input.purpose, m + 6, y - 24, 8.5);
    y -= descH + 2;
  }

  // ═══════════════════════════════════════════════════
  // CERTIFICATE HOLDER
  // ═══════════════════════════════════════════════════
  const holderH = 52;
  box(page, m, y, w, holderH);
  label(page, bold, "CERTIFICATE HOLDER", m + 6, y - 10);
  boldValue(page, bold, input.holderName, m + 6, y - 26, 9);
  if (input.holderAddress) {
    value(page, regular, input.holderAddress, m + 6, y - 40, 8);
  }
  y -= holderH + 4;

  // ═══════════════════════════════════════════════════
  // CANCELLATION NOTICE
  // ═══════════════════════════════════════════════════
  page.drawText(
    "Should any of the above described policies be cancelled before the expiration date thereof, notice will be",
    { x: m, y: y - 8, size: 6, font: regular, color: LABEL_GRAY }
  );
  page.drawText(
    "delivered in accordance with the policy provisions.",
    { x: m, y: y - 16, size: 6, font: regular, color: LABEL_GRAY }
  );

  return doc.save();
}

/**
 * Build CoiInput from rawExtracted policy data.
 */
export function buildCoiInput(
  policy: any,
  holderName: string,
  purpose: string,
  userName: string,
): CoiInput {
  const today = new Date();
  const dateStr = `${(today.getMonth() + 1).toString().padStart(2, "0")}/${today.getDate().toString().padStart(2, "0")}/${today.getFullYear()}`;

  const raw = policy.rawExtracted || policy;

  const producerName = raw.broker || raw.brokerAgency || raw.mga || raw.carrier || "Producer";
  const insurerName = raw.security || raw.carrierLegalName || raw.carrier || "Insurer";

  // Try to extract producer contact info from document sections
  let producerAddress: string | undefined;
  let producerPhone: string | undefined;
  let producerEmail: string | undefined;

  // Look for agency section in document for contact details
  const sections = raw.document?.sections || [];
  for (const section of sections) {
    if (section.title?.toLowerCase().includes("agency") && section.subsections) {
      for (const sub of section.subsections) {
        const content = sub.content || "";
        if (sub.title?.toLowerCase().includes("agency") && content.includes(producerName)) {
          // Extract address lines
          const lines = content.split("\n").map((l: string) => l.trim()).filter(Boolean);
          const addrLines = lines.filter((l: string) =>
            !l.includes("Tel:") && !l.includes("Fax:") && !l.includes("Email:") &&
            !l.startsWith("This") && !l.includes("sold") && !l.includes("serviced") &&
            l !== producerName
          );
          if (addrLines.length > 0) producerAddress = addrLines.join("\n");

          // Extract phone
          const telMatch = content.match(/Tel[:\s]+([0-9.\-\s]+)/i) || content.match(/(1\.[0-9]{3}\.[0-9]{3}\.[0-9]{4})/);
          if (telMatch) producerPhone = telMatch[1].trim();

          // Extract email
          const emailMatch = content.match(/Email[:\s]+([^\s]+@[^\s]+)/i) || content.match(/([a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
          if (emailMatch) producerEmail = emailMatch[1].trim();
        }
      }
    }
  }

  let insuredAddress: string | undefined;
  if (raw.insuredAddress) {
    const a = raw.insuredAddress;
    const parts = [a.street1, a.city, `${a.state || ""} ${a.zip || ""}`.trim()].filter(Boolean);
    insuredAddress = parts.join(", ");
  }

  const formType = raw.declarations?.formType || "";
  const categoryLabel = policy.category ? policy.category.charAt(0).toUpperCase() + policy.category.slice(1) : "Insurance";
  const policyTypeLabel = formType ? `${categoryLabel} (${formType})` : categoryLabel;

  const coverages: CoiInput["coverages"] = [];
  if (raw.coverages && Array.isArray(raw.coverages)) {
    for (const c of raw.coverages) {
      coverages.push({
        name: c.name || c.type || "Coverage",
        limit: c.limit || c.limitPerOccurrence || c.limitPerPerson || "",
        deductible: c.deductible || "",
      });
    }
  }

  return {
    certificateDate: dateStr,
    producerName,
    producerAddress,
    producerPhone,
    producerEmail,
    insurerName,
    insuredName: raw.insuredName || userName,
    insuredAddress,
    policyNumber: raw.policyNumber || policy.policyNumber || "",
    policyType: policyTypeLabel,
    effectiveDate: raw.effectiveDate || policy.effectiveDate || "",
    expirationDate: raw.expirationDate || policy.expirationDate || "",
    coverages,
    holderName,
    purpose,
  };
}
