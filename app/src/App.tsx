import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Toaster, toast } from 'sonner'
import { Landmark, Wallet, Loader2, Plus, ScanText, HandCoins, FileText, ArrowUpRight } from 'lucide-react'
import { read, write, connectWallet, isWalletConnected, CONTRACT } from './genlayer'
import { Button } from './components/ui'
import { NumberTicker } from './components/magic'

const EXPLORER = `https://explorer-bradbury.genlayer.com/contract/${CONTRACT}`
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const toGen = (w: string | number) => Number(BigInt(w || '0')) / 1e18
type Loan = { id: string; borrower: string; amount_wei: string; purpose: string; evidence_url: string; state: string; approved: boolean; grade: string; apr_bps: number; reason: string; lender: string }
const GC: Record<string, string> = { A: '#34d399', B: '#22d3ee', C: '#fbbf24', D: '#fb7185' }

export default function App() {
  const [wallet, setWallet] = useState<string | null>(null)
  const [stats, setStats] = useState({ total_loans: 0, funded: 0, funded_wei: '0' })
  const [loans, setLoans] = useState<Loan[]>([]); const [sel, setSel] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [amt, setAmt] = useState('1'); const [purpose, setPurpose] = useState(''); const [ev, setEv] = useState('')
  const [creating, setCreating] = useState(false); const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    try {
      const s = (await read('stats')) as any
      setStats({ total_loans: Number(s?.total_loans ?? 0), funded: Number(s?.funded ?? 0), funded_wei: String(s?.funded_wei ?? '0') })
      const total = Number(s?.total_loans ?? 0); const out: Loan[] = []
      for (let i = total - 1; i >= 0 && i >= total - 16; i--) { try { const l = (await read('get_loan', [String(i)])) as any; if (l?.exists) out.push({ ...l, id: String(i) }) } catch {} }
      setLoans(out); if (!sel && out.length) setSel(out[0].id)
    } catch (e) { console.warn(e) }
  }
  useEffect(() => { load(); setWallet(isWalletConnected() ? 'connected' : null) /* eslint-disable-next-line */ }, [])

  async function connect() { try { const a = await connectWallet(); setWallet(a); toast.success(`Connected · ${short(a)}`) } catch (e: any) { toast.error(e?.message ?? 'Failed') } }
  function wei(g: string) { return BigInt(Math.round((Number(g) || 0) * 1e18)) }
  async function request() { if (!purpose.trim() || !ev.trim()) return toast.error('Purpose + evidence.'); if (!(Number(amt) > 0)) return toast.error('Amount > 0'); setCreating(true); const t = toast.loading('Requesting…'); try { const id = (await write('request_loan', [wei(amt).toString(), purpose.trim(), ev.trim()])) as any; toast.success('Requested.', { id: t }); setPurpose(''); setEv(''); setOpen(false); await load(); if (typeof id === 'string') setSel(id) } catch (e: any) { toast.error(`Failed: ${e?.shortMessage ?? e?.message ?? e}`, { id: t }) } finally { setCreating(false) } }
  async function underwrite(l: Loan) { setBusy(l.id); const t = toast.loading('Underwriting… (30–60s)'); try { await write('underwrite', [l.id]); const x = (await read('get_loan', [l.id])) as any; toast.success(x?.approved ? `Grade ${x?.grade}` : 'Declined', { id: t }); await load() } catch (e: any) { toast.error(`Failed: ${e?.shortMessage ?? e?.message ?? e}`, { id: t }) } finally { setBusy(null) } }
  async function fund(l: Loan) { setBusy(l.id); const t = toast.loading('Funding…'); try { await write('fund', [l.id], BigInt(l.amount_wei)); toast.success('Funded.', { id: t }); await load() } catch (e: any) { toast.error(`Failed: ${e?.shortMessage ?? e?.message ?? e}`, { id: t }) } finally { setBusy(null) } }

  const l = loans.find((x) => x.id === sel) || null
  const uw = l && l.state !== 'requested'; const gc = l ? (GC[l.grade] ?? '#94a3b8') : '#94a3b8'
  const aprPct = l ? Math.min(100, l.apr_bps / 100) : 0; const C = 2 * Math.PI * 30

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ fontFamily: 'Sora, system-ui, sans-serif' }}>
      <Toaster theme="dark" position="top-right" richColors />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(900px_circle_at_85%_-8%,#818cf81f,transparent_60%)]" />

      {/* minimal top brand line — not a bar */}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-6 pt-7">
        <Landmark className="h-5 w-5 text-primary" />
        <span className="text-[15px] font-bold tracking-tight">LoanUnderwrite</span>
        <span className="hidden h-3.5 w-px bg-border sm:block" />
        <span className="hidden text-[10px] uppercase tracking-[0.32em] text-muted sm:block">credit desk</span>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setOpen(!open)}><Plus className="h-4 w-4" /> Request</Button>
          <Button size="sm" variant={wallet ? 'outline' : 'primary'} onClick={connect}><Wallet className="h-4 w-4" />{wallet && wallet !== 'connected' ? short(wallet) : wallet ? 'Connected' : 'Connect'}</Button>
        </div>
        <div className="basis-full font-mono text-xs text-muted">
          <b className="text-accent"><NumberTicker value={Number(toGen(stats.funded_wei).toFixed(2))} decimalPlaces={2} /></b> GEN funded · <b className="text-foreground"><NumberTicker value={stats.funded} /></b> settled · <b className="text-foreground"><NumberTicker value={stats.total_loans} /></b> applications
        </div>
      </div>

      {/* asymmetric desk: ledger (left) + sticky risk summary (right) */}
      <main className="mx-auto grid max-w-6xl gap-6 px-6 py-7 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start">
        {/* LEFT — request, ledger, selected credit file */}
        <section className="min-w-0 space-y-4">
          {open && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden">
              <div className="grid gap-2 rounded-2xl border border-primary/30 bg-card/60 p-3 sm:grid-cols-[110px_1fr_1fr_auto]">
                <div className="relative"><input value={amt} onChange={(e) => setAmt(e.target.value)} className="w-full rounded-md border border-border bg-background/70 px-3 py-2 pr-12 text-sm outline-none focus:border-primary/50" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-accent">GEN</span></div>
                <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Purpose" className="rounded-md border border-border bg-background/70 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <input value={ev} onChange={(e) => setEv(e.target.value)} placeholder="Financial evidence URL" className="rounded-md border border-border bg-background/70 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <Button size="sm" onClick={request} disabled={creating}>{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />} Apply</Button>
              </div>
            </motion.div>
          )}

          <div className="overflow-hidden rounded-2xl border border-border bg-card/40">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-[11px] uppercase tracking-[0.25em] text-muted">
              <FileText className="h-3.5 w-3.5 text-primary" /> loan ledger
              <span className="ml-auto font-mono text-[11px] normal-case tracking-normal">{loans.length}</span>
            </div>
            {loans.length === 0 ? (
              <div className="px-4 py-14 text-center text-sm text-muted">No loan applications yet — request the first.</div>
            ) : (
              <div className="divide-y divide-border">
                {loans.map((x) => {
                  const xc = GC[x.grade] ?? '#94a3b8'; const done = x.state !== 'requested'
                  return (
                    <button key={x.id} onClick={() => setSel(x.id)} className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${sel === x.id ? 'bg-primary/10' : 'hover:bg-white/[0.03]'}`}>
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border text-sm font-black" style={{ borderColor: sel === x.id ? '#818cf8' : '#262642', color: done ? xc : '#6b6b85' }}>{done ? (x.approved ? x.grade : '✕') : '?'}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{x.purpose || `Application #${x.id}`}</span>
                        <span className="block truncate font-mono text-[11px] text-muted">#{x.id} · {short(x.borrower)}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-bold tabular-nums">{toGen(x.amount_wei)}<span className="ml-1 text-[10px] text-accent">GEN</span></span>
                        <span className="block text-[10px] uppercase tracking-wider text-muted">{x.state}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {l && (
            <div className="rounded-2xl border border-border bg-card/50 p-5">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-muted">credit file · application #{l.id}</div>
              <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-3xl font-black tabular-nums">{toGen(l.amount_wei)} <span className="text-base text-accent">GEN</span></div>
                  <div className="mt-1 text-sm text-muted">{l.purpose}</div>
                </div>
                {uw && (
                  <div className="text-right">
                    <div className="text-2xl font-black leading-none" style={{ color: gc }}>{l.approved ? l.grade : '✕'}</div>
                    <div className="mt-1 text-[10px] uppercase tracking-wider text-muted">{l.approved ? `${(l.apr_bps / 100).toFixed(1)}% APR` : 'declined'}</div>
                  </div>
                )}
              </div>
              <a href={l.evidence_url} target="_blank" rel="noreferrer" className="mt-2 block truncate text-xs text-accent hover:underline">{l.evidence_url}</a>
              <div className="mt-2 font-mono text-[11px] text-muted">borrower {short(l.borrower)}{l.lender ? ` · lender ${short(l.lender)}` : ''}</div>
              {uw && l.reason && <p className="mt-4 border-l-2 pl-3 text-sm text-muted" style={{ borderColor: gc }}>{l.reason}</p>}
              <div className="mt-5 flex flex-wrap gap-2">
                {l.state === 'requested' && <Button disabled={busy === l.id} onClick={() => underwrite(l)}>{busy === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />} Underwrite</Button>}
                {l.state === 'underwritten' && l.approved && <Button disabled={busy === l.id} onClick={() => fund(l)}>{busy === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <HandCoins className="h-4 w-4" />} Fund {toGen(l.amount_wei)} GEN</Button>}
                {l.state === 'underwritten' && !l.approved && <span className="rounded-lg border border-false/40 bg-false/10 px-3 py-2 text-xs font-semibold uppercase text-false">declined</span>}
                {l.state === 'funded' && <span className="rounded-lg border border-true/40 bg-true/10 px-3 py-2 text-xs font-semibold uppercase text-true">funded</span>}
              </div>
            </div>
          )}
        </section>

        {/* RIGHT — sticky risk summary: big grade dial + APR gauge (SVG dials kept) */}
        <aside className="lg:sticky lg:top-7">
          <div className="overflow-hidden rounded-2xl border border-border bg-card/50">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <span className="text-[11px] uppercase tracking-[0.25em] text-muted">risk summary</span>
              {l && <span className="font-mono text-[11px] text-muted">#{l.id}</span>}
            </div>
            <div className="px-5 py-7">
              <div className="flex flex-col items-center">
                <div className="grid h-40 w-40 place-items-center rounded-full border-4" style={{ borderColor: uw ? gc : '#2a2a3a' }}>
                  <span className="text-7xl font-black leading-none" style={{ color: uw ? gc : '#555' }}>{uw ? (l.approved ? l.grade : '✕') : '?'}</span>
                </div>
                <div className="mt-3 text-[11px] uppercase tracking-[0.2em] text-muted">risk grade</div>
              </div>
              <div className="mt-7 flex items-center justify-center gap-6">
                <div className="relative h-24 w-24">
                  <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90"><circle cx="36" cy="36" r="30" fill="none" stroke="#ffffff12" strokeWidth="6" /><circle cx="36" cy="36" r="30" fill="none" stroke={gc} strokeWidth="6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - aprPct / 100)} /></svg>
                  <div className="absolute inset-0 grid place-items-center"><div className="text-center"><div className="text-xl font-black tabular-nums" style={{ color: gc }}>{uw ? (l.apr_bps / 100).toFixed(1) : '—'}</div><div className="text-[9px] text-muted">% APR</div></div></div>
                </div>
                <div className="space-y-1">
                  <div className="text-2xl font-black tabular-nums leading-none">{l ? toGen(l.amount_wei) : '—'} <span className="text-xs text-accent">GEN</span></div>
                  <div className="text-[11px] uppercase tracking-wider text-muted">{l ? l.state : 'no loan selected'}</div>
                </div>
              </div>
            </div>
            <a href={EXPLORER} target="_blank" rel="noreferrer" className="flex items-center justify-between border-t border-border px-5 py-3 font-mono text-[11px] text-muted transition-colors hover:text-primary">
              <span>contract {short(CONTRACT)}</span><ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </aside>
      </main>

      <footer className="mx-auto max-w-6xl px-6 pb-8 pt-1 text-center text-[11px] text-muted">LoanUnderwrite · consensus credit underwriting on GenLayer</footer>
    </div>
  )
}
