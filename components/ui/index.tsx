import React from "react";
export function Card({ children, className = "" }: React.PropsWithChildren<{ className?: string }>) {
  return <div className={`rounded-2xl border border-neutral-800 bg-neutral-900/60 backdrop-blur ${className}`}>{children}</div>;
}
export function CardContent({ children, className = "" }: React.PropsWithChildren<{ className?: string }>) {
  return <div className={`p-4 ${className}`}>{children}</div>;
}
export function Badge({ children, className = "" }: React.PropsWithChildren<{ className?: string }>) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{children}</span>;
}
export function Button({ children, onClick, className = "" }: React.PropsWithChildren<{ onClick?: () => void, className?: string }>) {
  return <button onClick={onClick} className={`px-3 py-1.5 rounded-2xl border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 ${className}`}>{children}</button>;
}
