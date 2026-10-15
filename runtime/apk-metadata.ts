import { readFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

function findEndOfCentralDirectory(zip: Buffer): number {
  const min = Math.max(0, zip.length - 22 - 0xffff);
  for (let offset = zip.length - 22; offset >= min; offset--) {
    if (zip.readUInt32LE(offset) === EOCD_SIGNATURE) {
      const commentLength = zip.readUInt16LE(offset + 20);
      if (offset + 22 + commentLength === zip.length) return offset;
    }
  }
  throw new Error("APK_INVALID: ZIP end-of-central-directory record is missing.");
}

function readZipEntry(zip: Buffer, entryName: string): Buffer {
  if (zip.length < 22) throw new Error("APK_INVALID: File is too small to be a valid ZIP archive.");
  const eocd = findEndOfCentralDirectory(zip);
  const disk = zip.readUInt16LE(eocd + 4);
  const centralDisk = zip.readUInt16LE(eocd + 6);
  const entriesOnDisk = zip.readUInt16LE(eocd + 8);
  const entriesTotal = zip.readUInt16LE(eocd + 10);
  const centralSize = zip.readUInt32LE(eocd + 12);
  const centralOffset = zip.readUInt32LE(eocd + 16);

  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entriesTotal || centralOffset + centralSize > eocd) {
    throw new Error("APK_UNSUPPORTED: Multi-disk or ZIP64 APK archives are not supported by this lightweight inspector.");
  }
  let cursor = centralOffset;
  for (let index = 0; index < entriesTotal; index++) {
    if (cursor + 46 > zip.length || zip.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
      throw new Error("APK_INVALID: ZIP central directory is malformed.");
    }
    const method = zip.readUInt16LE(cursor + 10);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const uncompressedSize = zip.readUInt32LE(cursor + 24);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const nameStart = cursor + 46;
    const name = zip.subarray(nameStart, nameStart + nameLength).toString("utf8");

    if (name === entryName) {
      if (uncompressedSize > MAX_MANIFEST_BYTES || compressedSize > zip.length) {
        throw new Error("APK_INVALID: Android manifest exceeds the permitted size.");
      }
      if (localOffset + 30 > zip.length || zip.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
        throw new Error("APK_INVALID: Android manifest local ZIP header is malformed.");
      }
      const localNameLength = zip.readUInt16LE(localOffset + 26);
      const localExtraLength = zip.readUInt16LE(localOffset + 28);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const dataEnd = dataOffset + compressedSize;
      if (dataOffset < 0 || dataEnd > zip.length) {
        throw new Error("APK_INVALID: Android manifest data is truncated.");
      }
      const compressed = zip.subarray(dataOffset, dataEnd);
      let output: Buffer;
      if (method === 0) output = Buffer.from(compressed);
      else if (method === 8) output = inflateRawSync(compressed, { maxOutputLength: MAX_MANIFEST_BYTES });
      else throw new Error(`APK_UNSUPPORTED: Android manifest uses ZIP compression method ${method}.`);
      if (output.length !== uncompressedSize) throw new Error("APK_INVALID: Android manifest size does not match ZIP metadata.");
      return output;
    }
    cursor = nameStart + nameLength + extraLength + commentLength;
  }
  throw new Error("APK_INVALID: AndroidManifest.xml was not found.");
}

function decodeLength8(buffer: Buffer, offset: number): { value: number; next: number } {
  const first = buffer[offset];
  if (first === undefined) throw new Error("Android manifest string pool is truncated.");
  if ((first & 0x80) === 0) return { value: first, next: offset + 1 };
  const second = buffer[offset + 1];
  if (second === undefined) throw new Error("Android manifest string pool length is truncated.");
  return { value: ((first & 0x7f) << 8) | second, next: offset + 2 };
}

function decodeLength16(buffer: Buffer, offset: number): { value: number; next: number } {
  if (offset + 2 > buffer.length) throw new Error("Android manifest UTF-16 string pool is truncated.");
  const first = buffer.readUInt16LE(offset);
  if ((first & 0x8000) === 0) return { value: first, next: offset + 2 };
  if (offset + 4 > buffer.length) throw new Error("Android manifest UTF-16 length is truncated.");
  const second = buffer.readUInt16LE(offset + 2);
  return { value: ((first & 0x7fff) << 16) | second, next: offset + 4 };
}

