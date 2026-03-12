import io
from PIL import Image, ImageEnhance, ImageFilter, ImageOps


def _open_and_normalise(image_bytes: bytes) -> Image.Image:
    """Open image bytes, auto-orient via EXIF, and convert to RGB."""
    image = Image.open(io.BytesIO(image_bytes))
    image = ImageOps.exif_transpose(image)

    if image.mode in ("RGBA", "P", "LA", "PA"):
        bg = Image.new("RGB", image.size, (255, 255, 255))
        if image.mode != "RGBA":
            image = image.convert("RGBA")
        bg.paste(image, mask=image.split()[3])
        return bg

    if image.mode != "RGB":
        return image.convert("RGB")
    return image


def prepare_image_for_pdf(image_bytes: bytes) -> Image.Image:
    """Normalise an image (EXIF rotate + RGB) without any visual enhancement."""
    return _open_and_normalise(image_bytes)


def enhance_document_image(image_bytes: bytes) -> Image.Image:
    """Enhance a document image for better text readability.

    Applies grayscale conversion, contrast boost, sharpening, and slight
    brightness lift so text pops against a cleaner background.
    """
    image = _open_and_normalise(image_bytes)

    gray = image.convert("L")
    enhanced = ImageEnhance.Contrast(gray).enhance(1.8)
    enhanced = ImageEnhance.Sharpness(enhanced).enhance(1.5)
    enhanced = ImageEnhance.Brightness(enhanced).enhance(1.1)
    enhanced = enhanced.filter(ImageFilter.MedianFilter(size=3))

    return enhanced.convert("RGB")


def create_pdf_from_images(images: list[Image.Image], dpi: int = 200) -> bytes:
    """Combine PIL images into a single multi-page PDF returned as bytes."""
    if not images:
        raise ValueError("No images provided")

    output = io.BytesIO()
    first = images[0]

    if len(images) == 1:
        first.save(output, format="PDF", resolution=dpi)
    else:
        first.save(
            output,
            format="PDF",
            resolution=dpi,
            save_all=True,
            append_images=images[1:],
        )

    return output.getvalue()
