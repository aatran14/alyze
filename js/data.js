import { FAMILY_ORDER } from './config.js'

export function parseRows(csv) {
  return csv
    .trim()
    .split('\n')
    .slice(1)
    .map(l => {
      const p = l.split(',')
      return { bench: p[0], machine: p[1], throughput: parseFloat(p[2]), ts: p[3] || '', commit: p[4] || '' }
    })
    .filter(r => !isNaN(r.throughput))
}

export function byFamily(a, b) {
  const ra = FAMILY_ORDER.findIndex(p => a.startsWith(p))
  const rb = FAMILY_ORDER.findIndex(p => b.startsWith(p))
  if (ra === -1 && rb === -1) return a.localeCompare(b)
  return (ra === -1 ? FAMILY_ORDER.length : ra) - (rb === -1 ? FAMILY_ORDER.length : rb)
}

export function formatDate(ts) {
  return ts ? ts.split('T')[0].slice(5) : '—'
}

export function machineShort(m) {
  const match = m.match(/^(.+)-standard-(\d+)-/)
  if (match) return `${match[1]}-${match[2]}`
  if (m.startsWith('aws-')) return m.slice(4)
  return m
}

export function tsDay(ts) {
  return ts ? ts.split('T')[0] : ''
}
