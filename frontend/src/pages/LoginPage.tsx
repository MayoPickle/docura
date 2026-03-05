import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Form, Input, Button, Typography, Card, App } from "antd";
import { MailOutlined, LockOutlined } from "@ant-design/icons";
import { useAuth } from "../contexts/AuthContext";

const { Title, Text } = Typography;

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: { email: string; password: string }) => {
    setLoading(true);
    try {
      await login(values.email, values.password);
      navigate("/", { replace: true });
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;
      message.error(detail || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-bg login-auth-bg">
      <div className="login-bg-decor" aria-hidden="true">
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
            <Title level={2} style={{ marginBottom: 4 }}>
              Welcome back
            </Title>
            <Text type="secondary">Sign in to your Docura account</Text>
          </div>
          <Form layout="vertical" onFinish={onFinish} size="large">
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
                { required: true, message: "Please enter your password" },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: "rgba(0,0,0,0.25)" }} />}
                placeholder="Password"
              />
            </Form.Item>
            <Form.Item style={{ marginBottom: 16 }}>
              <Button type="primary" htmlType="submit" loading={loading} block>
                Sign In
              </Button>
            </Form.Item>
            <div style={{ textAlign: "center" }}>
              <Text type="secondary">
                Don't have an account?{" "}
                <Link to="/register" style={{ fontWeight: 500 }}>
                  Sign Up
                </Link>
              </Text>
            </div>
          </Form>
        </Card>
      </div>
    </div>
  );
}
