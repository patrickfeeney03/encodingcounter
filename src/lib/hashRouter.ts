export type HashLocation = {
  path: string
  searchParams: URLSearchParams
}

export function parseHashLocation(hash: string): HashLocation {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  const normalized = raw.length === 0 ? '/' : raw
  const [pathPart, searchPart] = normalized.split('?', 2)
  const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`
  const searchParams = new URLSearchParams(searchPart ?? '')
  return { path, searchParams }
}

