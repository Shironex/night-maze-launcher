// A minimal zip writer on Node builtins: deflate entries, UTF-8 names, forward
// slashes, Unix permission bits. Enough for a game package of a few files, and
// one implementation for the local packager and the release workflow.

import { crc32, deflateRawSync } from 'node:zlib';

const VERSION_NEEDED = 20;
// "Made by" 3 means Unix, which is what makes readers honour the mode bits.
const VERSION_MADE_BY = (3 << 8) | VERSION_NEEDED;
const FLAG_UTF8 = 0x0800;
const METHOD_DEFLATE = 8;

/** MS-DOS date and time fields of `date`, as the zip format stores them. */
function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/**
 * Build a zip archive in memory.
 *
 * @param {{ name: string, data: Buffer, mode?: number }[]} entries
 *   `name` is the path inside the archive with forward slashes, `mode` the
 *   Unix permission bits (0o644 when left out).
 * @param {Date} [date] The timestamp written for every entry.
 * @returns {Buffer}
 */
export function createZip(entries, date = new Date()) {
  const { time, day } = dosDateTime(date);
  const parts = [];
  const directory = [];
  let offset = 0;

  for (const entry of entries) {
    if (entry.name.startsWith('/') || entry.name.split('/').includes('..')) {
      throw new Error(`refusing to pack an entry outside the archive: ${entry.name}`);
    }
    const name = Buffer.from(entry.name, 'utf8');
    const compressed = deflateRawSync(entry.data, { level: 9 });
    const checksum = crc32(entry.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(VERSION_NEEDED, 4);
    local.writeUInt16LE(FLAG_UTF8, 6);
    local.writeUInt16LE(METHOD_DEFLATE, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(VERSION_MADE_BY, 4);
    central.writeUInt16LE(VERSION_NEEDED, 6);
    central.writeUInt16LE(FLAG_UTF8, 8);
    central.writeUInt16LE(METHOD_DEFLATE, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    // Regular file (0o100000) with the given permission bits, in the high word.
    central.writeUInt32LE(((0o100000 | (entry.mode ?? 0o644)) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);

    parts.push(local, name, compressed);
    directory.push(central, name);
    offset += local.length + name.length + compressed.length;
  }

  const directorySize = directory.reduce((total, part) => total + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directorySize, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...parts, ...directory, end]);
}
