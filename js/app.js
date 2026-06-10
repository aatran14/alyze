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

function bindDateDrops(ctx) {
  document.querySelectorAll('.date-drop-wrap .dd-date').forEach(dd => {
    const variant = dd.classList.contains('dd-date--compare') ? 'compare' : 'focus'
    if (!dd.dataset.dateDropBound) {
      dd.dataset.dateDropBound = '1'
      // was: open/close on hover with no persisted state, so clicking a date (which re-renders
      // the DOM) dropped the open class and collapsed the dropdown.
      // dd.addEventListener('mouseenter', () => dd.classList.add('is-date-drop-open'))
      // dd.addEventListener('mouseleave', () => dd.classList.remove('is-date-drop-open'))
      dd.addEventListener('mouseenter', () => { ctx.dateDropOpen = variant; dd.classList.add('is-date-drop-open') })
      dd.addEventListener('mouseleave', () => { ctx.dateDropOpen = null; dd.classList.remove('is-date-drop-open') })
    }
    // Re-apply open state after render() rebuilds the DOM, so a date click keeps the dropdown
    // open under the cursor instead of collapsing it.
    if (ctx.dateDropOpen === variant) dd.classList.add('is-date-drop-open')
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
    // was: pushed ctx -> window, clobbering the value the calendar's inline onclick
    // (`compareTo=ti`) had just set — so every date click was discarded before draw.
    // Pull window -> ctx instead so the calendar's global assignment actually takes effect.
    // window.compareFrom = ctx.compareFrom
    // window.compareTo = ctx.compareTo
    ctx.compareFrom = window.compareFrom
    ctx.compareTo = window.compareTo
    window.cur = ctx.cur
    renderApp(ctx)
    bindMachinePanels(ctx)
    bindDateDrops(ctx)
    bindCopyPreview()
  }

  window.setFocusMachine = m => {
    ctx.cur = m
    ensureFocusDate(ctx)
    window.compareTo = ctx.compareTo // push date back so render()'s window->ctx pull keeps it
    render()
  }

  window.setBaseMachine = m => {
    ctx.baseMachine = m
    ensureBaseDate(ctx)
    window.compareFrom = ctx.compareFrom // push date back so render()'s window->ctx pull keeps it
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
  fetch('data/data.csv')
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.text()
    })
    .then(csv => createApp(parseRows(csv)))
    .catch(showLoadError)
}

boot()
