import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ConfigProvider, App as AntdApp } from "antd";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./components/AppLayout";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import DocumentListPage from "./pages/DocumentListPage";
import DocumentDetailPage from "./pages/DocumentDetailPage";
import DocumentFormPage from "./pages/DocumentFormPage";
import SmartScanPage from "./pages/SmartScanPage";
import DocumentTypesPage from "./pages/DocumentTypesPage";

export default function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#18181b",
          colorInfo: "#18181b",
          borderRadius: 10,
          fontFamily:
            'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          colorBgLayout: "#fafafa",
          controlHeight: 40,
        },
        components: {
          Button: {
            primaryShadow: "0 2px 8px rgba(0, 0, 0, 0.12)",
            borderRadius: 10,
            controlHeight: 40,
            fontWeight: 500,
          },
          Card: {
            borderRadiusLG: 16,
          },
          Input: {
            borderRadius: 10,
            controlHeight: 42,
          },
          Select: {
            borderRadius: 10,
            controlHeight: 42,
          },
          Menu: {
            itemBorderRadius: 8,
            itemMarginInline: 8,
            itemSelectedBg: "rgba(0, 0, 0, 0.04)",
            itemSelectedColor: "#18181b",
            itemHoverBg: "rgba(0, 0, 0, 0.03)",
          },
        },
      }}
    >
      <AntdApp>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/" element={<DashboardPage />} />
                <Route path="/documents" element={<DocumentListPage />} />
                <Route path="/documents/new" element={<DocumentFormPage />} />
                <Route path="/types" element={<DocumentTypesPage />} />
                <Route
                  path="/documents/:id"
                  element={<DocumentDetailPage />}
                />
                <Route
                  path="/documents/:id/edit"
                  element={<DocumentFormPage />}
                />
                <Route path="/scan" element={<SmartScanPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  );
}
