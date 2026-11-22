import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Sparkles,
  ListChecks,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Pill,
  Stethoscope,
  Info,
  Copy,
  Check,
  RefreshCw,
  Download,
  Volume2,
  VolumeX,
  Loader2,
  MessageSquareText,
  ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useStore } from '../hooks/useStore';
import api from '../api/client';
import voiceEngine from '../utils/voiceEngine';

const TONE_STYLES = {
  info: {
    icon: Info,
    card: 'bg-cyan-950/25 border-cyan-500/30',
    title: 'text-cyan-300',
    bulletDot: 'bg-cyan-400 shadow-[0_0_6px_#22d3ee]',
    iconWrap: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  },
  critical: {
    icon: AlertOctagon,
    card: 'bg-rose-950/35 border-rose-500/45',
    title: 'text-rose-300',
    bulletDot: 'bg-rose-500 shadow-[0_0_8px_#f43f5e]',
    iconWrap: 'bg-rose-500/20 text-rose-400 border-rose-500/40',
  },
  warning: {
    icon: AlertTriangle,
    card: 'bg-amber-950/25 border-amber-500/35',
    title: 'text-amber-300',
    bulletDot: 'bg-amber-400 shadow-[0_0_6px_#fbbf24]',
    iconWrap: 'bg-amber-500/15 text-amber-400 border-amber-500/35',
  },
  positive: {
    icon: CheckCircle2,
    card: 'bg-emerald-950/25 border-emerald-500/30',
    title: 'text-emerald-300',
    bulletDot: 'bg-emerald-400 shadow-[0_0_6px_#34d399]',
    iconWrap: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  },
  medication: {
    icon: Pill,
    card: 'bg-violet-950/25 border-violet-500/35',
    title: 'text-violet-300',
    bulletDot: 'bg-violet-400 shadow-[0_0_6px_#a78bfa]',
    iconWrap: 'bg-violet-500/15 text-violet-400 border-violet-500/35',
  },
  action: {
    icon: Stethoscope,
    card: 'bg-blue-950/30 border-blue-500/35',
    title: 'text-blue-300',
    bulletDot: 'bg-blue-400 shadow-[0_0_6px_#60a5fa]',
    iconWrap: 'bg-blue-500/15 text-blue-400 border-blue-500/35',
  },
};

