import { Tag, Typography } from "antd";
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
  PaperClipOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import type { DocumentListItem } from "../types";
import { getDocTypeLabel } from "../types";
import dayjs from "dayjs";

const { Text } = Typography;

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

const COLOR_MAP: Record<string, string> = {
  credit_card: "blue",
  passport: "default",
  visa: "cyan",
  diploma: "gold",
  id_card: "magenta",
  driver_license: "green",
  i20: "purple",
  i797: "orange",
  other: "default",
};

const BG_MAP: Record<string, string> = {
  credit_card: "linear-gradient(135deg, #3b82f6, #60a5fa)",
  passport: "linear-gradient(135deg, #334155, #475569)",
  visa: "linear-gradient(135deg, #06b6d4, #3b82f6)",
  diploma: "linear-gradient(135deg, #f59e0b, #ef4444)",
  id_card: "linear-gradient(135deg, #ec4899, #f472b6)",
  driver_license: "linear-gradient(135deg, #10b981, #06b6d4)",
  i20: "linear-gradient(135deg, #8b5cf6, #6366f1)",
  i797: "linear-gradient(135deg, #f97316, #ea580c)",
  other: "linear-gradient(135deg, #6b7280, #9ca3af)",
};

interface Props {
  doc: DocumentListItem;
  onClick: () => void;
}

export default function DocumentCard({ doc, onClick }: Props) {
  return (
    <div className="doc-card" onClick={onClick} style={{ background: "#fff", padding: 20, cursor: "pointer" }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: BG_MAP[doc.doc_type] || BG_MAP.other,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          {ICON_MAP[doc.doc_type]}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text strong ellipsis style={{ fontSize: 15, display: "block", marginBottom: 6 }}>
            {doc.title}
          </Text>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Tag
              color={COLOR_MAP[doc.doc_type] || "default"}
              style={{ borderRadius: 999, margin: 0, fontSize: 11 }}
            >
              {getDocTypeLabel(doc.doc_type)}
            </Tag>
            {doc.file_count > 0 && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                <PaperClipOutlined /> {doc.file_count}
              </Text>
            )}
            <Text type="secondary" style={{ fontSize: 12 }}>
              <ClockCircleOutlined style={{ marginRight: 3 }} />
              {dayjs(doc.updated_at).format("MMM D, YYYY")}
            </Text>
          </div>
        </div>
      </div>
    </div>
  );
}
