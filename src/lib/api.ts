export const STATUSES = ['Awaiting approval', 'Approved', 'Completed', 'Rejected', 'Cancelled'] as const
export type Status = (typeof STATUSES)[number]

export const CURRENCIES = ['USD', 'USDC', 'EUR'] as const
export type Currency = (typeof CURRENCIES)[number]

export interface Agreement {
  id: string
  title: string
  buyer: string
  seller: string
  amount: string
  currency: Currency
  status: Status
  ledgerStatus: 'not-submitted' | 'committed'
  ledgerContractId: string | null
  ledgerOffset: string | null
  ledgerUpdateId: string | null
  buyerParty: string | null
  sellerParty: string | null
  deadline: string | null
  expired: boolean
  createdAt: string
  updatedAt: string
}

export type EventKind = 'invite_accepted' | 'edited' | 'cancelled' | 'evidence_added' | 'evidence_removed' | 'created' | 'committed' | 'approved' | 'rejected' | 'confirmed' | 'ledger_reset'

export interface AgreementEvent {
  id: string
  kind: EventKind
  actor: string | null
  actorAddress: string | null
  detail: string | null
  ledgerUpdateId: string | null
  ledgerOffset: string | null
  createdAt: string
}

export interface Finding {
  severity: 'info' | 'warning' | 'critical'
  title: string
  detail: string
}

export interface EvidenceFile {
  id: string
  filename: string
  mime: string
  kind: 'pdf' | 'image'
  size: number
  sha256: string
  pages: number | null
  readable: boolean
  side: 'buyer' | 'seller'
  uploadedAt: string
  canRemove: boolean
}

export interface ComparisonRow {
  field: string
  record: string
  evidence: string
  result: 'match' | 'mismatch' | 'not found'
}

export interface Review {
  id: string
  model: string
  hadEvidence: boolean
  files: { id: string; filename: string; sha256: string; kind: 'pdf' | 'image' }[]
  createdAt: string
  summary: string
  risk: 'low' | 'medium' | 'high'
  findings: Finding[]
  comparison: ComparisonRow[]
}

export interface Permissions {
  role: 'buyer' | 'seller'
  canCommit: boolean
  canApprove: boolean
  canReject: boolean
  canConfirm: boolean
  canReview: boolean
  canVerify: boolean
  canEdit: boolean
  canCancel: boolean
}

export interface AgreementDetail {
  agreement: Agreement
  events: AgreementEvent[]
  reviews: Review[]
  evidence: EvidenceFile[]
  terms: string | null
  items: ItemView[]
  permissions: Permissions
  registered: { buyer: boolean; seller: boolean }
}

export interface InviteCreated {
  token: string
  expiresAt: string
  targetName: string
  targetRegistered: boolean
}

export interface InvitePreview {
  title: string
  amount: string
  currency: Currency
  inviter: string
  targetName: string
  targetRegistered: boolean
  youBelong: boolean
  deadline: string | null
  expiresAt: string
}

export interface InviteAccepted {
  agreementId: string
  joined: boolean
  organization: string
}

export interface EditInput {
  title?: string
  counterparty?: string
  amount?: string
  currency?: Currency
  terms?: string | null
  items?: ItemInput[]
  deadline?: string | null
}

export type NextAction = 'commit' | 'approve' | 'confirm'

export interface InboxItem {
  agreementId: string
  title: string
  counterparty: string
  amount: string
  currency: Currency
  action: NextAction
  label: string
  since: string
  deadline: string | null
}

export interface WaitingItem {
  agreementId: string
  title: string
  waitingOn: string
  label: string
  since: string
}

export interface ExpiredItem {
  agreementId: string
  title: string
  deadline: string
  committed: boolean
}

export interface Inbox {
  actionNeeded: InboxItem[]
  waiting: WaitingItem[]
  expired: ExpiredItem[]
}

export interface ActivityItem {
  id: string
  agreementId: string
  title: string
  kind: EventKind
  actor: string | null
  at: string
}

export interface Membership {
  key: string
  name: string
  role: 'owner' | 'member'
}

export interface Member {
  address: string
  role: 'owner' | 'member'
  since: string
}

export interface Me {
  address: string
  organizations: Membership[]
}

export interface Check {
  name: string
  ok: boolean
  detail: string
}

export interface Verification {
  verified: boolean
  checkedAt: string
  checks: Check[]
}

export type AgreementAction = 'commit' | 'approve' | 'reject' | 'confirm'

export interface AgreementList {
  agreements: Agreement[]
  total: number
}

export interface TimelinePoint {
  date: string
  created: number
  completed: number
}

export interface Metrics {
  total: number
  byStatus: Record<Status, number>
  onLedger: number
  expired: number
  valueByCurrency: { currency: Currency; total: string; count: number }[]
}

export type ServiceState = 'connected' | 'unreachable' | 'not-configured' | 'configured'

export interface ServiceStatus {
  status: ServiceState
  detail: string
  latencyMs?: number
  version?: string
  participantId?: string
}

export interface SystemStatus {
  api: ServiceStatus
  database: ServiceStatus
  ledger: ServiceStatus
  ai: ServiceStatus
  timestamp: string
}

