import { useEffect, useMemo, useState } from "react";
import { App, Button, Card, Form, Grid, Input, Modal, Select, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { EditOutlined, TagsOutlined } from "@ant-design/icons";
import api from "../api/client";
import { DOC_TYPE_LABELS, getDocTypeLabel } from "../types";
import { DOC_TYPE_ICON_OPTIONS, defaultDocTypeIconKey, getDocTypeIcon } from "../constants/docTypeIcons";

const { Title, Text } = Typography;

interface DocTypeRow {
  doc_type: string;
  count: number;
  icon_key?: string | null;
  icon_bg?: string | null;
  icon_fg?: string | null;
}

interface RenameForm {
  to_type: string;
  icon_key: string;
  icon_bg?: string;
  icon_fg?: string;
}

const KNOWN_TYPES = Object.keys(DOC_TYPE_LABELS);

export default function DocumentTypesPage() {
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.sm;
  const [rows, setRows] = useState<DocTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [activeType, setActiveType] = useState<DocTypeRow | null>(null);
  const [form] = Form.useForm<RenameForm>();

  const fetchTypes = async () => {
    setLoading(true);
    try {
      const res = await api.get("/documents/types");
      setRows(res.data || []);
    } catch {
      message.error("Failed to load document types");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openRename = (row: DocTypeRow) => {
    setActiveType(row);
    form.setFieldsValue({
      to_type: row.doc_type,
      icon_key: row.icon_key || defaultDocTypeIconKey(row.doc_type),
      icon_bg: row.icon_bg || "",
      icon_fg: row.icon_fg || "",
    });
    setRenameOpen(true);
  };

  const submitRename = async () => {
    try {
      const values = await form.validateFields();
      if (!activeType) {
        return;
      }

      setRenaming(true);
      const res = await api.post("/documents/types/rename", {
        from_type: activeType.doc_type,
        to_type: values.to_type,
        icon_key: values.icon_key,
        icon_bg: (values.icon_bg || "").trim(),
        icon_fg: (values.icon_fg || "").trim(),
      });
      message.success(
        `Saved type "${res.data.to_type}" (${res.data.updated_count} documents updated)`
      );
      setRenameOpen(false);
      setActiveType(null);
      await fetchTypes();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (detail) {
        message.error(detail);
      }
    } finally {
      setRenaming(false);
    }
  };

  const tableRows = useMemo(() => {
    const rowMap = new Map(rows.map((row) => [row.doc_type, row]));
    const knownRows = KNOWN_TYPES.map((docType) => rowMap.get(docType) || { doc_type: docType, count: 0 });
    const knownSet = new Set(KNOWN_TYPES);
    const customRows = rows
      .filter((row) => !knownSet.has(row.doc_type))
      .sort((a, b) => b.count - a.count || a.doc_type.localeCompare(b.doc_type));
    return [...knownRows, ...customRows];
  }, [rows]);

  const columns: ColumnsType<DocTypeRow> = useMemo(
    () => [
      {
        title: "Type",
        dataIndex: "doc_type",
        key: "doc_type",
        render: (value: string, row: DocTypeRow) => (
          <div className="types-type-cell">
            <span className="types-type-icon">
              <span
                className="types-type-icon-badge"
                style={{
                  background: row.icon_bg || undefined,
                  color: row.icon_fg || undefined,
                }}
              >
                {getDocTypeIcon(row.icon_key, value)}
              </span>
            </span>
            <Tag className="types-type-tag">{getDocTypeLabel(value)}</Tag>
            {!isMobile && (
              <Text type="secondary" className="types-type-raw">
                {value}
              </Text>
            )}
          </div>
        ),
      },
      {
        title: isMobile ? "Docs" : "Documents",
        dataIndex: "count",
        key: "count",
        width: isMobile ? 88 : 120,
      },
      {
        title: "Action",
        key: "action",
        width: isMobile ? 104 : 140,
        render: (_: unknown, row: DocTypeRow) => (
          <Button
            icon={<EditOutlined />}
            size="small"
            onClick={() => openRename(row)}
          >
            Edit
          </Button>
        ),
      },
    ],
    [isMobile]
  );

  return (
    <div className="page-shell">
      <Card className="detail-card">
        <div className="types-intro">
          <TagsOutlined style={{ fontSize: 20 }} />
          <Title level={4} style={{ margin: 0 }}>
            Manage Document Types
          </Title>
        </div>
        <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
          Rename types and choose an icon for each category.
        </Text>

        <Table
          className="types-table"
          rowKey="doc_type"
          columns={columns}
          dataSource={tableRows}
          loading={loading}
          pagination={false}
          size={isMobile ? "small" : "middle"}
        />
      </Card>

      <Modal
        open={renameOpen}
        title="Edit Document Type"
        okText="Save"
        confirmLoading={renaming}
        onOk={submitRename}
        onCancel={() => {
          setRenameOpen(false);
          setActiveType(null);
        }}
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item label="Current Type">
            <Input value={activeType?.doc_type || ""} readOnly />
          </Form.Item>
          <Form.Item
            name="to_type"
            label="Type Name"
            rules={[{ required: true, message: "Please enter a new type name" }]}
            extra="Use letters/numbers; spaces will become underscores."
          >
            <Input placeholder="e.g. lca, i983, medical_history" />
          </Form.Item>
          <Form.Item
            name="icon_key"
            label="Icon"
            rules={[{ required: true, message: "Please select an icon" }]}
          >
            <Select
              showSearch
              filterOption={(input, option) =>
                String(option?.searchText || "").includes(input.toLowerCase())
              }
              options={DOC_TYPE_ICON_OPTIONS.map((option) => ({
                value: option.key,
                searchText: option.label.toLowerCase(),
                label: (
                  <span className="types-icon-option">
                    <span className="types-icon-option-mark">{option.icon}</span>
                    {option.label}
                  </span>
                ),
              }))}
            />
          </Form.Item>
          <Form.Item
            name="icon_bg"
            label="Icon Background"
            extra="Optional hex color, e.g. #0f766e"
          >
            <Input placeholder="#0f766e" maxLength={7} />
          </Form.Item>
          <Form.Item
            name="icon_fg"
            label="Icon Foreground"
            extra="Optional hex color, e.g. #ffffff"
          >
            <Input placeholder="#ffffff" maxLength={7} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
