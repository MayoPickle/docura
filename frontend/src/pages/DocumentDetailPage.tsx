import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
  UploadOutlined,
  DownloadOutlined,
  ArrowLeftOutlined,
  PaperClipOutlined,
  CalendarOutlined,
  EyeOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  CreditCardOutlined,
  BookOutlined,
  GlobalOutlined,
  TrophyOutlined,
  IdcardOutlined,
  CarOutlined,
  FileTextOutlined,
  ProfileOutlined,
  FileOutlined,
} from "@ant-design/icons";
import type { UploadProps } from "antd";
import api from "../api/client";
import type { Document, KnownDocType } from "../types";
import { DOC_TYPE_FIELDS, getDocTypeLabel, toFieldLabel } from "../types";
import dayjs from "dayjs";

const { Title, Text } = Typography;

const DOC_TYPE_ICON_MAP: Record<string, React.ReactNode> = {
  credit_card: <CreditCardOutlined />,
  passport: <BookOutlined />,
  visa: <GlobalOutlined />,
  diploma: <TrophyOutlined />,
  id_card: <IdcardOutlined />,
  driver_license: <CarOutlined />,
  i20: <FileTextOutlined />,
  i797: <ProfileOutlined />,
  other: <FileOutlined />,
};

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

export default function DocumentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);

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
        navigate("/documents", { replace: true });
      },
    });
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
        message.error("Upload failed");
      }
    },
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", paddingTop: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div style={{ textAlign: "center", paddingTop: 80 }}>
        Document not found
      </div>
    );
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
    <div className="content-container doc-detail-page">
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate("/documents")}
        className="back-btn"
      >
        Back to Documents
      </Button>

      <Card
        className="detail-card document-info-card"
        title={
          <div className="detail-title-row">
            <Title level={4} className="detail-title">
              {doc.title}
            </Title>
            <Tag
              className="doc-type-tag"
              style={{ borderRadius: 999, fontWeight: 500, fontSize: 12 }}
            >
              <span className="doc-type-tag-icon">
                {DOC_TYPE_ICON_MAP[doc.doc_type] || <FileOutlined />}
              </span>
              {getDocTypeLabel(doc.doc_type)}
            </Tag>
          </div>
        }
        extra={
          <Space>
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
                fontWeight: 500,
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

      <Card
        className="detail-card"
        title={
          <span style={{ fontWeight: 600 }}>
            <PaperClipOutlined style={{ marginRight: 8 }} />
            Attachments ({doc.files.length})
          </span>
        }
        extra={
          <Upload {...uploadProps}>
            <Button icon={<UploadOutlined />} type="primary" ghost>
              Upload
            </Button>
          </Upload>
        }
      >
        {doc.files.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <Text type="secondary">No attachments yet</Text>
          </div>
        ) : (
          <>
            {imageFiles.length > 0 && (
              <div style={{ marginBottom: otherFiles.length > 0 ? 16 : 0 }}>
                <Image.PreviewGroup>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(140px, 1fr))",
                      gap: 10,
                    }}
                  >
                    {imageFiles.map((file) => (
                      <div key={file.id} style={{ position: "relative" }}>
                        <div
                          style={{
                            borderRadius: 10,
                            overflow: "hidden",
                            border: "1px solid rgba(0,0,0,0.06)",
                            background: "#fafafa",
                          }}
                        >
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
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginTop: 6,
                            padding: "0 2px",
                          }}
                        >
                          <Text
                            ellipsis
                            style={{ fontSize: 12, flex: 1, minWidth: 0 }}
                          >
                            {file.filename}
                          </Text>
                          <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
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
                  style={{ display: "block", marginBottom: 8, fontSize: 12, fontWeight: 600 }}
                >
                  PDF Preview
                </Text>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {pdfFiles.map((file) => (
                    <div
                      key={file.id}
                      style={{
                        border: "1px solid rgba(0,0,0,0.08)",
                        borderRadius: 12,
                        overflow: "hidden",
                        background: "#fff",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 12px",
                          borderBottom: "1px solid rgba(0,0,0,0.06)",
                          background: "#fafafa",
                        }}
                      >
                        <FilePdfOutlined style={{ fontSize: 18, color: "#d92d20" }} />
                        <Text ellipsis style={{ flex: 1, fontWeight: 500 }}>
                          {file.filename}
                        </Text>
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
                      <iframe
                        title={`PDF Preview - ${file.filename}`}
                        src={fileUrl(file.id)}
                        style={{
                          width: "100%",
                          height: 460,
                          border: "none",
                          display: "block",
                          background: "#fff",
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {otherFiles.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {otherFiles.map((file) => (
                  <div
                    key={file.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid rgba(0,0,0,0.06)",
                      background: "#fafafa",
                    }}
                  >
                    {isImage(file.content_type) ? (
                      <FileImageOutlined
                        style={{ fontSize: 18, color: "rgba(0,0,0,0.3)" }}
                      />
                    ) : (
                      <FileOutlined
                        style={{ fontSize: 18, color: "rgba(0,0,0,0.3)" }}
                      />
                    )}
                    <Text ellipsis style={{ flex: 1, fontWeight: 500 }}>
                      {file.filename}
                    </Text>
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
                ))}
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
