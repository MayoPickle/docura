import { Fragment, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Typography, Upload, Button, Image, App, Modal } from "antd";
import {
  CameraOutlined,
  CloudUploadOutlined,
  ArrowLeftOutlined,
  ScanOutlined,
  DeleteOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  CheckOutlined,
  BulbOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import api from "../api/client";
import type { ScanResult } from "../types";
import ScanResultReview from "../components/ScanResultReview";
import PdfThumb from "../components/PdfThumb";

const { Title, Text } = Typography;

const MAX_SCAN_FILES = 10;

const SCAN_MESSAGES = [
  "Reading files…",
  "Extracting text…",
  "Analyzing content…",
  "Almost done…",
];

const STEPS = [
  { num: 1, label: "Upload" },
  { num: 2, label: "Scan" },
  { num: 3, label: "Save" },
];

const FORMAT_CHIPS = ["JPG", "PNG", "PDF", "TXT"];

type ScanDuplicateItem = {
  filename: string;
  existing_file_id: number;
  existing_document_id: number;
  existing_filename: string;
};

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function previewKind(file: File): "image" | "pdf" | "other" {
  if (isImageFile(file)) return "image";
  if (isPdfFile(file)) return "pdf";
  return "other";
}

function isSupportedScanFile(file: File) {
  const name = file.name.toLowerCase();
  return (
    file.type.startsWith("image/") ||
    file.type === "application/pdf" ||
    file.type.startsWith("text/") ||
    name.endsWith(".pdf") ||
    name.endsWith(".txt")
  );
}

export default function SmartScanPage() {
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanFiles, setScanFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activePreview, setActivePreview] = useState<{
    url: string;
    name: string;
    kind: "image" | "pdf" | "other";
  } | null>(null);
  const [scanMsgIdx, setScanMsgIdx] = useState(0);

  const currentStep = scanResult && !scanning ? 3 : scanning ? 2 : 1;

  useEffect(() => {
    const nextUrls = scanFiles.map((file) => URL.createObjectURL(file));
    setPreviewUrls(nextUrls);
    return () => nextUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [scanFiles]);

  useEffect(() => {
    if (!scanning) {
      setScanMsgIdx(0);
      return;
    }
    const timer = setInterval(() => {
      setScanMsgIdx((prev) => Math.min(prev + 1, SCAN_MESSAGES.length - 1));
    }, 2800);
    return () => clearInterval(timer);
  }, [scanning]);

  const appendFiles = (incoming: File[]) => {
    if (incoming.length === 0) return;

    const valid = incoming.filter(isSupportedScanFile);
    if (valid.length < incoming.length) {
      message.warning("Some files were skipped. Only image, PDF, and text files are supported.");
    }

    setScanFiles((prev) => {
      const remaining = MAX_SCAN_FILES - prev.length;
      if (remaining <= 0) {
        message.warning(`You can upload up to ${MAX_SCAN_FILES} files.`);
        return prev;
      }
      const accepted = valid.slice(0, remaining);
      if (accepted.length < valid.length) {
        message.warning(`Only the first ${accepted.length} file(s) were added.`);
      }
      return [...prev, ...accepted];
    });
    setScanResult(null);
  };

  const handleScan = async () => {
    if (scanFiles.length === 0) {
      message.warning("Please upload at least one file first.");
      return;
    }

    setScanResult(null);
    const buildScanFormData = () => {
      const formData = new FormData();
      scanFiles.forEach((file) => formData.append("files", file));
      return formData;
    };

    const confirmContinue = (duplicates: ScanDuplicateItem[]) =>
      new Promise<boolean>((resolve) => {
        const duplicateNames = Array.from(new Set(duplicates.map((item) => item.filename)));
        modal.confirm({
          title: "Duplicate file detected",
          okText: "Continue scan",
          cancelText: "Cancel",
          content: (
            <div>
              <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
                These files already exist in your documents:
              </Text>
              {duplicateNames.slice(0, 5).map((name) => (
                <Text key={name} style={{ display: "block" }}>
                  - {name}
                </Text>
              ))}
              {duplicateNames.length > 5 && (
                <Text type="secondary" style={{ display: "block", marginTop: 4 }}>
                  And {duplicateNames.length - 5} more.
                </Text>
              )}
              <Text style={{ display: "block", marginTop: 8 }}>Continue scanning anyway?</Text>
            </div>
          ),
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });

    try {
      const duplicateRes = await api.post("/documents/scan/duplicates", buildScanFormData(), {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const duplicates = (duplicateRes.data?.duplicates || []) as ScanDuplicateItem[];
      if (duplicates.length > 0) {
        const shouldContinue = await confirmContinue(duplicates);
        if (!shouldContinue) {
          message.info("Scan canceled.");
          return;
        }
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      const detailMessage =
        typeof detail === "string"
          ? detail
          : typeof detail?.message === "string"
            ? detail.message
            : "";
      message.error(detailMessage || "Failed to validate files before scanning.");
      return;
    }

    setScanning(true);
    try {
      const res = await api.post("/documents/scan", buildScanFormData(), {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setScanResult(res.data);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      message.error(detail || "Failed to scan document. Please try again.");
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

      for (const file of scanFiles) {
        const formData = new FormData();
        formData.append("file", file);
        await api.post(`/documents/${docId}/files?allow_duplicate=1`, formData, {
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
    setScanResult(null);
    setScanFiles([]);
  };

  const removeFile = (index: number) => {
    setScanFiles((prev) => prev.filter((_, i) => i !== index));
    setScanResult(null);
  };

  const openPreview = (file: File, index: number) => {
    const url = previewUrls[index];
    if (!url) {
      message.warning("Preview is not available for this file.");
      return;
    }
    setActivePreview({ url, name: file.name, kind: previewKind(file) });
    setPreviewOpen(true);
  };

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
            Smart Scan
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            AI-powered document recognition
          </Text>
        </div>
      </div>

      {/* Step indicator */}
      <div className="scan-steps">
        {STEPS.map((step, i) => {
          const status =
            step.num === currentStep ? "active" : step.num < currentStep ? "done" : "";
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

      {/* Upload zone */}
      {!scanResult && !scanning && (
        <div className="scan-zone-wrap">
          <Upload
            accept="image/*,application/pdf,text/plain,.pdf,.txt"
            multiple
            showUploadList={false}
            beforeUpload={(file) => {
              appendFiles([file]);
              return false;
            }}
          >
            <div className="scan-zone">
              <CloudUploadOutlined className="scan-zone-icon" />
              <Text strong className="scan-zone-title">
                Upload files
              </Text>
              <Text type="secondary" className="scan-zone-hint">
                Tap to browse or drag &amp; drop
              </Text>
              <div className="scan-format-chips">
                {FORMAT_CHIPS.map((fmt) => (
                  <span key={fmt} className="scan-format-chip">
                    {fmt}
                  </span>
                ))}
              </div>
            </div>
          </Upload>

          <Button
            icon={<CameraOutlined />}
            className="scan-camera-btn"
            onClick={() => cameraInputRef.current?.click()}
            block
          >
            Take Photo
          </Button>

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              appendFiles(files);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {/* File strip */}
      {scanFiles.length > 0 && (
        <div className="scan-strip-section">
          <div className="scan-strip-head">
            <Text style={{ fontSize: 13, fontWeight: 600 }}>
              {scanFiles.length} of {MAX_SCAN_FILES} files
            </Text>
            {!scanResult && (
              <Button
                type="link"
                danger
                size="small"
                onClick={handleReset}
                style={{ padding: 0 }}
              >
                Clear all
              </Button>
            )}
          </div>

          {/* Progress bar */}
          <div className="scan-progress-track">
            <div
              className="scan-progress-fill"
              style={{ width: `${(scanFiles.length / MAX_SCAN_FILES) * 100}%` }}
            />
          </div>

          <div className="scan-strip">
            {scanFiles.map((file, index) => {
              const previewUrl = previewUrls[index];
              const isImage = isImageFile(file);
              const kind = previewKind(file);
              return (
                <div
                  key={`${file.name}-${file.size}-${index}`}
                  className="scan-strip-item"
                  onClick={() => openPreview(file, index)}
                >
                  <div className="scan-strip-thumb">
                    {isImage && previewUrl ? (
                      <img src={previewUrl} alt={file.name} />
                    ) : kind === "pdf" && previewUrl ? (
                      <PdfThumb url={previewUrl} />
                    ) : (
                      <span className="scan-strip-icon">
                        <FileTextOutlined />
                      </span>
                    )}
                    {!scanResult && (
                      <button
                        className="scan-strip-remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(index);
                        }}
                      >
                        <DeleteOutlined style={{ fontSize: 9 }} />
                      </button>
                    )}
                  </div>
                  <Text className="scan-strip-name" ellipsis>
                    {file.name}
                  </Text>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Scan button */}
      {!scanResult && !scanning && scanFiles.length > 0 && (
        <Button
          type="primary"
          icon={<ScanOutlined />}
          onClick={handleScan}
          block
          size="large"
          className="scan-go-btn"
        >
          Start Scan
        </Button>
      )}

      {/* Tips */}
      {!scanResult && !scanning && (
        <>
          <div className="scan-tips">
            <div className="scan-tips-title">
              <BulbOutlined />
              <span>Tips for best results</span>
            </div>
            <ul className="scan-tips-list">
              <li>Ensure text is clearly visible and well-lit</li>
              <li>Avoid blurry or angled photos</li>
              <li>Multi-page docs? Upload all pages together</li>
            </ul>
          </div>

          <button className="scan-batch-link" onClick={() => navigate("/scan/batch")}>
            <ThunderboltOutlined />
            <div>
              <Text strong style={{ fontSize: 13 }}>Batch Scan</Text>
              <Text type="secondary" style={{ display: "block", fontSize: 12 }}>
                Upload up to 20 files — each saved as its own document
              </Text>
            </div>
          </button>
        </>
      )}

      {/* Scanning */}
      {scanning && (
        <div className="scan-analyzing">
          <div className="scan-analyzing-ring">
            <ScanOutlined />
          </div>
          <Text strong className="scan-analyzing-msg">
            {SCAN_MESSAGES[scanMsgIdx]}
          </Text>
          <Text type="secondary" style={{ fontSize: 13 }}>
            This may take a few seconds
          </Text>
        </div>
      )}

      {/* Results */}
      {scanResult && !scanning && (
        <div className="scan-result-wrap surface-card">
          <ScanResultReview
            result={scanResult}
            saving={saving}
            onSave={handleSave}
            onCancel={handleReset}
          />
        </div>
      )}

      {/* Preview modal */}
      <Modal
        open={previewOpen}
        title={activePreview?.name || "Preview"}
        onCancel={() => setPreviewOpen(false)}
        footer={null}
        width="90vw"
        style={{ top: 20 }}
        styles={{ body: { padding: 0, background: "#f8f8f8" } }}
      >
        {activePreview && activePreview.kind === "image" && (
          <div
            style={{
              maxHeight: "80vh",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
              background: "#111",
            }}
          >
            <Image
              src={activePreview.url}
              alt={activePreview.name}
              preview={false}
              style={{ maxWidth: "100%", maxHeight: "76vh", objectFit: "contain" }}
            />
          </div>
        )}
        {activePreview && activePreview.kind !== "image" && (
          <iframe
            title={`Preview - ${activePreview.name}`}
            src={activePreview.url}
            style={{
              width: "100%",
              height: "80vh",
              border: "none",
              display: "block",
              background: "#fff",
            }}
          />
        )}
      </Modal>
    </div>
  );
}
