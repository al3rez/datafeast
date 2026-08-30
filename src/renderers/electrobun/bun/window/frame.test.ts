import { describe, expect, test } from "bun:test";
import {
  DEFAULT_WINDOW_FRAME,
  DEFAULT_WINDOWS_WINDOW_FRAME,
  MAIN_WINDOW_MIN_SIZE,
  constrainWindowFrame,
  defaultMainWindowFrame,
  fitWindowFrameToWorkArea,
  normalizeWindowFrameWithMinimum,
} from "./frame";

describe("electrobun window frames", () => {
  test("normalizes partial resize events without clamping usable small windows", () => {
    const frame = normalizeWindowFrameWithMinimum(
      { width: 720 },
      { x: 10, y: 20, width: 1200, height: 800 },
      MAIN_WINDOW_MIN_SIZE,
    );

    expect(frame).toEqual({
      x: 10,
      y: 20,
      width: 720,
      height: 800,
    });
  });

  test("clamps only tiny frames to the emergency minimum size", () => {
    expect(constrainWindowFrame(
      { x: 0, y: 0, width: 400, height: 300 },
      MAIN_WINDOW_MIN_SIZE,
    )).toEqual({
      x: 0,
      y: 0,
      width: 640,
      height: 400,
    });
  });

  test("uses the default frame when no frame data is available", () => {
    expect(normalizeWindowFrameWithMinimum(null)).toEqual(DEFAULT_WINDOW_FRAME);
  });

  test("uses a compact default main window frame on Windows", () => {
    expect(defaultMainWindowFrame("win32")).toEqual(DEFAULT_WINDOWS_WINDOW_FRAME);
    expect(defaultMainWindowFrame("darwin")).toEqual(DEFAULT_WINDOW_FRAME);
  });

  test("fits the initial desktop frame inside a scaled Wayland work area", () => {
    expect(fitWindowFrameToWorkArea(
      DEFAULT_WINDOW_FRAME,
      { x: 0, y: 26, width: 1536, height: 838 },
    )).toEqual({ x: 48, y: 58, width: 1440, height: 774 });
  });
});
