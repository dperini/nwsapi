// ZIP headers adapted from Wheelhouse's artifact client.
const LOCAL_HEADER_SIGNATURE = 0x04_03_4b_50
const CENTRAL_HEADER_SIGNATURE = 0x02_01_4b_50
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06_05_4b_50
const COMPRESSION_DEFLATE = 8

export const ZIP_MAX_BYTES = 0xff_ff_ff_fe
export const ZIP_MAX_ENTRIES = 0xff_fe

export interface ZipHeaderConfig {
  name: string
  crc: number
  compressedSize: number
  uncompressedSize: number
  offset: number
}

export function createZipHeaders(config: ZipHeaderConfig): {
  local: Buffer
  central: Buffer
} {
  const name = Buffer.from(config.name, 'utf8')
  if (
    name.length > 0xff_ff ||
    [config.compressedSize, config.uncompressedSize, config.offset].some(
      value =>
        !Number.isSafeInteger(value) || value < 0 || value > ZIP_MAX_BYTES,
    )
  ) {
    throw new RangeError(
      'ZIP entry exceeds classic ZIP limits. Where: archive headers. Saw an oversized size, offset or name; wanted fields below 4 GiB. Fix: split the artifact into smaller archives.',
    )
  }
  const local = Buffer.alloc(30 + name.length)
  local.writeUInt32LE(LOCAL_HEADER_SIGNATURE, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(0x08_00, 6)
  local.writeUInt16LE(COMPRESSION_DEFLATE, 8)
  local.writeUInt32LE(config.crc, 14)
  local.writeUInt32LE(config.compressedSize, 18)
  local.writeUInt32LE(config.uncompressedSize, 22)
  local.writeUInt16LE(name.length, 26)
  name.copy(local, 30)
  const central = Buffer.alloc(46 + name.length)
  central.writeUInt32LE(CENTRAL_HEADER_SIGNATURE, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(0x08_00, 8)
  central.writeUInt16LE(COMPRESSION_DEFLATE, 10)
  central.writeUInt32LE(config.crc, 16)
  central.writeUInt32LE(config.compressedSize, 20)
  central.writeUInt32LE(config.uncompressedSize, 24)
  central.writeUInt16LE(name.length, 28)
  central.writeUInt32LE(config.offset, 42)
  name.copy(central, 46)
  return { local, central }
}

export function createZipEnd(config: {
  entries: number
  centralSize: number
  centralOffset: number
}): Buffer {
  if (
    !Number.isSafeInteger(config.entries) ||
    config.entries < 0 ||
    config.entries > ZIP_MAX_ENTRIES ||
    [
      config.centralSize,
      config.centralOffset,
      config.centralOffset + config.centralSize + 22,
    ].some(
      value =>
        !Number.isSafeInteger(value) || value < 0 || value > ZIP_MAX_BYTES,
    )
  ) {
    throw new RangeError(
      'ZIP archive exceeds classic ZIP limits. Where: archive directory. Saw an oversized archive or entry count; wanted less than 4 GiB and 65535 entries. Fix: split the artifact into smaller archives.',
    )
  }
  const end = Buffer.alloc(22)
  end.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0)
  end.writeUInt16LE(config.entries, 8)
  end.writeUInt16LE(config.entries, 10)
  end.writeUInt32LE(config.centralSize, 12)
  end.writeUInt32LE(config.centralOffset, 16)
  return end
}
