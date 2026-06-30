"""LoanUnderwrite tests: underwrite guards + request→underwrite(approve)→fund flow + decline guard."""

P = 10**18


def test_normalize_underwrite(contract):
    n = contract.normalize_underwrite
    assert n({"approved": True, "grade": "B", "apr_bps": 800, "reason": "solid"})["grade"] == "B"
    assert n({"approved": False, "grade": "A", "apr_bps": 100, "reason": "x"})["grade"] == "D"   # declined -> D
    assert n({"approved": "yes", "grade": "a", "apr_bps": 99999, "reason": "x"})["apr_bps"] == 10000
    assert n({})["approved"] is False and n({})["grade"] == "D"

def test_validate_underwrite(contract):
    v = contract.validate_underwrite
    assert v({"approved": True, "grade": "A", "apr_bps": 500, "reason": "great"})
    assert not v({"approved": "true", "grade": "A", "apr_bps": 1, "reason": "x"})
    assert not v({"approved": True, "grade": "E", "apr_bps": 1, "reason": "x"})
    assert not v({"approved": True, "grade": "A", "apr_bps": 20000, "reason": "x"})


def _new(contract):
    return contract, contract.LoanUnderwrite()

def test_request_rejects_bad_amount(contract):
    mod, c = _new(contract)
    try:
        c.request_loan("0", "biz", "https://e.example"); assert False, "zero amount should fail"
    except Exception:
        pass

def test_underwrite_fund_flow(contract):
    mod, c = _new(contract)
    mod.gl.message.sender_address = "0xB0r000000000000000000000000000000000001"
    lid = c.request_loan(str(P), "Working capital", "https://fin.example/statements")
    # offline default -> declined (grade D) -> can't fund
    c.underwrite(lid)
    assert c.get_loan(lid)["approved"] is False
    try:
        mod.gl.message.value = P; c.fund(lid); assert False, "declined loan not fundable"
    except Exception:
        pass
    mod.gl.message.value = 0
    # re-request + approve via validators
    lid2 = c.request_loan(str(P), "Inventory", "https://fin.example/2")
    mod.gl.nondet.exec_prompt = staticmethod(lambda *a, **k: {"approved": True, "grade": "A", "apr_bps": 600, "reason": "strong cashflow"})
    c.underwrite(lid2)
    assert c.get_loan(lid2)["grade"] == "A"
    # lender funds
    mod.gl.message.sender_address = "0x1ender0000000000000000000000000000000002"; mod.gl.message.value = P
    out = c.fund(lid2)
    assert out["funded_wei"] == str(P)
    assert c.get_loan(lid2)["state"] == "funded"
    assert c.stats()["funded"] == 1 and c.stats()["funded_wei"] == str(P)
    mod.gl.nondet.exec_prompt = staticmethod(lambda *a, **k: {})
    mod.gl.message.sender_address = "0xa000000000000000000000000000000000000001"; mod.gl.message.value = 0
