import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  Search,
  Calendar,
  FileText,
  Stethoscope,
  Pill,
  Sparkles,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  FlaskConical,
  Bot,
  Zap,
  BarChart3,
  ClipboardList,
  X,
  Download,
  Printer,
  UploadCloud,
  TrendingUp,
  TrendingDown,
  Minus,
  Building2,
  User,
  MessageSquare,
  ListChecks,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useStore } from '../hooks/useStore';
import api from '../api/client';

/* ============================================================================
   Helper: Parse specimen type subtitle for Investigation Results table
   ============================================================================ */
function inferSpecimen(name = '', unit = '') {
  const n = name.toLowerCase();
  const u = (unit || '').toLowerCase();
  if (n.includes('ct ') || n.includes('x-ray') || n.includes('appendix') || n.includes('gallstone') || n.includes('bile duct') || n.includes('renal pole') || n.includes('ultrasound') || n.includes('mri')) {
    return 'Imaging';
  }
  if (n.includes('operative') || n.includes('blood loss') || n.includes('spo2') || n.includes('oxygen')) {
    return 'Peri-Op';
  }
  if (n.includes('urine') || n.includes('uacr') || n.includes('upcr') || u.includes('mg/g')) {
    return 'Urine';
  }
  if (n.includes('ecg') || n.includes('ekg') || n.includes('rhythm') || n.includes('axis') || n.includes('qrs') || n.includes('qt') || n.includes('pr interval') || n.includes('pri') || n.includes('qtcb') || n.includes('qtcf') || n.includes('st segment') || n.includes('t wave') || n.includes('p wave') || n.includes('ventricular rate') || n.includes('atrial rate') || n === 'vr' || n === 'ar' || n.includes('p-r-t') || n.includes('prt') || u.includes('bpm') || u.includes('ms') || u.includes('°') || u.includes('deg')) {
    return 'ECG / Cardiology';
  }
  if (n.includes('glucose') || n.includes('sugar')) return 'Plasma';
  if (n.includes('hba1c') || n.includes('hemoglobin') || n.includes('wbc') || n.includes('rbc') || n.includes('platelet') || n.includes('mcv') || n.includes('anc') || n.includes('neutrophil') || n.includes('esr') || n.includes('reticulocyte') || n.includes('ph')) {
    return 'Blood';
  }
  if (n.includes('biopsy') || n.includes('cytology') || n.includes('histopathology')) {
    return 'Tissue';
  }
  return 'Serum';
}

/* ============================================================================
   Helper: Compute numeric value & marker position (0..100%) on trend bar
   ============================================================================ */
function parseNumeric(val) {
  if (val === null || val === undefined) return null;
  const match = String(val).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

function computeBarPercent(value, rangeStr, status) {
  const num = parseNumeric(value);
  if (num !== null && rangeStr) {
    const clean = String(rangeStr).replace(/,/g, '').trim();
    const between = clean.match(/(\d+(?:\.\d+)?)\s*[-–—to]+\s*(\d+(?:\.\d+)?)/i);
    if (between) {
      const low = parseFloat(between[1]);
      const high = parseFloat(between[2]);
      const span = Math.max(high - low, 0.001);
      // Map low..high to 28%..68%, below low to 5..26%, above high to 70..96%
      if (num < low) {
        const ratio = Math.max(0, 1 - (low - num) / (span * 1.2));
        return Math.max(8, Math.min(26, 8 + ratio * 18));
      }
      if (num > high) {
        const ratio = Math.min(1, (num - high) / (span * 1.2));
        return Math.max(72, Math.min(95, 72 + ratio * 23));
      }
      return 28 + ((num - low) / span) * 40;
    }
    const lt = clean.match(/^<=?\s*(\d+(?:\.\d+)?)/);
    if (lt) {
      const maxVal = parseFloat(lt[1]);
      if (num <= maxVal) return Math.max(15, Math.min(64, (num / Math.max(maxVal, 0.001)) * 64));
      const excess = Math.min(1, (num - maxVal) / Math.max(maxVal * 0.8, 0.001));
      return 70 + excess * 25;
    }
    const gt = clean.match(/^>=?\s*(\d+(?:\.\d+)?)/);
    if (gt) {
      const minVal = parseFloat(gt[1]);
      if (num >= minVal) return Math.min(82, 55 + Math.min(1, (num - minVal) / Math.max(minVal, 1)) * 27);
      return Math.max(10, (num / Math.max(minVal, 0.001)) * 35);
    }
  }
  if (status === 'critical') return 88;
  if (status === 'high') return 76;
  if (status === 'low') return 22;
  return 54;
}

/* ============================================================================
   Subcomponent: Animated Circular KPI Donut Progress Ring
   ============================================================================ */
function CircularRing({ percentage, strokeColor, glowColor }) {
  const size = 56;
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percentage));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="relative w-14 h-14 flex items-center justify-center flex-shrink-0">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(148, 163, 184, 0.14)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          style={{ filter: `drop-shadow(0 0 6px ${glowColor})` }}
        />
      </svg>
      <span className="absolute text-[11px] font-bold text-slate-100 font-mono">
        {Math.round(clamped)}%
      </span>
    </div>
  );
}

/* ============================================================================
   Subcomponent: Holographic Glowing Neural Brain SVG
   ============================================================================ */
