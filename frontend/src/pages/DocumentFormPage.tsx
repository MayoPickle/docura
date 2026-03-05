import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Typography,
  Card,
  Form,
  Input,
  Select,
  Button,
  Spin,
  App,
} from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import api from "../api/client";
import type { DocType, KnownDocType } from "../types";
import { DOC_TYPE_LABELS, DOC_TYPE_FIELDS, getDocTypeLabel, toFieldLabel } from "../types";

const { Title, Text } = Typography;
const { TextArea } = Input;

const DOC_TYPE_OPTIONS = Object.entries(DOC_TYPE_LABELS).map(
  ([value, label]) => ({
    value,
    label,
  })
);

export default function DocumentFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [docType, setDocType] = useState<DocType>("other");
  const [customFieldKeys, setCustomFieldKeys] = useState<string[]>([]);

  const isEdit = !!id;

  useEffect(() => {
    if (isEdit) {
      setLoading(true);
      api
        .get(`/documents/${id}`)
        .then((res) => {
          const doc = res.data;
          let fields: Record<string, string> = {};
          try {
            fields = JSON.parse(doc.fields_json);
          } catch {
            /* empty */
          }
          form.setFieldsValue({
            title: doc.title,
            doc_type: doc.doc_type,
            notes: doc.notes,
            ...fields,
          });
          setDocType(doc.doc_type);
          setCustomFieldKeys(Object.keys(fields));
        })
        .catch(() => message.error("Failed to load document"))
        .finally(() => setLoading(false));
    }
  }, [id, isEdit, form, message]);

  const onFinish = async (values: Record<string, string>) => {
    setSaving(true);
    try {
      const { title, doc_type, notes, ...fieldValues } = values;
      const body = {
        title,
        doc_type,
        notes: notes || "",
        fields_json: JSON.stringify(fieldValues),
      };

      if (isEdit) {
        await api.put(`/documents/${id}`, body);
        message.success("Document updated");
        navigate(`/documents/${id}`);
      } else {
        const res = await api.post("/documents", body);
        message.success("Document created");
        navigate(`/documents/${res.data.id}`);
      }
    } catch {
      message.error("Failed to save document");
    } finally {
      setSaving(false);
    }
  };

  const knownFieldDefs =
    DOC_TYPE_FIELDS[docType as KnownDocType] || DOC_TYPE_FIELDS.other;
  const knownFieldKeys = new Set(knownFieldDefs.map((f) => f.key));
  const dynamicFieldDefs = customFieldKeys
    .filter((key) => !knownFieldKeys.has(key))
    .map((key) => ({ key, label: toFieldLabel(key) }));
  const fieldDefs = [...knownFieldDefs, ...dynamicFieldDefs];

  const docTypeOptions = (() => {
    const base = [...DOC_TYPE_OPTIONS];
    if (docType && !base.some((opt) => opt.value === docType)) {
      base.unshift({
        value: docType,
        label: getDocTypeLabel(docType),
      });
    }
    return base;
  })();

  if (loading) {
    return (
      <div className="empty-state">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="page-shell page-shell-narrow">
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate(-1)}
        className="back-btn"
      >
        Back
      </Button>

      <Card className="detail-card">
        <Title className="page-title" level={4} style={{ marginBottom: 4 }}>
          {isEdit ? "Edit Document" : "New Document"}
        </Title>
        <Text className="form-intro" type="secondary" style={{ display: "block" }}>
          {isEdit
            ? "Update the document information below."
            : "Fill in the details to create a new document."}
        </Text>

        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{ doc_type: "other" }}
          requiredMark={false}
        >
          <Form.Item
            name="title"
            label="Title"
            rules={[{ required: true, message: "Please enter a title" }]}
          >
            <Input placeholder="e.g., My Chase Visa Card" />
          </Form.Item>

          <Form.Item
            name="doc_type"
            label="Document Type"
            rules={[{ required: true }]}
          >
            <Select
              options={docTypeOptions}
              onChange={(val) => setDocType(val as DocType)}
            />
          </Form.Item>

          <div className="field-group">
            <span className="field-group-label">Document Fields</span>
            {fieldDefs.map((f) => (
              <Form.Item key={f.key} name={f.key} label={f.label}>
                <Input placeholder={f.label} />
              </Form.Item>
            ))}
          </div>

          <Form.Item name="notes" label="Notes">
            <TextArea rows={3} placeholder="Optional notes..." />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={saving} block>
              {isEdit ? "Save Changes" : "Create Document"}
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
