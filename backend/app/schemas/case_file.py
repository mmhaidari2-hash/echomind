"""Schemas for the Consumer Rights Case File.

A case file turns a one-off rights evaluation into a case that lives in
the Life Graph: a case node, the two deadlines that matter (the 30-day
right to reject and the 6-month burden shift), and the obligations that
make sure neither deadline is missed.
"""

from datetime import date

from pydantic import BaseModel, Field

from app.schemas.consumer_rights import DesiredRemedy, RightsPathway
from app.schemas.life import LifeNode, Obligation


class CaseDeadline(BaseModel):
    label: str
    date: date
    kind: str = Field(pattern="^(reject_window|burden_shift)$")


class CaseFile(BaseModel):
    case_node: LifeNode
    pathway: RightsPathway
    pathway_label: str
    recommended_remedy: DesiredRemedy
    notice_draft: str
    deadlines: list[CaseDeadline] = Field(default_factory=list)
    obligations: list[Obligation] = Field(default_factory=list)
    statute_refs: list[str] = Field(default_factory=list)
    next_steps: list[str] = Field(default_factory=list)
