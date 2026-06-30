# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
LoanUnderwrite — AI underwriting + lender funding, settled by GenLayer consensus.

A borrower requests a loan with a purpose and a link to financial evidence.
`underwrite` has every validator independently read the evidence and assign a
risk grade (A–D) + a suggested APR, approving or declining; the result is accepted
only when validators agree on the GRADE (comparative equivalence). An approved
loan can then be `fund`ed by any lender, whose capital is forwarded to the
borrower via emit_transfer.

The verb is "underwrite risk → fund the approved loan" — the consensus output is a
credit decision, not a yes/no on one fact.
"""
import json
from genlayer import *

GRADES = ("A", "B", "C", "D")


def normalize_underwrite(raw) -> dict:
    if not isinstance(raw, dict):
        raw = {}
    approved = raw.get("approved")
    approved = bool(approved) if isinstance(approved, bool) else str(approved).strip().lower() in ("true", "yes", "1")
    grade = str(raw.get("grade", "")).strip().upper()
    if grade not in GRADES:
        grade = "D"                    # conservative: worst grade when unclear
    if not approved:
        grade = "D"
    apr = raw.get("apr_bps")
    if not isinstance(apr, int) or isinstance(apr, bool):
        apr = 0
    apr = max(0, min(10000, apr))
    reason = raw.get("reason")
    reason = reason[:400] if isinstance(reason, str) and reason.strip() else "no reason"
    return {"approved": approved, "grade": grade, "apr_bps": apr, "reason": reason}


def validate_underwrite(data) -> bool:
    if not isinstance(data, dict):
        return False
    if not isinstance(data.get("approved"), bool):
        return False
    if data.get("grade") not in GRADES:
        return False
    a = data.get("apr_bps")
    if not isinstance(a, int) or isinstance(a, bool) or a < 0 or a > 10000:
        return False
    r = data.get("reason")
    return isinstance(r, str) and bool(r.strip())


def _to_int(s) -> int:
    try:
        return int(s)
    except Exception:
        return -1


@gl.evm.contract_interface
class _Payee:
    class View:
        pass

    class Write:
        pass


class LoanUnderwrite(gl.Contract):
    loans: TreeMap[str, str]
    loan_count: u256
    funded_count: u256
    funded_wei: u256

    def __init__(self):
        self.loan_count = u256(0)
        self.funded_count = u256(0)
        self.funded_wei = u256(0)

    @gl.public.write
    def request_loan(self, amount_wei: str, purpose: str, evidence_url: str) -> str:
        amt = _to_int(amount_wei)
        if amt <= 0:
            raise Exception("amount_wei must be a positive integer string")
        purpose = str(purpose).strip()
        evidence_url = str(evidence_url).strip()
        if not purpose or not evidence_url.startswith("http"):
            raise Exception("purpose and http evidence_url required")
        key = str(int(self.loan_count))
        rec = {
            "borrower": str(gl.message.sender_address),
            "amount_wei": str(amt),
            "purpose": purpose[:500],
            "evidence_url": evidence_url[:400],
            "state": "requested",       # requested -> underwritten -> funded
            "approved": False,
            "grade": "",
            "apr_bps": 0,
            "reason": "",
            "lender": "",
        }
        self.loans[key] = json.dumps(rec)
        self.loan_count += u256(1)
        return key

    @gl.public.write
    def underwrite(self, loan_id: str) -> dict:
        loan_id = str(loan_id)
        if loan_id not in self.loans:
            raise Exception("unknown loan")
        l = json.loads(self.loans[loan_id])
        if l["state"] != "requested":
            raise Exception("not in requested state")
        res = self._underwrite(l["purpose"], l["amount_wei"], l["evidence_url"])
        l["approved"] = res["approved"]
        l["grade"] = res["grade"]
        l["apr_bps"] = res["apr_bps"]
        l["reason"] = res["reason"]
        l["state"] = "underwritten"
        self.loans[loan_id] = json.dumps(l)
        return {"loan": loan_id, "approved": res["approved"], "grade": res["grade"], "apr_bps": res["apr_bps"]}

    @gl.public.write.payable
    def fund(self, loan_id: str) -> dict:
        """A lender funds an approved loan; capital is forwarded to the borrower."""
        loan_id = str(loan_id)
        if loan_id not in self.loans:
            raise Exception("unknown loan")
        l = json.loads(self.loans[loan_id])
        if l["state"] != "underwritten" or not l["approved"]:
            raise Exception("loan is not approved & open for funding")
        sent = int(gl.message.value)
        if sent < int(l["amount_wei"]):
            raise Exception("must fund at least the requested amount")
        l["state"] = "funded"
        l["lender"] = str(gl.message.sender_address)
        self.loans[loan_id] = json.dumps(l)
        self.funded_count += u256(1)
        self.funded_wei += u256(sent)
        _Payee(Address(l["borrower"])).emit_transfer(value=u256(sent))
        return {"loan": loan_id, "funded_wei": str(sent)}

    def _underwrite(self, purpose: str, amount_wei: str, evidence_url: str) -> dict:
        amount_gen = int(amount_wei) / 1e18

        def assess() -> str:
            live = "(evidence fetch failed)"
            try:
                live = gl.nondet.web.get(evidence_url).body.decode("utf-8")[:5000]
            except Exception:
                try:
                    live = gl.nondet.web.render(evidence_url, mode="text")[:5000]
                except Exception:
                    live = "(evidence fetch failed)"
            prompt = f"""You are a loan underwriter. Assess the request from the financial evidence.

LOAN PURPOSE: {purpose}
AMOUNT REQUESTED: {amount_gen:.4f} GEN

FINANCIAL EVIDENCE (fetched now):
{live}

Assign a risk grade A (best) to D (worst), approve or decline, and suggest an APR in basis points.
Reply ONLY JSON: {{"approved": true/false, "grade": "A|B|C|D", "apr_bps": <int 0-10000>, "reason": "<short>"}}"""
            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            if not isinstance(raw, dict):
                try:
                    raw = json.loads(str(raw))
                except Exception:
                    raw = {}
            return json.dumps(normalize_underwrite(raw))

        result = gl.eq_principle.prompt_comparative(
            assess,
            principle="The 'grade' (A/B/C/D) and the 'approved' boolean must match across validators. The APR may differ slightly; reason may differ.",
        )
        data = json.loads(result) if isinstance(result, str) else result
        if not validate_underwrite(data):
            data = normalize_underwrite(data if isinstance(data, dict) else {})
        return data

    @gl.public.view
    def get_loan(self, loan_id: str) -> dict:
        loan_id = str(loan_id)
        if loan_id not in self.loans:
            return {"exists": False}
        l = json.loads(self.loans[loan_id])
        l["exists"] = True
        return l

    @gl.public.view
    def stats(self) -> dict:
        return {"total_loans": int(self.loan_count), "funded": int(self.funded_count), "funded_wei": str(int(self.funded_wei))}
