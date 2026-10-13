"use client";
import { useEffect, useRef } from "react";
import Icon from "./icon";
export default function Modal({title, onClose, children, wide=false}: {title:string; onClose:()=>void; children:React.ReactNode; wide?:boolean}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); return () => d?.close(); }, []);
  return <dialog ref={ref} className={`modal ${wide ? "wide" : ""}`} onCancel={e => {e.preventDefault(); onClose();}} onClick={e => {if(e.target===e.currentTarget) onClose();}} aria-labelledby="dialog-title">
    <header className="modal-header"><div><span className="eyebrow">WORKSPACE</span><h2 id="dialog-title">{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭弹窗"><Icon name="close"/></button></header>
    {children}
  </dialog>;
}
