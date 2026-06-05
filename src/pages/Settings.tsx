import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  blogDir: string;
}

export function Settings({ blogDir }: Props) {
  const [siteConfig, setSiteConfig] = useState("");
  const [albumConfig, setAlbumConfig] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    invoke<{ raw: string }>("read_config", { blogDir, filename: "config.json" }).then((r) =>
      setSiteConfig(r.raw)
    );
    invoke<{ raw: string }>("read_config", { blogDir, filename: "album.config.json" }).then((r) =>
      setAlbumConfig(r.raw)
    );
  }, [blogDir]);

  const saveSiteConfig = async () => {
    setSaving(true);
    await invoke("write_config", { blogDir, filename: "config.json", content: siteConfig });
    setSaving(false);
  };

  const saveAlbumConfig = async () => {
    setSaving(true);
    await invoke("write_config", { blogDir, filename: "album.config.json", content: albumConfig });
    setSaving(false);
  };

  return (
    <div className="p-6 space-y-8 max-w-3xl">
      {/* 网站设置 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-medium">网站设置</h2>
          <mdui-button variant="tonal" loading={saving || undefined} onClick={saveSiteConfig}>
            保存
          </mdui-button>
        </div>
        <p className="text-sm text-gray-500 mb-2">config.json - 站点标题、描述、作者等</p>
        <textarea
          className="w-full h-64 p-4 font-mono text-sm border rounded resize-none"
          value={siteConfig}
          onChange={(e) => setSiteConfig(e.target.value)}
          spellCheck={false}
        />
      </section>

      {/* 相册设置 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-medium">相册设置</h2>
          <mdui-button variant="tonal" loading={saving || undefined} onClick={saveAlbumConfig}>
            保存
          </mdui-button>
        </div>
        <p className="text-sm text-gray-500 mb-2">album.config.json - 相册启用状态、列表配置</p>
        <textarea
          className="w-full h-48 p-4 font-mono text-sm border rounded resize-none"
          value={albumConfig}
          onChange={(e) => setAlbumConfig(e.target.value)}
          spellCheck={false}
        />
      </section>

      {/* 软件设置 */}
      <section>
        <h2 className="text-xl font-medium mb-3">软件设置</h2>
        <mdui-card class="p-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">博客目录</p>
                <p className="text-sm text-gray-500">{blogDir}</p>
              </div>
              <mdui-button
                variant="text"
                onClick={() => invoke("open_in_explorer", { path: blogDir })}
              >
                打开
              </mdui-button>
            </div>
            <mdui-divider></mdui-divider>
            <div>
              <p className="font-medium">版本</p>
              <p className="text-sm text-gray-500">S-Blog Admin v0.2.0</p>
            </div>
          </div>
        </mdui-card>
      </section>
    </div>
  );
}
