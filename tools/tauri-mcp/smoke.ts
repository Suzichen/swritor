import { connect, disconnect, invokeTauri, pageSnapshot, takeScreenshot } from "./client.js";
import { startDevProcess, stopDevProcess } from "./process.js";

try {
  await startDevProcess();
  const browser = await connect();
  console.log(`Connected to Tauri WebDriver session ${browser.sessionId}`);

  const snapshot = await pageSnapshot();
  console.log(JSON.stringify(snapshot, null, 2));

  const version = await invokeTauri("get_engine_version");
  console.log("get_engine_version:", JSON.stringify(version));

  const screenshot = await takeScreenshot("smoke.png");
  console.log(`Screenshot: ${screenshot.path}`);
} finally {
  await disconnect();
  await stopDevProcess();
}
