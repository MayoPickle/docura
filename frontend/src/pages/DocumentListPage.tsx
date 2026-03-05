import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Typography, Input, Empty, Spin, Button, App, Row, Col } from "antd";
import { PlusOutlined, SearchOutlined, FileTextOutlined } from "@ant-design/icons";
import api from "../api/client";
import type { DocumentListItem, DocType } from "../types";
import { DOC_TYPE_LABELS } from "../types";
import DocumentCard from "../components/DocumentCard";

const { Title } = Typography;

const FILTER_OPTIONS = [
  { label: "All", value: "all" },
  ...Object.entries(DOC_TYPE_LABELS).map(([value, label]) => ({
    label,
    value,
  })),
];

export default function DocumentListPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [docs, setDocs] = useState<DocumentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const activeType = searchParams.get("type") || "all";

  useEffect(() => {
    setLoading(true);
    const params = activeType !== "all" ? { doc_type: activeType } : {};
    api
      .get("/documents", { params })
      .then((res) => setDocs(res.data))
      .catch(() => message.error("Failed to load documents"))
      .finally(() => setLoading(false));
  }, [activeType, message]);

  const filtered = search
    ? docs.filter((d) =>
        d.title.toLowerCase().includes(search.toLowerCase())
      )
    : docs;

  return (
    <div className="content-container">
      <div className="section-header">
        <Title level={3} style={{ margin: 0 }}>
          Documents
        </Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => navigate("/documents/new")}
        >
          Add
        </Button>
      </div>

      <Input
        prefix={<SearchOutlined style={{ color: "rgba(0,0,0,0.25)" }} />}
        placeholder="Search documents..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        allowClear
        style={{ marginBottom: 16, borderRadius: 999, height: 42 }}
      />

      <div className="filter-bar">
        {FILTER_OPTIONS.map((opt) => (
          <div
            key={opt.value}
            className={`filter-pill ${activeType === opt.value ? "active" : ""}`}
            onClick={() => {
              if (opt.value === "all") {
                setSearchParams({});
              } else {
                setSearchParams({ type: opt.value });
              }
            }}
          >
            {opt.label}
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", paddingTop: 60 }}>
          <Spin size="large" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <FileTextOutlined />
          </div>
          <Title level={5} style={{ marginBottom: 4 }}>
            {search ? "No results found" : "No documents yet"}
          </Title>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              search
                ? `No documents matching "${search}"`
                : "Start by adding your first document"
            }
            style={{ marginTop: 0 }}
          >
            {!search && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => navigate("/documents/new")}
              >
                Add Your First Document
              </Button>
            )}
          </Empty>
        </div>
      ) : (
        <Row gutter={[12, 12]}>
          {filtered.map((doc) => (
            <Col xs={24} sm={12} key={doc.id}>
              <DocumentCard
                doc={doc}
                onClick={() => navigate(`/documents/${doc.id}`)}
              />
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}
