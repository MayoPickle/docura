from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional


# --- Auth ---

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    created_at: datetime

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# --- Document ---

class DocumentCreate(BaseModel):
    title: str
    doc_type: str
    fields_json: Optional[str] = "{}"
    notes: Optional[str] = ""


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    doc_type: Optional[str] = None
    fields_json: Optional[str] = None
    notes: Optional[str] = None


class FileResponse(BaseModel):
    id: int
    document_id: int
    filename: str
    content_type: str
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class DocumentResponse(BaseModel):
    id: int
    user_id: int
    title: str
    doc_type: str
    fields_json: str
    notes: str
    created_at: datetime
    updated_at: datetime
    files: list[FileResponse] = []

    model_config = {"from_attributes": True}


class DocumentListResponse(BaseModel):
    id: int
    user_id: int
    title: str
    doc_type: str
    notes: str
    created_at: datetime
    updated_at: datetime
    file_count: int = 0

    model_config = {"from_attributes": True}


# --- Scan ---

class ScanResult(BaseModel):
    doc_type: str
    title: str
    fields: dict
    confidence: float
    method: str  # "openai" or "tesseract"
