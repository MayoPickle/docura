import io
import re
import logging
from functools import lru_cache
from ..schemas import ScanResult

logger = logging.getLogger(__name__)

_ocr_engine = None


def _get_ocr():
    """Lazy-init singleton PaddleOCR engine to avoid reload overhead."""
    global _ocr_engine
    if _ocr_engine is None:
        import logging as _logging
        _logging.getLogger("ppocr").setLevel(_logging.WARNING)
        from paddleocr import PaddleOCR
        _ocr_engine = PaddleOCR(use_angle_cls=True, lang="en")
    return _ocr_engine


async def recognize_with_paddle(image_bytes: bytes) -> ScanResult:
    try:
        from PIL import Image
        import numpy as np
    except ImportError:
        return ScanResult(
            doc_type="other",
            title="Unrecognized Document",
            fields={"error": "Pillow or numpy not installed"},
            confidence=0.0,
            method="paddleocr",
        )

    try:
        ocr = _get_ocr()
    except Exception as e:
        logger.error("Failed to initialize PaddleOCR: %s", e)
        return ScanResult(
            doc_type="other",
            title="Unrecognized Document",
            fields={"error": f"PaddleOCR init failed: {str(e)}"},
            confidence=0.0,
            method="paddleocr",
        )

    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_array = np.array(image)

    try:
        results = list(ocr.predict(img_array))
    except Exception as e:
        logger.error("PaddleOCR recognition failed: %s", e)
        return ScanResult(
            doc_type="other",
            title="Unrecognized Document",
            fields={"error": f"OCR failed: {str(e)}"},
            confidence=0.0,
            method="paddleocr",
        )

    lines = _extract_lines(results)
    full_text = "\n".join(line["text"] for line in lines)
    text_upper = full_text.upper()

    doc_type, title, fields, confidence = _classify_and_extract(lines, full_text, text_upper)

    return ScanResult(
        doc_type=doc_type,
        title=title,
        fields=fields,
        confidence=confidence,
        method="paddleocr",
    )


def _extract_lines(results) -> list[dict]:
    """Parse PaddleOCR v3 predict results into sorted text lines with positions."""
    lines = []
    if not results:
        return lines

    for page_result in results:
        texts = page_result.get("rec_texts", [])
        scores = page_result.get("rec_scores", [])
        polys = page_result.get("rec_polys", [])

        for i, text in enumerate(texts):
            conf = scores[i] if i < len(scores) else 0.0
            if i < len(polys):
                poly = polys[i]
                y_center = float((poly[0][1] + poly[2][1]) / 2)
                x_center = float((poly[0][0] + poly[2][0]) / 2)
            else:
                y_center = float(i * 30)
                x_center = 0.0

            lines.append({
                "text": text,
                "confidence": float(conf),
                "y": y_center,
                "x": x_center,
            })

    lines.sort(key=lambda l: (l["y"], l["x"]))
    return lines


# ---------------------------------------------------------------------------
#  Classification
# ---------------------------------------------------------------------------

def _classify_and_extract(lines: list[dict], text: str, text_upper: str) -> tuple:
    if "PASSPORT" in text_upper:
        return _extract_passport(lines, text, text_upper)
    if _has_credit_card_number(text):
        return _extract_credit_card(lines, text, text_upper)
    if "VISA" in text_upper and _visa_likelihood(text_upper):
        return _extract_visa(lines, text, text_upper)
    if any(kw in text_upper for kw in ["DIPLOMA", "DEGREE", "UNIVERSITY", "COLLEGE", "CERTIFICATE OF"]):
        return _extract_diploma(lines, text, text_upper)
    if any(kw in text_upper for kw in ["DRIVER", "LICENSE", "DRIVING LICENCE"]):
        return _extract_driver_license(lines, text, text_upper)
    if any(kw in text_upper for kw in ["IDENTITY", "ID CARD", "NATIONAL ID", "IDENTIFICATION"]):
        return _extract_id_card(lines, text, text_upper)

    return "other", "Scanned Document", {"raw_text": text.strip()[:500]}, 0.2


