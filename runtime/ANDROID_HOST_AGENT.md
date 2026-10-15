# Arclight Android Host Agent

The current Arclight cloud/gVisor environment cannot run Waydroid locally because it lacks Android Binder support. This service runs on a **separate, compatible host** with access to a real Android runtime or an authorized Android device.

## 1. Prepare the Android host

On a supported Linux host, first verify an actual runtime or device:

```bash
adb devices -l
adb shell getprop ro.build.version.release
```

For Waydroid, also check:

```bash
waydroid status
waydroid shell getprop ro.build.version.release
```

At least one supported path must report a real Android version and an available package manager. The agent will not simulate readiness.

## 2. Configure and start the agent

In a separate checkout of this repository on the Android host:

```bash
npm ci
export ANDROID_HOST_AGENT_TOKEN="$(openssl rand -hex 32)"
export ANDROID_HOST_AGENT_HOST="127.0.0.1"
export ANDROID_HOST_AGENT_PORT="4317"
npm run android:host
```

The host agent binds to loopback by default. It exposes a minimal health check at `http://127.0.0.1:4317/health`; device details and package operations require the bearer token.

**Do not expose port 4317 directly over an untrusted network.** To connect remotely, use a TLS reverse proxy or a trusted encrypted tunnel that forwards to the loopback listener. If binding the agent directly to a non-loopback interface, provide `ANDROID_HOST_AGENT_TLS_CERT` and `ANDROID_HOST_AGENT_TLS_KEY`; the service refuses a non-loopback plaintext bind.

The agent environment must not contain `ANDROID_HOST_AGENT_URL` or `ANDROID_HOST_AGENT_CLIENT_TOKEN`; those are client-side settings for Arclight.

## 3. Configure Arclight

In the Arclight server's environment, set:

```bash
ANDROID_HOST_AGENT_URL="https://your-authenticated-tls-endpoint"
ANDROID_HOST_AGENT_CLIENT_TOKEN="<same secret configured as ANDROID_HOST_AGENT_TOKEN on the host>"
ANDROID_CONTROL_TOKEN="$(openssl rand -hex 32)"
```

Use an HTTPS endpoint with valid certificate verification. For local-only testing, `http://127.0.0.1:<port>` is allowed, but it is useful only when the Arclight server and host agent share the same network namespace.

Restart the Arclight application server after changing its environment. In the desktop, open **Android Runtime**, refresh the live status, paste `ANDROID_CONTROL_TOKEN` into the control-token field, select `TestAPK.apk`, confirm the package name `com.example.testapk`, and click **Install APK**. Click **Launch package** after the package is independently verified.

The token fields are distinct:

- `ANDROID_HOST_AGENT_TOKEN`: authenticates Arclight to the host agent.
- `ANDROID_HOST_AGENT_CLIENT_TOKEN`: Arclight's copy of that same host-agent secret.
- `ANDROID_CONTROL_TOKEN`: authorizes install/launch controls on the Arclight gateway.

## 4. Security notes

- Use separate environment configuration on the host and Arclight server.
- Generate high-entropy secrets; never commit a live token.
- Use a real TLS endpoint for remote networking.
- The agent exposes scoped runtime actions, not a general remote shell.
- APK bytes are checked against their SHA-256 header and manifest package identity before installation.
- A successful upload is not installation proof. Arclight verifies the target package through Android's package manager.

## 5. Current limitation

This is a runtime connection path, not an Android VM bundled into the browser. The real Android host/device must remain online and reachable. If none is available, runtime diagnostics correctly show an offline/unsupported status, and APK installation stays blocked.
