import { useEffect, useMemo, useState } from "react";
import { App, Button, Card, Form, Input, Modal, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { EditOutlined, TagsOutlined } from "@ant-design/icons";
import api from "../api/client";
import { getDocTypeLabel } from "../types";

const { Title, Text } = Typography;

interface DocTypeRow {
  doc_type: string;
  count: number;
}

interface RenameForm {
  to_type: string;
}

export default function DocumentTypesPage() {
  const { message } = App.useApp();
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
    form.setFieldsValue({ to_type: row.doc_type });
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
      });
      message.success(
        `Renamed ${res.data.from_type} -> ${res.data.to_type} (${res.data.updated_count} documents)`
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

  const columns: ColumnsType<DocTypeRow> = useMemo(
    () => [
      {
        title: "Type",
        dataIndex: "doc_type",
        key: "doc_type",
        render: (value: string) => (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Tag style={{ margin: 0, borderRadius: 999 }}>{getDocTypeLabel(value)}</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {value}
            </Text>
          </div>
        ),
      },
      {
        title: "Documents",
        dataIndex: "count",
        key: "count",
        width: 120,
      },
      {
        title: "Action",
        key: "action",
        width: 140,
        render: (_: unknown, row: DocTypeRow) => (
          <Button icon={<EditOutlined />} size="small" onClick={() => openRename(row)}>
            Rename
          </Button>
        ),
      },
    ],
    []
  );

  return (
    <div className="content-container">
      <Card className="detail-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <TagsOutlined style={{ fontSize: 20 }} />
          <Title level={4} style={{ margin: 0 }}>
            Manage Document Types
          </Title>
        </div>
        <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
          Rename a type to update all your documents using that type.
        </Text>

        <Table
          rowKey="doc_type"
          columns={columns}
          dataSource={rows}
          loading={loading}
          pagination={false}
        />
      </Card>

      <Modal
        open={renameOpen}
        title="Rename Document Type"
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
            label="New Type Name"
            rules={[{ required: true, message: "Please enter a new type name" }]}
            extra="Use letters/numbers; spaces will become underscores."
          >
            <Input placeholder="e.g. lca, i983, medical_history" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
