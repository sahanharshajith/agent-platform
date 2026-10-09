import { useId } from 'react';

export default function Logo({ markOnly = false, className = '' }) {
  const id = `logo-${useId().replaceAll(':', '')}`;
  return <span className={`brand ${className}`}>
    <svg className="brand-mark" width="34" height="34" viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <defs><linearGradient id={id} x1="3" y1="2" x2="34" y2="36" gradientUnits="userSpaceOnUse"><stop stopColor="#A18AFF" /><stop offset="0.48" stopColor="#8055F1" /><stop offset="1" stopColor="#5F43D7" /></linearGradient></defs>
      <rect width="36" height="36" rx="10" fill={`url(#${id})`} />
      <path d="M10 24.8 18.1 10h5.2l-8.1 14.8H10Z" fill="white" />
      <path d="m20.3 17.5 5.9 7.3h-6.1l-2.8-3.6 3-3.7Z" fill="white" fillOpacity=".7" />
    </svg>
    {!markOnly && <span className="brand-name">AgentFlow<span className="brand-period">.</span></span>}
  </span>;
}