import io
import re
from ..schemas import ScanResult


async def recognize_with_tesseract(image_bytes: bytes) -> ScanResult:
    try:
        import pytesseract
        from PIL import Image, ImageEnhance
    except ImportError:
        return ScanResult(
            doc_type="other",
            title="Unrecognized Document",
            fields={"error": "Tesseract or Pillow not installed"},
            confidence=0.0,
            method="tesseract",
        )

    image = Image.open(io.BytesIO(image_bytes))
    gray = image.convert("L")
    enhanced = ImageEnhance.Contrast(gray).enhance(2.0)

    try:
        text = pytesseract.image_to_string(enhanced)
    except pytesseract.TesseractNotFoundError:
        return ScanResult(
            doc_type="other",
            title="Unrecognized Document",
            fields={"error": "Tesseract is not installed. Run: brew install tesseract"},
            confidence=0.0,
            method="tesseract",
        )

    text_upper = text.upper()

    doc_type, title, fields, confidence = _classify_and_extract(text, text_upper)

    return ScanResult(
        doc_type=doc_type,
        title=title,
        fields=fields,
        confidence=confidence,
        method="tesseract",
    )


def _classify_and_extract(text: str, text_upper: str) -> tuple:
    if "PASSPORT" in text_upper:
        return _extract_passport(text, text_upper)
    if _has_credit_card_number(text):
        return _extract_credit_card(text, text_upper)
    if "VISA" in text_upper:
        return _extract_visa(text, text_upper)
    if any(kw in text_upper for kw in ["DIPLOMA", "DEGREE", "UNIVERSITY", "COLLEGE", "CERTIFICATE"]):
        return _extract_diploma(text, text_upper)
    if any(kw in text_upper for kw in ["DRIVER", "LICENSE", "DRIVING"]):
        return _extract_driver_license(text)
    if any(kw in text_upper for kw in ["IDENTITY", "ID CARD", "NATIONAL ID"]):
        return _extract_id_card(text)

    return "other", "Scanned Document", {"raw_text": text.strip()[:500]}, 0.2


def _has_credit_card_number(text: str) -> bool:
    digits = re.sub(r"\D", "", text)
    return bool(re.search(r"\d{13,19}", digits))


def _find_dates(text: str) -> list[str]:
    patterns = [
        r"\d{2}/\d{2}/\d{4}",
        r"\d{4}-\d{2}-\d{2}",
        r"\d{2}/\d{2}",
        r"\d{2}\s+\w{3}\s+\d{4}",
    ]
    dates = []
    for p in patterns:
        dates.extend(re.findall(p, text))
    return dates


def _extract_passport(text: str, text_upper: str) -> tuple:
    fields = {
        "passport_number": "",
        "full_name": "",
        "nationality": "",
        "date_of_birth": "",
        "sex": "",
        "issue_date": "",
        "expiry_date": "",
    }

    pn = re.search(r"[A-Z]{1,2}\d{6,9}", text_upper)
    if pn:
        fields["passport_number"] = pn.group()

    dates = _find_dates(text)
    if len(dates) >= 3:
        fields["date_of_birth"] = dates[0]
        fields["issue_date"] = dates[1]
        fields["expiry_date"] = dates[2]
    elif len(dates) >= 1:
        fields["expiry_date"] = dates[-1]

    sex = re.search(r"\b(MALE|FEMALE|M|F)\b", text_upper)
    if sex:
        fields["sex"] = sex.group()

    return "passport", "Passport", fields, 0.5


def _extract_credit_card(text: str, text_upper: str) -> tuple:
    fields = {"card_number": "", "cardholder_name": "", "expiry_date": "", "security_code": "", "bank": ""}

    digits = re.findall(r"\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}", text)
    if digits:
        fields["card_number"] = digits[0]

    exp = re.search(r"(\d{2}/\d{2,4})", text)
    if exp:
        fields["expiry_date"] = exp.group(1)

    cvv_match = re.search(r"(?:CVV|CVC|CID|SECURITY\s*CODE)\D{0,6}(\d{3,4})", text_upper)
    if cvv_match:
        fields["security_code"] = cvv_match.group(1)

    names = re.findall(r"[A-Z][A-Z\s]{3,30}", text)
    for n in names:
        n = n.strip()
        if len(n.split()) >= 2 and not any(c.isdigit() for c in n):
            fields["cardholder_name"] = n
            break

    return "credit_card", "Credit Card", fields, 0.4


def _extract_visa(text: str, text_upper: str) -> tuple:
    fields = {"visa_number": "", "full_name": "", "country": "", "visa_type": "", "issue_date": "", "expiry_date": ""}

    vn = re.search(r"[A-Z0-9]{6,12}", text_upper)
    if vn:
        fields["visa_number"] = vn.group()

    dates = _find_dates(text)
    if len(dates) >= 2:
        fields["issue_date"] = dates[0]
        fields["expiry_date"] = dates[1]
    elif len(dates) >= 1:
        fields["expiry_date"] = dates[-1]

    return "visa", "Visa", fields, 0.4


def _extract_diploma(text: str, text_upper: str) -> tuple:
    fields = {"institution": "", "degree": "", "major": "", "full_name": "", "graduation_date": ""}

    dates = _find_dates(text)
    if dates:
        fields["graduation_date"] = dates[-1]

    for kw in ["BACHELOR", "MASTER", "DOCTOR", "PHD", "MBA", "ASSOCIATE"]:
        if kw in text_upper:
            fields["degree"] = kw.title()
            break

    return "diploma", "Diploma", fields, 0.35


def _extract_driver_license(text: str) -> tuple:
    fields = {"license_number": "", "full_name": "", "date_of_birth": "", "address": "", "expiry_date": ""}

    ln = re.search(r"[A-Z0-9]{5,15}", text)
    if ln:
        fields["license_number"] = ln.group()

    dates = _find_dates(text)
    if len(dates) >= 2:
        fields["date_of_birth"] = dates[0]
        fields["expiry_date"] = dates[-1]

    return "driver_license", "Driver License", fields, 0.35


def _extract_id_card(text: str) -> tuple:
    fields = {"id_number": "", "full_name": "", "date_of_birth": "", "sex": "", "address": "", "expiry_date": ""}

    idn = re.search(r"\d{9,18}", text)
    if idn:
        fields["id_number"] = idn.group()

    dates = _find_dates(text)
    if dates:
        fields["date_of_birth"] = dates[0]
        if len(dates) > 1:
            fields["expiry_date"] = dates[-1]

    return "id_card", "ID Card", fields, 0.35
