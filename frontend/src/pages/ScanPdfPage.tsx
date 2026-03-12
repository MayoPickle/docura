import { Fragment, useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Typography, Button, App, Modal } from "antd";
import {
  CameraOutlined,
  ArrowLeftOutlined,
  ScanOutlined,
  DeleteOutlined,
  FilePdfOutlined,
  PlusOutlined,
  CheckOutlined,
  EyeOutlined,
  FileImageOutlined,
} from "@ant-design/icons";
import api from "../api/client";
import type { ScanResult } from "../types";
import ScanResultReview from "../components/ScanResultReview";

const { Title, Text } = Typography;

const MAX_PAGES = 30;

const STEPS = [
  { num: 1, label: "Pages" },
  { num: 2, label: "PDF" },
  { num: 3, label: "Scan" },
  { num: 4, label: "Save" },
];

const ENHANCE_MESSAGES = [
  "Enhancing images…",
  "Boosting contrast…",
  "Sharpening text…",
  "Building PDF…",
];

const SCAN_MESSAGES = [
  "Reading pages…",
  "Extracting text…",
  "Analyzing document…",
  "Almost done…",
];

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

export default function ScanPdfPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pages, setPages] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [enhancing, setEnhancing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [msgIdx, setMsgIdx] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activePreview, setActivePreview] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const currentStep = scanResult
    ? 4
    : scanning
      ? 3
      : pdfBlob
        ? 2
        : 1;

  useEffect(() => {
    const urls = pages.map((f) => URL.createObjectURL(f));
    setPreviewUrls(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [pages]);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  useEffect(() => {
    if (!enhancing && !scanning) {
      setMsgIdx(0);
      return;
    }
    const timer = setInterval(() => {
      setMsgIdx((prev) => Math.min(prev + 1, 3));
    }, 2500);
    return () => clearInterval(timer);
  }, [enhancing, scanning]);

  const appendFiles = useCallback(
    (incoming: File[]) => {
      const valid = incoming.filter(isImageFile);
      if (valid.length < incoming.length) {
        message.warning("Only image files (JPG, PNG, etc.) are accepted.");
      }
      setPages((prev) => {
        const remaining = MAX_PAGES - prev.length;
        if (remaining <= 0) {
          message.warning(`Maximum ${MAX_PAGES} pages.`);
          return prev;
        }
        const accepted = valid.slice(0, remaining);
        if (accepted.length < valid.length) {
          message.warning(`Only ${accepted.length} page(s) added.`);
        }
        return [...prev, ...accepted];
      });
      setPdfBlob(null);
      setPdfUrl(null);
      setScanResult(null);
    },
    [message],
  );

  const removePage = (index: number) => {
    setPages((prev) => prev.filter((_, i) => i !== index));
    setPdfBlob(null);
    setPdfUrl(null);
    setScanResult(null);
  };

  const movePage = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    setPages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
    setPdfBlob(null);
    setPdfUrl(null);
    setScanResult(null);
  };

  const handleEnhanceAndCreatePdf = async () => {
    if (pages.length === 0) {
      message.warning("Please add at least one page.");
      return;
    }

    setEnhancing(true);
    setMsgIdx(0);
    try {
      const fd = new FormData();
      pages.forEach((f) => fd.append("files", f));

      const res = await api.post("/documents/enhance-pdf", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const { pdf_base64, pages: pageCount } = res.data;
      const binaryStr = atob(pdf_base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "application/pdf" });

      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      const url = URL.createObjectURL(blob);

      setPdfBlob(blob);
      setPdfUrl(url);
      setPdfPageCount(pageCount);
      message.success(`PDF created with ${pageCount} page(s)!`);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      message.error(detail || "Failed to create PDF. Please try again.");
    } finally {
      setEnhancing(false);
    }
  };

  const handleSmartScan = async () => {
    if (!pdfBlob) return;

    setScanning(true);
    setMsgIdx(0);
    setScanResult(null);

    try {
      const fd = new FormData();
      fd.append("files", pdfBlob, "scanned-document.pdf");

      const res = await api.post("/documents/scan", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setScanResult(res.data);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      message.error(detail || "Smart Scan failed. Please try again.");
    } finally {
      setScanning(false);
    }
  };

  const handleSave = async (values: Record<string, string>) => {
    setSaving(true);
    try {
      const { title, doc_type, notes, ...fieldValues } = values;
      const body = {
        title,
        doc_type,
        notes: notes || "",
        fields_json: JSON.stringify(fieldValues),
      };
      const res = await api.post("/documents", body);
      const docId = res.data.id;

      if (pdfBlob) {
        const fd = new FormData();
        fd.append("file", pdfBlob, `${title || "scanned-document"}.pdf`);
        await api.post(`/documents/${docId}/files?allow_duplicate=1`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }

      message.success("Document saved successfully!");
      navigate(`/documents/${docId}`);
    } catch {
      message.error("Failed to save document");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setPages([]);
    setPdfBlob(null);
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);
    setScanResult(null);
  };

  const handleBackToPages = () => {
    setPdfBlob(null);
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);
    setScanResult(null);
  };

  const messages = enhancing ? ENHANCE_MESSAGES : SCAN_MESSAGES;

  return (
    <div className="page-shell page-shell-narrow">
      {/* Header */}
      <div className="scan-head">
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(-1)}
          className="back-btn"
        />
        <div>
          <Title level={4} style={{ margin: 0, letterSpacing: "-0.02em" }}>
            Scan to PDF
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Multi-page scanning with text enhancement
          </Text>
        </div>
      </div>

      {/* Step indicator */}
      <div className="scan-steps">
        {STEPS.map((step, i) => {
          const status =
            step.num === currentStep
              ? "active"
              : step.num < currentStep
                ? "done"
                : "";
          return (
            <Fragment key={step.num}>
              {i > 0 && (
                <div
                  className={`scan-step-line${step.num <= currentStep ? " done" : ""}`}
                />
              )}
              <div className={`scan-step ${status}`}>
                <span className="scan-step-dot">
                  {step.num < currentStep ? (
                    <CheckOutlined style={{ fontSize: 10 }} />
                  ) : (
                    step.num
                  )}
                </span>
                <span className="scan-step-label">{step.label}</span>
              </div>
            </Fragment>
          );
        })}
      </div>

      {/* Step 1: Capture pages */}
      {currentStep === 1 && !enhancing && (
        <>
          <div className="spdf-capture-zone">
            <div className="spdf-capture-actions">
              <button
                className="spdf-capture-btn spdf-capture-camera"
                onClick={() => cameraInputRef.current?.click()}
              >
                <CameraOutlined />
                <span>Take Photo</span>
              </button>
              <button
                className="spdf-capture-btn spdf-capture-file"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileImageOutlined />
                <span>Upload Images</span>
              </button>
            </div>
            <Text type="secondary" style={{ fontSize: 12, textAlign: "center" }}>
              Add pages one by one or upload multiple images at once
            </Text>

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={(e) => {
                appendFiles(Array.from(e.target.files || []));
                e.target.value = "";
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={(e) => {
                appendFiles(Array.from(e.target.files || []));
                e.target.value = "";
              }}
            />
          </div>

          {/* Page grid */}
          {pages.length > 0 && (
            <div className="spdf-pages-section">
              <div className="scan-strip-head">
                <Text style={{ fontSize: 13, fontWeight: 600 }}>
                  {pages.length} page{pages.length !== 1 ? "s" : ""}
                </Text>
                <Button
                  type="link"
                  danger
                  size="small"
                  onClick={handleReset}
                  style={{ padding: 0 }}
                >
                  Clear all
                </Button>
              </div>

              <div className="spdf-pages-grid">
                {pages.map((file, index) => (
                  <div
                    key={`${file.name}-${file.size}-${index}`}
                    className={`spdf-page-card${dragIdx === index ? " spdf-page-dragging" : ""}`}
                    draggable
                    onDragStart={() => setDragIdx(index)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragIdx !== null && dragIdx !== index) {
                        movePage(dragIdx, index);
                        setDragIdx(index);
                      }
                    }}
                    onDragEnd={() => setDragIdx(null)}
                  >
                    <div className="spdf-page-num">{index + 1}</div>
                    <div
                      className="spdf-page-thumb"
                      onClick={() => {
                        setActivePreview(previewUrls[index]);
                        setPreviewOpen(true);
                      }}
                    >
                      {previewUrls[index] && (
                        <img src={previewUrls[index]} alt={`Page ${index + 1}`} />
                      )}
                      <div className="spdf-page-overlay">
                        <EyeOutlined />
                      </div>
                    </div>
                    <div className="spdf-page-actions">
                      <button
                        className="spdf-page-action-btn"
                        title="Remove"
                        onClick={() => removePage(index)}
                      >
                        <DeleteOutlined />
                      </button>
                    </div>
                  </div>
                ))}

                {pages.length < MAX_PAGES && (
                  <button
                    className="spdf-page-card spdf-page-add"
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    <PlusOutlined style={{ fontSize: 22 }} />
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      Add page
                    </Text>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Create PDF button */}
          {pages.length > 0 && (
            <Button
              type="primary"
              icon={<FilePdfOutlined />}
              onClick={handleEnhanceAndCreatePdf}
              block
              size="large"
              className="scan-go-btn"
            >
              Enhance & Create PDF
            </Button>
          )}
        </>
      )}

      {/* Enhancing animation */}
      {enhancing && (
        <div className="scan-analyzing">
          <div className="scan-analyzing-ring">
            <FilePdfOutlined />
          </div>
          <Text strong className="scan-analyzing-msg">
            {messages[msgIdx]}
          </Text>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Enhancing {pages.length} page{pages.length !== 1 ? "s" : ""}…
          </Text>
        </div>
      )}

      {/* Step 2: PDF preview */}
      {pdfBlob && !scanning && !scanResult && (
        <div className="spdf-preview-section">
          <div className="spdf-preview-header">
            <FilePdfOutlined style={{ fontSize: 20, color: "var(--brand)" }} />
            <div>
              <Text strong style={{ fontSize: 14 }}>
                Enhanced PDF Ready
              </Text>
              <Text
                type="secondary"
                style={{ display: "block", fontSize: 12 }}
              >
                {pdfPageCount} page{pdfPageCount !== 1 ? "s" : ""} · Text
                enhanced
              </Text>
            </div>
          </div>

          {pdfUrl && (
            <div className="spdf-pdf-frame-wrap">
              <iframe
                title="PDF Preview"
                src={pdfUrl}
                className="spdf-pdf-frame"
              />
            </div>
          )}

          <div className="spdf-preview-actions">
            <Button onClick={handleBackToPages} block>
              Back to Pages
            </Button>
            <Button
              type="primary"
              icon={<ScanOutlined />}
              onClick={handleSmartScan}
              block
              size="large"
              className="scan-go-btn"
            >
              Smart Scan
            </Button>
          </div>
        </div>
      )}

      {/* Scanning animation */}
      {scanning && (
        <div className="scan-analyzing">
          <div className="scan-analyzing-ring">
            <ScanOutlined />
          </div>
          <Text strong className="scan-analyzing-msg">
            {messages[msgIdx]}
          </Text>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Analyzing your document…
          </Text>
        </div>
      )}

      {/* Step 4: Results */}
      {scanResult && !scanning && (
        <div className="scan-result-wrap surface-card">
          <ScanResultReview
            result={scanResult}
            saving={saving}
            onSave={handleSave}
            onCancel={handleBackToPages}
          />
        </div>
      )}

      {/* Image preview modal */}
      <Modal
        open={previewOpen}
        title="Page Preview"
        onCancel={() => setPreviewOpen(false)}
        footer={null}
        width="90vw"
        style={{ top: 20 }}
        styles={{ body: { padding: 0, background: "#111" } }}
      >
        {activePreview && (
          <div
            style={{
              maxHeight: "80vh",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            }}
          >
            <img
              src={activePreview}
              alt="Preview"
              style={{
                maxWidth: "100%",
                maxHeight: "76vh",
                objectFit: "contain",
              }}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
