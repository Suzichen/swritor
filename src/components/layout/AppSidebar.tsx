import { useEffect, useLayoutEffect, useState } from "react";
import type { UserInfo } from "../../hooks/useAuth";

export type AppPage = "control" | "posts" | "albums" | "settings";

interface AppSidebarProps {
  page: AppPage;
  setPage: (page: AppPage) => void;
  blogDir: string;
  isConfigured: boolean;
  isLoggedIn: boolean;
  user: UserInfo | null;
  logout: () => Promise<void>;
  onInit: () => void;
  selectBlogDir: () => Promise<void>;
  onLogin: () => void;
  onCollapsedChange: (collapsed: boolean) => void;
}

interface SidebarActionBase {
  label: string;
  icon: string;
  onClick: () => void;
}

type SidebarAction =
  | (SidebarActionBase & {
      presentation: "button";
      showExpandedIcon?: boolean;
    })
  | (SidebarActionBase & {
      presentation: "account";
      accountLabel: string;
    });

// The app defaults to its compact rail below 720px. MDUI's separate
// 840px breakpoint is handled in CSS to keep the drawer persistent.
const SIDEBAR_COMPACT_QUERY = "(max-width: 719px)";

const MENU_ITEMS: Array<{
  page: AppPage;
  icon: string;
  label: string;
  displayLabel: string;
}> = [
  { page: "control", icon: "dashboard", label: "控制中心", displayLabel: "控制中心" },
  { page: "posts", icon: "article", label: "文章", displayLabel: "文　章" },
  { page: "albums", icon: "photo_library", label: "相册", displayLabel: "相　册" },
  { page: "settings", icon: "settings", label: "设置", displayLabel: "设　置" },
];

export function AppSidebar({
  page,
  setPage,
  blogDir,
  isConfigured,
  isLoggedIn,
  user,
  logout,
  onInit,
  selectBlogDir,
  onLogin,
  onCollapsedChange,
}: AppSidebarProps) {
  const [isCompactViewport, setIsCompactViewport] = useState(
    () => window.matchMedia(SIDEBAR_COMPACT_QUERY).matches,
  );
  const [wideViewportCollapsed, setWideViewportCollapsed] = useState(false);
  const [compactViewportExpanded, setCompactViewportExpanded] = useState(false);
  const collapsed = isCompactViewport
    ? !compactViewportExpanded
    : wideViewportCollapsed;

  useEffect(() => {
    const mediaQuery = window.matchMedia(SIDEBAR_COMPACT_QUERY);
    const updateViewport = (event: MediaQueryListEvent) => {
      setIsCompactViewport(event.matches);
      if (event.matches) setCompactViewportExpanded(false);
    };

    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  useLayoutEffect(() => {
    onCollapsedChange(collapsed);
  }, [collapsed, onCollapsedChange]);

  const actions: SidebarAction[] = [
    {
      presentation: "button",
      label: "初始化新博客",
      icon: "add_box",
      onClick: onInit,
    },
    {
      presentation: "button",
      label: "切换目录",
      icon: "folder_open",
      onClick: () => void selectBlogDir(),
    },
  ];

  if (isConfigured) {
    actions.push(
      isLoggedIn
        ? {
            presentation: "account",
            label: "退出登录",
            accountLabel: user?.siteSlug ? `${user.siteSlug}.spage.me` : "已登录",
            icon: "logout",
            onClick: () => void logout(),
          }
        : {
            presentation: "button",
            label: "登录",
            icon: "person",
            showExpandedIcon: true,
            onClick: onLogin,
          },
    );
  }

  return (
    <mdui-navigation-drawer
      class={`app-sidebar${collapsed ? " app-sidebar-collapsed" : ""}`}
      open
      contained
    >
      <div className="app-sidebar-header">
        {!collapsed && (
          <div className="app-sidebar-title">
            <h1>Swritor</h1>
            <p title={blogDir}>{blogDir.split(/[/\\]/).pop()}</p>
          </div>
        )}
        <mdui-tooltip
          content={collapsed ? "展开侧栏" : "收起侧栏"}
          placement="right"
          trigger="hover"
        >
          <mdui-button-icon
            icon={collapsed ? "menu" : "menu_open"}
            aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
            onClick={() => {
              if (isCompactViewport) {
                setCompactViewportExpanded(collapsed);
              } else {
                setWideViewportCollapsed(!collapsed);
              }
            }}
          />
        </mdui-tooltip>
      </div>

      <mdui-list>
        {MENU_ITEMS.map((item) => (
          <mdui-tooltip
            key={item.page}
            content={item.label}
            placement="right"
            trigger="hover"
            disabled={!collapsed}
          >
            <mdui-list-item
              active={page === item.page ? true : undefined}
              icon={item.icon}
              aria-label={item.label}
              onClick={() => setPage(item.page)}
            >
              {item.displayLabel}
            </mdui-list-item>
          </mdui-tooltip>
        ))}
      </mdui-list>

      <div className="app-sidebar-actions">
        {actions.map((action) =>
          collapsed ? (
            <mdui-tooltip
              key={action.label}
              content={action.label}
              placement="right"
              trigger="hover"
            >
              <mdui-button-icon
                icon={action.icon}
                aria-label={action.label}
                onClick={action.onClick}
              />
            </mdui-tooltip>
          ) : action.presentation === "account" ? (
            <div key={action.label} className="app-sidebar-account flex items-center justify-between pt-1">
              <p className="truncate">{action.accountLabel}</p>
              <mdui-button-icon
                icon={action.icon}
                aria-label={action.label}
                onClick={action.onClick}
              />
            </div>
          ) : (
            <mdui-button
              key={action.label}
              variant="text"
              full-width
              icon={action.showExpandedIcon ? action.icon : undefined}
              onClick={action.onClick}
            >
              {action.label}
            </mdui-button>
          ),
        )}
      </div>
    </mdui-navigation-drawer>
  );
}
