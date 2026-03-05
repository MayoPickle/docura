import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Typography,
  Card,
  Descriptions,
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
  FileOutlined,
} from "@ant-design/icons";
import type { UploadProps } from "antd";
import api from "../api/client";
import type { Document, DocType } from "../types";
import { DOC_TYPE_LABELS, DOC_TYPE_FIELDS } from "../types";
import dayjs from "dayjs";

const { Title, Text } = Typography;

function isImage(contentType: string) {
  return contentType.startsWith("image/");
}

function fileUrl(fileId: number) {
  const token = localStorage.getItem("token");
  return `/api/files/${fileId}?token=${encodeURIComponent(token || "")}`;
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

  const fieldDefs =
    DOC_TYPE_FIELDS[doc.doc_type as DocType] || DOC_TYPE_FIELDS.other;

  const imageFiles = doc.files.filter((f) => isImage(f.content_type));
  const otherFiles = doc.files.filter((f) => !isImage(f.content_type));

  return (
    <div className="content-container">
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate("/documents")}
        className="back-btn"
      >
        Back to Documents
      </Button>

      <Card
        className="detail-card"
        title={
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              paddingTop: 4,
            }}
          >
            <Title level={4} style={{ margin: 0 }}>
              {doc.title}
            </Title>
            <Tag
              style={{ borderRadius: 999, fontWeight: 500, fontSize: 12 }}
            >
              {DOC_TYPE_LABELS[doc.doc_type as DocType] || doc.doc_type}
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
        <Descriptions
          column={{ xs: 1, sm: 2 }}
          size="small"
          labelStyle={{ fontWeight: 500, color: "rgba(0,0,0,0.45)" }}
          contentStyle={{ fontWeight: 500 }}
        >
          {fieldDefs.map((f) =>
            fields[f.key] ? (
              <Descriptions.Item key={f.key} label={f.label}>
                {fields[f.key]}
              </Descriptions.Item>
            ) : null
          )}
        </Descriptions>

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

        <div
          style={{
            marginTop: 16,
            display: "flex",
            gap: 16,
            fontSize: 12,
            color: "rgba(0,0,0,0.4)",
          }}
        >
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
                              href={fileUrl(file.id)}
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
                      href={fileUrl(file.id)}
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
