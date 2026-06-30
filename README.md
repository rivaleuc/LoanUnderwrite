# LoanUnderwrite

**AI underwriting + lender funding, settled by GenLayer consensus.**

A borrower requests a loan with a purpose and a link to financial evidence. `underwrite` has every
validator independently read the evidence and assign a **risk grade (A–D)** + a suggested APR, approving
or declining; the result is accepted only when validators agree on the **grade** (comparative
equivalence). An approved loan can then be `fund`ed by any lender, whose capital is forwarded to the
borrower via `emit_transfer`.

The verb is **"underwrite risk → fund the approved loan"** — the consensus output is a credit decision,
not a yes/no on one fact.

- **Live demo:** https://loanunderwrite.pages.dev
- **Contract (Bradbury, chain 4221):** `0xB89BAFE6D8d9B26E3A7a6810AEC5c67B2Eac0975`
- **Deployed from:** `rivale` (`0xc388…51A44`)
- **Explorer:** https://explorer-bradbury.genlayer.com/contract/0xB89BAFE6D8d9B26E3A7a6810AEC5c67B2Eac0975

---

## Why GenLayer is essential

Underwriting reads real financial evidence and exercises judgment to grade risk — beyond a deterministic
EVM. GenLayer has validators independently assess and agree on the grade before any capital moves, so
the credit decision is decentralized and reproducible, and funding is bound to an approved grade.

## Workflow

| Step | Method | What happens |
| --- | --- | --- |
| Request | `request_loan(amount_wei, purpose, evidence_url)` | Borrower posts the ask + evidence. |
| Underwrite | `underwrite(id)` | Consensus risk grade A–D + APR, approve/decline. |
| Fund | `fund(id)` *(payable)* | A lender funds an approved loan → borrower paid. |
| Read | `get_loan(id)` / `stats()` | Grade, APR, state, lender. |

### Correctness check

`_underwrite` wraps the decision in **`gl.eq_principle.prompt_comparative`** — principle: *"the grade
(A/B/C/D) and the approved boolean must match across validators."* `validate_underwrite` enforces the
grade enum + real boolean + 0–10000 bps APR; `normalize_underwrite` forces grade **D** on decline /
unclear (conservative). `fund` only works on an approved, underwritten loan and requires `value ≥`
the requested amount. Unit-tested incl. request→underwrite(approve)→fund + a decline guard.

## Architecture

```
LoanUnderwrite/
├── contracts/loan_underwrite.py  ← GenLayer Intelligent Contract (consensus grade + lender funding via emit_transfer)
├── tests/                        ← pytest: underwrite guards, request→underwrite→fund, decline guard
└── app/                          ← React + Vite + Tailwind v4 + Framer Motion (21st.dev style)
                                    indigo credit theme, loan desk with risk grades + APR + fund
```

## Tests

```bash
cd LoanUnderwrite
python3 -m venv .venv && .venv/bin/pip install pytest -q
.venv/bin/python -m pytest tests/ -q
```
Covers `normalize_underwrite` / `validate_underwrite`, a full **request → underwrite(approve) → fund**
run, and a declined-loan-not-fundable guard (shim auto-inits `TreeMap`, stubs `emit_transfer`). On-chain:
deployment verified live (`stats`); payable `fund` exercised in-app.

## Deploy

```bash
genlayer deploy --contract contracts/loan_underwrite.py
```
