from unittest.mock import MagicMock, patch

from app.llm.chat_agent import _is_dashboard_query, prune_context, get_chat_response


# ── _is_dashboard_query ────────────────────────────────────────────────────────

def test_is_dashboard_query_matches_sap_keywords():
    msgs = [{"role": "user", "content": "What is the SAP system status?"}]
    assert _is_dashboard_query(msgs) is True


def test_is_dashboard_query_matches_volume_keyword():
    msgs = [{"role": "user", "content": "How much disk space is left?"}]
    assert _is_dashboard_query(msgs) is True


def test_is_dashboard_query_matches_alert_keyword():
    # The regex uses \balert\b — "alert" matches but "alerts" (plural) does not;
    # use "alert" as a standalone word to verify the keyword is present.
    msgs = [{"role": "user", "content": "Show me the current alert status"}]
    assert _is_dashboard_query(msgs) is True


def test_is_dashboard_query_returns_false_for_unrelated():
    msgs = [{"role": "user", "content": "What is the weather today?"}]
    assert _is_dashboard_query(msgs) is False


def test_is_dashboard_query_checks_latest_user_message_only():
    # Earlier assistant message contains keyword, latest user message does not
    msgs = [
        {"role": "user", "content": "Show me the SAP status"},
        {"role": "assistant", "content": "Here is your system health..."},
        {"role": "user", "content": "Thanks, that's all."},
    ]
    assert _is_dashboard_query(msgs) is False


def test_is_dashboard_query_empty_messages():
    assert _is_dashboard_query([]) is False


def test_is_dashboard_query_no_user_role():
    msgs = [{"role": "assistant", "content": "SAP status is healthy"}]
    assert _is_dashboard_query(msgs) is False


# ── prune_context ──────────────────────────────────────────────────────────────

def test_prune_context_returns_empty_for_non_dict():
    assert prune_context("not a dict") == {}
    assert prune_context(None) == {}
    assert prune_context([]) == {}


def test_prune_context_caps_list_at_10():
    ctx = {"dashboard": {"items": list(range(20))}}
    result = prune_context(ctx)
    assert len(result["dashboard"]["items"]) == 10


def test_prune_context_strips_extra_systemcard_fields():
    ctx = {
        "dashboard": {
            "systemCard": {
                "sid": "MSD",
                "status": "healthy",
                "secret_internal_field": "REMOVE_ME",
                "dataVol": {"usedGB": 100},
            }
        }
    }
    result = prune_context(ctx)
    card = result["dashboard"]["systemCard"]
    assert card["sid"] == "MSD"
    assert "secret_internal_field" not in card


def test_prune_context_falls_back_to_system_key():
    ctx = {"system": {"sid": "MSP", "status": "ok", "extra": "ignored"}}
    result = prune_context(ctx)
    assert "system" in result
    assert result["system"]["sid"] == "MSP"
    assert "extra" not in result["system"]


def test_prune_context_prefers_dashboard_over_system():
    ctx = {
        "dashboard": {"systemCard": {"sid": "MSD", "status": "ok"}},
        "system": {"sid": "MSP"},
    }
    result = prune_context(ctx)
    assert "dashboard" in result
    assert "system" not in result


def test_prune_context_empty_context():
    assert prune_context({}) == {}


# ── get_chat_response ──────────────────────────────────────────────────────────

def _make_llm_mock(reply: str):
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content=reply)
    return mock_llm


def test_get_chat_response_returns_refusal_when_sharing_disabled():
    msgs = [{"role": "user", "content": "What is the SAP system status?"}]
    with patch("app.llm.chat_agent.get_chat_model") as mock_model, \
         patch("app.llm.chat_agent.settings") as mock_settings:
        mock_settings.SEND_DASHBOARD_DATA_TO_LLM = "no"
        mock_model.return_value = _make_llm_mock("unused")
        result = get_chat_response(msgs, {})
    assert "disabled" in result.lower()


def test_get_chat_response_non_dashboard_query_skips_context():
    msgs = [{"role": "user", "content": "Tell me a joke"}]
    captured_messages = []

    def fake_invoke(lc_msgs):
        captured_messages.extend(lc_msgs)
        return MagicMock(content="ha ha")

    with patch("app.llm.chat_agent.get_chat_model") as mock_model, \
         patch("app.llm.chat_agent.settings") as mock_settings:
        mock_settings.SEND_DASHBOARD_DATA_TO_LLM = "yes"
        mock_llm = MagicMock()
        mock_llm.invoke.side_effect = fake_invoke
        mock_model.return_value = mock_llm
        result = get_chat_response(msgs, {"dashboard": {"systemCard": {"sid": "MSD"}}})

    assert result == "ha ha"
    system_msg = captured_messages[0].content
    assert "dashboard state" not in system_msg.lower()


def test_get_chat_response_dashboard_query_attaches_context():
    msgs = [{"role": "user", "content": "What is the SAP system status?"}]
    captured_messages = []

    def fake_invoke(lc_msgs):
        captured_messages.extend(lc_msgs)
        return MagicMock(content="all good")

    with patch("app.llm.chat_agent.get_chat_model") as mock_model, \
         patch("app.llm.chat_agent.settings") as mock_settings:
        mock_settings.SEND_DASHBOARD_DATA_TO_LLM = "yes"
        mock_llm = MagicMock()
        mock_llm.invoke.side_effect = fake_invoke
        mock_model.return_value = mock_llm
        result = get_chat_response(msgs, {"dashboard": {"systemCard": {"sid": "MSD", "status": "ok"}}})

    assert result == "all good"
    system_msg = captured_messages[0].content
    assert "dashboard state" in system_msg.lower()


def test_get_chat_response_truncates_oversized_context():
    msgs = [{"role": "user", "content": "What is the SAP system status?"}]
    captured_messages = []

    def fake_invoke(lc_msgs):
        captured_messages.extend(lc_msgs)
        return MagicMock(content="truncated response")

    # Build a context that will exceed 10000 chars after JSON serialisation
    huge_context = {"dashboard": {"systemCard": {"sid": "X", "status": "ok",
        "dataVol": "A" * 15000}}}

    with patch("app.llm.chat_agent.get_chat_model") as mock_model, \
         patch("app.llm.chat_agent.settings") as mock_settings:
        mock_settings.SEND_DASHBOARD_DATA_TO_LLM = "yes"
        mock_llm = MagicMock()
        mock_llm.invoke.side_effect = fake_invoke
        mock_model.return_value = mock_llm
        get_chat_response(msgs, huge_context)

    system_msg = captured_messages[0].content
    assert "[truncated]" in system_msg


def test_get_chat_response_limits_history_to_last_10():
    msgs = [{"role": "user", "content": f"msg {i}"} for i in range(15)]
    captured_messages = []

    def fake_invoke(lc_msgs):
        captured_messages.extend(lc_msgs)
        return MagicMock(content="ok")

    with patch("app.llm.chat_agent.get_chat_model") as mock_model, \
         patch("app.llm.chat_agent.settings") as mock_settings:
        mock_settings.SEND_DASHBOARD_DATA_TO_LLM = "no"
        mock_llm = MagicMock()
        mock_llm.invoke.side_effect = fake_invoke
        mock_model.return_value = mock_llm
        get_chat_response(msgs, {})

    # 1 SystemMessage + at most 10 history messages
    assert len(captured_messages) <= 11