function parseStringPool(chunk: Buffer, offset: number, headerSize: number, chunkSize: number): string[] {
  if (headerSize < 28 || offset + chunkSize > chunk.length) throw new Error("Android manifest string pool is malformed.");
  const stringCount = chunk.readUInt32LE(offset + 8);
  const flags = chunk.readUInt32LE(offset + 16);
  const stringsStart = chunk.readUInt32LE(offset + 20);
  if (stringCount > 200_000 || headerSize + stringCount * 4 > chunkSize || stringsStart >= chunkSize) {
    throw new Error("Android manifest string pool bounds are invalid.");
  }
  const utf8 = (flags & 0x100) !== 0;
  const strings: string[] = [];
  for (let index = 0; index < stringCount; index++) {
    const relative = chunk.readUInt32LE(offset + headerSize + index * 4);
    let position = offset + stringsStart + relative;
    if (position < offset || position >= offset + chunkSize) throw new Error("Android manifest string offset is invalid.");
    if (utf8) {
      position = decodeLength8(chunk, position).next;
      const byteLength = decodeLength8(chunk, position);
      position = byteLength.next;
      const end = position + byteLength.value;
      if (end >= offset + chunkSize || chunk[end] !== 0) throw new Error("Android manifest UTF-8 string is truncated.");
      strings.push(chunk.subarray(position, end).toString("utf8"));
    } else {
      const length = decodeLength16(chunk, position);
      position = length.next;
      const bytes = length.value * 2;
      const end = position + bytes;
      if (end + 2 > offset + chunkSize || chunk.readUInt16LE(end) !== 0) throw new Error("Android manifest UTF-16 string is truncated.");
      strings.push(chunk.subarray(position, end).toString("utf16le"));
    }
  }
  return strings;
}

export function parseAndroidManifestPackage(manifest: Buffer | Uint8Array | string): string {
  const data = typeof manifest === "string" ? Buffer.from(manifest) : Buffer.from(manifest);
  const leading = data.toString("utf8", 0, Math.min(data.length, 64)).trimStart();
  if (leading.startsWith("<?xml") || leading.startsWith("<manifest")) {
    const tag = data.toString("utf8").match(/<manifest\b[^>]*>/s)?.[0];
    const match = tag?.match(/\bpackage\s*=\s*["']([^"']+)["']/);
    if (!match) throw new Error("APK_MANIFEST_INVALID: package attribute is missing from the manifest.");
    return match[1];
  }
  if (data.length < 8 || data.readUInt16LE(0) !== 0x0003) {
    throw new Error("APK_MANIFEST_UNSUPPORTED: AndroidManifest.xml is not recognized as Android binary XML.");
  }
  const rootSize = data.readUInt32LE(4);
  if (rootSize > data.length || rootSize < 8) throw new Error("APK_MANIFEST_INVALID: binary XML size is invalid.");

  let strings: string[] = [];
  let offset = data.readUInt16LE(2);
  while (offset + 8 <= rootSize) {
    const type = data.readUInt16LE(offset);
    const headerSize = data.readUInt16LE(offset + 2);
    const chunkSize = data.readUInt32LE(offset + 4);
    if (headerSize < 8 || chunkSize < headerSize || offset + chunkSize > rootSize) {
      throw new Error("APK_MANIFEST_INVALID: binary XML chunk is malformed.");
    }
    if (type === 0x0001) strings = parseStringPool(data, offset, headerSize, chunkSize);
    if (type === 0x0102 && strings.length > 0 && headerSize >= 16 && chunkSize >= 36) {
      const elementNameIndex = data.readUInt32LE(offset + 20);
      if (strings[elementNameIndex] === "manifest") {
        const attributeStart = data.readUInt16LE(offset + 24);
        const attributeSize = data.readUInt16LE(offset + 26);
        const attributeCount = data.readUInt16LE(offset + 28);
        if (attributeSize < 20 || attributeCount > 4096 || offset + 16 + attributeStart + attributeSize * attributeCount > offset + chunkSize) {
          throw new Error("APK_MANIFEST_INVALID: manifest attributes are malformed.");
        }
        const attributesBase = offset + 16 + attributeStart;
        for (let i = 0; i < attributeCount; i++) {
          const attribute = attributesBase + i * attributeSize;
          const nameIndex = data.readUInt32LE(attribute + 4);
          if (strings[nameIndex] !== "package") continue;
          const rawValueIndex = data.readUInt32LE(attribute + 8);
          if (rawValueIndex !== 0xffffffff && strings[rawValueIndex]) return strings[rawValueIndex];
          const valueType = data.readUInt8(attribute + 15);
          const valueData = data.readUInt32LE(attribute + 16);
          if (valueType === 0x03 && strings[valueData]) return strings[valueData];
          throw new Error("APK_MANIFEST_INVALID: package attribute is not a string.");
        }
        throw new Error("APK_MANIFEST_INVALID: package attribute is missing.");
      }
    }
    offset += chunkSize;
  }
  throw new Error("APK_MANIFEST_INVALID: manifest element or string pool was not found.");
}

export async function readApkPackageName(filePath: string): Promise<string> {
  const zip = await readFile(filePath);
  return parseAndroidManifestPackage(readZipEntry(zip, "AndroidManifest.xml"));
}
