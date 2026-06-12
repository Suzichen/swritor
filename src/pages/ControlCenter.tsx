import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

interface Props {
  blogDir: string;
}

interface BuildResult {
  postsCount: number;
  albumsCount: number;
  seoPagesCount: number;
  staticFilesCount: number;
  shellFilesCount: number;
  durationMs: number;
}

export function ControlCenter({ blogDir }: Props) {
  // ── Serve state ──
  const [serveAddr, setServeAddr] = useState<string | null>(null);
  const [serveLoading, setServeLoading] = useState(false);

  // ── Build state ──
  const [buildState, setBuildState] = useState<"idle" | "building" | "cancelling" | "success" | "error">("idle");
  const [buildLogs, setBuildLogs] = useState<string[]>([]);
  const [buildResult, setBuildResult] = useState<BuildResult | null>(null);
  const [buildError, setBuildError] = useState("");
  const buildDialogRef = useRef<HTMLElement & { open: boolean }>(null);

  // ── Sync state ──
  const [syncAvailable, setSyncAvailable] = useState(false);
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "cancelling" | "success" | "error">("idle");
  const [syncProgress, setSyncProgress] = useState("");
  const [syncPercent, setSyncPercent] = useState(0);
  const [syncResult, setSyncResult] = useState("");
  const [syncError, setSyncError] = useState("");
  const syncDialogRef = useRef<HTMLElement & { open: boolean }>(null);

  // ── Init ──
  useEffect(() => {
    invoke<string | null>("get_serve_status").then(setServeAddr);
    // 恢复后台任务状态
    invoke<[boolean, boolean]>("get_task_status").then(([building, syncing]) => {
      if (building) setBuildState("building");
      if (syncing) setSyncState("syncing");
    });
  }, []);

  useEffect(() => {
    invoke<boolean>("check_sync_available", { blogDir }).then(setSyncAvailable);
  }, [blogDir]);

  // ── Serve handlers ──
  const handleStartServe = async () => {
    setServeLoading(true);
    try {
      const addr = await invoke<string>("start_serve", { blogDir });
      setServeAddr(addr);
    } catch (e) {
      alert(`启动失败: ${e}`);
    }
    setServeLoading(false);
  };

  const handleStopServe = async () => {
    setServeLoading(true);
    await invoke("stop_serve");
    setServeAddr(null);
    setServeLoading(false);
  };

  // ── Build handlers ──
  const handleBuild = useCallback(async () => {
    setBuildState("building");
    setBuildLogs([]);
    setBuildResult(null);
    setBuildError("");
    if (buildDialogRef.current) buildDialogRef.current.open = true;

    const unlisten: UnlistenFn = await listen<string>("build-progress", (e) => {
      try {
        const data = JSON.parse(e.payload);
        switch (data.type) {
          case "step_start":
            setBuildLogs((prev) => [...prev, `${data.step}...`]);
            break;
          case "step_done":
            setBuildLogs((prev) => [...prev, `${data.step} ✓ ${data.detail}`]);
            break;
          case "albums_start":
            setBuildLogs((prev) => [...prev, `[albums] Processing ${data.count} albums...`]);
            break;
          case "photo_progress":
            setBuildLogs((prev) => {
              const msg = `[albums] ${data.album} (${data.current}/${data.total})`;
              // Replace last photo_progress line for same album to avoid flooding
              if (prev.length > 0 && prev[prev.length - 1].startsWith(`[albums] ${data.album} (`)) {
                return [...prev.slice(0, -1), msg];
              }
              return [...prev, msg];
            });
            break;
          case "photo_album_done":
            setBuildLogs((prev) => [...prev, `[albums] ${data.album} ✓ ${data.count} photos (${data.durationMs}ms)`]);
            break;
        }
      } catch {
        setBuildLogs((prev) => [...prev, e.payload]);
      }
    });

    try {
      const json = await invoke<string>("build_blog", { blogDir });
      const result: BuildResult = JSON.parse(json);
      setBuildResult(result);
      setBuildState("success");
    } catch (e) {
      setBuildError(String(e));
      setBuildState("error");
    }
    unlisten();
  }, [blogDir]);

  const handleCancelBuild = () => {
    setBuildState("cancelling");
    invoke("cancel_build");
  };

  const handleOpenDist = () => {
    invoke("open_in_explorer", { path: `${blogDir}\\dist` });
  };

  // ── Sync handlers ──
  const handleSync = useCallback(async () => {
    setSyncState("syncing");
    setSyncProgress("正在扫描文件变更...");
    setSyncPercent(-1);
    setSyncResult("");
    setSyncError("");
    if (syncDialogRef.current) syncDialogRef.current.open = true;

    const unlisten: UnlistenFn = await listen<string>("sync-progress", (e) => {
      try {
        const data = JSON.parse(e.payload);
        switch (data.type) {
          case "scanning":
            if (data.total > 0) {
              setSyncProgress(`发现 ${data.total} 个变更文件`);
            }
            break;
          case "uploading":
            setSyncProgress(`上传原图 (${data.current}/${data.total}) ${data.file}`);
            setSyncPercent((data.current / data.total) * 100);
            break;
          case "generating_thumbnail":
            setSyncProgress(`生成缩略图 (${data.current}/${data.total}) ${data.file}`);
            setSyncPercent((data.current / data.total) * 100);
            break;
          case "uploading_thumbnail":
            setSyncProgress(`上传缩略图 (${data.current}/${data.total})`);
            setSyncPercent((data.current / data.total) * 100);
            break;
          case "done":
            setSyncPercent(100);
            break;
        }
      } catch {}
    });

    try {
      const json = await invoke<string>("sync_media", { blogDir });
      const r = JSON.parse(json);
      setSyncResult(`上传: ${r.uploaded}，跳过: ${r.skipped}，失败: ${r.failed?.length || 0}，耗时: ${r.durationMs}ms`);
      setSyncState("success");
    } catch (e) {
      setSyncError(String(e));
      setSyncState("error");
    }
    unlisten();
  }, [blogDir]);

  const handleCancelSync = () => {
    setSyncState("cancelling");
    invoke("cancel_sync");
  };

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-xl font-medium mb-6">控制中心</h2>

      {/* ── Serve Card ── */}
      <mdui-card class="p-5 mb-4" style={{ display: "block" }}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-medium mb-1">开发服务器</h3>
            {serveAddr ? (
              <p className="text-sm" style={{ color: "#16a34a" }}>● 运行中 — {serveAddr}</p>
            ) : (
              <p className="text-sm" style={{ color: "#6b7280" }}>● 已停止</p>
            )}
          </div>
          {serveAddr ? (
            <mdui-button variant="outlined" onClick={handleStopServe} loading={serveLoading || undefined} icon="stop">
              停止
            </mdui-button>
          ) : (
            <mdui-button variant="filled" onClick={handleStartServe} loading={serveLoading || undefined} icon="play_arrow">
              启动
            </mdui-button>
          )}
        </div>
      </mdui-card>

      {/* ── Build Card ── */}
      <mdui-card class="p-5 mb-4" style={{ display: "block" }}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-medium mb-1">生成网站</h3>
            <p className="text-sm" style={{ color: "#6b7280" }}>生成可部署的博客静态文件</p>
          </div>
          <mdui-button variant="filled" onClick={handleBuild} icon="build" disabled={buildState === "building" || undefined}>
            构建
          </mdui-button>
        </div>
      </mdui-card>

      {/* ── Sync Card ── */}
      <mdui-card class="p-5 mb-4" style={{ display: "block" }}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-medium mb-1">媒体同步</h3>
            {syncAvailable ? (
              <p className="text-sm" style={{ color: "#6b7280" }}>同步相册媒体到 S3 存储</p>
            ) : (
              <p className="text-sm" style={{ color: "#ea580c" }}>请先在设置中配置媒体存储 Provider</p>
            )}
          </div>
          <mdui-button
            variant="filled"
            onClick={handleSync}
            icon="cloud_upload"
            disabled={!syncAvailable || syncState === "syncing" || undefined}
          >
            同步
          </mdui-button>
        </div>
      </mdui-card>

      {/* ── Build Dialog ── */}
      <mdui-dialog ref={buildDialogRef} close-on-overlay-click={buildState !== "building" && buildState !== "cancelling" || undefined}>
        <span slot="headline">生成网站</span>
        <div slot="description" style={{ minHeight: 120 }}>
          {(buildState === "building" || buildState === "cancelling") && (
            <>
              <mdui-linear-progress></mdui-linear-progress>
              {buildState === "cancelling" && <p className="mt-2 text-sm" style={{ color: "#ea580c" }}>正在等待当前操作完成后取消...</p>}
              <div className="mt-3 text-sm max-h-48 overflow-y-auto" style={{ whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: 12 }}>
                {buildLogs.map((l, i) => (
                  <p key={i} className="mb-1">{l}</p>
                ))}
              </div>
            </>
          )}
          {buildState === "success" && buildResult && (
            <div className="text-sm">
              <p style={{ color: "#16a34a", fontWeight: 500, marginBottom: 8 }}>✓ 生成完成 ({(buildResult.durationMs / 1000).toFixed(1)}s)</p>
              <p>文章: {buildResult.postsCount} 篇</p>
              <p>相册: {buildResult.albumsCount} 个</p>
              <p>SEO 页面: {buildResult.seoPagesCount} 个</p>
              <p>静态文件: {buildResult.staticFilesCount} 个</p>
            </div>
          )}
          {buildState === "error" && (
            <p className="text-sm" style={{ color: "#dc2626" }}>{buildError}</p>
          )}
        </div>
        <div slot="action">
          {(buildState === "building" || buildState === "cancelling") && (
            <mdui-button variant="text" onClick={handleCancelBuild} loading={buildState === "cancelling" || undefined} disabled={buildState === "cancelling" || undefined}>
              {buildState === "cancelling" ? "正在取消..." : "取消"}
            </mdui-button>
          )}
          {buildState !== "building" && buildState !== "cancelling" && (
            <>
              {buildState === "success" && (
                <mdui-button variant="text" onClick={handleOpenDist}>
                  打开输出文件夹
                </mdui-button>
              )}
              <mdui-button variant="text" onClick={() => { if (buildDialogRef.current) buildDialogRef.current.open = false; setBuildState("idle"); }}>
                关闭
              </mdui-button>
            </>
          )}
        </div>
      </mdui-dialog>

      {/* ── Sync Dialog ── */}
      <mdui-dialog ref={syncDialogRef} close-on-overlay-click={syncState !== "syncing" && syncState !== "cancelling" || undefined}>
        <span slot="headline">媒体同步</span>
        <div slot="description" style={{ minHeight: 80 }}>
          {(syncState === "syncing" || syncState === "cancelling") && (
            <>
              {syncPercent < 0 ? (
                <mdui-linear-progress></mdui-linear-progress>
              ) : (
                <mdui-linear-progress value={syncPercent} max={100}></mdui-linear-progress>
              )}
              {syncState === "cancelling" && <p className="mt-2 text-sm" style={{ color: "#ea580c" }}>正在等待当前操作完成后取消...</p>}
              <p className="mt-3 text-sm">{syncProgress}</p>
            </>
          )}
          {syncState === "success" && (
            <p className="text-sm" style={{ color: "#16a34a" }}>✓ {syncResult}</p>
          )}
          {syncState === "error" && (
            <p className="text-sm" style={{ color: "#dc2626" }}>{syncError}</p>
          )}
        </div>
        <div slot="action">
          {(syncState === "syncing" || syncState === "cancelling") && (
            <mdui-button variant="text" onClick={handleCancelSync} loading={syncState === "cancelling" || undefined} disabled={syncState === "cancelling" || undefined}>
              {syncState === "cancelling" ? "正在取消..." : "取消"}
            </mdui-button>
          )}
          {syncState !== "syncing" && syncState !== "cancelling" && (
            <mdui-button variant="text" onClick={() => { if (syncDialogRef.current) syncDialogRef.current.open = false; setSyncState("idle"); }}>
              关闭
            </mdui-button>
          )}
        </div>
      </mdui-dialog>
    </div>
  );
}
