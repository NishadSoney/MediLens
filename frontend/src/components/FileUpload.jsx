import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  UploadCloud, 
  FileText, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  X,
  FileCheck2,
  FileCode,
  FileSpreadsheet
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useStore } from '../hooks/useStore';
import api from '../api/client';

export default function FileUpload({ isOpen, onClose }) {
  const { setReport, addMessage, setActiveTab, selectedModel, sessionId, setIsAnalyzing, isAnalyzing } = useStore();
  const [selectedFile, setSelectedFile] = useState(null);

  const onDrop = useCallback((acceptedFiles, fileRejections) => {
    if (fileRejections.length > 0) {
      toast.error('Please upload a PDF, PNG, JPG, or TXT document under 10MB.');
      return;
    }
    if (acceptedFiles.length > 0) {
      setSelectedFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
      'text/plain': ['.txt'],
    },
    maxFiles: 1,
    maxSize: 15 * 1024 * 1024,
  });

  const handleAnalyze = async (useSample = false) => {
    try {
      setIsAnalyzing(true);
      const loadingToast = toast.loading(
        useSample ? 'Loading clinical sample report...' : 'Agent swarm extracting & flagging lab report...'
      );

      let data;
      if (useSample) {
        data = await api.loadSample(sessionId, selectedModel);
      } else {
        if (!selectedFile) {
          toast.dismiss(loadingToast);
          toast.error('Please drop or select a file first.');
          setIsAnalyzing(false);
          return;
        }
        data = await api.analyzeReport(selectedFile, sessionId, selectedModel);
      }

      toast.dismiss(loadingToast);
      setReport(data.report, data.stats);

      if (data.message) {
        addMessage({
          role: 'assistant',
          content: data.message,
          model: selectedModel,
        });
      }

      toast.success(
        `Analysis complete! Identified ${data.stats?.total || 0} tests (${data.stats?.abnormal || 0} flagged).`
      );
      setIsAnalyzing(false);
      setSelectedFile(null);
      setActiveTab('report');
      if (onClose) onClose();
    } catch (err) {
      console.error('Analysis error:', err);
      toast.error(err.message || 'Failed to process report. Falling back to offline engine.');
      setIsAnalyzing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-xl rounded-3xl bg-slate-900/90 border border-slate-700/80 p-7 shadow-2xl backdrop-blur-2xl relative overflow-hidden"
      >
        {/* Glow backdrop */}
        <div className="absolute -top-24 -right-24 w-60 h-60 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-60 h-60 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-5 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2.5">
              <UploadCloud className="w-5 h-5 text-cyan-400" />
              Upload Medical Document
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Supports blood test reports, urine panels, metabolic panels, or doctor prescriptions
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              disabled={isAnalyzing}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Dropzone Area */}
        <div className="mt-5 space-y-4">
          <div
            {...getRootProps()}
            className={`relative p-8 rounded-2xl border-2 border-dashed transition-all duration-200 text-center cursor-pointer ${
              isDragActive
                ? 'border-cyan-400 bg-cyan-500/10 scale-[1.01]'
                : selectedFile
                ? 'border-emerald-500/50 bg-emerald-500/5'
                : 'border-slate-700 hover:border-slate-500 bg-slate-950/40 hover:bg-slate-800/20'
            }`}
          >
            <input {...getInputProps()} />

            {selectedFile ? (
              <div className="space-y-3">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                  <FileCheck2 className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-200 truncate max-w-sm mx-auto">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB • Ready for clinical parser
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                  }}
                  className="text-xs text-rose-400 hover:text-rose-300 font-medium underline"
                >
                  Choose another file
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center border border-cyan-500/20">
                  <UploadCloud className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-200">
                    Drag & drop your medical report here
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    or click to browse from your computer
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 pt-2">
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                    PDF (Digital / Scanned)
                  </span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                    PNG / JPG
                  </span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                    TXT
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => handleAnalyze(false)}
              disabled={!selectedFile || isAnalyzing}
              className={`flex-1 py-3 px-5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-200 shadow-lg ${
                selectedFile && !isAnalyzing
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-cyan-500/25 hover:from-cyan-400 hover:to-blue-500 active:scale-[0.98]'
                  : 'bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700'
              }`}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>Agents Processing Document...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-cyan-200" />
                  <span>Analyse Selected Report</span>
                </>
              )}
            </button>

            <button
              onClick={() => handleAnalyze(true)}
              disabled={isAnalyzing}
              className="py-3 px-4 rounded-xl font-semibold text-sm text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4 text-cyan-400" />
              <span>Try Sample Report</span>
            </button>
          </div>
        </div>

        {/* Security & HIPAA Notice */}
        <p className="text-[11px] text-center text-slate-400 mt-5 leading-relaxed">
          🔒 Private session processing. Files are parsed securely in-memory and not stored permanently.
        </p>
      </motion.div>
    </div>
  );
}
