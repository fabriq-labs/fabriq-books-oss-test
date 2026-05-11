// Fabriq Books Design System — shared tokens + primitives
// Converted from dashboard-components.jsx (handoff). TopBar and Sidebar are
// intentionally excluded — the app's existing layout handles chrome.

import React, { useState } from 'react';

// ── Icons ────────────────────────────────────────────────────────────────────

const ICONS: Record<string, string | string[]> = {
  menu:        "M4 6h16M4 12h16M4 18h16",
  dashboard:   ["M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z","M9 22V12h6v10"],
  bot:         ["M12 2a3 3 0 013 3v1h2a2 2 0 012 2v8a2 2 0 01-2 2H7a2 2 0 01-2-2V8a2 2 0 012-2h2V5a3 3 0 013-3z","M9 12h.01M15 12h.01"],
  accounting:  ["M12 1v22","M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"],
  bell:        ["M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9","M13.73 21a2 2 0 01-3.46 0"],
  chevDown:    "M6 9l6 6 6-6",
  chevRight:   "M9 18l6-6-6-6",
  chevLeft:    "M15 18l-6-6 6-6",
  x:           "M18 6L6 18M6 6l12 12",
  check:       "M20 6L9 17l-5-5",
  sparkles:    ["M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z","M5 3l.5 1.5L7 5l-1.5.5L5 7l-.5-1.5L3 5l1.5-.5L5 3z","M19 13l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5.5-1.5z"],
  search:      ["M11 17.25a6.25 6.25 0 110-12.5 6.25 6.25 0 010 12.5z","M16 16l4.5 4.5"],
  refresh:     ["M23 4v6h-6","M1 20v-6h6","M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"],
  trending:    ["M23 6l-9.5 9.5-5-5L1 18","M17 6h6v6"],
  trendingDown:["M23 18l-9.5-9.5-5 5L1 6","M17 18h6v-6"],
  building:    ["M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"],
  user:        ["M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2","M12 11a4 4 0 100-8 4 4 0 000 8"],
  arrowRight:  "M5 12h14M12 5l7 7-7 7",
  externalLink:["M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6","M15 3h6v6","M10 14L21 3"],
  edit:        ["M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7","M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"],
  listCheck:   ["M11 12H3","M16 6H3","M16 18H3","M21 12l-4.5 4.5L14 14"],
  tag:         ["M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z","M7 7h.01"],
  link:        ["M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71","M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"],
  calendar:    ["M8 2v4","M16 2v4","M3 10h18","rect x=3 y=4 w=18 h=18 rx=2"],
  inbox:       ["M22 12h-6l-2 3h-4l-2-3H2","M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"],
  activity:    ["M22 12h-4l-3 9L9 3l-3 9H2"],
  alertCircle: ["M12 22a10 10 0 100-20 10 10 0 000 20z","M12 8v4","M12 16h.01"],
  fileText:    ["M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z","M14 2v6h6","M16 13H8","M16 17H8","M10 9H8"],
  sendEmail:   ["M22 2L11 13","M22 2l-7 20-4-9-9-4 20-7"],
  reconcile:   ["M8 3H5a2 2 0 00-2 2v3","M21 8V5a2 2 0 00-2-2h-3","M3 16v3a2 2 0 002 2h3","M16 21h3a2 2 0 002-2v-3","M7 12l3 3 7-7"],
  categorize:  ["M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"],
  createPost:  ["M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z","M14 2v6h6","M12 18v-6","M9 15h6"],
  dollar:      ["M12 1v22","M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"],
  eye:         ["M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z","M12 9a3 3 0 100 6 3 3 0 000-6z"],
  clock:       ["M12 22a10 10 0 100-20 10 10 0 000 20z","M12 6v6l4 2"],
  play:        "M5 3l14 9-14 9V3z",
  checkCircle: ["M22 11.08V12a10 10 0 11-5.93-9.14","M22 4L12 14.01l-3-3"],
  xCircle:     ["M12 22a10 10 0 100-20 10 10 0 000 20z","M15 9l-6 6","M9 9l6 6"],
  bank:        ["M3 21h18","M3 10h18","M5 6l7-3 7 3","M4 10v11","M20 10v11","M8 14v3","M12 14v3","M16 14v3"],
  zap:         "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  minus:       "M5 12h14",
  plus:        "M12 5v14M5 12h14",
  loader:      ["M21 12a9 9 0 11-6.22-8.56"],
  layers:      ["M12 2L2 7l10 5 10-5-10-5z","M2 17l10 5 10-5","M2 12l10 5 10-5"],
  sales:       ["M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z","M3 6h18","M16 10a4 4 0 01-8 0"],
  purchases:   "M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z",
  reports:     ["M18 20V10","M12 20V4","M6 20v-6"],
  database:    ["M12 2a9 2 0 100 4 9 2 0 000-4z","M21 12a9 2 0 11-18 0","M3 6v6c0 1.1 4 2 9 2s9-.9 9-2V6","M3 12v6c0 1.1 4 2 9 2s9-.9 9-2v-6"],
  settings:    ["M12 15a3 3 0 100-6 3 3 0 000 6z","M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 01-2.83-2.83l.06.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"],
  logout:      ["M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4","M16 17l5-5-5-5","M21 12H9"],
};

