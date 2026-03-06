import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Row, Col, Typography, Button, Spin, App } from "antd";
import {
  CreditCardOutlined,
  BookOutlined,
  GlobalOutlined,
  TrophyOutlined,
  IdcardOutlined,
  CarOutlined,
  FileTextOutlined,
  ProfileOutlined,
  FileOutlined,
  ScanOutlined,
  PlusOutlined,
  RightOutlined,
} from "@ant-design/icons";
import api from "../api/client";
import type { DocumentSummary } from "../types";
import { DOC_TYPE_LABELS, getDocTypeLabel } from "../types";
import { useAuth } from "../contexts/AuthContext";

const { Title, Text } = Typography;

const ICON_MAP: Record<string, React.ReactNode> = {
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

const COLOR_MAP: Record<string, { bg: string; fg: string }> = {
  credit_card: { bg: "#eff6ff", fg: "#3b82f6" },
  passport: { bg: "#f1f5f9", fg: "#64748b" },
  visa: { bg: "#ecfeff", fg: "#0891b2" },
  diploma: { bg: "#fffbeb", fg: "#d97706" },
  id_card: { bg: "#fdf2f8", fg: "#db2777" },
  driver_license: { bg: "#ecfdf5", fg: "#059669" },
  i20: { bg: "#f5f3ff", fg: "#7c3aed" },
  i797: { bg: "#fff7ed", fg: "#ea580c" },
  other: { bg: "#f3f4f6", fg: "#6b7280" },
};

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [summary, setSummary] = useState<DocumentSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/documents/summary")
      .then((res) => setSummary(res.data))
      .catch(() => message.error("Failed to load summary"))
      .finally(() => setLoading(false));
  }, [message]);

  if (loading) {
    return (
      <div className="empty-state">
        <Spin size="large" />
      </div>
    );
  }

  const knownTypes = Object.keys(DOC_TYPE_LABELS);
  const dynamicTypes = Object.keys(summary?.by_type || {}).filter(
    (key) => !knownTypes.includes(key)
  );
  const types = [...knownTypes, ...dynamicTypes];

  return (
    <div className="page-shell">
      <div className="hero-banner">
        <div className="hero-content">
          <Title className="hero-title" level={3}>
            Hi, {user?.name || "there"}
          </Title>
          <p className="hero-copy">
            You have <strong>{summary?.total || 0}</strong> documents stored
            securely.
          </p>
          <div className="hero-actions">
            <Button
              className="hero-action hero-action-primary"
              icon={<ScanOutlined />}
              onClick={() => navigate("/scan")}
            >
              Smart Scan
            </Button>
            <Button
              className="hero-action hero-action-secondary"
              icon={<PlusOutlined />}
              onClick={() => navigate("/documents/new")}
            >
              Add Document
            </Button>
          </div>
        </div>
      </div>

      <div className="section-header">
        <Title level={5} style={{ margin: 0 }}>
          By Category
        </Title>
        <Button type="link" onClick={() => navigate("/documents")}>
          View all <RightOutlined style={{ fontSize: 11 }} />
        </Button>
      </div>

      <Row gutter={[10, 10]}>
        {types.map((t) => {
          const colors = COLOR_MAP[t] || COLOR_MAP.other;
          const count = summary?.by_type[t] || 0;
          return (
            <Col xs={12} sm={8} md={8} lg={6} key={t}>
              <div
                className="stat-card"
                onClick={() => navigate(`/documents?type=${t}`)}
              >
                <div className="stat-card-row">
                  <span
                    className="stat-card-icon"
                    style={{ background: colors.bg, color: colors.fg }}
                  >
                    {ICON_MAP[t] || ICON_MAP.other}
                  </span>
                  <span className="stat-card-count">{count}</span>
                </div>
                <Text className="stat-card-label">{getDocTypeLabel(t)}</Text>
              </div>
            </Col>
          );
        })}
      </Row>
    </div>
  );
}
