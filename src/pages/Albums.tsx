import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { AlbumSettings } from "../components/settings/AlbumSettings";

interface AlbumInfo {
  dir: string;
  name: string | null;
  cover: string | null;
  photo_count: number;
}

interface Props {
  blogDir: string;
}

export function Albums({ blogDir }: Props) {
  const [albums, setAlbums] = useState<AlbumInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    invoke<AlbumInfo[]>("list_albums", { blogDir }).then((list) => {
      setAlbums(list);
      setLoading(false);
    });
  }, [blogDir]);


  const getCoverUrl = (album: AlbumInfo) => {
    if (!album.cover) return null;
    const coverPath = `${blogDir}/albums/${album.dir}/${album.cover}`;
    return convertFileSrc(coverPath);
  };

  return (
    <div className="relative min-h-full overflow-hidden">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-medium">相册列表</h2>
          <mdui-tooltip content="相册设置" trigger="hover">
            <mdui-button-icon
              icon="settings"
              onClick={() => setSettingsOpen(true)}
            />
          </mdui-tooltip>
        </div>

        {loading ? (
          <mdui-linear-progress></mdui-linear-progress>
        ) : albums.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            <p>暂无相册</p>
            <p className="text-sm mt-2">
              在博客目录的 albums/ 下创建子目录即可添加相册
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {albums.map((album) => {
              const coverUrl = getCoverUrl(album);
              return (
                <mdui-card key={album.dir} class="overflow-hidden">
                  {coverUrl ? (
                    <div className="w-full h-40 overflow-hidden">
                      <img
                        src={coverUrl}
                        alt={album.name || album.dir}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-40 bg-gray-100 flex items-center justify-center">
                      <mdui-icon
                        name="photo_library"
                        style={{ fontSize: "48px", opacity: 0.3 }}
                      ></mdui-icon>
                    </div>
                  )}
                  <div className="p-4">
                    <h3 className="font-medium">{album.name || album.dir}</h3>
                    <p className="text-sm text-gray-500">
                      {album.photo_count} 张照片
                    </p>
                  </div>
                </mdui-card>
              );
            })}
          </div>
        )}
      </div>

      <mdui-navigation-drawer
        class="album-settings-drawer"
        open={settingsOpen || undefined}
        placement="right"
        modal
        contained
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
          />
        </div>
      </mdui-navigation-drawer>
    </div>
  );
}
