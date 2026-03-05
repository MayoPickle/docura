import { useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Layout, Menu, Grid, Dropdown, Typography, Tooltip } from "antd";
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

  const isMobile = !screens.lg;

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
              <div style={{ fontSize: 12, color: "rgba(0,0,0,0.5)" }}>
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
      <Layout className="app-layout">
        <Header className="mobile-header">
          <div className="app-brand">
            <img
              src="/icon.png"
              alt=""
              width={32}
              height={32}
            />
            <Text strong>Docura</Text>
          </div>
          <Dropdown menu={userMenu} trigger={["click"]} placement="bottomRight">
            <div className="user-avatar">{initials}</div>
          </Dropdown>
        </Header>

        <Content className="mobile-content">
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
    <Layout className="app-layout">
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="light"
        width={240}
        className="modern-sider desktop-sider"
      >
        <div
          className={`sider-logo ${collapsed ? "sider-logo-collapsed" : ""}`}
        >
          <img src="/icon.png" alt="" width={34} height={34} />
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
        <Header className="desktop-header">
          <Dropdown menu={userMenu} trigger={["click"]} placement="bottomRight">
            <Tooltip title={user?.name}>
              <div className="user-avatar">{initials}</div>
            </Tooltip>
          </Dropdown>
        </Header>

        <Content className="desktop-content">
          <div className="page-enter">
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
