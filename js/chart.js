import { SHORT, COLORS, chartKnobs } from './config.js'

export function buildChartHtml(ctx, group, names, chartTitle) {
  const { rows, timestamps, cur } = ctx
  if (timestamps.length < 2) return ''

  const K = chartKnobs(group)
  const P = K.CHART_PADDING
  const W = P.l + (K.MAX_DATE_SLOTS - 1) * K.DATE_SPACING + P.r
  const H = K.CHART_H
  const pH = H - P.t - P.b
  const series = names
    .map((name, i) => {
      const bench = group + '/' + name
      const pts = timestamps
        .map((ts, ti) => {
          const r = rows.find(row => row.bench === bench && row.machine === cur && row.ts === ts)
          return r ? { x: ti, y: r.throughput } : null
        })
        .filter(Boolean)
      return { name, color: COLORS[i], pts }
    })
    .filter(s => s.pts.length > 0)

  const [minY, maxY] = K.Y_RANGE
  const sx = i => P.l + i * K.DATE_SPACING
  const sy = v => P.t + pH - ((v - minY) / (maxY - minY)) * pH
  const gridEnd = P.l + (K.MAX_DATE_SLOTS - 1) * K.DATE_SPACING
  const midY = P.t + pH / 2

  let svg = `<text x="${K.TITLE_X}" y="${K.TITLE_Y}" fill="#334155" font-size="${K.TITLE_SIZE}" font-weight="bold">${chartTitle}</text>`
  svg += `<text x="${K.TITLE_X}" y="${K.MACHINE_Y}" fill="#64748b" font-size="${K.MACHINE_SIZE}">${cur}</text>`
  svg += `<text x="10" y="${midY}" text-anchor="middle" fill="#94a3b8" font-size="9" transform="rotate(-90,10,${midY})">throughput (MiB/s)</text>`

  for (let v = minY; v <= maxY; v += K.Y_STEP) {
    svg += `<line x1="${P.l}" x2="${gridEnd}" y1="${sy(v)}" y2="${sy(v)}" stroke="#e2e8f0"/>`
    svg += `<text x="${P.l - K.Y_LABEL_GAP}" y="${sy(v) + 4}" text-anchor="end" fill="#94a3b8" font-size="11">${v}</text>`
  }

  svg += `<text x="${W / 2}" y="${H - 4}" text-anchor="middle" fill="#94a3b8" font-size="9">date</text>`

  timestamps.forEach((ts, i) => {
    const commit = rows.find(r => r.ts === ts && r.machine === cur)?.commit || ''
    const lx = sx(i)
    const ly = H - P.b + 14
    const commitAttr = commit ? ` data-commit="${commit}"` : ''
    svg += `<text x="${lx}" y="${ly}" text-anchor="end" fill="#94a3b8" font-size="11" transform="rotate(-45,${lx},${ly})"${commitAttr} data-ti="${i}" class="date-tick">${ts.split('T')[0]}</text>`
  })

  timestamps.forEach((ts, i) => {
    svg += `<rect x="${sx(i) - K.DATE_SPACING / 2}" y="${P.t}" width="${K.DATE_SPACING}" height="${pH}" fill="transparent" data-ti="${i}" class="date-tick"/>`
  })

  for (const s of series) {
    const d = s.pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')
    svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${K.LINE_WIDTH}"/>`
    for (const p of s.pts) {
      svg += `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="${K.DOT_R}" fill="${s.color}" data-ti="${p.x}" class="date-tick"/>`
    }
  }

  const legX = gridEnd + K.LEGEND_GAP
  const legY0 = K.LEGEND_TOP
  const legH = series.length * K.LEGEND_SPACING
  const LEGEND_PAD = 8
  svg += `<rect x="${legX - LEGEND_PAD}" y="${legY0 - K.LEGEND_SPACING + LEGEND_PAD / 2}" width="${P.r - K.LEGEND_GAP}" height="${legH + LEGEND_PAD}" rx="0" fill="white" stroke="#e2e8f0"/>`
  series.forEach((s, i) => {
    const lx = legX
    const ly = legY0 + i * K.LEGEND_SPACING
    svg += `<circle cx="${lx}" cy="${ly - 4}" r="${K.LEGEND_DOT_R}" fill="${s.color}"/>`
    svg += `<text x="${lx + 10}" y="${ly}" fill="#64748b" font-size="${K.LEGEND_FONT}">${SHORT[s.name] || s.name}</text>`
  })

  // val-labels drawn last: SVG has no z-index, so document order = paint order,
  // and the hover tooltip must sit on top of the legend.
  timestamps.forEach((ts, i) => {
    const dotsAtI = series.map(s => s.pts.find(p => p.x === i)).filter(Boolean)
    if (!dotsAtI.length) return
    const commit = rows.find(r => r.ts === ts && r.machine === cur)?.commit || ''
    const topDotY = Math.min(...dotsAtI.map(p => sy(p.y)))
    const rowsAtI = dotsAtI.length
    const boxX = sx(i) + K.DOT_R + 6
    const boxY = topDotY - 6
    const boxW = 140
    const boxH = rowsAtI * 14 + (commit ? 24 : 10)
    const textStart = boxY + (commit ? 28 : 14)
    svg += `<g class="val-label date-tick" data-ti="${i}" style="display:none">`
    svg += `<rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" fill="white" stroke="#e2e8f0"/>`
    if (commit) {
      svg += `<text font-size="9" y="${boxY + 14}"><tspan x="${boxX + 6}" fill="#94a3b8">${commit}</tspan></text>`
    }
    let row = 0
    series.forEach(s => {
      const pt = s.pts.find(p => p.x === i)
      if (!pt) return
      svg += `<text font-size="9" y="${textStart + row * 14}"><tspan x="${boxX + 6}" fill="#334155">${SHORT[s.name] || s.name}</tspan><tspan x="${boxX + boxW - 6}" text-anchor="end" fill="${s.color}">${pt.y.toFixed(1)}</tspan></text>`
      row++
    })
    svg += `</g>`
  })

  return `<div class="copyable chart-card"><button class="copy-btn" onclick="copyEl(this.parentElement)">copy</button><div class="chart-scroll"><svg class="chart-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${svg}</svg></div></div>`
}
