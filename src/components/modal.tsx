"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";

/** Modal in the design-board style: icon tile + title, body, footer. Esc or the scrim closes it. */
export function Modal({ icon, title, sub, onClose, children, footer, width = 520 }: {
  icon: React.ReactNode; title: string; sub?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; width?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  // Portal to <body> so a modal opened from inside a link/row never inherits its clicks or layout.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="scrim fx" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: width }}>
        <div className="modal-h">
          <span className="modal-ic">{icon}</span>
          <div className="col g2 fill"><span className="h3">{title}</span>{sub && <span className="sm i3">{sub}</span>}</div>
          <button type="button" className="btn quiet sm ic" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
