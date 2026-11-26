"""The plant catalog: icons, assets, readings, use cases and modules.

The web app was built around one JSON object (DATA). We keep that object as the catalog,
list every numeric reading in it as a Parameter row (with the path to its value), and the
live simulator writes new values back into those paths before the catalog is sent.

Asset ids follow the web app exactly:
  Fire & Safety assets   apm:apm:<i>
  APM use-case assets    apm:<use case>:<i>
  Module assets          <module>::<i>    (module 'dt' is shown as 'twin', 'sus' as 'carbon')
"""

from __future__ import annotations

import copy
import json
import re
from dataclasses import dataclass, field
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path

SEED = Path(__file__).resolve().parent / "seed" / "catalog.json"

# Normal ranges the app applies to Fire & Safety readings (FRNG in the app)
FIRE_RANGES = {"Pressure": (5, 14), "Level": (60, 100), "Fuel level": (50, 100), "Battery": (24, 28.8),
               "Engine temp": (0, 95), "Temp": (0, 70), "Current": (0, 10), "Discharge": (5, 12),
               "Flow": (0, 1500), "RPM": (0, 1800)}
MODULE_SHOWN_AS = {"dt": "twin", "sus": "carbon"}
WO_STATES = ["Open", "Assigned", "In progress", "Done"]
TECHNICIANS = ["M. Jadhav", "R. Patil", "V. Kale", "I. Shaikh", "S. Khan"]


@lru_cache(maxsize=1)
def base_catalog() -> dict:
    return json.loads(SEED.read_text(encoding="utf-8"))


def fresh_catalog() -> dict:
    return copy.deepcopy(base_catalog())


def hs(s: str) -> int:
    """Same string hash the app uses: h = (h*31 + charCode) >>> 0, over code points."""
    h = 0
    for ch in str(s):
        code = ord(ch)
        if code > 0xFFFF:  # JS charCodeAt(0) of an astral character is its high surrogate
            code = 0xD800 + ((code - 0x10000) >> 10)
        h = (h * 31 + code) & 0xFFFFFFFF
    return h


def _num(v) -> float | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    m = re.match(r"^\s*-?\d+(\.\d+)?", str(v))  # parseFloat semantics: leading number
    return float(m.group(0)) if m else None


def _decimals(v) -> int:
    s = str(v)
    m = re.match(r"^\s*-?\d+\.(\d+)", s)
    return len(m.group(1)) if m else 0


@dataclass
class ParamSpec:
    asset_key: str
    name: str
    unit: str
    lo: float | None
    hi: float | None
    base: float
    decimals: int
    as_text: bool
    path: list


@dataclass
class AssetSpec:
    key: str
    module: str
    category: str
    name: str
    location: str
    status: str
    health_label: str
    first_sub: str | None
    params: list[ParamSpec] = field(default_factory=list)


def _range_state(value: float, lo: float | None, hi: float | None) -> str:
    """rdState in the app: 'bad' outside limits, '' otherwise (only for limited readings)."""
    if lo is None and hi is None:
        return ""
    lo_ = 0 if lo is None else lo
    return "bad" if value < lo_ or value > hi else ""


def _health(status: str, hl: str, module: str, params: list[ParamSpec]) -> tuple[str, str]:
    """mkA in the app: folds Alarm/Critical/Warning status into the health label."""
    if re.search("Alarm|Critical", status or ""):
        hl, status = "Critical", "Running"
    if status == "Warning":
        hl, status = "Warning", "Running"
    if status == "Normal" and module != "apm":
        status = "Running"
    if not hl and any(p.hi is not None and _range_state(p.base, p.lo, p.hi) == "bad" for p in params):
        hl = "Warning"
    return status, hl


