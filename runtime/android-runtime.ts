import { execFile as execFileCallback } from "node:child_process";
import { Buffer } from "node:buffer";
import { access, readFile } from "node:fs/promises";
import process from "node:process";
const COMMAND_TIMEOUT_MS = 5_000;
const MAX_BUFFER_BYTES = 1024 * 1024;

export type CommandResult = {
  ok: boolean;
  exitCode: number | null;
  errorCode?: string;
  stdout: string;
  stderr: string;
};

export type AdbDevice = {
  serial: string;
  state: string;
  details: string;
};

export type AndroidRuntimeProbe = {
  status: string;
  ready: boolean;
  adapter: "adb" | "waydroid" | "none";
  checkedAt: string;
  reason: string;
  host: {
    platform: string;
    architecture: string;
    kernel: string;
    gvisor: boolean;
    binderDevice: boolean;
    binderModule: boolean;
    kvmDevice: boolean;
  };
  adb: { available: boolean; version: string | null };
  target?: { serial: string; state: string; model?: string; androidVersion?: string; abi?: string };
  checks?: { androidShell: boolean; packageManager: boolean };
  diagnostics: string[];
};

export type RemoteAgentConfig =
  | { state: "none" }
  | { state: "invalid"; reason: string }
  | { state: "configured"; baseUrl: string; token: string };

export function getRemoteAgentConfig(): RemoteAgentConfig {
  const rawUrl = process.env.ANDROID_HOST_AGENT_URL?.trim() ?? "";
  const token = process.env.ANDROID_HOST_AGENT_TOKEN?.trim() ?? "";
  if (!rawUrl && !token) return { state: "none" };
  if (!rawUrl) return { state: "invalid", reason: "ANDROID_HOST_AGENT_URL is missing." };
  if (token.length < 32 || token === "replace-with-at-least-32-random-characters") {
    return { state: "invalid", reason: "ANDROID_HOST_AGENT_TOKEN must be a fresh secret of at least 32 characters." };
  }
  try {
    const url = new URL(rawUrl);
    if (url.username || url.password || url.search || url.hash) {
      return { state: "invalid", reason: "The host-agent URL must not contain credentials, query parameters, or a fragment." };
    }
    const isLoopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
      return { state: "invalid", reason: "Remote host-agent URLs must use HTTPS. Plain HTTP is allowed only for loopback development." };
    }
    return { state: "configured", baseUrl: url.href.replace(/\/+$/, ""), token };
  } catch {
    return { state: "invalid", reason: "ANDROID_HOST_AGENT_URL is not a valid URL." };
  }
}

async function remoteAgentRequest(pathname: string, init: RequestInit = {}, timeoutMs = 10_000) {
  const config = getRemoteAgentConfig();
  if (config.state !== "configured") {
    return {
      ok: false,
      status: 503,
      data: { status: config.state === "invalid" ? "REMOTE_HOST_CONFIGURATION_INVALID" : "REMOTE_HOST_NOT_CONFIGURED", reason: config.state === "invalid" ? config.reason : "No remote Android host is configured." },
    };
  }
  try {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${config.token}`);
    const response = await fetch(`${config.baseUrl}${pathname}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data: data as Record<string, any> };
  } catch (error) {
    return {
      ok: false,
      status: 503,
      data: {
        status: "REMOTE_HOST_DISCONNECTED",
        reason: error instanceof Error ? error.message : "Unable to connect to the configured Android host agent.",
      },
    };
  }
}

export async function runCommand(
  command: string,
  args: string[] = [],
  timeout = COMMAND_TIMEOUT_MS,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFileCallback(
      command,
      args,
      { timeout, maxBuffer: MAX_BUFFER_BYTES, encoding: "utf8", windowsHide: true },
      (error, stdout, stderr) => {
        const typedError = error as ({ code?: string | number } | null);
        const numericExit = typeof typedError?.code === "number" ? typedError.code : error ? null : 0;
        resolve({
          ok: !error,
          exitCode: numericExit,
          errorCode: typeof typedError?.code === "string" ? typedError.code : undefined,
          stdout: String(stdout ?? ""),
          stderr: String(stderr ?? ""),
        });
      },
    );
  });
}

export function parseAdbDevices(output: string): AdbDevice[] {
  const devices: AdbDevice[] = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("List of devices attached") || line.startsWith("* daemon")) continue;
    const match = line.match(/^(\S+)\s+(device|offline|unauthorized|no permissions)(?:\s+(.*))?$/);
    if (!match) continue;
    devices.push({ serial: match[1], state: match[2], details: match[3] ?? "" });
  }
  return devices;
}

