import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import process from "node:process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import {
  getAndroidRuntimeStatus,
  installApk,
  isValidPackageName,
  launchPackage,
  listAdbDevices,
  listInstalledPackages,
  runCommand,
  uninstallPackage,
} from "./runtime/android-runtime.js";

const MAX_APK_BYTES = 150 * 1024 * 1024;
const CONTROL_TOKEN = process.env.ANDROID_CONTROL_TOKEN ?? "";
const sessions = new Map<string, { createdAt: string; serial?: string; adapter: string }>();

function isControlTokenConfigured(): boolean {
  return CONTROL_TOKEN.length >= 32 && CONTROL_TOKEN !== "replace-with-at-least-32-random-characters";
}

function isAuthorized(req: Request): boolean {
  if (!isControlTokenConfigured()) return false;
  const header = req.header("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const candidate = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(CONTROL_TOKEN);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function requireControlToken(req: Request, res: Response, next: NextFunction) {
  if (!isControlTokenConfigured()) {
    return res.status(503).json({
      error: "CONTROL_AUTH_NOT_CONFIGURED",
      message: "Set ANDROID_CONTROL_TOKEN to a cryptographically random secret of at least 32 characters before enabling Android control operations.",
    });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "UNAUTHORIZED", message: "A valid Bearer token is required." });
  }
  next();
}

function optionalSerial(req: Request): string | undefined {
  const value = typeof req.query.serial === "string" ? req.query.serial.trim() : "";
  return value || undefined;
}

async function requireReadyRuntime(req: Request, res: Response, next: NextFunction) {
  try {
    const runtime = await getAndroidRuntimeStatus(optionalSerial(req));
    if (!runtime.ready) {
      return res.status(503).json({
        error: runtime.status,
        message: runtime.reason,
        runtime,
      });
    }
    res.locals.androidRuntime = runtime;
    next();
  } catch (error) {
    return res.status(500).json({
      error: "RUNTIME_PROBE_FAILED",
      message: error instanceof Error ? error.message : "Unable to probe Android runtime.",
    });
  }
}

