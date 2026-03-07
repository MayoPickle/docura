import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Typography, Input, Empty, Spin, Button, App, Row, Col } from "antd";
import { PlusOutlined, SearchOutlined, FileTextOutlined } from "@ant-design/icons";
import api from "../api/client";
import type { DocumentListItem } from "../types";
import { DOC_TYPE_LABELS, getDocTypeLabel } from "../types";
import DocumentCard from "../components/DocumentCard";

const { Title } = Typography;

export default function DocumentListPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [docs, setDocs] = useState<DocumentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const activeType = searchParams.get("type") || "all";

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (activeType !== "all") {
      params.doc_type = activeType;
    }
    if (debouncedSearch) {
      params.q = debouncedSearch;
    }

    api
      .get("/documents", { params })
      .then((res) => setDocs(res.data))
      .catch(() => message.error("Failed to load documents"))
      .finally(() => setLoading(false));
  }, [activeType, debouncedSearch, message]);

  const filterOptions = useMemo(() => {
    const known = Object.entries(DOC_TYPE_LABELS).map(([value, label]) => ({
      value,
      label,
    }));
    const knownSet = new Set(known.map((item) => item.value));
    const dynamic = Array.from(new Set(docs.map((d) => d.doc_type)))
      .filter((type) => !knownSet.has(type))
      .sort()
      .map((value) => ({
        value,
        label: getDocTypeLabel(value),
      }));

    return [{ label: "All", value: "all" }, ...known, ...dynamic];
  }, [docs]);

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <Title className="page-title" level={3}>
            Documents
          </Title>
          <p className="page-subtitle">Search, filter, and manage all uploaded files.</p>
        </div>
        <div className="page-actions">
          <Button onClick={() => navigate("/types")}>Manage Types</Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate("/documents/new")}
          >
            Add
          </Button>
        </div>
      </div>

      <Input
        className="doc-search"
        prefix={<SearchOutlined style={{ color: "rgba(0,0,0,0.25)" }} />}
        placeholder="Search documents..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        allowClear
      />

      <div className="filter-bar">
        {filterOptions.map((opt) => (
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
        <div className="empty-state">
          <Spin size="large" />
        </div>
      ) : docs.length === 0 ? (
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
          {docs.map((doc) => (
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
