// Deterministic JSON serialization in the spirit of RFC 8785 (JCS): object
// keys are sorted recursively and the output has no incidental whitespace, so
// the same logical document always serializes to the same bytes — signatures
// (src/server/signing-service.ts) are only as stable as this function.
//
// Dates must already be ISO-8601 UTC strings; this module has no notion of
// Date and never coerces one, since `JSON.stringify(new Date(...))` depends
// on the object's own toJSON and isn't canonical by construction.

export function canonicalize(value: unknown): string {
  return serialize(value)
}

function serialize(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`canonical-json: cannot serialize non-finite number ${value}`)
    }
    return JSON.stringify(value)
  }
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'bigint') {
    throw new TypeError('canonical-json: cannot serialize a BigInt')
  }
  if (typeof value === 'function' || typeof value === 'symbol') {
    throw new TypeError(`canonical-json: cannot serialize a ${typeof value}`)
  }
  if (typeof value === 'undefined') {
    throw new TypeError('canonical-json: cannot serialize undefined')
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => serializeArrayEntry(entry)).join(',')}]`
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort()
    const entries = keys.map((key) => {
      const entryValue = (value as Record<string, unknown>)[key]
      if (typeof entryValue === 'undefined') {
        throw new TypeError(`canonical-json: cannot serialize undefined at key "${key}"`)
      }
      return `${JSON.stringify(key)}:${serialize(entryValue)}`
    })
    return `{${entries.join(',')}}`
  }
  throw new TypeError(`canonical-json: cannot serialize value of type ${typeof value}`)
}

// Arrays may not contain `undefined` either (JSON.stringify silently turns it
// into `null` in array position; canonical-json refuses instead of guessing).
function serializeArrayEntry(entry: unknown): string {
  if (typeof entry === 'undefined') {
    throw new TypeError('canonical-json: cannot serialize undefined array entry')
  }
  return serialize(entry)
}
