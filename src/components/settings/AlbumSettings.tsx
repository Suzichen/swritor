import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { parseConfig, serializeConfig } from "../../utils/configParser";

interface AlbumProvider {
  type: string;
  endpoint: string;
  region: string;
  bucket: string;
  publicUrl: string;
}

interface Props {
  blogDir: string;
  open: boolean;
  onCancel: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}

const DEFAULT_PROVIDER: AlbumProvider = {
  type: "s3",
  endpoint: "",
  region: "",
  bucket: "",
  publicUrl: "",
};

export function AlbumSettings({
  blogDir,
  open,
  onCancel,
  onSaved,
  onError,
}: Props) {
  const configRef = useRef<any>({});
  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState<AlbumProvider>(DEFAULT_PROVIDER);
  const [s3AccessKey, setS3AccessKey] = useState("");
  const [s3SecretKey, setS3SecretKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    const loadConfig = async () => {
      setLoading(true);
      try {
        const [{ raw }, env] = await Promise.all([
          invoke<{ raw: string }>("read_config", {
            blogDir,
            filename: "album.config.json",
          }),
          invoke<{ s3_access_key: string | null; s3_secret_key: string | null }>(
            "read_env",
            { blogDir },
          ),
        ]);

        try {
          const parsed = parseConfig(raw);
          configRef.current = parsed;
          setEnabled(parsed.enabled ?? false);
          setProvider({
            type: parsed.provider?.type ?? "s3",
            endpoint: parsed.provider?.endpoint ?? "",
            region: parsed.provider?.region ?? "",
            bucket: parsed.provider?.bucket ?? "",
            publicUrl: parsed.provider?.publicUrl ?? "",
          });
        } catch (error) {
          console.error("Failed to parse album settings", error);
          configRef.current = {};
          setEnabled(false);
          setProvider(DEFAULT_PROVIDER);
          onError(`解析相册设置失败: ${String(error)}`);
        }

        setS3AccessKey(env.s3_access_key ?? "");
        setS3SecretKey(env.s3_secret_key ?? "");
      } catch (error) {
        console.error("Failed to load album settings", error);
        onError(`加载相册设置失败: ${String(error)}`);
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, [blogDir, open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const config = configRef.current || {};
      config.enabled = enabled;
      config.provider = provider;

      await invoke("write_config", {
        blogDir,
        filename: "album.config.json",
        content: serializeConfig(config),
      });

      await invoke("write_env", { blogDir, s3AccessKey, s3SecretKey });

      onSaved();
    } catch (error) {
      console.error("Failed to save album settings", error);
      onError(`保存相册设置失败: ${String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <mdui-linear-progress />;
  }

  return (
    <div className="w-full min-w-0 space-y-4">
      <div className="flex items-center justify-between">
        <span className="font-medium">启用相册</span>
        <mdui-switch
          checked={enabled || undefined}
          onChange={(event: any) => setEnabled(event.target.checked)}
        />
      </div>

      <div className="space-y-3 [&>mdui-select]:w-full [&>mdui-text-field]:w-full">
        <mdui-select
          variant="outlined"
          label="存储类型"
          value={provider.type}
          disabled={!enabled || undefined}
          onChange={(event: any) =>
            setProvider({ ...provider, type: event.target.value })
          }
        >
          <mdui-menu-item value="s3">S3 兼容存储</mdui-menu-item>
        </mdui-select>
        <mdui-text-field
          variant="outlined"
          label="Endpoint"
          value={provider.endpoint}
          disabled={!enabled || undefined}
          placeholder="https://s3.amazonaws.com"
          onInput={(event: any) =>
            setProvider({ ...provider, endpoint: event.target.value })
          }
        />
        <mdui-text-field
          variant="outlined"
          label="Region"
          value={provider.region}
          disabled={!enabled || undefined}
          placeholder="us-east-1"
          onInput={(event: any) =>
            setProvider({ ...provider, region: event.target.value })
          }
        />
        <mdui-text-field
          variant="outlined"
          label="Bucket"
          value={provider.bucket}
          disabled={!enabled || undefined}
          onInput={(event: any) =>
            setProvider({ ...provider, bucket: event.target.value })
          }
        />
        <mdui-text-field
          variant="outlined"
          label="Public URL"
          value={provider.publicUrl}
          disabled={!enabled || undefined}
          placeholder="https://cdn.example.com"
          onInput={(event: any) =>
            setProvider({ ...provider, publicUrl: event.target.value })
          }
        />
        <mdui-text-field
          variant="outlined"
          label="S3 Access Key"
          value={s3AccessKey}
          disabled={!enabled || undefined}
          type="password"
          toggle-password
          onInput={(event: any) => setS3AccessKey(event.target.value)}
        />
        <mdui-text-field
          variant="outlined"
          label="S3 Secret Key"
          value={s3SecretKey}
          disabled={!enabled || undefined}
          type="password"
          toggle-password
          onInput={(event: any) => setS3SecretKey(event.target.value)}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <mdui-button variant="text" disabled={saving || undefined} onClick={onCancel}>
          取消
        </mdui-button>
        <mdui-button
          variant="tonal"
          loading={saving || undefined}
          onClick={handleSave}
        >
          保存
        </mdui-button>
      </div>

    </div>
  );
}
