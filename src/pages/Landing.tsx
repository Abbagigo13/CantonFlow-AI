import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { ThemeCycleButton } from '@/components/ThemeToggle'
import type { Route } from '@/lib/router'

const STEPS = [
  { n: '01', title: 'Draft', body: 'Set the buyer, seller and value in one place instead of across email threads and spreadsheets.' },
  { n: '02', title: 'Review', body: 'See every agreement and who needs to act next, with live status you can search and filter.' },
  { n: '03', title: 'Commit', body: 'Each approval is recorded on a Canton ledger, so the record is proof and not just a label.' },
]

const PRINCIPLES = [
  { title: 'Private by design', body: 'Canton shares an agreement only with the parties to it. The workflow is built around that model.' },
  { title: 'Nothing assumed', body: 'A service shows as connected only when it answers. If the ledger is not reachable, the app says so.' },
  { title: 'AI that advises', body: 'AI can flag issues in the terms. It can never approve an agreement. Only a participant can.' },
]

const DOCS = [
  { term: 'Agreements', body: 'Each agreement records a title, buyer, seller, value and currency, plus its current status: awaiting approval, approved, completed or rejected.' },
  { term: 'Sign-in and teams', body: 'You sign in by signing a message with your wallet. Your wallet belongs to an organization, and owners add teammates by wallet address. Only the buyer organization can approve and only the seller organization can commit and confirm.' },
  { term: 'Workspace', body: 'Overview shows live totals for your agreements. Agreements lets you search by title, party or ID and filter by status.' },
  { term: 'Storage', body: 'Agreements are saved in a PostgreSQL database through the CantonFlow API, so they persist between sessions. Each one is visible only to the two organizations involved.' },
  { term: 'Canton ledger', body: 'Agreements are written to a Canton ledger as Daml contracts. Buyer and seller act as separate parties, and every approval is a ledger transaction you can verify.' },
  { term: 'AI review', body: 'A model on the server compares an agreement with the evidence you attach (PDFs and images) or paste in, and with its ledger record, then flags discrepancies. Its output is advice and is kept apart from approvals.' },
  { term: 'Integrations', body: 'The Integrations page checks the API, database, ledger and AI provider live, and shows each as connected only when it responds.' },
]

const AVAILABLE = [
  'Sign in with a wallet and work as an organization',
  'Create agreements with terms, line items and a deadline, and edit or cancel them until they are committed',
  'Invite the other side with a one-time link',
  'Search and filter by status',
  'Commit to a Canton ledger with separate buyer and seller parties',
  'Approve, reject and confirm on the ledger',
  'Verify any agreement against the ledger',
  'In-app alerts for what needs your action, an activity feed and an activity chart',
  'Export agreements as CSV and download a PDF audit report',
  'Light and dark themes, and a compact table view',
  'Attach PDF and image evidence, with fingerprints in the audit report',
  'AI review that reads your evidence files and compares them with the record, as advice only',
  'Real service status checks',
]
const PLANNED = ['Connecting to a public Canton network', 'Reading scanned PDFs directly (upload them as images for now)']

const FAQS = [
  { q: 'What is CantonFlow AI?', a: 'A workspace where buyers and sellers record private trade agreements and track what needs to happen next. It is built with the Canton Network in mind.' },
  { q: 'Are my agreements on a Canton ledger?', a: 'Once you commit them. Committing creates a Daml contract on a Canton ledger, and the app stores its contract ID, transaction and offset. Today that ledger is a local Canton sandbox, not the public network. Agreements you have not committed are labelled as database-only.' },
  { q: 'Can AI approve an agreement?', a: 'No. AI review only flags issues and suggests what to check. It cannot approve, reject or change an agreement. An approval can only come from a participant to the agreement.' },
  { q: 'Do I need a wallet?', a: 'You need a wallet to sign in, but you only sign a free message to prove you own it. The app never asks for a private key or seed phrase, and signing in moves no funds.' },
  { q: 'What happens when an agreement passes its deadline?', a: 'It is marked Expired and can no longer be committed, approved, rejected or confirmed. The deadline is a rule of this app, not something the ledger enforces. The creator can extend the deadline or cancel the agreement while it is still a draft.' },
  { q: 'Can I change an agreement after creating it?', a: 'Yes, until it is committed to the ledger. Only the organization that created it can edit or cancel it, and every edit is recorded in the history. After the commit, the agreement is fixed.' },
  { q: 'Does any money move?', a: 'No. Amounts are recorded as part of the agreement in USD, USDC or EUR. The app does not send or hold funds.' },
  { q: 'Who can see my agreements?', a: 'Only members of the buyer and seller organizations. You sign in with your wallet, and an agreement is hidden from every wallet that does not belong to one of its two organizations. On the ledger, each party also only sees contracts it is part of.' },
]

function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

