import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
import { parseAndroidManifestPackage, readApkPackageName } from "./apk-metadata.js";

function createZip(entryName: string, uncompressed: Buffer, method: 0 | 8 = 0): Buffer {
  const name = Buffer.from(entryName, "utf8");
  const compressed = method === 8 ? deflateRawSync(uncompressed) : uncompressed;
  const local = Buffer.alloc(30 + name.length + compressed.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(uncompressed.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  name.copy(local, 30);
  compressed.copy(local, 30 + name.length);

  const central = Buffer.alloc(46 + name.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(uncompressed.length, 24);
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

function createUtf8StringPool(values: string[]): Buffer {
  const encoded = values.map((value) => {
    const text = Buffer.from(value, "utf8");
    const utf16Length = Buffer.from([value.length]);
    const utf8Length = Buffer.from([text.length]);
    return Buffer.concat([utf16Length, utf8Length, text, Buffer.from([0])]);
  });
  const offsets: number[] = [];
  let total = 0;
  for (const value of encoded) {
    offsets.push(total);
    total += value.length;
  }
  const headerSize = 28;
  const stringsStart = headerSize + values.length * 4;
  const chunk = Buffer.alloc(stringsStart + total);
  chunk.writeUInt16LE(0x0001, 0);
  chunk.writeUInt16LE(headerSize, 2);
  chunk.writeUInt32LE(chunk.length, 4);
  chunk.writeUInt32LE(values.length, 8);
  chunk.writeUInt32LE(0, 12);
  chunk.writeUInt32LE(0x100, 16);
  chunk.writeUInt32LE(stringsStart, 20);
  chunk.writeUInt32LE(0, 24);
  offsets.forEach((value, index) => chunk.writeUInt32LE(value, headerSize + index * 4));
  let cursor = stringsStart;
  for (const value of encoded) {
    value.copy(chunk, cursor);
    cursor += value.length;
  }
  return chunk;
}

function createBinaryManifest(packageName: string): Buffer {
  const strings = ["manifest", "package", packageName];
  const pool = createUtf8StringPool(strings);
  const start = Buffer.alloc(56);
  start.writeUInt16LE(0x0102, 0);
  start.writeUInt16LE(16, 2);
  start.writeUInt32LE(start.length, 4);
  start.writeUInt32LE(1, 8);
  start.writeUInt32LE(0xffffffff, 12);
  start.writeUInt32LE(0xffffffff, 16);
  start.writeUInt32LE(0, 20);
  start.writeUInt16LE(20, 24);
  start.writeUInt16LE(20, 26);
  start.writeUInt16LE(1, 28);
  start.writeUInt16LE(0, 30);
  start.writeUInt16LE(0, 32);
  start.writeUInt16LE(0, 34);
  start.writeUInt32LE(0xffffffff, 36);
  start.writeUInt32LE(1, 40);
  start.writeUInt32LE(2, 44);
  start.writeUInt16LE(8, 48);
  start.writeUInt8(0, 50);
  start.writeUInt8(0x03, 51);
  start.writeUInt32LE(2, 52);

  const totalSize = 8 + pool.length + start.length;
  const root = Buffer.alloc(8);
  root.writeUInt16LE(0x0003, 0);
  root.writeUInt16LE(8, 2);
  root.writeUInt32LE(totalSize, 4);
  return Buffer.concat([root, pool, start]);
}

test("parseAndroidManifestPackage reads a text XML package attribute", () => {
  const manifest = Buffer.from('<?xml version="1.0"?><manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.example.testapk"><application/></manifest>');
  assert.equal(parseAndroidManifestPackage(manifest), "com.example.testapk");
});

test("parseAndroidManifestPackage reads a binary Android XML package attribute", () => {
  assert.equal(parseAndroidManifestPackage(createBinaryManifest("com.example.testapk")), "com.example.testapk");
});

test("parseAndroidManifestPackage rejects a missing package attribute", () => {
  assert.throws(
    () => parseAndroidManifestPackage(Buffer.from('<?xml version="1.0"?><manifest><application/></manifest>')),
    /package attribute is missing/,
  );
});

test("readApkPackageName extracts an uncompressed manifest from a ZIP/APK", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "apk-metadata-test-"));
  const apk = path.join(dir, "test.apk");
  try {
    const xml = Buffer.from('<manifest package="com.example.testapk"><application/></manifest>');
    await writeFile(apk, createZip("AndroidManifest.xml", xml));
    assert.equal(await readApkPackageName(apk), "com.example.testapk");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("readApkPackageName extracts a deflated manifest from a ZIP/APK", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "apk-metadata-test-"));
  const apk = path.join(dir, "test.apk");
  try {
    const binary = createBinaryManifest("com.example.testapk");
    await writeFile(apk, createZip("AndroidManifest.xml", binary, 8));
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
