"""Schemas for the Docs connector: find documents, read their text.

A document's text is the claim letter / case file the hub promises
for Docs — drafted from the owner's own evidence. Text comes back
plain, capped so a huge document cannot flood a reply. Search
results are Drive files (a document IS a Drive file); reading uses
the Docs API.
"""

from pydantic import BaseModel

from app.schemas.drive import DriveFile


class DocRead(BaseModel):
    file: DriveFile
    content: str = ""
    truncated: bool = False
    total_chars: int = 0
