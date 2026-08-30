import type { TerminalColors } from "@opentui/core";
import type { Theme } from "../../theme/themes";

export const TERMINAL_THEME_ID = "terminal";

function paletteColor(colors: TerminalColors, index: number, fallback: string): string {
  return colors.palette[index] ?? fallback;
}

export function createTerminalTheme(colors: TerminalColors): Theme | null {
  const bg = colors.defaultBackground ?? colors.palette[0];
  const text = colors.defaultForeground ?? colors.palette[7] ?? colors.palette[15];
  if (!bg || !text) return null;

  const border = paletteColor(colors, 8, text);
  const accent = paletteColor(colors, 6, paletteColor(colors, 4, text));
  const brightText = paletteColor(colors, 15, text);

  return {
    name: "Terminal",
    description: "Inherits the terminal's active color palette",
    bg,
    panel: bg,
    border,
    borderFocused: accent,
    text,
    textDim: paletteColor(colors, 12, text),
    textBright: brightText,
    textMuted: border,
    positive: paletteColor(colors, 2, text),
    negative: paletteColor(colors, 1, text),
    neutral: paletteColor(colors, 4, text),
    warning: paletteColor(colors, 3, accent),
    header: border,
    headerText: brightText,
    selected: border,
    selectedText: brightText,
    commandBg: bg,
    commandBorder: accent,
  };
}