def assets(catalog: dict | None = None) -> list[AssetSpec]:
    D = catalog or base_catalog()
    out: list[AssetSpec] = []

    # Fire & Safety
    for i, a in enumerate(D["AS"]):
        key = f"apm:apm:{i}"
        params: list[ParamSpec] = []
        if a.get("un"):
            for u, unit in enumerate(a["un"]):
                for j, p in enumerate(unit[2]):
                    name = p[0] if u == 0 else f"{unit[0]} unit {p[0].lower()}"
                    params.append(_fire_param(key, a["id"], name, p, ["AS", i, "un", u, 2, j, 1], u == 0))
        else:
            for j, p in enumerate(a.get("v", [])):
                params.append(_fire_param(key, a["id"], p[0], p, ["AS", i, "v", j, 1], True))
        params = [p for p in params if p]
        st = "Monitoring" if a.get("st") == "Normal" else a.get("st", "")
        hl = "Critical" if a["id"] == "hyd" else "Warning" if a["id"] == "smk" else ""
        reg = D["FIREG"][{"tank": 1, "hyd": 2, "hose": 5, "mon": 2, "spr": 3, "facp": 4, "smk": 4, "heat": 4, "ext": 5, "gas": 5}.get(a["id"], 0)]
        first = (a["un"][0][0] + " unit") if a.get("un") else (reg["subs"][0][0] if reg.get("subs") else None)
        st, hl = _health(st, hl, "apm", params)
        out.append(AssetSpec(key, "apm", "apm", a["n"], "Fire & Safety", st, hl, first, params))

    # APM use cases
    for ui, uc in enumerate(D["UC"]):
        for i, m in enumerate(uc["mains"]):
            key = f"apm:{uc['k']}:{i}"
            params = _ps(key, m.get("ps", []), ["UC", ui, "mains", i, "ps"])
            st, hl = _health(m.get("st", ""), m.get("hl", ""), "apm", params)
            first = m["subs"][0][0] if m.get("subs") else None
            out.append(AssetSpec(key, "apm", uc["k"], m["n"], m.get("loc", ""), st, hl, first, params))

    # Modules
    for mk, items in D["MOD"].items():
        shown = MODULE_SHOWN_AS.get(mk, mk)
        for i, m in enumerate(items):
            key = f"{shown}::{i}"
            params = _ps(key, m.get("ps", []), ["MOD", mk, i, "ps"])
            st, hl = _health(m.get("st", ""), m.get("hl", ""), shown, params)
            first = m["subs"][0][0] if m.get("subs") else None
            out.append(AssetSpec(key, shown, "", m["n"], m.get("loc", ""), st, hl, first, params))
    return out


def _fire_param(key, fid, name, p, path, primary) -> ParamSpec | None:
    x = _num(p[1])
    if x is None:
        return None
    r = None
    if primary:
        r = (3.5, 10) if fid == "spr" and p[0] == "Pressure" else (0, 2400) if fid == "mon" and p[0] == "Flow" else FIRE_RANGES.get(p[0])
    return ParamSpec(key, name, p[2] if len(p) > 2 else "", r[0] if r else None, r[1] if r else None,
                     x, _decimals(p[1]), isinstance(p[1], str), path)


def _ps(key, ps, prefix) -> list[ParamSpec]:
    out = []
    for j, p in enumerate(ps):
        x = _num(p[1])
        if x is None or isinstance(p[1], str) and not re.match(r"^\s*-?\d+(\.\d+)?\s*$", p[1]):
            continue  # text readings ("Running", "3 of 4") are not simulated
        lo = p[3] if len(p) > 3 else None
        hi = p[4] if len(p) > 4 else None
        out.append(ParamSpec(key, p[0], p[2] if len(p) > 2 else "", lo, hi, x, _decimals(p[1]),
                             isinstance(p[1], str), prefix + [j, 1]))
    return out


def write_value(catalog: dict, path: list, value: float, decimals: int, as_text: bool) -> None:
    node = catalog
    for step in path[:-1]:
        node = node[step]
    v = round(value, decimals)
    if decimals == 0:
        v = int(round(value))
    node[path[-1]] = (f"{v:.{decimals}f}" if decimals else str(v)) if as_text else v


# ---------------------------------------------------------------- seed data