export interface ItemInput {
  description: string
  quantity: string
  unitPrice: string
}

export interface ItemView extends ItemInput {
  position: number
  lineTotal: string
}

export interface NewAgreementInput {
  title: string
  buyer: string
  seller: string
  amount?: string
  currency: Currency
  terms?: string
  items?: ItemInput[]
  deadline?: string
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

const TOKEN_KEY = 'cantonflow.session'
let onUnauthorized: (() => void) | null = null

export const sessionToken = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = sessionToken.get()
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
    })
  } catch {
    throw new ApiError('Cannot reach the CantonFlow API. Is the server running?', 0)
  }

  const body = (await response.json().catch(() => null)) as { error?: string } | null
  if (response.status === 401 && token) onUnauthorized?.()
  if (!response.ok) {
    // The dev proxy answers 5xx with an empty body when the API process is down.
    throw new ApiError(body?.error ?? 'The CantonFlow API is unavailable.', response.status)
  }
  return body as T
}

// Downloads need the session token, so they cannot be plain links.
export async function download(path: string, fallbackName: string): Promise<void> {
  const token = sessionToken.get()
  let response: Response
  try {
    response = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  } catch {
    throw new ApiError('Cannot reach the CantonFlow API. Is the server running?', 0)
  }
  if (response.status === 401 && token) onUnauthorized?.()
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(body?.error ?? 'The download failed.', response.status)
  }
  const name = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export const api = {
  inbox: () => request<Inbox>('/inbox'),
  timeline: (days: number) => request<{ days: number; points: TimelinePoint[] }>(`/metrics/timeline?days=${days}`),
  activity: (limit = 20) => request<{ items: ActivityItem[] }>(`/activity?limit=${limit}`),
  nonce: (address: string) => request<{ message: string }>('/auth/nonce', { method: 'POST', body: JSON.stringify({ address }) }),
  verifySignIn: (address: string, signature: string) =>
    request<{ token: string; address: string; expiresAt: string; organizations: Membership[] }>('/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ address, signature }),
    }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  me: () => request<Me>('/me'),
  createOrganization: (name: string) =>
    request<{ organization: Membership }>('/organizations', { method: 'POST', body: JSON.stringify({ name }) }),
  members: (key: string) => request<{ members: Member[] }>(`/organizations/${encodeURIComponent(key)}/members`),
  addMember: (key: string, address: string) =>
    request<{ members: Member[] }>(`/organizations/${encodeURIComponent(key)}/members`, { method: 'POST', body: JSON.stringify({ address }) }),
  removeMember: (key: string, address: string) =>
    request<{ ok: true }>(`/organizations/${encodeURIComponent(key)}/members/${address}`, { method: 'DELETE' }),
  agreements: (params: { search?: string; status?: Status | 'Expired' | 'All' }) => {
    const query = new URLSearchParams()
    if (params.search) query.set('search', params.search)
    if (params.status && params.status !== 'All') query.set('status', params.status)
    const qs = query.toString()
    return request<AgreementList>(`/agreements${qs ? `?${qs}` : ''}`)
  },
  agreement: (id: string) => request<AgreementDetail>(`/agreements/${encodeURIComponent(id)}`),
  act: (id: string, action: AgreementAction) =>
    request<{ agreement: Agreement }>(`/agreements/${encodeURIComponent(id)}/${action}`, { method: 'POST' }),
  review: (id: string, evidence: string, evidenceIds: string[]) =>
    request<{ review: Review }>(`/agreements/${encodeURIComponent(id)}/review`, {
      method: 'POST',
      body: JSON.stringify({ evidence, evidenceIds }),
    }),
  uploadEvidence: (id: string, file: File) =>
    request<{ evidence: EvidenceFile }>(`/agreements/${encodeURIComponent(id)}/evidence?filename=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      body: file,
      headers: { 'Content-Type': 'application/octet-stream' },
    }),
  createInvite: (id: string) => request<InviteCreated>(`/agreements/${encodeURIComponent(id)}/invite`, { method: 'POST' }),
  previewInvite: (token: string) => request<InvitePreview>('/invites/preview', { method: 'POST', body: JSON.stringify({ token }) }),
  acceptInvite: (token: string) => request<InviteAccepted>('/invites/accept', { method: 'POST', body: JSON.stringify({ token }) }),
  edit: (id: string, patch: EditInput) =>
    request<{ agreement: Agreement }>(`/agreements/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  cancel: (id: string) => request<{ agreement: Agreement }>(`/agreements/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
  removeEvidence: (evidenceId: string) => request<{ ok: true }>(`/evidence/${evidenceId}`, { method: 'DELETE' }),
  verify: (id: string) => request<Verification>(`/agreements/${encodeURIComponent(id)}/verify`, { method: 'POST' }),
  metrics: () => request<Metrics>('/metrics'),
  status: () => request<SystemStatus>('/status'),
  createAgreement: (input: NewAgreementInput) =>
    request<{ agreement: Agreement }>('/agreements', { method: 'POST', body: JSON.stringify(input) }),
}
