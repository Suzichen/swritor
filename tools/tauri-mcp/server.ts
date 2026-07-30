import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  connect,
  disconnect,
  findElement,
  invokeTauri,
  pageSnapshot,
  setElementValue,
  takeScreenshot,
  waitForWebDriver,
} from "./client.js";
import {
  devProcessFailure,
  devProcessLogs,
  devProcessStatus,
  startDevProcess,
  stopDevProcess,
} from "./process.js";

const server = new McpServer({
  name: "swritor-tauri",
  version: "1.0.0",
});

const textResult = (value: unknown) => ({
  content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});

const errorResult = (error: unknown) => ({
  isError: true,
  content: [{ type: "text" as const, text: String(error) }],
});

function guarded<T extends Record<string, unknown>>(
  handler: (args: T) => Promise<ReturnType<typeof textResult>>,
) {
  return async (args: T) => {
    try {
      return await handler(args);
    } catch (error) {
      return errorResult(error);
    }
  };
}

server.registerTool(
  "tauri_connect",
  {
    description:
      "Connect to the real Swritor Tauri dev window started with `npm run tauri:dev:mcp`. This does not launch a browser or a second app process.",
    inputSchema: {},
  },
  guarded(async () => {
    const browser = await connect();
    return textResult({ connected: true, sessionId: browser.sessionId });
  }),
);

server.registerTool(
  "tauri_disconnect",
  {
    description: "Close the WebDriver session without closing the running Tauri dev application.",
    inputSchema: {},
  },
  guarded(async () => {
    await disconnect();
    return textResult({ connected: false });
  }),
);

server.registerTool(
  "tauri_snapshot",
  {
    description:
      "Return visible text, viewport information, and semantic metadata for interactive elements in the real Tauri WebView, including MDUI shadow roots.",
    inputSchema: {},
  },
  guarded(async () => textResult(await pageSnapshot())),
);

const locatorSchema = {
  selector: z.string().optional().describe("CSS selector. Prefer stable IDs, labels, roles, or component tags."),
  text: z.string().optional().describe("Accessible name or visible text when no CSS selector is available."),
};

server.registerTool(
  "tauri_open",
  {
    description:
      "Open the real Swritor Tauri development application with automation enabled, wait for its WebDriver server, and connect to the window. Reuses an already-running compatible app.",
    inputSchema: {
      timeoutMs: z.number().int().positive().max(300_000).default(180_000),
    },
  },
  guarded(async ({ timeoutMs }) => {
    try {
      await waitForWebDriver(500);
    } catch {
      await startDevProcess();
      try {
        await waitForWebDriver(timeoutMs as number, { abortIf: devProcessFailure });
      } catch (error) {
        const { logPath } = devProcessStatus();
        throw new Error(
          `${String(error)}\n\nTauri dev log (${logPath}):\n${devProcessLogs(8_000) || "(no output)"}`,
        );
      }
    }

    const browser = await connect();
    return textResult({
      opened: true,
      sessionId: browser.sessionId,
      process: devProcessStatus(),
    });
  }),
);

server.registerTool(
  "tauri_status",
  {
    description: "Report whether the managed Tauri dev process and WebDriver session are available.",
    inputSchema: {},
  },
  guarded(async () => {
    let webdriverReady = false;
    try {
      await waitForWebDriver(500);
      webdriverReady = true;
    } catch {
      // Status probes intentionally do not start the application.
    }
    return textResult({ webdriverReady, process: devProcessStatus() });
  }),
);

server.registerTool(
  "tauri_logs",
  {
    description: "Return recent output from the Tauri dev process started by this MCP server.",
    inputSchema: {
      tailChars: z.number().int().positive().max(80_000).default(12_000),
    },
  },
  guarded(async ({ tailChars }) => textResult(devProcessLogs(tailChars as number))),
);

server.registerTool(
  "tauri_close",
  {
    description:
      "Disconnect automation and stop the Tauri dev process when it was started by this MCP server. An externally started app is left running.",
    inputSchema: {},
  },
  guarded(async () => {
    await disconnect();
    const stopped = await stopDevProcess();
    return textResult({ connected: false, stoppedManagedProcess: stopped });
  }),
);

server.registerTool(
  "tauri_click",
  {
    description: "Click an element in the real Tauri window by CSS selector or accessible/visible text.",
    inputSchema: locatorSchema,
  },
  guarded(async ({ selector, text }) => {
    const element = await findElement(selector as string | undefined, text as string | undefined);
    await element.waitForDisplayed({ timeout: 10_000 });
    await element.click();
    return textResult({ clicked: selector || text });
  }),
);