export default function DetailedSummaryModal({ isOpen, onClose }) {
  const { report, sessionId, selectedModel, setActiveTab } = useStore();

  const [summaryData, setSummaryData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const cacheKeyRef = useRef('');

  const stopAudio = useCallback(() => {
    voiceEngine.stopAndReset();
    setIsSpeaking(false);
  }, []);

  // Keep speaking icon synced with centralized voiceEngine (e.g. if muted or finished)
  useEffect(() => {
    return voiceEngine.subscribe(({ isSpeaking: active, activeKey }) => {
      setIsSpeaking(active && activeKey === 'detailed-summary');
    });
  }, []);

  const fetchSummary = useCallback(
    async (force = false) => {
      if (!report) return;
      const reportFingerprint = `${report.meta?.lab || ''}|${report.meta?.date || ''}|${report.tests?.length || 0}|${selectedModel}`;
      if (!force && cacheKeyRef.current === reportFingerprint && summaryData) {
        return;
      }

      setIsLoading(true);
      try {
        const data = await api.getDetailedSummary(sessionId, selectedModel, 'English', report);
        setSummaryData(data);
        cacheKeyRef.current = reportFingerprint;
      } catch (err) {
        console.error('Detailed summary error:', err);
        toast.error(err.message || 'Could not generate detailed summary.');
      } finally {
        setIsLoading(false);
      }
    },
    [report, sessionId, selectedModel, summaryData]
  );

  // Fetch when modal opens or model changes while open
  useEffect(() => {
    if (isOpen && report) {
      fetchSummary(false);
    }
    if (!isOpen) {
      stopAudio();
    }
  }, [isOpen, report, selectedModel, fetchSummary, stopAudio]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const handleCopy = async () => {
    if (!summaryData?.plain_text) return;
    try {
      await navigator.clipboard.writeText(summaryData.plain_text);
      setCopied(true);
      toast.success('Detailed bullet summary copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Copy failed.');
    }
  };

  const handleDownloadTxt = () => {
    if (!summaryData?.plain_text) return;
    const blob = new Blob([summaryData.plain_text], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MediLens_Detailed_Summary_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    toast.success('Detailed summary downloaded!');
  };

  const handleToggleSpeak = async () => {
    if (isSpeaking) {
      stopAudio();
      return;
    }
    if (!summaryData?.plain_text) return;
    try {
      // Read the ENTIRE detailed summary cleanly without truncating
      await voiceEngine.speak(summaryData.plain_text, { key: 'detailed-summary' });
    } catch {
      setIsSpeaking(false);
      toast.error('Could not play audio summary.');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
          onClick={onClose}
        >

          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-3xl bg-[#081022] border border-cyan-400/40 shadow-[0_0_60px_rgba(6,182,212,0.18)] overflow-hidden"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-800/90 bg-[#060c1b] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-[0_0_18px_rgba(6,182,212,0.35)]">
                  <ListChecks className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-extrabold text-white tracking-tight">
                      Detailed Report Summary
                    </h2>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-400/35">
                      Plain-Language Bullets
                    </span>
                    {summaryData?.model_used && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                        {summaryData.model_used}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {report?.meta?.lab || 'Diagnostic Report'} · {report?.meta?.patient || 'Patient'} ·{' '}
                    {report?.meta?.date || 'Recent'}
                  </p>
                </div>
              </div>

              {/* Action Controls */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleToggleSpeak}
                  disabled={isLoading || !summaryData}
                  title={isSpeaking ? 'Stop reading' : 'Read summary aloud'}
                  className={`p-2 rounded-xl border text-xs transition-colors disabled:opacity-40 ${
                    isSpeaking
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      : 'bg-slate-800/80 hover:bg-slate-700 text-cyan-300 border-slate-700'
                  }`}
                >
                  {isSpeaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>

                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={isLoading || !summaryData}
                  title="Copy bullet summary"
                  className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-40"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadTxt}
                  disabled={isLoading || !summaryData}
                  title="Download summary as .txt"
                  className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-40"
                >
                  <Download className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => fetchSummary(true)}
                  disabled={isLoading}
                  title="Regenerate with active LLM"
                  className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-cyan-300 border border-slate-700 transition-colors disabled:opacity-40"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable Bullet Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {isLoading ? (
                <div className="py-16 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-cyan-500/15 border border-cyan-400/35 flex items-center justify-center text-cyan-400">
                    <Loader2 className="w-7 h-7 animate-spin" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">
                      Crafting your detailed bullet-point summary...
                    </p>
                    <p className="text-xs text-slate-400 mt-1 font-mono">
                      Analyzing all parameters &amp; prescriptions with {selectedModel}
                    </p>
                  </div>
                </div>
              ) : summaryData ? (
                <>
                  {/* Top Headline Banner */}
                  <div className="p-4 rounded-2xl glass-insights-card flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                        Report Takeaway
                      </span>
                      <p className="text-sm font-bold text-white mt-0.5 leading-snug">
                        {summaryData.headline}
                      </p>
                    </div>
                  </div>

                  {/* Bullet Sections */}
                  <div className="space-y-3.5">
                    {(summaryData.sections || []).map((section, sIdx) => {
                      const style = TONE_STYLES[section.tone] || TONE_STYLES.info;
                      const Icon = style.icon;

                      return (
                        <motion.div
                          key={sIdx}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: sIdx * 0.04 }}
                          className={`p-4 rounded-2xl border ${style.card}`}
                        >
                          <div className="flex items-center gap-2.5 mb-3">
                            <div className={`w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0 ${style.iconWrap}`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <h3 className={`text-xs font-extrabold uppercase tracking-wider ${style.title}`}>
                              {section.title}
                            </h3>
                          </div>

                          <ul className="space-y-2.5 pl-1">
                            {(section.bullets || []).map((bullet, bIdx) => (
                              <li key={bIdx} className="flex items-start gap-2.5 text-[13px] text-slate-200 leading-relaxed">
                                <span className={`w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0 ${style.bulletDot}`} />
                                <span>{bullet}</span>
                              </li>
                            ))}
                          </ul>
                        </motion.div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="py-12 text-center text-xs text-slate-400">
                  Upload a report to view a detailed summary.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 border-t border-slate-800/90 bg-[#060c1b] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <ShieldCheck className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <span>General patient education only — not a medical diagnosis. Always review with your doctor.</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  setActiveTab('chat');
                }}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-cyan-500/20 transition-all active:scale-95"
              >
                <MessageSquareText className="w-3.5 h-3.5" />
                <span>Ask AI Follow-up Questions</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
