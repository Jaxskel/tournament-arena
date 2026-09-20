// Only tagged native events affect game modes. Raw console output is diagnostic.
export function decodeNativeRecord(line, nonce) {
  const prefix = `ARENA_RECORD ${nonce} `;
  if (!nonce || !line.startsWith(prefix)) return null;
  const encoded = line.slice(prefix.length).trim();
  if (
    encoded.length > 2048 ||
    encoded.length % 2 ||
    !/^([0-9a-f]{2})+$/.test(encoded)
  )
    return null;
  // A single structured record cannot introduce another record via newlines.
  return Buffer.from(encoded, "hex")
    .toString("utf8")
    .replace(/[\r\n]+$/, "")
    .replace(/[\r\n]/g, " ");
}
