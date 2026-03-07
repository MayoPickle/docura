from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, or_
from sqlalchemy.orm import selectinload
from typing import Optional
import re

from ..database import get_db
from ..models import User, Document, File, DocumentTypePreference
from ..schemas import (
    DocumentCreate,
    DocumentUpdate,
    DocumentResponse,
    DocumentListResponse,
    DocumentTypeCount,
    RenameDocTypeRequest,
    RenameDocTypeResponse,
)
from ..deps import get_current_user

router = APIRouter()
HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
SUPPORTED_DOC_TYPE_ICON_KEYS = {
    "credit_card",
    "passport",
    "visa",
    "diploma",
    "id_card",
    "driver_license",
    "i20",
    "i797",
    "other",
    "file_text",
    "file_search",
    "folder",
    "safety",
    "bank",
    "wallet",
    "home",
    "medicine",
    "calendar",
    "profile",
    "book",
    "global",
    "car",
    "idcard",
    "trophy",
}


def _sanitize_doc_type(raw: str, lowercase: bool = True) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "_", raw.strip()).strip("_")
    return cleaned.lower() if lowercase else cleaned


def _to_ilike_pattern(raw: str) -> str | None:
    normalized = raw.strip()
    if not normalized:
        return None
    escaped = normalized.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _normalize_hex_color(raw: str | None, field_name: str) -> str | None:
    value = (raw or "").strip()
    if not value:
        return None
    if not HEX_COLOR_RE.fullmatch(value):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} must be a hex color like #0f766e",
        )
    return value.lower()


async def _load_icon_pref_map(
    db: AsyncSession,
    user_id: int,
    doc_types: list[str],
) -> dict[str, dict[str, str | None]]:
    normalized_types = {
        _sanitize_doc_type(doc_type or "", lowercase=True)
        for doc_type in doc_types
        if (doc_type or "").strip()
    }
    normalized_types.discard("")
    if not normalized_types:
        return {}

    result = await db.execute(
        select(
            DocumentTypePreference.doc_type_norm,
            DocumentTypePreference.icon_key,
            DocumentTypePreference.icon_bg,
            DocumentTypePreference.icon_fg,
        ).where(
            DocumentTypePreference.user_id == user_id,
            DocumentTypePreference.doc_type_norm.in_(normalized_types),
        )
    )
    return {
        row[0]: {
            "icon_key": row[1],
            "icon_bg": row[2],
            "icon_fg": row[3],
        }
        for row in result.all()
    }


def _icon_pref_for_doc_type(
    doc_type: str,
    icon_pref_map: dict[str, dict[str, str | None]],
) -> dict[str, str | None]:
    normalized = _sanitize_doc_type(doc_type or "", lowercase=True)
    return icon_pref_map.get(normalized, {})


def _to_document_response(
    doc: Document,
    icon_pref_map: dict[str, dict[str, str | None]],
) -> DocumentResponse:
    pref = _icon_pref_for_doc_type(doc.doc_type, icon_pref_map)
    return DocumentResponse(
        id=doc.id,
        user_id=doc.user_id,
        title=doc.title,
        doc_type=doc.doc_type,
        fields_json=doc.fields_json,
        notes=doc.notes,
        doc_type_icon_key=pref.get("icon_key"),
        doc_type_icon_bg=pref.get("icon_bg"),
        doc_type_icon_fg=pref.get("icon_fg"),
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        files=doc.files or [],
    )


