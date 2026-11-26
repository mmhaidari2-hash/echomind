"""Schemas for the Drive connector: search files, read text content."""

from pydantic import BaseModel


class DriveFile(BaseModel):
    id: str
    name: str = ""
    mime_type: str = ""
    modified_time: str = ""
    web_view_link: str | None = None


class DriveFileRead(BaseModel):
    file: DriveFile
    content: str = ""
    truncated: bool = False
    total_chars: int = 0
