import { SHORT, GROUPS, TABLE_COLS } from './config.js'
import { byFamily, formatDate, machineShort, tsDay } from './data.js'
import { buildChartHtml } from './chart.js'

export function machinesGrid(ctx) {
  const gcp16 = ctx.machinesOrdered.filter(m => m.includes('-standard-16-')).sort(byFamily)
  const aws = ctx.machinesOrdered.filter(m => m.startsWith('aws-')).sort((a, b) => a.localeCompare(b))
  const azure = ctx.machinesOrdered.filter(m => m.startsWith('azure-')).sort((a, b) => a.localeCompare(b))
  const cols = [gcp16, aws, azure].filter(c => c.length)
  if (cols.length > 1) {
    const out = []
    const max = Math.max(...cols.map(c => c.length))
    for (let i = 0; i < max; i++) for (const c of cols) if (c[i]) out.push(c[i])
    return out
  }
  return ctx.machinesOrdered
}

export function pickerCalendar(ctx, machine, selectedIdx, dateVar) {
  const { timestamps } = ctx
  const selTs = timestamps[selectedIdx] || timestamps[0]
  const iso = tsDay(selTs)
  const [y, mo] = iso.split('-').map(Number)
  const monthLabel = new Date(y, mo - 1, 1).toLocaleString('en', { month: 'short', year: 'numeric' })
  const dows = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
  const dowHead = dows.map(d => `<span class="cal-dow">${d}</span>`).join('')
  const lead = new Date(y, mo - 1, 1).getDay()
  const dim = new Date(y, mo, 0).getDate()
  let cells = ''
  for (let i = 0; i < lead; i++) cells += '<span class="cal-day cal-day--pad"></span>'
  for (let d = 1; d <= dim; d++) {
    const isoD = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const ti = timestamps.findIndex(t => tsDay(t) === isoD)
    if (ti === -1) {
      cells += `<span class="cal-day cal-day--off">${d}</span>`
      continue
    }
    const miss = !hasMachineTs(ctx, machine, timestamps[ti])
    const on = ti === selectedIdx
    const cls = `cal-day${on ? ' cal-day--on' : ''}${miss ? ' cal-day--miss' : ' cal-day--pick'}`
    if (miss) {
      cells += `<span class="${cls}">${d}</span>`
    } else {
      cells += `<button type="button" class="${cls}" onclick="event.stopPropagation();${dateVar}=${ti};render()">${d}</button>`
    }
  }
  return `<div class="compare-calendar">
    <div class="cal-month">${monthLabel}</div>
    <div class="cal-grid">${dowHead}${cells}</div>
  </div>`
}

function hasMachineTs(ctx, m, ts) {
  return ctx.rows.some(r => r.machine === m && r.ts === ts)
}

function machinePanel(ctx, selected, pickFn, asChecks = false) {
  if (asChecks) {
    const item = m =>
      `<label class="machine-check" onclick="event.stopPropagation()" title="${m}">
        <input type="checkbox" ${m === selected ? 'checked' : ''} onclick="event.stopPropagation()" onchange="event.stopPropagation();${pickFn}('${m}')">
        <span>${machineShort(m)}</span>
      </label>`
    return `<div class="machine-panel-row">${machinesGrid(ctx).map(item).join('')}</div>`
  }
  const item = m =>
    `<div class="dd-item ${m === selected ? 'dd-on' : ''}" title="${m}" onclick="event.stopPropagation();${pickFn}('${m}')">${machineShort(m)}</div>`
  return `<div class="machine-panel-row">${machinesGrid(ctx).map(item).join('')}</div>`
}

function combinedDateDrop(ctx, machine, dateIdx, dateVar, pickMachineFn, variant) {
  const label = formatDate(ctx.timestamps[dateIdx])
  return `<div class="date-drop-wrap">
    <div class="dd dd-date dd-date--${variant}" title="${machine}">
      <span class="dd-date-trigger">
        <span class="dd-date-machine">${machineShort(machine)}</span>
        <span class="dd-date-day">${label}</span>
      </span>
      <div class="dd-list dd-list--compare">
        <div class="dd-compare-cols">
          <div class="dd-list-section dd-list-section--machine">
            <div class="dd-list-head">machine</div>
            ${machinePanel(ctx, machine, pickMachineFn, true)}
          </div>
          <div class="dd-list-section dd-list-section--date">
            <div class="dd-list-head">date</div>
            ${pickerCalendar(ctx, machine, dateIdx, dateVar)}
          </div>
        </div>
      </div>
    </div>
  </div>`
}

function machinePicker(ctx, selected, pickFn, label, extraClass = '') {
  const subtle = extraClass.includes('subtle')
  const burger = subtle
    ? ''
    : '<span class="dd-burger-icon" aria-hidden="true"><span></span><span></span><span></span></span>'
  const prefix = subtle ? '<span class="compare-hint">vs </span>' : ''
  return `<div class="machine-picker ${extraClass}">
    <button type="button" class="dd-machine-trigger" aria-label="${label}">
      ${burger}${prefix}<span class="dd-machine-label">${selected}</span>
    </button>
    <div class="dd-panel">${machinePanel(ctx, selected, pickFn, true)}</div>
  </div>`
}

