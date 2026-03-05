import os
from ..schemas import ScanResult


async def recognize_document(image_bytes: bytes, content_type: str) -> ScanResult:
    api_key = os.getenv("OPENAI_API_KEY")

    if api_key:
        from .openai_vision import recognize_with_openai
        return await recognize_with_openai(image_bytes, content_type, api_key)
    else:
        from .paddle_ocr import recognize_with_paddle
        return await recognize_with_paddle(image_bytes)
