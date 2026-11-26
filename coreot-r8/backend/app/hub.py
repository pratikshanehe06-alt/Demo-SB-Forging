"""Live push to open browsers, one channel per plant."""

from __future__ import annotations

import asyncio
import json
from collections import defaultdict

from fastapi import WebSocket


class Hub:
    def __init__(self) -> None:
        self._clients: dict[int, set[WebSocket]] = defaultdict(set)

    def add(self, plant_id: int, ws: WebSocket) -> None:
        self._clients[plant_id].add(ws)

    def remove(self, plant_id: int, ws: WebSocket) -> None:
        self._clients[plant_id].discard(ws)

    def count(self, plant_id: int | None = None) -> int:
        if plant_id is None:
            return sum(len(v) for v in self._clients.values())
        return len(self._clients[plant_id])

    async def send(self, plant_id: int, message: dict, skip: WebSocket | None = None) -> None:
        clients = [c for c in self._clients[plant_id] if c is not skip]
        if not clients:
            return
        text = json.dumps(message, ensure_ascii=False, default=str)
        results = await asyncio.gather(*(c.send_text(text) for c in clients), return_exceptions=True)
        for c, r in zip(clients, results):
            if isinstance(r, Exception):
                self.remove(plant_id, c)
