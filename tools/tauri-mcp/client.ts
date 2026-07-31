import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { remote, type Browser } from "webdriverio";

const DEFAULT_PORT = 4445;
const SCREENSHOT_DIR = path.resolve(".tauri-mcp", "screenshots");

let browser: Browser | null = null;

function webdriverPort(): number {
  const raw = process.env.TAURI_WEBDRIVER_PORT;
  if (!raw) return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid TAURI_WEBDRIVER_PORT: ${raw}`);
  }
  return port;
}

export async function waitForWebDriver(
  timeoutMs = 120_000,
  options: { abortIf?: () => string | null } = {},
): Promise<void> {
  const port = webdriverPort();
  const deadline = Date.now() + timeoutMs;
  let lastError = "server not ready";

  const abortIfNeeded = () => {
    const reason = options.abortIf?.();
    if (reason) throw new Error(reason);
  };

  while (Date.now() < deadline) {
    abortIfNeeded();
    try {
      const response = await fetch(`http://127.0.0.1:${port}/status`);
      if (response.ok) return;
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = String(error);
    }
    abortIfNeeded();
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  abortIfNeeded();
  throw new Error(
    `Tauri WebDriver did not become ready on port ${port}: ${lastError}. ` +
      "Start the real desktop app with `npm run tauri:dev:mcp`.",
  );
}

export async function connect(): Promise<Browser> {
  if (browser?.sessionId) return browser;

  const port = webdriverPort();
  await waitForWebDriver();
  const session = await remote({
    protocol: "http",
    hostname: "127.0.0.1",
    port,
    path: "/",
    logLevel: "error",
    capabilities: {
      browserName: "tauri",
      "tauri:options": {},
    } as WebdriverIO.Capabilities,
  });
  browser = session;
  await session.setTimeout({ implicit: 2_000, script: 30_000 });
  await session.waitUntil(
    async () =>
      session.execute(() =>
        document.readyState !== "loading" &&
        Boolean(document.querySelector("#root")?.innerHTML.trim()),
      ),
    { timeout: 30_000, timeoutMsg: "Tauri WebView loaded but React root did not render" },
  );
  return session;
}

export async function disconnect(): Promise<void> {
  if (!browser?.sessionId) {
    browser = null;
    return;
  }
  try {
    await browser.deleteSession();
  } finally {
    browser = null;
  }
}

export async function pageSnapshot(): Promise<unknown> {
  const session = await connect();
  return session.execute(() => {
    const isInsideClosedOverlay = (element: Element) => {
      let current: Element | null = element;
      while (current) {
        if (current.matches("mdui-dropdown:not([open])")) {
          const trigger = Array.from(current.children).find(
            (child) => child.getAttribute("slot") === "trigger",
          );
          if (!trigger || (trigger !== element && !trigger.contains(element))) return true;
        }
        if (
          current.matches("mdui-dialog:not([open]), [hidden]")
          || current.getAttribute("aria-hidden") === "true"
        ) {
          return true;
        }
        const root = current.getRootNode();
        current = current.parentElement || (root instanceof ShadowRoot ? root.host : null);
      }
      return false;
    };

    const isVisible = (element: Element) => {
      if (isInsideClosedOverlay(element)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) !== 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    };

    const roots: Array<Document | ShadowRoot> = [document];
    const seen = new Set<Node>();
    const elements: Element[] = [];

    while (roots.length > 0) {
      const root = roots.shift()!;
      for (const element of root.querySelectorAll("*")) {
        if (!seen.has(element)) {
          seen.add(element);
          elements.push(element);
        }
        if (element.shadowRoot) roots.push(element.shadowRoot);
      }
    }

    const interactiveSelector = [
      "button",
      "input",
      "textarea",
      "select",
      "a[href]",
      "[role]",
      "[tabindex]",
      "mdui-button",
      "mdui-button-icon",
      "mdui-text-field",
      "mdui-select",
      "mdui-checkbox",
      "mdui-switch",
      "mdui-tab",
      "mdui-menu-item",
    ].join(",");

    const interactive = elements
      .filter((element) => {
        if (!element.matches(interactiveSelector) || !isVisible(element)) return false;
        const root = element.getRootNode();
        return !(root instanceof ShadowRoot && root.host.matches(interactiveSelector));
      })
      .slice(0, 250)
      .map((element, index) => {
        const rect = element.getBoundingClientRect();
        const input = element as HTMLInputElement;
        return {
          index,
          tag: element.tagName.toLowerCase(),
          id: element.id || undefined,
          role: element.getAttribute("role") || undefined,
          text: (element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 160),
          label:
            element.getAttribute("aria-label") ||
            element.getAttribute("label") ||
            element.getAttribute("title") ||
            undefined,
          value: "value" in input ? String(input.value ?? "").slice(0, 160) : undefined,
          disabled:
            element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true",
          checked: "checked" in input ? Boolean(input.checked) : undefined,
          bounds: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        };
      });

    const visibleBody = document.body.cloneNode(true) as HTMLElement;
    visibleBody
      .querySelectorAll("mdui-dialog:not([open]), mdui-dropdown:not([open]), [hidden], [aria-hidden='true']")
      .forEach((element) => element.remove());

    return {
      title: document.title,
      url: location.href,
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      bodyText: (visibleBody.innerText || visibleBody.textContent || "")
        .trim()
        .replace(/\n{3,}/g, "\n\n")
        .slice(0, 12_000),
      interactive,
    };
  });
}

