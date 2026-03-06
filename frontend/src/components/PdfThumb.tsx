import { useEffect, useState } from "react";
import { FilePdfOutlined } from "@ant-design/icons";

interface Props {
  url: string;
  width?: number;
}

export default function PdfThumb({ url, width = 168 }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");

        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
        }

        const pdf = await pdfjsLib.getDocument(url).promise;
        const page = await pdf.getPage(1);
        const vp = page.getViewport({ scale: 1 });
        const scale = (width * 2) / vp.width;
        const scaled = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = scaled.width;
        canvas.height = scaled.height;

        await page.render({ canvas, viewport: scaled }).promise;

        if (!cancelled) {
          setSrc(canvas.toDataURL("image/jpeg", 0.85));
        }

        pdf.destroy();
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, width]);

  if (failed || !src) {
    return (
      <span className="scan-strip-icon">
        <FilePdfOutlined />
      </span>
    );
  }

  return <img src={src} alt="PDF preview" />;
}
