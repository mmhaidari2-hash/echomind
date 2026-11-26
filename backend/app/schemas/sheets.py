"""Schemas for the Sheets connector: find spreadsheets, read values.

A spreadsheet's values are the costs-and-renewals ledger the hub
promises for Sheets — refunds, claims and renewals tracked in rows.
Values come back as rows of strings, capped so a huge sheet cannot
flood a reply. Search results are Drive files (a spreadsheet IS a
Drive file); reading uses the Sheets API.
"""

from pydantic import BaseModel

from app.schemas.drive import DriveFile


class SheetTab(BaseModel):
    title: str = ""
    index: int = 0


class SheetValues(BaseModel):
    spreadsheet: DriveFile
    sheet_title: str = ""
    range: str = ""
    values: list[list[str]] = []
    truncated: bool = False
    total_rows: int = 0
    total_cells: int = 0
