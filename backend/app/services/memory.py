"""Compatibility facade over the contextual memory engine."""

from app.services.memory_engine import (
    hints_for,
    list_facts,
    recall,
    remember,
    remember_document,
    remember_watch,
)

__all__ = [
    "hints_for",
    "list_facts",
    "recall",
    "remember",
    "remember_document",
    "remember_watch",
]
