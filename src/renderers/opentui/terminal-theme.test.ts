import { describe, expect, test } from "bun:test";
import type { TerminalColors } from "@opentui/core";
import { createTerminalTheme } from "./terminal-theme";

function detectedColors(overrides: Partial<TerminalColors> = {}): TerminalColors {
  return {
    palette: Array<string | null>(16).fill(null),
    defaultForeground: null,
    defaultBackground: null,
    cursorColor: null,
    mouseForeground: null,
    mouseBackground: null,
    tekForeground: null,
    tekBackground: null,
    highlightBackground: null,
    highlightForeground: null,
    ...overrides,
  };
}

describe("terminal theme", () => {
  test("maps the detected terminal defaults and ANSI palette", () => {
    const palette = Array<string | null>(16).fill(null);
    palette[1] = "#50f872";
    palette[2] = "#4fe88f";
    palette[3] = "#50f7d4";
    palette[6] = "#7cf8f7";
    palette[8] = "#2d3450";
    palette[15] = "#ddf7ff";

    expect(createTerminalTheme(detectedColors({
      palette,
      defaultForeground: "#ddf7ff",
      defaultBackground: "#0b0c16",
    }))).toMatchObject({
      bg: "#0b0c16",
      panel: "#0b0c16",
      border: "#2d3450",
      borderFocused: "#7cf8f7",
      text: "#ddf7ff",
      positive: "#4fe88f",
      negative: "#50f872",
      warning: "#50f7d4",
    });
  });

  test("returns null when the terminal exposes no usable foreground or background", () => {
    expect(createTerminalTheme(detectedColors())).toBeNull();
  });
});
