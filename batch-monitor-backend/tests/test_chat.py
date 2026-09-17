from app.llm.chat_agent import prune_context

def test_prune_context_compacts_dashboard_and_system():
    large_context = {
        "dashboard": {
            "sid": "MSD",
            "landscape": [{"sid": f"S{i}"} for i in range(50)],  # 50 items
            "systemCard": {
                "sid": "MSD",
                "status": "healthy",
                "extraHugeField": "x" * 5000,
                "dataVol": {"freeGb": 100},
                "logVol": {"freeGb": 50},
            }
        }
    }

    pruned = prune_context(large_context)
    assert "dashboard" in pruned
    assert len(pruned["dashboard"]["landscape"]) == 10  # Capped at 10 items
    assert "extraHugeField" not in pruned["dashboard"]["systemCard"]  # Filtered to essential fields
    assert pruned["dashboard"]["systemCard"]["sid"] == "MSD"
