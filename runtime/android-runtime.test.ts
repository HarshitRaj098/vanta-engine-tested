import test from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import { parseAdbDevices, isValidPackageName, runCommand } from "./android-runtime.js";

test("parseAdbDevices ignores the header and blank lines", () => {
  assert.deepEqual(parseAdbDevices("List of devices attached\n\n"), []);
});

test("parseAdbDevices recognizes authorized, unauthorized and offline targets", () => {
  const devices = parseAdbDevices(
    "List of devices attached\n" +
    "emulator-5554 device product:sdk_gphone64_x86_64 model:sdk_gphone64_x86_64\n" +
    "R58M123 unauthorized usb:1-1\n" +
    "10.0.0.2:5555 offline\n",
  );
  assert.equal(devices.length, 3);
  assert.equal(devices[0].serial, "emulator-5554");
  assert.equal(devices[0].state, "device");
  assert.match(devices[0].details, /product:sdk_gphone64_x86_64/);
  assert.equal(devices[1].state, "unauthorized");
  assert.equal(devices[2].state, "offline");
});

test("parseAdbDevices ignores daemon startup chatter", () => {
  const devices = parseAdbDevices(
    "* daemon not running; starting now at tcp:5037\n" +
    "* daemon started successfully\n" +
    "List of devices attached\n" +
    "phone-1 device\n",
  );
  assert.deepEqual(devices, [{ serial: "phone-1", state: "device", details: "" }]);
});

test("valid package names are accepted", () => {
  assert.equal(isValidPackageName("com.example.app"), true);
  assert.equal(isValidPackageName("org.example.app_2"), true);
});

test("invalid package names and command injection strings are rejected", () => {
  for (const value of ["", "com", "com..app", "com.example;reboot", "com.example app", "../app", "com.example.$bad"]) {
    assert.equal(isValidPackageName(value), false, value);
  }
});

test("runCommand passes executable arguments separately and captures stdout", async () => {
  const result = await runCommand(process.execPath, ["-e", "process.stdout.write('ARGUMENTS_OK')"]);
  assert.equal(result.ok, true);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "ARGUMENTS_OK");
});

test("runCommand captures non-zero exit without throwing", async () => {
  const result = await runCommand(process.execPath, ["-e", "process.stderr.write('EXPECTED_ERROR'); process.exit(7)"]);
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 7);
  assert.equal(result.stderr, "EXPECTED_ERROR");
});
