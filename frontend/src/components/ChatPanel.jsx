import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Send, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  Sparkles, 
  Bot, 
  User, 
  Loader2, 
  ShieldAlert, 
  HelpCircle, 
  Stethoscope, 
  Pill, 
  AlertTriangle,
  Square,
  X,
  Check,
  Radio,
  Activity,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useStore } from '../hooks/useStore';
import api from '../api/client';
import voiceEngine from '../utils/voiceEngine';

// Helper: Encode raw Float32 PCM samples into a standard 16-bit PCM WAV Blob
function encodeWAV(samples, sampleRate = 16000) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeString(offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  // RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // SubChunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, 1, true); // NumChannels (1 = mono)
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * 2, true); // ByteRate (SampleRate * 2 * 1)
  view.setUint16(32, 2, true); // BlockAlign (NumChannels * 2)
  view.setUint16(34, 16, true); // BitsPerSample (16 bits)
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true); // SubChunk2Size

  // Write PCM samples (clamped to 16-bit signed integer)
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([view], { type: 'audio/wav' });
}

export default function ChatPanel() {
  const { 
    messages, 
    report, 
    selectedModel, 
    audioEnabled, 
    setAudioEnabled,
    isChatLoading,
    sendMessage 
  } = useStore();

  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribingAudio, setIsTranscribingAudio] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [micVolume, setMicVolume] = useState(0); // 0 to 100
  const [voiceDetected, setVoiceDetected] = useState(false);
  const [speakingKey, setSpeakingKey] = useState(null);

  const messagesEndRef = useRef(null);
  const audioRef = useRef(null);

  // Sync live speaking status with centralized voiceEngine
  useEffect(() => {
    const unsub = voiceEngine.subscribe(({ isSpeaking, activeKey }) => {
      setSpeakingKey(isSpeaking ? activeKey : null);
    });
    return unsub;
  }, []);
  
  // Audio capture & VAD refs
  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const audioChunksRef = useRef([]);
  const sampleRateRef = useRef(16000);
  const confidenceRef = useRef(0);
  const hasSpokenRef = useRef(false);
  const lastVoiceTimeRef = useRef(0);
  const silenceTimerRef = useRef(null);
  const maxTimerRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const recognitionRef = useRef(null);
  const currentTranscriptRef = useRef('');

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isChatLoading, liveTranscript]);

  // Clear any stale voice cache on mount & clean up all resources on unmount
  useEffect(() => {
    voiceEngine.clearCache();
    return () => {
      stopRecordingCleanup();
      voiceEngine.stopAndReset();
    };
  }, []);

  // Immediately mute and stop ongoing AI audio whenever audioEnabled is turned off
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = !audioEnabled;
      if (!audioEnabled) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    }
  }, [audioEnabled]);

  const stopRecordingCleanup = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    // Stop Web Speech Recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.stop();
      } catch (e) {
        // Ignore
      }
      recognitionRef.current = null;
    }

    // Disconnect Web Audio processor
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch (e) {
        // Ignore
      }
      processorRef.current = null;
    }

    // Stop MediaStream tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    // Close AudioContext
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch (e) {
        // Ignore
      }
      audioContextRef.current = null;
    }
  };

  const handleSend = useCallback((messageText = null) => {
    const textToSend = messageText || input;
    if (!textToSend || !textToSend.trim() || isChatLoading) return;
    setInput('');
    setLiveTranscript('');
    sendMessage(textToSend.trim());
  }, [input, isChatLoading, sendMessage]);

  // Main Stop & Process logic: Accurate multilingual STT + complete voice buffer reset
  const stopAndSubmit = useCallback(async () => {
    // Snapshot current turn's voice data, then IMMEDIATELY wipe all buffers so no cache leaks!
    const chunks = [...audioChunksRef.current];
    const actualSampleRate = sampleRateRef.current || 16000;
    const speechText = (currentTranscriptRef.current || liveTranscript || '').trim();
    const speechConfidence = confidenceRef.current || 0;
    const hadVoice = hasSpokenRef.current;

    audioChunksRef.current = [];
    currentTranscriptRef.current = '';
    confidenceRef.current = 0;
    hasSpokenRef.current = false;

    stopRecordingCleanup();
    setIsRecording(false);
    setRecordingSeconds(0);
    setMicVolume(0);
    setVoiceDetected(false);
    setLiveTranscript('');

    // Strategy 1: If browser SpeechRecognition captured clear high-confidence text, submit instantaneously!
    if (speechText && (speechConfidence >= 0.65 || chunks.length === 0)) {
      setInput('');
      toast.success('Voice recognized!', { icon: '🎙️' });
      sendMessage(speechText);
      return;
    }

    // Strategy 2: Accurate multilingual backend transcription (Groq Whisper auto-detects 99+ languages)
    if (chunks.length > 0 && hadVoice) {
      try {
        setIsTranscribingAudio(true);
        toast.loading('Transcribing voice accurately...', { id: 'stt-proc' });

        let totalLength = 0;
        for (const c of chunks) totalLength += c.length;
        const merged = new Float32Array(totalLength);
        let offset = 0;
        for (const c of chunks) {
          merged.set(c, offset);
          offset += c.length;
        }

        // Encode with the TRUE hardware sampleRate (fixes 48kHz vs 16kHz pitch distortion!)
        const wavBlob = encodeWAV(merged, actualSampleRate);
        const res = await api.transcribe(wavBlob, 'auto');
        toast.dismiss('stt-proc');

        const finalText = (res.text || speechText || '').trim();
        if (finalText) {
          setInput('');
          toast.success('Transcribed: ' + finalText.slice(0, 42) + (finalText.length > 42 ? '...' : ''), { icon: '✨' });
          sendMessage(finalText);
        } else {
          toast.error('Could not transcribe audio. Please speak clearly or type your query.', { id: 'stt-proc' });
        }
      } catch (err) {
        console.error('Backend transcription error:', err);
        toast.dismiss('stt-proc');
        if (speechText) {
          setInput('');
          sendMessage(speechText);
        } else {
          toast.error('Voice transcription failed. Please type your question.');
        }
      } finally {
        setIsTranscribingAudio(false);
      }
      return;
    }

    if (speechText) {
      setInput('');
      sendMessage(speechText);
      return;
    }

    toast('No speech detected. Check that your microphone is unmuted.', { icon: 'ℹ️' });
  }, [liveTranscript, sendMessage]);

  const cancelRecording = () => {
    stopRecordingCleanup();
    setIsRecording(false);
    setRecordingSeconds(0);
    setLiveTranscript('');
    setMicVolume(0);
    setVoiceDetected(false);
    currentTranscriptRef.current = '';
    audioChunksRef.current = [];
    hasSpokenRef.current = false;
    toast('Voice recording cancelled', { icon: '❌' });
  };

  // Start dual-engine recording (clears previous voice cache & stops any AI speech first)
  const startRecording = async () => {
    try {
      // 0. Stop any ongoing AI speech & wipe previous voice turn buffers so mic never picks up echo/cache
      voiceEngine.stopAndReset();
      audioChunksRef.current = [];
      currentTranscriptRef.current = '';
      confidenceRef.current = 0;
      hasSpokenRef.current = false;
      setLiveTranscript('');
      setInput('');

      // 1. Capture microphone audio stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      // 2. Setup Web Audio API & record TRUE hardware sampleRate for distortion-free WAV encoding
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;
      sampleRateRef.current = audioCtx.sampleRate || 16000;
      const source = audioCtx.createMediaStreamSource(stream);

      // ScriptProcessorNode to read raw PCM audio samples
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      lastVoiceTimeRef.current = Date.now();

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        audioChunksRef.current.push(new Float32Array(inputData));

        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        const normalizedVol = Math.min(100, Math.round(rms * 400));
        setMicVolume(normalizedVol);

        if (rms > 0.015) {
          hasSpokenRef.current = true;
          lastVoiceTimeRef.current = Date.now();
          setVoiceDetected(true);

          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        } else if (hasSpokenRef.current) {
          const silenceDuration = Date.now() - lastVoiceTimeRef.current;
          // Fast 1.25s silence cutoff after speech for snappy conversational turn-taking
          if (silenceDuration >= 1250 && !silenceTimerRef.current) {
            silenceTimerRef.current = setTimeout(() => {
              stopAndSubmit();
            }, 100);
          }
        }
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

      // 3. Parallel Web Speech API (instant streaming transcript + confidence tracking)
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.maxAlternatives = 1;
          recognition.lang = navigator.language || 'en-IN';

          recognition.onresult = (event) => {
            hasSpokenRef.current = true;
            lastVoiceTimeRef.current = Date.now();

            let interim = '';
            let final = '';
            let bestConf = confidenceRef.current;
            for (let i = 0; i < event.results.length; i++) {
              const alt = event.results[i][0];
              const chunk = alt.transcript;
              if (typeof alt.confidence === 'number' && alt.confidence > 0) {
                bestConf = alt.confidence;
              }
              if (event.results[i].isFinal) {
                final += chunk + ' ';
              } else {
                interim += chunk;
              }
            }

            const fullText = (final + interim).trim();
            if (fullText) {
              currentTranscriptRef.current = fullText;
              confidenceRef.current = bestConf;
              setLiveTranscript(fullText);
              setInput(fullText);
            }
          };

          recognition.onerror = (e) => {
            // Ignore no-speech; backend audio buffer will transcribe if speech API fails
            console.warn('SpeechRecognition notice:', e.error);
          };

          recognition.start();
          recognitionRef.current = recognition;
        } catch (e) {
          console.warn('Web Speech API initialization warning:', e);
        }
      }

      // 4. Update UI State & Timers
      currentTranscriptRef.current = '';
      setLiveTranscript('');
      setRecordingSeconds(0);
      setIsRecording(true);

      // Elapsed seconds counter
      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);

      // Max recording duration: 30 seconds
      maxTimerRef.current = setTimeout(() => {
        toast('Max recording time reached (30s). Processing...', { icon: '⏱️' });
        stopAndSubmit();
      }, 30000);

      toast('Microphone listening! Speak now...', { icon: '🎙️' });
    } catch (err) {
      console.error('Mic access error:', err);
      toast.error('Could not access microphone. Please check browser permissions.');
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopAndSubmit();
    } else {
      startRecording();
    }
  };

  const playTTS = async (text, msgKey) => {
    // Clicking Stop while this exact message is playing stops & resets immediately
    if (speakingKey === msgKey) {
      voiceEngine.stopAndReset();
      return;
    }
    // Explicitly clicking "Speak" unmutes audio if muted so the AI speaks immediately
    if (!useStore.getState().audioEnabled) {
      setAudioEnabled(true);
    }
    await voiceEngine.speak(text, {
      key: msgKey,
      checkEnabled: () => useStore.getState().audioEnabled,
    });
  };

  const quickPrompts = [
    { label: 'Explain my report', prompt: 'Please explain my lab report results in simple, calm words.' },
    { label: 'Abnormal findings', prompt: 'Which of my test results are outside the standard range and why?' },
    { label: 'Doctor questions', prompt: 'What key questions should I prepare to ask my doctor during my visit?' },
    { label: 'Medications info', prompt: 'Can you tell me about the prescribed medications and common side effects?' },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] max-w-5xl mx-auto rounded-3xl glass-card overflow-hidden border border-slate-700/80 shadow-2xl">
      {/* Hidden audio element for TTS */}
      <audio ref={audioRef} id="medilens-tts-audio" muted={!audioEnabled} className="hidden" />

      {/* Chat Header Bar */}
      <div className="p-4 px-6 border-b border-slate-800/80 bg-slate-900/80 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-tight">MediLens AI Clinical Assistant</h3>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                Agent Swarm
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Plain-language medical consultation coach & report explainer
            </p>
          </div>
        </div>

        {/* Controls: Audio Mute */}
        <div className="flex items-center gap-3">
          {/* Voice Reply Toggle */}
          <button
            onClick={() => setAudioEnabled(!audioEnabled)}
            className={`p-2 rounded-xl border transition-colors ${
              audioEnabled
                ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30 shadow-sm hover:bg-cyan-500/25'
                : 'bg-rose-500/15 text-rose-400 border-rose-500/30 shadow-sm hover:bg-rose-500/25'
            }`}
            title={audioEnabled ? 'Mute AI voice playback (stops current audio)' : 'Unmute AI voice playback'}
          >
            {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        <AnimatePresence initial={false}>
          {messages.map((msg, index) => {
            const isUser = msg.role === 'user';
            const isEmergency = msg.intent === 'emergency' || msg.content.includes('⚠️');

            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-3.5 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-2xl rounded-2xl p-4 text-xs leading-relaxed shadow-lg ${
                    isUser
                      ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-br-sm'
                      : isEmergency
                      ? 'bg-rose-950/80 border border-rose-500/50 text-rose-100 rounded-bl-sm shadow-rose-950/50'
                      : 'bg-slate-900/90 border border-slate-700/70 text-slate-200 rounded-bl-sm'
                  }`}
                >
                  {/* Assistant response header */}
                  {!isUser && (
                    <div className="flex items-center justify-between gap-4 pb-2 mb-2 border-b border-white/10 text-[10px] text-slate-400 font-mono">
                      <span className="flex items-center gap-1.5 font-semibold text-cyan-400">
                        <Sparkles className="w-3 h-3" />
                        MediLens AI
                        {msg.model && (
                          <span className="text-slate-400 font-normal">
                            ({msg.model})
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-2.5">
                        <span>{msg.timestamp}</span>
                        <button
                          type="button"
                          onClick={() => playTTS(msg.content, `msg-${index}`)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-sans font-semibold border transition-all cursor-pointer active:scale-95 ${
                            speakingKey === `msg-${index}`
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/45 hover:bg-rose-500/30 shadow-[0_0_10px_rgba(244,63,94,0.25)]'
                              : 'bg-cyan-500/12 text-cyan-300 border-cyan-500/35 hover:bg-cyan-500/25 hover:text-cyan-200'
                          }`}
                          title={
                            speakingKey === `msg-${index}`
                              ? 'Stop speaking & reset'
                              : 'Speak entire message aloud'
                          }
                        >
                          {speakingKey === `msg-${index}` ? (
                            <>
                              <VolumeX className="w-3 h-3 animate-pulse" />
                              <span>Stop</span>
                            </>
                          ) : (
                            <>
                              <Volume2 className="w-3 h-3" />
                              <span>Speak</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Message body */}
                  <div className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed">
                    {msg.content}
                  </div>

                  {/* RAG Grounded Sources (when Retriever returned citations) */}
                  {!isUser && Array.isArray(msg.sources) && msg.sources.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-white/10 space-y-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-400/90 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                        RAG Grounded Sources ({msg.sources.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.sources.slice(0, 5).map((src, sIdx) => {
                          const isPubMed = src.type === 'pubmed_live' || !!src.url;
                          const isReport = src.type === 'report_chunk';
                          return isPubMed ? (
                            <a
                              key={sIdx}
                              href={src.url || `https://pubmed.ncbi.nlm.nih.gov/${src.pmid || ''}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`${src.title} — ${src.source}`}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold border bg-emerald-500/15 text-emerald-200 border-emerald-500/35 hover:bg-emerald-500/25 hover:text-emerald-100 transition-colors"
                            >
                              <ShieldCheck className="w-3 h-3 text-emerald-400" />
                              <span className="truncate max-w-[210px]">{src.title}</span>
                              <ExternalLink className="w-2.5 h-2.5 text-emerald-400/80" />
                            </a>
                          ) : (
                            <span
                              key={sIdx}
                              title={`${src.source} (${Math.round((src.score || 0) * 100)}% relevance)`}
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-medium border ${
                                isReport
                                  ? 'bg-violet-500/15 text-violet-200 border-violet-500/30'
                                  : 'bg-cyan-500/10 text-cyan-200 border-cyan-500/30'
                              }`}
                            >
                              <span className="truncate max-w-[200px]">{src.title}</span>
                              <span className="font-mono text-[9px] opacity-75">
                                {Math.round((src.score || 0) * 100)}%
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {isUser && (
                  <div className="w-8 h-8 rounded-lg bg-blue-600/30 border border-blue-500/40 text-blue-300 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </motion.div>
            );
          })}

          {(isChatLoading || isTranscribingAudio) && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 text-slate-400 text-xs"
            >
              <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 flex items-center justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
              <span className="font-mono">
                {isTranscribingAudio 
                  ? 'Transcribing your audio input with speech engine...' 
                  : `Retrieving clinical RAG context & consulting ${selectedModel}...`}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Prompt Chips */}
      {report && !isRecording && (
        <div className="px-6 py-2.5 bg-slate-900/60 border-t border-slate-800/80 flex items-center gap-2 overflow-x-auto">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0">
            Suggested:
          </span>
          {quickPrompts.map((item, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(item.prompt)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 whitespace-nowrap transition-colors flex items-center gap-1.5 flex-shrink-0"
            >
              <Sparkles className="w-3 h-3 text-cyan-400" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* UNMISTAKABLE STUDIO RECORDING BANNER & REAL-TIME AUDIO VISUALIZER */}
      <AnimatePresence>
        {isRecording && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="p-4 px-6 bg-gradient-to-r from-rose-950/95 via-slate-900/95 to-slate-900/95 border-t-2 border-rose-500 shadow-2xl backdrop-blur-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden"
          >
            {/* Ambient Red Glow */}
            <div className="absolute top-0 left-0 w-48 h-full bg-rose-500/15 blur-2xl pointer-events-none" />

            <div className="flex items-center gap-4 min-w-0 flex-1">
              {/* Pulsing Recording Pill */}
              <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-rose-500/25 border border-rose-500/50 text-rose-200 text-xs font-extrabold tracking-wider uppercase flex-shrink-0 shadow-lg shadow-rose-950">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                </span>
                <span>REC</span>
                <span className="font-mono text-white text-xs">
                  0:{recordingSeconds < 10 ? `0${recordingSeconds}` : recordingSeconds}
                </span>
              </div>

              {/* Dynamic Sound Wave Volume Bars */}
              <div className="flex items-center gap-1 h-7 px-2 bg-slate-950/60 rounded-xl border border-slate-800 flex-shrink-0">
                {[0.4, 0.7, 1.0, 0.8, 1.2, 0.6, 0.3].map((factor, i) => {
                  const barHeight = Math.max(15, Math.min(100, micVolume * factor));
                  return (
                    <motion.div
                      key={i}
                      className={`w-1 rounded-full transition-all duration-75 ${
                        barHeight > 30 ? 'bg-gradient-to-t from-rose-500 to-cyan-400' : 'bg-slate-700'
                      }`}
                      style={{ height: `${barHeight}%` }}
                    />
                  );
                })}
              </div>

              {/* Live Status & Audio Meter */}
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.2 rounded ${
                    micVolume > 8 
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}>
                    {micVolume > 8 ? 'Voice Detected' : 'Listening for Voice...'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Input: {micVolume}%
                  </span>
                </div>

                <p className="text-xs font-medium text-slate-200 truncate">
                  {liveTranscript ? (
                    <span className="text-cyan-200 font-semibold">"{liveTranscript}"</span>
                  ) : (
                    <span className="text-slate-400 italic">
                      Speak your question into your microphone (auto-stops on 2s pause)...
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Stop & Cancel Controls */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={stopAndSubmit}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white text-xs font-bold shadow-lg shadow-rose-600/40 flex items-center gap-1.5 active:scale-95 transition-all"
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>Stop & Send</span>
              </button>

              <button
                type="button"
                onClick={cancelRecording}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                title="Cancel voice recording"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input Form Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (isRecording) {
            stopAndSubmit();
          } else {
            handleSend();
          }
        }}
        className={`p-4 px-6 bg-slate-900 border-t border-slate-800 flex items-center gap-3 transition-all duration-200 ${
          isRecording ? 'ring-2 ring-rose-500/60 shadow-[0_0_30px_rgba(244,63,94,0.3)] bg-slate-900/90' : ''
        }`}
      >
        {/* Voice Dictation Button */}
        <button
          type="button"
          onClick={toggleRecording}
          disabled={isChatLoading || isTranscribingAudio}
          className={`p-3 rounded-xl border transition-all duration-200 relative group ${
            isRecording
              ? 'bg-rose-500 text-white border-rose-400 shadow-lg shadow-rose-500/50 scale-105'
              : 'bg-slate-800 text-slate-300 hover:text-white border-slate-700 hover:border-cyan-500/50 hover:bg-slate-700'
          }`}
          title={isRecording ? 'Click to Stop & Send' : 'Click to speak in any language'}
        >
          {isRecording ? (
            <>
              <Square className="w-5 h-5 fill-current" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-white rounded-full animate-ping" />
            </>
          ) : (
            <Mic className="w-5 h-5 text-cyan-400 group-hover:scale-110 transition-transform" />
          )}
        </button>

        {/* Text Input with Live Sync */}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            isRecording
              ? 'Listening to your voice... (auto-sends on pause)'
              : 'Ask anything about your report in any language...'
          }
          disabled={isChatLoading || isTranscribingAudio}
          className={`flex-1 px-4 py-3 rounded-xl glass-input text-sm text-white placeholder-slate-400 focus:outline-none transition-all ${
            isRecording ? 'border-rose-500/40 bg-slate-900/90 text-cyan-200' : ''
          }`}
        />

        {/* Send Button */}
        <button
          type="submit"
          disabled={(!input.trim() && !isRecording) || isChatLoading || isTranscribingAudio}
          className="p-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold shadow-lg shadow-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {isTranscribingAudio ? (
            <Loader2 className="w-5 h-5 animate-spin text-white" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </form>
    </div>
  );
}
