import { Tag, Typography } from "antd";
import {
  PaperClipOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import type { DocumentListItem } from "../types";
import { getDocTypeLabel } from "../types";
import { getDocTypeIcon } from "../constants/docTypeIcons";
import dayjs from "dayjs";

const { Text } = Typography;

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
    <div className="doc-card" onClick={onClick}>
      <div className="doc-card-head">
        <div
          className="doc-card-icon"
          style={{
            background: doc.doc_type_icon_bg || BG_MAP[doc.doc_type] || BG_MAP.other,
            color: doc.doc_type_icon_fg || "#fff",
          }}
        >
          {getDocTypeIcon(doc.doc_type_icon_key, doc.doc_type)}
        </div>
        <div className="doc-card-content">
          <Text className="doc-card-title" strong ellipsis>
            {doc.title}
          </Text>
          <div className="doc-card-meta">
            <Tag
              color={COLOR_MAP[doc.doc_type] || "default"}
              style={{ borderRadius: 999, margin: 0, fontSize: 11 }}
            >
              {getDocTypeLabel(doc.doc_type)}
            </Tag>
            {doc.file_count > 0 && (
              <Text className="doc-meta-item" type="secondary">
                <PaperClipOutlined /> {doc.file_count}
              </Text>
            )}
            <Text className="doc-meta-item" type="secondary">
              <ClockCircleOutlined style={{ marginRight: 3 }} />
              {dayjs(doc.updated_at).format("MMM D, YYYY")}
            </Text>
          </div>
        </div>
      </div>
    </div>
  );
}
