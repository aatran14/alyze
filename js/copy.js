export function copyEl(el) {
  const btn = el.querySelector('.copy-btn')
  const btns = el.querySelectorAll('.copy-btn')
  btns.forEach(b => b.style.opacity = '0')
  el.classList.add('copy-preview')
  const done = () => {
    el.classList.remove('copy-preview')
    btns.forEach(b => b.style.opacity = '')
  }
  requestAnimationFrame(() => {
    html2canvas(el, { backgroundColor: '#ffffff', scale: 2 })
      .then(canvas => {
        canvas.toBlob(blob => {
          navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
          btn.textContent = 'copied!'
          setTimeout(() => btn.textContent = 'copy', 1500)
          done()
        })
      })
      .catch(done)
  })
}