def _visa_likelihood(text_upper: str) -> bool:
    """Distinguish 'Visa' the card brand from an actual visa document."""
    visa_doc_keywords = ["EMBASSY", "CONSULATE", "ENTRY", "IMMIGRATION", "VALID UNTIL", "ISSUED AT", "PERMIT", "NUMBER OF ENTRIES"]
    return any(kw in text_upper for kw in visa_doc_keywords) or text_upper.count("VISA") > 1


def _has_credit_card_number(text: str) -> bool:
    cleaned = re.sub(r"[^0-9 ]", "", text)
    return bool(re.search(r"(?:\d[\s-]?){13,19}", cleaned))


# ---------------------------------------------------------------------------
#  Helpers
# ---------------------------------------------------------------------------

def _find_dates(text: str) -> list[str]:
    patterns = [
        r"\d{2}/\d{2}/\d{4}",
        r"\d{4}[-/]\d{2}[-/]\d{2}",
        r"\d{2}/\d{2}",
        r"\d{2}\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\w*\s+\d{4}",
    ]
    dates = []
    for p in patterns:
        dates.extend(re.findall(p, text, re.IGNORECASE))
    return dates


def _find_value_after_label(lines: list[dict], label_pattern: str) -> str:
    """Find text that appears on the same line or immediately after a label."""
    for i, line in enumerate(lines):
        if re.search(label_pattern, line["text"], re.IGNORECASE):
            after = re.split(label_pattern, line["text"], flags=re.IGNORECASE)[-1].strip(": \t")
            if after:
                return after
            if i + 1 < len(lines) and abs(lines[i + 1]["y"] - line["y"]) < 30:
                return lines[i + 1]["text"].strip()
            if i + 1 < len(lines):
                return lines[i + 1]["text"].strip()
    return ""


def _find_all_names(text: str) -> list[str]:
    """Find sequences of capitalized words that look like names."""
    return re.findall(r"[A-Z][A-Z\s]{2,40}", text)


# ---------------------------------------------------------------------------
#  Extractors
# ---------------------------------------------------------------------------

def _extract_passport(lines: list[dict], text: str, text_upper: str) -> tuple:
    fields = {
        "passport_number": "",
        "full_name": "",
        "nationality": "",
        "date_of_birth": "",
        "sex": "",
        "issue_date": "",
        "expiry_date": "",
        "place_of_birth": "",
    }

    pn = re.search(r"[A-Z]{1,2}\d{6,9}", text_upper)
    if pn:
        fields["passport_number"] = pn.group()

    fields["full_name"] = (
        _find_value_after_label(lines, r"(?:sur)?name|given name|nom") or ""
    )
    if not fields["full_name"]:
        names = _find_all_names(text)
        for n in names:
            n = n.strip()
            if len(n.split()) >= 2 and "PASSPORT" not in n:
                fields["full_name"] = n
                break

    fields["nationality"] = _find_value_after_label(lines, r"national|citizen")
    fields["place_of_birth"] = _find_value_after_label(lines, r"place of birth|birthplace|lieu")

    sex = re.search(r"\b(MALE|FEMALE|M|F)\b", text_upper)
    if sex:
        fields["sex"] = sex.group()

    dates = _find_dates(text)
    if len(dates) >= 3:
        fields["date_of_birth"] = dates[0]
        fields["issue_date"] = dates[1]
        fields["expiry_date"] = dates[2]
    elif len(dates) == 2:
        fields["date_of_birth"] = dates[0]
        fields["expiry_date"] = dates[1]
    elif len(dates) == 1:
        fields["expiry_date"] = dates[0]

    return "passport", "Passport", fields, 0.6


