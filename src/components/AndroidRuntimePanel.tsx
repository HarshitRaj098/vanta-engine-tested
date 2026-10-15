import React, { useCallback, useEffect, useState } from "react";
import {
  Activity, AlertTriangle, CheckCircle2, RefreshCw, Smartphone, XCircle,
  Upload, Play, LockKeyhole, LoaderCircle, ScanSearch,
} from "lucide-react";

type AndroidRuntimeStatus = {
  status: string;
  ready: boolean;
  adapter: "adb" | "waydroid" | "none";
  checkedAt?: string;
  reason?: string;
  host?: {
    platform: string;
    architecture: string;
    kernel: string;
    gvisor: boolean;
    binderDevice: boolean;
    binderModule: boolean;
    kvmDevice: boolean;
  };
  adb?: { available: boolean; version: string | null };
  target?: { state?: string; model?: string; androidVersion?: string; abi?: string };
  checks?: { androidShell: boolean; packageManager: boolean };
  diagnostics?: string[];
};

type OperationResult = {
  ok?: boolean;
  status?: string;
  error?: string;
  message?: string;
  reason?: string;
  packageName?: string;
  actualPackageName?: string;
  expectedPackageName?: string;
  sha256?: string;
  installOutput?: string;
  verificationOutput?: string;
  launchOutput?: string;
  note?: string;
  stderr?: string;
  runtime?: { reason?: string; status?: string };
};

type Props = {
  onClose: () => void;
  pos: { x: number; y: number };
  onMove: (x: number, y: number) => void;
};

const boolLabel = (value: boolean | undefined) => value === true ? "AVAILABLE" : value === false ? "MISSING" : "UNKNOWN";

