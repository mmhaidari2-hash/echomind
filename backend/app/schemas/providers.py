"""Schemas for the provider registry: model-provider slots.

A slot is one model provider EchoMind can answer with — GPT
(ChatGPT), Claude, Cursor, or a custom one the owner adds. The API
key itself is never returned to the client: the slot only says
whether a key is stored (`has_key`). Slots with no key say "needs
key" and fail closed; nothing pretends a keyless provider works.
"""

from pydantic import BaseModel, Field


class ProviderSlot(BaseModel):
    id: str
    name: str = ""
    provider: str = "custom"
    model: str = ""
    endpoint: str = ""
    has_key: bool = False
    has_endpoint: bool = False
    is_active: bool = False
    builtin: bool = False


class ProviderCreate(BaseModel):
    name: str = Field(default="", max_length=120)
    provider: str = Field(default="custom", max_length=40)
    model: str = Field(default="", max_length=120)
    endpoint: str = Field(default="", max_length=300)
    api_key: str | None = Field(default=None, max_length=2000)


class ProviderUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    model: str | None = Field(default=None, max_length=120)
    endpoint: str | None = Field(default=None, max_length=300)
    api_key: str | None = Field(default=None, max_length=2000)
    clear_key: bool = False


class ProviderTestResult(BaseModel):
    ok: bool
    status: int | None = None
    detail: str = ""
