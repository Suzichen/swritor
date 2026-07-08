import "react";

// mdui Web Components 使用原生 class 属性而非 className
type MduiBase = React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
  class?: string;
  slot?: string;
  ref?: React.Ref<any>;
};

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "mdui-layout": MduiBase;
      "mdui-layout-main": MduiBase;
      "mdui-navigation-drawer": MduiBase & { open?: boolean; contained?: boolean };
      "mdui-top-app-bar": MduiBase;
      "mdui-top-app-bar-title": MduiBase;
      "mdui-list": MduiBase;
      "mdui-list-item": MduiBase & {
        active?: boolean;
        icon?: string;
        headline?: string;
        description?: string;
      };
      "mdui-button": MduiBase & {
        variant?: string;
        loading?: boolean;
        disabled?: boolean;
        "full-width"?: boolean;
        icon?: string;
        "end-icon"?: string;
      };
      "mdui-button-icon": MduiBase & { icon?: string };
      "mdui-icon": MduiBase & { name?: string };
      "mdui-card": MduiBase & { variant?: string };
      "mdui-linear-progress": MduiBase & { value?: number; max?: number };
      "mdui-circular-progress": MduiBase;
      "mdui-divider": MduiBase;
      "mdui-dialog": MduiBase & { open?: boolean; headline?: string; "close-on-overlay-click"?: boolean; "close-on-esc"?: boolean };
      "mdui-text-field": MduiBase & {
        variant?: string;
        label?: string;
        value?: string;
        placeholder?: string;
        helper?: string;
        type?: string;
        rows?: number | string;
        disabled?: boolean;
        required?: boolean;
        readonly?: boolean;
        clearable?: boolean;
        autosize?: boolean;
        "toggle-password"?: boolean;
      };
      "mdui-select": MduiBase & {
        variant?: string;
        label?: string;
        value?: string;
        placeholder?: string;
        disabled?: boolean;
        required?: boolean;
        clearable?: boolean;
        placement?: string;
      };
      "mdui-menu-item": MduiBase & { value?: string };
      "mdui-menu": MduiBase & { value?: string; dense?: boolean };
      "mdui-dropdown": MduiBase & {
        open?: boolean;
        disabled?: boolean;
        placement?: string;
        trigger?: string;
        "open-on-pointer"?: boolean;
      };
      "mdui-switch": MduiBase & {
        checked?: boolean;
        disabled?: boolean;
      };
      "mdui-collapse": MduiBase & { accordion?: boolean; value?: string };
      "mdui-collapse-item": MduiBase & { value?: string; header?: string };
      "mdui-snackbar": MduiBase & { open?: boolean; placement?: string };
    }
  }
}
