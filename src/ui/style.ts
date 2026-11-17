export const CSS = `
.ic3-row { align-items: flex-start !important; }
.ic3-cell { justify-content: flex-start !important; }
.ic3 { margin-top: 6px; font-size: 13px; line-height: 1.3; white-space: nowrap; }
.ic3[data-tip]:not([data-tip=""]) { cursor: help; }
.ic3-main { font-weight: 700; }
.ic3-sub { font-size: 12px; opacity: .8; }
.ic3[data-state="ok"] .ic3-main { color: #1a7f37; }
.ic3[data-state="special"] .ic3-main { color: #b35900; }
.ic3[data-state="none"] .ic3-main { color: #c62828; }
.ic3[data-state="loading"] { color: #777; font-style: italic; }
.ic3[data-state="nomap"] { color: #777; font-size: 12px; }
.ic3-tip {
  position: fixed; z-index: 2147483647; display: none; max-width: 360px;
  padding: 8px 10px; border-radius: 6px; background: #1f2933; color: #fff;
  font-size: 12px; line-height: 1.5; white-space: pre-line; pointer-events: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, .25);
}
`;

export function injectStyle(doc: Document = document): void {
  const style = doc.createElement('style');
  style.textContent = CSS;
  doc.head.appendChild(style);
}
