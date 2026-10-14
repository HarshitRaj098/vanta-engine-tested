import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import {
  getLocalAndroidRuntimeStatus,
  getRemoteAgentConfig,
  installApk,
  isValidPackageName,
  launchPackage,
  listAdbDevices,
  listInstalledPackages,
  uninstallPackage,
} from "./android-runtime.js";

const MAX_APK_BYTES = 150 * 1024 * 1024;
const TOKEN = process.env.ANDROID_HOST_AGENT_TOKEN ?? "";
const PLACEHOLDER_TOKEN = "replace-with-at-least-32-random-characters";

function authorized(req: Request): boolean {
  if (TOKEN.length < 32 || TOKEN === PLACEHOLDER_TOKEN) return false;
  const header = req.header("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const provided = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(TOKEN);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (TOKEN.length < 32 || TOKEN === PLACEHOLDER_TOKEN) {
    return res.status(503).json({
      ok: false,
      status: "HOST_AGENT_AUTH_NOT_CONFIGURED",
      reason: "Set ANDROID_HOST_AGENT_TOKEN to a fresh random secret of at least 32 characters.",
    });
  }
  if (!authorized(req)) return res.status(401).json({ ok: false, status: "AUTHENTICATION_FAILED" });
  next();
}

function querySerial(req: Request): string | undefined {
  const value = typeof req.query.serial === "string" ? req.query.serial.trim() : "";
  return value || undefined;
}

function remoteProxyEnvPresent(): boolean {
  return getRemoteAgentConfig().state !== "none";
}

async function requireRuntime(req: Request, res: Response, next: NextFunction) {
  if (remoteProxyEnvPresent()) {
    return res.status(500).json({
      ok: false,
      status: "HOST_AGENT_MISCONFIGURED",
      reason: "The host agent must use its local runtime; remove ANDROID_HOST_AGENT_URL/TOKEN from the host-agent environment.",
    });
  }
  try {
    const runtime = await getLocalAndroidRuntimeStatus(querySerial(req));
    if (!runtime.ready) {
      return res.status(503).json({ ok: false, status: runtime.status, reason: runtime.reason, runtime });
    }
    res.locals.runtime = runtime;
    next();
  } catch (error) {
    return res.status(500).json({
      ok: false,
      status: "RUNTIME_PROBE_FAILED",
      reason: error instanceof Error ? error.message : "Runtime probe failed.",
    });
  }
}

async function startHostAgent() {
  if (TOKEN.length < 32 || TOKEN === PLACEHOLDER_TOKEN) {
    throw new Error("ANDROID_HOST_AGENT_TOKEN is required and must contain at least 32 random characters. Generate one with: openssl rand -hex 32");
  }
  if (remoteProxyEnvPresent()) {
    throw new Error("Host agent must run against its local Android runtime. Remove ANDROID_HOST_AGENT_URL and the client-side token from this host.");
  }

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  // Health response contains no device details and does not disclose credentials.
  app.get("/health", (_req, res) => res.json({ ok: true, service: "arclight-android-host-agent" }));

  app.get("/runtime/status", requireAuth, async (req, res) => {
    const runtime = await getLocalAndroidRuntimeStatus(querySerial(req));
    res.status(runtime.ready ? 200 : 503).json({
      ok: runtime.ready,
      status: runtime.status,
      reason: runtime.reason,
      runtime,
    });
  });

  app.get("/runtime/devices", requireAuth, async (_req, res) => {
    const result = await listAdbDevices();
    res.status(result.available ? 200 : 503).json(result);
  });

  app.get("/runtime/packages", requireAuth, async (req, res) => {
    const result = await listInstalledPackages(querySerial(req));
    res.status(result.ok ? 200 : 503).json(result);
  });

  app.post(
    "/runtime/install",
    requireAuth,
    requireRuntime,
    express.raw({ type: "application/vnd.android.package-archive", limit: MAX_APK_BYTES }),
    async (req, res) => {
      const packageName = typeof req.query.packageName === "string" ? req.query.packageName : "";
      if (!isValidPackageName(packageName)) {
        return res.status(400).json({ ok: false, status: "INVALID_PACKAGE_NAME", reason: "A valid Android package name is required for independent verification." });
      }
      if (!Buffer.isBuffer(req.body) || req.body.length < 4) {
        return res.status(415).json({ ok: false, status: "APK_BODY_REQUIRED", reason: "Send raw APK bytes with the Android package archive content type." });
      }
      if (req.body[0] !== 0x50 || req.body[1] !== 0x4b) {
        return res.status(400).json({ ok: false, status: "APK_INVALID", reason: "The upload does not have a ZIP/APK signature." });
      }
      const receivedHash = createHash("sha256").update(req.body).digest("hex");
      const expectedHash = req.header("x-apk-sha256")?.toLowerCase();
      if (!expectedHash || !/^[a-f0-9]{64}$/.test(expectedHash) || expectedHash !== receivedHash) {
        return res.status(400).json({ ok: false, status: "APK_HASH_MISMATCH", sha256: receivedHash });
      }

      const directory = await mkdtemp(path.join(tmpdir(), "arclight-host-apk-"));
      const apkPath = path.join(directory, "upload.apk");
      try {
        await writeFile(apkPath, req.body, { flag: "wx", mode: 0o600 });
        const result = await installApk(apkPath, packageName, querySerial(req));
        return res.status(result.ok ? 200 : 422).json({ ...result, sha256: receivedHash });
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  app.post("/runtime/launch", requireAuth, async (req, res) => {
    const packageName = req.body?.packageName;
    if (typeof packageName !== "string" || !isValidPackageName(packageName)) {
      return res.status(400).json({ ok: false, status: "INVALID_PACKAGE_NAME" });
    }
    const result = await launchPackage(packageName, typeof req.body?.serial === "string" ? req.body.serial : undefined);
    return res.status(result.ok ? 200 : 422).json(result);
  });

  app.post("/runtime/uninstall", requireAuth, async (req, res) => {
    const packageName = req.body?.packageName;
    if (typeof packageName !== "string" || !isValidPackageName(packageName)) {
      return res.status(400).json({ ok: false, status: "INVALID_PACKAGE_NAME" });
    }
    const result = await uninstallPackage(packageName, typeof req.body?.serial === "string" ? req.body.serial : undefined);
    return res.status(result.ok ? 200 : 422).json(result);
  });

  const host = process.env.ANDROID_HOST_AGENT_HOST || "127.0.0.1";
  const port = Number(process.env.ANDROID_HOST_AGENT_PORT || 4317);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("ANDROID_HOST_AGENT_PORT must be between 1 and 65535.");

  const certPath = process.env.ANDROID_HOST_AGENT_TLS_CERT;
  const keyPath = process.env.ANDROID_HOST_AGENT_TLS_KEY;
  const isLoopback = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (!isLoopback && (!certPath || !keyPath)) {
    throw new Error("Non-loopback binding requires ANDROID_HOST_AGENT_TLS_CERT and ANDROID_HOST_AGENT_TLS_KEY. Prefer a TLS reverse proxy/tunnel to the loopback listener.");
  }

  if (certPath && keyPath) {
    const [cert, key] = await Promise.all([readFile(certPath), readFile(keyPath)]);
    createHttpsServer({ cert, key }, app).listen(port, host, () => {
      console.log(`Arclight Android Host Agent listening with HTTPS on ${host}:${port}`);
    });
  } else {
    createHttpServer(app).listen(port, host, () => {
      console.log(`Arclight Android Host Agent listening on loopback ${host}:${port}`);
    });
  }
}

startHostAgent().catch((error) => {
  console.error("Android Host Agent refused to start:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
