import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { listReviews } from "./ai";
import { getAgreement } from "./agreements";
import { membershipsOf } from "./auth";
import { toCsv } from "./csv";
import { sql, toAgreement, type Agreement } from "./db";
import { listEvidence } from "./evidence";
import { ledgerStatus } from "./integrations";
import { parseListQuery } from "./validate";
import { verifyAgreement, type Check } from "./workflow";

const MAX_EXPORT_ROWS = 5000;

// ---- CSV --------------------------------------------------------------------

export async function agreementsCsv(address: string, params: URLSearchParams): Promise<string> {
  const { search, status } = parseListQuery(params);
  const keys = (await membershipsOf(address)).map((m) => m.key);
  const header = [
    "Agreement ID", "Title", "Buyer", "Seller", "Amount", "Currency", "Status", "On ledger",
    "Contract ID", "Transaction ID", "Ledger offset", "Deadline", "Expired", "Created", "Updated",
  ];
  if (keys.length === 0) return toCsv(header, []);

  const pattern = search ? `%${search.replace(/[\\%_]/g, "\\$&")}%` : null;
  const rows = await sql`
    SELECT * FROM agreements
    WHERE (buyer_key IN ${sql(keys)} OR seller_key IN ${sql(keys)})
      AND (${pattern}::text IS NULL OR title ILIKE ${pattern} OR buyer ILIKE ${pattern} OR seller ILIKE ${pattern} OR id ILIKE ${pattern})
      AND (${status}::text IS NULL OR status = ${status})
    ORDER BY created_at DESC LIMIT ${MAX_EXPORT_ROWS}
  `;
  return toCsv(
    header,
    rows.map(toAgreement).map((a: Agreement) => [
      a.id, a.title, a.buyer, a.seller, a.amount, a.currency, a.status, a.ledgerStatus === "committed" ? "yes" : "no",
      a.ledgerContractId, a.ledgerUpdateId, a.ledgerOffset, a.deadline, a.expired ? "yes" : "no", a.createdAt, a.updatedAt,
    ]),
  );
}

export async function eventsCsv(address: string, id: string): Promise<string> {
  const { agreement, events } = await getAgreement(address, id); // also checks access
  return toCsv(
    ["Agreement ID", "Time", "Event", "Organization", "Wallet", "Ledger offset", "Transaction ID", "Detail"],
    [
      [agreement.id, agreement.createdAt, "created", "", "", "", "", "Agreement record created"],
      ...events.filter((e) => e.kind !== "created").map((e) => [agreement.id, e.createdAt, e.kind, e.actor, e.actorAddress, e.ledgerOffset, e.ledgerUpdateId, e.detail]),
    ],
  );
}

// ---- PDF --------------------------------------------------------------------

// The standard PDF fonts only cover Latin-1. Anything else prints as "?" so
// a name in another script never breaks the export.
const safe = (value: unknown): string =>
  String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

