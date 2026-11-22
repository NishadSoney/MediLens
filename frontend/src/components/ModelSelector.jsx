import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronDown, 
  Cpu, 
  Sparkles, 
  Zap, 
  Check, 
  Server, 
  Layers, 
  ShieldCheck, 
  AlertCircle 
} from 'lucide-react';
import { useStore } from '../hooks/useStore';
import api from '../api/client';

export default function ModelSelector() {
  const { models, setModels, selectedModel, setSelectedModel } = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Fetch registered models on mount
  useEffect(() => {
    async function loadModels() {
      try {
        const data = await api.getModels();
        if (data.models && data.models.length > 0) {
          setModels(data.models);
          // If selected model is unavailable, prefer backend default ('gemini') or first available model
          const available = data.models.filter((m) => m.available);
          if (available.length > 0 && !data.models.find(m => m.id === selectedModel)?.available) {
            const preferred = available.find((m) => m.id === (data.default || 'gemini')) || available[0];
            setSelectedModel(preferred.id);
          }
        }
      } catch (err) {
        console.error('Error loading models:', err);
      }
    }
    loadModels();
  }, [setModels, selectedModel, setSelectedModel]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const current = models.find((m) => m.id === selectedModel) || {
    id: selectedModel,
    display_name: 'Llama 3.1 (8B)',
    provider: 'ollama',
    color: '#8B5CF6',
    type: 'local',
  };

  const getModelIcon = (provider) => {
    switch (provider) {
      case 'google':
        return <Sparkles className="w-4 h-4 text-blue-400" />;
      case 'groq':
        return <Zap className="w-4 h-4 text-orange-400" />;
      case 'ollama':
      default:
        return <Cpu className="w-4 h-4 text-purple-400" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Dropdown Toggle Pill */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-3.5 py-2 rounded-xl bg-[#0e172a]/90 hover:bg-slate-800/90 border border-slate-700/75 hover:border-cyan-500/40 shadow-md backdrop-blur-xl transition-all duration-200 group text-left"
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-2.5 h-2.5 rounded-full ring-4 ring-opacity-20 animate-pulse"
            style={{ 
              backgroundColor: current.color || '#06b6d4',
              boxShadow: `0 0 10px ${current.color || '#06b6d4'}`
            }}
          />
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-100 tracking-tight">
                {current.display_name}
              </span>
              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                current.type === 'local' 
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' 
                  : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
              }`}>
                {current.type === 'local' ? 'LOCAL' : 'CLOUD'}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              Active LLM Engine
            </span>
          </div>
        </div>

        <ChevronDown
          className={`w-4 h-4 text-slate-400 group-hover:text-slate-200 transition-transform duration-200 ml-1 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Model Selection Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 mt-2 w-80 rounded-2xl bg-slate-900/95 border border-slate-700/90 shadow-2xl backdrop-blur-2xl p-2 z-50 overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-slate-800/80 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Select AI Reasoning Model
                </span>
                <p className="text-[11px] text-slate-400">4-Model Hybrid Ensemble</p>
              </div>
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded-full border border-cyan-800">
                Live Switch
              </span>
            </div>

            <div className="py-1.5 space-y-1">
              {models.map((model) => {
                const isSelected = model.id === selectedModel;
                const isLocal = model.type === 'local';

                return (
                  <button
                    key={model.id}
                    disabled={!model.available}
                    onClick={() => {
                      setSelectedModel(model.id);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-start gap-3 p-2.5 rounded-xl text-left transition-all duration-150 ${
                      isSelected
                        ? 'bg-cyan-500/15 border border-cyan-500/40 text-white'
                        : model.available
                        ? 'hover:bg-slate-800/70 border border-transparent text-slate-200'
                        : 'opacity-40 cursor-not-allowed border border-transparent text-slate-400'
                    }`}
                  >
                    <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700/50 mt-0.5">
                      {getModelIcon(model.provider)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold truncate">
                          {model.display_name}
                        </span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                              isLocal
                                ? 'bg-purple-950/60 text-purple-300 border-purple-700/50'
                                : 'bg-blue-950/60 text-blue-300 border-blue-700/50'
                            }`}
                          >
                            {isLocal ? 'OLLAMA' : 'API'}
                          </span>
                          {model.available ? (
                            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                          )}
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-400 mt-0.5 leading-snug line-clamp-1">
                        {model.description}
                      </p>
                    </div>

                    {isSelected && (
                      <Check className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-1 stroke-[3]" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="p-2.5 mt-1 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-purple-400" />
                Local Ollama: 127.0.0.1:11434
              </span>
              <span className="text-emerald-400 font-semibold">Active</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
