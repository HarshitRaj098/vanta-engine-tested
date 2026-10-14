import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseAndroidManifestPackage, readApkPackageName } from "./apk-metadata.js";

function createStoredZip(entryName: string, bytes: Buffer): Buffer {
  const name = Buffer.from(entryName, "utf8");
  const local = Buffer.alloc(30 + name.length + bytes.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(0, 8);
  local.writeUInt32LE(bytes.length, 18);
  local.writeUInt32LE(bytes.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  name.copy(local, 30);
  bytes.copy(local, 30 + name.length);

  const central = Buffer.alloc(46 + name.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt32LE(bytes.length, 20);
  central.writeUInt32LE(bytes.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt32LE(0, 42);
  name.copy(central, 46);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, central, eocd]);
}

test("parseAndroidManifestPackage reads a text XML package attribute", () => {
  const manifest = Buffer.from('<?xml version="1.0"?><manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.example.testapk"><application/></manifest>');
  assert.equal(parseAndroidManifestPackage(manifest), "com.example.testapk");
});

test("parseAndroidManifestPackage rejects a missing package attribute", () => {
  assert.throws(
    () => parseAndroidManifestPackage(Buffer.from('<?xml version="1.0"?><manifest><application/></manifest>')),
    /package attribute is missing/,
  );
});

test("readApkPackageName extracts AndroidManifest.xml from a ZIP/APK", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "apk-metadata-test-"));
  const apk = path.join(dir, "test.apk");
  try {
    const xml = Buffer.from('<manifest package="com.example.testapk"><application/></manifest>');
    await writeFile(apk, createStoredZip("AndroidManifest.xml", xml));
    assert.equal(await readApkPackageName(apk), "com.example.testapk");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("readApkPackageName rejects files without a ZIP directory", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "apk-metadata-test-"));
  const apk = path.join(dir, "invalid.apk");
  try {
    await writeFile(apk, Buffer.from("not an APK"));
    await assert.rejects(readApkPackageName(apk), /end-of-central-directory/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