function dateRow(ctx) {
  return `<table class="card-table date-row-table" cellspacing="0" cellpadding="0">${TABLE_COLS}
    <tr class="date-col-row">
      <td class="lbl-col"></td>
      <td class="base-col"><div class="date-col-stack">${combinedDateDrop(ctx, ctx.baseMachine, ctx.compareFrom, 'compareFrom', 'setBaseMachine', 'compare')}</div></td>
      <td class="val-col"><div class="date-col-stack">${combinedDateDrop(ctx, ctx.cur, ctx.compareTo, 'compareTo', 'setFocusMachine', 'focus')}</div></td>
    </tr></table>`
}

function focusBar(ctx) {
  return `<div class="focus-bar">${machinePicker(ctx, ctx.cur, 'setFocusMachine', 'Choose machine')}</div>`
}

export function renderApp(ctx) {
  const valTs = ctx.timestamps[ctx.compareTo] ?? ctx.timestamps[ctx.timestamps.length - 1]
  const baseTs = ctx.timestamps[ctx.compareFrom] ?? ctx.timestamps[0]
  const pairs = []

  for (const [group, names] of Object.entries(GROUPS)) {
    const tableTitle = group === 'wikipedia' ? 'Tokenization (MiB/s)' : 'Analysis Pipeline (MiB/s)'
    const chartTitle = group === 'wikipedia'
      ? 'Tokenization: throughput (MiB/s) versus time (days)'
      : 'Analysis Pipeline: throughput (MiB/s) versus time (days)'

    let tableRows = `<tr><td colspan="3" class="section-head"><b>${tableTitle}</b></td></tr>`
    const sameSlot = ctx.baseMachine === ctx.cur && baseTs === valTs
    for (const name of names) {
      const bench = group + '/' + name
      const r = ctx.rows.find(row => row.bench === bench && row.machine === ctx.cur && row.ts === valTs)
      const base = !sameSlot
        ? ctx.rows.find(row => row.bench === bench && row.machine === ctx.baseMachine && row.ts === baseTs)
        : null
      const baseText = sameSlot ? '' : (base ? base.throughput.toFixed(1) : '—')
      const valText = r ? r.throughput.toFixed(1) : '—'
      let valColor = ''
      if (r && base) {
        const d = (r.throughput - base.throughput) / base.throughput * 100
        if (Math.abs(d) > 1) valColor = d > 0 ? 'up' : 'dn'
      }
      tableRows += `<tr><td class="lbl-col">${SHORT[name] || name}</td><td class="base-col">${baseText}</td><td class="val-col ${valColor}">${valText}</td></tr>`
    }

    let tableNote = ''
    if (group === 'wikipedia') {
      tableNote = `<p class="table-note"><sup>&dagger;</sup>Throughput over 64 MiB of English Wikipedia article text (cargo bench), running on ${ctx.cur}. Numbers are the median of 16 samples.</p>`
    } else if (group === 'analysis') {
      tableNote = `<p class="table-note"><sup>&dagger;</sup>Analysis (benches/wikipedia.rs, analysis group) — each row adds one stage to the pipeline, so the deltas approximate each filter's marginal cost.</p>`
    }

    const tableHtml = `<div class="table-block"><table class="card-table" cellspacing="0" cellpadding="0">${TABLE_COLS}${tableRows}</table>${tableNote}</div>`
    const chartHtml = buildChartHtml(ctx, group, names, chartTitle)
    pairs.push({ table: tableHtml, chart: chartHtml })
  }

  const benchmarkRows = pairs
    .map((p, i) =>
      `<div class="benchmark-row">
        <div class="benchmark-row-table">${i === 0 ? dateRow(ctx) : ''}${p.table}</div>
        <div class="benchmark-row-chart">${p.chart}</div>
      </div>`
    )
    .join('')

  document.getElementById('focus-slot').innerHTML = focusBar(ctx)
  document.getElementById('app').innerHTML =
    `<div class="benchmark-wrap"><p class="repo-links"><a href="https://github.com/turbopuffer/alyze">turbopuffer/alyze</a> | <a href="https://github.com/aatran14/alyze">aatran14/alyze</a></p><div class="copyable outer-card"><div class="copy-anchor"><button class="copy-btn" onclick="copyEl(this.closest('.copyable'))">copy</button></div><div class="benchmark-body"><div class="outer-card-machine">${ctx.cur}</div>${benchmarkRows}</div></div></div>`
}

export function timestampIndicesForMachine(ctx, m) {
  return ctx.timestamps.map((ts, i) => i).filter(i => hasMachineTs(ctx, m, ctx.timestamps[i]))
}

export function ensureBaseDate(ctx) {
  const avail = timestampIndicesForMachine(ctx, ctx.baseMachine)
  if (!avail.length) return
  if (!hasMachineTs(ctx, ctx.baseMachine, ctx.timestamps[ctx.compareFrom])) ctx.compareFrom = avail[0]
}

export function ensureFocusDate(ctx) {
  const avail = timestampIndicesForMachine(ctx, ctx.cur)
  if (!avail.length) return
  if (!hasMachineTs(ctx, ctx.cur, ctx.timestamps[ctx.compareTo])) ctx.compareTo = avail[avail.length - 1]
}
