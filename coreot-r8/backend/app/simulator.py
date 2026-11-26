"""Live test data.

Every few seconds each reading moves a little around its normal value. Now and then one
reading is pushed past its limit for about a minute, so you can watch an alarm being
raised, acknowledged and cleared. Limits people change in the app are used at once.

Replace this module with a real data feed (MQTT, OPC UA, Modbus via an edge gateway) by
calling PlantLive.apply() with real values; everything after that stays the same.
"""

from __future__ import annotations

import asyncio
import logging
import random
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from . import catalog as cat
from . import shapes
from .models import Alarm, Asset, Parameter, Reading

log = logging.getLogger("coreot.sim")


@dataclass
class LiveParam:
    id: int
    asset_key: str
    asset_name: str
    module: str
    category: str | None
    name: str
    unit: str
    lo: float | None
    hi: float | None
    base: float
    value: float
    decimals: int
    as_text: bool
    path: list
    in_alarm: bool
    target: float | None = None
    target_until: float = 0.0

    def limits(self, overrides: dict) -> tuple[float | None, float | None, bool]:
        """Low/high limits after any change made in the app (S.klim, key 'asset|reading')."""
        lo, hi = self.lo, self.hi
        o = overrides.get(f"{self.asset_key}|{self.name}") or {}
        for key in ("lo", "hi"):
            raw = o.get(key)
            if raw not in (None, ""):
                try:
                    if key == "lo":
                        lo = float(raw)
                    else:
                        hi = float(raw)
                except (TypeError, ValueError):
                    pass
        enabled = o.get("al") != 0
        if lo is not None and hi is None:  # a low limit alone: the app treats this as unlimited above
            hi = float("inf")
        return lo, hi, enabled


