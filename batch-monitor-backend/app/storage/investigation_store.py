import asyncio
from typing import Any


class InvestigationStore:
    def __init__(self):
        self._states: dict[str, dict[str, Any]] = {}
        self._subscribers: dict[str, list[asyncio.Queue]] = {}
        self._lock = asyncio.Lock()

    async def create(self, investigation_id: str, initial_state: dict[str, Any]) -> None:
        async with self._lock:
            self._states[investigation_id] = initial_state
            self._subscribers[investigation_id] = []

    async def get(self, investigation_id: str) -> dict[str, Any] | None:
        async with self._lock:
            return self._states.get(investigation_id)

    async def update(self, investigation_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        async with self._lock:
            state = self._states.setdefault(investigation_id, {})
            for key, value in patch.items():
                if key == "progress_log" and isinstance(value, list):
                    state.setdefault("progress_log", []).extend(value)
                else:
                    state[key] = value
            snapshot = dict(state)
        await self._broadcast(investigation_id, snapshot)
        return snapshot

    def subscribe(self, investigation_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        self._subscribers.setdefault(investigation_id, []).append(queue)
        return queue

    def unsubscribe(self, investigation_id: str, queue: asyncio.Queue) -> None:
        subs = self._subscribers.get(investigation_id, [])
        if queue in subs:
            subs.remove(queue)

    async def _broadcast(self, investigation_id: str, snapshot: dict[str, Any]) -> None:
        for queue in self._subscribers.get(investigation_id, []):
            await queue.put(snapshot)


store = InvestigationStore()