interface IconProps {
  name: string;
  size?: number;
  strokeWidth?: number;
  color?: string;
  style?: React.CSSProperties;
}

export const Icon: React.FC<IconProps> = ({ name, size = 16, strokeWidth = 1.75, color = 'currentColor', style = {} }) => {
  const d = ICONS[name];
  if (!d) return null;
  const paths = Array.isArray(d) ? d : [d];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}>
      {paths.map((p, i) => p.startsWith('rect') ? null : <path key={i} d={p} />)}
      {name === 'calendar' && (
        <rect x="3" y="4" width="18" height="18" rx="2" fill="none"
          stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
};

// ── Design Tokens ─────────────────────────────────────────────────────────────

export const C = {
  primary:     '#7028a0',
  primary50:   '#f5ebf9',
  primary100:  '#e8d4f2',
  primary200:  '#d1a9e4',
  primary700:  '#591e80',
  sidebarBg:   'hsl(273,60%,98%)',
  sidebarBorder:'hsl(273,30%,90%)',
  sidebarHover:'hsl(273,30%,95%)',
  sidebarText: 'hsl(273,30%,25%)',
  border:      '#e2e8f0',
  muted:       '#6b7280',
  gray50:      '#f9fafb',
  gray100:     '#f3f4f6',
  gray200:     '#e5e7eb',
  gray700:     '#374151',
  gray900:     '#111827',
} as const;

export const card: React.CSSProperties = {
  background: '#fff',
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  boxShadow: '0 1px 2px 0 rgba(0,0,0,.05)',
};

export const hoverCard = {
  boxShadow: '0 4px 6px -1px rgba(0,0,0,.1)',
  borderColor: C.primary200,
};

// ── Badge ─────────────────────────────────────────────────────────────────────

type BadgeVariant = 'gray' | 'green' | 'yellow' | 'red' | 'blue' | 'purple' | 'orange' | 'amber';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: 'xs' | 'sm';
}