const PAGE = { width: 595.28, height: 841.89, margin: 48 };
const INK = rgb(0.1, 0.12, 0.18);
const MUTED = rgb(0.4, 0.44, 0.52);
const OK = rgb(0.1, 0.5, 0.3);
const BAD = rgb(0.75, 0.2, 0.2);

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(
    private doc: PDFDocument,
    private font: PDFFont,
    private bold: PDFFont,
  ) {
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - PAGE.margin;
  }

  private ensure(height: number) {
    if (this.y - height < PAGE.margin) this.newPage();
  }

  gap(h = 8) {
    this.y -= h;
  }

  heading(text: string) {
    this.ensure(30);
    this.gap(10);
    this.page.drawText(safe(text), { x: PAGE.margin, y: this.y, size: 12, font: this.bold, color: INK });
    this.y -= 6;
    this.page.drawLine({ start: { x: PAGE.margin, y: this.y }, end: { x: PAGE.width - PAGE.margin, y: this.y }, thickness: 0.5, color: MUTED });
    this.y -= 14;
  }

  title(text: string, size = 18) {
    this.ensure(size + 8);
    this.page.drawText(safe(text), { x: PAGE.margin, y: this.y, size, font: this.bold, color: INK });
    this.y -= size + 6;
  }

  // Wraps text to the page width, breaking long unbroken strings (IDs) too.
  text(text: string, opts: { x?: number; size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {}) {
    const size = opts.size ?? 9.5;
    const font = opts.bold ? this.bold : this.font;
    const x = opts.x ?? PAGE.margin;
    const maxWidth = PAGE.width - PAGE.margin - x;
    const lines: string[] = [];
    let line = "";
    for (const word of safe(text).split(" ")) {
      let w = word;
      while (font.widthOfTextAtSize(w, size) > maxWidth) {
        let cut = w.length;
        while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > maxWidth) cut -= 1;
        if (line) {
          lines.push(line);
          line = "";
        }
        lines.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    for (const l of lines) {
      this.ensure(size + 4);
      this.page.drawText(l, { x, y: this.y, size, font, color: opts.color ?? INK });
      this.y -= size + 4;
    }
  }

  pair(label: string, value: unknown) {
    this.ensure(14);
    this.page.drawText(safe(label), { x: PAGE.margin, y: this.y, size: 9.5, font: this.font, color: MUTED });
    const startY = this.y;
    const x = PAGE.margin + 130;
    const before = this.page;
    this.text(String(value ?? "-") || "-", { x });
    if (this.page === before && this.y === startY) this.y -= 13;
  }
}

export async function auditPdf(address: string, id: string): Promise<Uint8Array> {
  const detail = await getAgreement(address, id); // checks access
  const { agreement: a, events } = detail;

  let checks: Check[] | null = null;
  let verifyNote = "Not committed to a ledger, so there is nothing to verify.";
  if (a.ledgerStatus === "committed") {
    try {
      checks = (await verifyAgreement(id, address)).checks;
    } catch (error) {
      verifyNote = `The ledger could not be checked: ${error instanceof Error ? error.message : "unknown error"}`;
    }
  }
  const ledger = await ledgerStatus().catch(() => null);
  const reviews = await listReviews(id, 1);
  const evidence = await listEvidence(id, "buyer", a.status);

  const doc = await PDFDocument.create();
  doc.setTitle(`Audit report ${a.id}`);
  doc.setProducer("CantonFlow AI");
  const w = new Writer(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));

  w.title("Agreement audit report");
  w.text(`${a.id}   |   Generated ${new Date().toISOString()}   |   Requested by wallet ${address}`, { color: MUTED, size: 8.5 });

  w.heading("Agreement");
  w.pair("Title", a.title);
  w.pair("Buyer", a.buyer);
  w.pair("Seller", a.seller);
  w.pair("Value", `${a.amount} ${a.currency}`);
  w.pair("Status", a.expired ? `${a.status} (expired)` : a.status);
  if (a.deadline) w.pair("Deadline", a.deadline);
  w.pair("Created", a.createdAt);
  w.pair("Last updated", a.updatedAt);

  if (detail.items.length > 0) {
    w.heading("Line items");
    for (const i of detail.items) {
      w.text(`${i.position}. ${i.description}   ${i.quantity} x ${i.unitPrice} = ${i.lineTotal} ${a.currency}`);
    }
    w.text(`Total ${a.amount} ${a.currency}`, { bold: true });
  }
  if (detail.terms) {
    w.heading("Terms");
    for (const line of detail.terms.split("\n")) w.text(line || " ");
  }

  w.heading("Ledger record");
  w.pair("Recorded state", a.ledgerStatus === "committed" ? "Committed to a Canton ledger" : "Not committed (database only)");
  if (a.ledgerStatus === "committed") {
    w.pair("Contract ID", a.ledgerContractId);
    w.pair("Transaction ID", a.ledgerUpdateId);
    w.pair("Ledger offset", a.ledgerOffset);
    w.pair("Buyer party", a.buyerParty);
    w.pair("Seller party", a.sellerParty);
  }
  if (ledger?.participantId) w.pair("Ledger participant", ledger.participantId);
  if (ledger?.version) w.pair("Ledger version", ledger.version);

  w.heading("Live check against the ledger");
  if (checks) {
    const passed = checks.every((c) => c.ok);
    w.text(passed ? "VERIFIED: the ledger matches this record." : "MISMATCH: the ledger does not match this record.", { bold: true, color: passed ? OK : BAD });
    for (const c of checks) {
      w.text(`${c.ok ? "PASS" : "FAIL"}  ${c.name}: ${c.detail}`, { color: c.ok ? INK : BAD });
    }
  } else {
    w.text(verifyNote, { color: MUTED });
  }

  w.heading("History");
  const timeline = [
    { at: a.createdAt, kind: "created", actor: "", wallet: "", offset: "", update: "" },
    ...events.filter((e) => e.kind !== "created").map((e) => ({
      at: e.createdAt, kind: e.kind, actor: e.actor ?? "", wallet: e.actorAddress ?? "", offset: e.ledgerOffset ?? "", update: e.ledgerUpdateId ?? "",
    })),
  ];
  for (const e of timeline) {
    w.text(`${e.at}   ${e.kind}${e.actor ? `   by ${e.actor}` : ""}`, { bold: true });
    if (e.wallet) w.text(`Wallet ${e.wallet}`, { x: PAGE.margin + 12, color: MUTED, size: 8.5 });
    if (e.offset) w.text(`Ledger offset ${e.offset}   Transaction ${e.update}`, { x: PAGE.margin + 12, color: MUTED, size: 8.5 });
    w.gap(3);
  }

  w.heading("Evidence files");
  if (evidence.length === 0) {
    w.text("No evidence files are attached.", { color: MUTED });
  } else {
    w.text("SHA-256 fingerprints identify each file exactly; a changed file has a different fingerprint.", { color: MUTED, size: 8.5 });
    for (const f of evidence) {
      w.text(`${f.filename}   ${(f.size / 1024).toFixed(1)} KB   added by the ${f.side} on ${f.uploadedAt}`, { bold: true });
      w.text(`SHA-256 ${f.sha256}`, { x: PAGE.margin + 12, color: MUTED, size: 8 });
      w.gap(3);
    }
  }

  if (reviews[0]) {
    const r = reviews[0];
    w.heading("Latest AI review (advisory, not part of the ledger record)");
    w.text(`${r.risk.toUpperCase()} risk   |   ${r.model}   |   ${r.createdAt}   |   ${r.hadEvidence ? "with evidence" : "record only"}`, { color: MUTED, size: 8.5 });
    w.text(r.summary);
    if (r.files.length > 0) w.text(`Files reviewed: ${r.files.map((f) => `${f.filename} (SHA-256 ${f.sha256.slice(0, 12)})`).join("; ")}`, { color: MUTED, size: 8.5 });
    for (const row of r.comparison) w.text(`${row.field}: record "${row.record}" | evidence "${row.evidence}" | ${row.result.toUpperCase()}`, { x: PAGE.margin + 12, color: row.result === "mismatch" ? BAD : INK, size: 9 });
    for (const f of r.findings) w.text(`[${f.severity}] ${f.title}: ${f.detail}`, { x: PAGE.margin + 12 });
  }

  w.gap(14);
  w.text("This report is generated from the application database and a live read of the Canton ledger at the time shown. AI findings, where included, are advice only.", { color: MUTED, size: 8 });

  return doc.save();
}
