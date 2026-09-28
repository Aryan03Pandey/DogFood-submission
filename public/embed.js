// Dogfood embeddable gallery loader. Plain JS, no framework, a few KB.
//
// Usage:
//   <script src="http://HOST/embed.js" data-event="evt_01" data-theme="light" data-track="trk_01" async></script>
(function () {
  var script = document.currentScript
  if (!script) return

  var portalOrigin = new URL(script.src).origin
  var eventId = script.getAttribute('data-event')
  if (!eventId) return
  var theme = script.getAttribute('data-theme') || 'light'
  var track = script.getAttribute('data-track') || ''
  var limit = script.getAttribute('data-limit') || ''

  var src = portalOrigin + '/embed/' + encodeURIComponent(eventId) + '?theme=' + encodeURIComponent(theme)
  if (track) src += '&track=' + encodeURIComponent(track)
  if (limit) src += '&limit=' + encodeURIComponent(limit)

  var iframe = document.createElement('iframe')
  iframe.src = src
  iframe.style.width = '100%'
  iframe.style.border = '0'
  iframe.style.minHeight = '120px'
  iframe.setAttribute('loading', 'lazy')
  iframe.setAttribute('title', 'Dogfood project gallery')

  script.parentNode.insertBefore(iframe, script)

  // The iframe (embed page) is the sender of resize messages; this loader is
  // the receiver. These are cross-origin by design, so both checks below
  // matter: origin must match the portal this script was loaded from, and
  // source must be this specific iframe (not some other frame on the page).
  window.addEventListener('message', function (event) {
    if (event.origin !== portalOrigin) return
    if (event.source !== iframe.contentWindow) return
    var data = event.data
    if (data && data.type === 'dogfood:resize' && typeof data.height === 'number') {
      iframe.style.height = data.height + 'px'
    }
  })
})()