export function Landing({ onNavigate }: { onNavigate: (to: Route) => void }) {
  const open = () => onNavigate('/dashboard')
  const preload = () => void import('@/Workspace')

  // Fetch the app code in the background so "Open app" feels instant.
  useEffect(() => {
    const id = window.setTimeout(preload, 2500)
    return () => window.clearTimeout(id)
  }, [])

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between px-5 sm:h-16 sm:flex-nowrap sm:px-8">
          <div className="flex h-14 items-center gap-2.5 sm:h-auto">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent font-display font-bold text-onaccent">C</span>
            <span className="whitespace-nowrap font-display text-base font-semibold">CantonFlow AI</span>
          </div>
          <div className="flex h-14 items-center gap-1 sm:order-3 sm:h-auto">
            <span className="hidden sm:block">
              <ThemeCycleButton />
            </span>
            <button
              onClick={open}
              onPointerEnter={preload}
              onFocus={preload}
              className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border border-line px-4 text-sm font-medium transition hover:bg-raised sm:px-5"
            >
              Open app <ArrowRight size={16} />
            </button>
          </div>
          <nav aria-label="Page sections" className="order-last flex w-full items-center justify-center gap-1 border-t border-line/60 sm:order-2 sm:ml-auto sm:mr-3 sm:w-auto sm:gap-2 sm:border-0">
            {[
              ['#how', 'How it works'],
              ['#docs', 'Docs'],
              ['#faqs', 'FAQs'],
            ].map(([href, label]) => (
              <a key={href} href={href} className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-muted transition hover:text-ink">
                {label}
              </a>
            ))}
            <span className="sm:hidden">
              <ThemeCycleButton />
            </span>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 [background-image:linear-gradient(rgb(var(--c-tint)/0.06)_1px,transparent_1px),linear-gradient(90deg,rgb(var(--c-tint)/0.06)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(ellipse_at_50%_0%,black,transparent_70%)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 h-[28rem] w-[44rem] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl"
          />
          <div className="relative mx-auto max-w-6xl px-5 pb-24 pt-20 sm:px-8 sm:pb-32 sm:pt-28">
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="text-xs font-medium uppercase tracking-[0.14em] text-accent"
            >
              Built for the Canton Network
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.05 }}
              className="mt-6 max-w-4xl font-display text-5xl font-semibold leading-[1.02] tracking-[-0.035em] sm:text-7xl"
            >
              Private trade agreements, run with clarity.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.12 }}
              className="mt-7 max-w-xl text-lg text-muted"
            >
              One workspace for buyers and sellers to draft agreements, see who acts next, and keep a record that holds up.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.18 }}
              className="mt-10 flex flex-wrap items-center gap-3"
            >
              <button
                onClick={open}
                className="inline-flex min-h-12 items-center gap-2 rounded-full bg-accent px-7 text-sm font-semibold text-onaccent transition hover:brightness-110 active:scale-[0.98]"
              >
                Open the app <ArrowRight size={16} />
              </button>
              <a
                href="#how"
                className="inline-flex min-h-12 items-center px-5 text-sm font-medium text-muted transition hover:text-ink"
              >
                How it works
              </a>
            </motion.div>
          </div>
        </section>

        <section id="how" className="scroll-mt-16 border-t border-line">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
            <Reveal>
              <h2 className="max-w-2xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">From first draft to a record you can trust.</h2>
            </Reveal>
            <div className="mt-14 divide-y divide-line border-y border-line">
              {STEPS.map((s) => (
                <Reveal key={s.n} className="grid gap-3 py-8 sm:grid-cols-[6rem_1fr_1.4fr] sm:gap-8">
                  <span className="font-mono text-sm text-muted">{s.n}</span>
                  <h3 className="flex items-center gap-3 font-display text-2xl font-semibold">
                    {s.title}
                  </h3>
                  <p className="max-w-md text-muted">{s.body}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-line">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1fr_1.5fr]">
            <Reveal>
              <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Honest about what is real.</h2>
            </Reveal>
            <div className="space-y-10">
              {PRINCIPLES.map((p) => (
                <Reveal key={p.title}>
                  <h3 className="font-display text-xl font-semibold">{p.title}</h3>
                  <p className="mt-2 max-w-lg text-muted">{p.body}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="docs" className="scroll-mt-16 border-t border-line">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
            <Reveal>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent">Docs overview</p>
              <h2 className="mt-4 max-w-2xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">What CantonFlow AI is and how it fits together.</h2>
              <p className="mt-5 max-w-2xl text-muted">
                CantonFlow AI is a workspace for private business agreements. It tracks each agreement between a buyer and a seller, and each approval is recorded on a Canton ledger.
              </p>
            </Reveal>

            <dl className="mt-14 divide-y divide-line border-y border-line">
              {DOCS.map((d) => (
                <Reveal key={d.term} className="grid gap-2 py-7 sm:grid-cols-[14rem_1fr] sm:gap-8">
                  <dt className="font-display text-lg font-semibold">{d.term}</dt>
                  <dd className="max-w-xl text-muted">{d.body}</dd>
                </Reveal>
              ))}
            </dl>

            <Reveal className="mt-14 grid gap-10 sm:grid-cols-2">
              <div>
                <h3 className="font-display text-lg font-semibold">Available now</h3>
                <ul className="mt-4 space-y-2.5 text-muted">
                  {AVAILABLE.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ok" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-display text-lg font-semibold">In development</h3>
                <ul className="mt-4 space-y-2.5 text-muted">
                  {PLANNED.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </section>

        <section id="faqs" className="scroll-mt-16 border-t border-line">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1fr_1.6fr]">
            <Reveal>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent">FAQs</p>
              <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Questions, answered plainly.</h2>
            </Reveal>
            <Reveal className="divide-y divide-line border-y border-line">
              {FAQS.map((f) => (
                <details key={f.q} className="group py-1">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 font-display text-lg font-medium [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <ChevronDown size={20} className="shrink-0 text-muted transition-transform duration-200 group-open:rotate-180" />
                  </summary>
                  <p className="max-w-xl pb-5 text-muted">{f.a}</p>
                </details>
              ))}
            </Reveal>
          </div>
        </section>

        <section className="border-t border-line">
          <Reveal className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-5 py-24 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-32">
            <h2 className="max-w-xl font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Start with your first agreement.</h2>
            <button
              onClick={open}
              className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-accent px-7 text-sm font-semibold text-onaccent transition hover:brightness-110 active:scale-[0.98]"
            >
              Open the app <ArrowRight size={16} />
            </button>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-sm text-muted sm:px-8">
          <span>CantonFlow AI</span>
          <span>Runs on a local Canton sandbox.</span>
        </div>
      </footer>
    </div>
  )
}
