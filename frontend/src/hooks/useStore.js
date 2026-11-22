import { create } from 'zustand';
import api from '../api/client';
import voiceEngine from '../utils/voiceEngine';

export const useStore = create((set, get) => ({
  // Core state
  report: null,
  stats: null,
  reportHistory: [],
  messages: [
    {
      role: 'assistant',
      content: "Hello! I am MediLens, your clinical health assistant. Upload a lab report or prescription (PDF or image) to get clear, plain-language explanations, prepare questions for your doctor, and learn about your prescribed medicines.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ],
  selectedModel: 'gemini', // Default to Gemini (3.5 Flash) with Groq & Llama fallbacks
  isAnalyzing: false,
  isChatLoading: false,
  models: [],
  activeTab: 'report',
  sessionId: 'session-' + Math.random().toString(36).substring(2, 9),
  audioEnabled: true,
  currentAudioUrl: null,

  // Setters
  setReport: (report, stats = null) => {
    voiceEngine.clearCache();
    set((state) => {
      if (!report) return { report: null, stats: null };
      const entry = {
        id: 'rep-' + Date.now(),
        loadedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        label: report.meta?.lab || 'Diagnostic Report',
        date: report.meta?.date || 'Recent',
        patient: report.meta?.patient || 'Patient',
        report,
        stats,
      };
      const prevHistory = state.reportHistory || [];
      return {
        report,
        stats,
        reportHistory: [entry, ...prevHistory].slice(0, 10),
      };
    });
  },
  addMessage: (message) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...message,
          timestamp: message.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ],
    })),
  setMessages: (messages) => set({ messages }),
  setSelectedModel: (selectedModel) => set({ selectedModel }),
  setIsAnalyzing: (isAnalyzing) => set({ isAnalyzing }),
  setIsChatLoading: (isChatLoading) => set({ isChatLoading }),
  setModels: (models) => set({ models }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setAudioEnabled: (audioEnabled) => {
    // Pressing Mute immediately stops all ongoing speech/audio and fully resets playback to 0
    if (!audioEnabled) {
      voiceEngine.stopAndReset();
    }
    set({ audioEnabled });
  },
  setCurrentAudioUrl: (currentAudioUrl) => set({ currentAudioUrl }),
  resetReport: () => {
    voiceEngine.clearCache();
    set({ report: null, stats: null });
  },

  // Unified Chat Message Dispatcher (callable from ChatPanel, MedicinesPanel, ReportView, etc.)
  sendMessage: async (text) => {
    const { sessionId, selectedModel, isChatLoading, report } = get();
    if (!text || !text.trim() || isChatLoading) return;

    const trimmed = text.trim();
    const userTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 1. Immediately append user message
    set((state) => ({
      isChatLoading: true,
      messages: [
        ...state.messages,
        { role: 'user', content: trimmed, timestamp: userTimestamp },
      ],
    }));

    try {
      // 2. Call FastAPI backend (auto-detects and replies in user's input language)
      const data = await api.chat(trimmed, sessionId, selectedModel, 'auto', report);
      const asstTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // 3. Append assistant response
      set((state) => ({
        isChatLoading: false,
        messages: [
          ...state.messages,
          {
            role: 'assistant',
            content: data.reply,
            model: data.model_used || selectedModel,
            intent: data.intent,
            sources: data.sources || [],
            timestamp: asstTimestamp,
          },
        ],
      }));

      // 4. Full-length human neural voice playback if unmuted
      if (get().audioEnabled && data.reply) {
        const msgKey = `msg-${get().messages.length - 1}`;
        voiceEngine.speak(data.reply, {
          key: msgKey,
          checkEnabled: () => get().audioEnabled,
        });
      }
    } catch (err) {
      console.error('Chat error:', err);
      set((state) => ({
        isChatLoading: false,
        messages: [
          ...state.messages,
          {
            role: 'assistant',
            content: "I'm having trouble connecting to the selected model right now. Please check if your Ollama service is active or select another model above.",
            model: selectedModel,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ],
      }));
    }
  },
}));

export default useStore;
