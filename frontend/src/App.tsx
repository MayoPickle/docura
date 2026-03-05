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
          colorPrimary: "#0f766e",
          colorInfo: "#0f766e",
          borderRadius: 12,
          fontFamily:
            '"Manrope", "Plus Jakarta Sans", "Avenir Next", "Segoe UI", sans-serif',
          colorBgLayout: "transparent",
          colorTextBase: "#1b1f24",
          controlHeight: 42,
        },
        components: {
          Button: {
            primaryShadow: "0 8px 18px rgba(15, 118, 110, 0.28)",
            borderRadius: 12,
            controlHeight: 42,
            fontWeight: 700,
          },
          Card: {
            borderRadiusLG: 18,
          },
          Input: {
            borderRadius: 12,
            controlHeight: 42,
          },
          Select: {
            borderRadius: 12,
            controlHeight: 42,
          },
          Menu: {
            itemBorderRadius: 10,
            itemMarginInline: 8,
            itemSelectedBg: "rgba(15, 118, 110, 0.12)",
            itemSelectedColor: "#115e59",
            itemHoverBg: "rgba(15, 118, 110, 0.07)",
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