function HolographicBrainGraphic() {
  return (
    <div className="relative w-28 h-28 flex items-center justify-center flex-shrink-0 select-none">
      {/* Ambient cyan radial halo */}
      <div className="absolute inset-2 rounded-full bg-cyan-500/20 blur-xl animate-pulse" />
      <svg viewBox="0 0 140 140" className="w-28 h-28 relative z-10 overflow-visible">
        <defs>
          <linearGradient id="brainStroke" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#67e8f9" />
            <stop offset="50%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
          <radialGradient id="brainFill" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.45" />
            <stop offset="65%" stopColor="#2563eb" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0.05" />
          </radialGradient>
        </defs>

        {/* Orbiting holographic rings */}
        <ellipse
          cx="70"
          cy="74"
          rx="58"
          ry="20"
          fill="none"
          stroke="url(#brainStroke)"
          strokeWidth="1.2"
          strokeOpacity="0.55"
          className="animate-orbit-pulse"
        />
        <ellipse
          cx="70"
          cy="74"
          rx="48"
          ry="14"
          fill="none"
          stroke="#67e8f9"
          strokeWidth="0.9"
          strokeDasharray="4 4"
          strokeOpacity="0.4"
          transform="rotate(14 70 74)"
        />

        {/* Stylized neural brain silhouette */}
        <g className="animate-brain-float" style={{ filter: 'drop-shadow(0 0 10px rgba(34,211,238,0.55))' }}>
          {/* Left hemisphere */}
          <path
            d="M68,30 C52,28 38,37 35,51 C27,54 25,66 31,74 C27,84 35,96 47,96 C52,102 62,101 68,95 Z"
            fill="url(#brainFill)"
            stroke="url(#brainStroke)"
            strokeWidth="1.8"
          />
          {/* Right hemisphere */}
          <path
            d="M72,30 C88,28 102,37 105,51 C113,54 115,66 109,74 C113,84 105,96 93,96 C88,102 78,101 72,95 Z"
            fill="url(#brainFill)"
            stroke="url(#brainStroke)"
            strokeWidth="1.8"
          />
          {/* Brainstem */}
          <path
            d="M64,96 L65,112 C67,115 73,115 75,112 L76,96"
            fill="none"
            stroke="#38bdf8"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          {/* Neural sulci curves */}
          <path d="M44,47 C52,44 58,50 56,58 C54,64 44,64 41,70" fill="none" stroke="#67e8f9" strokeWidth="1.3" strokeLinecap="round" opacity="0.85" />
          <path d="M58,38 C63,46 61,58 55,66 C49,74 52,85 60,86" fill="none" stroke="#38bdf8" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
          <path d="M96,47 C88,44 82,50 84,58 C86,64 96,64 99,70" fill="none" stroke="#67e8f9" strokeWidth="1.3" strokeLinecap="round" opacity="0.85" />
          <path d="M82,38 C77,46 79,58 85,66 C91,74 88,85 80,86" fill="none" stroke="#38bdf8" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
          <path d="M39,81 C46,80 51,84 53,89" fill="none" stroke="#a5f3fc" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
          <path d="M101,81 C94,80 89,84 87,89" fill="none" stroke="#a5f3fc" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />

          {/* Glowing neural nodes */}
          <circle cx="52" cy="48" r="2.2" fill="#a5f3fc" />
          <circle cx="88" cy="48" r="2.2" fill="#a5f3fc" />
          <circle cx="44" cy="68" r="2" fill="#38bdf8" />
          <circle cx="96" cy="68" r="2" fill="#38bdf8" />
          <circle cx="60" cy="78" r="2.2" fill="#67e8f9" />
          <circle cx="80" cy="78" r="2.2" fill="#67e8f9" />
        </g>
      </svg>
    </div>
  );
}

/* ============================================================================
   Helper: Determine if a finding is narrative / qualitative text (e.g. ECG Interpretation)
   ============================================================================ */
function isNarrativeFinding(test) {
  if (!test) return false;
  const name = (test.name || '').toLowerCase();
  const val = String(test.value || '').trim();
  if (name.includes('interpretation') || name.includes('impression') || name.includes('conclusion') || name.includes('diagnosis')) {
    return true;
  }
  // Multiple spaces and words with no standard lab numbers
  if (val.length > 25 && val.includes(' ') && parseNumeric(val) === null) {
    return true;
  }
  return false;
}

/* ============================================================================
   Subcomponent: Horizontal Gradient Trend Bar with Needle Marker
   ============================================================================ */
function RangeTrendBar({ value, range, status }) {
  const pct = computeBarPercent(value, range, status);

  const barGradient =
    status === 'critical'
      ? 'from-emerald-400 via-amber-400 to-rose-500'
      : status === 'high'
      ? 'from-amber-400 to-orange-500'
      : status === 'low'
      ? 'from-cyan-400 to-blue-500'
      : 'from-emerald-500 to-teal-400';

  // For critical values, the bar fills 100% and the white needle sits precisely at the right end of the full bar.
  // For other values, needle and bar end together at clampedPercent.
  const clampedPercent =
    status === 'critical' ? 100 : Math.max(16, Math.min(96, pct));

  const needleLeft =
    clampedPercent >= 98
      ? `calc(${clampedPercent}% - 3px)`
      : `calc(${clampedPercent}% - 1.5px)`;

  return (
    <div className="relative w-20 sm:w-24 h-2 rounded-full bg-slate-800/90 overflow-visible flex items-center">
      <div
        className={`h-full rounded-full bg-gradient-to-r ${barGradient}`}
        style={{ width: `${clampedPercent}%` }}
      />
      <div
        className="absolute top-1/2 -translate-y-1/2 w-[3px] h-3.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.95)]"
        style={{ left: needleLeft }}
      />
    </div>
  );
}

/* ============================================================================
   MAIN COMPONENT: ReportView
   ============================================================================ */
