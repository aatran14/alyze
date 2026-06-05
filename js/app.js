import { byFamily, parseRows } from './data.js'
import { copyEl } from './copy.js'
import { renderApp, ensureBaseDate, ensureFocusDate } from './ui.js'

function bindCopyPreview() {
  document.querySelectorAll('.outer-card .copy-anchor').forEach(anchor => {
    if (anchor.dataset.copyPreviewBound) return
    anchor.dataset.copyPreviewBound = '1'
    const card = anchor.closest('.outer-card')
    anchor.addEventListener('mouseenter', () => card.classList.add('copy-preview'))
    anchor.addEventListener('mouseleave', () => card.classList.remove('copy-preview'))
  })
}

function bindDateDrops() {
  document.querySelectorAll('.date-drop-wrap .dd-date').forEach(dd => {
    if (dd.dataset.dateDropBound) return
    dd.dataset.dateDropBound = '1'
    dd.addEventListener('mouseenter', () => dd.classList.add('is-date-drop-open'))
    dd.addEventListener('mouseleave', () => dd.classList.remove('is-date-drop-open'))
  })
}

function bindMachinePanels(ctx) {
  document.querySelectorAll('.machine-picker').forEach(picker => {
    if (picker.dataset.bound) return
    picker.dataset.bound = '1'
    const trigger = picker.querySelector('.dd-machine-trigger')
    const panel = picker.querySelector('.dd-panel')
    trigger.addEventListener('click', e => {
      e.stopPropagation()
      document.querySelectorAll('.machine-picker.is-open').forEach(p => {
        if (p !== picker) p.classList.remove('is-open')
      })
      picker.classList.toggle('is-open')
      if (picker.closest('#focus-slot')) ctx.machinePickerOpen = picker.classList.contains('is-open')
    })
    panel?.addEventListener('click', e => e.stopPropagation())
  })
  if (ctx.machinePickerOpen) {
    document.querySelector('#focus-slot .machine-picker')?.classList.add('is-open')
  }
  if (!window.machinePanelClickBound) {
    window.machinePanelClickBound = true
    document.addEventListener('click', () => {
      document.querySelectorAll('.machine-picker.is-open').forEach(p => p.classList.remove('is-open'))
      ctx.machinePickerOpen = false
    })
  }
}

function bindChartHover() {
  if (window.chartHoverBound) return
  window.chartHoverBound = true

  document.addEventListener('mouseover', e => {
    const t = e.target.closest('[data-commit]')
    if (!t?.dataset.commit) return
    const card = t.closest('.chart-card')
    let tip = card.querySelector('.tip')
    if (!tip) {
      tip = document.createElement('div')
      tip.className = 'tip'
      card.appendChild(tip)
    }
    tip.textContent = t.dataset.commit
    const r = t.getBoundingClientRect()
    const cr = card.getBoundingClientRect()
    tip.style.display = 'block'
    tip.style.left = r.left - cr.left + 'px'
    tip.style.top = r.bottom - cr.top + 2 + 'px'
  })

  document.addEventListener('mouseout', e => {
    if (!e.target.closest('[data-commit]')) return
    const tip = e.target.closest('.chart-card')?.querySelector('.tip')
    if (tip) tip.style.display = 'none'
  })

  document.addEventListener('mouseover', e => {
    const tick = e.target.closest('.date-tick')
    if (!tick?.dataset.ti) return
    const svg = tick.closest('svg')
    const ti = tick.dataset.ti
    svg.querySelectorAll('.val-label').forEach(l => {
      l.style.display = l.dataset.ti === ti ? 'block' : 'none'
    })
  })

  document.addEventListener('mouseout', e => {
    const tick = e.target.closest('.date-tick')
    if (!tick) return
    const svg = tick.closest('svg')
    svg.querySelectorAll('.val-label').forEach(l => l.style.display = 'none')
  })
}

export function createApp(rows) {
  const machines = [...new Set(rows.map(r => r.machine))].filter(m => !m.includes('-standard-8-'))
  const machinesOrdered = machines.slice().sort(byFamily)
  const cores8 = machines.filter(m => m.includes('-standard-8-')).sort(byFamily)
  const timestamps = [...new Set(rows.map(r => r.ts))].sort()

  const ctx = {
    rows,
    machines,
    machinesOrdered,
    timestamps,
    compareFrom: 0,
    compareTo: timestamps.length - 1,
    cur: cores8[0] || machines[0],
    baseMachine: null,
    machinePickerOpen: false,
  }
  ctx.baseMachine = ctx.cur

  if (!ctx.cur) {
    document.getElementById('app').innerHTML =
      '<p class="load-error">No machines in <code>data/data.csv</code>.</p>'
    return
  }

  ensureBaseDate(ctx)

  function render() {
    window.compareFrom = ctx.compareFrom
    window.compareTo = ctx.compareTo
    window.cur = ctx.cur
    renderApp(ctx)
    bindMachinePanels(ctx)
    bindDateDrops()
    bindCopyPreview()
  }

  window.setFocusMachine = m => {
    ctx.cur = m
    ensureFocusDate(ctx)
    render()
  }

  window.setBaseMachine = m => {
    ctx.baseMachine = m
    ensureBaseDate(ctx)
    render()
  }

  window.render = render
  window.copyEl = copyEl
  window.compareFrom = ctx.compareFrom
  window.compareTo = ctx.compareTo

  bindChartHover()
  render()
}

function showLoadError(err) {
  document.getElementById('app').innerHTML =
    `<p class="load-error">Could not load benchmark data (${err.message}). Run <code>make publish</code> or a local server from the repo root, e.g. <code>python3 -m http.server</code>, then open <code>http://localhost:8000/</code>.</p>`
}

function boot() {
  if (window.__ALYZE_DATA__?.rows) {
    createApp(window.__ALYZE_DATA__.rows)
    return
  }
  fetch('data/data.csv')
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.text()
    })
    .then(csv => createApp(parseRows(csv)))
    .catch(showLoadError)
}

boot()