@router.get("", response_model=list[DocumentListResponse])
async def list_documents(
    doc_type: Optional[str] = Query(None),
    q: Optional[str] = Query(None, description="Search in title, notes, extracted fields, and filenames"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Document).where(Document.user_id == current_user.id)
    if doc_type:
        query = query.where(Document.doc_type == doc_type)

    keyword = _to_ilike_pattern(q) if q else None
    if keyword:
        file_name_exists = (
            select(File.id)
            .where(File.document_id == Document.id, File.filename.ilike(keyword, escape="\\"))
            .exists()
        )
        query = query.where(
            or_(
                Document.title.ilike(keyword, escape="\\"),
                Document.notes.ilike(keyword, escape="\\"),
                Document.fields_json.ilike(keyword, escape="\\"),
                file_name_exists,
            )
        )

    query = query.order_by(Document.updated_at.desc())

    result = await db.execute(query.options(selectinload(Document.files)))
    docs = result.scalars().all()
    icon_pref_map = await _load_icon_pref_map(db=db, user_id=current_user.id, doc_types=[d.doc_type for d in docs])

    response_items: list[DocumentListResponse] = []
    for doc in docs:
        pref = _icon_pref_for_doc_type(doc.doc_type, icon_pref_map)
        response_items.append(
            DocumentListResponse(
                id=doc.id,
                user_id=doc.user_id,
                title=doc.title,
                doc_type=doc.doc_type,
                notes=doc.notes,
                doc_type_icon_key=pref.get("icon_key"),
                doc_type_icon_bg=pref.get("icon_bg"),
                doc_type_icon_fg=pref.get("icon_fg"),
                created_at=doc.created_at,
                updated_at=doc.updated_at,
                file_count=len(doc.files),
            )
        )
    return response_items


@router.get("/summary")
async def document_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document.doc_type, func.count(Document.id))
        .where(Document.user_id == current_user.id)
        .group_by(Document.doc_type)
    )
    counts = {row[0]: row[1] for row in result.all()}
    total = sum(counts.values())
    return {"total": total, "by_type": counts}


