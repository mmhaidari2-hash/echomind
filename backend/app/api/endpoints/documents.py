import hashlib

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.auth import require_user
from app.schemas.documents import DocumentParseRequest, DocumentParseResponse, EvidenceMetadata
from app.services.document_parser import (
    ALLOWED_MIME,
    MAX_UPLOAD_BYTES,
    parse_document,
    parse_upload,
)
from app.services.memory_engine import list_evidence, store_evidence

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("/evidence", response_model=list[EvidenceMetadata])
def evidence(user_id: str = Depends(require_user)) -> list[EvidenceMetadata]:
    return list_evidence(user_id)


@router.post("/parse-text", response_model=DocumentParseResponse)
def parse_text(
    payload: DocumentParseRequest,
    user_id: str = Depends(require_user),
) -> DocumentParseResponse:
    parsed = parse_document(text=payload.text, filename=payload.filename, locale=payload.locale)
    raw = payload.text.encode("utf-8")
    store_evidence(
        user_id,
        parsed,
        sha256=hashlib.sha256(raw).hexdigest(),
        content_type="text/plain",
        size_bytes=len(raw),
    )
    return parsed


@router.post("/parse", response_model=DocumentParseResponse)
async def parse_file(
    file: UploadFile = File(...),
    hint: str | None = Form(default=None),
    locale: str = Form(default="en"),
    user_id: str = Depends(require_user),
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

    parsed = parse_upload(data, filename, hint, locale)
    store_evidence(
        user_id,
        parsed,
        sha256=hashlib.sha256(data).hexdigest(),
        content_type=content_type,
        size_bytes=len(data),
    )
    return parsed
