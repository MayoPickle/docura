import { Form, Input, Select, Button, Typography } from "antd";
import { CheckCircleOutlined } from "@ant-design/icons";
import type { ScanResult, DocType, KnownDocType } from "../types";
import { DOC_TYPE_LABELS, DOC_TYPE_FIELDS, getDocTypeLabel, toFieldLabel } from "../types";

const { Text } = Typography;

const DOC_TYPE_OPTIONS = Object.entries(DOC_TYPE_LABELS).map(
  ([value, label]) => ({
    value,
    label,
  })
);

interface Props {
  result: ScanResult;
  saving: boolean;
  onSave: (values: Record<string, string>) => void;
  onCancel: () => void;
}

export default function ScanResultReview({
  result,
  saving,
  onSave,
  onCancel,
}: Props) {
  const [form] = Form.useForm();
  const docType = Form.useWatch("doc_type", form) as DocType | undefined;

  const currentDocType = docType || result.doc_type;
  const knownFieldDefs =
    DOC_TYPE_FIELDS[currentDocType as KnownDocType] || DOC_TYPE_FIELDS.other;
  const knownFieldKeys = new Set(knownFieldDefs.map((f) => f.key));
  const dynamicFieldDefs = Object.keys(result.fields || {})
    .filter((key) => !knownFieldKeys.has(key))
    .map((key) => ({ key, label: toFieldLabel(key) }));
  const fieldDefs = [...knownFieldDefs, ...dynamicFieldDefs];

  const initialValues: Record<string, string> = {
    title: result.title,
    doc_type: result.doc_type,
    ...result.fields,
  };

  const docTypeOptions = (() => {
    const base = [...DOC_TYPE_OPTIONS];
    if (!base.some((opt) => opt.value === result.doc_type)) {
      base.unshift({
        value: result.doc_type,
        label: getDocTypeLabel(result.doc_type),
      });
    }
    return base;
  })();

  const pct = Math.round(result.confidence * 100);
  const level =
    pct >= 80 ? "high" : pct >= 50 ? "medium" : "low";

  return (
    <div>
      <div
        style={{
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            padding: "4px 14px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
            background:
              result.method === "openai"
                ? "rgba(24,24,27,0.06)"
                : "rgba(245,158,11,0.08)",
            color:
              result.method === "openai" ? "#18181b" : "#d97706",
          }}
        >
          {result.method === "openai" ? "AI Vision" : "OCR"}
        </div>
        <div className={`confidence-badge confidence-${level}`}>
          <CheckCircleOutlined />
          {pct}% confidence
        </div>
      </div>

      <Form
        form={form}
        layout="vertical"
        initialValues={initialValues}
        onFinish={onSave}
        requiredMark={false}
      >
        <Form.Item
          name="title"
          label="Title"
          rules={[{ required: true, message: "Please enter a title" }]}
        >
          <Input />
        </Form.Item>

        <Form.Item
          name="doc_type"
          label="Document Type"
          rules={[{ required: true }]}
        >
          <Select options={docTypeOptions} />
        </Form.Item>

        <div className="field-group">
          <span className="field-group-label">Extracted Fields</span>
          {fieldDefs.map((f) => (
            <Form.Item key={f.key} name={f.key} label={f.label}>
              <Input placeholder={f.label} />
            </Form.Item>
          ))}
        </div>

        <Form.Item name="notes" label="Notes">
          <Input.TextArea rows={2} placeholder="Optional notes..." />
        </Form.Item>

        <div style={{ display: "flex", gap: 12 }}>
          <Button type="primary" htmlType="submit" loading={saving} block>
            Save Document
          </Button>
          <Button onClick={onCancel} block>
            Cancel
          </Button>
        </div>
      </Form>
    </div>
  );
}
