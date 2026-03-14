import { spawn, type ChildProcess } from "child_process";
import path from "path";
import os from "os";

// Resolve the built Tauri binary path based on platform
function getTauriBinaryPath(): string {
  const platform = os.platform();
  const basePath = path.resolve("src-tauri", "target", "release");

  switch (platform) {
    case "win32":
      return path.join(basePath, "DraftInk.exe");
    case "darwin":
      return path.join(
        basePath,
        "bundle",
        "macos",
        "DraftInk.app",
        "Contents",
        "MacOS",
        "DraftInk",
      );
    case "linux":
      return path.join(basePath, "draft-ink");
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

let tauriDriver: ChildProcess | undefined;

export const config = {
  runner: "local",
  specs: ["./e2e/**/*.spec.ts"],
  exclude: [],

  maxInstances: 1,

  capabilities: [
    {
      "tauri:options": {
        application: getTauriBinaryPath(),
      },
    },
  ],

  logLevel: "warn",
  bail: 0,

  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  framework: "mocha",
  reporters: ["spec"],

  mochaOpts: {
    ui: "bdd",
    timeout: 60000,
  },

  // Start tauri-driver before test session
  onPrepare: function () {
    tauriDriver = spawn("npx", ["tauri-driver"], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });

    // Wait for tauri-driver to be ready
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve(); // proceed anyway after timeout
      }, 10000);

      tauriDriver!.stderr!.on("data", (data: Buffer) => {
        const msg = data.toString();
        if (msg.includes("listening")) {
          clearTimeout(timeout);
          resolve();
        }
      });

      tauriDriver!.on("error", (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  },

  // Stop tauri-driver after tests complete
  onComplete: function () {
    if (tauriDriver) {
      tauriDriver.kill();
      tauriDriver = undefined;
    }
  },
};
