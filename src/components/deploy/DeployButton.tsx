import { useRef } from "react";
import type { SiteInfo } from "../../hooks/useAuth";

export type DeployButtonSize = "medium" | "small";

interface Props {
  /** Sites the user can deploy to. */
  sites: SiteInfo[];
  /** Force-disable (e.g. not logged in, or a deploy/build already running). */
  disabled?: boolean;
  /** Tooltip shown while disabled, describing the actual reason. */
  disabledReason?: string;
  /** Called with the chosen site when a menu item is clicked. */
  onSelect: (site: SiteInfo) => void;
  /** Button label. */
  label?: string;
  /** Visual size. `medium` matches a standard mdui button; `small` is compact. */
  size?: DeployButtonSize;
}

interface SizeSpec {
  height: number;
  radius: number;
  font: number;
  gap: number;
  rocket: number;
  arrow: number;
  padMain: string;
  padArrow: string;
  /** whether the dropdown menu uses mdui's dense (compact) item layout. */
  denseMenu: boolean;
}

const SIZES: Record<DeployButtonSize, SizeSpec> = {
  medium: {
    height: 40,
    radius: 20,
    font: 14,
    gap: 6,
    rocket: 18,
    arrow: 20,
    padMain: "0 12px 0 16px",
    padArrow: "0 8px",
    denseMenu: false,
  },
  small: {
    height: 32,
    radius: 16,
    font: 13,
    gap: 4,
    rocket: 16,
    arrow: 18,
    padMain: "0 8px 0 12px",
    padArrow: "0 6px",
    denseMenu: true,
  },
};

/**
 * Material 3 style split-button ("部署到"). MDUI does not ship a split-button,
 * so this composes `mdui-dropdown` + a custom two-segment trigger (label
 * segment + divider + trailing arrow). Clicking either segment opens the menu
 * listing the user's sites.
 *
 * `size` controls the overall scale (button height + font + icon + dropdown
 * item density) so callers get a consistent normal/compact appearance.
 *
 * When there are no sites (or `disabled`), it renders a greyed, non-interactive
 * button with a tooltip instead.
 */
export function DeployButton({ sites, disabled, disabledReason, onSelect, label = "部署到", size = "medium" }: Props) {
  const dropdownRef = useRef<HTMLElement & { open: boolean }>(null);
  const s = SIZES[size];
  const isDisabled = disabled || sites.length === 0;
  const tooltip = disabledReason ?? (sites.length === 0 ? "请先在设置中创建站点" : "暂不可部署");

  if (isDisabled) {
    return (
      <div
        title={tooltip}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: s.gap,
          boxSizing: "border-box",
          width: "100%",
          whiteSpace: "nowrap",
          height: s.height,
          padding: `0 ${size === "small" ? 12 : 16}px`,
          borderRadius: s.radius,
          background: "rgba(0,0,0,0.12)",
          color: "rgba(0,0,0,0.38)",
          cursor: "not-allowed",
          fontSize: s.font,
          fontWeight: 500,
          userSelect: "none",
        }}
      >
        <mdui-icon name="rocket_launch" style={{ fontSize: s.rocket }} />
        {label}
        <mdui-icon name="arrow_drop_down" style={{ fontSize: s.arrow }} />
      </div>
    );
  }

  const close = () => {
    if (dropdownRef.current) dropdownRef.current.open = false;
  };

  return (
    <mdui-dropdown ref={dropdownRef} placement="bottom-end">
      <div
        slot="trigger"
        style={{
          display: "flex",
          alignItems: "stretch",
          width: "100%",
          boxSizing: "border-box",
          height: s.height,
          borderRadius: s.radius,
          overflow: "hidden",
          cursor: "pointer",
          background: "rgb(var(--mdui-color-primary))",
          color: "rgb(var(--mdui-color-on-primary))",
          fontSize: s.font,
          fontWeight: 500,
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center", gap: s.gap, padding: s.padMain, whiteSpace: "nowrap" }}>
          <mdui-icon name="rocket_launch" style={{ fontSize: s.rocket }} />
          {label}
        </div>
        <div style={{ width: 1, background: "rgba(255,255,255,0.4)" }} />
        <div style={{ display: "flex", flex: "0 0 auto", alignItems: "center", padding: s.padArrow }}>
          <mdui-icon name="arrow_drop_down" style={{ fontSize: s.arrow }} />
        </div>
      </div>
      <mdui-menu dense={s.denseMenu || undefined}>
        {sites.map((site) => (
          <mdui-menu-item
            key={site.siteSlug}
            onClick={() => {
              onSelect(site);
              close();
            }}
          >
            {site.hostname}
          </mdui-menu-item>
        ))}
      </mdui-menu>
    </mdui-dropdown>
  );
}
