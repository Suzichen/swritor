# Swritor Tauri MCP

This MCP server drives the real Tauri development window through the embedded
WebDriver server. It does not use Vite browser mode and does not launch Chrome.

## Open from AI

Register the server, then ask the AI to call `tauri_open`. The MCP server starts
`tauri dev --features automation`, waits for the real desktop window, and
connects WebDriver automatically. Use `tauri_close` to stop an app started by
the MCP server.

The `automation` feature is opt-in, so regular development and release builds
do not include the WebDriver server.

## Configure an MCP client

Use this project root as the working directory and run:

```json
{
  "command": "npm",
  "args": ["run", "--silent", "mcp:server"]
}
```

The `--silent` flag keeps npm's banner off the MCP stdio protocol stream. This
repository includes `.zed/settings.json`, so trusted Zed workspaces load the
server automatically. The JSON above is suitable for other MCP clients.

## Manual smoke test

```sh
npm run mcp:smoke
```

The smoke test starts the app, connects to the window, prints a semantic
snapshot, invokes a real Rust command, writes
`.tauri-mcp/screenshots/smoke.png`, and then stops the managed process.

## Native dialogs

WebDriver controls the WebView content. Windows file and directory picker
windows are native UI and are outside this server's DOM surface. Tests can
avoid them by invoking Tauri commands directly or by setting application state
through the WebView. Add Windows UI Automation separately if the native picker
itself must be tested.
