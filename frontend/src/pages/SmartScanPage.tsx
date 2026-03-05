import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Typography, Card, Upload, Button, Image, App, Modal } from "antd";
import {
  CameraOutlined,
  CloudUploadOutlined,
  ArrowLeftOutlined,
  ScanOutlined,
  DeleteOutlined,
  EyeOutlined,
  FilePdfOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import api from "../api/client";
import type { ScanResult } from "../types";
import ScanResultReview from "../components/ScanResultReview";

const { Title, Text } = Typography;

const MAX_SCAN_FILES = 10;

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function previewKind(file: File): "image" | "pdf" | "other" {
  if (isImageFile(file)) {
    return "image";
  }
  if (isPdfFile(file)) {
    return "pdf";
  }
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

function formatFileType(file: File) {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return "PDF";
  }
  if (file.type.startsWith("text/") || file.name.toLowerCase().endsWith(".txt")) {
    return "Text";
  }
  if (file.type.startsWith("image/")) {
    return "Image";
  }
  return "File";
}

export default function SmartScanPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
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

  useEffect(() => {
    const nextUrls = scanFiles.map((file) => URL.createObjectURL(file));
    setPreviewUrls(nextUrls);
    return () =>
      nextUrls.forEach((url) => {
        URL.revokeObjectURL(url);
      });
  }, [scanFiles]);

  const appendFiles = (incoming: File[]) => {
    if (incoming.length === 0) {
      return;
    }

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
    setScanning(true);

    const formData = new FormData();
    scanFiles.forEach((file) => formData.append("files", file));

    try {
      const res = await api.post("/documents/scan", formData, {
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
        await api.post(`/documents/${docId}/files`, formData, {
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
    setActivePreview({
      url,
      name: file.name,
      kind: previewKind(file),
    });
    setPreviewOpen(true);
  };

  return (
    <div style={{ maxWidth: 620, margin: "0 auto" }}>
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate(-1)}
        className="back-btn"
      >
        Back
      </Button>

      <Title level={3} style={{ marginBottom: 4 }}>
        Smart Scan
      </Title>
      <Text
        type="secondary"
        style={{ display: "block", marginBottom: 24, fontSize: 15 }}
      >
        Upload image, PDF, or text files. AI will combine pages/files and extract
        key information automatically.
      </Text>

      {!scanResult && (
        <div className="scan-dropzone">
          <div className="scan-dropzone-icon">
            <CloudUploadOutlined />
          </div>
          <Title level={5} style={{ margin: "0 0 6px" }}>
            Add document files
          </Title>
          <Text type="secondary" style={{ display: "block", marginBottom: 20 }}>
            Supported: images, PDF, text. Up to {MAX_SCAN_FILES} files.
          </Text>
          <div
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <Upload
              accept="image/*,application/pdf,text/plain,.pdf,.txt"
              multiple
              showUploadList={false}
              beforeUpload={(file) => {
                appendFiles([file]);
                return false;
              }}
            >
              <Button icon={<CloudUploadOutlined />} size="large" type="primary" ghost>
                Upload Files
              </Button>
            </Upload>

            <Button
              icon={<CameraOutlined />}
              size="large"
              onClick={() => cameraInputRef.current?.click()}
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
        </div>
      )}

      {scanFiles.length > 0 && (
        <Card className="detail-card" style={{ marginBottom: 16 }} styles={{ body: { padding: 12 } }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <Text strong>
              Selected files: {scanFiles.length}/{MAX_SCAN_FILES}
            </Text>
            {!scanResult && (
              <Button type="link" danger onClick={handleReset} style={{ padding: 0 }}>
                Clear All
              </Button>
            )}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
              gap: 10,
            }}
          >
            {scanFiles.map((file, index) => {
              const previewUrl = previewUrls[index];
              const isImage = isImageFile(file);
              const isPdf = isPdfFile(file);
              return (
                <div
                  key={`${file.name}-${file.size}-${index}`}
                  style={{
                    border: "1px solid rgba(0,0,0,0.08)",
                    borderRadius: 10,
                    overflow: "hidden",
                    background: "#fff",
                  }}
                >
                  <div style={{ height: 160, background: "#f7f7f7", position: "relative" }}>
                    {isImage && previewUrl ? (
                      <Image
                        src={previewUrl}
                        alt={file.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : isPdf && previewUrl ? (
                      <iframe
                        title={`PDF preview ${file.name}`}
                        src={`${previewUrl}#toolbar=0&navpanes=0`}
                        style={{
                          width: "100%",
                          height: "100%",
                          border: "none",
                          background: "#fff",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 28,
                          color: "rgba(0,0,0,0.45)",
                        }}
                      >
                        {formatFileType(file) === "PDF" ? <FilePdfOutlined /> : <FileTextOutlined />}
                      </div>
                    )}
                    {!scanResult && (
                      <Button
                        type="primary"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={() => removeFile(index)}
                        style={{
                          position: "absolute",
                          top: 6,
                          right: 6,
                          borderRadius: 999,
                        }}
                      />
                    )}
                  </div>
                  <div style={{ padding: "8px 10px" }}>
                    <Text ellipsis style={{ display: "block", fontSize: 12 }}>
                      {file.name}
                    </Text>
                    <div
                      style={{
                        marginTop: 4,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {formatFileType(file)}
                      </Text>
                      <Button
                        type="link"
                        size="small"
                        icon={<EyeOutlined />}
                        style={{ padding: 0, height: "auto" }}
                        onClick={() => openPreview(file, index)}
                      >
                        Preview
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {!scanResult && !scanning && scanFiles.length > 0 && (
        <Card className="detail-card" style={{ marginBottom: 16 }}>
          <Button type="primary" icon={<ScanOutlined />} onClick={handleScan} block>
            Start Smart Scan
          </Button>
        </Card>
      )}

      {scanning && (
        <Card className="detail-card" styles={{ body: { padding: 0 } }}>
          <div className="scan-pulse">
            <div className="scan-pulse-ring">
              <ScanOutlined />
            </div>
            <div style={{ textAlign: "center" }}>
              <Text strong style={{ display: "block", marginBottom: 4 }}>
                Analyzing your document...
              </Text>
              <Text type="secondary" style={{ fontSize: 13 }}>
                This may take a few seconds
              </Text>
            </div>
          </div>
        </Card>
      )}

      {scanResult && !scanning && (
        <Card className="detail-card">
          <ScanResultReview
            result={scanResult}
            saving={saving}
            onSave={handleSave}
            onCancel={handleReset}
          />
        </Card>
      )}

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
