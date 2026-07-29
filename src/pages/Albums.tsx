import { useEffect, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { AlbumSettings } from "../components/settings/AlbumSettings";

interface AlbumPhoto {
  filename: string;
}

interface AlbumInfo {
  dir: string;
  name: string | null;
  desc: string | null;
  cover: string | null;
  configured_cover: string | null;
  photo_count: number;
  photos: AlbumPhoto[];
}

interface Props {
  blogDir: string;
}

type DeleteTarget =
  | { type: "album"; dir: string; label: string }
  | { type: "photo"; dir: string; filename: string };

export function Albums({ blogDir }: Props) {
  const [albums, setAlbums] = useState<AlbumInfo[]>([]);
  const [selectedDir, setSelectedDir] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [albumInfoOpen, setAlbumInfoOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [newDir, setNewDir] = useState("");
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [snackOpen, setSnackOpen] = useState(false);
  const [snackMessage, setSnackMessage] = useState("");

  const selectedAlbum = albums.find((album) => album.dir === selectedDir) ?? null;

  const notify = (message: string) => {
    setSnackMessage(message);
    setSnackOpen(true);
  };

  const loadAlbums = async (preferredDir?: string | null, showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const list = await invoke<AlbumInfo[]>("list_albums", { blogDir });
      setAlbums(list);
      const nextDir = preferredDir === undefined ? selectedDir : preferredDir;
      setSelectedDir(nextDir && list.some((album) => album.dir === nextDir) ? nextDir : null);
    } catch (error) {
      console.error("Failed to load albums", error);
      notify(`加载相册失败: ${String(error)}`);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    void loadAlbums(null);
  }, [blogDir]);

  useEffect(() => {
    setEditName(selectedAlbum?.name ?? "");
    setEditDesc(selectedAlbum?.desc ?? "");
  }, [selectedAlbum?.dir, selectedAlbum?.name, selectedAlbum?.desc]);

  const photoUrl = (dir: string, filename: string) =>
    convertFileSrc(`${blogDir}/albums/${dir}/${filename}`);

  const handleCreate = async () => {
    const dir = newDir.trim();
    if (!dir) {
      notify("请输入相册目录名");
      return;
    }
    setBusy(true);
    try {
      await invoke("create_album", {
        blogDir,
        dir,
        name: newName.trim() || null,
        desc: newDesc.trim() || null,
      });
      setCreateOpen(false);
      setNewDir("");
      setNewName("");
      setNewDesc("");
      await loadAlbums(dir);
      notify("相册已创建");
    } catch (error) {
      notify(`创建相册失败: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveMetadata = async () => {
    if (!selectedAlbum) return;
    setBusy(true);
    try {
      await invoke("update_album", {
        blogDir,
        dir: selectedAlbum.dir,
        name: editName.trim() || null,
        desc: editDesc.trim() || null,
        cover: selectedAlbum.configured_cover,
      });
      await loadAlbums(selectedAlbum.dir);
      setAlbumInfoOpen(false);
      notify("相册信息已保存");
    } catch (error) {
      notify(`保存失败: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleAddPhotosFor = async (dir: string, preferredDir: string | null = null) => {
    try {
      const sources = await invoke<string[]>("select_album_photos");
      if (!sources.length) return;
      setBusy(true);
      const count = await invoke<number>("add_album_photos", {
        blogDir,
        dir,
        sources,
      });
      await loadAlbums(preferredDir);
      notify(`已添加 ${count} 张照片`);
    } catch (error) {
      notify(`添加照片失败: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleAddPhotos = async () => {
    if (!selectedAlbum) return;
    await handleAddPhotosFor(selectedAlbum.dir, selectedAlbum.dir);
  };

  const handleSetCover = async (filename: string) => {
    if (!selectedAlbum) return;
    setBusy(true);
    try {
      await invoke("update_album", {
        blogDir,
        dir: selectedAlbum.dir,
        name: editName.trim() || null,
        desc: editDesc.trim() || null,
        cover: filename,
      });
      setAlbums((current) => current.map((album) =>
        album.dir === selectedAlbum.dir
          ? { ...album, cover: filename, configured_cover: filename }
          : album
      ));
      notify("封面已更新");
    } catch (error) {
      notify(`设置封面失败: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const handlePreview = async (dir: string, event?: React.MouseEvent) => {
    event?.stopPropagation();
    try {
      let addr = await invoke<string | null>("get_serve_status");
      if (!addr) {
        addr = await invoke<string>("start_serve", { blogDir, openBrowser: false });
      }
      await invoke("open_url", { url: `${addr}/albums/${encodeURIComponent(dir)}/` });
    } catch (error) {
      notify(`打开预览失败: ${String(error)}`);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      if (deleteTarget.type === "album") {
        await invoke("delete_album", { blogDir, dir: deleteTarget.dir });
        await loadAlbums(null);
        notify("相册已删除");
      } else {
        await invoke("delete_album_photo", {
          blogDir,
          dir: deleteTarget.dir,
          filename: deleteTarget.filename,
        });
        await loadAlbums(deleteTarget.dir);
        notify("照片已删除");
      }
      setDeleteTarget(null);
    } catch (error) {
      notify(`删除失败: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="workspace-page albums-page">
      <header className={`workspace-header albums-header${selectedAlbum ? " album-detail-header" : ""}`}>
        <div className="album-header-title">
          {selectedAlbum && (
            <mdui-button-icon
              icon="arrow_back"
              aria-label="返回相册列表"
              onClick={() => setSelectedDir(null)}
            />
          )}
          <div>
            <h2>{selectedAlbum ? selectedAlbum.name || selectedAlbum.dir : "相册"}</h2>
            <p>
              {selectedAlbum
                ? `${selectedAlbum.photo_count} 张照片 · ${selectedAlbum.dir}`
                : loading
                  ? "正在读取相册"
                  : `${albums.length} 个相册`}
            </p>
          </div>
        </div>
        <div className="albums-header-actions">
          {selectedAlbum ? (
            <>
              <mdui-button-icon
                icon="info_outline"
                aria-label="相册信息"
                onClick={() => setAlbumInfoOpen(true)}
              />
              <mdui-button variant="filled" icon="add_photo_alternate" disabled={busy || undefined} onClick={handleAddPhotos}>
                添加照片
              </mdui-button>
            </>
          ) : (
            <>
              <mdui-tooltip content="相册设置" trigger="hover">
                <mdui-button-icon icon="settings" aria-label="相册设置" onClick={() => setSettingsOpen(true)} />
              </mdui-tooltip>
              <mdui-button variant="filled" icon="create_new_folder" onClick={() => setCreateOpen(true)}>
                新建相册
              </mdui-button>
            </>
          )}
        </div>
      </header>

      {loading ? (
        <div className="albums-loading"><mdui-linear-progress /></div>
      ) : selectedAlbum ? (
        <>
          <div className="album-detail-layout">
            <section className="album-photo-section">
              <div className="album-photo-heading">
                <div>
                  <h3>照片</h3>
                  <p>支持 JPG、PNG、WebP 和 AVIF。</p>
                </div>
                <span className="album-photo-count">{selectedAlbum.photo_count} 张</span>
              </div>
              {selectedAlbum.photos.length === 0 ? (
                <div className="album-photo-empty">
                  <mdui-icon name="add_photo_alternate" />
                  <h3>这个相册还是空的</h3>
                  <p>添加照片后，可以在这里选择封面和管理内容。</p>
                  <mdui-button variant="tonal" icon="add_photo_alternate" onClick={handleAddPhotos}>
                    添加照片
                  </mdui-button>
                </div>
              ) : (
                <div className="album-photo-grid">
                  {selectedAlbum.photos.map((photo) => {
                    const isCover = selectedAlbum.configured_cover === photo.filename;
                    return (
                      <article
                        className="album-photo-item"
                        key={photo.filename}
                      >
                        <div className="album-photo-media">
                          <img src={photoUrl(selectedAlbum.dir, photo.filename)} alt={photo.filename} />
                          {isCover && <span className="album-cover-label">封面</span>}
                          <div className="album-photo-menu-anchor" onClick={(event) => event.stopPropagation()}>
                            <mdui-dropdown placement="bottom-end">
                              <mdui-button-icon
                                slot="trigger"
                                icon="more_vert"
                                aria-label={`管理 ${photo.filename}`}
                                disabled={busy || undefined}
                              />
                              <mdui-menu dense>
                                <mdui-menu-item
                                  icon="image"
                                  disabled={isCover || undefined}
                                  onClick={(event: any) => {
                                    event.stopPropagation();
                                    void handleSetCover(photo.filename);
                                  }}
                                >
                                  {isCover ? "当前封面" : "设为封面"}
                                </mdui-menu-item>
                                <mdui-menu-item
                                  class="album-danger-menu-item"
                                  icon="delete"
                                  onClick={(event: any) => {
                                    event.stopPropagation();
                                    setDeleteTarget({
                                      type: "photo",
                                      dir: selectedAlbum.dir,
                                      filename: photo.filename,
                                    });
                                  }}
                                >
                                  删除照片
                                </mdui-menu-item>
                              </mdui-menu>
                            </mdui-dropdown>
                          </div>
                        </div>
                        <div className="album-photo-toolbar">
                          <span title={photo.filename}>{photo.filename}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <mdui-navigation-drawer
            class="album-info-drawer"
            open={albumInfoOpen || undefined}
            placement="right"
            modal
            close-on-esc
            close-on-overlay-click
            onclose={() => setAlbumInfoOpen(false)}
          >
            <div className="album-info-drawer-content">
              <div className="album-editor-heading">
                <div>
                  <h3>相册信息</h3>
                  <p>目录名会用于公开链接，创建后不可修改。</p>
                </div>
                <mdui-button-icon icon="close" aria-label="关闭" onClick={() => setAlbumInfoOpen(false)} />
              </div>
              <mdui-text-field variant="outlined" label="目录名" value={selectedAlbum.dir} readonly />
              <mdui-text-field
                variant="outlined"
                label="名称"
                value={editName}
                placeholder={selectedAlbum.dir}
                onInput={(event: any) => setEditName(event.target.value)}
              />
              <mdui-text-field
                variant="outlined"
                label="说明"
                value={editDesc}
                rows={5}
                autosize
                placeholder="记录这个相册的主题或故事"
                onInput={(event: any) => setEditDesc(event.target.value)}
              />
              <mdui-button variant="tonal" loading={busy || undefined} onClick={handleSaveMetadata}>
                保存信息
              </mdui-button>
              <mdui-divider />
              <mdui-button
                class="album-danger-button"
                variant="text"
                icon="delete"
                disabled={busy || undefined}
                onClick={() => setDeleteTarget({
                  type: "album",
                  dir: selectedAlbum.dir,
                  label: selectedAlbum.name || selectedAlbum.dir,
                })}
              >
                删除相册
              </mdui-button>
            </div>
          </mdui-navigation-drawer>
        </>
      ) : albums.length === 0 ? (
        <mdui-card class="album-empty-state" variant="outlined">
          <div className="album-empty-icon"><mdui-icon name="photo_library" /></div>
          <h3>还没有相册</h3>
          <p>创建相册并添加照片，名称、说明和封面都可以随时调整。</p>
          <mdui-button variant="tonal" icon="create_new_folder" onClick={() => setCreateOpen(true)}>
            创建相册
          </mdui-button>
        </mdui-card>
      ) : (
        <div className="album-grid">
          {albums.map((album) => (
            <mdui-card
              key={album.dir}
              class="album-card"
              variant="outlined"
              tabIndex={0}
              onClick={() => setSelectedDir(album.dir)}
              onKeyDown={(event: any) => {
                if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  setSelectedDir(album.dir);
                }
              }}
            >
              <div className="album-card-cover">
                {album.cover ? (
                  <img src={photoUrl(album.dir, album.cover)} alt={album.name || album.dir} />
                ) : (
                  <mdui-icon name="photo_library" />
                )}
                <div className="album-card-menu-anchor" onClick={(event) => event.stopPropagation()}>
                  <mdui-dropdown placement="bottom-end">
                    <mdui-button-icon
                      slot="trigger"
                      icon="more_vert"
                      aria-label={`管理相册 ${album.name || album.dir}`}
                    />
                    <mdui-menu dense>
                      <mdui-menu-item icon="edit" onClick={(event: any) => {
                        event.stopPropagation();
                        setSelectedDir(album.dir);
                        setAlbumInfoOpen(true);
                      }}>
                        编辑相册信息
                      </mdui-menu-item>
                      <mdui-menu-item icon="add_photo_alternate" onClick={(event: any) => {
                        event.stopPropagation();
                        void handleAddPhotosFor(album.dir);
                      }}>
                        追加照片
                      </mdui-menu-item>
                      <mdui-menu-item icon="visibility" onClick={(event: any) => handlePreview(album.dir, event)}>
                        预览
                      </mdui-menu-item>
                      <mdui-menu-item class="album-danger-menu-item" icon="delete" onClick={(event: any) => {
                        event.stopPropagation();
                        setDeleteTarget({
                          type: "album",
                          dir: album.dir,
                          label: album.name || album.dir,
                        });
                      }}>
                        删除相册
                      </mdui-menu-item>
                    </mdui-menu>
                  </mdui-dropdown>
                </div>
              </div>
              <div className="album-card-body">
                <div>
                  <h3>{album.name || album.dir}</h3>
                  <p title={album.desc || "暂无说明"}>{album.desc || "暂无说明"}</p>
                </div>
                <span>{album.photo_count} 张</span>
              </div>
            </mdui-card>
          ))}
        </div>
      )}

      <mdui-dialog open={createOpen || undefined} headline="新建相册" close-on-esc close-on-overlay-click>
        <div className="album-dialog-fields">
          <mdui-text-field
            variant="outlined"
            label="目录名"
            value={newDir}
            required
            helper="只能包含字母、数字、下划线或连字符"
            onInput={(event: any) => setNewDir(event.target.value)}
          />
          <mdui-text-field variant="outlined" label="名称" value={newName} onInput={(event: any) => setNewName(event.target.value)} />
          <mdui-text-field
            variant="outlined"
            label="说明"
            value={newDesc}
            rows={4}
            autosize
            onInput={(event: any) => setNewDesc(event.target.value)}
          />
        </div>
        <mdui-button slot="action" variant="text" disabled={busy || undefined} onClick={() => setCreateOpen(false)}>取消</mdui-button>
        <mdui-button slot="action" variant="text" loading={busy || undefined} onClick={handleCreate}>创建</mdui-button>
      </mdui-dialog>

      <mdui-dialog open={Boolean(deleteTarget) || undefined} headline="确认删除">
        <div className="px-6 pb-2">
          {deleteTarget?.type === "album"
            ? `确定删除相册「${deleteTarget.label}」及其中全部照片吗？此操作不可撤销。`
            : `确定删除照片「${deleteTarget?.filename ?? ""}」吗？此操作不可撤销。`}
        </div>
        <mdui-button slot="action" variant="text" disabled={busy || undefined} onClick={() => setDeleteTarget(null)}>取消</mdui-button>
        <mdui-button class="album-danger-button" slot="action" variant="text" loading={busy || undefined} onClick={handleDelete}>删除</mdui-button>
      </mdui-dialog>

      <mdui-navigation-drawer
        class="album-settings-drawer"
        open={settingsOpen || undefined}
        placement="right"
        modal
        close-on-esc
        close-on-overlay-click
        onclose={() => setSettingsOpen(false)}
      >
        <div className="box-border h-full w-full min-w-0 overflow-y-auto overflow-x-hidden p-6">
          <h2 className="text-xl font-medium mb-6">相册设置</h2>
          <AlbumSettings
            blogDir={blogDir}
            open={settingsOpen}
            onCancel={() => setSettingsOpen(false)}
            onSaved={() => {
              setSettingsOpen(false);
              void loadAlbums();
              notify("保存成功");
            }}
            onError={notify}
          />
        </div>
      </mdui-navigation-drawer>

      <mdui-snackbar
        open={snackOpen || undefined}
        placement="top"
        auto-close-delay={2500}
        onclose={() => setSnackOpen(false)}
      >
        {snackMessage}
      </mdui-snackbar>
    </div>
  );
}
