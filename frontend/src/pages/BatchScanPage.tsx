import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Typography, Upload, Button, App, Progress } from "antd";
import {
  CloudUploadOutlined,
  ArrowLeftOutlined,
  ThunderboltOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  LoadingOutlined,
  DeleteOutlined,
  EyeOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  DownOutlined,
  SaveOutlined,
  MinusCircleFilled,
} from "@ant-design/icons";
import api from "../api/client";
import type { ScanResult } from "../types";
import { getDocTypeLabel, toFieldLabel } from "../types";

const { Title, Text } = Typography;

const MAX_BATCH = 20;

type ItemStatus =
  | "pending"
  | "scanning"
  | "scanned"
  | "saving"
  | "done"
  | "skipped"
  | "error";

interface BatchItem {
  file: File;
  previewUrl: string;
  status: ItemStatus;
  scanResult?: ScanResult;
  docId?: number;
  error?: string;
}

function isSupportedFile(file: File) {
  const name = file.name.toLowerCase();
  return (
    file.type.startsWith("image/") ||
    file.type === "application/pdf" ||
    file.type.startsWith("text/") ||
    name.endsWith(".pdf") ||
    name.endsWith(".txt")
  );
}

function fileIcon(file: File) {
  if (file.type.startsWith("image/")) return <FileImageOutlined />;
  if (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  )
    return <FilePdfOutlined />;
  return <FileTextOutlined />;
}

