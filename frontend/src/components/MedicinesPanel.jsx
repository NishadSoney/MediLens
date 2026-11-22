import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Pill, 
  Clock, 
  AlertCircle, 
  ShieldAlert, 
  HelpCircle, 
  ArrowRight, 
  CheckCircle2, 
  Search,
  Sparkles,
  Info,
  HeartHandshake,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { useStore } from '../hooks/useStore';

export default function MedicinesPanel({ onOpenUpload }) {
  const { report, setActiveTab, sendMessage } = useStore();
  const [search, setSearch] = useState('');

  const medicines = report?.medicines || [];

  if (!report || !report.tests) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 mb-5 shadow-2xl">
          <Pill className="w-10 h-10 text-emerald-500/40" />
        </div>
        <h3 className="text-xl font-bold text-white tracking-tight">No Prescription Loaded</h3>
        <p className="text-sm text-slate-400 max-w-md mt-2 leading-relaxed">
          Upload a doctor's prescription or a diagnostic report mentioning prescribed medications to see general drug indications, side effects, and timing.
        </p>
        <button
          onClick={onOpenUpload}
          className="mt-6 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold text-sm shadow-lg shadow-emerald-500/25 hover:from-emerald-400 hover:to-teal-500 transition-all active:scale-95"
        >
          Load Report or Prescription
        </button>
      </div>
    );
  }

  const filteredMeds = medicines.filter((m) =>
    m.name?.toLowerCase().includes(search.toLowerCase()) ||
    m.purpose?.toLowerCase().includes(search.toLowerCase())
  );

  const handleAskAboutMed = (medName) => {
    setActiveTab('chat');
    sendMessage(`Can you explain more about ${medName}, including why it was prescribed with my test results and any precautions?`);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="p-7 rounded-3xl glass-card relative overflow-hidden flex flex-wrap items-center justify-between gap-6 border-emerald-500/30">
        <div className="space-y-1.5 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold">
            <Pill className="w-3.5 h-3.5" />
            Prescription Drug Intelligence
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            Prescribed Medications & Regimen
          </h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            General pharmacology education explaining the therapeutic purpose, documented common side effects, and timing for identified medications.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-700/80 text-center">
            <span className="block text-2xl font-black text-emerald-400 font-mono">
              {medicines.length}
            </span>
            <span className="text-[11px] font-semibold text-slate-400">Identified Drugs</span>
          </div>
        </div>
      </div>

      {/* Safety Notice Warning Box */}
      <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/40 shadow-lg shadow-amber-950/20 flex items-start gap-3.5 backdrop-blur-xl">
        <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 mt-0.5 border border-amber-500/30 flex-shrink-0">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <div className="text-xs text-amber-200/90 leading-relaxed">
          <strong className="text-white block font-semibold mb-0.5">
            Critical Clinical Safety Warning:
          </strong>
          MediLens provides general drug education only. <strong>Never stop taking, modify dosage, or substitute any medication</strong> without direct consultation and written approval from your prescribing doctor or licensed pharmacist.
        </div>
      </div>

      {/* Search Bar */}
      {medicines.length > 2 && (
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search medications by name or health purpose..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl glass-input text-xs text-white placeholder-slate-400"
          />
        </div>
      )}

      {/* Medications Grid */}
      {medicines.length === 0 ? (
        <div className="p-10 rounded-3xl glass-card text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-800 flex items-center justify-center text-slate-500">
            <Info className="w-6 h-6" />
          </div>
          <h4 className="text-base font-bold text-white">No Prescribed Drugs Identified</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            This document appears to be a diagnostic lab panel without explicit medication orders. You can ask the AI assistant directly in the chat tab about any drug.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredMeds.map((med, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="p-6 rounded-3xl glass-card glass-card-hover border-slate-700/80 flex flex-col justify-between space-y-4 group"
            >
              <div>
                {/* Drug Title Bar */}
                <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                      <Pill className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white tracking-tight">
                        {med.name}
                      </h3>
                      <span className="text-[10px] font-mono text-emerald-400 font-semibold uppercase tracking-wider">
                        Rx Prescribed Drug
                      </span>
                    </div>
                  </div>
                </div>

                {/* Details Sections */}
                <div className="space-y-3.5 pt-3.5 text-xs">
                  {/* Purpose */}
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5 mb-1">
                      <Sparkles className="w-3 h-3 text-cyan-400" />
                      Therapeutic Indication
                    </span>
                    <p className="text-slate-200 leading-relaxed font-medium bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
                      {med.purpose || 'Prescribed medication. Consult your physician for specific indications.'}
                    </p>
                  </div>

                  {/* Side Effects */}
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5 mb-1">
                      <AlertCircle className="w-3 h-3 text-amber-400" />
                      Documented Common Side Effects
                    </span>
                    <p className="text-slate-300 leading-relaxed bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
                      {med.side_effects || 'Generally well-tolerated. Report any unusual symptoms to your doctor.'}
                    </p>
                  </div>

                  {/* Timing */}
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5 mb-1">
                      <Clock className="w-3 h-3 text-emerald-400" />
                      Prescribed Timing & Administration
                    </span>
                    <p className="text-slate-300 font-mono bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80 flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      <span>{med.timing || 'Take strictly as instructed by your doctor.'}</span>
                    </p>
                  </div>

                  {/* Official Authorities: CDSCO / Jan Aushadhi (India) + NIH RxNorm + openFDA */}
                  {(med.rxnorm || med.fda_meta || med.cdsco_india) && (
                    <div className="pt-2 border-t border-slate-800/60 space-y-2">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Verified Health Authorities & Indian Formularies:</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {med.cdsco_india && (
                          <a
                            href={med.cdsco_india.janaushadhi_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-300 hover:text-amber-200 bg-amber-950/60 hover:bg-amber-900/60 border border-amber-500/40 px-2.5 py-1 rounded-lg transition-colors"
                          >
                            <span>Jan Aushadhi / CDSCO ({med.cdsco_india.schedule.split(' ')[0]})</span>
                            <ExternalLink className="w-3 h-3 text-amber-400/80" />
                          </a>
                        )}
                        {med.rxnorm && (
                          <a
                            href={med.rxnorm.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-300 hover:text-emerald-200 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/40 px-2.5 py-1 rounded-lg transition-colors"
                          >
                            <span>NIH RxNorm {med.rxnorm.rxcui ? `(${med.rxnorm.rxcui})` : ''}</span>
                            <ExternalLink className="w-3 h-3 text-emerald-400/80" />
                          </a>
                        )}
                        {med.fda_meta && (
                          <a
                            href={med.fda_meta.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-300 hover:text-cyan-200 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-500/40 px-2.5 py-1 rounded-lg transition-colors"
                          >
                            <span>US FDA Drug Label</span>
                            <ExternalLink className="w-3 h-3 text-cyan-400/80" />
                          </a>
                        )}
                      </div>
                      {med.cdsco_india && (
                        <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200 leading-snug">
                          <span className="font-bold text-amber-300">Indian Regulatory Status: </span>
                          {med.cdsco_india.nlem_status} · {med.cdsco_india.price_control}
                        </div>
                      )}
                      {med.fda_meta?.boxed_warning && (
                        <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-200 leading-snug">
                          <span className="font-bold text-rose-300">FDA Boxed Warning Note: </span>
                          {med.fda_meta.boxed_warning}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Card Footer Quick Action */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-medium">Have questions?</span>
                <button
                  onClick={() => handleAskAboutMed(med.name)}
                  className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform"
                >
                  <span>Ask AI about {med.name.split(' ')[0]}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
