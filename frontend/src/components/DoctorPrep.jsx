import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Stethoscope, 
  Download, 
  HelpCircle, 
  CheckSquare, 
  Square, 
  ClipboardCheck, 
  FileText, 
  AlertCircle, 
  Sparkles,
  ArrowRight,
  BriefcaseMedical,
  CheckCircle2,
  Calendar,
  Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useStore } from '../hooks/useStore';
import api from '../api/client';

export default function DoctorPrep({ onOpenUpload }) {
  const { report, sessionId } = useStore();
  const [prepData, setPrepData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [checkedQuestions, setCheckedQuestions] = useState({});
  const [checkedItems, setCheckedItems] = useState({});

  useEffect(() => {
    async function loadDoctorPrep() {
      if (!report || !report.tests) return;
      try {
        setIsLoading(true);
        const data = await api.getDoctorPrep(sessionId);
        if (data.prep) {
          setPrepData(data.prep);
        }
      } catch (err) {
        console.error('Error fetching doctor prep:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadDoctorPrep();
  }, [report, sessionId]);

  const handleDownloadSummary = async () => {
    try {
      toast.loading('Generating one-page clinical summary...', { id: 'summary-dl' });
      await api.downloadSummary(sessionId);
      toast.success('Summary downloaded! Take this to your consultation.', { id: 'summary-dl' });
    } catch (err) {
      toast.error('Failed to download summary.', { id: 'summary-dl' });
    }
  };

  const toggleQuestion = (idx) => {
    setCheckedQuestions((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const toggleItem = (idx) => {
    setCheckedItems((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  if (!report || !report.tests || report.tests.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 mb-5 shadow-2xl">
          <Stethoscope className="w-10 h-10 text-violet-500/40" />
        </div>
        <h3 className="text-xl font-bold text-white tracking-tight">No Report Context</h3>
        <p className="text-sm text-slate-400 max-w-md mt-2 leading-relaxed">
          Upload a lab report or load the sample report to formulate doctor consultation questions tailored to your test results.
        </p>
        <button
          onClick={onOpenUpload}
          className="mt-6 px-6 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white font-semibold text-sm shadow-lg shadow-violet-500/25 hover:from-violet-400 hover:to-fuchsia-500 transition-all active:scale-95"
        >
          Load Report
        </button>
      </div>
    );
  }

  const questions = prepData?.questions || [
    'What could be causing these out-of-range results, and are confirmatory tests needed?',
    'Do I need to make immediate dietary, hydration, or lifestyle modifications?',
    'Are these numbers related to any of my current daily symptoms?',
    'Should any of my existing medications or supplements be reviewed or adjusted?',
    'When should we repeat this lab panel to evaluate progression?',
  ];

  const bringItems = prepData?.bring || [
    'This printed MediLens summary and your original official diagnostic laboratory sheet',
    'Any previous blood tests or radiology reports from the past 12-24 months for trend comparison',
    'All current prescription drug bottles, over-the-counter vitamins, and herbal supplements',
    'A handwritten 3-day log of any notable symptoms (e.g., fatigue, dizziness, swelling, headaches)',
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Hero Banner with Download Button */}
      <div className="p-7 rounded-3xl glass-card relative overflow-hidden flex flex-wrap items-center justify-between gap-6 border-violet-500/30">
        <div className="space-y-1.5 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            Physician Consultation Coach
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            Prepare for Your Doctor's Appointment
          </h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            Patients who bring organized questions and records have more productive consultations. MediLens formulated these tailored questions based on your specific abnormal test markers.
          </p>
        </div>

        <button
          onClick={handleDownloadSummary}
          className="px-5 py-3.5 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-violet-500 to-fuchsia-600 hover:from-violet-400 hover:to-fuchsia-500 shadow-lg shadow-violet-500/25 flex items-center gap-2.5 transition-all active:scale-95 flex-shrink-0"
        >
          <Download className="w-4 h-4" />
          <span>Download 1-Page Summary (TXT)</span>
        </button>
      </div>

      {/* Two Column Grid: Questions & Checklist */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Targeted Questions Column */}
        <div className="md:col-span-2 space-y-4">
          <div className="p-6 rounded-3xl glass-card space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-violet-500/20 text-violet-400">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Targeted Consultation Questions</h3>
                  <p className="text-[11px] text-slate-400">Check off questions as you ask them</p>
                </div>
              </div>
              <span className="text-xs font-mono font-bold text-violet-400 bg-violet-950/60 px-2.5 py-1 rounded-full border border-violet-800">
                {Object.values(checkedQuestions).filter(Boolean).length} / {questions.length} asked
              </span>
            </div>

            {isLoading ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
                <span className="text-xs">Formulating intelligent clinical questions...</span>
              </div>
            ) : (
              <div className="space-y-3">
                {questions.map((q, idx) => {
                  const isChecked = checkedQuestions[idx];

                  return (
                    <div
                      key={idx}
                      onClick={() => toggleQuestion(idx)}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3.5 select-none ${
                        isChecked
                          ? 'bg-slate-900/40 border-slate-800/80 text-slate-400'
                          : 'bg-slate-900/90 border-slate-700/70 hover:border-violet-500/40 text-slate-200'
                      }`}
                    >
                      <button className="flex-shrink-0 mt-0.5 text-violet-400">
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400" />
                        )}
                      </button>
                      <div className="flex-1 text-xs leading-relaxed">
                        <span className={`font-semibold mr-2 ${isChecked ? 'text-slate-400 line-through' : 'text-violet-300'}`}>
                          Q{idx + 1}.
                        </span>
                        <span className={isChecked ? 'line-through text-slate-400' : ''}>
                          {q}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* What to Bring Checklist Column */}
        <div className="space-y-6">
          <div className="p-6 rounded-3xl glass-card space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
              <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400">
                <BriefcaseMedical className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Appointment Checklist</h3>
                <p className="text-[11px] text-slate-400">Items to bring to clinic</p>
              </div>
            </div>

            <div className="space-y-3">
              {bringItems.map((item, idx) => {
                const isChecked = checkedItems[idx];

                return (
                  <div
                    key={idx}
                    onClick={() => toggleItem(idx)}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex items-start gap-3 select-none ${
                      isChecked
                        ? 'bg-slate-900/30 border-slate-800 text-slate-400 line-through'
                        : 'bg-slate-900/80 border-slate-700/60 hover:border-cyan-500/40 text-slate-200'
                    }`}
                  >
                    <button className="flex-shrink-0 mt-0.5 text-cyan-400">
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                    <span className="leading-snug">{item}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Doctor Summary Preview */}
          <div className="p-5 rounded-3xl glass-card bg-slate-950/80 border-slate-800 space-y-3 text-xs">
            <div className="flex items-center justify-between text-slate-400">
              <span className="font-bold uppercase tracking-wider text-[10px]">
                Report Snapshot
              </span>
              <span className="text-cyan-400 font-mono text-[11px]">
                {report.tests.filter((t) => t.status !== 'normal').length} Abnormal Markers
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Your physician will review the highest-priority flags first: <strong>{report.tests.filter(t => t.status !== 'normal').map(t => t.name).slice(0, 3).join(', ')}</strong>.
            </p>
            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                onClick={handleDownloadSummary}
                className="text-xs text-violet-400 hover:text-violet-300 font-semibold flex items-center gap-1"
              >
                <span>Save consultation sheet</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
