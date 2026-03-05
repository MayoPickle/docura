import base64
import json
import mimetypes
import os
import re

from openai import AsyncOpenAI
from ..schemas import ScanResult

SYSTEM_PROMPT = """You are a document recognition assistant. Analyze the uploaded document file(s) and:

1. Identify the document type:
   - If it matches one of these known types, use it exactly: credit_card, passport, visa, diploma, id_card, driver_license, i20, i797
   - Otherwise create a new category in short lower_snake_case (example: lca, i983, medical_history)
2. Extract all relevant fields based on the document type.
3. Suggest a short title for this document.
4. Provide a confidence score from 0.0 to 1.0.

Return ONLY valid JSON in this exact format (no markdown, no extra text):
{
  "doc_type": "<type>",
  "title": "<suggested title>",
  "confidence": <0.0-1.0>,
  "fields": { ... }
}

Field schemas by document type:
- credit_card: {"card_number": "", "cardholder_name": "", "expiry_date": "", "security_code": "", "bank": "", "card_type": ""}
- passport: {"passport_number": "", "full_name": "", "nationality": "", "date_of_birth": "", "sex": "", "issue_date": "", "expiry_date": "", "place_of_birth": ""}
- visa: {"visa_number": "", "full_name": "", "country": "", "visa_type": "", "issue_date": "", "expiry_date": "", "entries": ""}
- diploma: {"institution": "", "degree": "", "major": "", "full_name": "", "graduation_date": ""}
- id_card: {"id_number": "", "full_name": "", "date_of_birth": "", "sex": "", "address": "", "issue_date": "", "expiry_date": ""}
- driver_license: {"license_number": "", "full_name": "", "date_of_birth": "", "address": "", "class": "", "issue_date": "", "expiry_date": ""}
- i20: {"sevis_id": "", "school_name": "", "full_name": "", "program": "", "start_date": "", "end_date": ""}
- i797: {"receipt_number": "", "notice_type": "", "petitioner": "", "beneficiary": "", "received_date": "", "notice_date": "", "start_date": "", "end_date": "", "class_requested": ""}
- other or custom category: return a practical fields object with key-value pairs (not only description)

For long forms (for example LCA ETA-9035), return the most important 20-40 fields instead of every box on the form.
Prefer core identifiers, parties, dates, status, role/title, and location/wage facts.

For i797 dates:
- received_date can come from labels like "Received Date" / "Date Received".
- start_date can come from "Valid From" / "Validity Start Date".
- end_date can come from "Valid To" / "Until" / "Validity End Date" / "Expiration".

Only include fields you can confidently read from the document. Leave unreadable fields as empty strings."""


def _data_url(file_bytes: bytes, content_type: str) -> str:
    b64_data = base64.b64encode(file_bytes).decode("utf-8")
    return f"data:{content_type};base64,{b64_data}"


def _normalize_content_type(content_type: str, filename: str | None = None) -> str:
    normalized = (content_type or "").split(";", 1)[0].strip().lower()
    if normalized and normalized != "application/octet-stream":
        return normalized

    guessed, _ = mimetypes.guess_type(filename or "")
    if guessed:
        return guessed.lower()
    return normalized or "application/octet-stream"


def _build_content_item(
    file_bytes: bytes,
    content_type: str,
    filename: str | None,
    index: int,
) -> dict[str, str]:
    resolved_name = filename or f"document_{index}"
    normalized_type = _normalize_content_type(content_type, resolved_name)
    data_url = _data_url(file_bytes, normalized_type)

    if normalized_type.startswith("image/"):
        # Responses API expects images as input_image instead of input_file.
        return {
            "type": "input_image",
            "image_url": data_url,
        }

    return {
        "type": "input_file",
        "filename": resolved_name,
        "file_data": data_url,
    }


def _extract_response_text(response) -> str:
    output_text = getattr(response, "output_text", None)
    if output_text:
        return output_text

    chunks: list[str] = []
    for item in getattr(response, "output", []) or []:
        if getattr(item, "type", "") != "message":
            continue
        for content in getattr(item, "content", []) or []:
            if getattr(content, "type", "") == "output_text":
                text = getattr(content, "text", "")
                if text:
                    chunks.append(text)

    return "\n".join(chunks) if chunks else "{}"


def _parse_result(raw: str) -> ScanResult:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # Best-effort recovery when model wraps JSON with extra text.
        start = raw.find("{")
        end = raw.rfind("}")
        if start != -1 and end != -1 and end > start:
            candidate = raw[start:end + 1]
            try:
                data = json.loads(candidate)
            except json.JSONDecodeError:
                data = None
        else:
            data = None

    if data is None:
        return ScanResult(
            doc_type="other",
            title="Unrecognized Document",
            fields={"raw_text": raw},
            confidence=0.1,
            method="openai",
        )

    doc_type_raw = data.get("doc_type", "other")
    normalized_doc_type = re.sub(r"[^a-z0-9]+", "_", str(doc_type_raw).lower()).strip("_") or "other"
    fields = data.get("fields", {})
    if not isinstance(fields, dict):
        fields = {"raw_text": str(fields)}
    normalized_fields: dict[str, str] = {}
    for key, value in fields.items():
        field_key = re.sub(r"[^a-z0-9]+", "_", str(key).lower()).strip("_") or str(key)
        if isinstance(value, str):
            normalized_fields[field_key] = value
        elif value is None:
            normalized_fields[field_key] = ""
        else:
            normalized_fields[field_key] = str(value)

    return ScanResult(
        doc_type=normalized_doc_type,
        title=data.get("title", "Untitled Document"),
        fields=normalized_fields,
        confidence=data.get("confidence", 0.5),
        method="openai",
    )


async def recognize_with_openai_files(
    files: list[tuple[bytes, str, str | None]],
    api_key: str,
    doc_type_hint: str | None = None,
) -> ScanResult:
    client = AsyncOpenAI(api_key=api_key)
    model = os.getenv("OPENAI_MODEL", "gpt-5.2")

    user_text = [
        "Please analyze these document file(s) as one logical document and extract the information.",
        f"Total files: {len(files)}.",
        "Files may include images, PDFs, or text documents.",
    ]
    if doc_type_hint:
        user_text.append(
            f"User-selected expected document type: {doc_type_hint}. Use this as a strong hint when determining doc_type."
        )

    user_content: list[dict[str, str]] = [
        {"type": "input_text", "text": " ".join(user_text)},
    ]
    for idx, (file_bytes, content_type, filename) in enumerate(files, start=1):
        user_content.append(
            _build_content_item(
                file_bytes=file_bytes,
                content_type=content_type,
                filename=filename,
                index=idx,
            )
        )

    response = await client.responses.create(
        model=model,
        instructions=SYSTEM_PROMPT,
        input=[
            {"role": "user", "content": user_content},
        ],
        max_output_tokens=4000,
    )

    raw = _extract_response_text(response)
    return _parse_result(raw)


async def recognize_with_openai(
    image_bytes: bytes,
    content_type: str,
    api_key: str,
) -> ScanResult:
    return await recognize_with_openai_files([(image_bytes, content_type, None)], api_key=api_key)
