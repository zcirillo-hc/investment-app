// Plan v2 section 7.2: a thin loader over shared/content/tooltips.json.
import raw from '../../shared/content/tooltips.json';

export interface TooltipEntry {
  label: string;
  definition: string;
}

export const TOOLTIPS: Record<string, TooltipEntry> = raw.tooltips as Record<string, TooltipEntry>;

export const TOOLTIP_KEYS: string[] = Object.keys(TOOLTIPS);

export type TooltipKey = keyof typeof raw.tooltips;

export function tooltipFor(key: string): TooltipEntry | undefined {
  return TOOLTIPS[key];
}
