export interface WindowFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowMinimumSize {
  width: number;
  height: number;
}

export const DEFAULT_WINDOW_FRAME: WindowFrame = { x: 64, y: 48, width: 1440, height: 920 };
export const DEFAULT_WINDOWS_WINDOW_FRAME: WindowFrame = { x: 32, y: 32, width: 960, height: 680 };
// Emergency fallback until Electrobun exposes stable native minimum-size handling:
// https://github.com/blackboardsh/electrobun/issues/188
export const MAIN_WINDOW_MIN_SIZE: WindowMinimumSize = { width: 640, height: 400 };
export const DETACHED_WINDOW_MIN_SIZE: WindowMinimumSize = { width: 360, height: 240 };

export function defaultMainWindowFrame(platform = process.platform): WindowFrame {
  return platform === "win32" ? DEFAULT_WINDOWS_WINDOW_FRAME : DEFAULT_WINDOW_FRAME;
}

/** Keep the initial frame inside Wayland's logical-pixel work area. */
export function fitWindowFrameToWorkArea(
  frame: WindowFrame,
  workArea: WindowFrame | null | undefined,
  margin = 32,
): WindowFrame {
  if (!workArea || workArea.width <= 0 || workArea.height <= 0) return frame;
  const availableWidth = Math.max(MAIN_WINDOW_MIN_SIZE.width, workArea.width - margin * 2);
  const availableHeight = Math.max(MAIN_WINDOW_MIN_SIZE.height, workArea.height - margin * 2);
  const width = Math.min(frame.width, availableWidth);
  const height = Math.min(frame.height, availableHeight);
  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width,
    height,
  };
}

export function normalizeWindowFrame(
  frame: Partial<WindowFrame> | null | undefined,
  fallback: WindowFrame = DEFAULT_WINDOW_FRAME,
): WindowFrame {
  return {
    x: typeof frame?.x === "number" ? frame.x : fallback.x,
    y: typeof frame?.y === "number" ? frame.y : fallback.y,
    width: typeof frame?.width === "number" ? frame.width : fallback.width,
    height: typeof frame?.height === "number" ? frame.height : fallback.height,
  };
}

export function constrainWindowFrame(frame: WindowFrame, minimumSize?: WindowMinimumSize): WindowFrame {
  if (!minimumSize) return frame;
  return {
    ...frame,
    width: Math.max(minimumSize.width, frame.width),
    height: Math.max(minimumSize.height, frame.height),
  };
}

export function normalizeWindowFrameWithMinimum(
  frame: Partial<WindowFrame> | null | undefined,
  fallback: WindowFrame = DEFAULT_WINDOW_FRAME,
  minimumSize?: WindowMinimumSize,
): WindowFrame {
  return constrainWindowFrame(normalizeWindowFrame(frame, fallback), minimumSize);
}
