import React, { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, Smartphone, XCircle } from "lucide-react";

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

  const status = runtime?.status ?? (requestError ? "DIAGNOSTICS_UNAVAILABLE" : "CHECKING");
  const ready = runtime?.ready === true;

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
          <button onClick={() => void refresh()} disabled={loading} aria-label="Refresh runtime status" className="rounded-md p-1.5 hover:bg-white/10 disabled:opacity-50">
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
        {!ready && <div className="text-[11px] leading-5 text-emerald-100/60">APK installation stays disabled until a real Android target responds. This panel never treats a missing runtime as installed or ready.</div>}
      </div>
    </section>
  );
}
