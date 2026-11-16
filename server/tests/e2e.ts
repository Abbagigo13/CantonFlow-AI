// End-to-end API test against a running server, ledger and database.
// Run: bun run test:api   (uses throwaway wallets generated for this run)
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { orgKey, sql } from "../db";

const API = process.env.API_URL ?? "http://127.0.0.1:3001";
let failures = 0;

interface EvidenceItem {
  id: string;
  filename: string;
  kind: string;
  sha256: string;
  readable: boolean;
  pages: number | null;
  side: string;
  canRemove: boolean;
}

interface ItemRow {
  agreementId: string;
  kind: string;
  position: number;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

interface ApiData {
  points?: { date: string; created: number; completed: number }[];
  days?: number;
  joined?: boolean;
  targetRegistered?: boolean;
  inviter?: string;
  agreementId?: string;
  expired?: { agreementId: string }[] | number;
  terms?: string | null;
  items?: ItemRow[];
  byStatus?: Record<string, number>;
  evidence?: EvidenceItem[] | EvidenceItem;
  actionNeeded?: { agreementId: string; action: string }[];
  waiting?: { agreementId: string; label: string }[];
  token?: string;
  message?: string;
  error?: string;
  verified?: boolean;
  total?: number;
  agreement?: { id: string; status: string; ledgerStatus: string; title?: string; seller?: string; amount?: string; deadline?: string | null; expired?: boolean };
  agreements?: { id: string }[];
  permissions?: { role: string; canCommit: boolean; canEdit?: boolean; canCancel?: boolean; canApprove?: boolean; canConfirm?: boolean };
  events?: { kind: string; actorAddress: string }[];
}

function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${detail}`}`);
}

async function call(method: string, path: string, token?: string, body?: unknown) {
  const response = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as ApiData;
  return { status: response.status, data };
}

