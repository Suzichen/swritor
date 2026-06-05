import "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "mdui-layout": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      "mdui-layout-main": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      "mdui-navigation-drawer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & { open?: boolean; contained?: boolean },
        HTMLElement
      >;
      "mdui-top-app-bar": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      "mdui-top-app-bar-title": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      "mdui-list": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      "mdui-list-item": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          active?: boolean;
          icon?: string;
          headline?: string;
          description?: string;
        },
        HTMLElement
      >;
      "mdui-button": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          variant?: string;
          loading?: boolean;
          disabled?: boolean;
          "full-width"?: boolean;
          href?: string;
        },
        HTMLElement
      >;
      "mdui-button-icon": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & { icon?: string },
        HTMLElement
      >;
      "mdui-icon": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & { name?: string },
        HTMLElement
      >;
      "mdui-card": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & { variant?: string },
        HTMLElement
      >;
      "mdui-linear-progress": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      "mdui-circular-progress": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      "mdui-divider": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}
