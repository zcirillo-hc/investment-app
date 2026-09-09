import { Fragment, type ReactNode } from 'react';
import { Tooltip } from './Tooltip';
import { TOOLTIPS, type TooltipKey } from '../content/tooltips';

interface TermProps {
  k: TooltipKey;
  children?: ReactNode;
}

/** A financial term with its tooltip (plan 12.1 rule 8). */
export function Term({ k, children }: TermProps) {
  const entry = TOOLTIPS[k];
  // C4-4: a string child is the visible term, so it can name the anchor for assistive tech.
  const label = typeof children === 'string' ? children : entry.label;
  return (
    <Tooltip text={entry.definition} testId={`term-${k}`} label={label}>
      {children ?? entry.label}
    </Tooltip>
  );
}

const MARK = /\[\[([a-zA-Z]+)(?:\|([^\]]+))?\]\]/g;

/** Renders a string containing [[key]] or [[key|display]] markers as text with Term tooltips. */
export function RichText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(MARK)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push(<Fragment key={i++}>{text.slice(last, idx)}</Fragment>);
    const key = m[1] as TooltipKey;
    if (TOOLTIPS[key]) {
      parts.push(
        <Term key={i++} k={key}>
          {m[2] ?? TOOLTIPS[key].label}
        </Term>,
      );
    } else {
      parts.push(<Fragment key={i++}>{m[2] ?? m[1]}</Fragment>);
    }
    last = idx + m[0].length;
  }
  if (last < text.length) parts.push(<Fragment key={i++}>{text.slice(last)}</Fragment>);
  return <>{parts}</>;
}

export function plainText(text: string): string {
  return text.replace(MARK, (_m, k: string, disp?: string) => disp ?? (TOOLTIPS[k as TooltipKey]?.label ?? k));
}
