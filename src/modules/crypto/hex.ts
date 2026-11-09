/** Matches a 256-bit value encoded as 64 hexadecimal characters. */
export function isHex256(value: unknown): value is string {
  return typeof value === 'string' && /^[\da-f]{64}$/i.test(value)
}
