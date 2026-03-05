from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import Optional

from ..database import get_db
from ..models import User, Document, File
from ..schemas import DocumentCreate, DocumentUpdate, DocumentResponse, DocumentListResponse
from ..deps import get_current_user

router = APIRouter()


@router.get("", response_model=list[DocumentListResponse])
async def list_documents(
    doc_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Document).where(Document.user_id == current_user.id)
    if doc_type:
        query = query.where(Document.doc_type == doc_type)
    query = query.order_by(Document.updated_at.desc())

    result = await db.execute(query.options(selectinload(Document.files)))
    docs = result.scalars().all()

    return [
        DocumentListResponse(
            id=d.id,
            user_id=d.user_id,
            title=d.title,
            doc_type=d.doc_type,
            notes=d.notes,
            created_at=d.created_at,
            updated_at=d.updated_at,
            file_count=len(d.files),
        )
        for d in docs
    ]


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
    return doc


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
    return doc


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
    return doc


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