export default function BatchScanPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const abortRef = useRef(false);

  const [items, setItems] = useState<BatchItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const scannedCount = items.filter(
    (i) => i.status !== "pending" && i.status !== "scanning",
  ).length;
  const reviewable = items.filter((i) => i.status === "scanned");
  const doneCount = items.filter((i) => i.status === "done").length;
  const errorCount = items.filter((i) => i.status === "error").length;
  const allFinished =
    items.length > 0 &&
    items.every((i) =>
      ["done", "error", "skipped"].includes(i.status),
    );
  const inReview =
    !scanning &&
    !allFinished &&
    items.length > 0 &&
    items.some((i) => i.status === "scanned");

  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      items.forEach((i) => URL.revokeObjectURL(i.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = useCallback(
    (incoming: File[]) => {
      const valid = incoming.filter(isSupportedFile);
      if (valid.length < incoming.length) {
        message.warning(
          "Some files were skipped — only image, PDF, and text supported.",
        );
      }
      setItems((prev) => {
        const remaining = MAX_BATCH - prev.length;
        if (remaining <= 0) {
          message.warning(`Maximum ${MAX_BATCH} files.`);
          return prev;
        }
        const accepted = valid.slice(0, remaining);
        if (accepted.length < valid.length) {
          message.warning(
            `Only ${accepted.length} file(s) added (limit ${MAX_BATCH}).`,
          );
        }
        return [
          ...prev,
          ...accepted.map((file) => ({
            file,
            previewUrl: URL.createObjectURL(file),
            status: "pending" as const,
          })),
        ];
      });
    },
    [message],
  );

  const removeFile = (index: number) => {
    setItems((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const updateItem = (index: number, updates: Partial<BatchItem>) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...updates } : item)),
    );
  };

  const toggleExpand = (index: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  // Phase 1: Scan all files (no save)
  const startBatch = async () => {
    abortRef.current = false;
    setScanning(true);

    for (let i = 0; i < items.length; i++) {
      if (abortRef.current) break;
      if (items[i].status !== "pending") continue;

      try {
        updateItem(i, { status: "scanning", error: undefined });

        const fd = new FormData();
        fd.append("files", items[i].file);
        const res = await api.post("/documents/scan", fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });

        if (abortRef.current) break;
        updateItem(i, { status: "scanned", scanResult: res.data });
      } catch (err: any) {
        const detail = err?.response?.data?.detail;
        updateItem(i, {
          status: "error",
          error: typeof detail === "string" ? detail : "Scan failed",
        });
      }
    }

    setScanning(false);
  };

  // Phase 2: Save a single item
  const saveItem = async (index: number) => {
    const item = items[index];
    if (!item.scanResult) return;

    updateItem(index, { status: "saving" });

    try {
      const { title, doc_type, fields } = item.scanResult;
      const body = {
        title,
        doc_type,
        notes: "",
        fields_json: JSON.stringify(fields),
      };
      const res = await api.post("/documents", body);
      const docId = res.data.id;

      const fd = new FormData();
      fd.append("file", item.file);
      await api.post(`/documents/${docId}/files?allow_duplicate=1`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      updateItem(index, { status: "done", docId });
    } catch {
      updateItem(index, { status: "error", error: "Save failed" });
    }
  };

  const saveAllReviewed = async () => {
    setSavingAll(true);
    const toSave = items
      .map((item, i) => ({ item, index: i }))
      .filter(({ item }) => item.status === "scanned");

    for (const { index } of toSave) {
      await saveItem(index);
    }
    setSavingAll(false);
  };

  const skipItem = (index: number) => {
    updateItem(index, { status: "skipped" });
  };

  const handleReset = () => {
    items.forEach((i) => URL.revokeObjectURL(i.previewUrl));
    setItems([]);
    setExpanded(new Set());
  };

  const handleStop = () => {
    abortRef.current = true;
    message.info("Stopping after current file…");
  };

  const progressPct =
    items.length > 0 ? Math.round((scannedCount / items.length) * 100) : 0;

  const statusIcon = (status: ItemStatus) => {
    switch (status) {
      case "scanning":
      case "saving":
        return (
          <LoadingOutlined className="batch-status-icon batch-status-active" />
        );
      case "scanned":
        return null;
      case "done":
        return (
          <CheckCircleFilled className="batch-status-icon batch-status-done" />
        );
      case "skipped":
        return (
          <MinusCircleFilled className="batch-status-icon batch-status-skipped" />
        );
      case "error":
        return (
          <CloseCircleFilled className="batch-status-icon batch-status-error" />
        );
      default:
        return <span className="batch-status-icon batch-status-pending" />;
    }
  };

  return (
    <div className="page-shell page-shell-narrow">
      <div className="scan-head">
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(-1)}
          className="back-btn"
        />
        <div>
          <Title level={4} style={{ margin: 0, letterSpacing: "-0.02em" }}>
            Batch Scan
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Each file becomes a separate document
          </Text>
        </div>
      </div>

      {/* Upload zone — only before scanning starts */}
      {!scanning && !inReview && !allFinished && (
        <div className="scan-zone-wrap">
          <Upload
            accept="image/*,application/pdf,text/plain,.pdf,.txt"
            multiple
            showUploadList={false}
            beforeUpload={(file) => {
              addFiles([file]);
              return false;
            }}
          >
            <div className="scan-zone">
              <CloudUploadOutlined className="scan-zone-icon" />
              <Text strong className="scan-zone-title">
                Select files
              </Text>
              <Text type="secondary" className="scan-zone-hint">
                Up to {MAX_BATCH} files &middot; Each saved as its own document
              </Text>
            </div>
          </Upload>
        </div>
      )}

      {/* File / Review list */}
      {items.length > 0 && (
        <div className="batch-list-section">
          <div className="scan-strip-head">
            <Text style={{ fontSize: 13, fontWeight: 600 }}>
              {items.length} file{items.length !== 1 ? "s" : ""}
              {scanning && ` · scanning ${scannedCount}/${items.length}`}
              {inReview &&
                ` · ${reviewable.length} to review`}
            </Text>
            {!scanning && !inReview && !allFinished && (
              <Button
                type="link"
                danger
                size="small"
                onClick={handleReset}
                style={{ padding: 0 }}
              >
                Clear all
              </Button>
            )}
          </div>

          {scanning && (
            <Progress
              percent={progressPct}
              showInfo={false}
              strokeColor="#0f766e"
              size="small"
              style={{ marginBottom: 4 }}
            />
          )}

          <div className="batch-list">
            {items.map((item, index) => {
              const isScanned = item.status === "scanned";
              const isExpanded = expanded.has(index);
              const conf = item.scanResult
                ? Math.round(item.scanResult.confidence * 100)
                : 0;

              if (isScanned) {
                return (
                  <div key={index} className="batch-review-card">
                    <div
                      className="batch-review-head"
                      onClick={() => toggleExpand(index)}
                    >
                      <span className="batch-row-icon">
                        {fileIcon(item.file)}
                      </span>
                      <div className="batch-row-body">
                        <Text ellipsis className="batch-row-name">
                          {item.scanResult?.title || item.file.name}
                        </Text>
                        <Text className="batch-row-status batch-row-status-scanned">
                          {getDocTypeLabel(
                            item.scanResult?.doc_type || "other",
                          )}{" "}
                          · {conf}%
                        </Text>
                      </div>
                      <DownOutlined
                        className={`batch-expand-icon${isExpanded ? " batch-expand-open" : ""}`}
                      />
                    </div>

                    {isExpanded && item.scanResult && (
                      <div className="batch-review-fields">
                        {Object.entries(item.scanResult.fields).map(
                          ([key, val]) =>
                            val ? (
                              <div key={key} className="batch-field">
                                <Text
                                  type="secondary"
                                  className="batch-field-label"
                                >
                                  {toFieldLabel(key)}
                                </Text>
                                <Text className="batch-field-value">
                                  {val}
                                </Text>
                              </div>
                            ) : null,
                        )}
                      </div>
                    )}

                    <div className="batch-review-actions">
                      <Button size="small" onClick={() => skipItem(index)}>
                        Skip
                      </Button>
                      <Button
                        size="small"
                        type="primary"
                        icon={<SaveOutlined />}
                        onClick={() => saveItem(index)}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={index}
                  className={`batch-row${item.status === "scanning" || item.status === "saving" ? " batch-row-active" : ""}${item.status === "skipped" ? " batch-row-skipped" : ""}`}
                >
                  <span className="batch-row-icon">
                    {fileIcon(item.file)}
                  </span>
                  <div className="batch-row-body">
                    <Text ellipsis className="batch-row-name">
                      {item.status === "done" && item.scanResult
                        ? item.scanResult.title
                        : item.file.name}
                    </Text>
                    <Text
                      className={`batch-row-status batch-row-status-${item.status}`}
                    >
                      {item.status === "pending" && "Waiting"}
                      {item.status === "scanning" && "Scanning…"}
                      {item.status === "saving" && "Saving…"}
                      {item.status === "done" &&
                        getDocTypeLabel(
                          item.scanResult?.doc_type || "other",
                        )}
                      {item.status === "skipped" && "Skipped"}
                      {item.status === "error" &&
                        (item.error || "Failed")}
                    </Text>
                  </div>

                  {statusIcon(item.status)}

                  {item.status === "pending" && !scanning && (
                    <button
                      className="batch-row-action"
                      onClick={() => removeFile(index)}
                      title="Remove"
                    >
                      <DeleteOutlined />
                    </button>
                  )}
                  {item.status === "done" && item.docId && (
                    <button
                      className="batch-row-action"
                      onClick={() => navigate(`/documents/${item.docId}`)}
                      title="View"
                    >
                      <EyeOutlined />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Start scan button */}
      {items.length > 0 && !scanning && !inReview && !allFinished && (
        <Button
          type="primary"
          icon={<ThunderboltOutlined />}
          onClick={startBatch}
          block
          size="large"
          className="scan-go-btn"
        >
          Scan {items.length} File{items.length !== 1 ? "s" : ""}
        </Button>
      )}

      {/* Stop button during scan */}
      {scanning && (
        <Button danger onClick={handleStop} block size="large">
          Stop
        </Button>
      )}

      {/* Save All button during review */}
      {inReview && reviewable.length > 0 && (
        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={saveAllReviewed}
          loading={savingAll}
          block
          size="large"
          className="scan-go-btn"
        >
          Save All ({reviewable.length})
        </Button>
      )}

      {/* Done state */}
      {allFinished && (
        <>
          <div className="batch-summary">
            {doneCount > 0 && (
              <div className="batch-summary-stat batch-summary-done">
                <CheckCircleFilled /> {doneCount} saved
              </div>
            )}
            {errorCount > 0 && (
              <div className="batch-summary-stat batch-summary-error">
                <CloseCircleFilled /> {errorCount} failed
              </div>
            )}
          </div>
          <div className="batch-done-actions">
            {doneCount > 0 && (
              <Button
                type="primary"
                onClick={() => navigate("/documents")}
                block
                size="large"
                className="scan-go-btn"
              >
                View All Documents
              </Button>
            )}
            <Button onClick={handleReset} block size="large">
              Scan More
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
