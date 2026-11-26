from datetime import date

from sqlalchemy import select

from app import catalog as cat
from app.models import Alarm


def test_hash_matches_the_web_app():
    # values computed in the browser with the app's own hs()
    assert cat.hs("abc") == 96354
    assert cat.hs("Main Fire Pump") == 1569034379
    assert cat.hs("Sub-feeder 1 · Compressor house") == 2789806277
    assert cat.hs("Tank 😀 x") == 3857867071


def test_asset_ids_follow_the_web_app():
    keys = {a.key for a in cat.assets()}
    assert {"apm:apm:0", "apm:cnc:0", "ems::0", "twin::0", "carbon::0"} <= keys
    assert not any(k.startswith(("dt::", "sus::")) for k in keys)


def test_seed_lists():
    assert len(cat.seed_alarms()) == 82
    wos = cat.seed_work_orders(date(2026, 11, 26))
    assert wos[0]["code"] == "WO-1040" and wos[0]["asset_name"] == "Main Fire Pump"
    assert len({w["code"] for w in wos}) == len(wos)
    assert any(w["code"] == "WO-1200" and w["module"] != "apm" for w in wos)


def test_write_value_keeps_the_catalog_format():
    c = {"x": [["P", "12.50", "bar"], ["Q", 7, "%"]]}
    cat.write_value(c, ["x", 0, 1], 12.345, 2, True)
    cat.write_value(c, ["x", 1, 1], 7.6, 0, False)
    assert c["x"][0][1] == "12.35" and c["x"][1][1] == 8


def _live(client):
    return client.app.state.live[1]


def test_normal_wandering_never_raises_alarms(client):
    live = _live(client)
    with client.app.state.db.session() as s:
        before = s.scalar(select(Alarm.id).order_by(Alarm.id.desc()))
        for i in range(400):
            live.step(now=float(i), excursion_every=0)
            live.check_alarms(s)
        after = s.scalar(select(Alarm.id).order_by(Alarm.id.desc()))
    assert after == before


def test_excursion_raises_then_clears_an_alarm(client):
    live = _live(client)
    p = next(x for x in live.params if x.asset_key == "apm:apm:1" and x.name == "Pressure")
    with client.app.state.db.session() as s:
        live.start_excursion(0, param=p, seconds=30)
        events = []
        for i in range(30):
            live.step(now=float(i), excursion_every=0)
            events += live.check_alarms(s)
        raised = [e for e in events if e["alarm"]["st"] == "Active"]
        assert raised and raised[0]["alarm"]["a"] == "Main Fire Pump" and "Pressure high" in raised[0]["alarm"]["msg"]
        for i in range(30, 90):
            live.step(now=float(i), excursion_every=0)
            events += live.check_alarms(s)
        assert any(e["alarm"]["st"] == "Cleared" for e in events)
    assert not p.in_alarm


def test_tightened_limit_raises_and_disabled_alarm_does_not(client):
    live = _live(client)
    p = next(x for x in live.params if x.asset_key == "apm:apm:1" and x.name == "Pressure")
    with client.app.state.db.session() as s:
        live.limits = {"apm:apm:1|Pressure": {"hi": "8"}}
        live.step(now=0, excursion_every=0)
        ev = live.check_alarms(s)
        assert any(e["alarm"]["aid"] == "apm:apm:1" for e in ev)
        q = next(x for x in live.params if x.asset_key == "apm:apm:0")
        live.limits = {"apm:apm:0|Level": {"hi": "10", "al": 0}}
        live.step(now=1, excursion_every=0)
        ev = live.check_alarms(s)
        assert not any(e["alarm"]["aid"] == "apm:apm:0" for e in ev) and not q.in_alarm


def test_values_reach_the_catalog(client):
    live = _live(client)
    live.params[0].value = 61.0
    out = dict(live.apply())
    path = live.params[0].path
    node = live.catalog
    for k in path:
        node = node[k]
    assert node == out[live.params[0].id] == 61