const BADGE_VARIANTS: Record<BadgeVariant, { bg: string; text: string; border: string }> = {
  gray:   { bg: '#f3f4f6', text: '#4b5563', border: '#e5e7eb' },
  green:  { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' },
  yellow: { bg: '#fef9c3', text: '#854d0e', border: '#fde68a' },
  red:    { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' },
  blue:   { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' },
  purple: { bg: '#f5ebf9', text: '#7028a0', border: '#d1a9e4' },
  orange: { bg: '#fff7ed', text: '#9a3412', border: '#fed7aa' },
  amber:  { bg: '#fffbeb', text: '#92400e', border: '#fde68a' },
};

export const Badge: React.FC<BadgeProps> = ({ label, variant = 'gray', size = 'sm' }) => {
  const v = BADGE_VARIANTS[variant] ?? BADGE_VARIANTS.gray;
  const pad = size === 'xs' ? '1px 6px' : '2px 8px';
  const fs = size === 'xs' ? 10 : 11;
  return (
    <span style={{ background: v.bg, color: v.text, border: `1px solid ${v.border}`, borderRadius: 9999, padding: pad, fontSize: fs, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
};

// ── Btn ───────────────────────────────────────────────────────────────────────

type BtnVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'outlineDanger' | 'success' | 'outlineSuccess' | 'link';
type BtnSize = 'sm' | 'md' | 'lg';

interface BtnProps {
  children: React.ReactNode;
  variant?: BtnVariant;
  size?: BtnSize;
  onClick?: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
  title?: string;
}

export const Btn: React.FC<BtnProps> = ({ children, variant = 'primary', size = 'md', onClick, disabled = false, style = {}, title }) => {
  const [hov, setHov] = useState(false);
  const base: React.CSSProperties = { fontFamily: 'Lato,sans-serif', fontWeight: 500, fontSize: 13, borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer', border: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, transition: 'all .15s', opacity: disabled ? 0.6 : 1, ...style };
  const variants: Record<BtnVariant, React.CSSProperties> = {
    primary:      { background: hov ? C.primary700 : C.primary, color: '#fff', padding: '0 12px', height: 32 },
    outline:      { background: hov ? C.gray100 : '#fff', color: C.gray700, border: `1px solid ${C.border}`, padding: '0 12px', height: 32 },
    ghost:        { background: hov ? C.gray100 : 'transparent', color: C.muted, padding: '0 8px', height: 32 },
    danger:       { background: hov ? '#dc2626' : '#ef4444', color: '#fff', padding: '0 12px', height: 32 },
    outlineDanger:{ background: hov ? '#fee2e2' : '#fff', color: '#991b1b', border: '1px solid #fecaca', padding: '0 12px', height: 32 },
    success:      { background: hov ? '#15803d' : '#16a34a', color: '#fff', padding: '0 12px', height: 32 },
    outlineSuccess:{ background: hov ? '#dcfce7' : '#fff', color: '#166534', border: '1px solid #bbf7d0', padding: '0 12px', height: 32 },
    link:         { background: 'transparent', color: C.primary, padding: '0 4px', height: 'auto', fontSize: 12, textDecoration: hov ? 'underline' : 'none' } as React.CSSProperties,
  };
  const sizes: Record<BtnSize, React.CSSProperties> = {
    sm: { height: 28, fontSize: 12, padding: '0 10px' },
    md: {},
    lg: { height: 38, padding: '0 16px' },
  };
  return (
    <button title={title} onClick={disabled ? undefined : onClick}
      style={{ ...base, ...variants[variant], ...sizes[size] }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      {children}
    </button>
  );
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

interface SkeletonProps {
  w?: number | string;
  h?: number;
  r?: number;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({ w = '100%', h = 16, r = 4, style = {} }) => (
  <div style={{ width: w, height: h, borderRadius: r, background: 'linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'skeleton-shimmer 1.5s infinite', ...style }} />
);

// ── Chip ──────────────────────────────────────────────────────────────────────

interface ChipProps {
  label: string;
  active?: boolean;
  onClick?: () => void;
}

export const Chip: React.FC<ChipProps> = ({ label, active, onClick }) => {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ fontFamily: 'Lato,sans-serif', fontSize: 12, fontWeight: 500, padding: '3px 10px', borderRadius: 9999, border: `1px solid ${active ? C.primary : C.border}`, background: active ? C.primary50 : hov ? C.gray100 : '#fff', color: active ? C.primary : C.gray700, cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap' }}>
      {label}
    </button>
  );
};

// ── Select ────────────────────────────────────────────────────────────────────

interface SelectOption { value: string; label: string; }

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  style?: React.CSSProperties;
}

export const Select: React.FC<SelectProps> = ({ value, onChange, options, style = {} }) => (
  <select value={value} onChange={e => onChange(e.target.value)}
    style={{ height: 32, border: `1px solid ${C.border}`, borderRadius: 6, padding: '0 8px', fontSize: 13, fontFamily: 'Lato,sans-serif', color: C.gray700, background: '#fff', cursor: 'pointer', outline: 'none', ...style }}>
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

// ── Divider ───────────────────────────────────────────────────────────────────

export const Divider: React.FC<{ my?: number }> = ({ my = 12 }) => (
  <div style={{ borderTop: `1px solid ${C.border}`, margin: `${my}px 0` }} />
);

// ── Sparkline ─────────────────────────────────────────────────────────────────

interface SparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}

export const Sparkline: React.FC<SparklineProps> = ({ data, color = C.primary, width = 80, height = 28 }) => {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  });
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// ── MiniBar ───────────────────────────────────────────────────────────────────

interface MiniBarSegment { label: string; value: number; color: string; }

export const MiniBar: React.FC<{ segments: MiniBarSegment[] }> = ({ segments }) => {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div style={{ display: 'flex', gap: 2, height: 6, borderRadius: 3, overflow: 'hidden' }}>
      {segments.map((s, i) => (
        <div key={i} style={{ flex: s.value / total, background: s.color, minWidth: s.value > 0 ? 3 : 0 }} title={`${s.label}: ${s.value}`} />
      ))}
    </div>
  );
};

// ── Confidence helpers ────────────────────────────────────────────────────────

export const confidenceVariant: Record<string, BadgeVariant> = {
  high: 'green', medium: 'amber', low: 'red',
};

export const confidenceLabel: Record<string, string> = {
  high: 'High', medium: 'Medium', low: 'Low',
};

// ── Action type meta ──────────────────────────────────────────────────────────

export const ACTION_TYPES: Record<string, { label: string; icon: string; badge: BadgeVariant }> = {
  categorize_transaction: { label: 'Categorise', icon: 'categorize', badge: 'purple' },
  reconcile_posting:      { label: 'Reconcile',  icon: 'reconcile',  badge: 'blue' },
  create_posting:         { label: 'Book',       icon: 'createPost', badge: 'orange' },
  send_email:             { label: 'Send email', icon: 'sendEmail',  badge: 'gray' },
};
