import { useEffect, useState } from 'react'

/** Fetch a JSON endpoint once per url; null while loading or when the API is down. */
export function useFetchJson<T>(url: string): T | null {
  const [data, setData] = useState<T | null>(null)
  useEffect(() => {
    let cancelled = false
    setData(null)
    fetch(url)
      .then((res) => (res.ok ? (res.json() as Promise<T>) : null))
      .then((body) => {
        if (!cancelled && body) setData(body)
      })
      .catch(() => {
        // API down — the page keeps its loading note.
      })
    return () => {
      cancelled = true
    }
  }, [url])
  return data
}
