from langgraph.graph import END, START, StateGraph

from app.graph.nodes.analyze_logs import analyze_logs
from app.graph.nodes.correlate_rag import correlate_rag
from app.graph.nodes.fetch_jobs import fetch_jobs
from app.graph.nodes.identify_recurring import identify_recurring
from app.graph.nodes.recommend_actions import recommend_actions
from app.graph.nodes.summarize_incident import summarize_incident
from app.graph.state import InvestigationState


def build_graph():
    builder = StateGraph(InvestigationState)

    builder.add_node("fetch_jobs", fetch_jobs)
    builder.add_node("analyze_logs", analyze_logs)
    builder.add_node("identify_recurring", identify_recurring)
    builder.add_node("correlate_rag", correlate_rag)
    builder.add_node("summarize_incident", summarize_incident)
    builder.add_node("recommend_actions", recommend_actions)

    builder.add_edge(START, "fetch_jobs")
    builder.add_edge("fetch_jobs", "analyze_logs")
    builder.add_edge("analyze_logs", "identify_recurring")
    builder.add_edge("identify_recurring", "correlate_rag")
    builder.add_edge("correlate_rag", "summarize_incident")
    builder.add_edge("summarize_incident", "recommend_actions")
    builder.add_edge("recommend_actions", END)

    return builder.compile()


_graph = None


def get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph
