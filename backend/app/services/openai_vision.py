import base64
import json
import os

from openai import AsyncOpenAI
from ..schemas import ScanResult

SYSTEM_PROMPT = """You are a document recognition assistant. Analyze the uploaded image and:

1. Identify the document type. Must be one of: credit_card, passport, visa, diploma, id_card, driver_license, other
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
- other: {"description": ""}

Only include fields you can confidently read from the document. Leave unreadable fields as empty strings."""


async def recognize_with_openai(image_bytes: bytes, content_type: str, api_key: str) -> ScanResult:
    client = AsyncOpenAI(api_key=api_key)
    model = os.getenv("OPENAI_MODEL", "gpt-4o")

    b64_image = base64.b64encode(image_bytes).decode("utf-8")

    response = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Please analyze this document image and extract the information."},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{content_type};base64,{b64_image}"},
                    },
                ],
            },
        ],
        max_tokens=1000,
        temperature=0.1,
    )

    raw = response.choices[0].message.content or "{}"
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return ScanResult(
            doc_type="other",
            title="Unrecognized Document",
            fields={"raw_text": raw},
            confidence=0.1,
            method="openai",
        )

    return ScanResult(
        doc_type=data.get("doc_type", "other"),
        title=data.get("title", "Untitled Document"),
        fields=data.get("fields", {}),
        confidence=data.get("confidence", 0.5),
        method="openai",
    )
