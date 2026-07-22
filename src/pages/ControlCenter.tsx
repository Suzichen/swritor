import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useAuth, type SiteInfo } from "../hooks/useAuth";
import { DeployButton } from "../components/deploy/DeployButton";

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

type DeployState = "idle" | "running" | "cancelling" | "success" | "error";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function ControlCenter({ blogDir }: Props) {
  const { isLoggedIn, listSites } = useAuth();

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

  // ── Deploy state ──
  const [sites, setSites] = useState<SiteInfo[]>([]);
  const [deployState, setDeployState] = useState<DeployState>("idle");
  const [deployTarget, setDeployTarget] = useState<SiteInfo | null>(null);
  const [deployPhase, setDeployPhase] = useState("");
  const [deployPercent, setDeployPercent] = useState(-1);
  const [deployLogs, setDeployLogs] = useState<string[]>([]);
  const [deployUrl, setDeployUrl] = useState("");
  const [deployError, setDeployError] = useState("");
  const deployDialogRef = useRef<HTMLElement & { open: boolean }>(null);
  const buildLogRef = useRef<HTMLDivElement>(null);
  const deployLogRef = useRef<HTMLDivElement>(null);
  const deployCancelRef = useRef(false);

  const deployBusy = deployState === "running" || deployState === "cancelling";

  // Reason the deploy split-button is unavailable (drives its tooltip).
  const deployDisabledReason = (): string | undefined => {
    if (!isLoggedIn) return "请先登录后再部署";
    if (sites.length === 0) return "请先在设置中创建站点";
    if (buildState === "building") return "正在构建，请稍候";
    if (deployBusy) return "正在部署，请稍候";
    return undefined;
  };

  // ── Init ──
  useEffect(() => {
    invoke<string | null>("get_serve_status").then(setServeAddr);
    // 恢复后台任务状态
    invoke<[boolean, boolean, boolean]>("get_task_status").then(([building, syncing, deploying]) => {
      if (building) setBuildState("building");
      if (syncing) setSyncState("syncing");
      if (deploying) setDeployState("running");
    });
  }, []);

  useEffect(() => {
    invoke<boolean>("check_sync_available", { blogDir }).then(setSyncAvailable);
  }, [blogDir]);

  // Load the user's sites for the deploy menu.
  const reloadSites = useCallback(async () => {
    if (!isLoggedIn) {
      setSites([]);
      return;
    }
    try {
      setSites(await listSites());
    } catch {
      setSites([]);
    }
  }, [isLoggedIn, listSites]);

  useEffect(() => {
    reloadSites();
  }, [reloadSites]);

  // Auto-scroll the log panels to the bottom as new lines arrive.
  useEffect(() => {
    if (buildLogRef.current) buildLogRef.current.scrollTop = buildLogRef.current.scrollHeight;
  }, [buildLogs]);
  useEffect(() => {
    if (deployLogRef.current) deployLogRef.current.scrollTop = deployLogRef.current.scrollHeight;
  }, [deployLogs]);

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

  // ── Deploy handlers ──
  const appendDeployLog = (line: string) => setDeployLogs((prev) => [...prev, line]);

  const startDeploy = useCallback(
    async (site: SiteInfo, opts: { rebuild: boolean }) => {
      // Close the build dialog if the deploy was triggered from it.
      if (buildDialogRef.current) buildDialogRef.current.open = false;

      setDeployTarget(site);
      setDeployLogs([]);
      setDeployError("");
      setDeployUrl("");
      setDeployPercent(-1);
      setDeployPhase(opts.rebuild ? "准备构建" : "准备部署");
      setDeployState("running");
      deployCancelRef.current = false;
      if (deployDialogRef.current) deployDialogRef.current.open = true;

      // Listen to build progress (only used when rebuilding) and deploy progress.
      const unlistenBuild: UnlistenFn = await listen<string>("build-progress", (e) => {
        try {
          const data = JSON.parse(e.payload);
          switch (data.type) {
            case "step_start":
              appendDeployLog(`${data.step}...`);
              break;
            case "step_done":
              appendDeployLog(`${data.step} ✓ ${data.detail}`);
              break;
            case "albums_start":
              appendDeployLog(`[albums] 处理 ${data.count} 个相册...`);
              break;
            case "photo_album_done":
              appendDeployLog(`[albums] ${data.album} ✓ ${data.count} 张`);
              break;
          }
        } catch {
          /* ignore */
        }
      });

      const unlistenDeploy: UnlistenFn = await listen<string>("deploy-progress", (e) => {
        try {
          const data = JSON.parse(e.payload);
          switch (data.type) {
            case "scanning":
              setDeployPhase("扫描构建产物");
              appendDeployLog("扫描构建产物...");
              break;
            case "scanned":
              appendDeployLog(`发现 ${data.fileCount} 个文件（${formatBytes(data.totalBytes)}）`);
              break;
            case "init":
              setDeployPhase("上传中");
              appendDeployLog(`已创建部署 ${data.releaseId}`);
              break;
            case "uploading":
              setDeployPhase("上传中");
              setDeployPercent((data.current / data.total) * 100);
              setDeployLogs((prev) => {
                const msg = `上传文件 (${data.current}/${data.total})`;
                if (prev.length > 0 && prev[prev.length - 1].startsWith("上传文件 (")) {
                  return [...prev.slice(0, -1), msg];
                }
                return [...prev, msg];
              });
              break;
            case "finalizing":
              setDeployPhase("校验并发布");
              setDeployPercent(-1);
              appendDeployLog("正在校验并发布...");
              break;
            case "retry":
              appendDeployLog(`补传 ${data.missing} 个缺失文件...`);
              break;
            case "done":
              appendDeployLog("发布完成 ✓");
              break;
            case "log":
              appendDeployLog(data.message);
              break;
          }
        } catch {
          /* ignore */
        }
      });

      try {
        if (opts.rebuild) {
          setDeployPhase("构建中");
          appendDeployLog("开始构建网站...");
          await invoke<string>("build_blog", { blogDir });
          appendDeployLog("构建完成 ✓");
        }
        setDeployPhase("上传中");
        const url = await invoke<string>("deploy_site", { blogDir, siteSlug: site.siteSlug });
        setDeployUrl(url);
        setDeployState("success");
      } catch (e) {
        setDeployError(deployCancelRef.current ? "已取消部署" : String(e));
        setDeployState("error");
      } finally {
        unlistenBuild();
        unlistenDeploy();
      }
    },
    [blogDir]
  );

  const handleCancelDeploy = () => {
    deployCancelRef.current = true;
    setDeployState("cancelling");
    // Cancel both the upload phase and the (possible) rebuild phase.
    invoke("cancel_deploy");
    invoke("cancel_build");
  };

  const closeDeployDialog = () => {
    if (deployDialogRef.current) deployDialogRef.current.open = false;
    setDeployState("idle");
  };

  const openDeployedSite = () => {
    if (deployUrl) invoke("open_url", { url: deployUrl });
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
    <div className="workspace-page control-center-page">
      <header className="workspace-header">
        <div>
          <h2>控制中心</h2>
          <p>管理本地预览、站点发布和媒体资源</p>
        </div>
      </header>

      <div className="control-card-grid">
        <mdui-card class="control-card control-card-serve" variant="elevated">
          <div className="control-card-icon" aria-hidden="true">
            <mdui-icon name="cell_tower" />
          </div>
          <div className="control-card-copy">
            <div className="control-card-heading">
              <span className={`control-status-dot${serveAddr ? " is-active" : ""}`} />
              <span>{serveAddr ? "开发服务器运行中" : "开发服务器已停止"}</span>
            </div>
            <h3>本地预览</h3>
            <p>{serveAddr || "在浏览器中查看博客的最新效果。"}</p>
          </div>
          <div className="control-card-actions">
            {serveAddr ? (
              <mdui-button variant="outlined" onClick={handleStopServe} loading={serveLoading || undefined} icon="stop">
                停止服务
              </mdui-button>
            ) : (
              <mdui-button variant="filled" onClick={handleStartServe} loading={serveLoading || undefined} icon="play_arrow">
                启动预览
              </mdui-button>
            )}
          </div>
        </mdui-card>

        <mdui-card class="control-card" variant="elevated">
          <div className="control-card-icon" aria-hidden="true">
            <mdui-icon name="language" />
          </div>
          <div className="control-card-copy">
            <div className="control-card-heading">发布工具</div>
            <h3>构建与部署</h3>
            <p>构建网站，或直接发布到你的线上站点。</p>
          </div>
          <div className="control-card-actions control-card-actions-group">
            <mdui-button class="control-build-button" variant="filled" onClick={handleBuild} icon="build" disabled={buildState === "building" || deployBusy || undefined}>
              构建
            </mdui-button>
            <div className="control-deploy-button">
              <DeployButton
                sites={sites}
                disabled={!!deployDisabledReason()}
                disabledReason={deployDisabledReason()}
                onSelect={(site) => startDeploy(site, { rebuild: true })}
              />
            </div>
          </div>
        </mdui-card>

        <mdui-card class="control-card" variant="elevated">
          <div className="control-card-icon" aria-hidden="true">
            <mdui-icon name="cloud_upload" />
          </div>
          <div className="control-card-copy">
            <div className={`control-card-heading${syncAvailable ? "" : " is-warning"}`}>
              {syncAvailable ? "远程存储已连接" : "需要配置远程存储"}
            </div>
            <h3>媒体同步</h3>
            <p>{syncAvailable ? "上传新增或修改过的相册文件。" : "配置存储服务后即可同步相册原图。"}</p>
          </div>
          <div className="control-card-actions">
            <mdui-button
              variant="filled"
              onClick={handleSync}
              icon="cloud_upload"
              disabled={!syncAvailable || syncState === "syncing" || undefined}
            >
              开始同步
            </mdui-button>
          </div>
        </mdui-card>
      </div>

      {/* ── Build Dialog ── */}
      <mdui-dialog ref={buildDialogRef} class="wide-dialog" close-on-overlay-click={buildState !== "building" && buildState !== "cancelling" || undefined}>
        <span slot="headline">生成网站</span>
        <div slot="description" style={{ minHeight: 120, width: "100%" }}>
          {(buildState === "building" || buildState === "cancelling") && (
            <>
              <mdui-linear-progress></mdui-linear-progress>
              {buildState === "cancelling" && <p className="mt-2 text-sm" style={{ color: "#ea580c" }}>正在等待当前操作完成后取消...</p>}
              <div ref={buildLogRef} className="mt-3 text-sm max-h-48 overflow-y-auto" style={{ whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: 12 }}>
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
        <div slot="action" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
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
              {buildState === "success" && (
                <DeployButton
                  sites={sites}
                  size="small"
                  disabled={!!deployDisabledReason()}
                  disabledReason={deployDisabledReason()}
                  onSelect={(site) => startDeploy(site, { rebuild: false })}
                />
              )}
            </>
          )}
        </div>
      </mdui-dialog>

      {/* ── Deploy Dialog ── */}
      <mdui-dialog
        ref={deployDialogRef}
        class={deployBusy ? "wide-dialog" : undefined}
        close-on-overlay-click={!deployBusy || undefined}
        close-on-esc={!deployBusy || undefined}
      >
        <span slot="headline">
          部署到 {deployTarget ? deployTarget.hostname : ""}
        </span>
        <div slot="description" style={{ minHeight: deployBusy ? 160 : undefined, width: "100%" }}>
          {deployBusy && (
            <>
              {deployPercent < 0 ? (
                <mdui-linear-progress></mdui-linear-progress>
              ) : (
                <mdui-linear-progress value={deployPercent} max={100}></mdui-linear-progress>
              )}
              <p className="mt-2 text-sm font-medium">{deployPhase}</p>
              {deployState === "cancelling" && (
                <p className="mt-1 text-sm" style={{ color: "#ea580c" }}>正在取消部署...</p>
              )}
              <div ref={deployLogRef} className="mt-3 text-sm max-h-48 overflow-y-auto" style={{ whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: 12 }}>
                {deployLogs.map((l, i) => (
                  <p key={i} className="mb-1">{l}</p>
                ))}
              </div>
            </>
          )}
          {deployState === "success" && (
            <div className="text-sm">
              <p style={{ color: "#16a34a", fontWeight: 500, marginBottom: 8 }}>✓ 部署完成，站点已上线</p>
              <a
                href={deployUrl}
                onClick={(e) => { e.preventDefault(); openDeployedSite(); }}
                className="break-all inline-flex items-center gap-1"
                style={{ color: "#2563eb", textDecoration: "underline", cursor: "pointer" }}
              >
                {deployUrl}
                <mdui-icon name="open_in_new" style={{ fontSize: 14 }} />
              </a>
            </div>
          )}
          {deployState === "error" && (
            <div className="text-sm">
              <p style={{ color: "#dc2626", marginBottom: 8 }}>{deployError}</p>
              <div className="max-h-40 overflow-y-auto" style={{ whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: 12, color: "#6b7280" }}>
                {deployLogs.map((l, i) => (
                  <p key={i} className="mb-1">{l}</p>
                ))}
              </div>
            </div>
          )}
        </div>
        <div slot="action" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
          {deployBusy && (
            <mdui-button
              variant="text"
              onClick={handleCancelDeploy}
              loading={deployState === "cancelling" || undefined}
              disabled={deployState === "cancelling" || undefined}
            >
              {deployState === "cancelling" ? "正在取消..." : "取消"}
            </mdui-button>
          )}
          {deployState === "success" && (
            <mdui-button variant="text" onClick={closeDeployDialog}>
              关闭
            </mdui-button>
          )}
          {deployState === "error" && (
            <mdui-button variant="text" onClick={closeDeployDialog}>
              关闭
            </mdui-button>
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
