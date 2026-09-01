// DCS pre-paint (mirrors laradcs resources/views/app.blade.php). Runs before any stylesheet
// or React code so the first frame already has the right theme, scheme, content width and
// sidebar widths. `preload` suppresses transitions until ThemeProvider removes it.
// STORAGE_KEY and TOPNAV_HEIGHT must match the <ThemeProvider> props in src/App.tsx.
;(() => {
  const STORAGE_KEY = 'sshm-state'
  const TOPNAV_HEIGHT = '2.75rem'
  const html = document.documentElement
  let state = {}
  try {
    state = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}') || {}
  } catch {
    state = {}
  }
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const theme = state.theme === 'light' || state.theme === 'dark' ? state.theme : prefersDark ? 'dark' : 'light'
  const schemes = ['ocean', 'crimson', 'stone', 'forest', 'sunset', 'mono']
  const scheme = schemes.includes(state.scheme) ? state.scheme : 'ocean'
  const width = state.width === 'narrow' || state.width === 'wide' ? state.width : 'normal'
  const clampWidth = (value) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(10, Math.min(100, Math.round(value))) : 15

  html.classList.add('preload', theme)
  html.style.colorScheme = theme
  if (scheme !== 'ocean') html.classList.add(`scheme-${scheme}`)
  if (width !== 'normal') html.classList.add(width)
  html.style.setProperty('--sidebar-width-left', `${clampWidth(state.sidebarWidthLeft)}%`)
  html.style.setProperty('--sidebar-width-right', `${clampWidth(state.sidebarWidthRight)}%`)
  html.style.setProperty('--topnav-height', TOPNAV_HEIGHT)
})()