class PlantLive:
    """The live catalog and readings of one plant, kept in memory."""

    def __init__(self, plant_id: int, session: Session, seed: int | None = None):
        self.plant_id = plant_id
        self.catalog = cat.fresh_catalog()
        self.rng = random.Random(seed)
        self.limits: dict = {}
        names = {a.key: (a.name, a.module, a.category or None) for a in session.scalars(select(Asset).where(Asset.plant_id == plant_id))}
        self.params: list[LiveParam] = []
        for p in session.scalars(select(Parameter).where(Parameter.plant_id == plant_id).order_by(Parameter.id)):
            an, mod, c = names.get(p.asset_key, (p.asset_key, "", None))
            self.params.append(LiveParam(p.id, p.asset_key, an, mod, c, p.name, p.unit, p.lo, p.hi, p.base, p.value,
                                         p.decimals, p.as_text, p.path, p.in_alarm))
        self.by_id = {p.id: p for p in self.params}
        for p in self.params:
            cat.write_value(self.catalog, p.path, p.value, p.decimals, p.as_text)
        self.last_excursion = time.monotonic()
        self.last_history = 0.0
        self.last_flush = 0.0

    # ------------------------------------------------------------ values
    def live_index(self) -> dict[str, list]:
        return {str(p.id): p.path for p in self.params}

    def shown(self, p: LiveParam):
        v = round(p.value, p.decimals) if p.decimals else int(round(p.value))
        return (f"{v:.{p.decimals}f}" if p.decimals else str(v)) if p.as_text else v

    def step(self, now: float | None = None, excursion_every: float = 180) -> None:
        now = time.monotonic() if now is None else now
        if excursion_every and now - self.last_excursion >= excursion_every:
            self.last_excursion = now
            self.start_excursion(now)
        for p in self.params:
            goal = p.target if p.target is not None and now < p.target_until else p.base
            if p.target is not None and now >= p.target_until:
                p.target = None
            spread = abs(p.base) * 0.004 or 0.02
            p.value += (goal - p.value) * (0.25 if p.target is not None else 0.15) + self.rng.gauss(0, spread)
            if p.target is None:
                p.value = self._keep_inside(p, p.value)
            if p.base >= 0:
                p.value = max(0.0, p.value)
            if p.unit == "%" and p.base <= 100:
                p.value = min(100.0, p.value)

    def _keep_inside(self, p: LiveParam, value: float) -> float:
        """Normal wandering never crosses a limit by itself (no flapping alarms); only an
        excursion, or a limit someone tightened, takes a reading out of range."""
        lo, hi, _ = p.limits(self.limits)
        if hi is None or hi == float("inf"):
            return value
        lo_ = lo or 0
        if not (lo_ <= p.base <= hi):
            return value          # normally out of range: it stays in alarm
        m = (hi - lo_) * 0.03
        return min(max(value, min(p.base, lo_ + m)), max(p.base, hi - m))

    def start_excursion(self, now: float, param: LiveParam | None = None, seconds: float = 60) -> LiveParam | None:
        """Push one healthy, limited reading past its high (or low) limit for a while."""
        if param is None:
            pool = [p for p in self.params if not p.in_alarm and p.target is None and p.hi is not None
                    and p.hi - (p.lo or 0) > 0 and self.limits_ok(p, p.base)]
            if not pool:
                return None
            param = self.rng.choice(pool)
        lo, hi, _ = param.limits(self.limits)
        span = (hi if hi != float("inf") else param.base * 2) - (lo or 0)
        if lo and lo > 0 and self.rng.random() < 0.35:
            param.target = lo - span * 0.12
        else:
            param.target = (hi if hi != float("inf") else param.base * 1.5) + span * 0.12
        param.target_until = now + seconds
        return param

    def limits_ok(self, p: LiveParam, value: float) -> bool:
        lo, hi, _ = p.limits(self.limits)
        if hi is None:
            return True
        return (lo or 0) <= value <= hi

    def apply(self) -> list[list]:
        """Write current values into the catalog; returns [[parameter id, shown value], ...]."""
        out = []
        for p in self.params:
            v = self.shown(p)
            cat.write_value(self.catalog, p.path, p.value, p.decimals, p.as_text)
            out.append([p.id, v])
        return out

    # ------------------------------------------------------------ alarms
    def check_alarms(self, s: Session) -> list[dict]:
        """Raise an alarm when a reading leaves its limits; clear it when it is back."""
        events = []
        for p in self.params:
            lo, hi, enabled = p.limits(self.limits)
            if hi is None or not enabled:
                if p.in_alarm and not enabled:
                    p.in_alarm = False
                continue
            lo_ = lo or 0
            outside = p.value < lo_ or p.value > hi
            span = (hi if hi != float("inf") else abs(p.base) * 2) - lo_
            margin = span * 0.02
            if outside and not p.in_alarm:
                p.in_alarm = True
                over = p.value > hi
                excess = (p.value - hi) if over else (lo_ - p.value)
                sev = "Critical" if span and excess > span * 0.08 else "Warning"
                unit = f" {p.unit}" if p.unit else ""
                limit = hi if over else lo_
                msg = (f"{p.name} {'high' if over else 'low'}, {self.shown(p)}{unit} "
                       f"({'above' if over else 'below'} limit {limit:g}{unit})")
                local = datetime.now().astimezone()
                a = Alarm(plant_id=self.plant_id, module=p.module, category=p.category if p.module == "apm" else None,
                          asset_name=p.asset_name, asset_key=p.asset_key, parameter_id=p.id, message=msg,
                          severity=sev, state="Active", source="live", time_label=local.strftime("%H:%M"))
                s.add(a)
                s.flush()
                events.append({"type": "alarm", "alarm": shapes.alarm(a)})
            elif p.in_alarm and lo_ + margin <= p.value <= hi - margin:
                p.in_alarm = False
                rows = s.scalars(select(Alarm).where(Alarm.plant_id == self.plant_id, Alarm.parameter_id == p.id,
                                                     Alarm.cleared_at.is_(None))).all()
                for a in rows:
                    a.cleared_at = datetime.now(timezone.utc)
                    if a.state == "Active":
                        a.state = "Cleared"
                    events.append({"type": "alarm", "alarm": shapes.alarm(a)})
        if events:
            s.commit()
        return events

    # ------------------------------------------------------------ storage
    def flush(self, s: Session) -> None:
        """Keep the latest values in the database, so a restart continues where it stopped."""
        now = datetime.now(timezone.utc)
        s.execute(update(Parameter), [{"id": p.id, "value": p.value, "in_alarm": p.in_alarm, "updated_at": now}
                                      for p in self.params])
        s.commit()

    def record_history(self, s: Session, keep_days: int) -> None:
        now = datetime.now(timezone.utc)
        s.add_all([Reading(plant_id=self.plant_id, parameter_id=p.id, ts=now, value=round(p.value, max(p.decimals, 1)))
                   for p in self.params])
        s.execute(delete(Reading).where(Reading.plant_id == self.plant_id, Reading.ts < now - timedelta(days=keep_days)))
        s.commit()


async def run(app) -> None:
    """Background loop: move values, check limits, store, and push to browsers."""
    st = app.state
    cfg = st.settings
    while True:
        try:
            for live in st.live.values():
                live.step(excursion_every=cfg.excursion_every)
                values = live.apply()
                with st.db.session() as s:
                    events = live.check_alarms(s)
                    mono = time.monotonic()
                    if mono - live.last_flush >= 10:
                        live.flush(s)
                        live.last_flush = mono
                    if mono - live.last_history >= cfg.history_every:
                        live.record_history(s, cfg.history_days)
                        live.last_history = mono
                await st.hub.send(live.plant_id, {"type": "readings", "r": values})
                for e in events:
                    await st.hub.send(live.plant_id, e)
        except asyncio.CancelledError:
            raise
        except Exception:  # keep the plant live even if one round fails
            log.exception("simulator round failed")
        await asyncio.sleep(cfg.sim_interval)