async function raw(path: string, token?: string) {
  const response = await fetch(API + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { status: response.status, bytes, text: new TextDecoder().decode(bytes), type: response.headers.get("content-type") ?? "" };
}

async function upload(token: string | undefined, agreementId: string, bytes: Uint8Array, filename: string) {
  const response = await fetch(`${API}/agreements/${agreementId}/evidence?filename=${encodeURIComponent(filename)}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: bytes,
  });
  const data = (await response.json().catch(() => ({}))) as ApiData;
  return { status: response.status, data, item: data.evidence as EvidenceItem | undefined };
}

const pngLike = (n: number) => {
  const b = new Uint8Array(96);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  b[8] = n;
  b[9] = n >> 8;
  return b;
};

async function makePdf(text: string | null) {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  if (text) page.drawText(text, { x: 40, y: 700, size: 12, font: await doc.embedFont(StandardFonts.Helvetica) });
  return new Uint8Array(await doc.save());
}

async function signIn(account: ReturnType<typeof privateKeyToAccount>) {
  const { data } = await call("POST", "/auth/nonce", undefined, { address: account.address });
  const signature = await account.signMessage({ message: data.message as string });
  const res = await call("POST", "/auth/verify", undefined, { address: account.address, signature });
  return { token: res.data.token as string, res, signature, message: data.message as string };
}

const run = Date.now().toString(36);
const [buyerW, sellerW, outsiderW, memberW] = [0, 1, 2, 3].map(() => privateKeyToAccount(generatePrivateKey()));

// --- access without sign-in
check("agreements need sign-in", (await call("GET", "/agreements")).status === 401);
check("garbage token rejected", (await call("GET", "/me", `cf_${"0".repeat(64)}`)).status === 401);

// --- signature checks
{
  const { data } = await call("POST", "/auth/nonce", undefined, { address: buyerW.address });
  const wrongSigner = await outsiderW.signMessage({ message: data.message as string });
  const res = await call("POST", "/auth/verify", undefined, { address: buyerW.address, signature: wrongSigner });
  check("signature from another wallet rejected", res.status === 401, JSON.stringify(res.data));

  const real = await signIn(buyerW);
  check("valid signature accepted", real.res.status === 200 && Boolean(real.token));
  const replay = await call("POST", "/auth/verify", undefined, { address: buyerW.address, signature: real.signature });
  check("signature cannot be replayed", replay.status === 401);
  check("malformed signature rejected", (await call("POST", "/auth/verify", undefined, { address: buyerW.address, signature: "0x12" })).status === 400);
}

const buyer = (await signIn(buyerW)).token;
const seller = (await signIn(sellerW)).token;
const outsider = (await signIn(outsiderW)).token;
const member = (await signIn(memberW)).token;

// --- organizations
const buyerOrg = `Northstar ${run}`;
const sellerOrg = `Greenfield ${run}`;
check("buyer creates organization", (await call("POST", "/organizations", buyer, { name: buyerOrg })).status === 201);
check("seller creates organization", (await call("POST", "/organizations", seller, { name: sellerOrg })).status === 201);
check("organization name cannot be claimed twice", (await call("POST", "/organizations", outsider, { name: `  ${sellerOrg.toUpperCase()} ` })).status === 409);

// --- agreement creation and visibility
const terms = { title: "Agricultural equipment supply", buyer: buyerOrg, seller: sellerOrg, amount: "24500", currency: "USD" };
check("outsider cannot create agreement for others", (await call("POST", "/agreements", outsider, terms)).status === 403);
const created = await call("POST", "/agreements", buyer, terms);
check("buyer creates agreement", created.status === 201, JSON.stringify(created.data));
const id = created.data.agreement?.id as string;

check("seller sees it", (await call("GET", `/agreements/${id}`, seller)).status === 200);
check("outsider gets 404", (await call("GET", `/agreements/${id}`, outsider)).status === 404);
check("outsider list is empty", (await call("GET", "/agreements", outsider)).data.total === 0);
check("outsider metrics are empty", (await call("GET", "/metrics", outsider)).data.total === 0);
check("participant list includes it", ((await call("GET", "/agreements", buyer)).data.agreements ?? []).some((a) => a.id === id));
check("outsider cannot run AI review", (await call("POST", `/agreements/${id}/review`, outsider, {})).status === 404);
check("outsider cannot verify", (await call("POST", `/agreements/${id}/verify`, outsider)).status === 404);

// --- inbox before the ledger flow
{
  const sellerBox = (await call("GET", "/inbox", seller)).data;
  const buyerBox = (await call("GET", "/inbox", buyer)).data;
  check("seller is told to commit", (sellerBox.actionNeeded ?? []).some((i) => i.agreementId === id && i.action === "commit"));
  check("buyer is shown as waiting, not asked to act", !(buyerBox.actionNeeded ?? []).some((i) => i.agreementId === id) && (buyerBox.waiting ?? []).some((i) => i.agreementId === id));
  const outsiderBox = (await call("GET", "/inbox", outsider)).data;
  check("outsider inbox is empty", (outsiderBox.actionNeeded ?? []).length === 0 && (outsiderBox.waiting ?? []).length === 0);
}

// --- roles on the ledger flow
const detail = (await call("GET", `/agreements/${id}`, buyer)).data;
check("buyer permissions: cannot commit yet", detail.permissions?.role === "buyer" && detail.permissions.canCommit === false);
check("buyer cannot commit", (await call("POST", `/agreements/${id}/commit`, buyer)).status === 403);
check("outsider cannot commit", (await call("POST", `/agreements/${id}/commit`, outsider)).status === 404);
const commit = await call("POST", `/agreements/${id}/commit`, seller);
check("seller commits to ledger", commit.status === 200 && commit.data.agreement?.ledgerStatus === "committed", JSON.stringify(commit.data));
check("buyer is told to approve after commit", ((await call("GET", "/inbox", buyer)).data.actionNeeded ?? []).some((i) => i.agreementId === id && i.action === "approve"));
check("seller cannot approve", (await call("POST", `/agreements/${id}/approve`, seller)).status === 403);
check("outsider cannot approve", (await call("POST", `/agreements/${id}/approve`, outsider)).status === 404);
check("buyer approves", (await call("POST", `/agreements/${id}/approve`, buyer)).data.agreement?.status === "Approved");
check("seller is told to confirm after approval", ((await call("GET", "/inbox", seller)).data.actionNeeded ?? []).some((i) => i.agreementId === id && i.action === "confirm"));
check("buyer cannot confirm", (await call("POST", `/agreements/${id}/confirm`, buyer)).status === 403);
check("seller confirms", (await call("POST", `/agreements/${id}/confirm`, seller)).data.agreement?.status === "Completed");

check("inbox is clear once completed", ![...((await call("GET", "/inbox", seller)).data.actionNeeded ?? []), ...((await call("GET", "/inbox", buyer)).data.actionNeeded ?? [])].some((i) => i.agreementId === id));
const events = (await call("GET", `/agreements/${id}`, seller)).data.events ?? [];
check("events record the signing wallets", events.length === 4 && events[0].kind === "created" && events[2].actorAddress === buyerW.address.toLowerCase() && events[3].actorAddress === sellerW.address.toLowerCase());
check("participant can verify on ledger", (await call("POST", `/agreements/${id}/verify`, buyer)).data.verified === true);

// --- activity and exports
check("activity feed lists the agreement history", ((await call("GET", "/activity", seller)).data.items ?? []).filter((i) => i.agreementId === id).length === 4);
check("outsider activity is empty", ((await call("GET", "/activity", outsider)).data.items ?? []).length === 0);

const hostile = await call("POST", "/agreements", buyer, { ...terms, title: "=HYPERLINK(\"http://evil.example\")" });
const id2 = hostile.data.agreement?.id as string;
const csv = await raw("/export/agreements.csv", buyer);
check("CSV export works for a participant", csv.status === 200 && csv.type.startsWith("text/csv") && csv.text.includes(id));
check("CSV neutralizes formulas", csv.text.includes("\"'=HYPERLINK(") && !csv.text.includes(",=HYPERLINK("));
check("outsider CSV has no agreements", !(await raw("/export/agreements.csv", outsider)).text.includes(id));
check("history CSV works", (await raw(`/agreements/${id}/events.csv`, seller)).text.split("\r\n").length >= 6);
check("outsider cannot export history", (await raw(`/agreements/${id}/events.csv`, outsider)).status === 404);
check("export needs sign-in", (await raw("/export/agreements.csv")).status === 401);

// --- evidence files (on the still-open agreement id2)
{
  const textAsPdf = await upload(seller, id2, new TextEncoder().encode("hello, not a pdf"), "invoice.pdf");
  check("a text file renamed .pdf is refused", textAsPdf.status === 400, JSON.stringify(textAsPdf.data));
  const exeAsPng = await upload(seller, id2, new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 1, 2, 3]), "photo.png");
  check("an executable renamed .png is refused", exeAsPng.status === 400);
  check("an empty file is refused", (await upload(seller, id2, new Uint8Array(0), "empty.png")).status === 400);
  const huge = new Uint8Array(5 * 1024 * 1024 + 1);
  huge.set(pngLike(1));
  check("a file over 5 MB is refused", (await upload(seller, id2, huge, "huge.png")).status === 413);
  check("a damaged PDF is refused", (await upload(seller, id2, new TextEncoder().encode("%PDF-1.4\nthis is garbage"), "bad.pdf")).status === 400);

  const first = await upload(seller, id2, pngLike(1), "Invoice 4471.PNG");
  check("seller uploads an image", first.status === 201 && first.item?.kind === "image" && first.item.side === "seller" && first.item.sha256.length === 64, JSON.stringify(first.data));
  check("outsider cannot upload", (await upload(outsider, id2, pngLike(2), "x.png")).status === 404);
  check("upload needs sign-in", (await upload(undefined, id2, pngLike(3), "x.png")).status === 401);
  check("the same file cannot be added twice", (await upload(seller, id2, pngLike(1), "again.png")).status === 409);

  const goodPdf = await upload(seller, id2, await makePdf("INVOICE 4471 Total EUR 19,850.00 Seller Volt Systems"), "po.pdf");
  check("a PDF with text is accepted and readable", goodPdf.status === 201 && goodPdf.item?.readable === true && goodPdf.item.pages === 1, JSON.stringify(goodPdf.data));
  const blankPdf = await upload(seller, id2, await makePdf(null), "scan.pdf");
  check("a PDF without text is accepted but marked unreadable", blankPdf.status === 201 && blankPdf.item?.readable === false);

  const traversal = await upload(seller, id2, pngLike(4), "../../etc/passwd");
  check("path tricks in a file name are removed", traversal.item?.filename === "passwd.png", traversal.item?.filename);
  const markup = await upload(seller, id2, pngLike(5), "<script>alert(1)</script>.png");
  check("markup in a file name is removed", markup.status === 201 && !/[<>]/.test(markup.item?.filename ?? "<"), markup.item?.filename);

  const sellerView = (await call("GET", `/agreements/${id2}`, seller)).data.evidence as EvidenceItem[];
  const buyerView = (await call("GET", `/agreements/${id2}`, buyer)).data.evidence as EvidenceItem[];
  check("buyer sees the seller's files", buyerView.length === 5 && buyerView.every((e) => e.side === "seller"));
  check("only the uploader's side can remove", sellerView.every((e) => e.canRemove) && buyerView.every((e) => !e.canRemove));
  check("outsider sees no files", (await call("GET", `/agreements/${id2}`, outsider)).status === 404);

  const report = await raw(`/agreements/${id2}/audit.pdf`, seller);
  check("the audit PDF lists evidence files", report.status === 200 && report.text.startsWith("%PDF-"));

  const fileId = first.item?.id ?? "0";
  const download = await fetch(`${API}/evidence/${fileId}`, { headers: { Authorization: `Bearer ${buyer}` } });
  const downloaded = new Uint8Array(await download.arrayBuffer());
  check("buyer downloads the exact bytes", download.status === 200 && downloaded.length === 96 && downloaded[8] === 1);
  check("downloads are attachments that cannot be sniffed", (download.headers.get("content-disposition") ?? "").startsWith("attachment") && download.headers.get("x-content-type-options") === "nosniff" && download.headers.get("content-type") === "image/png");
  check("outsider cannot download", (await raw(`/evidence/${fileId}`, outsider)).status === 404);
  check("download needs sign-in", (await raw(`/evidence/${fileId}`)).status === 401);

  check("buyer cannot remove the seller's file", (await call("DELETE", `/evidence/${fileId}`, buyer)).status === 403);

  // review requests are validated before any AI call is made
  check("an unreadable PDF cannot be sent to the AI", (await call("POST", `/agreements/${id2}/review`, seller, { evidenceIds: [blankPdf.item?.id] })).status === 400);
  check("a file id from nowhere is refused", (await call("POST", `/agreements/${id2}/review`, seller, { evidenceIds: ["999999999"] })).status === 400);
  check("malformed file ids are refused", (await call("POST", `/agreements/${id2}/review`, seller, { evidenceIds: ["1; DROP TABLE agreements"] })).status === 400);
  check("too many files are refused", (await call("POST", `/agreements/${id2}/review`, seller, { evidenceIds: ["1", "2", "3", "4", "5", "6"] })).status === 400);

  check("the uploader removes a file", (await call("DELETE", `/evidence/${fileId}`, seller)).status === 200);
  check("a removed file cannot be downloaded", (await raw(`/evidence/${fileId}`, buyer)).status === 404);

  // fill the agreement to its limit of 10 files
  for (let n = 10; n < 16; n++) await upload(buyer, id2, pngLike(n), `extra-${n}.png`);
  check("an agreement holds at most 10 files", (await upload(buyer, id2, pngLike(99), "eleventh.png")).status === 409);

  const kinds = ((await call("GET", `/agreements/${id2}`, seller)).data.events ?? []).map((e) => e.kind);
  check("adding and removing files is recorded", kinds.includes("evidence_added") && kinds.includes("evidence_removed"));
  check("files cannot be added to a completed agreement", (await upload(seller, id, pngLike(7), "late.png")).status === 409);
}

// --- edit and cancel before commit
const draft = await call("POST", "/agreements", buyer, { ...terms, title: "Draft to edit" });
const id4 = draft.data.agreement?.id as string;
{
  const creatorView = (await call("GET", `/agreements/${id4}`, buyer)).data;
  const otherView = (await call("GET", `/agreements/${id4}`, seller)).data;
  check("creator can edit and cancel a draft", creatorView.permissions?.canEdit === true && creatorView.permissions.canCancel === true);
  check("the other side cannot edit or cancel", otherView.permissions?.canEdit === false && otherView.permissions.canCancel === false);

  const edited = await call("PATCH", `/agreements/${id4}`, buyer, { title: "Draft, revised", amount: "30000.50" });
  check("creator edits the title and amount", edited.status === 200 && edited.data.agreement?.title === "Draft, revised", JSON.stringify(edited.data));
  check("the edit is recorded with what changed", ((await call("GET", `/agreements/${id4}`, seller)).data.events ?? []).some((e) => e.kind === "edited"));
  check("the other side cannot edit", (await call("PATCH", `/agreements/${id4}`, seller, { title: "Hijack" })).status === 403);
  check("an outsider cannot edit", (await call("PATCH", `/agreements/${id4}`, outsider, { title: "Hijack" })).status === 404);
  check("an edit with no change is refused", (await call("PATCH", `/agreements/${id4}`, buyer, { title: "Draft, revised" })).status === 400);
  check("an invalid amount is refused", (await call("PATCH", `/agreements/${id4}`, buyer, { amount: "-5" })).status === 400);
  check("you cannot make yourself the counterparty", (await call("PATCH", `/agreements/${id4}`, buyer, { counterparty: buyerOrg })).status === 400);

  check("a committed agreement cannot be edited", (await call("PATCH", `/agreements/${id}`, buyer, { title: "Rewrite history" })).status === 409);
  check("a committed agreement cannot be cancelled", (await call("POST", `/agreements/${id}/cancel`, buyer)).status === 409);

  // changing the counterparty moves the agreement to the new organization
  check("changing the counterparty removes the old one's access", (await call("PATCH", `/agreements/${id4}`, buyer, { counterparty: `Someone Else ${run}` })).status === 200 && (await call("GET", `/agreements/${id4}`, seller)).status === 404);
  check("the creator can change it back", (await call("PATCH", `/agreements/${id4}`, buyer, { counterparty: sellerOrg.toUpperCase() })).data.agreement?.seller === sellerOrg);

  check("the other side cannot cancel", (await call("POST", `/agreements/${id4}/cancel`, seller)).status === 403);
  const cancelled = await call("POST", `/agreements/${id4}/cancel`, buyer);
  check("creator cancels the draft", cancelled.status === 200 && cancelled.data.agreement?.status === "Cancelled", JSON.stringify(cancelled.data));
  check("a cancelled agreement cannot be edited", (await call("PATCH", `/agreements/${id4}`, buyer, { title: "Again" })).status === 409);
  check("a cancelled agreement cannot be committed", (await call("POST", `/agreements/${id4}/commit`, seller)).status === 409);
  check("a cancelled agreement cannot get new files", (await upload(buyer, id4, pngLike(40), "late.png")).status === 409);
  check("a cancelled agreement leaves the inbox", !((await call("GET", "/inbox", seller)).data.actionNeeded ?? []).some((i) => i.agreementId === id4));
  check("metrics count cancelled agreements", ((await call("GET", "/metrics", buyer)).data.byStatus ?? {}).Cancelled === 1);
  check("the cancellation is recorded", ((await call("GET", `/agreements/${id4}`, buyer)).data.events ?? []).some((e) => e.kind === "cancelled"));
}

// --- terms and line items
const lines = [
  { description: "Solar panel", quantity: "40", unitPrice: "450.00" },
  { description: "Installation", quantity: "1", unitPrice: "1200.50" },
  { description: "Cable (metres)", quantity: "0.5", unitPrice: "3.33" },
];
const withItems = await call("POST", "/agreements", buyer, { ...terms, title: "Itemized order", amount: "1", items: lines, terms: "Net 30.\nShips FOB Rotterdam." });
const id5 = withItems.data.agreement?.id as string;
{
  const detail = (await call("GET", `/agreements/${id5}`, seller)).data;
  check("the amount is the exact sum of the line items", detail.agreement?.amount === "19202.17", JSON.stringify(detail.agreement));
  check("line totals are calculated and rounded half up", detail.items?.map((i) => i.lineTotal).join(",") === "18000.00,1200.50,1.67", JSON.stringify(detail.items));
  check("the other side sees the terms", detail.terms === "Net 30.\nShips FOB Rotterdam.");
  check("an outsider cannot see the items", (await call("GET", `/agreements/${id5}`, outsider)).status === 404);

  check("a bad line item is refused", (await call("PATCH", `/agreements/${id5}`, buyer, { items: [{ description: "x", quantity: "0", unitPrice: "1" }] })).status === 400);
  check("too many line items are refused", (await call("PATCH", `/agreements/${id5}`, buyer, { items: Array.from({ length: 51 }, () => lines[0]) })).status === 400);
  check("a manual amount is refused while line items exist", (await call("PATCH", `/agreements/${id5}`, buyer, { amount: "5" })).status === 400);
  const replaced = await call("PATCH", `/agreements/${id5}`, buyer, { items: [{ description: "Everything", quantity: "2", unitPrice: "100.10" }] });
  check("changing the line items recalculates the amount", replaced.status === 200 && replaced.data.agreement?.amount === "200.20", JSON.stringify(replaced.data));
  check("the other side cannot change terms", (await call("PATCH", `/agreements/${id5}`, seller, { terms: "Free" })).status === 403);
  check("terms can be changed and removed", (await call("PATCH", `/agreements/${id5}`, buyer, { terms: null })).status === 200 && (await call("GET", `/agreements/${id5}`, buyer)).data.terms === null);
  const cleared = await call("PATCH", `/agreements/${id5}`, buyer, { items: [], amount: "750.00" });
  check("removing line items allows a manual amount again", cleared.status === 200 && cleared.data.agreement?.amount === "750.00" && ((await call("GET", `/agreements/${id5}`, buyer)).data.items ?? []).length === 0, JSON.stringify(cleared.data));
  check("the audit PDF handles terms and items", (await raw(`/agreements/${id5}/audit.pdf`, buyer)).status === 200);
}

// --- deadlines and the expired state
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
{
  for (const bad of ["2020-01-01", "2030-02-30", "not-a-date", day(365 * 6)]) {
    check(`deadline ${bad} is refused`, (await call("POST", "/agreements", buyer, { ...terms, deadline: bad })).status === 400);
  }
  const dated = await call("POST", "/agreements", buyer, { ...terms, title: "Has a deadline", deadline: day(10) });
  const idDL = dated.data.agreement?.id as string;
  check("an agreement can have a deadline", dated.status === 201 && dated.data.agreement?.deadline === day(10), JSON.stringify(dated.data));
  check("it is not expired yet", dated.data.agreement?.expired === false);

  const commitFirst = await call("POST", `/agreements/${idDL}/commit`, seller);
  check("a live agreement can be committed", commitFirst.status === 200);

  await sql`UPDATE agreements SET deadline = ${day(-1)} WHERE id = ${idDL}`;
  const late = (await call("GET", `/agreements/${idDL}`, buyer)).data;
  check("a past deadline marks the agreement expired", late.agreement?.expired === true);
  check("an expired agreement offers no actions", late.permissions?.canApprove === false && (await call("GET", `/agreements/${idDL}`, seller)).data.permissions?.canConfirm === false);
  const blocked = await call("POST", `/agreements/${idDL}/approve`, buyer);
  check("an expired agreement cannot be approved", blocked.status === 409 && /deadline/i.test(blocked.data.error ?? ""), JSON.stringify(blocked.data));
  check("expired agreements leave the action list and appear as expired", !((await call("GET", "/inbox", buyer)).data.actionNeeded ?? []).some((i) => i.agreementId === idDL) && (((await call("GET", "/inbox", buyer)).data.expired ?? []) as { agreementId: string }[]).some((i) => i.agreementId === idDL));
  const expiredList = (await call("GET", "/agreements?status=Expired", buyer)).data.agreements ?? [];
  check("the Expired filter lists it", expiredList.some((a) => a.id === idDL) && expiredList.every((a) => a.id !== id));
  check("metrics count expired agreements", (await call("GET", "/metrics", buyer)).data.expired === 1);
  check("the CSV has a deadline column", (await raw("/export/agreements.csv", buyer)).text.split("\r\n")[0].includes("Deadline"));

  // the expiry is a rule of this app: pushing the date out restores the agreement
  await sql`UPDATE agreements SET deadline = ${day(5)} WHERE id = ${idDL}`;
  check("a restored deadline allows action again", (await call("POST", `/agreements/${idDL}/approve`, buyer)).data.agreement?.status === "Approved");
  await sql`DELETE FROM agreements WHERE id = ${idDL}`;

  // edit a draft's deadline
  const draftDl = await call("POST", "/agreements", buyer, { ...terms, title: "Extend me", deadline: day(2) });
  const idD2 = draftDl.data.agreement?.id as string;
  await sql`UPDATE agreements SET deadline = ${day(-3)} WHERE id = ${idD2}`;
  check("an expired draft cannot be committed", (await call("POST", `/agreements/${idD2}/commit`, seller)).status === 409);
  const extended = await call("PATCH", `/agreements/${idD2}`, buyer, { deadline: day(30) });
  check("the creator can extend an expired draft", extended.status === 200 && extended.data.agreement?.expired === false, JSON.stringify(extended.data));
  check("a deadline can be removed", (await call("PATCH", `/agreements/${idD2}`, buyer, { deadline: null })).data.agreement?.deadline === null);
  await sql`DELETE FROM agreements WHERE id = ${idD2}`;
}

// --- invite links
const invitedName = `Invited Co ${run}`;
const invitedDraft = await call("POST", "/agreements", buyer, { ...terms, title: "Needs an invite", seller: invitedName });
const idInv = invitedDraft.data.agreement?.id as string;
const idInv2 = (await call("POST", "/agreements", buyer, { ...terms, title: "Registered counterparty" })).data.agreement?.id as string;
{
  check("only participants can create invites", (await call("POST", `/agreements/${idInv}/invite`, outsider)).status === 404);
  check("a cancelled agreement cannot be shared", (await call("POST", `/agreements/${id4}/invite`, buyer)).status === 409);
  const first = await call("POST", `/agreements/${idInv}/invite`, buyer);
  const token = first.data.token as string;
  check("a participant creates an invite", first.status === 201 && typeof token === "string" && token.length >= 32 && first.data.targetRegistered === false, JSON.stringify(first.data));

  check("a garbage link is not valid", (await call("POST", "/invites/preview", outsider, { token: "nope" })).status === 404);
  check("an unknown token is not valid", (await call("POST", "/invites/preview", outsider, { token: "a".repeat(48) })).status === 404);
  check("previewing needs sign-in", (await call("POST", "/invites/preview", undefined, { token })).status === 401);
  const preview = await call("POST", "/invites/preview", outsider, { token });
  check("the link holder sees who is asking and what for", preview.status === 200 && preview.data.inviter === buyerOrg && preview.data.targetRegistered === false);
  check("you cannot accept your own organization's link", (await call("POST", "/invites/accept", buyer, { token })).status === 400);

  const second = await call("POST", `/agreements/${idInv}/invite`, buyer);
  check("a new link replaces the old one", (await call("POST", "/invites/preview", outsider, { token })).status === 410 && second.status === 201);

  const accepted = await call("POST", "/invites/accept", member, { token: second.data.token });
  check("the invited side registers its organization through the link", accepted.status === 200 && accepted.data.joined === true && accepted.data.agreementId === idInv, JSON.stringify(accepted.data));
  const joinedView = (await call("GET", `/agreements/${idInv}`, member)).data;
  check("the new organization sees the agreement as the seller", joinedView.permissions?.role === "seller" && joinedView.permissions.canCommit === true);
  check("a used link cannot be used again", (await call("POST", "/invites/accept", outsider, { token: second.data.token })).status === 410);
  check("the name is now taken for everyone else", (await call("POST", "/organizations", outsider, { name: invitedName })).status === 409);

  // the counterparty is already registered: the link grants nothing
  const link2 = (await call("POST", `/agreements/${idInv2}/invite`, buyer)).data.token as string;
  const denied = await call("POST", "/invites/accept", outsider, { token: link2 });
  check("a link does not let a stranger into a registered organization", denied.status === 403 && /already registered/i.test(denied.data.error ?? ""), JSON.stringify(denied.data));
  const asMember = await call("POST", "/invites/accept", seller, { token: link2 });
  check("a member of the registered organization just gets the agreement", asMember.status === 200 && asMember.data.joined === false);
  check("the stranger still has no access", (await call("GET", `/agreements/${idInv2}`, outsider)).status === 404);
}

// --- activity chart data
{
  const week = await call("GET", "/metrics/timeline?days=7", buyer);
  const month = await call("GET", "/metrics/timeline?days=30", buyer);
  check("the timeline has one point per day, oldest first", week.data.points?.length === 7 && month.data.points?.length === 30 && (month.data.points ?? []).every((p, i, all) => i === 0 || all[i - 1].date < p.date));
  const todayPoint = (month.data.points ?? []).at(-1);
  check("today's point counts what was created and completed today", (todayPoint?.created ?? 0) >= 5 && (todayPoint?.completed ?? 0) >= 1, JSON.stringify(todayPoint));
  check("an unknown range falls back to 30 days", (await call("GET", "/metrics/timeline?days=9", buyer)).data.days === 30);
  const none = await call("GET", "/metrics/timeline?days=7", outsider);
  check("an outsider's timeline is all zeros", none.data.points?.length === 7 && none.data.points.every((p) => p.created === 0 && p.completed === 0));
}

const unicode = await call("POST", "/agreements", buyer, { ...terms, title: "Caf\u00e9 \u5317\u4eac supply" });
const id3 = unicode.data.agreement?.id as string;
const pdf = await raw(`/agreements/${id}/audit.pdf`, seller);
check("audit PDF is generated", pdf.status === 200 && pdf.type === "application/pdf" && pdf.text.startsWith("%PDF-") && pdf.bytes.length > 1500);
check("audit PDF handles non-Latin names", (await raw(`/agreements/${id3}/audit.pdf`, buyer)).status === 200);
check("outsider cannot download audit PDF", (await raw(`/agreements/${id}/audit.pdf`, outsider)).status === 404);

// --- members
check("non-owner cannot add members", (await call("POST", `/organizations/${encodeURIComponent(sellerOrg.toLowerCase())}/members`, buyer, { address: memberW.address })).status === 403);
const add = await call("POST", `/organizations/${encodeURIComponent(sellerOrg.toLowerCase())}/members`, seller, { address: memberW.address });
check("owner adds a member", add.status === 201, JSON.stringify(add.data));
check("member can see the agreement", (await call("GET", `/agreements/${id}`, member)).status === 200);
check("member cannot add members", (await call("POST", `/organizations/${encodeURIComponent(sellerOrg.toLowerCase())}/members`, member, { address: outsiderW.address })).status === 403);
check("last owner cannot be removed", (await call("DELETE", `/organizations/${encodeURIComponent(sellerOrg.toLowerCase())}/members/${sellerW.address.toLowerCase()}`, seller)).status === 409);

// --- same wallet on both sides
await call("POST", `/organizations/${encodeURIComponent(sellerOrg.toLowerCase())}/members`, seller, { address: buyerW.address });
check("wallet in both organizations is blocked", (await call("GET", `/agreements/${id}`, buyer)).status === 403);
check("owner removes a member", (await call("DELETE", `/organizations/${encodeURIComponent(sellerOrg.toLowerCase())}/members/${buyerW.address.toLowerCase()}`, seller)).status === 200);
check("access restored after removal", (await call("GET", `/agreements/${id}`, buyer)).status === 200);

// --- sign out
await call("POST", "/auth/logout", member);
check("session ends on sign-out", (await call("GET", "/me", member)).status === 401);

// --- rate limiting: the 21st export in a minute is refused
{
  let blocked = 0;
  let retryAfter: string | null = null;
  for (let i = 0; i < 25; i++) {
    const response = await fetch(`${API}/export/agreements.csv`, { headers: { Authorization: `Bearer ${outsider}` } });
    if (response.status === 429) {
      blocked += 1;
      retryAfter = response.headers.get("retry-after");
    }
  }
  check("exports are rate limited per wallet", blocked >= 4 && retryAfter === "60", `blocked=${blocked} retryAfter=${retryAfter}`);
}

// --- remove everything this run created
const wallets = [buyerW, sellerW, outsiderW, memberW].map((w) => w.address.toLowerCase());
await sql`DELETE FROM agreements WHERE id IN ${sql([id, id2, id3, id4, id5, idInv, idInv2])}`;
await sql`DELETE FROM organizations WHERE key IN ${sql([orgKey(buyerOrg), orgKey(sellerOrg), orgKey(invitedName)])}`;
await sql`DELETE FROM sessions WHERE address IN ${sql(wallets)}`;
await sql`DELETE FROM auth_nonces WHERE address IN ${sql(wallets)}`;

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
