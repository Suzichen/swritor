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
  const isDisabled = disabled || sites.length === 0;
  const tooltip = disabledReason ?? (sites.length === 0 ? "请先在设置中创建站点" : "暂不可部署");

  if (isDisabled) {
    return (
      <div
        title={tooltip}
        className={`deploy-button deploy-button-${size} is-disabled`}
      >
        <mdui-icon class="deploy-button-rocket" name="rocket_launch" />
        {label}
        <mdui-icon class="deploy-button-arrow" name="arrow_drop_down" />
      </div>
    );
  }

  const close = () => {
    if (dropdownRef.current) dropdownRef.current.open = false;
  };

  return (
    <mdui-dropdown ref={dropdownRef} placement="bottom-end">
      <div slot="trigger" className={`deploy-button deploy-button-${size}`}>
        <div className="deploy-button-main">
          <mdui-icon class="deploy-button-rocket" name="rocket_launch" />
          {label}
        </div>
        <div className="deploy-button-divider" />
        <div className="deploy-button-menu">
          <mdui-icon class="deploy-button-arrow" name="arrow_drop_down" />
        </div>
      </div>
      <mdui-menu dense={size === "small" || undefined}>
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
