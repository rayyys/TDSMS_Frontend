// rem 等比适配：以 1920px 设计稿为基准
export const REM_ROOT_BASE_FONT_PX = 18

function setRem() {
  const scale = document.documentElement.clientWidth / 1920
  document.documentElement.style.fontSize = `${REM_ROOT_BASE_FONT_PX * Math.min(scale, 3)}px`
}

setRem()
window.addEventListener('resize', setRem)