server.registerTool(
  "tauri_set_value",
  {
    description: "Clear and enter text in an input, textarea, or editable MDUI control.",
    inputSchema: {
      ...locatorSchema,
      value: z.string(),
    },
  },
  guarded(async ({ selector, text, value }) => {
    const element = await findElement(selector as string | undefined, text as string | undefined);
    await element.waitForDisplayed({ timeout: 10_000 });
    await setElementValue(element, value as string);
    return textResult({ target: selector || text, value });
  }),
);

server.registerTool(
  "tauri_press_key",
  {
    description: "Send a keyboard key or key sequence to the focused control in the Tauri window.",
    inputSchema: {
      keys: z.union([z.string(), z.array(z.string())]),
    },
  },
  guarded(async ({ keys }) => {
    const browser = await connect();
    await browser.keys(keys as string | string[]);
    return textResult({ pressed: keys });
  }),
);

server.registerTool(
  "tauri_wait_for_text",
  {
    description: "Wait until visible page text contains or no longer contains a value.",
    inputSchema: {
      text: z.string(),
      timeoutMs: z.number().int().positive().max(120_000).default(10_000),
      reverse: z.boolean().default(false),
    },
  },
  guarded(async ({ text, timeoutMs, reverse }) => {
    const browser = await connect();
    await browser.waitUntil(
      async () => {
        const bodyText = await browser.$("body").getText();
        const found = bodyText.includes(text as string);
        return reverse ? !found : found;
      },
      { timeout: timeoutMs as number, timeoutMsg: `Timed out waiting for text: ${text}` },
    );
    return textResult({ matched: true, text, reverse });
  }),
);

server.registerTool(
  "tauri_assert",
  {
    description: "Assert text visibility or an element state in the real Tauri window.",
    inputSchema: {
      kind: z.enum(["text-visible", "text-hidden", "element-visible", "element-enabled", "element-value"]),
      expected: z.string(),
      selector: z.string().optional(),
    },
  },
  guarded(async ({ kind, expected, selector }) => {
    const browser = await connect();
    let actual: unknown;
    let passed = false;

    if (kind === "text-visible" || kind === "text-hidden") {
      actual = await browser.$("body").getText();
      const contains = (actual as string).includes(expected as string);
      passed = kind === "text-visible" ? contains : !contains;
    } else {
      if (!selector) throw new Error(`selector is required for ${kind}`);
      const element = await browser.$(selector as string);
      if (kind === "element-visible") actual = await element.isDisplayed();
      if (kind === "element-enabled") actual = await element.isEnabled();
      if (kind === "element-value") actual = await element.getValue();
      passed = kind === "element-value" ? actual === expected : actual === true;
    }

    if (!passed) throw new Error(`Assertion failed (${kind}). Expected: ${expected}. Actual: ${String(actual)}`);
    return textResult({ passed: true, kind, expected, selector });
  }),
);

server.registerTool(
  "tauri_invoke",
  {
    description:
      "Invoke a real registered Tauri Rust command through window.__TAURI__.core.invoke and return its serialized result.",
    inputSchema: {
      command: z.string(),
      args: z.record(z.unknown()).default({}),
    },
  },
  guarded(async ({ command, args }) => textResult(await invokeTauri(command as string, args as Record<string, unknown>))),
);

server.registerTool(
  "tauri_execute_js",
  {
    description:
      "Execute JavaScript inside the real Tauri WebView. Use for inspection or interactions that semantic element tools cannot express.",
    inputSchema: {
      script: z.string().describe("A JavaScript function body. Return a JSON-serializable value."),
    },
  },
  guarded(async ({ script }) => {
    const browser = await connect();
    const result = await browser.execute((body: string) => Function(body)(), script as string);
    return textResult(result);
  }),
);

server.registerTool(
  "tauri_screenshot",
  {
    description: "Capture the real Tauri window. Returns the image to the model and stores a PNG under .tauri-mcp/screenshots.",
    inputSchema: {
      filename: z.string().optional(),
    },
  },
  async ({ filename }) => {
    try {
      const screenshot = await takeScreenshot(filename);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ path: screenshot.path }, null, 2) },
          { type: "image" as const, data: screenshot.base64, mimeType: "image/png" },
        ],
      };
    } catch (error) {
      return errorResult(error);
    }
  },
);

const shutdown = async () => {
  await disconnect().catch(() => undefined);
  await stopDevProcess().catch(() => undefined);
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await server.connect(new StdioServerTransport());