def _extract_credit_card(lines: list[dict], text: str, text_upper: str) -> tuple:
    fields = {
        "card_number": "",
        "cardholder_name": "",
        "expiry_date": "",
        "security_code": "",
        "bank": "",
        "card_type": "",
    }

    card_nums = re.findall(r"\d[\d\s-]{12,22}\d", text)
    for cn in card_nums:
        digits_only = re.sub(r"\D", "", cn)
        if 13 <= len(digits_only) <= 19:
            fields["card_number"] = " ".join(
                digits_only[i:i+4] for i in range(0, len(digits_only), 4)
            )
            first = int(digits_only[0])
            if first == 4:
                fields["card_type"] = "Visa"
            elif first == 5:
                fields["card_type"] = "Mastercard"
            elif first == 3:
                fields["card_type"] = "Amex"
            elif first == 6:
                fields["card_type"] = "Discover"
            break

    exp = re.search(r"(\d{2}\s*/\s*\d{2,4})", text)
    if exp:
        fields["expiry_date"] = exp.group(1).replace(" ", "")

    cvv_match = re.search(r"(?:CVV|CVC|CID|SECURITY\s*CODE)\D{0,6}(\d{3,4})", text_upper)
    if cvv_match:
        fields["security_code"] = cvv_match.group(1)

    fields["cardholder_name"] = _find_value_after_label(lines, r"card\s*holder|name")
    if not fields["cardholder_name"]:
        for line in lines:
            t = line["text"].strip()
            if (
                re.fullmatch(r"[A-Z][A-Z\s]{3,40}", t)
                and len(t.split()) >= 2
                and not any(c.isdigit() for c in t)
                and not any(kw in t for kw in ["VALID", "THRU", "DEBIT", "CREDIT", "CARD", "BANK", "VISA", "MASTER"])
            ):
                fields["cardholder_name"] = t
                break

    for kw in ["VISA", "MASTERCARD", "AMEX", "AMERICAN EXPRESS", "DISCOVER", "UNIONPAY", "JCB"]:
        if kw in text_upper:
            fields["card_type"] = kw.title()
            break

    bank_candidates = _find_value_after_label(lines, r"bank|issued by")
    if bank_candidates and not any(c.isdigit() for c in bank_candidates):
        fields["bank"] = bank_candidates
    else:
        skip_words = {"VISA", "MASTERCARD", "DEBIT", "CREDIT", "VALID", "THRU", "EXPIRE", "CARD"}
        for line in lines[:5]:
            t = line["text"].strip()
            if (
                len(t) > 3
                and not any(c.isdigit() for c in t)
                and t.upper() not in skip_words
                and t.upper() != fields.get("cardholder_name", "").upper()
                and not re.search(r"\d{2}/\d{2}", t)
            ):
                fields["bank"] = t
                break

    return "credit_card", "Credit Card", fields, 0.55


def _extract_visa(lines: list[dict], text: str, text_upper: str) -> tuple:
    fields = {
        "visa_number": "",
        "full_name": "",
        "country": "",
        "visa_type": "",
        "issue_date": "",
        "expiry_date": "",
        "entries": "",
    }

    vn = re.search(r"(?:NO\.?|NUMBER)\s*:?\s*([A-Z0-9]{6,15})", text_upper)
    if vn:
        fields["visa_number"] = vn.group(1)

    fields["full_name"] = _find_value_after_label(lines, r"name|nom")
    fields["visa_type"] = _find_value_after_label(lines, r"type|category|class")

    entries = re.search(r"(SINGLE|MULTIPLE|MULTI|DOUBLE)\s*(?:ENTRY|ENTRIES)?", text_upper)
    if entries:
        fields["entries"] = entries.group().strip()

    dates = _find_dates(text)
    if len(dates) >= 2:
        fields["issue_date"] = dates[0]
        fields["expiry_date"] = dates[1]
    elif len(dates) == 1:
        fields["expiry_date"] = dates[0]

    return "visa", "Visa", fields, 0.5


