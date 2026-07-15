import { useEffect, useState, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { platform } from "@tauri-apps/plugin-os";

type WindowShellProps = {
  children: ReactNode;
};

const appWindow = getCurrentWindow();
const isMacOS = platform() === "macos";

function CustomTitlebar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const syncMaximized = async () => setIsMaximized(await appWindow.isMaximized());

    void syncMaximized();
    const unlisten = appWindow.onResized(syncMaximized);

    return () => {
      void unlisten.then((stopListening) => stopListening());
    };
  }, []);

  const minimize = () => appWindow.minimize();
  const toggleMaximize = () => appWindow.toggleMaximize();
  const close = () => appWindow.close();

  return (
    <header className="window-titlebar" data-tauri-drag-region>
      <div className="window-title" data-tauri-drag-region>
        <span
          className="material-icons window-title-icon"
          data-tauri-drag-region
          aria-hidden="true"
        >
          edit_note
        </span>
        Swritor
      </div>
      <div className="window-controls">
        <button className="window-control" type="button" aria-label="最小化" onClick={minimize}>
          <span className="material-icons" aria-hidden="true">remove</span>
        </button>
        <button
          className="window-control"
          type="button"
          aria-label={isMaximized ? "还原" : "最大化"}
          onClick={toggleMaximize}
        >
          <span className="material-icons" aria-hidden="true">
            {isMaximized ? "filter_none" : "crop_square"}
          </span>
        </button>
        <button className="window-control window-control-close" type="button" aria-label="关闭" onClick={close}>
          <span className="material-icons" aria-hidden="true">close</span>
        </button>
      </div>
    </header>
  );
}

export function WindowShell({ children }: WindowShellProps) {
  if (isMacOS) {
    return <main className="app-content app-content-native">{children}</main>;
  }

  return (
    <div className="app-shell">
      <CustomTitlebar />
      <main className="app-content">{children}</main>
    </div>
  );
}
