import asyncio
import pytest

from app.storage.investigation_store import InvestigationStore


@pytest.fixture
def store():
    return InvestigationStore()


@pytest.mark.asyncio
async def test_create_and_get(store):
    await store.create("inv-1", {"status": "pending", "progress_log": []})
    state = await store.get("inv-1")
    assert state["status"] == "pending"


@pytest.mark.asyncio
async def test_get_missing_returns_none(store):
    assert await store.get("nonexistent") is None


@pytest.mark.asyncio
async def test_update_overwrites_scalar_fields(store):
    await store.create("inv-2", {"status": "pending"})
    await store.update("inv-2", {"status": "running"})
    state = await store.get("inv-2")
    assert state["status"] == "running"


@pytest.mark.asyncio
async def test_update_accumulates_progress_log(store):
    await store.create("inv-3", {"status": "pending", "progress_log": ["step 1"]})
    await store.update("inv-3", {"progress_log": ["step 2"]})
    await store.update("inv-3", {"progress_log": ["step 3"]})
    state = await store.get("inv-3")
    assert state["progress_log"] == ["step 1", "step 2", "step 3"]


@pytest.mark.asyncio
async def test_update_creates_entry_if_missing(store):
    # update on a key that was never created should still work via setdefault
    await store.update("inv-new", {"status": "created-on-update"})
    state = await store.get("inv-new")
    assert state["status"] == "created-on-update"


@pytest.mark.asyncio
async def test_subscribe_receives_update(store):
    await store.create("inv-4", {"status": "pending"})
    queue = store.subscribe("inv-4")
    await store.update("inv-4", {"status": "done"})
    snapshot = await asyncio.wait_for(queue.get(), timeout=1.0)
    assert snapshot["status"] == "done"


@pytest.mark.asyncio
async def test_unsubscribe_stops_receiving(store):
    await store.create("inv-5", {"status": "pending"})
    queue = store.subscribe("inv-5")
    store.unsubscribe("inv-5", queue)
    await store.update("inv-5", {"status": "done"})
    assert queue.empty()


@pytest.mark.asyncio
async def test_multiple_subscribers_all_notified(store):
    await store.create("inv-6", {"status": "pending"})
    q1 = store.subscribe("inv-6")
    q2 = store.subscribe("inv-6")
    await store.update("inv-6", {"status": "done"})
    s1 = await asyncio.wait_for(q1.get(), timeout=1.0)
    s2 = await asyncio.wait_for(q2.get(), timeout=1.0)
    assert s1["status"] == s2["status"] == "done"


@pytest.mark.asyncio
async def test_unsubscribe_nonexistent_queue_is_safe(store):
    import asyncio
    fake_q = asyncio.Queue()
    store.unsubscribe("never-created", fake_q)  # must not raise
