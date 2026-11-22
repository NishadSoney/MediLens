import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, ListChecks } from 'lucide-react';
import { Toaster } from 'react-hot-toast';

import { useStore } from './hooks/useStore';
import Sidebar from './components/Sidebar';
import ModelSelector from './components/ModelSelector';
import FileUpload from './components/FileUpload';
import DetailedSummaryModal from './components/DetailedSummaryModal';
import ReportView from './components/ReportView';
import ChatPanel from './components/ChatPanel';
import DoctorPrep from './components/DoctorPrep';
import MedicinesPanel from './components/MedicinesPanel';
import api from './api/client';

export default function App() {
  const { activeTab, report } = useStore();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);

  // Health check on mount (wait for user to upload a report before showing analysis)
  useEffect(() => {
    async function initCheck() {
      try {
        await api.health();
      } catch (err) {
        console.warn('API health check warning:', err);
      }
    }
    initCheck();
  }, []);

  const getTabTitle = () => {
    switch (activeTab) {
      case 'report':
        return {
          title: 'Lab Report Analysis',
          badge: 'AI Analysis',
          desc: 'Clinical evaluation & plain-language explanations',
        };
      case 'chat':
        return {
          title: 'Voice-Enabled AI Assistant',
          badge: 'Voice AI',
          desc: 'Ask anything about your health results in any language — replies automatically match your language',
        };
      case 'doctor':
        return {
          title: 'Doctor Visit Preparation',
          badge: 'Consultation Guide',
          desc: 'Actionable physician questions & appointment checklist',
        };
      case 'medicines':
        return {
          title: 'Prescription Drug Facts',
          badge: 'Pharmacology',
          desc: 'Pharmacology indications, documented side effects & timing',
        };
      default:
        return { title: 'MediLens Assistant', badge: 'AI', desc: '' };
    }
  };

  const { title, badge, desc } = getTabTitle();

  return (
    <div className="min-h-screen bg-[#050a15] text-slate-100 flex relative overflow-x-hidden selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Toast notifications */}
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#0c1528',
            color: '#f8fafc',
            border: '1px solid rgba(148,163,184,0.2)',
            borderRadius: '14px',
            fontSize: '13px',
            backdropFilter: 'blur(16px)',
          },
        }}
      />

      {/* Ambient deep glowing orbs */}
      <div className="fixed top-[-80px] left-[22%] w-[460px] h-[460px] bg-cyan-500/[0.07] rounded-full blur-[150px] pointer-events-none -z-10" />
      <div className="fixed bottom-[-100px] right-[12%] w-[520px] h-[520px] bg-blue-600/[0.08] rounded-full blur-[160px] pointer-events-none -z-10" />
      <div className="fixed top-[35%] right-[5%] w-[300px] h-[300px] bg-indigo-500/[0.06] rounded-full blur-[130px] pointer-events-none -z-10" />

      {/* Left Navigation Sidebar with Flowing Bioluminescent Wave */}
      <Sidebar onOpenUpload={() => setIsUploadOpen(true)} />

      {/* Main Content Pane */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        {/* Top Navbar matching reference */}
        <header className="sticky top-0 z-20 px-6 lg:px-8 py-4 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/70 bg-[#050a15]/85 backdrop-blur-2xl">
          {/* Title + AI Analysis Badge */}
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-[20px] font-extrabold text-white tracking-tight leading-none">
                {title}
              </h1>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                {badge}
              </span>
              {report?.meta?.lab && (
                <span className="hidden xl:inline-flex text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-slate-800/80 text-slate-300 border border-slate-700/80">
                  {report.meta.lab.split('(')[0].trim()}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">{desc}</p>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-3">
            {report && (
              <button
                onClick={() => setIsSummaryOpen(true)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-cyan-200 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/40 shadow-[0_0_18px_rgba(6,182,212,0.2)] transition-all flex items-center gap-2 active:scale-[0.98]"
                title="Open detailed bullet-point report summary"
              >
                <ListChecks className="w-4 h-4 text-cyan-300" />
                <span>Detailed Summary</span>
              </button>
            )}
            <ModelSelector />
            <button
              onClick={() => setIsUploadOpen(true)}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-100 bg-[#0e172a]/90 hover:bg-slate-800 border border-slate-700/75 hover:border-cyan-500/40 transition-all flex items-center gap-2 shadow-md active:scale-[0.98]"
            >
              <UploadCloud className="w-4 h-4 text-cyan-400" />
              <span>Upload New</span>
            </button>
          </div>
        </header>

        {/* Active View Content */}
        <div className="flex-1 px-6 lg:px-8 py-5">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="h-full"
            >
              {activeTab === 'report' && (
                <ReportView
                  onOpenUpload={() => setIsUploadOpen(true)}
                  onOpenDetailedSummary={() => setIsSummaryOpen(true)}
                />
              )}
              {activeTab === 'chat' && <ChatPanel />}
              {activeTab === 'doctor' && <DoctorPrep onOpenUpload={() => setIsUploadOpen(true)} />}
              {activeTab === 'medicines' && <MedicinesPanel onOpenUpload={() => setIsUploadOpen(true)} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Upload Modal */}
      <FileUpload isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} />

      {/* Detailed Bullet-Point Report Summary Popup */}
      <DetailedSummaryModal isOpen={isSummaryOpen} onClose={() => setIsSummaryOpen(false)} />
    </div>
  );
}
