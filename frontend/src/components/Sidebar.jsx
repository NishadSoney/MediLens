import React from 'react';
import { motion } from 'framer-motion';
import {
  FileText,
  MessageSquareText,
  Stethoscope,
  Pill,
  UploadCloud,
  ShieldCheck,
  HeartPulse,
} from 'lucide-react';
import { useStore } from '../hooks/useStore';

export default function Sidebar({ onOpenUpload }) {
  const { activeTab, setActiveTab, report, stats } = useStore();

  const abnormalCount = stats?.abnormal ?? (report?.tests ? report.tests.filter((t) => t.status !== 'normal').length : null);
  const medsCount = report?.medicines?.length ?? null;

  const navItems = [
    {
      id: 'report',
      label: 'Report Analysis',
      icon: FileText,
      badge: abnormalCount !== null ? `${abnormalCount} flag` : null,
      badgeColor:
        abnormalCount > 0
          ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
          : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
    },
    {
      id: 'chat',
      label: 'Ask Assistant',
      icon: MessageSquareText,
      badge: 'Voice AI',
      badgeColor: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/35',
    },
    {
      id: 'doctor',
      label: 'Doctor Prep',
      icon: Stethoscope,
      badge: 'Questions',
      badgeColor: 'bg-violet-500/20 text-violet-300 border-violet-500/35',
    },
    {
      id: 'medicines',
      label: 'Prescriptions',
      icon: Pill,
      badge: medsCount !== null && medsCount > 0 ? `${medsCount} meds` : null,
      badgeColor: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
    },
  ];

  return (
    <aside className="w-[260px] flex-shrink-0 h-screen sticky top-0 flex flex-col justify-between p-4 border-r border-slate-800/80 bg-[#060c1b] select-none z-30 overflow-hidden relative">
      {/* ====================================================================
          CONTINUOUSLY WAVY BIOLUMINESCENT SILK WAVE BACKGROUND
          ==================================================================== */}
      <div className="absolute inset-x-0 bottom-0 h-[62%] pointer-events-none overflow-hidden z-0">
        {/* Soft ambient ocean glow */}
        <div className="absolute -bottom-16 -left-16 w-72 h-72 bg-blue-600/20 rounded-full blur-[70px]" />
        <div className="absolute bottom-24 right-0 w-44 h-44 bg-cyan-500/15 rounded-full blur-[65px]" />

        {/* Layer 1: Deep sweeping diagonal indigo-blue silk wave */}
        <svg
          viewBox="0 0 420 420"
          preserveAspectRatio="none"
          className="absolute bottom-0 left-[-10%] w-[150%] h-full opacity-60 animate-wave-b"
        >
          <defs>
            <linearGradient id="waveGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1d4ed8" stopOpacity="0.05" />
              <stop offset="45%" stopColor="#0284c7" stopOpacity="0.34" />
              <stop offset="100%" stopColor="#0f172a" stopOpacity="0.08" />
            </linearGradient>
            <linearGradient id="waveStroke1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.05" />
              <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.1" />
            </linearGradient>
          </defs>
          <path
            d="M-20,250 C60,180 130,300 220,210 C300,130 350,240 440,150 L440,440 L-20,440 Z"
            fill="url(#waveGrad1)"
          />
          <path
            d="M-20,250 C60,180 130,300 220,210 C300,130 350,240 440,150"
            fill="none"
            stroke="url(#waveStroke1)"
            strokeWidth="1.6"
          />
        </svg>

        {/* Layer 2: Flowing mid cyan-blue translucent ribbon */}
        <svg
          viewBox="0 0 420 420"
          preserveAspectRatio="none"
          className="absolute bottom-[-10px] left-[-5%] w-[145%] h-[92%] opacity-75 animate-wave-a"
        >
          <defs>
            <linearGradient id="waveGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.28" />
              <stop offset="55%" stopColor="#2563eb" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#091326" stopOpacity="0.04" />
            </linearGradient>
            <linearGradient id="waveStroke2" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.15" />
              <stop offset="45%" stopColor="#67e8f9" stopOpacity="0.65" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.1" />
            </linearGradient>
          </defs>
          <path
            d="M-30,195 C55,260 120,145 210,225 C295,300 355,155 440,210 L440,440 L-30,440 Z"
            fill="url(#waveGrad2)"
          />
          <path
            d="M-30,195 C55,260 120,145 210,225 C295,300 355,155 440,210"
            fill="none"
            stroke="url(#waveStroke2)"
            strokeWidth="1.4"
          />
        </svg>

        {/* Layer 3: Subtle shimmering foreground aurora filament */}
        <svg
          viewBox="0 0 420 420"
          preserveAspectRatio="none"
          className="absolute bottom-[-20px] left-[-8%] w-[140%] h-[80%] opacity-65 animate-wave-c"
        >
          <defs>
            <linearGradient id="waveGrad3" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.22" />
              <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <path
            d="M-20,285 C70,225 145,320 235,245 C315,178 365,265 440,225 L440,440 L-20,440 Z"
            fill="url(#waveGrad3)"
          />
          <path
            d="M-20,285 C70,225 145,320 235,245 C315,178 365,265 440,225"
            fill="none"
            stroke="rgba(103, 232, 249, 0.35)"
            strokeWidth="1.2"
          />
        </svg>
      </div>

      {/* ====================================================================
          TOP SECTION: BRAND + CTA + NAVIGATION
          ==================================================================== */}
      <div className="space-y-5 relative z-10">
        {/* Brand Header */}
        <div
          onClick={() => setActiveTab('report')}
          className="flex items-center gap-3 px-1 pt-1 cursor-pointer group"
        >
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-400 via-blue-500 to-violet-600 flex items-center justify-center shadow-[0_0_20px_rgba(56,189,248,0.35)] border border-white/25 group-hover:scale-105 transition-transform">
              <HeartPulse className="w-5 h-5 text-white stroke-[2.3]" />
            </div>
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#060c1b] shadow-[0_0_8px_#34d399]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[19px] font-extrabold tracking-tight text-white leading-none">
                MediLens
              </span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-cyan-500/15 text-cyan-300 border border-cyan-500/35 uppercase tracking-wider leading-tight">
                Multi-LLM
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-1 truncate">
              Clinical Report Intelligence
            </p>
          </div>
        </div>

        {/* Glowing Upload Lab Report CTA */}
        <button
          onClick={onOpenUpload}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-[#06b6d4] via-[#0ea5e9] to-[#2563eb] hover:from-[#22d3ee] hover:via-[#38bdf8] hover:to-[#3b82f6] shadow-[0_0_24px_rgba(14,165,233,0.4)] hover:shadow-[0_0_30px_rgba(34,211,238,0.55)] transition-all duration-200 active:scale-[0.98] border border-cyan-300/40 group"
        >
          <UploadCloud className="w-4 h-4 text-white group-hover:-translate-y-0.5 transition-transform" />
          <span>Upload Lab Report</span>
        </button>

        {/* Workspace Views Navigation */}
        <nav className="space-y-1 pt-1">
          <p className="px-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-[0.14em] mb-2">
            Workspace Views
          </p>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`relative w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200 group ${
                  isActive
                    ? 'text-white bg-gradient-to-r from-cyan-500/18 via-blue-500/12 to-slate-900/20 border border-cyan-400/30 shadow-[0_4px_20px_rgba(6,182,212,0.12)]'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/45 border border-transparent'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTabIndicator"
                    className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-cyan-400 shadow-[0_0_12px_#22d3ee]"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 flex-shrink-0 transition-colors ${
                      isActive ? 'text-cyan-400' : 'text-slate-400 group-hover:text-slate-200'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${item.badgeColor}`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ====================================================================
          BOTTOM SECTION: CLINICAL SAFETY CARD + PIPELINE STATUS
          ==================================================================== */}
      <div className="space-y-3 relative z-10">
        <div className="p-3 rounded-xl bg-[#0a1326]/75 backdrop-blur-xl border border-slate-700/50 text-[11px] leading-relaxed text-slate-300 flex items-start gap-2.5 shadow-lg">
          <ShieldCheck className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
          <span>
            Strict clinical safety: No diagnosis, no drug changes. Always consult a physician.
          </span>
        </div>
        <div className="flex items-center justify-between px-1.5 text-[11px] text-slate-400 font-mono">
          <span>Engine v2.4</span>
          <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse" />
            Live AI Pipeline
          </span>
        </div>
      </div>
    </aside>
  );
}
