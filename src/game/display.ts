/** The display view's stage (./DisplayView.tsx): designed at 1920×1080 and scaled to fit the window. Pure. */

export const STAGE_WIDTH = 1920
export const STAGE_HEIGHT = 1080

/** The scale that fits the stage, `contentHeight` tall (at least 1080), into the window without scrolling. */
export function stageScale(windowWidth: number, windowHeight: number, contentHeight: number): number {
  const scale = Math.min(windowWidth / STAGE_WIDTH, windowHeight / Math.max(STAGE_HEIGHT, contentHeight))
  return Number.isFinite(scale) && scale > 0 ? scale : 1
}
