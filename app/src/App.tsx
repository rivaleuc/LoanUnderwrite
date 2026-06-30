import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Toaster, toast } from 'sonner'
import {
  Landmark, Wallet, Loader2, Plus, ScanText, HandCoins, ChevronDown, Coins,
} from 'lucide-react'
import { read, write, connectWallet, isWalletConnected, CONTRACT } from './genlayer'
import { Button } from './components/ui'
import { NumberTicker } from './components/magic'

const EXPLORER = `https://explorer-bradbury.genlayer.com/contract/${CONTRACT}`
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const toGen = (wei: string | number) => Number(BigInt(wei || '0')) / 1e18

type Loan = { id: string; borrower: string; amount_wei: string; purpose: string; evidence_url: string; state: string; approved: boolean; grade: string; apr_bps: number; reason: string; lender: string }

const GRADE: Record<string, string> = { A: 'text-true border-true/40 bg-true/10', B: 'text-accent border-accent/40 bg-accent/10', C: 'text-unverifiable border-unverifiable/40 bg-unverifiable/10', D: 'text-false border-false/40 bg-false/10' }

export default function App() {
  const [wallet, setWallet] = useState<string | null>(null)
  const [stats, setStats] = useState({ total_loans: 0, funded: 0, funded_wei: '0' })
  const [loans, setLoans] = useState<Loan[]>([])
  const [open, setOpen] = useState(false); const [exp, setExp] = useState<string | null>(null)
  const [amt, setAmt] = useState('1'); const [purpose, setPurpose] = useState(''); const [ev, setEv] = useState('')
  const [creating, setCreating] = useState(false); const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    try {
      const s = (await read('stats')) as any
      setStats({ total_loans: Number(s?.total_loans ?? 0), funded: Number(s?.funded ?? 0), funded_wei: String(s?.funded_wei ?? '0') })
      const total = Number(s?.total_loans ?? 0); const out: Loan[] = []
      for (let i = total - 1; i >= 0 && i >= total - 12; i--) { try { const l = (await read('get_loan', [String(i)])) as any; if (l?.exists) out.push({ ...l, id: String(i) }) } catch {} }
      setLoans(out)
    } catch (e) { console.warn(e) }
  }
  useEffect(() => { load(); setWallet(isWalletConnected() ? 'connected' : null) /* eslint-disable-next-line */ }, [])

  async function connect() { try { const a = await connectWallet(); setWallet(a); toast.success(`Connected · ${short(a)}`) } catch (e: any) { toast.error(e?.message ?? 'Failed') } }
  function wei(g: string) { return BigInt(Math.round((Number(g) || 0) * 1e18)) }
  async function request() { if (!purpose.trim() || !ev.trim()) return toast.error('Purpose + evidence URL.'); const g = Number(amt); if (!(g > 0)) return toast.error('Amount > 0'); setCreating(true); const t = toast.loading('Requesting loan…'); try { await write('request_loan', [wei(amt).toString(), purpose.trim(), ev.trim()]); toast.success('Requested.', { id: t }); setPurpose(''); setEv(''); setOpen(false); await load() } catch (e: any) { toast.error(`Failed: ${e?.shortMessage ?? e?.message ?? e}`, { id: t }) } finally { setCreating(false) } }
  async function underwrite(l: Loan) { setBusy(l.id); const t = toast.loading('Validators underwriting… (30–60s)'); try { await write('underwrite', [l.id]); const x = (await read('get_loan', [l.id])) as any; toast.success(x?.approved ? `Approved · grade ${x?.grade}` : 'Declined', { id: t }); await load() } catch (e: any) { toast.error(`Failed: ${e?.shortMessage ?? e?.message ?? e}`, { id: t }) } finally { setBusy(null) } }
  async function fund(l: Loan) { setBusy(l.id); const t = toast.loading('Funding loan…'); try { await write('fund', [l.id], BigInt(l.amount_wei)); toast.success('Funded → borrower paid.', { id: t }); await load() } catch (e: any) { toast.error(`Failed: ${e?.shortMessage ?? e?.message ?? e}`, { id: t }) } finally { setBusy(null) } }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster theme="dark" position="top-right" richColors />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(720px_circle_at_50%_-5%,#818cf81f,transparent_60%)]" />

      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-4xl items-center gap-2.5 px-5">
          <Landmark className="h-5 w-5 text-primary" /><span className="text-[15px] font-bold tracking-tight">LoanUnderwrite</span>
          <div className="ml-4 hidden font-mono text-xs text-muted md:block"><b className="text-foreground"><NumberTicker value={stats.total_loans} /></b> loans · <b className="text-accent"><NumberTicker value={stats.funded} /></b> funded · <b className="text-accent"><NumberTicker value={Number(toGen(stats.funded_wei).toFixed(3))} decimalPlaces={3} /></b> GEN</div>
          <Button size="sm" className="ml-auto" variant={wallet ? 'outline' : 'primary'} onClick={connect}><Wallet className="h-4 w-4" />{wallet && wallet !== 'connected' ? short(wallet) : wallet ? 'Connected' : 'Connect'}</Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-8">
        <h1 className="text-2xl font-black tracking-tight md:text-3xl">Credit decisions by consensus</h1>
        <p className="mt-1 text-sm text-muted">Borrowers post evidence, validators agree on a risk grade + rate, and lenders fund the approved loans.</p>

        <div className="mt-5"><Button onClick={() => setOpen(!open)} variant={open ? 'ghost' : 'primary'}><Plus className="h-4 w-4" />{open ? 'Cancel' : 'Request a loan'}</Button></div>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden">
            <div className="mt-3 grid gap-2 rounded-xl border border-border bg-card/60 p-3">
              <div className="flex gap-2"><div className="relative w-32"><input value={amt} onChange={(e) => setAmt(e.target.value)} className="w-full rounded-md border border-border bg-background/70 px-3 py-2.5 pr-12 text-sm outline-none focus:border-primary/50" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-accent">GEN</span></div><input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Purpose of the loan" className="flex-1 rounded-md border border-border bg-background/70 px-3 py-2.5 text-sm outline-none focus:border-primary/50" /></div>
              <div className="flex gap-2"><input value={ev} onChange={(e) => setEv(e.target.value)} placeholder="Financial evidence URL" className="flex-1 rounded-md border border-border bg-background/70 px-3 py-2.5 text-sm outline-none focus:border-primary/50" /><Button size="sm" onClick={request} disabled={creating}>{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />} Request</Button></div>
            </div>
          </motion.div>
        )}

        <div className="mt-6 space-y-2">
          {loans.length === 0 && <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted">No loans yet.</div>}
          {loans.map((l) => {
            const uw = l.state !== 'requested'
            return (
              <div key={l.id} className="rounded-xl border border-border bg-card/50">
                <button onClick={() => setExp(exp === l.id ? null : l.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                  <Coins className="h-4 w-4 shrink-0 text-accent" />
                  <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="font-bold tabular-nums">{toGen(l.amount_wei)} GEN</span><span className="truncate text-xs text-muted">{l.purpose}</span></div></div>
                  {uw && (l.approved ? <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${GRADE[l.grade] ?? GRADE.D}`}>{l.grade} · {(l.apr_bps / 100).toFixed(1)}%</span> : <span className="rounded border border-false/40 bg-false/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-false">declined</span>)}
                  <span className="text-xs text-muted">{l.state}</span>
                  <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform ${exp === l.id ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {exp === l.id && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden border-t border-border/60">
                      <div className="space-y-3 p-4">
                        <a href={l.evidence_url} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">{l.evidence_url}</a>
                        {uw && l.reason && <p className="text-xs text-muted">{l.reason}</p>}
                        <div className="flex gap-2">
                          {l.state === 'requested' && <Button size="sm" disabled={busy === l.id} onClick={() => underwrite(l)}>{busy === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />} Underwrite</Button>}
                          {l.state === 'underwritten' && l.approved && <Button size="sm" disabled={busy === l.id} onClick={() => fund(l)}>{busy === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <HandCoins className="h-4 w-4" />} Fund {toGen(l.amount_wei)} GEN</Button>}
                          {l.state === 'funded' && <span className="text-xs text-accent">Funded by {short(l.lender)}</span>}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      </main>

      <footer className="border-t border-border"><div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-6 text-xs text-muted"><span>LoanUnderwrite · consensus credit underwriting on GenLayer</span><a href={EXPLORER} target="_blank" rel="noreferrer" className="hover:text-primary">{short(CONTRACT)} ↗</a></div></footer>
    </div>
  )
}
