import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Typography, Card, Upload, Button, Image, App } from "antd";
import {
  CameraOutlined,
  CloudUploadOutlined,
  ArrowLeftOutlined,
  ScanOutlined,
} from "@ant-design/icons";
import api from "../api/client";
import type { ScanResult } from "../types";
import ScanResultReview from "../components/ScanResultReview";

const { Title, Text } = Typography;

export default function SmartScanPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);

  const handleFile = async (file: File) => {
    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setScanResult(null);
    setScanning(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await api.post("/documents/scan", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setScanResult(res.data);
    } catch {
      message.error("Failed to scan document. Please try again.");
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

      if (imageFile) {
        const formData = new FormData();
        formData.append("file", imageFile);
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
    setPreviewUrl(null);
    setImageFile(null);
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
        Upload or take a photo of your document. AI will automatically recognize
        the type and extract information.
      </Text>

      {!previewUrl && (
        <div className="scan-dropzone">
          <div className="scan-dropzone-icon">
            <CloudUploadOutlined />
          </div>
          <Title level={5} style={{ margin: "0 0 6px" }}>
            Drop your document here
          </Title>
          <Text type="secondary" style={{ display: "block", marginBottom: 20 }}>
            or choose one of the options below
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
              accept="image/*"
              showUploadList={false}
              beforeUpload={(file) => {
                handleFile(file);
                return false;
              }}
            >
              <Button
                icon={<CloudUploadOutlined />}
                size="large"
                type="primary"
                ghost
              >
                Upload Image
              </Button>
            </Upload>

            <Button
              icon={<CameraOutlined />}
              size="large"
              onClick={() => fileInputRef.current?.click()}
            >
              Take Photo
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>
        </div>
      )}

      {previewUrl && (
        <Card
          className="detail-card"
          style={{ marginBottom: 16 }}
          styles={{ body: { padding: 12 } }}
        >
          <Image
            src={previewUrl}
            alt="Document preview"
            style={{
              width: "100%",
              borderRadius: 10,
              maxHeight: 300,
              objectFit: "contain",
            }}
          />
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

      {!scanResult && !scanning && previewUrl && (
        <Card className="detail-card" style={{ textAlign: "center", padding: "32px 20px" }}>
          <div className="empty-state-icon" style={{ marginBottom: 16 }}>
            <ScanOutlined />
          </div>
          <Title level={5} style={{ marginBottom: 4 }}>
            Scan Failed
          </Title>
          <Text type="secondary" style={{ display: "block", marginBottom: 20 }}>
            Could not recognize the document. Try a clearer image.
          </Text>
          <Button type="primary" onClick={handleReset}>
            Try Again
          </Button>
        </Card>
      )}
    </div>
  );
}
