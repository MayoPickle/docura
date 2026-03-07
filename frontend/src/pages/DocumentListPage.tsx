import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Typography, Input, Empty, Spin, Button, App, Row, Col } from "antd";
import { PlusOutlined, SearchOutlined, FileTextOutlined } from "@ant-design/icons";
import api from "../api/client";
import type { DocumentListItem } from "../types";
import { DOC_TYPE_LABELS, getDocTypeLabel } from "../types";
import DocumentCard from "../components/DocumentCard";
import { defaultDocTypeIconKey, getDocTypeIcon } from "../constants/docTypeIcons";

const { Title } = Typography;

export default function DocumentListPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [docs, setDocs] = useState<DocumentListItem[]>([]);
  const [typeRows, setTypeRows] = useState<
    Array<{
      doc_type: string;
      count: number;
      icon_key?: string | null;
      icon_bg?: string | null;
      icon_fg?: string | null;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const activeType = searchParams.get("type") || "all";

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    api
      .get("/documents/types")
      .then((res) => setTypeRows(res.data || []))
      .catch(() => {
        /* ignore type metadata failure */
      });
  }, []);

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
    const typeMetaMap = new Map(typeRows.map((row) => [row.doc_type, row]));
    const known = Object.entries(DOC_TYPE_LABELS).map(([value, label]) => ({
      value,
      label,
      icon_key: typeMetaMap.get(value)?.icon_key || defaultDocTypeIconKey(value),
      icon_bg: typeMetaMap.get(value)?.icon_bg || null,
      icon_fg: typeMetaMap.get(value)?.icon_fg || null,
    }));
    const knownSet = new Set(known.map((item) => item.value));
    const dynamic = typeRows
      .filter((row) => !knownSet.has(row.doc_type) && row.count > 0)
      .map((row) => row.doc_type)
      .sort()
      .map((value) => ({
        value,
        label: getDocTypeLabel(value),
        icon_key: typeMetaMap.get(value)?.icon_key || defaultDocTypeIconKey(value),
        icon_bg: typeMetaMap.get(value)?.icon_bg || null,
        icon_fg: typeMetaMap.get(value)?.icon_fg || null,
      }));

    return [{ label: "All", value: "all", icon_key: "other", icon_bg: null, icon_fg: null }, ...known, ...dynamic];
  }, [typeRows]);

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
            <span className="filter-pill-icon">
              <span
                className="filter-pill-icon-badge"
                style={{
                  background: opt.icon_bg || undefined,
                  color: opt.icon_fg || undefined,
                }}
              >
                {getDocTypeIcon(opt.icon_key, opt.value)}
              </span>
            </span>
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
