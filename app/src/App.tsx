import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Toaster, toast } from 'sonner'
import { Landmark, Wallet, Loader2, Plus, ScanText, HandCoins } from 'lucide-react'
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
    <div className="min-h-screen bg-background text-foreground">
      <Toaster theme="dark" position="top-right" richColors />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(900px_circle_at_50%_-10%,#818cf81f,transparent_60%)]" />
      <header className="border-b border-border"><div className="mx-auto flex h-16 max-w-5xl items-center gap-2.5 px-5">
        <Landmark className="h-5 w-5 text-primary" /><span className="text-[15px] font-bold tracking-tight">LoanUnderwrite</span>
        <div className="ml-4 hidden font-mono text-xs text-muted md:block"><b className="text-accent"><NumberTicker value={Number(toGen(stats.funded_wei).toFixed(2))} decimalPlaces={2} /></b> GEN funded · <b className="text-foreground"><NumberTicker value={stats.funded} /></b> loans</div>
        <Button size="sm" className="ml-auto" variant="outline" onClick={() => setOpen(!open)}><Plus className="h-4 w-4" /> Request</Button>
        <Button size="sm" className="ml-2" variant={wallet ? 'outline' : 'primary'} onClick={connect}><Wallet className="h-4 w-4" />{wallet && wallet !== 'connected' ? short(wallet) : wallet ? 'Connected' : 'Connect'}</Button>
      </div></header>

      <div className="mx-auto max-w-5xl px-5 pt-5">
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden">
            <div className="mb-4 grid gap-2 rounded-xl border border-border bg-card/60 p-3 sm:grid-cols-[120px_1fr_1fr_auto]">
              <div className="relative"><input value={amt} onChange={(e) => setAmt(e.target.value)} className="w-full rounded-md border border-border bg-background/70 px-3 py-2 pr-12 text-sm outline-none focus:border-primary/50" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-accent">GEN</span></div>
              <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Purpose" className="rounded-md border border-border bg-background/70 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              <input value={ev} onChange={(e) => setEv(e.target.value)} placeholder="Financial evidence URL" className="rounded-md border border-border bg-background/70 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              <Button size="sm" onClick={request} disabled={creating}>{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />} Apply</Button>
            </div>
          </motion.div>
        )}
        {/* loan tabs */}
        <div className="flex flex-wrap gap-2">
          {loans.map((x) => <button key={x.id} onClick={() => setSel(x.id)} className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${sel === x.id ? 'border-primary bg-primary/10' : 'border-border text-muted hover:text-foreground'}`}><span className="tabular-nums">{toGen(x.amount_wei)} GEN</span>{x.state !== 'requested' && <span className="font-black" style={{ color: GC[x.grade] ?? '#94a3b8' }}>{x.approved ? x.grade : '✕'}</span>}</button>)}
        </div>
      </div>

      {!l ? <div className="mx-auto max-w-5xl px-5 py-24 text-center text-sm text-muted">No loan applications yet.</div> : (
        <main className="mx-auto max-w-5xl px-5 py-6">
          <div className="rounded-2xl border border-border bg-card/50 p-6">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-muted">credit report · application #{l.id}</div>
            <div className="mt-4 grid items-center gap-6 sm:grid-cols-[auto_auto_1fr]">
              {/* grade dial */}
              <div className="text-center">
                <div className="grid h-28 w-28 place-items-center rounded-full border-4" style={{ borderColor: uw ? gc : '#2a2a3a' }}>
                  <span className="text-6xl font-black" style={{ color: uw ? gc : '#555' }}>{uw ? (l.approved ? l.grade : '✕') : '?'}</span>
                </div>
                <div className="mt-1 text-[11px] uppercase text-muted">risk grade</div>
              </div>
              {/* APR gauge */}
              <div className="text-center">
                <div className="relative h-24 w-24">
                  <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90"><circle cx="36" cy="36" r="30" fill="none" stroke="#ffffff12" strokeWidth="6" /><circle cx="36" cy="36" r="30" fill="none" stroke={gc} strokeWidth="6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - aprPct / 100)} /></svg>
                  <div className="absolute inset-0 grid place-items-center"><div><div className="text-xl font-black tabular-nums" style={{ color: gc }}>{uw ? (l.apr_bps / 100).toFixed(1) : '—'}</div><div className="text-[9px] text-muted">% APR</div></div></div>
                </div>
              </div>
              {/* meta */}
              <div className="min-w-0">
                <div className="text-3xl font-black tabular-nums">{toGen(l.amount_wei)} <span className="text-base text-accent">GEN</span></div>
                <div className="mt-1 text-sm text-muted">{l.purpose}</div>
                <a href={l.evidence_url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-accent hover:underline">{l.evidence_url}</a>
                <div className="mt-1 font-mono text-[11px] text-muted">borrower {short(l.borrower)}{l.lender ? ` · lender ${short(l.lender)}` : ''}</div>
              </div>
            </div>
            {uw && l.reason && <p className="mt-4 border-l-2 pl-3 text-sm text-muted" style={{ borderColor: gc }}>{l.reason}</p>}
            <div className="mt-5 flex gap-2">
              {l.state === 'requested' && <Button disabled={busy === l.id} onClick={() => underwrite(l)}>{busy === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />} Underwrite</Button>}
              {l.state === 'underwritten' && l.approved && <Button disabled={busy === l.id} onClick={() => fund(l)}>{busy === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <HandCoins className="h-4 w-4" />} Fund {toGen(l.amount_wei)} GEN</Button>}
              {l.state === 'underwritten' && !l.approved && <span className="rounded-lg border border-false/40 bg-false/10 px-3 py-2 text-xs font-semibold uppercase text-false">declined</span>}
              {l.state === 'funded' && <span className="rounded-lg border border-true/40 bg-true/10 px-3 py-2 text-xs font-semibold uppercase text-true">funded</span>}
            </div>
          </div>
        </main>
      )}
      <footer className="border-t border-border"><div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-6 text-xs text-muted"><span>LoanUnderwrite · consensus credit underwriting</span><a href={EXPLORER} target="_blank" rel="noreferrer" className="hover:text-primary">{short(CONTRACT)} ↗</a></div></footer>
    </div>
  )
}