export function isValidPackageName(packageName: string): boolean {
  return packageName.length <= 255 &&
    /^(?=.{3,255}$)[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/.test(packageName);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function getHostCapabilities() {
  const uname = await runCommand("uname", ["-sr"]);
  let cgroup = "";
  try {
    cgroup = await readFile("/proc/1/cgroup", "utf8");
  } catch {
    // Restricted environments may not expose procfs.
  }
  const kernel = uname.ok ? uname.stdout.trim() : "unknown";
  const binderDevice = await pathExists("/dev/binder");
  const binderModule = await pathExists("/sys/module/binder_linux");
  const kvmDevice = await pathExists("/dev/kvm");
  const adbVersion = await runCommand("adb", ["version"]);
  const waydroidVersion = await runCommand("waydroid", ["-V"]);
  const emulatorVersion = await runCommand("emulator", ["-version"], 3_000);

  return {
    platform: process.platform,
    architecture: process.arch,
    kernel,
    containerLikely: /\/container\d+|docker|kubepods|containerd/i.test(cgroup),
    gvisor: /gvisor/i.test(kernel) || /gvisor/i.test(cgroup),
    binderDevice,
    binderModule,
    kvmDevice,
    adbAvailable: adbVersion.ok,
    adbVersion: adbVersion.ok ? (adbVersion.stdout.split(/\r?\n/)[0] || "").trim() : null,
    waydroidAvailable: waydroidVersion.ok,
    emulatorAvailable: emulatorVersion.ok,
  };
}

async function queryAdbTarget(serial: string, details: string, host: Awaited<ReturnType<typeof getHostCapabilities>>): Promise<AndroidRuntimeProbe> {
  const base = ["-s", serial];
  const [version, abi, model, packages] = await Promise.all([
    runCommand("adb", [...base, "shell", "getprop", "ro.build.version.release"]),
    runCommand("adb", [...base, "shell", "getprop", "ro.product.cpu.abilist"]),
    runCommand("adb", [...base, "shell", "getprop", "ro.product.model"]),
    runCommand("adb", [...base, "shell", "pm", "list", "packages"]),
  ]);
  const androidVersion = version.stdout.trim();
  const shellReady = version.ok && androidVersion.length > 0;
  const packageManagerReady = packages.ok;
  const ready = shellReady && packageManagerReady;
  const diagnostics: string[] = [];
  if (!shellReady) diagnostics.push("Android shell did not return a version.");
  if (!packageManagerReady) diagnostics.push("Android package manager did not respond.");
  return {
    status: ready ? "ANDROID_READY" : "ANDROID_NOT_READY",
    ready,
    adapter: "adb",
    checkedAt: new Date().toISOString(),
    reason: ready ? "An authorized Android target and package manager responded." : diagnostics.join(" "),
    host: {
      platform: host.platform,
      architecture: host.architecture,
      kernel: host.kernel,
      gvisor: host.gvisor,
      binderDevice: host.binderDevice,
      binderModule: host.binderModule,
      kvmDevice: host.kvmDevice,
    },
    adb: { available: true, version: host.adbVersion },
    target: {
      serial,
      state: "device",
      model: model.stdout.trim() || details || "unknown",
      androidVersion,
      abi: abi.stdout.trim() || "unknown",
    },
    checks: { androidShell: shellReady, packageManager: packageManagerReady },
    diagnostics,
  };
}

async function queryWaydroid(host: Awaited<ReturnType<typeof getHostCapabilities>>): Promise<AndroidRuntimeProbe | null> {
  if (!host.waydroidAvailable) return null;
  const status = await runCommand("waydroid", ["status"]);
  const running = status.ok && /Session:\s*RUNNING/i.test(status.stdout) && /Container:\s*RUNNING/i.test(status.stdout);
  if (!running) return null;

  const [version, abi, packages] = await Promise.all([
    runCommand("waydroid", ["shell", "getprop", "ro.build.version.release"]),
    runCommand("waydroid", ["shell", "getprop", "ro.product.cpu.abilist"]),
    runCommand("waydroid", ["shell", "pm", "list", "packages"]),
  ]);
  const androidVersion = version.stdout.trim();
  const shellReady = version.ok && androidVersion.length > 0;
  const packageManagerReady = packages.ok;
  const ready = shellReady && packageManagerReady;
  return {
    status: ready ? "ANDROID_READY" : "ANDROID_NOT_READY",
    ready,
    adapter: "waydroid",
    checkedAt: new Date().toISOString(),
    reason: ready ? "Waydroid Android shell and package manager responded." : "Waydroid is running but Android health checks failed.",
    host: {
      platform: host.platform,
      architecture: host.architecture,
      kernel: host.kernel,
      gvisor: host.gvisor,
      binderDevice: host.binderDevice,
      binderModule: host.binderModule,
      kvmDevice: host.kvmDevice,
    },
    adb: { available: host.adbAvailable, version: host.adbVersion },
    target: { serial: "waydroid", state: "device", androidVersion, abi: abi.stdout.trim() || "unknown" },
    checks: { androidShell: shellReady, packageManager: packageManagerReady },
    diagnostics: [],
  };
}

export async function getAndroidRuntimeStatus(serial?: string): Promise<AndroidRuntimeProbe> {
  const host = await getHostCapabilities();
  const adbVersion = await runCommand("adb", ["version"]);
  const adbDevicesResult = adbVersion.ok ? await runCommand("adb", ["devices", "-l"]) : null;
  const devices = adbDevicesResult?.ok ? parseAdbDevices(adbDevicesResult.stdout) : [];
  const onlineDevices = devices.filter((device) => device.state === "device");
  const diagnostics: string[] = [];

  if (serial) {
    const selected = devices.find((device) => device.serial === serial);
    if (!selected) {
      return {
        status: "ANDROID_TARGET_NOT_FOUND", ready: false, adapter: "none",
        checkedAt: new Date().toISOString(),
        reason: `The selected target "${serial}" is not listed by ADB.`,
        host: {
          platform: host.platform, architecture: host.architecture, kernel: host.kernel,
          gvisor: host.gvisor, binderDevice: host.binderDevice, binderModule: host.binderModule, kvmDevice: host.kvmDevice,
        },
        adb: { available: adbVersion.ok, version: host.adbVersion },
        diagnostics: adbDevicesResult?.stderr ? [adbDevicesResult.stderr.trim()] : ["No matching ADB target."],
      };
    }
    if (selected.state !== "device") {
      return {
        status: selected.state === "unauthorized" ? "ADB_AUTHORIZATION_REQUIRED" : "ADB_TARGET_UNAVAILABLE",
        ready: false, adapter: "none", checkedAt: new Date().toISOString(),
        reason: `ADB target is ${selected.state}; authorize or reconnect it before using Android.`,
        host: {
          platform: host.platform, architecture: host.architecture, kernel: host.kernel,
          gvisor: host.gvisor, binderDevice: host.binderDevice, binderModule: host.binderModule, kvmDevice: host.kvmDevice,
        },
        adb: { available: adbVersion.ok, version: host.adbVersion },
        target: { serial: selected.serial, state: selected.state },
        diagnostics,
      };
    }
    return queryAdbTarget(selected.serial, selected.details, host);
  }

  if (onlineDevices.length === 1) return queryAdbTarget(onlineDevices[0].serial, onlineDevices[0].details, host);
  if (onlineDevices.length > 1) {
    return {
      status: "MULTIPLE_ANDROID_TARGETS", ready: false, adapter: "none", checkedAt: new Date().toISOString(),
      reason: "Multiple authorized ADB targets exist. Select one explicitly.",
      host: {
        platform: host.platform, architecture: host.architecture, kernel: host.kernel,
        gvisor: host.gvisor, binderDevice: host.binderDevice, binderModule: host.binderModule, kvmDevice: host.kvmDevice,
      },
      adb: { available: adbVersion.ok, version: host.adbVersion },
      diagnostics: onlineDevices.map((device) => `${device.serial} ${device.details}`.trim()),
    };
  }

  const waydroid = await queryWaydroid(host);
  if (waydroid) return waydroid;

  if (devices.some((device) => device.state === "unauthorized")) diagnostics.push("An ADB device is visible but has not been authorized on the device.");
  if (devices.some((device) => device.state === "offline")) diagnostics.push("An ADB target is offline.");
  if (host.gvisor && !host.binderDevice && !host.binderModule) diagnostics.push("This gVisor host lacks Android Binder support; local Waydroid cannot initialize here.");
  if (!host.kvmDevice) diagnostics.push("No /dev/kvm device is exposed to this environment.");
  if (!host.adbAvailable) diagnostics.push("ADB is not installed in this server environment.");
  if (!host.waydroidAvailable) diagnostics.push("Waydroid is not installed in this server environment.");

  const status = host.gvisor && !host.binderDevice && !host.binderModule
    ? "LOCAL_RUNTIME_UNSUPPORTED"
    : !host.adbAvailable && !host.waydroidAvailable
      ? "ANDROID_RUNTIME_MISSING"
      : devices.some((device) => device.state === "unauthorized")
        ? "ADB_AUTHORIZATION_REQUIRED"
        : "NO_ANDROID_TARGET";

  return {
    status, ready: false, adapter: "none", checkedAt: new Date().toISOString(),
    reason: status === "LOCAL_RUNTIME_UNSUPPORTED"
      ? "The current gVisor environment has no Binder support. Connect a real remote Android host or an authorized Android device."
      : status === "ANDROID_RUNTIME_MISSING"
        ? "No usable local Android runtime or ADB executable was found."
        : "No ready Android target was detected. Connect and authorize a device or configure a supported runtime host.",
    host: {
      platform: host.platform, architecture: host.architecture, kernel: host.kernel,
      gvisor: host.gvisor, binderDevice: host.binderDevice, binderModule: host.binderModule, kvmDevice: host.kvmDevice,
    },
    adb: { available: host.adbAvailable, version: host.adbVersion },
    diagnostics,
  };
}

export async function listAdbDevices() {
  const version = await runCommand("adb", ["version"]);
  if (!version.ok) {
    return { available: false, version: null, devices: [] as AdbDevice[], error: version.errorCode ?? version.stderr ?? "ADB_NOT_INSTALLED" };
  }
  const result = await runCommand("adb", ["devices", "-l"]);
  return {
    available: true,
    version: version.stdout.split(/\r?\n/)[0]?.trim() || null,
    devices: result.ok ? parseAdbDevices(result.stdout) : [],
    error: result.ok ? undefined : result.stderr || result.errorCode || "ADB_COMMAND_FAILED",
  };
}

export async function listInstalledPackages(serial?: string) {
  const runtime = await getAndroidRuntimeStatus(serial);
  if (!runtime.ready) return { ok: false, status: runtime.status, runtime, packages: [] as string[] };
  const result = runtime.adapter === "waydroid"
    ? await runCommand("waydroid", ["shell", "pm", "list", "packages", "-3"])
    : await runCommand("adb", ["-s", runtime.target!.serial, "shell", "pm", "list", "packages", "-3"]);
  const packages = result.stdout.split(/\r?\n/).map((line) => line.trim().replace(/^package:/, "")).filter(Boolean);
  return { ok: result.ok, status: result.ok ? "PASS" : "PACKAGE_QUERY_FAILED", runtime, packages, stderr: result.stderr };
}

export async function installApk(filePath: string, packageName: string, serial?: string) {
  if (!isValidPackageName(packageName)) {
    return { ok: false, status: "INVALID_PACKAGE_NAME", reason: "Provide a valid Android package name for independent verification." };
  }
  const { stat, realpath } = await import("node:fs/promises");
  let safePath: string;
  try {
    safePath = await realpath(filePath);
    const info = await stat(safePath);
    if (!info.isFile() || info.size <= 4) return { ok: false, status: "APK_INVALID", reason: "The uploaded APK is empty or is not a regular file." };
    if (!safePath.toLowerCase().endsWith(".apk")) return { ok: false, status: "APK_INVALID", reason: "Only a standard .apk is supported by this install path." };
    const handle = await import("node:fs/promises").then((fs) => fs.open(safePath, "r"));
    try {
      const magic = Buffer.alloc(4);
      const read = await handle.read(magic, 0, 4, 0);
      if (read.bytesRead < 4 || magic[0] !== 0x50 || magic[1] !== 0x4b) {
        return { ok: false, status: "APK_INVALID", reason: "The file does not have a ZIP/APK signature." };
      }
    } finally {
      await handle.close();
    }
  } catch (error) {
    return { ok: false, status: "APK_UNAVAILABLE", reason: error instanceof Error ? error.message : "Cannot read APK." };
  }

  const runtime = await getAndroidRuntimeStatus(serial);
  if (!runtime.ready) return { ok: false, status: runtime.status, reason: runtime.reason, runtime };

  const install = runtime.adapter === "waydroid"
    ? await runCommand("waydroid", ["app", "install", safePath], 120_000)
    : await runCommand("adb", ["-s", runtime.target!.serial, "install", "-r", safePath], 120_000);
  if (!install.ok || /\bFailure\b|Error\[/i.test(install.stdout + "\n" + install.stderr)) {
    return { ok: false, status: "INSTALL_FAILED", runtime, commandExitCode: install.exitCode, stdout: install.stdout, stderr: install.stderr || install.errorCode };
  }

  const verify = runtime.adapter === "waydroid"
    ? await runCommand("waydroid", ["shell", "pm", "path", packageName])
    : await runCommand("adb", ["-s", runtime.target!.serial, "shell", "pm", "path", packageName]);
  const verified = verify.ok && /package:\//.test(verify.stdout);
  return {
    ok: verified,
    status: verified ? "INSTALL_VERIFIED" : "PACKAGE_VERIFICATION_FAILED",
    packageName,
    runtime,
    installOutput: install.stdout.trim(),
    verificationOutput: verify.stdout.trim(),
    verificationError: verified ? undefined : verify.stderr || "Package manager did not confirm the package.",
  };
}

export async function launchPackage(packageName: string, serial?: string) {
  if (!isValidPackageName(packageName)) return { ok: false, status: "INVALID_PACKAGE_NAME", reason: "Invalid Android package name." };
  const runtime = await getAndroidRuntimeStatus(serial);
  if (!runtime.ready) return { ok: false, status: runtime.status, reason: runtime.reason, runtime };
  const verify = runtime.adapter === "waydroid"
    ? await runCommand("waydroid", ["shell", "pm", "path", packageName])
    : await runCommand("adb", ["-s", runtime.target!.serial, "shell", "pm", "path", packageName]);
  if (!verify.ok || !/package:\//.test(verify.stdout)) return { ok: false, status: "PACKAGE_NOT_INSTALLED", packageName, runtime };

  const args = ["monkey", "-p", packageName, "-c", "android.intent.category.LAUNCHER", "1"];
  const launch = runtime.adapter === "waydroid"
    ? await runCommand("waydroid", ["shell", ...args], 20_000)
    : await runCommand("adb", ["-s", runtime.target!.serial, "shell", ...args], 20_000);
  if (!launch.ok) return { ok: false, status: "APP_LAUNCH_FAILED", packageName, runtime, stderr: launch.stderr || launch.errorCode, stdout: launch.stdout };

  const activity = runtime.adapter === "waydroid"
    ? await runCommand("waydroid", ["shell", "dumpsys", "activity", "activities"])
    : await runCommand("adb", ["-s", runtime.target!.serial, "shell", "dumpsys", "activity", "activities"]);
  const activityObserved = activity.ok && activity.stdout.includes(packageName);
  return {
    ok: true,
    status: activityObserved ? "ACTIVITY_OBSERVED" : "LAUNCH_REQUESTED",
    packageName,
    launchOutput: launch.stdout.trim(),
    activityObserved,
    note: activityObserved ? "The package was observed in Android activity diagnostics." : "The launch command was accepted; visible UI/process state is not yet independently confirmed.",
  };
}

export async function uninstallPackage(packageName: string, serial?: string) {
  if (!isValidPackageName(packageName)) return { ok: false, status: "INVALID_PACKAGE_NAME" };
  const runtime = await getAndroidRuntimeStatus(serial);
  if (!runtime.ready) return { ok: false, status: runtime.status, reason: runtime.reason, runtime };
  const uninstall = runtime.adapter === "waydroid"
    ? await runCommand("waydroid", ["app", "remove", packageName], 60_000)
    : await runCommand("adb", ["-s", runtime.target!.serial, "uninstall", packageName], 60_000);
  if (!uninstall.ok || !/success/i.test(uninstall.stdout + "\n" + uninstall.stderr)) {
    return { ok: false, status: "UNINSTALL_FAILED", stderr: uninstall.stderr || uninstall.errorCode, stdout: uninstall.stdout };
  }
  const verify = runtime.adapter === "waydroid"
    ? await runCommand("waydroid", ["shell", "pm", "path", packageName])
    : await runCommand("adb", ["-s", runtime.target!.serial, "shell", "pm", "path", packageName]);
  if (!verify.ok) return { ok: false, status: "REMOVAL_VERIFICATION_UNKNOWN", stderr: verify.stderr };
  const removed = !/package:\//.test(verify.stdout);
  return { ok: removed, status: removed ? "REMOVAL_VERIFIED" : "REMOVAL_VERIFICATION_FAILED", packageName, output: uninstall.stdout.trim() };
}
