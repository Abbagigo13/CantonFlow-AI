import { extractText, getDocumentProxy } from "unpdf";
import { sql, withTx } from "./db";
import { participantRoles } from "./workflow";
import { HttpError } from "./validate";

// Evidence files are untrusted uploads. The type is decided from the file's own
// first bytes (never the name or the declared type), size and count are capped,
// and files are only ever returned as downloads, never rendered by the server.

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_FILES_PER_AGREEMENT = 10;
export const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const MAX_PDF_PAGES = 30;
const MAX_TEXT_CHARS = 20_000;
const PDF_PARSE_TIMEOUT_MS = 15_000;

export type EvidenceKind = "pdf" | "image";

export interface EvidenceMeta {
  id: string;
  filename: string;
  mime: string;
  kind: EvidenceKind;
  size: number;
  sha256: string;
  pages: number | null;
  readable: boolean;
  side: "buyer" | "seller";
  uploadedAt: string;
  canRemove: boolean;
}

export async function ensureEvidenceTables(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS evidence_files (
      id bigserial PRIMARY KEY,
      agreement_id text NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
      filename text NOT NULL,
      mime text NOT NULL,
      size integer NOT NULL,
      sha256 text NOT NULL,
      pages integer,
      extracted_text text,
      side text NOT NULL CHECK (side IN ('buyer', 'seller')),
      uploaded_by text NOT NULL,
      content bytea NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (agreement_id, sha256)
    )
  `;
  await sql`ALTER TABLE ai_reviews ADD COLUMN IF NOT EXISTS evidence_refs jsonb`;
}

// ---- validation -------------------------------------------------------------

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) => signature.every((b, i) => bytes[offset + i] === b);

export function sniffType(bytes: Uint8Array): { mime: string; kind: EvidenceKind; ext: string } | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { mime: "application/pdf", kind: "pdf", ext: "pdf" };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", kind: "image", ext: "png" };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", kind: "image", ext: "jpg" };
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return { mime: "image/webp", kind: "image", ext: "webp" };
  return null;
}

export function sanitizeFilename(input: string | null, ext: string): string {
  const base = (input ?? "").split(/[\\/]/).pop() ?? "";
  const clean = base
    .replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 100);
  if (!clean) return `evidence.${ext}`;
  // The extension always matches the real type, whatever the name claimed.
  return clean.replace(/\.[A-Za-z0-9]{1,5}$/, "") + `.${ext}`;
}

async function readPdf(bytes: Uint8Array): Promise<{ pages: number; text: string }> {
  const parse = (async () => {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    if (pdf.numPages > MAX_PDF_PAGES) throw new HttpError(400, `That PDF has ${pdf.numPages} pages. The limit is ${MAX_PDF_PAGES}.`);
    const { text } = await extractText(pdf, { mergePages: true });
    return { pages: pdf.numPages, text: text.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_CHARS) };
  })();
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new HttpError(400, "That PDF took too long to read.")), PDF_PARSE_TIMEOUT_MS));
  try {
    return await Promise.race([parse, timeout]);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "That PDF could not be read. It may be damaged or password protected.");
  }
}

// ---- access -----------------------------------------------------------------

interface AgreementRow {
  id: string;
  status: string;
  buyer_key: string;
  seller_key: string;
}

async function loadAgreement(address: string, id: string): Promise<{ row: AgreementRow; side: "buyer" | "seller" }> {
  const [row] = (await sql`SELECT id, status, buyer_key, seller_key FROM agreements WHERE id = ${id}`) as AgreementRow[];
  if (!row) throw new HttpError(404, "Agreement not found.");
  const roles = await participantRoles(address, row);
  return { row, side: roles.buyer ? "buyer" : "seller" };
}

const isOpen = (status: string) => status === "Awaiting approval" || status === "Approved";

function toMeta(
  r: { id: string | number; filename: string; mime: string; size: number; sha256: string; pages: number | null; extracted_text: string | null; side: string; created_at: Date | string },
  viewerSide: "buyer" | "seller",
  open: boolean,
): EvidenceMeta {
  const kind: EvidenceKind = r.mime === "application/pdf" ? "pdf" : "image";
  return {
    id: String(r.id),
    filename: r.filename,
    mime: r.mime,
    kind,
    size: r.size,
    sha256: r.sha256,
    pages: r.pages,
    readable: kind === "image" || (r.extracted_text ?? "").length >= 20,
    side: r.side as "buyer" | "seller",
    uploadedAt: new Date(r.created_at).toISOString(),
    canRemove: open && r.side === viewerSide,
  };
}

export async function listEvidence(agreementId: string, viewerSide: "buyer" | "seller", status: string): Promise<EvidenceMeta[]> {
  const rows = await sql`
    SELECT id, filename, mime, size, sha256, pages, extracted_text, side, created_at
    FROM evidence_files WHERE agreement_id = ${agreementId} ORDER BY id
  `;
  return rows.map((r: Parameters<typeof toMeta>[0]) => toMeta(r, viewerSide, isOpen(status)));
}

// ---- upload / download / remove ---------------------------------------------

export async function addEvidence(address: string, agreementId: string, req: Request, filenameParam: string | null): Promise<EvidenceMeta> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_FILE_BYTES) throw new HttpError(413, "That file is larger than 5 MB.");
  const { row, side } = await loadAgreement(address, agreementId);
  if (!isOpen(row.status)) throw new HttpError(409, `Evidence can no longer be changed on a ${row.status.toLowerCase()} agreement.`);

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length === 0) throw new HttpError(400, "The file is empty.");
  if (bytes.length > MAX_FILE_BYTES) throw new HttpError(413, "That file is larger than 5 MB.");

  const type = sniffType(bytes);
  if (!type) throw new HttpError(400, "Only PDF, PNG, JPEG and WebP files are accepted.");

  const pdf = type.kind === "pdf" ? await readPdf(bytes) : null;
  const filename = sanitizeFilename(filenameParam, type.ext);
  const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");

  return withTx(async (tx) => {
    // Lock the agreement row so two uploads cannot both slip past the limits.
    await tx`SELECT id FROM agreements WHERE id = ${agreementId} FOR UPDATE`;
    const [usage] = await tx`SELECT count(*)::int AS n, coalesce(sum(size), 0)::bigint AS total FROM evidence_files WHERE agreement_id = ${agreementId}`;
    if (Number(usage.n) >= MAX_FILES_PER_AGREEMENT) throw new HttpError(409, `An agreement can have at most ${MAX_FILES_PER_AGREEMENT} evidence files.`);
    if (Number(usage.total) + bytes.length > MAX_TOTAL_BYTES) throw new HttpError(409, "This agreement has reached its 25 MB evidence limit.");

    const inserted = await tx`
      INSERT INTO evidence_files (agreement_id, filename, mime, size, sha256, pages, extracted_text, side, uploaded_by, content)
      VALUES (${agreementId}, ${filename}, ${type.mime}, ${bytes.length}, ${sha256}, ${pdf?.pages ?? null}, ${pdf?.text ?? null}, ${side}, ${address}, ${bytes})
      ON CONFLICT (agreement_id, sha256) DO NOTHING
      RETURNING id, filename, mime, size, sha256, pages, extracted_text, side, created_at
    `;
    if (inserted.length === 0) throw new HttpError(409, "This exact file is already attached to the agreement.");

    const [names] = await tx`SELECT buyer, seller FROM agreements WHERE id = ${agreementId}`;
    const orgName = (side === "buyer" ? names?.buyer : names?.seller) ?? null;
    await tx`
      INSERT INTO agreement_events (agreement_id, kind, actor, detail, actor_address)
      VALUES (${agreementId}, 'evidence_added', ${orgName}, ${`${filename} (SHA-256 ${sha256.slice(0, 12)})`}, ${address})
    `;
    return toMeta(inserted[0], side, true);
  });
}

export async function getEvidenceFile(address: string, evidenceId: string): Promise<{ filename: string; mime: string; bytes: Uint8Array }> {
  const [row] = await sql`SELECT agreement_id, filename, mime, content FROM evidence_files WHERE id = ${evidenceId}`;
  if (!row) throw new HttpError(404, "File not found.");
  await loadAgreement(address, row.agreement_id as string); // participants only
  return { filename: row.filename as string, mime: row.mime as string, bytes: new Uint8Array(row.content as Uint8Array) };
}

export async function removeEvidence(address: string, evidenceId: string): Promise<void> {
  const [row] = await sql`SELECT agreement_id, filename, sha256, side FROM evidence_files WHERE id = ${evidenceId}`;
  if (!row) throw new HttpError(404, "File not found.");
  const { row: agreement, side } = await loadAgreement(address, row.agreement_id as string);
  if (!isOpen(agreement.status)) throw new HttpError(409, `Evidence can no longer be changed on a ${agreement.status.toLowerCase()} agreement.`);
  if (row.side !== side) throw new HttpError(403, "Only the party that added this file can remove it.");

  await withTx(async (tx) => {
    await tx`DELETE FROM evidence_files WHERE id = ${evidenceId}`;
    const [names] = await tx`SELECT buyer, seller FROM agreements WHERE id = ${row.agreement_id as string}`;
    const orgName = (side === "buyer" ? names?.buyer : names?.seller) ?? null;
    await tx`
      INSERT INTO agreement_events (agreement_id, kind, actor, detail, actor_address)
      VALUES (${row.agreement_id as string}, 'evidence_removed', ${orgName}, ${`${row.filename as string} (SHA-256 ${(row.sha256 as string).slice(0, 12)})`}, ${address})
    `;
  });
}

// ---- for the AI review ------------------------------------------------------

export interface ReviewFile {
  id: string;
  filename: string;
  mime: string;
  kind: EvidenceKind;
  sha256: string;
  text: string | null;
  base64: string | null;
}

export async function loadForReview(agreementId: string, ids: string[]): Promise<ReviewFile[]> {
  if (ids.length === 0) return [];
  const rows = await sql`
    SELECT id, filename, mime, sha256, extracted_text, content FROM evidence_files
    WHERE agreement_id = ${agreementId} AND id IN ${sql(ids)} ORDER BY id
  `;
  if (rows.length !== new Set(ids).size) throw new HttpError(400, "One of the selected files does not belong to this agreement.");
  return rows.map((r: { id: string | number; filename: string; mime: string; sha256: string; extracted_text: string | null; content: Uint8Array }) => {
    const kind: EvidenceKind = r.mime === "application/pdf" ? "pdf" : "image";
    if (kind === "pdf" && (r.extracted_text ?? "").length < 20) {
      throw new HttpError(400, `${r.filename} has no readable text (it is probably a scan). Upload it as a PNG or JPEG image instead.`);
    }
    return {
      id: String(r.id),
      filename: r.filename,
      mime: r.mime,
      kind,
      sha256: r.sha256,
      text: kind === "pdf" ? r.extracted_text : null,
      base64: kind === "image" ? Buffer.from(r.content).toString("base64") : null,
    };
  });
}