function publicRuntimeStatus(runtime: Awaited<ReturnType<typeof getAndroidRuntimeStatus>>) {
  const target = runtime.target ? {
    state: runtime.target.state,
    model: runtime.target.model,
    androidVersion: runtime.target.androidVersion,
    abi: runtime.target.abi,
  } : undefined;
  return {
    status: runtime.status,
    ready: runtime.ready,
    adapter: runtime.adapter,
    checkedAt: runtime.checkedAt,
    reason: runtime.reason,
    host: runtime.host,
    adb: runtime.adb,
    target,
    checks: runtime.checks,
    diagnostics: runtime.diagnostics,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.disable("x-powered-by");

  app.get("/health", (_req, res) => {
    res.json({ status: "OK", service: "arclight-gateway", timestamp: new Date().toISOString() });
  });

  // Read-only, evidence-based Android health check. Device serials are not exposed.
  app.get("/android/status", async (req, res) => {
    try {
      const status = await getAndroidRuntimeStatus(optionalSerial(req));
      res.status(status.ready ? 200 : 503).json(publicRuntimeStatus(status));
    } catch (error) {
      res.status(500).json({
        status: "RUNTIME_PROBE_FAILED",
        ready: false,
        message: error instanceof Error ? error.message : "Runtime probe failed.",
      });
    }
  });

  app.get("/android/devices", requireControlToken, async (_req, res) => {
    const result = await listAdbDevices();
    res.status(result.available ? 200 : 503).json(result);
  });

  app.get("/android/packages", requireControlToken, async (req, res) => {
    const result = await listInstalledPackages(optionalSerial(req));
    res.status(result.ok ? 200 : 503).json(result);
  });

  app.post("/session", requireControlToken, async (req, res) => {
    const requestedSerial = typeof req.body?.serial === "string" ? req.body.serial : undefined;
    const runtime = await getAndroidRuntimeStatus(requestedSerial);
    if (!runtime.ready) {
      return res.status(503).json({ error: runtime.status, message: runtime.reason, runtime });
    }
    const id = randomUUID();
    sessions.set(id, {
      createdAt: new Date().toISOString(),
      serial: runtime.adapter === "adb" ? runtime.target?.serial : undefined,
      adapter: runtime.adapter,
    });
    return res.status(201).json({
      id,
      status: "READY",
      runtime: publicRuntimeStatus(runtime),
      createdAt: sessions.get(id)?.createdAt,
    });
  });

  app.get("/session/:id", requireControlToken, async (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: "SESSION_NOT_FOUND" });
    const runtime = await getAndroidRuntimeStatus(session.serial);
    res.status(runtime.ready ? 200 : 503).json({
      id: req.params.id,
      status: runtime.ready ? "READY" : "DISCONNECTED",
      runtime: publicRuntimeStatus(runtime),
    });
  });

  app.delete("/session/:id", requireControlToken, (req, res) => {
    if (!sessions.delete(req.params.id)) return res.status(404).json({ error: "SESSION_NOT_FOUND" });
    res.json({ status: "DISCONNECTED", note: "The Arclight session was removed; the Android device was not powered off." });
  });

  // APK upload is raw bytes, never a caller-supplied filesystem path.
  // Runtime health is checked before the request body is buffered.
  app.post(
    "/android/install",
    requireControlToken,
    requireReadyRuntime,
    express.raw({ type: "application/vnd.android.package-archive", limit: MAX_APK_BYTES }),
    async (req, res) => {
      const packageName = typeof req.query.packageName === "string" ? req.query.packageName : "";
      if (!isValidPackageName(packageName)) {
        return res.status(400).json({ error: "INVALID_PACKAGE_NAME", message: "Provide ?packageName=com.example.app." });
      }
      if (!Buffer.isBuffer(req.body) || req.body.length < 4) {
        return res.status(415).json({
          error: "APK_BODY_REQUIRED",
          message: "Send raw APK bytes using Content-Type: application/vnd.android.package-archive.",
        });
      }
      if (req.body[0] !== 0x50 || req.body[1] !== 0x4b) {
        return res.status(400).json({ error: "APK_INVALID", message: "The upload does not have a ZIP/APK signature." });
      }

      const hash = createHash("sha256").update(req.body).digest("hex");
      const expectedHash = req.header("x-apk-sha256");
      if (expectedHash && (!/^[a-f0-9]{64}$/i.test(expectedHash) || expectedHash.toLowerCase() !== hash)) {
        return res.status(400).json({ error: "APK_HASH_MISMATCH", sha256: hash });
      }

      const directory = await mkdtemp(path.join(tmpdir(), "arclight-apk-"));
      const apkPath = path.join(directory, "upload.apk");
      try {
        await writeFile(apkPath, req.body, { flag: "wx", mode: 0o600 });
        const result = await installApk(apkPath, packageName, optionalSerial(req));
        res.status(result.ok ? 200 : result.status === "INSTALL_VERIFIED" ? 200 : 422).json({ ...result, sha256: hash });
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  app.post("/android/launch", requireControlToken, async (req, res) => {
    const packageName = req.body?.packageName;
    if (typeof packageName !== "string" || !isValidPackageName(packageName)) {
      return res.status(400).json({ error: "INVALID_PACKAGE_NAME" });
    }
    const result = await launchPackage(packageName, typeof req.body?.serial === "string" ? req.body.serial : undefined);
    return res.status(result.ok ? 200 : 422).json(result);
  });

  app.post("/android/uninstall", requireControlToken, async (req, res) => {
    const packageName = req.body?.packageName;
    if (typeof packageName !== "string" || !isValidPackageName(packageName)) {
      return res.status(400).json({ error: "INVALID_PACKAGE_NAME" });
    }
    const result = await uninstallPackage(packageName, typeof req.body?.serial === "string" ? req.body.serial : undefined);
    return res.status(result.ok ? 200 : 422).json(result);
  });

  // Do not retain the previous fake runtime response.
  app.post("/os/action", requireControlToken, async (req, res) => {
    const { action, targetId } = req.body ?? {};
    if (action === "android:launch" && typeof targetId === "string" && isValidPackageName(targetId)) {
      const result = await launchPackage(targetId);
      return res.status(result.ok ? 200 : 422).json(result);
    }
    return res.status(501).json({
      error: "ACTION_NOT_IMPLEMENTED",
      message: "This action has no real runtime adapter; no operation was performed.",
    });
  });

  app.get("/os/state", async (_req, res) => {
    const runtime = await getAndroidRuntimeStatus();
    res.json({
      files: [],
      processes: [],
      androidRuntime: publicRuntimeStatus(runtime),
      source: "live-probe",
      note: "The server no longer invents files or process records when no runtime is connected.",
    });
  });

  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);

  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || "0.0.0.0";
  app.listen(port, host, () => {
    console.log(`Arclight gateway listening on ${host}:${port}`);
    if (!isControlTokenConfigured()) {
      console.warn("Android control routes disabled: configure ANDROID_CONTROL_TOKEN (at least 32 characters).");
    }
  });
}

startServer().catch((error) => {
  console.error("Arclight gateway failed to start:", error);
  process.exitCode = 1;
});
