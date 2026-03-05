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
  FileOutlined,
  ScanOutlined,
  PlusOutlined,
  RightOutlined,
} from "@ant-design/icons";
import api from "../api/client";
import type { DocumentSummary, DocType } from "../types";
import { DOC_TYPE_LABELS } from "../types";
import { useAuth } from "../contexts/AuthContext";

const { Title, Text } = Typography;

const ICON_MAP: Record<string, React.ReactNode> = {
  credit_card: <CreditCardOutlined />,
  passport: <BookOutlined />,
  visa: <GlobalOutlined />,
  diploma: <TrophyOutlined />,
  id_card: <IdcardOutlined />,
  driver_license: <CarOutlined />,
  other: <FileOutlined />,
};

const GRADIENT_MAP: Record<string, string> = {
  credit_card: "linear-gradient(135deg, #3b82f6, #60a5fa)",
  passport: "linear-gradient(135deg, #334155, #475569)",
  visa: "linear-gradient(135deg, #06b6d4, #3b82f6)",
  diploma: "linear-gradient(135deg, #f59e0b, #ef4444)",
  id_card: "linear-gradient(135deg, #ec4899, #f472b6)",
  driver_license: "linear-gradient(135deg, #10b981, #06b6d4)",
  other: "linear-gradient(135deg, #6b7280, #9ca3af)",
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
      <div style={{ textAlign: "center", paddingTop: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  const types = Object.keys(DOC_TYPE_LABELS) as DocType[];

  return (
    <div className="content-container">
      <div className="hero-banner">
        <div style={{ position: "relative", zIndex: 1 }}>
          <Title level={3}>
            Hi, {user?.name || "there"}
          </Title>
          <p style={{ fontSize: 15, margin: "4px 0 20px" }}>
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
        <Button
          type="link"
          onClick={() => navigate("/documents")}
          style={{ fontWeight: 500, padding: 0 }}
        >
          View all <RightOutlined style={{ fontSize: 11 }} />
        </Button>
      </div>

      <Row gutter={[12, 12]}>
        {types.map((t) => (
          <Col xs={12} sm={8} md={8} lg={6} key={t}>
            <div
              className="stat-card"
              onClick={() => navigate(`/documents?type=${t}`)}
              style={{
                background: "#fff",
                borderRadius: 16,
                padding: 20,
                cursor: "pointer",
              }}
            >
              <div
                className="stat-card-icon"
                style={{ background: GRADIENT_MAP[t], marginBottom: 14 }}
              >
                {ICON_MAP[t]}
              </div>
              <Text
                type="secondary"
                style={{ fontSize: 12, display: "block", marginBottom: 2 }}
              >
                {DOC_TYPE_LABELS[t]}
              </Text>
              <Text
                strong
                style={{ fontSize: 24, lineHeight: 1.2, letterSpacing: -0.5 }}
              >
                {summary?.by_type[t] || 0}
              </Text>
            </div>
          </Col>
        ))}
      </Row>
    </div>
  );
}