@router.get("/types", response_model=list[DocumentTypeCount])
async def list_document_types(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count_result = await db.execute(
        select(Document.doc_type, func.count(Document.id))
        .where(Document.user_id == current_user.id)
        .group_by(Document.doc_type)
        .order_by(func.count(Document.id).desc(), Document.doc_type.asc())
    )
    count_rows = count_result.all()
    pref_result = await db.execute(
        select(
            DocumentTypePreference.doc_type_norm,
            DocumentTypePreference.icon_key,
            DocumentTypePreference.icon_bg,
            DocumentTypePreference.icon_fg,
        ).where(DocumentTypePreference.user_id == current_user.id)
    )
    pref_rows = pref_result.all()
    icon_pref_map = {
        row[0]: {
            "icon_key": row[1],
            "icon_bg": row[2],
            "icon_fg": row[3],
        }
        for row in pref_rows
    }

    rows: list[tuple[str, int]] = list(count_rows)
    normalized_count_types = {
        _sanitize_doc_type(row[0], lowercase=True) for row in count_rows
    }
    for pref_doc_type_norm, *_ in pref_rows:
        if pref_doc_type_norm not in normalized_count_types:
            rows.append((pref_doc_type_norm, 0))

    rows.sort(key=lambda row: (-row[1], row[0]))
    response_items: list[DocumentTypeCount] = []
    for doc_type, count in rows:
        pref = _icon_pref_for_doc_type(doc_type, icon_pref_map)
        response_items.append(
            DocumentTypeCount(
                doc_type=doc_type,
                count=count,
                icon_key=pref.get("icon_key"),
                icon_bg=pref.get("icon_bg"),
                icon_fg=pref.get("icon_fg"),
            )
        )
    return response_items


@router.post("/types/rename", response_model=RenameDocTypeResponse)
async def rename_document_type(
    data: RenameDocTypeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from_type = _sanitize_doc_type(data.from_type, lowercase=True)
    to_type_norm = _sanitize_doc_type(data.to_type, lowercase=True)
    to_type_stored = _sanitize_doc_type(data.to_type, lowercase=False)
    icon_key = (data.icon_key or "").strip() or None
    icon_bg = _normalize_hex_color(data.icon_bg, "icon_bg")
    icon_fg = _normalize_hex_color(data.icon_fg, "icon_fg")
    has_style_update = any([icon_key, icon_bg, icon_fg])

    if not from_type:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="from_type is required")
    if not to_type_norm or not to_type_stored:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="to_type is required")
    if icon_key and icon_key not in SUPPORTED_DOC_TYPE_ICON_KEYS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported icon_key")
    # Allow case-only rename (e.g. lca -> LCA), but block true no-op.
    if from_type == to_type_norm and data.from_type.strip() == data.to_type.strip() and not has_style_update:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="from_type and to_type are the same")

    has_doc_type_change = not (
        from_type == to_type_norm and data.from_type.strip() == data.to_type.strip()
    )

    count_result = await db.execute(
        select(func.count(Document.id)).where(
            Document.user_id == current_user.id,
            func.lower(Document.doc_type) == from_type,
        )
    )
    count = count_result.scalar_one()
    if count == 0 and has_doc_type_change:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source type not found")
    if count == 0 and not has_style_update:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source type not found")

    if has_doc_type_change:
        await db.execute(
            update(Document)
            .where(Document.user_id == current_user.id, func.lower(Document.doc_type) == from_type)
            .values(doc_type=to_type_stored)
        )

    pref_result = await db.execute(
        select(DocumentTypePreference).where(
            DocumentTypePreference.user_id == current_user.id,
            DocumentTypePreference.doc_type_norm.in_({from_type, to_type_norm}),
        )
    )
    pref_by_norm = {pref.doc_type_norm: pref for pref in pref_result.scalars().all()}
    from_pref = pref_by_norm.get(from_type)
    to_pref = pref_by_norm.get(to_type_norm)

    # On rename, move old preference to the new key when possible.
    if has_doc_type_change and from_type != to_type_norm and from_pref:
        if to_pref is None:
            from_pref.doc_type_norm = to_type_norm
            to_pref = from_pref
            from_pref = None
        else:
            await db.delete(from_pref)
            from_pref = None

    if has_style_update:
        if to_pref:
            if icon_key:
                to_pref.icon_key = icon_key
            to_pref.icon_bg = icon_bg
            to_pref.icon_fg = icon_fg
        else:
            if not icon_key:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="icon_key is required")
            to_pref = DocumentTypePreference(
                user_id=current_user.id,
                doc_type_norm=to_type_norm,
                icon_key=icon_key,
                icon_bg=icon_bg,
                icon_fg=icon_fg,
            )
            db.add(to_pref)

    await db.commit()

    return RenameDocTypeResponse(
        from_type=data.from_type.strip(),
        to_type=to_type_stored,
        icon_key=to_pref.icon_key if to_pref else None,
        icon_bg=to_pref.icon_bg if to_pref else None,
        icon_fg=to_pref.icon_fg if to_pref else None,
        updated_count=count,
    )


@router.post("", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def create_document(
    data: DocumentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = Document(
        user_id=current_user.id,
        title=data.title,
        doc_type=data.doc_type,
        fields_json=data.fields_json or "{}",
        notes=data.notes or "",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc, attribute_names=["files"])
    icon_pref_map = await _load_icon_pref_map(db=db, user_id=current_user.id, doc_types=[doc.doc_type])
    return _to_document_response(doc, icon_pref_map)


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document)
        .where(Document.id == document_id, Document.user_id == current_user.id)
        .options(selectinload(Document.files))
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    icon_pref_map = await _load_icon_pref_map(db=db, user_id=current_user.id, doc_types=[doc.doc_type])
    return _to_document_response(doc, icon_pref_map)


@router.put("/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: int,
    data: DocumentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document)
        .where(Document.id == document_id, Document.user_id == current_user.id)
        .options(selectinload(Document.files))
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(doc, field, value)

    await db.commit()
    await db.refresh(doc, attribute_names=["files"])
    icon_pref_map = await _load_icon_pref_map(db=db, user_id=current_user.id, doc_types=[doc.doc_type])
    return _to_document_response(doc, icon_pref_map)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document).where(Document.id == document_id, Document.user_id == current_user.id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    await db.delete(doc)
    await db.commit()