export async function findElement(selector?: string, text?: string): Promise<WebdriverIO.Element> {
  const session = await connect();
  if (selector) return (await session.$(selector)) as unknown as WebdriverIO.Element;
  if (!text) throw new Error("Provide either selector or text");

  const literal = JSON.stringify(text);
  const attributeMatch = (await session.$(
    `[aria-label=${literal}], [label=${literal}], [headline=${literal}], [title=${literal}]`,
  )) as unknown as WebdriverIO.Element;
  if (await attributeMatch.isExisting()) return attributeMatch;

  const exactInteractiveMatch = (await session.$(
    `//*[self::button or self::a or self::mdui-button or self::mdui-button-icon or ` +
      `self::mdui-list-item or self::mdui-menu-item][normalize-space(.) = ${literal}]`,
  )) as unknown as WebdriverIO.Element;
  if (await exactInteractiveMatch.isExisting()) return exactInteractiveMatch;

  const ariaMatch = (await session.$(`aria/${text}`)) as unknown as WebdriverIO.Element;
  if (await ariaMatch.isExisting()) return ariaMatch;

  const xpath = `//*[contains(normalize-space(.), ${literal})]`;
  return (await session.$(xpath)) as unknown as WebdriverIO.Element;
}

export async function clickElement(element: WebdriverIO.Element): Promise<void> {
  const session = await connect();
  const tagName = (await element.getTagName()).toLowerCase();
  if (tagName === "mdui-menu-item") {
    await session.execute((target: Element) => {
      const control = target.shadowRoot?.querySelector<HTMLElement>(".container");
      (control ?? target as HTMLElement).click();
    }, element);
    return;
  }
  await element.click();
}

export async function visiblePageText(): Promise<string> {
  const session = await connect();
  return session.execute(() => {
    const values = [document.body.innerText || ""];
    const roots: Array<Document | ShadowRoot> = [document];
    while (roots.length) {
      const root = roots.shift()!;
      for (const element of root.querySelectorAll("*")) {
        if (element.shadowRoot) roots.push(element.shadowRoot);
        for (const name of ["aria-label", "label", "headline", "title"] as const) {
          const value = element.getAttribute(name);
          if (value) values.push(value);
        }
      }
    }
    return values.join("\n");
  });
}

export async function setElementValue(element: WebdriverIO.Element, value: string): Promise<void> {
  const session = await connect();
  const tagName = (await element.getTagName()).toLowerCase();

  if (!tagName.startsWith("mdui-")) {
    await element.setValue(value);
    return;
  }

  await session.execute(
    (target: Element, nextValue: string) => {
      const control = target as Element & { value?: string };
      control.value = nextValue;
      target.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, data: nextValue }));
      target.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    },
    element,
    value,
  );
}

export async function takeScreenshot(filename?: string): Promise<{ base64: string; path: string }> {
  const session = await connect();
  const base64 = await session.takeScreenshot();
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const safeName = (filename || `tauri-${Date.now()}.png`).replace(/[^a-zA-Z0-9._-]/g, "-");
  const outputPath = path.join(SCREENSHOT_DIR, safeName.endsWith(".png") ? safeName : `${safeName}.png`);
  await writeFile(outputPath, Buffer.from(base64, "base64"));
  return { base64, path: outputPath };
}

export async function invokeTauri(command: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const session = await connect();
  const result = (await session.executeAsync(
    async (commandName: string, commandArgs: Record<string, unknown>, done: (value: unknown) => void) => {
      try {
        const tauri = (globalThis as typeof globalThis & {
          __TAURI__?: { core?: { invoke?: (name: string, args?: Record<string, unknown>) => Promise<unknown> } };
        }).__TAURI__;
        if (!tauri?.core?.invoke) throw new Error("window.__TAURI__.core.invoke is unavailable");
        done({ ok: true, value: await tauri.core.invoke(commandName, commandArgs) });
      } catch (error) {
        done({ ok: false, error: String(error) });
      }
    },
    command,
    args,
  )) as { ok: boolean; value?: unknown; error?: string };

  if (!result.ok) throw new Error(result.error || `Tauri command failed: ${command}`);
  return result.value;
}