def _extract_diploma(lines: list[dict], text: str, text_upper: str) -> tuple:
    fields = {
        "institution": "",
        "degree": "",
        "major": "",
        "full_name": "",
        "graduation_date": "",
    }

    for kw in ["BACHELOR", "MASTER", "DOCTOR", "PHD", "PH.D", "MBA", "ASSOCIATE", "DIPLOMA"]:
        if kw in text_upper:
            idx = text_upper.index(kw)
            end = min(idx + 60, len(text))
            fields["degree"] = text[idx:end].split("\n")[0].strip()
            break

    fields["institution"] = _find_value_after_label(lines, r"university|college|institute|school|academy")
    if not fields["institution"]:
        for line in lines[:5]:
            t = line["text"].strip()
            if any(kw in t.upper() for kw in ["UNIVERSITY", "COLLEGE", "INSTITUTE", "SCHOOL", "ACADEMY"]):
                fields["institution"] = t
                break

    fields["full_name"] = _find_value_after_label(lines, r"conferred upon|awarded to|certif(?:y|ies) that|name")
    fields["major"] = _find_value_after_label(lines, r"major|field|program|specializ")

    dates = _find_dates(text)
    if dates:
        fields["graduation_date"] = dates[-1]

    return "diploma", "Diploma", fields, 0.5


def _extract_driver_license(lines: list[dict], text: str, text_upper: str) -> tuple:
    fields = {
        "license_number": "",
        "full_name": "",
        "date_of_birth": "",
        "address": "",
        "class": "",
        "issue_date": "",
        "expiry_date": "",
    }

    ln = _find_value_after_label(lines, r"(?:license|licence|DL)\s*(?:no|number|#)")
    if ln:
        fields["license_number"] = re.sub(r"[^A-Z0-9]", "", ln.upper())
    else:
        m = re.search(r"[A-Z]\d{7,12}", text_upper)
        if m:
            fields["license_number"] = m.group()

    fields["full_name"] = _find_value_after_label(lines, r"name|nom")
    fields["address"] = _find_value_after_label(lines, r"address|addr|residence")
    fields["class"] = _find_value_after_label(lines, r"class|category|type")

    dates = _find_dates(text)
    if len(dates) >= 3:
        fields["date_of_birth"] = dates[0]
        fields["issue_date"] = dates[1]
        fields["expiry_date"] = dates[2]
    elif len(dates) == 2:
        fields["date_of_birth"] = dates[0]
        fields["expiry_date"] = dates[1]
    elif len(dates) == 1:
        fields["expiry_date"] = dates[0]

    return "driver_license", "Driver License", fields, 0.5


def _extract_id_card(lines: list[dict], text: str, text_upper: str) -> tuple:
    fields = {
        "id_number": "",
        "full_name": "",
        "date_of_birth": "",
        "sex": "",
        "address": "",
        "issue_date": "",
        "expiry_date": "",
    }

    idn = _find_value_after_label(lines, r"(?:id|identity|card)\s*(?:no|number|#)")
    if idn:
        fields["id_number"] = idn.strip()
    else:
        m = re.search(r"\d{9,18}", text)
        if m:
            fields["id_number"] = m.group()

    fields["full_name"] = _find_value_after_label(lines, r"name|nom")
    fields["address"] = _find_value_after_label(lines, r"address|addr|residence")

    sex = re.search(r"\b(MALE|FEMALE|M|F)\b", text_upper)
    if sex:
        fields["sex"] = sex.group()

    dates = _find_dates(text)
    if len(dates) >= 3:
        fields["date_of_birth"] = dates[0]
        fields["issue_date"] = dates[1]
        fields["expiry_date"] = dates[2]
    elif len(dates) >= 1:
        fields["date_of_birth"] = dates[0]
        if len(dates) > 1:
            fields["expiry_date"] = dates[-1]

    return "id_card", "ID Card", fields, 0.5