def seed_alarms(catalog: dict | None = None) -> list[dict]:
    """The alarm list the app starts with (buildAlarms)."""
    D = catalog or base_catalog()
    L = []

    def add(m, cat, a, msg, sev, t):
        L.append({"module": m, "category": cat, "asset_name": a, "message": msg, "severity": sev, "time_label": t})

    add("apm", "apm", "Hydrant System", "Low pressure at remote hydrant, 4.8 bar", "Critical", "10:40")
    add("apm", "apm", "Smoke Detector", "Detector fault, winding shop", "Warning", "09:05")
    add("apm", "apm", "Water Tank Level", "Level below 70% after hydrant test", "Warning", "09:45")
    for u in D["UC"]:
        mains = u["mains"]
        for x in u.get("alarms", []):
            a = mains[x[2]] if x[2] < len(mains) else mains[0]
            sev = "Critical" if x[1] == "High" else "Warning" if x[1] == "Medium" else "Info"
            add("apm", u["k"], a["n"], x[0], sev, x[3])
    for m, a, msg, sev, t in [
        ("ems", "Sub-feeder 1 · Compressor house", "Power factor below 0.95", "Warning", "08:40"),
        ("ems", "Main incomer", "Demand at 91% of contract", "Warning", "11:05"),
        ("pqi", "Feeder 2 PQ meter", "Voltage sag 18% for 120 ms", "Warning", "06:12"),
        ("pqi", "Incomer PQ meter", "Current THD 5.4% rising", "Info", "09:15"),
        ("derms", "Battery storage (BESS)", "Cell temperature 34 °C near limit", "Warning", "10:50"),
        ("ums", "Air compressor", "Air leakage estimate above 10%", "Warning", "09:10"),
        ("ums", "Fuel tank", "Consumption 3% over budget", "Info", "07:40"),
        ("tele", "Fuel tanker TNK-02", "Fuel drop of 62 L in 10 min, ignition off", "Critical", "11:18"),
        ("tele", "Tipper truck TRK-01", "Harsh braking, 3 events", "Warning", "10:22"),
        ("tele", "Staff shuttle BUS-04", "Left geofence, Main gate", "Info", "10:02"),
        ("oee", "Line 2", "Unplanned stop 18 min", "Warning", "10:30"),
        ("oee", "Line 3", "Changeover over standard by 13 min", "Info", "09:40"),
        ("inv", "Nozzle heads", "Stock 14 below reorder level 21", "Warning", "09:10"),
        ("inv", "RFID gate 2", "Read rate 91%, below 98%", "Warning", "08:52"),
        ("qi", "Camera 1 · Pump house", "Scratch defects up 40% this hour", "Warning", "10:55"),
        ("qi", "Inspection drone D-01 · Tank farm roof", "Corrosion found on Tank 2 shell", "Critical", "11:02"),
        ("twin", "Hydrant yard twin", "Sync latency 8.5 s, limit 5 s", "Warning", "09:58"),
        ("fin", "Receivables", "4 invoices overdue beyond 90 days", "Critical", "08:00"),
        ("carbon", "Grid electricity", "Monthly emissions 6% over target", "Warning", "08:00"),
    ]:
        add(m, None, a, msg, sev, t)
    return L


def seed_work_orders(today: date | None = None) -> list[dict]:
    """The work orders the app starts with (woList): every APM asset with a health flag,
    plus a deterministic sample of healthy ones for preventive service."""
    today = today or date.today()
    out, n = [], 1040
    for a in assets():
        if a.module != "apm" or not (a.health_label or hs(a.name) % 5 == 0):
            continue
        h = hs(a.name)
        sub = a.first_sub
        out.append({
            "code": f"WO-{n}",
            "title": ("Inspect " if a.health_label else "Service ") + (sub.lower() if sub else "asset"),
            "asset_key": a.key, "asset_name": a.name, "category": a.category,
            "type": "Predictive" if a.health_label else "Preventive",
            "priority": "High" if a.health_label == "Critical" else "Medium" if a.health_label else "Low",
            "status": WO_STATES[h % 4], "assignee": TECHNICIANS[h % 5],
            "due": (today + timedelta(days=(h % 9) - 2)).strftime("%d %b"),
            "spares": f"{sub} kit" if sub else "-", "module": "apm",
        })
        n += 1
    # module assets (energy, power quality, utilities, fleet, lines, quality): from WO-1200
    n = 1200
    by_module = {}
    for a in assets():
        by_module.setdefault(a.module, []).append(a)
    for m in ("ems", "derms", "pqi", "ums", "tele", "oee", "qi"):
        for a in by_module.get(m, []):
            h = hs(a.name)
            if not (a.health_label or h % 4 == 0):
                continue
            sub = a.first_sub
            out.append({
                "code": f"WO-{n}",
                "title": ("Inspect " if a.health_label else "Service ") + (sub.lower() if sub else "asset"),
                "asset_key": a.key, "asset_name": a.name, "category": None, "module": m,
                "type": "Predictive" if a.health_label else "Preventive",
                "priority": "High" if a.health_label == "Critical" else "Medium" if a.health_label else "Low",
                "status": WO_STATES[h % 4], "assignee": TECHNICIANS[h % 5],
                "due": (today + timedelta(days=(h % 9) - 2)).strftime("%d %b"),
                "spares": f"{sub} kit" if sub else "-",
            })
            n += 1
    return out
