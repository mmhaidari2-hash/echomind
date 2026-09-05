from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.schemas.documents import DocumentParseRequest, DocumentParseResponse
from app.services.document_parser import (
    ALLOWED_MIME,
    MAX_UPLOAD_BYTES,
    parse_document,
    parse_upload,
)

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("/parse-text", response_model=DocumentParseResponse)
def parse_text(payload: DocumentParseRequest) -> DocumentParseResponse:
    return parse_document(text=payload.text, filename=payload.filename, locale=payload.locale)


@router.post("/parse", response_model=DocumentParseResponse)
async def parse_file(
    file: UploadFile = File(...),
    hint: str | None = Form(default=None),
    locale: str = Form(default="en"),
) -> DocumentParseResponse:
    filename = file.filename or "upload"
    content_type = (file.content_type or "application/octet-stream").split(";")[0].strip().lower()
    if content_type not in ALLOWED_MIME:
        raise HTTPException(status_code=415, detail="File type is not allowed")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File is larger than 8 MB")
    if locale not in {"en", "fa"}:
        locale = "en"
    return parse_upload(data, filename, hint, locale)
