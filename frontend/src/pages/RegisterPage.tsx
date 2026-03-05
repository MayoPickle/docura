import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Form, Input, Button, Typography, Card, App } from "antd";
import { UserOutlined, LockOutlined, MailOutlined } from "@ant-design/icons";
import { useAuth } from "../contexts/AuthContext";

const { Title, Text } = Typography;

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: {
    name: string;
    email: string;
    password: string;
  }) => {
    setLoading(true);
    try {
      await register(values.name, values.email, values.password);
      message.success("Account created successfully!");
      navigate("/", { replace: true });
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: { detail?: unknown } } })
        ?.response?.data;
      let msg = "Registration failed";
      if (resp?.detail) {
        if (typeof resp.detail === "string") {
          msg = resp.detail;
        } else if (Array.isArray(resp.detail)) {
          msg = resp.detail
            .map((e: { msg?: string }) => e.msg || String(e))
            .join("; ");
        }
      } else if (err instanceof Error) {
        msg = err.message;
      }
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-bg auth-with-decor">
      <div className="auth-bg-decor" aria-hidden="true">
        <div className="floating-card card-1">
          <span className="chip" />
          <span className="line line-short" />
          <span className="line" />
        </div>
        <div className="floating-card card-2">
          <span className="chip" />
          <span className="line" />
          <span className="line line-short" />
        </div>
        <div className="floating-card card-3">
          <span className="chip" />
          <span className="line line-short" />
          <span className="line" />
        </div>
        <div className="doc-sheet doc-1" />
        <div className="doc-sheet doc-2" />
        <div className="doc-sheet doc-3" />
      </div>
      <div className="auth-card">
        <Card>
          <div className="auth-logo">
            <img src="/icon.png" alt="Docura" />
            <Title className="page-title" level={2} style={{ marginBottom: 4 }}>
              Create account
            </Title>
            <Text type="secondary">
              Join Docura to manage your documents securely
            </Text>
          </div>
          <Form layout="vertical" onFinish={onFinish} size="large">
            <Form.Item
              name="name"
              rules={[
                { required: true, message: "Please enter your name" },
                { min: 2, message: "At least 2 characters" },
              ]}
            >
              <Input
                prefix={<UserOutlined style={{ color: "rgba(0,0,0,0.25)" }} />}
                placeholder="Name"
              />
            </Form.Item>
            <Form.Item
              name="email"
              rules={[
                { required: true, message: "Please enter your email" },
                { type: "email", message: "Please enter a valid email" },
              ]}
            >
              <Input
                prefix={<MailOutlined style={{ color: "rgba(0,0,0,0.25)" }} />}
                placeholder="Email"
              />
            </Form.Item>
            <Form.Item
              name="password"
              rules={[
                { required: true, message: "Please enter a password" },
                { min: 6, message: "At least 6 characters" },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: "rgba(0,0,0,0.25)" }} />}
                placeholder="Password"
              />
            </Form.Item>
            <Form.Item
              name="confirm"
              dependencies={["password"]}
              rules={[
                { required: true, message: "Please confirm your password" },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue("password") === value)
                      return Promise.resolve();
                    return Promise.reject(new Error("Passwords do not match"));
                  },
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: "rgba(0,0,0,0.25)" }} />}
                placeholder="Confirm Password"
              />
            </Form.Item>
            <Form.Item style={{ marginBottom: 16 }}>
              <Button type="primary" htmlType="submit" loading={loading} block>
                Create Account
              </Button>
            </Form.Item>
            <div className="auth-switch">
              <Text type="secondary">
                Already have an account?{" "}
                <Link to="/login" style={{ fontWeight: 500 }}>
                  Sign In
                </Link>
              </Text>
            </div>
          </Form>
        </Card>
      </div>
    </div>
  );
}
