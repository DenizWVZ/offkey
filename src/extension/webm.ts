// Reads the audio YouTube downloads, which comes as a WebM file split across many pieces.
// A WebM file is a header (what's inside: codec, channels) followed by clusters, each a few seconds
// of compressed audio stamped with its time in the song. Pieces can cut anywhere, so bytes are
// collected until whole clusters can be read out.
// Only what's needed to decode clusters on their own: the header parts, and each cluster's time.

// Element ids (with their length marker bits, as they appear in the file).
const EBML = 0x1a45dfa3
const SEGMENT = 0x18538067
const INFO = 0x1549a966
const TRACKS = 0x1654ae6b
const CLUSTER = 0x1f43b675
const TIMECODE = 0xe7
const TIMECODE_SCALE = 0x2ad7b1

// Top-level parts of a segment; an unknown-size cluster ends where one of these begins.
const TOP_LEVEL = [CLUSTER, INFO, TRACKS, 0x114d9b74 /* SeekHead */, 0x1c53bb6b /* Cues */, 0x1254c367 /* Tags */, 0x1941a469 /* Attachments */, 0x1043a770 /* Chapters */, EBML]

// A segment of unknown size: lets the header be followed by any clusters we choose.
const OPEN_SEGMENT = new Uint8Array([0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])

export type Cluster = { seconds: number; bytes: Uint8Array } // seconds: its time in the song

type Header = { at: number; id: number; size: number | null; length: number } // size null = unknown

// Reads an element's id and size at `at`, or null if the bytes aren't all there yet.
function readHeader(bytes: Uint8Array, at: number): Header | null {
  const idLength = vintLength(bytes[at])
  if (idLength === 0 || idLength > 4 || at + idLength >= bytes.length) return null
  let id = 0
  for (let i = 0; i < idLength; i++) id = id * 256 + bytes[at + i]
  const sizeAt = at + idLength
  const sizeLength = vintLength(bytes[sizeAt])
  if (sizeLength === 0 || sizeAt + sizeLength > bytes.length) return null
  let size = bytes[sizeAt] & (0xff >> sizeLength)
  let allOnes = size === 0xff >> sizeLength
  for (let i = 1; i < sizeLength; i++) {
    size = size * 256 + bytes[sizeAt + i]
    allOnes &&= bytes[sizeAt + i] === 0xff
  }
  return { at, id, size: allOnes ? null : size, length: idLength + sizeLength }
}

// How many bytes a variable-length number takes, from its first byte (0 if invalid).
function vintLength(first: number | undefined) {
  if (!first) return 0
  let length = 1
  while (!(first & (0x80 >> (length - 1)))) length++
  return length
}

function readUint(bytes: Uint8Array, at: number, length: number) {
  let value = 0
  for (let i = 0; i < length; i++) value = value * 256 + bytes[at + i]
  return value
}

// Finds a child element's unsigned value inside a parent's bytes.
function findUint(bytes: Uint8Array, from: number, to: number, id: number): number | null {
  for (let at = from; at < to; ) {
    const header = readHeader(bytes, at)
    if (!header || header.size === null) return null
    if (header.id === id) return readUint(bytes, at + header.length, header.size)
    at += header.length + header.size
  }
  return null
}

const concat = (parts: Uint8Array[]) => {
  const all = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) {
    all.set(part, at)
    at += part.length
  }
  return all
}

// Collects the pieces of one WebM audio stream and reads out whole clusters.
export function createWebmReader() {
  let pending = new Uint8Array(0)
  let ebml: Uint8Array | null = null
  let info: Uint8Array | null = null
  let tracks: Uint8Array | null = null
  let timecodeScale = 1_000_000 // nanoseconds per timecode unit (the WebM default: milliseconds)

  return {
    // Adds a downloaded piece; returns the clusters it completed, in order.
    add(piece: Uint8Array): Cluster[] {
      const bytes = pending.length ? concat([pending, piece]) : piece
      const clusters: Cluster[] = []
      let at = 0
      while (at < bytes.length) {
        const header = readHeader(bytes, at)
        if (!header) {
          if (bytes.length - at < 12) break // wait for the rest
          // Not readable (shouldn't happen): skip ahead to the next part we recognise.
          const next = findNextTopLevel(bytes, at + 1)
          at = next ?? bytes.length - 3
          if (next === null) break
          continue
        }
        const end = header.size === null ? null : at + header.length + header.size

        if (header.id === SEGMENT) {
          at += header.length // step inside: its parts follow
          continue
        }
        if (header.id === CLUSTER && end === null) {
          // Unknown size: it ends where the next top-level part starts.
          const next = findNextTopLevel(bytes, at + header.length)
          if (next === null) break
          clusters.push(readCluster(bytes.subarray(at, next), header))
          at = next
          continue
        }
        if (end === null) {
          at += header.length // some other open-ended part: step inside
          continue
        }
        if (end > bytes.length) break // wait for the rest

        const element = bytes.slice(at, end)
        if (header.id === EBML) ebml = element
        else if (header.id === INFO) {
          info = element
          timecodeScale = findUint(element, header.length, element.length, TIMECODE_SCALE) ?? timecodeScale
        } else if (header.id === TRACKS) tracks = element
        else if (header.id === CLUSTER) clusters.push(readCluster(element, header))
        at = end
      }
      pending = bytes.slice(at)
      return clusters
    },

    // A complete, decodable WebM file made of the header and the given clusters.
    file(clusters: Cluster[]): Uint8Array | null {
      if (!ebml || !info || !tracks) return null
      return concat([ebml, OPEN_SEGMENT, info, tracks, ...clusters.map((c) => c.bytes)])
    },
  }

  function readCluster(bytes: Uint8Array, header: Header): Cluster {
    const timecode = findUint(bytes, header.length, bytes.length, TIMECODE) ?? 0
    return { seconds: (timecode * timecodeScale) / 1e9, bytes: bytes.slice() }
  }
}

// Where the next top-level element starts after `from`, or null if not in these bytes yet.
function findNextTopLevel(bytes: Uint8Array, from: number): number | null {
  for (let at = from; at + 4 <= bytes.length; at++) {
    if (TOP_LEVEL.includes(readUint(bytes, at, 4))) return at
  }
  return null
}
