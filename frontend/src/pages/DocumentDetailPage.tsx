import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  Typography,
  Card,
  Tag,
  Button,
  Spin,
  Upload,
  Popconfirm,
  App,
  Space,
  Image,
} from "antd";
import {
  EditOutlined,
  DeleteOutlined,
  DownloadOutlined,
  ArrowLeftOutlined,
  PaperClipOutlined,
  CalendarOutlined,
  EyeOutlined,
  FileImageOutlined,
  FileOutlined,
  FilePdfOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import type { UploadProps } from "antd";
import api from "../api/client";
import type { Document, KnownDocType } from "../types";
import { DOC_TYPE_FIELDS, getDocTypeLabel, toFieldLabel } from "../types";
import { getDocTypeIcon } from "../constants/docTypeIcons";
import dayjs from "dayjs";

const { Title, Text } = Typography;

function isImage(contentType: string) {
  return contentType.startsWith("image/");
}

function isPdf(contentType: string, filename: string) {
  if (contentType === "application/pdf") {
    return true;
  }
  return filename.toLowerCase().endsWith(".pdf");
}

function fileUrl(fileId: number, download = false) {
  const token = localStorage.getItem("token");
  const params = new URLSearchParams();
  params.set("token", token || "");
  if (download) {
    params.set("download", "1");
  }
  return `/api/files/${fileId}?${params.toString()}`;
}

interface DetailNavState {
  source?: "batch-scan";
}

export default function DocumentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { message, modal } = App.useApp();
  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const navState = (location.state as DetailNavState | null) ?? null;
  const fromBatchScan = navState?.source === "batch-scan";

  const fetchDoc = () => {
    setLoading(true);
    api
      .get(`/documents/${id}`)
      .then((res) => setDoc(res.data))
      .catch(() => message.error("Failed to load document"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDoc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleDelete = () => {
    modal.confirm({
      title: "Delete this document?",
      content: "This action cannot be undone.",
      okText: "Delete",
      okButtonProps: { danger: true },
      onOk: async () => {
        await api.delete(`/documents/${id}`);
        message.success("Document deleted");
        navigate(fromBatchScan ? "/scan/batch" : "/documents", { replace: true });
      },
    });
  };

  const handleBack = () => {
    if (fromBatchScan) {
      navigate("/scan/batch", { replace: true });
      return;
    }

    const historyIndex =
      typeof window.history.state?.idx === "number"
        ? window.history.state.idx
        : 0;
    if (historyIndex > 0) {
      navigate(-1);
      return;
    }
    navigate("/documents", { replace: true });
  };

  const handleDeleteFile = async (fileId: number) => {
    await api.delete(`/files/${fileId}`);
    message.success("File deleted");
    fetchDoc();
  };

  const uploadProps: UploadProps = {
    name: "file",
    action: `/api/documents/${id}/files`,
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
    showUploadList: false,
    onChange(info) {
      if (info.file.status === "done") {
        message.success("File uploaded");
        fetchDoc();
      } else if (info.file.status === "error") {
        const detail = (info.file.response as any)?.detail;
        const statusCode = (info.file.error as any)?.status || (info.file.xhr as any)?.status;
        const isDuplicate =
          statusCode === 409 || (typeof detail === "object" && detail?.code === "DUPLICATE_FILE");
        if (isDuplicate) {
          message.warning(`"${info.file.name}" already exists in your documents.`);
          return;
        }

        const detailMessage =
          typeof detail === "string"
            ? detail
            : typeof detail?.message === "string"
              ? detail.message
              : "";
        message.error(detailMessage || "Upload failed");
      }
    },
  };

  if (loading) {
    return (
      <div className="empty-state">
        <Spin size="large" />
      </div>
    );
  }

  if (!doc) {
    return <div className="empty-state">Document not found</div>;
  }

  let fields: Record<string, string> = {};
  try {
    fields = JSON.parse(doc.fields_json);
  } catch {
    /* empty */
  }

  const knownFieldDefs =
    DOC_TYPE_FIELDS[doc.doc_type as KnownDocType] || DOC_TYPE_FIELDS.other;
  const knownFieldKeys = new Set(knownFieldDefs.map((f) => f.key));
  const extraFieldDefs = Object.keys(fields)
    .filter((key) => !knownFieldKeys.has(key))
    .map((key) => ({ key, label: toFieldLabel(key) }));
  const fieldDefs = [...knownFieldDefs, ...extraFieldDefs];
  const fieldEntries = fieldDefs
    .map((f) => ({
      key: f.key,
      label: f.label,
      value: fields[f.key]?.toString().trim(),
    }))
    .filter((f) => Boolean(f.value));

  const imageFiles = doc.files.filter((f) => isImage(f.content_type));
  const pdfFiles = doc.files.filter((f) => !isImage(f.content_type) && isPdf(f.content_type, f.filename));
  const otherFiles = doc.files.filter(
    (f) => !isImage(f.content_type) && !isPdf(f.content_type, f.filename)
  );

  return (
    <div className="page-shell page-shell-wide">
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={handleBack}
        className="back-btn"
      >
        {fromBatchScan ? "Back to Batch Scan" : "Back to Documents"}
      </Button>

      <Card
        className="detail-card document-info-card"
        title={
          <div className="detail-title-row">
            <Title level={4} className="detail-title">
              {doc.title}
            </Title>
            <Tag className="doc-type-tag">
              <span
                className="doc-type-tag-icon"
                style={{
                  background: doc.doc_type_icon_bg || undefined,
                  color: doc.doc_type_icon_fg || undefined,
                }}
              >
                {getDocTypeIcon(doc.doc_type_icon_key, doc.doc_type)}
              </span>
              {getDocTypeLabel(doc.doc_type)}
            </Tag>
          </div>
        }
        extra={
          <Space wrap>
            <Button
              icon={<EditOutlined />}
              onClick={() => navigate(`/documents/${id}/edit`)}
            >
              Edit
            </Button>
            <Button icon={<DeleteOutlined />} danger onClick={handleDelete}>
              Delete
            </Button>
          </Space>
        }
      >
        {fieldEntries.length > 0 ? (
          <div className="doc-fields-grid">
            {fieldEntries.map((field) => (
              <div key={field.key} className="doc-field-item">
                <Text className="doc-field-label">{field.label}</Text>
                <div className="doc-field-value">{field.value}</div>
              </div>
            ))}
          </div>
        ) : (
          <Text type="secondary">No extracted fields</Text>
        )}

        {doc.notes && (
          <div className="notes-block">
            <Text
              type="secondary"
              style={{
                fontSize: 12,
                fontWeight: 600,
                display: "block",
                marginBottom: 4,
              }}
            >
              Notes
            </Text>
            <Text>{doc.notes}</Text>
          </div>
        )}

        <div className="detail-meta">
          <span>
            <CalendarOutlined style={{ marginRight: 4 }} />
            Created {dayjs(doc.created_at).format("MMM D, YYYY")}
          </span>
          <span>
            <CalendarOutlined style={{ marginRight: 4 }} />
            Updated {dayjs(doc.updated_at).format("MMM D, YYYY")}
          </span>
        </div>
      </Card>

      <Card className="detail-card">
        <div className="attachment-header">
          <span style={{ fontWeight: 700 }}>
            <PaperClipOutlined className="card-title-icon" />
            Attachments ({doc.files.length})
          </span>
          <Upload {...uploadProps}>
            <Button icon={<UploadOutlined />} type="primary" ghost>
              Upload
            </Button>
          </Upload>
        </div>

        {doc.files.length === 0 ? (
          <div className="attachment-empty">
            <Text type="secondary">No attachments yet</Text>
          </div>
        ) : (
          <>
            {imageFiles.length > 0 && (
              <div style={{ marginBottom: pdfFiles.length > 0 || otherFiles.length > 0 ? 12 : 0 }}>
                <Image.PreviewGroup>
                  <div className="image-grid">
                    {imageFiles.map((file) => (
                      <div key={file.id} className="image-file-card">
                        <div className="image-file-thumb">
                          <Image
                            src={fileUrl(file.id)}
                            alt={file.filename}
                            style={{
                              width: "100%",
                              height: 120,
                              objectFit: "cover",
                              display: "block",
                            }}
                            preview={{
                              mask: (
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                    fontSize: 13,
                                  }}
                                >
                                  <EyeOutlined /> Preview
                                </div>
                              ),
                            }}
                          />
                        </div>

                        <div className="image-file-meta">
                          <Text ellipsis style={{ fontSize: 12, flex: 1, minWidth: 0 }}>
                            {file.filename}
                          </Text>
                          <div className="image-file-actions">
                            <Button
                              type="text"
                              size="small"
                              icon={<DownloadOutlined />}
                              href={fileUrl(file.id, true)}
                              target="_blank"
                              style={{ fontSize: 12, padding: "0 4px" }}
                            />
                            <Popconfirm
                              title="Delete this file?"
                              onConfirm={() => handleDeleteFile(file.id)}
                            >
                              <Button
                                type="text"
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                                style={{ fontSize: 12, padding: "0 4px" }}
                              />
                            </Popconfirm>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Image.PreviewGroup>
              </div>
            )}

            {pdfFiles.length > 0 && (
              <div style={{ marginBottom: otherFiles.length > 0 ? 12 : 0 }}>
                <Text
                  type="secondary"
                  style={{ display: "block", marginBottom: 8, fontSize: 12, fontWeight: 700 }}
                >
                  PDF Preview
                </Text>
                <div className="pdf-list">
                  {pdfFiles.map((file) => (
                    <div key={file.id} className="pdf-item">
                      <div className="pdf-item-head">
                        <FilePdfOutlined style={{ fontSize: 18, color: "#b42318" }} />
                        <Text ellipsis style={{ fontWeight: 600 }}>
                          {file.filename}
                        </Text>
                        <div className="pdf-item-actions">
                          <Button
                            type="link"
                            size="small"
                            icon={<EyeOutlined />}
                            href={fileUrl(file.id)}
                            target="_blank"
                          >
                            Open
                          </Button>
                          <Button
                            type="link"
                            size="small"
                            icon={<DownloadOutlined />}
                            href={fileUrl(file.id, true)}
                            target="_blank"
                          >
                            Download
                          </Button>
                          <Popconfirm
                            title="Delete this file?"
                            onConfirm={() => handleDeleteFile(file.id)}
                          >
                            <Button
                              type="link"
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                            >
                              Delete
                            </Button>
                          </Popconfirm>
                        </div>
                      </div>
                      <iframe
                        title={`PDF Preview - ${file.filename}`}
                        src={fileUrl(file.id)}
                        className="pdf-preview"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {otherFiles.length > 0 && (
              <div className="generic-file-list">
                {otherFiles.map((file) => (
                  <div key={file.id} className="generic-file-row">
                    <div className="generic-file-head">
                      {isImage(file.content_type) ? (
                        <FileImageOutlined style={{ fontSize: 18, color: "rgba(0,0,0,0.35)" }} />
                      ) : (
                        <FileOutlined style={{ fontSize: 18, color: "rgba(0,0,0,0.35)" }} />
                      )}
                      <Text ellipsis style={{ fontWeight: 600 }}>
                        {file.filename}
                      </Text>
                      <div className="generic-file-actions">
                        <Button
                          type="link"
                          size="small"
                          icon={<DownloadOutlined />}
                          href={fileUrl(file.id, true)}
                          target="_blank"
                        >
                          Download
                        </Button>
                        <Popconfirm
                          title="Delete this file?"
                          onConfirm={() => handleDeleteFile(file.id)}
                        >
                          <Button
                            type="link"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                          >
                            Delete
                          </Button>
                        </Popconfirm>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