export default function ReportView({ onOpenUpload, onOpenDetailedSummary }) {
  const {
    report,
    reportHistory,
    setReport,
    addMessage,
    setActiveTab,
    sendMessage,
    sessionId,
    selectedModel,
    setIsAnalyzing,
  } = useStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | normal | abnormal | critical
  const [expandedRow, setExpandedRow] = useState(null);
  const [highlightedTest, setHighlightedTest] = useState(null);
  const [miniQuestion, setMiniQuestion] = useState('');
  const [showFullReportModal, setShowFullReportModal] = useState(false);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareIdx, setCompareIdx] = useState(1);

  const tableSectionRef = useRef(null);

  // Instant Sample Loader from Empty State or Comparison Modal
  const handleQuickLoadSample = async () => {
    try {
      setIsAnalyzing(true);
      const tId = toast.loading('Loading clinical sample report...');
      const data = await api.loadSample(sessionId, selectedModel);
      toast.dismiss(tId);
      setReport(data.report, data.stats);
      if (data.message) {
        addMessage({ role: 'assistant', content: data.message, model: selectedModel });
      }
      toast.success(`Sample loaded! ${data.stats?.total || 0} parameters analyzed.`);
    } catch (err) {
      toast.error(err.message || 'Could not load sample report.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Download clinical text summary
  const handleDownloadSummary = async () => {
    try {
      const tId = toast.loading('Generating downloadable clinical summary...');
      await api.downloadSummary(sessionId);
      toast.dismiss(tId);
      toast.success('Clinical summary downloaded!');
    } catch {
      toast.error('Unable to download summary from server.');
    }
  };

  // Focus & expand a specific test in the Investigation Results table
  const focusTestInTable = (testName) => {
    setStatusFilter('all');
    setSearchQuery('');
    setExpandedRow(testName);
    setHighlightedTest(testName);
    setTimeout(() => {
      tableSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
    setTimeout(() => setHighlightedTest(null), 2600);
  };

  // Submit question from embedded MediLens Assistant widget -> live AI Chat
  const handleMiniAsk = (questionText) => {
    const q = (questionText || miniQuestion || '').trim();
    if (!q) return;
    setMiniQuestion('');
    setActiveTab('chat');
    sendMessage(q);
  };

  // Empty State when no report is loaded
  if (!report || !report.tests || report.tests.length === 0) {
    return (
      <div className="h-[calc(100vh-8rem)] flex flex-col items-center justify-center p-6 text-center max-w-2xl mx-auto">
        <div className="w-full rounded-3xl glass-insights-card p-10 flex flex-col items-center text-center relative overflow-hidden">
          <HolographicBrainGraphic />
          <span className="mt-2 text-[10px] font-bold px-3 py-1 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-400/35 uppercase tracking-wider">
            Ready for Analysis
          </span>
          <h3 className="text-2xl font-extrabold text-white tracking-tight mt-4">
            Upload a Medical Report PDF to Begin
          </h3>
          <p className="text-sm text-slate-400 max-w-md mt-2.5 leading-relaxed">
            Drop or select a diagnostic lab report, prescription, CT scan, X-ray, or surgery report (PDF, PNG, JPG, or TXT) to unlock clinical insights, abnormal range tracking, and AI voice consultation.
          </p>
          <button
            onClick={onOpenUpload}
            className="mt-7 px-7 py-3.5 rounded-xl bg-gradient-to-r from-[#06b6d4] via-[#0ea5e9] to-[#2563eb] hover:from-[#22d3ee] hover:to-[#3b82f6] text-white font-bold text-sm shadow-[0_0_28px_rgba(14,165,233,0.45)] transition-all active:scale-95 flex items-center gap-2.5 border border-cyan-300/40"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Upload Lab Report (PDF)</span>
          </button>
          <p className="text-[11px] text-slate-500 mt-4 font-mono">
            Supported: Blood Panels · Prescriptions · CT / X-Ray · Surgical Summaries
          </p>
        </div>
      </div>
    );
  }

  // Compute clinical breakdown stats
  const tests = report.tests || [];
  const normal = tests.filter((t) => t.status === 'normal');
  const abnormal = tests.filter((t) => t.status !== 'normal');
  const critical = tests.filter((t) => t.status === 'critical');

  const totalCount = tests.length;
  const normalPct = totalCount ? Math.round((normal.length / totalCount) * 100) : 0;
  const abnormalPct = totalCount ? Math.round((abnormal.length / totalCount) * 100) : 0;
  const criticalPct = totalCount ? Math.round((critical.length / totalCount) * 100) : 0;

  // Primary featured alert test
  const primaryAlert = critical[0] || abnormal[0] || null;
  const isCriticalBanner = critical.length > 0;

  // Determine high/low direction text for primary alert
  const getDirectionLabel = (item) => {
    if (!item) return '';
    if (isNarrativeFinding(item)) return '';
    if (item.status === 'low') return 'Low';
    if (item.status === 'high') return 'Elevated';
    if (item.direction === 'low') return 'Critically Low';
    if (item.direction === 'high') return 'Critically Elevated';
    // Fallback: inspect range string (handles both `min - max` and `>= min` / `> min`)
    const num = parseNumeric(item.value);
    const rangeStr = String(item.range || '');
    const between = rangeStr.match(/(\d+(?:\.\d+)?)\s*[-–—to]+\s*(\d+(?:\.\d+)?)/i);
    if (num !== null && between && num < parseFloat(between[1])) {
      return 'Critically Low';
    }
    const gt = rangeStr.match(/>=?\s*(\d+(?:\.\d+)?)/);
    if (num !== null && gt && num < parseFloat(gt[1])) {
      return 'Critically Low';
    }
    return 'Critically Elevated';
  };

  // Smart suggested question for embedded MediLens Assistant.
  const suggestedQuestion = primaryAlert
    ? `Why is my ${primaryAlert.name.toLowerCase()} ${getDirectionLabel(primaryAlert).toLowerCase()}?`
    : 'Can you summarize my lab report results?';

  // Smart Key Findings (top 3 abnormal/critical)
  const keyFindings = (abnormal.length > 0 ? abnormal : tests).slice(0, 3);

  // Smart "What to Discuss with Your Doctor" bullets
  const discussItems = [];
  if (critical.length > 0) {
    discussItems.push({
      text: `Ask about ${getDirectionLabel(critical[0]).toLowerCase()} ${critical[0].name} levels`,
      query: `What should I ask my doctor about my critical ${critical[0].name} value (${critical[0].value} ${critical[0].unit || ''})?`,
    });
  }
  const nonCritAbnormal = abnormal.filter((t) => t.status !== 'critical');
  if (nonCritAbnormal.length > 0) {
    const names = nonCritAbnormal.slice(0, 2).map((t) => t.name).join(' & ');
    discussItems.push({
      text: `Review ${names} management`,
      query: `How should I discuss my ${names} results with my doctor?`,
    });
  }
  if (report.medicines?.length > 0 && discussItems.length < 2) {
    discussItems.push({
      text: `Confirm timing & precautions for ${report.medicines[0].name}`,
      query: `What precautions should I discuss with my doctor about ${report.medicines[0].name}?`,
    });
  }
  if (discussItems.length === 0) {
    discussItems.push({
      text: 'Confirm preventive screening schedule',
      query: 'My results look normal — what preventive follow-up questions should I ask my doctor?',
    });
  }

  // Filtered investigation results table
  const filteredTests = tests.filter((t) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      t.name?.toLowerCase().includes(q) ||
      t.explain?.toLowerCase().includes(q) ||
      String(t.value || '').toLowerCase().includes(q);
    if (!matchesSearch) return false;
    if (statusFilter === 'normal') return t.status === 'normal';
    if (statusFilter === 'abnormal') return t.status !== 'normal';
    if (statusFilter === 'critical') return t.status === 'critical';
    return true;
  });

  const renderStatusPill = (status) => {
    if (status === 'critical') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold chip-critical">
          <AlertTriangle className="w-3 h-3" />
          Critical
        </span>
      );
    }
    if (status === 'high') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold chip-high">
          <AlertTriangle className="w-3 h-3" />
          High
        </span>
      );
    }
    if (status === 'low') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold chip-low">
          <TrendingDown className="w-3 h-3" />
          Low
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold chip-normal">
        <CheckCircle2 className="w-3 h-3" />
        Normal
      </span>
    );
  };

  // Comparison helper
  const previousReports = reportHistory.slice(1);
  const selectedPrev = previousReports[compareIdx - 1] || previousReports[0] || null;

  return (
    <div className="space-y-4 max-w-[1440px] mx-auto pb-8">
      {/* ====================================================================
          TIER 1: CRITICAL / PRIORITY FINDING ALERT BANNER
          ==================================================================== */}
      {primaryAlert ? (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`relative rounded-2xl p-4 sm:px-6 sm:py-4 overflow-hidden ${
            isCriticalBanner
              ? 'glass-critical-banner'
              : 'bg-gradient-to-r from-amber-500/20 via-[#1a1610]/90 to-[#111524]/90 border border-amber-500/40 shadow-[0_0_28px_rgba(245,158,11,0.12)]'
          }`}
        >
          {/* Subtle ECG Heartbeat Watermark SVG */}
          <svg
            viewBox="0 0 600 80"
            preserveAspectRatio="none"
            className="absolute right-0 top-0 h-full w-2/3 opacity-[0.12] pointer-events-none"
          >
            <path
              d="M0,45 L180,45 L195,45 L208,16 L220,72 L234,26 L246,45 L390,45 L405,45 L418,12 L430,74 L444,24 L456,45 L600,45"
              fill="none"
              stroke={isCriticalBanner ? '#fb7185' : '#fbbf24'}
              strokeWidth="2"
            />
          </svg>

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Left: Icon + Finding Headline & Value */}
            <div className="flex items-center gap-4">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                  isCriticalBanner
                    ? 'bg-rose-500/20 text-rose-400 border-rose-500/45 shadow-[0_0_20px_rgba(244,63,94,0.3)]'
                    : 'bg-amber-500/20 text-amber-400 border-amber-500/45'
                }`}
              >
                <AlertTriangle className="w-6 h-6" />
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                      isCriticalBanner
                        ? 'bg-rose-500/25 text-rose-200 border border-rose-400/40'
                        : 'bg-amber-500/25 text-amber-200 border border-amber-400/40'
                    }`}
                  >
                    {isCriticalBanner ? 'Critical Finding' : 'Out of Range Finding'}
                  </span>
                  {critical.length > 1 && (
                    <span className="text-[11px] font-semibold text-rose-300/90">
                      +{critical.length - 1} more critical
                    </span>
                  )}
                </div>

                <h2 className="text-lg font-extrabold text-white tracking-tight leading-tight">
                  {primaryAlert.name} {getDirectionLabel(primaryAlert)}
                </h2>

                {isNarrativeFinding(primaryAlert) ? (
                  <div className="mt-1 max-w-sm sm:max-w-md max-h-14 overflow-y-auto pr-1.5 text-xs text-amber-200/95 font-mono leading-relaxed bg-slate-900/60 rounded-lg p-2 border border-amber-500/25">
                    {primaryAlert.value}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-baseline gap-2.5 mt-0.5">
                    <span
                      className={`text-lg font-extrabold font-mono ${
                        isCriticalBanner ? 'text-rose-400' : 'text-amber-400'
                      }`}
                    >
                      {primaryAlert.value}{' '}
                      <span className="text-xs font-semibold text-slate-300">
                        {primaryAlert.unit || ''}
                      </span>
                    </span>
                    {primaryAlert.range && (
                      <span className="text-xs text-slate-300/80 border-l border-slate-600/70 pl-2.5">
                        Reference Range:{' '}
                        <span className="font-mono text-slate-200">
                          {primaryAlert.range} {primaryAlert.unit || ''}
                        </span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Middle: Divider + Brief Plain-Language "What it is" & "Impact" with Scroll */}
            <div className="flex items-start gap-3 lg:border-l lg:border-white/10 lg:pl-6 flex-1 min-w-0 max-w-xl">
              <Stethoscope
                className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                  isCriticalBanner ? 'text-rose-400' : 'text-amber-400'
                }`}
              />
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                {/* Scrollable text container that maintains standard card height */}
                <div className="space-y-1 text-xs leading-relaxed max-h-20 sm:max-h-24 overflow-y-auto pr-2">
                  {primaryAlert.what_it_is && (
                    <p className="text-slate-200">
                      <span className="font-bold text-white">What it is: </span>
                      {primaryAlert.what_it_is}
                    </p>
                  )}
                  <p className={isCriticalBanner ? 'text-rose-100/95' : 'text-amber-100/95'}>
                    <span className={`font-bold ${isCriticalBanner ? 'text-rose-300' : 'text-amber-300'}`}>
                      Impact:{' '}
                    </span>
                    {primaryAlert.impact ||
                      primaryAlert.explain ||
                      (isCriticalBanner
                        ? 'Significantly outside the safe range and may affect organ or body function — needs prompt medical attention.'
                        : 'Outside the usual reference range and should be reviewed with your doctor.')}
                  </p>
                </div>

                {/* Badges container directly below scrollable text */}
                {(primaryAlert.official_guide || primaryAlert.icmr_guide) && (
                  <div className="pt-2 flex flex-wrap items-center gap-2">
                    {primaryAlert.icmr_guide && (
                      <a
                        href={primaryAlert.icmr_guide.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-300 hover:text-amber-200 bg-amber-950/60 hover:bg-amber-900/60 border border-amber-500/40 px-2.5 py-0.5 rounded-lg transition-colors whitespace-nowrap"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        <span>ICMR Indian Guideline ({primaryAlert.icmr_guide.guideline_no || 'ICMR-STG'})</span>
                        <ExternalLink className="w-3 h-3 text-amber-400/80 flex-shrink-0" />
                      </a>
                    )}
                    {primaryAlert.official_guide && (
                      <a
                        href={primaryAlert.official_guide.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-cyan-300 hover:text-cyan-200 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-500/40 px-2.5 py-0.5 rounded-lg transition-colors whitespace-nowrap"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                        <span>NIH MedlinePlus Guide</span>
                        <ExternalLink className="w-3 h-3 text-cyan-400/80 flex-shrink-0" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right: View Details CTA */}
            <button
              onClick={() => focusTestInTable(primaryAlert.name)}
              className={`flex-shrink-0 px-4 py-2.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95 border ${
                isCriticalBanner
                  ? 'bg-rose-500/25 hover:bg-rose-500/40 border-rose-400/50 shadow-[0_0_20px_rgba(244,63,94,0.25)]'
                  : 'bg-amber-500/25 hover:bg-amber-500/40 border-amber-400/50'
              }`}
            >
              <span>View Details</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      ) : (
        <div className="rounded-2xl p-4 px-6 bg-gradient-to-r from-emerald-500/20 via-[#0d1c1d]/90 to-[#0c1424]/90 border border-emerald-500/40 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/35">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">All Parameters Within Normal Range</h2>
              <p className="text-xs text-slate-300">
                All {totalCount} analyzed markers fall inside standard reference limits.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowFullReportModal(true)}
            className="px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-xs font-bold text-emerald-200 flex items-center gap-1.5"
          >
            <span>View Full Report</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ====================================================================
          TIER 2: 4 KPI METRIC CARDS WITH CIRCULAR PROGRESS RINGS
          ==================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Card 1: Total Parameters */}
        <button
          onClick={() => setStatusFilter('all')}
          className={`text-left p-4 rounded-2xl glass-card glass-card-hover flex items-center justify-between gap-3 ${
            statusFilter === 'all' ? 'ring-1 ring-cyan-400/50 border-cyan-400/40' : ''
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center flex-shrink-0 mt-0.5">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-300">Total Parameters</span>
              <div className="text-2xl font-extrabold text-white leading-tight mt-0.5 font-mono">
                {totalCount}
              </div>
              <span className="text-[11px] text-slate-400">Tests Analyzed</span>
            </div>
          </div>
          <CircularRing percentage={100} strokeColor="#38bdf8" glowColor="rgba(56,189,248,0.6)" />
        </button>

        {/* Card 2: Within Normal Range */}
        <button
          onClick={() => setStatusFilter('normal')}
          className={`text-left p-4 rounded-2xl glass-card glass-card-hover flex items-center justify-between gap-3 ${
            statusFilter === 'normal' ? 'ring-1 ring-emerald-400/50 border-emerald-400/40' : ''
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center flex-shrink-0 mt-0.5">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-300">Within Normal Range</span>
              <div className="text-2xl font-extrabold text-emerald-400 leading-tight mt-0.5 font-mono">
                {normal.length}
              </div>
              <span className="text-[11px] text-slate-400">{normalPct}% of Parameters</span>
            </div>
          </div>
          <CircularRing percentage={normalPct} strokeColor="#34d399" glowColor="rgba(52,211,153,0.6)" />
        </button>

        {/* Card 3: Out of Range */}
        <button
          onClick={() => setStatusFilter('abnormal')}
          className={`text-left p-4 rounded-2xl glass-card glass-card-hover flex items-center justify-between gap-3 ${
            statusFilter === 'abnormal' ? 'ring-1 ring-amber-400/50 border-amber-400/40' : ''
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-300">Out of Range</span>
              <div className="text-2xl font-extrabold text-amber-400 leading-tight mt-0.5 font-mono">
                {abnormal.length}
              </div>
              <span className="text-[11px] text-slate-400">{abnormalPct}% of Parameters</span>
            </div>
          </div>
          <CircularRing percentage={abnormalPct} strokeColor="#fbbf24" glowColor="rgba(251,191,36,0.6)" />
        </button>

        {/* Card 4: Critical */}
        <button
          onClick={() => setStatusFilter(critical.length > 0 ? 'critical' : 'all')}
          className={`text-left p-4 rounded-2xl glass-card glass-card-hover flex items-center justify-between gap-3 ${
            statusFilter === 'critical' ? 'ring-1 ring-rose-400/50 border-rose-400/40' : ''
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center flex-shrink-0 mt-0.5">
              <AlertOctagon className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-300">Critical</span>
              <div className="text-2xl font-extrabold text-rose-400 leading-tight mt-0.5 font-mono">
                {critical.length}
              </div>
              <span className="text-[11px] text-slate-400">
                {critical.length > 0 ? 'Requires Attention' : 'None Detected'}
              </span>
            </div>
          </div>
          <CircularRing percentage={criticalPct} strokeColor="#f43f5e" glowColor="rgba(244,63,94,0.6)" />
        </button>
      </div>

      {/* ====================================================================
          TIER 3: AI CLINICAL INSIGHTS HERO PANEL
          ==================================================================== */}
      <div className="rounded-2xl glass-insights-card p-5 relative overflow-hidden">
        {/* Header Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-extrabold text-white tracking-tight">
              AI Clinical Insights
            </h3>
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-400/35">
              AI Generated
            </span>
          </div>
          <div className="flex items-center gap-3">
            {report.meta?.patient && (
              <span className="hidden md:inline-flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                <User className="w-3.5 h-3.5 text-cyan-400" />
                {report.meta.patient} · {report.meta.date || 'Recent'}
              </span>
            )}
            {onOpenDetailedSummary && (
              <button
                type="button"
                onClick={onOpenDetailedSummary}
                className="px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/40 text-cyan-200 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-[0_0_14px_rgba(6,182,212,0.18)]"
              >
                <ListChecks className="w-3.5 h-3.5 text-cyan-300" />
                <span>Detailed Bullet Summary</span>
              </button>
            )}
          </div>
        </div>

        {/* 5-Zone Horizontal Body */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          {/* Holographic Brain + Overall Assessment */}
          <div className="lg:col-span-4 flex items-center gap-4">
            <HolographicBrainGraphic />
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-white mb-1.5">Overall Assessment</h4>
              <p className="text-xs text-slate-300 leading-relaxed line-clamp-4">
                {report.summary ||
                  `${normal.length} of ${totalCount} parameters are within normal limits, while ${abnormal.length} result${
                    abnormal.length === 1 ? ' is' : 's are'
                  } outside the usual reference range.`}
              </p>
            </div>
          </div>

          {/* Key Findings */}
          <div className="lg:col-span-3 lg:border-l lg:border-slate-700/60 lg:pl-5">
            <h4 className="text-xs font-bold text-white mb-2">Key Findings</h4>
            <ul className="space-y-2">
              {keyFindings.map((item, idx) => (
                <li key={idx}>
                  <button
                    onClick={() => focusTestInTable(item.name)}
                    className="w-full text-left flex items-start gap-2 text-xs text-slate-300 hover:text-white transition-colors group"
                  >
                    <span
                      className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                        item.status === 'critical'
                          ? 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'
                          : item.status === 'normal'
                          ? 'bg-emerald-400'
                          : 'bg-amber-400 shadow-[0_0_8px_#fbbf24]'
                      }`}
                    />
                    <span className="leading-snug group-hover:underline line-clamp-2" title={`${item.name} (${item.value} ${item.unit || ''})`}>
                      <strong className="text-slate-100">{item.name}</strong> ({item.value}{' '}
                      {item.unit || ''})
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* What to Discuss with Your Doctor */}
          <div className="lg:col-span-2 lg:border-l lg:border-slate-700/60 lg:pl-5">
            <h4 className="text-xs font-bold text-white mb-2">What to Discuss with Your Doctor</h4>
            <ul className="space-y-2">
              {discussItems.map((d, idx) => (
                <li key={idx}>
                  <button
                    onClick={() => handleMiniAsk(d.query)}
                    className="w-full text-left flex items-start gap-2 text-xs text-slate-300 hover:text-cyan-300 transition-colors group"
                  >
                    <span className="w-2 h-2 rounded-full bg-cyan-400 mt-1.5 flex-shrink-0 shadow-[0_0_6px_#22d3ee]" />
                    <span className="leading-snug group-hover:underline">{d.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Recommended Follow-up Inset Box */}
          <div className="lg:col-span-3 rounded-2xl bg-[#071122]/85 border border-slate-700/60 p-4 space-y-3 shadow-inner">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center flex-shrink-0">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Recommended Follow-up</h4>
                <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                  {critical.length > 0
                    ? 'Consult your doctor promptly for urgent evaluation of critical markers.'
                    : 'Consult your doctor soon to review out-of-range findings together.'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowFullReportModal(true)}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#06b6d4] to-[#2563eb] hover:from-[#22d3ee] hover:to-[#3b82f6] text-white font-bold text-xs shadow-[0_0_20px_rgba(6,182,212,0.35)] transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
            >
              <span>View Full Report</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ====================================================================
          TIER 4: SPLIT BOTTOM GRID — INVESTIGATION RESULTS (8) + ASSISTANT (4)
          ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start" ref={tableSectionRef}>
        {/* LEFT COLUMN (8 cols): INVESTIGATION RESULTS TABLE */}
        <div className="lg:col-span-8 rounded-2xl glass-card overflow-hidden">
          {/* Table Header Toolbar */}
          <div className="p-4 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-extrabold text-white tracking-tight">
                Investigation Results
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 flex-1 justify-end">
              {/* Inline Search */}
              <div className="relative min-w-[170px] max-w-[220px] flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tests..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl glass-input text-xs text-white placeholder-slate-400"
                />
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-1 p-0.5 rounded-xl bg-[#070d1b] border border-slate-800/90 text-[11px]">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                    statusFilter === 'all'
                      ? 'bg-slate-700/90 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All ({totalCount})
                </button>
                <button
                  onClick={() => setStatusFilter('normal')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                    statusFilter === 'normal'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/35'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Normal ({normal.length})
                </button>
                <button
                  onClick={() => setStatusFilter('abnormal')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                    statusFilter === 'abnormal'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/35'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Out of Range ({abnormal.length})
                </button>
                <button
                  onClick={() => setStatusFilter('critical')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                    statusFilter === 'critical'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/35'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Critical ({critical.length})
                </button>
              </div>
            </div>
          </div>

          {/* Data Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-fixed min-w-[680px]">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[17%]" />
                <col className="w-[17%]" />
                <col className="w-[14%]" />
                <col className="w-[16%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-800/80 text-[11px] font-semibold text-slate-400 bg-[#080f1e]/60">
                  <th className="py-3 pl-5 pr-3">Parameter</th>
                  <th className="py-3 px-3">Result</th>
                  <th className="py-3 px-3">Reference Range</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 pl-3 pr-4">Trend</th>
                  <th className="py-3 pl-2 pr-4 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredTests.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-10 text-center text-xs text-slate-400">
                      No diagnostic parameters match your filter.
                    </td>
                  </tr>
                ) : (
                  filteredTests.map((test, idx) => {
                    const isExpanded = expandedRow === test.name;
                    const isHighlighted = highlightedTest === test.name;
                    const isNarrative = isNarrativeFinding(test);
                    const resultColor =
                      test.status === 'critical'
                        ? 'text-rose-400'
                        : test.status === 'high'
                        ? 'text-amber-300'
                        : test.status === 'low'
                        ? 'text-sky-300'
                        : 'text-emerald-400';

                    return (
                      <React.Fragment key={`${test.name}-${idx}`}>
                        <tr
                          onClick={() => setExpandedRow(isExpanded ? null : test.name)}
                          className={`cursor-pointer transition-colors ${
                            isHighlighted
                              ? 'bg-rose-500/15'
                              : isExpanded
                              ? 'bg-cyan-500/[0.07]'
                              : 'hover:bg-slate-800/35'
                          }`}
                        >
                          {/* Parameter + Specimen */}
                          <td className="py-3.5 pl-5 pr-3">
                            <div className="font-bold text-[13px] text-white leading-tight truncate" title={test.name}>
                              {test.name}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {inferSpecimen(test.name, test.unit)}
                            </div>
                          </td>

                          {/* Result (or wide text span for narrative findings) */}
                          {isNarrative ? (
                            <td colSpan="4" className="py-3.5 px-3">
                              <div className="flex items-center justify-between gap-3 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                                <span className="text-xs text-emerald-300 font-mono leading-relaxed line-clamp-2">
                                  {test.value}
                                </span>
                                <div className="flex-shrink-0">
                                  {renderStatusPill(test.status)}
                                </div>
                              </div>
                            </td>
                          ) : (
                            <>
                              {/* Result */}
                              <td className="py-3.5 px-3 whitespace-nowrap">
                                <span className={`text-sm font-extrabold font-mono ${resultColor}`}>
                                  {test.value}
                                </span>{' '}
                                <span className="text-[11px] text-slate-400">{test.unit || ''}</span>
                              </td>

                              {/* Reference Range */}
                              <td className="py-3.5 px-3 text-xs font-mono text-slate-300 whitespace-nowrap">
                                {test.range || '—'}
                              </td>

                              {/* Status Pill */}
                              <td className="py-3.5 px-3 whitespace-nowrap">
                                {renderStatusPill(test.status)}
                              </td>

                              {/* Gradient Trend Bar */}
                              <td className="py-3.5 pl-3 pr-4">
                                {parseNumeric(test.value) !== null ? (
                                  <RangeTrendBar
                                    value={test.value}
                                    range={test.range}
                                    status={test.status}
                                  />
                                ) : (
                                  <span className="text-[11px] font-mono text-slate-400">—</span>
                                )}
                              </td>
                            </>
                          )}

                          {/* Expand Chevron */}
                          <td className="py-3.5 pl-2 pr-4 text-center">
                            <button
                              type="button"
                              aria-label="Toggle parameter explanation"
                              className="w-7 h-7 rounded-full bg-slate-800/70 hover:bg-slate-700 border border-slate-700/70 inline-flex items-center justify-center text-slate-300 transition-transform"
                            >
                              <ChevronDown
                                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                                  isExpanded ? 'rotate-180 text-cyan-400' : ''
                                }`}
                              />
                            </button>
                          </td>
                        </tr>

                        {/* Expanded Plain-Language Explanation Drawer */}
                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <tr>
                              <td colSpan="6" className="p-0 bg-[#070f20]/90">
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={{ duration: 0.18 }}
                                  className="px-5 py-3.5 border-t border-cyan-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                >
                                  <div className="space-y-1.5 max-w-2xl">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                                      What It Is &amp; Clinical Impact
                                    </span>
                                    {test.what_it_is || test.impact ? (
                                      <div className="space-y-1 text-xs leading-relaxed">
                                        {test.what_it_is && (
                                          <p className="text-slate-200">
                                            <span className="font-bold text-white">What it is: </span>
                                            {test.what_it_is}
                                          </p>
                                        )}
                                        {test.impact && (
                                          <p className="text-slate-300">
                                            <span
                                              className={`font-bold ${
                                                test.status === 'critical'
                                                  ? 'text-rose-300'
                                                  : test.status === 'high' || test.status === 'low'
                                                  ? 'text-amber-300'
                                                  : 'text-emerald-300'
                                              }`}
                                            >
                                              Impact:{' '}
                                            </span>
                                            {test.impact}
                                          </p>
                                        )}
                                        {(test.official_guide || test.icmr_guide) && (
                                          <div className="pt-2 flex flex-wrap items-center gap-2">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                              Verified Clinical Guidelines:
                                            </span>
                                            {test.icmr_guide && (
                                              <a
                                                href={test.icmr_guide.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-300 hover:text-amber-200 bg-amber-950/60 hover:bg-amber-900/60 border border-amber-500/40 px-2.5 py-0.5 rounded-lg transition-colors"
                                              >
                                                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                                                <span>ICMR Indian Guideline ({test.icmr_guide.guideline_no || 'ICMR'})</span>
                                                <ExternalLink className="w-3 h-3 text-amber-400/80" />
                                              </a>
                                            )}
                                            {test.official_guide && (
                                              <a
                                                href={test.official_guide.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="inline-flex items-center gap-1.5 text-[11px] font-bold text-cyan-300 hover:text-cyan-200 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-500/40 px-2.5 py-0.5 rounded-lg transition-colors"
                                              >
                                                <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                                                <span>{test.official_guide.title || 'NIH MedlinePlus Guide'}</span>
                                                <ExternalLink className="w-3 h-3 text-cyan-400/80" />
                                              </a>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <p className="text-xs text-slate-200 leading-relaxed">
                                        {test.explain ||
                                          `${test.name} measured ${test.value} ${
                                            test.unit || ''
                                          } compared to the standard reference interval of ${
                                            test.range || 'normal limits'
                                          }. Discuss this marker with your clinician in the context of your overall health.`}
                                      </p>
                                    )}
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleMiniAsk(
                                        `Can you explain my ${test.name} result of ${test.value} ${
                                          test.unit || ''
                                        } (reference range ${test.range || 'N/A'}) and what questions I should ask my doctor?`
                                      );
                                    }}
                                    className="flex-shrink-0 px-3.5 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/35 text-cyan-300 text-xs font-bold flex items-center gap-1.5 transition-colors"
                                  >
                                    <MessageSquare className="w-3.5 h-3.5" />
                                    <span>Ask AI about {test.name.split(' ')[0]}</span>
                                  </button>
                                </motion.div>
                              </td>
                            </tr>
                          )}
                        </AnimatePresence>
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT COLUMN (4 cols): EMBEDDED MEDILENS ASSISTANT + QUICK ACTIONS */}
        <div className="lg:col-span-4 rounded-2xl glass-card p-4 space-y-4">
          {/* Assistant Header */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-extrabold text-white tracking-tight">
                  MediLens Assistant
                </h3>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Ask anything about your report...
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399] animate-pulse" />
              Online
            </span>
          </div>

          {/* Clickable AI Suggested Question Bubble */}
          <button
            type="button"
            onClick={() => handleMiniAsk(suggestedQuestion)}
            className="w-full text-left flex items-center gap-3 p-3 rounded-2xl bg-[#091224]/90 hover:bg-slate-800/80 border border-slate-700/60 hover:border-cyan-400/40 transition-all group"
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-cyan-400 via-blue-500 to-violet-600 p-[2px] flex-shrink-0 shadow-[0_0_16px_rgba(56,189,248,0.4)]">
              <div className="w-full h-full rounded-full bg-[#09142b] flex items-center justify-center">
                <Bot className="w-5 h-5 text-cyan-300" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-100 group-hover:text-cyan-200 transition-colors leading-snug">
                {suggestedQuestion}
              </p>
              <span className="text-[10px] text-cyan-400/80 font-semibold mt-0.5 inline-block">
                Click to ask AI →
              </span>
            </div>
          </button>

          {/* Inline Functional Question Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleMiniAsk();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={miniQuestion}
              onChange={(e) => setMiniQuestion(e.target.value)}
              placeholder="Type your question..."
              className="flex-1 px-3.5 py-2.5 rounded-xl glass-input text-xs text-white placeholder-slate-400"
            />
            <button
              type="submit"
              disabled={!miniQuestion.trim()}
              title="Send question to MediLens AI"
              className="w-9 h-9 rounded-full bg-gradient-to-r from-cyan-400 to-blue-600 hover:from-cyan-300 hover:to-blue-500 disabled:opacity-40 text-white flex items-center justify-center shadow-[0_0_16px_rgba(6,182,212,0.4)] transition-all active:scale-95 flex-shrink-0"
            >
              <ChevronRight className="w-4 h-4 stroke-[2.6]" />
            </button>
          </form>

          {/* Quick Actions Section */}
          <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
            <div className="flex items-center gap-1.5 px-1 mb-2">
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-xs font-bold text-white">Quick Actions</span>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('doctor')}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800/80 hover:border-cyan-500/35 text-xs text-slate-200 hover:text-white transition-all group"
            >
              <span className="flex items-center gap-2.5">
                <ClipboardList className="w-4 h-4 text-cyan-400" />
                <span>Generate Doctor Prep Sheet</span>
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all" />
            </button>

            <button
              type="button"
              onClick={() => setShowCompareModal(true)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800/80 hover:border-cyan-500/35 text-xs text-slate-200 hover:text-white transition-all group"
            >
              <span className="flex items-center gap-2.5">
                <BarChart3 className="w-4 h-4 text-blue-400" />
                <span>Compare with Previous Reports</span>
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all" />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('medicines')}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800/80 hover:border-cyan-500/35 text-xs text-slate-200 hover:text-white transition-all group"
            >
              <span className="flex items-center gap-2.5">
                <Pill className="w-4 h-4 text-emerald-400" />
                <span>View Medication Info</span>
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all" />
            </button>
          </div>
        </div>
      </div>

      {/* ====================================================================
          MODAL 1: FULL CLINICAL REPORT VIEWER ("View Full Report ->")
          ==================================================================== */}
      <AnimatePresence>
        {showFullReportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-3xl bg-[#0a1326] border border-cyan-500/35 shadow-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-4 bg-[#070e1d]">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-base font-extrabold text-white">
                      Full Clinical Report Summary
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {report.meta?.lab || 'Diagnostic Facility'} · {report.meta?.patient || 'Patient'} ·{' '}
                    {report.meta?.date || 'Recent'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadSummary}
                    className="px-3.5 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/35 text-cyan-300 text-xs font-bold flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .txt</span>
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print</span>
                  </button>
                  <button
                    onClick={() => setShowFullReportModal(false)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Summary */}
                {report.summary && (
                  <div className="p-4 rounded-2xl bg-cyan-950/30 border border-cyan-500/30">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-300 mb-1.5">
                      Plain-Language Assessment
                    </h4>
                    <p className="text-xs text-slate-200 leading-relaxed">{report.summary}</p>
                  </div>
                )}

                {/* Complete Parameter List */}
                <div className="space-y-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    All Analyzed Parameters ({totalCount})
                  </h4>
                  <div className="divide-y divide-slate-800/80 rounded-2xl border border-slate-800 overflow-hidden bg-slate-950/40">
                    {tests.map((t, i) => (
                      <div key={i} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="space-y-0.5 max-w-xl">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">{t.name}</span>
                            {renderStatusPill(t.status)}
                          </div>
                          {t.explain && (
                            <p className="text-[11px] text-slate-400 leading-relaxed">{t.explain}</p>
                          )}
                        </div>
                        <div className="text-right font-mono flex-shrink-0">
                          <div className="text-sm font-extrabold text-white">
                            {t.value} <span className="text-[11px] text-slate-400">{t.unit || ''}</span>
                          </div>
                          <div className="text-[10px] text-slate-400">Ref: {t.range || '—'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Medications */}
                {report.medicines?.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                      Prescribed Medications ({report.medicines.length})
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {report.medicines.map((m, i) => (
                        <div key={i} className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-1">
                          <div className="text-xs font-bold text-white">{m.name}</div>
                          <p className="text-[11px] text-slate-300">{m.purpose}</p>
                          <p className="text-[11px] text-emerald-400 font-mono">{m.timing}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ====================================================================
          MODAL 2: COMPARE WITH PREVIOUS REPORTS ("Compare with Previous Reports")
          ==================================================================== */}
      <AnimatePresence>
        {showCompareModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-3xl bg-[#0a1326] border border-blue-500/35 shadow-2xl overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-[#070e1d]">
                <div className="flex items-center gap-2.5">
                  <BarChart3 className="w-5 h-5 text-cyan-400" />
                  <div>
                    <h3 className="text-base font-extrabold text-white">
                      Compare with Previous Reports
                    </h3>
                    <p className="text-xs text-slate-400">
                      Track longitudinal parameter trends across uploaded reports
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCompareModal(false)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {previousReports.length === 0 ? (
                  <div className="py-10 text-center space-y-4">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
                      <BarChart3 className="w-8 h-8" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-white">
                        Only 1 Report Loaded in This Session
                      </h4>
                      <p className="text-xs text-slate-400 max-w-md mx-auto mt-1.5 leading-relaxed">
                        Upload a second report (for example, another file from your <code className="text-cyan-300">test_reports/</code> folder) and MediLens will automatically keep both in history so you can compare biomarker deltas side-by-side.
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-3">
                      <button
                        onClick={() => {
                          setShowCompareModal(false);
                          onOpenUpload();
                        }}
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-cyan-500/25"
                      >
                        <UploadCloud className="w-4 h-4" />
                        <span>Upload Another Report</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Report Selector */}
                    <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800">
                      <div className="text-xs">
                        <span className="text-slate-400">Current: </span>
                        <strong className="text-cyan-300">
                          {report.meta?.lab || 'Current Report'} ({report.meta?.date || 'Latest'})
                        </strong>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400">Compare vs:</span>
                        <select
                          value={compareIdx}
                          onChange={(e) => setCompareIdx(Number(e.target.value))}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs"
                        >
                          {previousReports.map((entry, idx) => (
                            <option key={entry.id} value={idx + 1}>
                              {entry.label} ({entry.date} · {entry.loadedAt})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Side-by-Side Comparison Table */}
                    <div className="rounded-2xl border border-slate-800 overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                          <tr>
                            <th className="py-2.5 px-4">Parameter</th>
                            <th className="py-2.5 px-4">Previous</th>
                            <th className="py-2.5 px-4">Current</th>
                            <th className="py-2.5 px-4">Delta</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/70">
                          {tests.map((curr, idx) => {
                            const prevMatch = (selectedPrev?.report?.tests || []).find(
                              (p) => p.name.toLowerCase() === curr.name.toLowerCase()
                            );
                            const currNum = parseNumeric(curr.value);
                            const prevNum = prevMatch ? parseNumeric(prevMatch.value) : null;
                            const diff =
                              currNum !== null && prevNum !== null
                                ? +(currNum - prevNum).toFixed(2)
                                : null;

                            return (
                              <tr key={idx} className="hover:bg-slate-800/30">
                                <td className="py-2.5 px-4 font-bold text-white">{curr.name}</td>
                                <td className="py-2.5 px-4 font-mono text-slate-400">
                                  {prevMatch ? `${prevMatch.value} ${prevMatch.unit || ''}` : 'Not in previous'}
                                </td>
                                <td className="py-2.5 px-4 font-mono font-bold text-cyan-300">
                                  {curr.value} {curr.unit || ''}
                                </td>
                                <td className="py-2.5 px-4 font-mono">
                                  {diff === null ? (
                                    <span className="text-slate-500 inline-flex items-center gap-1">
                                      <Minus className="w-3 h-3" /> N/A
                                    </span>
                                  ) : diff > 0 ? (
                                    <span className="text-amber-400 inline-flex items-center gap-1 font-bold">
                                      <TrendingUp className="w-3.5 h-3.5" /> +{diff}
                                    </span>
                                  ) : diff < 0 ? (
                                    <span className="text-emerald-400 inline-flex items-center gap-1 font-bold">
                                      <TrendingDown className="w-3.5 h-3.5" /> {diff}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">No change</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
