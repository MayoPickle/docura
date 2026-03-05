import os
import uuid
import hashlib
from fastapi import APIRouter, Depends, UploadFile, HTTPException, status, File, Form, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db
from ..models import User, Document, File as DocumentFile
from ..schemas import FileResponse, ScanResult, ScanDuplicateCheckResponse, ScanDuplicateItem
from ..deps import get_current_user
from ..services.ocr_service import recognize_documents
from ..services.file_crypto import encrypt_for_storage, plaintext_sha256_file, FileCryptoError

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

SUPPORTED_SCAN_MIME_TYPES = {
    "application/pdf",
    "text/plain",
}


def _sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _sha256_file(path: str) -> str | None:
    return plaintext_sha256_file(path)


async def _find_duplicate_user_file(
    db: AsyncSession,
    user_id: int,
    content: bytes,
) -> DocumentFile | None:
    existing_hashes = await _build_user_file_hash_index(db=db, user_id=user_id)
    return _find_duplicate_in_index(content=content, existing_hashes=existing_hashes)


async def _build_user_file_hash_index(
    db: AsyncSession,
    user_id: int,
) -> dict[tuple[int, str], DocumentFile]:
    hash_index: dict[tuple[int, str], DocumentFile] = {}
    result = await db.execute(
        select(DocumentFile).join(Document).where(Document.user_id == user_id)
    )
    for existing_file in result.scalars():
        if not os.path.exists(existing_file.filepath):
            continue
        try:
            file_size = os.path.getsize(existing_file.filepath)
        except OSError:
            continue

        existing_hash = _sha256_file(existing_file.filepath)
        if existing_hash:
            hash_index[(file_size, existing_hash)] = existing_file
    return hash_index


def _find_duplicate_in_index(
    content: bytes,
    existing_hashes: dict[tuple[int, str], DocumentFile],
) -> DocumentFile | None:
    uploaded_size = len(content)
    uploaded_hash = _sha256_bytes(content)
    return existing_hashes.get((uploaded_size, uploaded_hash))


def _collect_upload_files(
    file: UploadFile | None,
    files: list[UploadFile] | None,
) -> list[UploadFile]:
    upload_files: list[UploadFile] = []
    if files:
        upload_files.extend(files)
    if file:
        upload_files.append(file)
    return upload_files


async def _read_scan_files(
    upload_files: list[UploadFile],
) -> list[tuple[bytes, str, str | None]]:
    scan_files: list[tuple[bytes, str, str | None]] = []
    for uploaded in upload_files:
        if not _is_supported_scan_type(uploaded.content_type, uploaded.filename):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only image, PDF, or plain text files are supported",
            )

        file_bytes = await uploaded.read()
        if not file_bytes:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file is not supported")
        resolved_content_type = _resolve_scan_content_type(uploaded.content_type, uploaded.filename)
        scan_files.append((file_bytes, resolved_content_type, uploaded.filename))
    return scan_files


def _resolve_scan_content_type(content_type: str | None, filename: str | None) -> str:
    normalized_type = (content_type or "").lower()
    if normalized_type:
        return normalized_type

    normalized_name = (filename or "").lower()
    if normalized_name.endswith(".pdf"):
        return "application/pdf"
    if normalized_name.endswith(".txt"):
        return "text/plain"
    return "application/octet-stream"


def _is_supported_scan_type(content_type: str | None, filename: str | None) -> bool:
    normalized_type = _resolve_scan_content_type(content_type, filename)
    if normalized_type.startswith("image/") or normalized_type in SUPPORTED_SCAN_MIME_TYPES:
        return True

    normalized_name = (filename or "").lower()
    if normalized_name.endswith(".pdf") or normalized_name.endswith(".txt"):
        return True
    return False


@router.post("/{document_id}/files", response_model=FileResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    document_id: int,
    file: UploadFile,
    allow_duplicate: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document).where(Document.id == document_id, Document.user_id == current_user.id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    ext = os.path.splitext(file.filename or "")[1]
    stored_name = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, stored_name)

    content = await file.read()
    if not allow_duplicate:
        try:
            duplicate = await _find_duplicate_user_file(db=db, user_id=current_user.id, content=content)
            if duplicate:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "code": "DUPLICATE_FILE",
                        "message": "This file already exists.",
                        "existing_file_id": duplicate.id,
                        "existing_document_id": duplicate.document_id,
                        "existing_filename": duplicate.filename,
                    },
                )
        except FileCryptoError as exc:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    try:
        encrypted_content = encrypt_for_storage(content)
    except FileCryptoError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    with open(filepath, "wb") as f:
        f.write(encrypted_content)

    db_file = DocumentFile(
        document_id=document_id,
        filename=file.filename or "untitled",
        filepath=filepath,
        content_type=file.content_type or "application/octet-stream",
    )
    db.add(db_file)
    await db.commit()
    await db.refresh(db_file)
    return db_file


@router.post("/scan/duplicates", response_model=ScanDuplicateCheckResponse)
async def check_scan_duplicates(
    file: UploadFile | None = File(default=None),
    files: list[UploadFile] | None = File(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    upload_files = _collect_upload_files(file=file, files=files)

    if not upload_files:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one file is required")

    if len(upload_files) > 10:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Maximum 10 files are supported")

    scan_files = await _read_scan_files(upload_files)
    try:
        existing_hashes = await _build_user_file_hash_index(db=db, user_id=current_user.id)
    except FileCryptoError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    duplicates: list[ScanDuplicateItem] = []
    for file_bytes, _, filename in scan_files:
        duplicate = _find_duplicate_in_index(content=file_bytes, existing_hashes=existing_hashes)
        if not duplicate:
            continue
        duplicates.append(
            ScanDuplicateItem(
                filename=filename or "untitled",
                existing_file_id=duplicate.id,
                existing_document_id=duplicate.document_id,
                existing_filename=duplicate.filename,
            )
        )

    return ScanDuplicateCheckResponse(duplicates=duplicates)


@router.post("/scan", response_model=ScanResult)
async def scan_document(
    file: UploadFile | None = File(default=None),
    files: list[UploadFile] | None = File(default=None),
    doc_type_hint: str | None = Form(default=None),
    current_user: User = Depends(get_current_user),
):
    upload_files = _collect_upload_files(file=file, files=files)

    if not upload_files:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one file is required")

    if len(upload_files) > 10:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Maximum 10 files are supported")

    scan_files = await _read_scan_files(upload_files)

    result = await recognize_documents(scan_files, doc_type_hint=doc_type_hint)
    return result
