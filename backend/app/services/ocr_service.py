import os
from io import BytesIO
from ..schemas import ScanResult

SUPPORTED_DOC_TYPES = {
    "credit_card",
    "passport",
    "visa",
    "diploma",
    "id_card",
    "driver_license",
    "i20",
    "i797",
    "other",
}
WORD_DOC_MIME_TYPES = {
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


def _extract_text_from_pdf(pdf_bytes: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError:
        return ""

    try:
        reader = PdfReader(BytesIO(pdf_bytes))
    except Exception:
        return ""

    texts: list[str] = []
    for page in reader.pages:
        try:
            page_text = page.extract_text() or ""
        except Exception:
            page_text = ""
        if page_text.strip():
            texts.append(page_text.strip())
    return "\n\n".join(texts).strip()


def _extract_text_from_plain_bytes(file_bytes: bytes) -> str:
    for encoding in ("utf-8", "utf-16", "latin-1"):
        try:
            text = file_bytes.decode(encoding)
            return text.strip()
        except UnicodeDecodeError:
            continue
    return ""


def _build_text_scan_result(text: str, doc_type_hint: str | None = None) -> ScanResult:
    normalized_hint = _normalize_doc_type_hint(doc_type_hint)
    if not text.strip():
        return ScanResult(
            doc_type=normalized_hint or "other",
            title="Unrecognized Document",
            fields={"description": "Could not extract text from the uploaded file."},
            confidence=0.1,
            method="text-extract",
        )

    return ScanResult(
        doc_type=normalized_hint or "other",
        title="Scanned Document",
        fields={"raw_text": text[:4000]},
        confidence=0.3 if normalized_hint else 0.2,
        method="text-extract",
    )


def _build_word_requires_openai_result(doc_type_hint: str | None = None) -> ScanResult:
    normalized_hint = _normalize_doc_type_hint(doc_type_hint)
    return ScanResult(
        doc_type=normalized_hint or "other",
        title="Word Document",
        fields={
            "description": "Word (.doc/.docx) scanning requires OPENAI_API_KEY in this backend configuration."
        },
        confidence=0.1,
        method="text-extract",
    )


def _normalize_doc_type_hint(doc_type_hint: str | None) -> str | None:
    if not doc_type_hint:
        return None
    normalized = doc_type_hint.strip().lower()
    return normalized if normalized in SUPPORTED_DOC_TYPES else None


def _merge_paddle_results(
    results: list[ScanResult],
    doc_type_hint: str | None = None,
) -> ScanResult:
    normalized_hint = _normalize_doc_type_hint(doc_type_hint)
    if not results:
        return ScanResult(
            doc_type=normalized_hint or "other",
            title="Unrecognized Document",
            fields={},
            confidence=0.0,
            method="paddleocr",
        )

    if len(results) == 1:
        only = results[0]
        if normalized_hint and only.doc_type == "other":
            only.doc_type = normalized_hint
        return only

    ranked = sorted(results, key=lambda item: item.confidence, reverse=True)
    merged_fields: dict = {}
    for item in ranked:
        for key, value in item.fields.items():
            if key in merged_fields:
                continue
            if isinstance(value, str):
                if value.strip():
                    merged_fields[key] = value
            elif value is not None:
                merged_fields[key] = value

    type_scores: dict[str, float] = {}
    for item in results:
        if item.doc_type and item.doc_type != "other":
            type_scores[item.doc_type] = type_scores.get(item.doc_type, 0.0) + max(item.confidence, 0.01)

    merged_doc_type = normalized_hint or (max(type_scores, key=type_scores.get) if type_scores else "other")

    merged_title = "Scanned Document"
    for item in ranked:
        if item.title and item.title.strip() and item.title.strip().lower() not in {
            "scanned document",
            "unrecognized document",
            "untitled document",
        }:
            merged_title = item.title
            break

    if merged_title == "Scanned Document":
        merged_title = ranked[0].title or "Scanned Document"

    avg_confidence = sum(max(item.confidence, 0.0) for item in results) / len(results)

    return ScanResult(
        doc_type=merged_doc_type,
        title=merged_title,
        fields=merged_fields,
        confidence=min(avg_confidence, 1.0),
        method="paddleocr",
    )


async def recognize_documents(
    files: list[tuple[bytes, str, str | None]],
    doc_type_hint: str | None = None,
) -> ScanResult:
    image_files: list[tuple[bytes, str, str | None]] = []
    text_parts: list[str] = []
    has_word_docs = False

    for file_bytes, content_type, filename in files:
        if content_type.startswith("image/"):
            image_files.append((file_bytes, content_type, filename))
            continue
        if content_type in WORD_DOC_MIME_TYPES:
            has_word_docs = True
            continue
        if content_type == "application/pdf":
            extracted = _extract_text_from_pdf(file_bytes)
            if extracted:
                text_parts.append(extracted)
            continue
        if content_type.startswith("text/"):
            extracted = _extract_text_from_plain_bytes(file_bytes)
            if extracted:
                text_parts.append(extracted)

    combined_text = "\n\n".join(part for part in text_parts if part.strip()).strip()
    api_key = os.getenv("OPENAI_API_KEY")

    if api_key:
        from .openai_vision import recognize_with_openai_files
        return await recognize_with_openai_files(
            files=files,
            api_key=api_key,
            doc_type_hint=doc_type_hint,
        )

    from .paddle_ocr import recognize_with_paddle

    results: list[ScanResult] = []
    for image_bytes, _, _ in image_files:
        results.append(await recognize_with_paddle(image_bytes))

    if combined_text:
        results.append(_build_text_scan_result(combined_text, doc_type_hint=doc_type_hint))

    if not results and has_word_docs:
        return _build_word_requires_openai_result(doc_type_hint=doc_type_hint)

    if not results:
        return _build_text_scan_result("", doc_type_hint=doc_type_hint)

    return _merge_paddle_results(results, doc_type_hint=doc_type_hint)


async def recognize_document(image_bytes: bytes, content_type: str) -> ScanResult:
    return await recognize_documents([(image_bytes, content_type, None)])
