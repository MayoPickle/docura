import { useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Layout, Menu, Grid, Dropdown, Typography, theme, Tooltip } from "antd";
import {
  HomeOutlined,
  FileTextOutlined,
  ScanOutlined,
  TagsOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import { useAuth } from "../contexts/AuthContext";

const { Header, Sider, Content } = Layout;
const { useBreakpoint } = Grid;
const { Text } = Typography;

const NAV_ITEMS = [
  { key: "/", icon: <HomeOutlined />, label: "Home" },
  { key: "/documents", icon: <FileTextOutlined />, label: "Documents" },
  { key: "/types", icon: <TagsOutlined />, label: "Types" },
  { key: "/scan", icon: <ScanOutlined />, label: "Scan" },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const screens = useBreakpoint();
  const [collapsed, setCollapsed] = useState(false);
  const { token: t } = theme.useToken();

  const isMobile = !screens.md;

  const selectedKey =
    NAV_ITEMS.find(
      (item) => item.key !== "/" && location.pathname.startsWith(item.key)
    )?.key || "/";

  const onNav = (key: string) => navigate(key);

  const initials = (user?.name || "U").slice(0, 2).toUpperCase();

  const userMenu = {
    items: [
      {
        key: "user",
        label: (
          <div>
            <div style={{ fontWeight: 600 }}>{user?.name}</div>
            <div style={{ fontSize: 12, color: t.colorTextSecondary }}>
              {user?.email}
            </div>
          </div>
        ),
        disabled: true,
        style: { cursor: "default", opacity: 1 },
      },
      { type: "divider" as const },
      {
        key: "logout",
        icon: <LogoutOutlined />,
        label: "Sign Out",
        danger: true,
        onClick: () => {
          logout();
          navigate("/login");
        },
      },
    ],
  };

  if (isMobile) {
    return (
      <Layout style={{ minHeight: "100vh" }}>
        <Header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            background: "rgba(255,255,255,0.88)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            borderBottom: `1px solid rgba(0,0,0,0.06)`,
            height: 56,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img
              src="/icon.png"
              alt=""
              style={{ width: 30, height: 30, borderRadius: 8 }}
            />
            <Text strong style={{ fontSize: 18, letterSpacing: -0.3 }}>
              Docura
            </Text>
          </div>
          <Dropdown menu={userMenu} trigger={["click"]} placement="bottomRight">
            <div className="user-avatar">{initials}</div>
          </Dropdown>
        </Header>

        <Content
          style={{
            padding: 16,
            paddingBottom: 80,
            minHeight: "calc(100vh - 56px - 60px)",
            background: t.colorBgLayout,
          }}
        >
          <div className="page-enter">
            <Outlet />
          </div>
        </Content>

        <div className="mobile-nav">
          {NAV_ITEMS.map((item) => (
            <div
              key={item.key}
              className={`mobile-nav-item ${selectedKey === item.key ? "active" : ""}`}
              onClick={() => onNav(item.key)}
              style={{
                color:
                  selectedKey === item.key
                    ? t.colorPrimary
                    : t.colorTextSecondary,
              }}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </Layout>
    );
  }

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="light"
        width={240}
        className="modern-sider"
        style={{
          borderRight: `1px solid rgba(0,0,0,0.04)`,
          background: "#fff",
        }}
      >
        <div
          style={{
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "flex-start",
            gap: 10,
            padding: collapsed ? 0 : "0 20px",
            fontWeight: 700,
            fontSize: collapsed ? 16 : 20,
            letterSpacing: -0.3,
            borderBottom: "1px solid rgba(0,0,0,0.04)",
          }}
        >
          <img
            src="/icon.png"
            alt=""
            style={{ width: 32, height: 32, borderRadius: 8 }}
          />
          {!collapsed && "Docura"}
        </div>

        <div style={{ padding: "8px 0", flex: 1 }}>
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            items={NAV_ITEMS.map((item) => ({
              key: item.key,
              icon: item.icon,
              label: item.label,
              onClick: () => onNav(item.key),
            }))}
            style={{ border: "none" }}
          />
        </div>
      </Sider>

      <Layout>
        <Header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            padding: "0 24px",
            background: "rgba(255,255,255,0.72)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            borderBottom: "1px solid rgba(0,0,0,0.04)",
            height: 64,
          }}
        >
          <Dropdown menu={userMenu} trigger={["click"]} placement="bottomRight">
            <Tooltip title={user?.name}>
              <div className="user-avatar">{initials}</div>
            </Tooltip>
          </Dropdown>
        </Header>

        <Content
          style={{
            padding: 28,
            background: t.colorBgLayout,
            minHeight: "calc(100vh - 64px)",
          }}
        >
          <div className="page-enter">
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
