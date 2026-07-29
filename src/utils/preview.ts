import { invoke } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";

export interface ServeStatus {
  addr: string;
  blog_dir: string;
}

const isWindows = platform() === "windows";

const normalizeDirectory = (path: string) => {
  const normalized = path.replace(/\\/g, "/").replace(/\/$/, "");
  return isWindows ? normalized.toLowerCase() : normalized;
};

export const sameDirectory = (left: string, right: string) =>
  normalizeDirectory(left) === normalizeDirectory(right);

export async function getPreviewAddress(blogDir: string): Promise<string> {
  const status = await invoke<ServeStatus | null>("get_serve_status");
  if (status && sameDirectory(status.blog_dir, blogDir)) return status.addr;
  return invoke<string>("start_serve", { blogDir, openBrowser: false });
}

export const getPreviewStatus = () =>
  invoke<ServeStatus | null>("get_serve_status");

export const stopPreview = () => invoke<void>("stop_serve");