export default function AndroidRuntimePanel({ onClose, pos, onMove }: Props) {
  const [runtime, setRuntime] = useState<AndroidRuntimeStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [controlToken, setControlToken] = useState("");
  const [packageName, setPackageName] = useState("com.example.testapk");
  const [apkFile, setApkFile] = useState<File | null>(null);
  const [operationBusy, setOperationBusy] = useState(false);
  const [inspectBusy, setInspectBusy] = useState(false);
  const [operationResult, setOperationResult] = useState<OperationResult | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setRequestError(null);
    try {
      const response = await fetch("/android/status", { cache: "no-store" });
      const data = await response.json() as AndroidRuntimeStatus;
      setRuntime(data);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Runtime diagnostics endpoint is unavailable.");
      setRuntime(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const beginDrag = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    const startX = event.clientX - pos.x;
    const startY = event.clientY - pos.y;
    const handleMove = (moveEvent: MouseEvent) => onMove(moveEvent.clientX - startX, moveEvent.clientY - startY);
    const handleUp = () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp, { once: true });
  };

  const postOperation = useCallback(async (url: string, body: Record<string, unknown>) => {
    setOperationBusy(true);
    setOperationResult(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${controlToken}`,
        },
        body: JSON.stringify(body),
      });
      const data = await response.json() as OperationResult;
      setOperationResult({ ...data, ok: response.ok && data.ok !== false });
      if (response.ok && data.ok !== false) await refresh();
    } catch (error) {
      setOperationResult({ ok: false, status: "REQUEST_FAILED", message: error instanceof Error ? error.message : "Request failed." });
    } finally {
      setOperationBusy(false);
    }
  }, [controlToken, refresh]);

  const inspectSelectedApk = useCallback(async () => {
    if (!apkFile || !controlToken.trim() || controlToken.trim().length < 32) return;
    if (apkFile.size > 150 * 1024 * 1024) {
      setOperationResult({ ok: false, status: "APK_TOO_LARGE", message: "APK exceeds the 150 MB upload limit." });
      return;
    }
    setInspectBusy(true);
    setOperationResult(null);
    try {
      if (globalThis.crypto?.subtle === undefined) {
        setOperationResult({ ok: false, status: "HASH_UNAVAILABLE", message: "SHA-256 is unavailable in this browser context. Use a secure HTTPS connection." });
        return;
      }
      const digest = await globalThis.crypto.subtle.digest("SHA-256", await apkFile.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const response = await fetch("/android/inspect", {
        method: "POST",
        headers: {
          "Content-Type": "application/vnd.android.package-archive",
          Authorization: `Bearer ${controlToken}`,
          "X-APK-SHA256": sha256,
        },
        body: apkFile,
      });
      const data = await response.json() as OperationResult;
      if (response.ok && data.ok === true && data.packageName) {
        setPackageName(data.packageName);
        setOperationResult({ ...data, message: `Detected package: ${data.packageName}. Package name was read from AndroidManifest.xml.` });
      } else {
        setOperationResult({ ...data, ok: false, message: data.message ?? data.reason ?? "APK inspection failed." });
      }
    } catch (error) {
      setOperationResult({ ok: false, status: "APK_INSPECTION_FAILED", message: error instanceof Error ? error.message : "APK inspection failed." });
    } finally {
      setInspectBusy(false);
    }
  }, [apkFile, controlToken]);

  const installSelectedApk = useCallback(async () => {
    if (!apkFile || !controlToken.trim() || !runtime?.ready || !/^(?=.{3,255}$)[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/.test(packageName)) return;
    if (apkFile.size > 150 * 1024 * 1024) {
      setOperationResult({ ok: false, status: "APK_TOO_LARGE", message: "APK exceeds the 150 MB upload limit." });
      return;
    }
    setOperationBusy(true);
    setOperationResult(null);
    try {
      let sha256: string | undefined;
      if (globalThis.crypto?.subtle) {
        const digest = await globalThis.crypto.subtle.digest("SHA-256", await apkFile.arrayBuffer());
        sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      }
      const headers: Record<string, string> = {
        "Content-Type": "application/vnd.android.package-archive",
        Authorization: `Bearer ${controlToken}`,
      };
      if (sha256) headers["X-APK-SHA256"] = sha256;
      const response = await fetch(`/android/install?packageName=${encodeURIComponent(packageName)}`, {
        method: "POST",
        headers,
        body: apkFile,
      });
      const data = await response.json() as OperationResult;
      setOperationResult({ ...data, ok: response.ok && data.ok === true });
      if (response.ok && data.ok === true) {
        setApkFile(null);
        const input = document.getElementById("arclight-apk-file") as HTMLInputElement | null;
        if (input) input.value = "";
        await refresh();
      }
    } catch (error) {
      setOperationResult({ ok: false, status: "INSTALL_REQUEST_FAILED", message: error instanceof Error ? error.message : "Installation request failed." });
    } finally {
      setOperationBusy(false);
    }
  }, [apkFile, controlToken, packageName, runtime?.ready, refresh]);

  const status = runtime?.status ?? (requestError ? "DIAGNOSTICS_UNAVAILABLE" : "CHECKING");
  const ready = runtime?.ready === true;
  const packageNameValid = /^(?=.{3,255}$)[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/.test(packageName);

  return (
    <section
      role="dialog"
      aria-label="Android runtime diagnostics"
      className="absolute z-[60] flex flex-col overflow-hidden rounded-2xl border border-emerald-700 bg-[#101714] text-emerald-50 shadow-2xl"
      style={{
        left: typeof window !== "undefined" && window.innerWidth < 640 ? "8px" : pos.x,
        top: typeof window !== "undefined" && window.innerWidth < 640 ? "8px" : pos.y,
        width: typeof window !== "undefined" && window.innerWidth < 640 ? "calc(100% - 16px)" : "620px",
        maxWidth: "calc(100% - 16px)",
        maxHeight: "calc(100% - 96px)",
        minHeight: "340px",
      }}
    >
      <header onMouseDown={beginDrag} className="flex cursor-move items-center justify-between border-b border-emerald-800 bg-[#123326] px-4 py-3 select-none">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-emerald-300" />
          <div>
            <h2 className="text-sm font-bold">Android Runtime</h2>
            <p className="text-[10px] text-emerald-200/70">Live host and device diagnostics</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void refresh()} disabled={loading || operationBusy || inspectBusy} aria-label="Refresh runtime status" className="rounded-md p-1.5 hover:bg-white/10 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={onClose} aria-label="Close Android runtime diagnostics" className="rounded-md p-1.5 hover:bg-red-900/80">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-auto p-4">
        <div className={`flex items-start gap-3 rounded-xl border p-3 ${ready ? "border-emerald-600/60 bg-emerald-950/40" : "border-amber-700/60 bg-amber-950/30"}`}>
          {ready ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />}
          <div className="min-w-0">
            <div className="text-xs font-bold tracking-wide">{status}</div>
            <p className="mt-1 text-xs leading-5 text-emerald-50/75">{runtime?.reason ?? requestError ?? "Checking the actual runtime; no success is assumed."}</p>
          </div>
        </div>

        {runtime?.host && (
          <div>
            <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300/70">Actual host capabilities</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                ["Kernel", runtime.host.kernel],
                ["Architecture", runtime.host.architecture],
                ["gVisor", runtime.host.gvisor ? "DETECTED" : "NOT DETECTED"],
                ["Binder device", boolLabel(runtime.host.binderDevice)],
                ["Binder module", boolLabel(runtime.host.binderModule)],
                ["KVM device", boolLabel(runtime.host.kvmDevice)],
                ["ADB", runtime.adb?.available ? "AVAILABLE" : "MISSING"],
                ["Runtime adapter", runtime.adapter.toUpperCase()],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-emerald-900 bg-black/20 p-2.5">
                  <div className="text-[10px] text-emerald-200/60">{label}</div>
                  <div className="mt-1 break-words font-mono text-emerald-100">{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {runtime?.target && (
          <div>
            <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300/70">Connected Android target</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-emerald-900 bg-black/20 p-2.5">
                <div className="text-[10px] text-emerald-200/60">Model</div>
                <div className="mt-1 break-words">{runtime.target.model ?? "Unknown"}</div>
              </div>
              <div className="rounded-lg border border-emerald-900 bg-black/20 p-2.5">
                <div className="text-[10px] text-emerald-200/60">Android version</div>
                <div className="mt-1">{runtime.target.androidVersion ?? "Unknown"}</div>
              </div>
              <div className="rounded-lg border border-emerald-900 bg-black/20 p-2.5">
                <div className="text-[10px] text-emerald-200/60">ABI</div>
                <div className="mt-1 break-words">{runtime.target.abi ?? "Unknown"}</div>
              </div>
              <div className="rounded-lg border border-emerald-900 bg-black/20 p-2.5">
                <div className="text-[10px] text-emerald-200/60">Package manager</div>
                <div className="mt-1">{runtime.checks?.packageManager ? "RESPONDING" : "NOT VERIFIED"}</div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3 rounded-xl border border-emerald-800/80 bg-black/20 p-3">
          <div className="flex items-center gap-2 text-xs font-bold">
            <LockKeyhole className="h-4 w-4 text-emerald-300" />
            APK installer
          </div>
          <p className="text-[11px] leading-5 text-emerald-100/60">
            The control token stays in this window's memory and is not saved. Configure ANDROID_CONTROL_TOKEN on the server before using install or launch.
          </p>
          <label className="block text-[10px] text-emerald-200/70">
            Control token
            <input
              type="password"
              autoComplete="off"
              value={controlToken}
              onChange={(event) => setControlToken(event.target.value)}
              placeholder="Paste server control token"
              className="mt-1 w-full rounded-lg border border-emerald-900 bg-[#07100b] px-3 py-2 font-mono text-xs text-emerald-50 outline-none focus:border-emerald-500"
            />
          </label>
          <label className="block text-[10px] text-emerald-200/70">
            Android package name (verify after install)
            <input
              value={packageName}
              onChange={(event) => setPackageName(event.target.value.trim())}
              placeholder="com.example.testapk"
              spellCheck={false}
              className="mt-1 w-full rounded-lg border border-emerald-900 bg-[#07100b] px-3 py-2 font-mono text-xs text-emerald-50 outline-none focus:border-emerald-500"
            />
          </label>
          <label className="block text-[10px] text-emerald-200/70">
            APK file
            <input
              id="arclight-apk-file"
              type="file"
              accept=".apk,application/vnd.android.package-archive"
              onChange={(event) => setApkFile(event.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-xs text-emerald-100 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-800 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-emerald-700"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void inspectSelectedApk()}
              disabled={!controlToken.trim() || controlToken.trim().length < 32 || !apkFile || operationBusy || inspectBusy}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-700 px-3 py-2 text-xs font-bold text-emerald-100 hover:bg-emerald-950 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {inspectBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}
              Inspect APK
            </button>
            <button
              onClick={() => void installSelectedApk()}
              disabled={!ready || !controlToken.trim() || controlToken.trim().length < 32 || !apkFile || !packageNameValid || operationBusy || inspectBusy}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {operationBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Install APK
            </button>
            <button
              onClick={() => void postOperation("/android/launch", { packageName })}
              disabled={!ready || !controlToken.trim() || controlToken.trim().length < 32 || !packageNameValid || operationBusy || inspectBusy}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-700 px-3 py-2 text-xs font-bold text-emerald-100 hover:bg-emerald-950 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {operationBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Launch package
            </button>
          </div>
          {!ready && <p className="text-[10px] text-amber-200/80">Connect a real Android target first; installation is disabled while the runtime is offline.</p>}
          {operationResult && (
            <div className={`rounded-lg border p-3 ${operationResult.ok ? "border-emerald-700 bg-emerald-950/40" : "border-rose-800 bg-rose-950/30"}`}>
              <div className="text-xs font-bold">{operationResult.status ?? (operationResult.ok ? "PASS" : "FAILED")}</div>
              <p className="mt-1 break-words text-[11px] leading-5 text-emerald-50/75">
                {operationResult.message ?? operationResult.reason ?? operationResult.note ?? operationResult.stderr ?? operationResult.runtime?.reason ?? operationResult.verificationOutput ?? operationResult.installOutput ?? operationResult.launchOutput ?? "See server diagnostics for the failing stage."}
              </p>
              {operationResult.sha256 && <p className="mt-2 break-all font-mono text-[10px] text-emerald-300">SHA-256: {operationResult.sha256}</p>}
            </div>
          )}
        </div>

        {runtime?.diagnostics && runtime.diagnostics.length > 0 && (
          <div className="rounded-lg border border-amber-900/70 bg-black/20 p-3">
            <h3 className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">
              <Activity className="h-3.5 w-3.5" /> Diagnostics
            </h3>
            <ul className="space-y-1.5 text-xs text-emerald-50/75">
              {runtime.diagnostics.map((item, index) => <li key={index}>• {item}</li>)}
            </ul>
          </div>
        )}

        {!runtime && !requestError && <p className="text-xs text-emerald-100/60">Waiting for diagnostics response…</p>}
        <p className="text-[10px] text-emerald-100/40">
          {runtime?.checkedAt ? `Last checked: ${new Date(runtime.checkedAt).toLocaleTimeString()}` : "No verified runtime result yet."}
        </p>
      </div>
    </section>
  );
}
