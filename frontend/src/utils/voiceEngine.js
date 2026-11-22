/**
 * MediLens Fast Natural Human Voice Engine (frontend/src/utils/voiceEngine.js)
 *
 * Optimizations:
 * - Instant 0ms start when clicking "Speak" (skips cancel delay when idle, runs synchronously in user gesture).
 * - Crisp, natural human cadence (`rate = 1.06`) with decimal-safe sequential sentence streaming
 *   so long replies & Detailed Summaries NEVER cut off mid-speech.
 * - Fast 900ms watchdog on remote browser neural voices + session memory so subsequent clicks
 *   never wait twice on a slow remote voice.
 * - Full cache & audio cleanup via `stopAndReset()` and `clearCache()` (wipes blob URLs,
 *   Web Speech queue, DOM <audio> elements, and backend temp TTS files).
 */

import api from '../api/client';

export function detectTextLangTag(text) {
  if (!text) return 'en-US';

  if (/[\u0900-\u097F]{2,}/.test(text)) {
    const marathiHints = ['आहे', 'आहेत', 'नाही', 'काय', 'माझे', 'माझा', 'सांगा', 'माहिती', 'औषध', 'अहवाल', 'डॉक्टरां'];
    return marathiHints.some((w) => text.includes(w)) ? 'mr-IN' : 'hi-IN';
  }
  if (/[\u0B80-\u0BFF]{2,}/.test(text)) return 'ta-IN';
  if (/[\u0C00-\u0C7F]{2,}/.test(text)) return 'te-IN';
  if (/[\u0C80-\u0CFF]{2,}/.test(text)) return 'kn-IN';
  if (/[\u0D00-\u0D7F]{2,}/.test(text)) return 'ml-IN';
  if (/[\u0980-\u09FF]{2,}/.test(text)) return 'bn-IN';
  if (/[\u0A80-\u0AFF]{2,}/.test(text)) return 'gu-IN';
  if (/[\u0A00-\u0A7F]{2,}/.test(text)) return 'pa-IN';
  if (/[\u0600-\u06FF]{2,}/.test(text)) return /[ٹڈڑںےہپچژگ]/.test(text) ? 'ur-PK' : 'ar-SA';
  if (/[\u3040-\u30FF]{2,}/.test(text)) return 'ja-JP';
  if (/[\uAC00-\uD7AF]{2,}/.test(text)) return 'ko-KR';
  if (/[\u4E00-\u9FFF]{2,}/.test(text)) return 'zh-CN';
  if (/[\u0400-\u04FF]{2,}/.test(text)) return 'ru-RU';

  const lower = text.toLowerCase();
  if (/[¿¡ñ]/.test(text) || /\b(potasio|médico|resultados|glucosa|significa|porque)\b/.test(lower)) return 'es-ES';
  if (/\b(bonjour|pourquoi|médecin|résultats|médicament|votre)\b/.test(lower)) return 'fr-FR';
  if (/[ßäöü]/.test(text) || /\b(warum|bedeutet|arzt|ergebnisse|medikament)\b/.test(lower)) return 'de-DE';
  if (/\b(obrigado|médico|resultados|remédio|porque)\b/.test(lower)) return 'pt-BR';
  if (/\b(grazie|perché|risultati|farmaco|medico)\b/.test(lower)) return 'it-IT';

  return 'en-US';
}

export function prepareSpeechText(rawText) {
  if (!rawText) return '';
  return rawText
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[•\-*]\s+/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s*→\s*/g, ', ')
    .replace(/\s*·\s*/g, ', ')
    .replace(/\s*\|\s*/g, ', ')
    .replace(/\bmg\/dL\b/gi, 'milligrams per deciliter')
    .replace(/\bmmol\/L\b/gi, 'millimoles per liter')
    .replace(/\bg\/dL\b/gi, 'grams per deciliter')
    .replace(/\bng\/mL\b/gi, 'nanograms per milliliter')
    .replace(/\bpg\/mL\b/gi, 'picograms per milliliter')
    .replace(/\bmIU\/L\b/gi, 'milli-international units per liter')
    .replace(/([^\.\!\?\।\。\n])\n+/g, '$1. ')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function splitIntoSpeakableChunks(text, maxChunkLen = 200) {
  if (!text) return [];
  const rawParts = text.split(/(?<=[.!?।。])\s+(?![0-9])/);
  const chunks = [];

  for (const part of rawParts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    if (trimmed.length <= maxChunkLen) {
      chunks.push(trimmed);
    } else {
      const subParts = trimmed.split(/(?<=[,;:])\s+/);
      let buffer = '';
      for (const sub of subParts) {
        if ((buffer + ' ' + sub).trim().length <= maxChunkLen) {
          buffer = (buffer + ' ' + sub).trim();
        } else {
          if (buffer) chunks.push(buffer);
          buffer = sub.trim();
        }
      }
      if (buffer) chunks.push(buffer);
    }
  }

  return chunks.length > 0 ? chunks : [text];
}

function scoreVoice(v, langTag) {
  const name = (v.name || '').toLowerCase();
  let score = 0;

  if (name.includes('natural') || name.includes('online')) score += 120;
  if (
    name.includes('ava') ||
    name.includes('aria') ||
    name.includes('jenny') ||
    name.includes('emma') ||
    name.includes('sonia') ||
    name.includes('neerja') ||
    name.includes('swara') ||
    name.includes('aarohi') ||
    name.includes('elvira') ||
    name.includes('denise')
  ) {
    score += 40;
  }
  if (name.includes('google')) score += 95;
  if (name.includes('google uk english female') || name.includes('google us english')) score += 20;
  if (name.includes('samantha') || name.includes('siri') || name.includes('enhanced') || name.includes('premium')) {
    score += 85;
  }
  if (v.lang && v.lang.toLowerCase() === langTag.toLowerCase()) score += 15;
  if (name.includes('zira') || name.includes('hazel') || name.includes('heera')) score += 10;
  if (name.includes('david') || name.includes('mark') || name.includes('espeak')) score -= 20;

  return score;
}

async function getLoadedVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return [];
  let voices = window.speechSynthesis.getVoices() || [];
  if (voices.length > 0) return voices;

  await new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    window.speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 180);
  });

  return window.speechSynthesis.getVoices() || [];
}

function pickVoicesForLanguage(voices, langTag) {
  const baseLang = langTag.split('-')[0].toLowerCase();
  const matching = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith(baseLang));
  matching.sort((a, b) => scoreVoice(b, langTag) - scoreVoice(a, langTag));

  const neuralVoice = matching.find((v) => scoreVoice(v, langTag) >= 80) || null;
  const localVoice =
    matching.find((v) => v.localService) ||
    matching[0] ||
    voices.find((v) => v.localService) ||
    voices[0] ||
    null;

  return { neuralVoice, localVoice };
}

class VoiceEngine {
  constructor() {
    this.sessionId = 0;
    this.isSpeaking = false;
    this.activeKey = null;
    this.abortController = null;
    this.activeAudio = null;
    this.activeBlobUrl = null;
    this.currentUtterance = null;
    this.keepAliveTimer = null;
    this.startWatchdog = null;
    this.remoteVoiceTimedOut = false;
    this.listeners = new Set();

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _notify() {
    for (const fn of this.listeners) {
      try {
        fn({ isSpeaking: this.isSpeaking, activeKey: this.activeKey });
      } catch {
        // Ignore subscriber error
      }
    }
  }

  _clearTimers() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (this.startWatchdog) {
      clearTimeout(this.startWatchdog);
      this.startWatchdog = null;
    }
  }

  /**
   * Immediately stops ALL audio and resets playback to 0.
   */
  stopAndReset() {
    const wasBusy =
      this.isSpeaking ||
      Boolean(this.activeAudio) ||
      (typeof window !== 'undefined' &&
        window.speechSynthesis &&
        (window.speechSynthesis.speaking || window.speechSynthesis.pending));

    this.sessionId += 1;
    this._clearTimers();
    this.currentUtterance = null;

    if (this.abortController) {
      try {
        this.abortController.abort();
      } catch {
        // Ignore
      }
      this.abortController = null;
    }

    if (typeof window !== 'undefined' && window.speechSynthesis && wasBusy) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }

    if (this.activeAudio) {
      try {
        this.activeAudio.onended = null;
        this.activeAudio.onerror = null;
        this.activeAudio.pause();
        this.activeAudio.currentTime = 0;
        this.activeAudio.removeAttribute('src');
        this.activeAudio.load();
      } catch {
        // Ignore
      }
      this.activeAudio = null;
    }

    if (this.activeBlobUrl) {
      try {
        URL.revokeObjectURL(this.activeBlobUrl);
      } catch {
        // Ignore
      }
      this.activeBlobUrl = null;
    }

    if (typeof document !== 'undefined') {
      document.querySelectorAll('audio').forEach((el) => {
        try {
          if (!el.paused || el.src) {
            el.pause();
            el.currentTime = 0;
            el.removeAttribute('src');
            el.load();
          }
        } catch {
          // Ignore
        }
      });
    }

    this.isSpeaking = false;
    this.activeKey = null;
    this._notify();
    return wasBusy;
  }

  /**
   * Clears ALL voice caches (client audio/speech queues + backend temp TTS files from previous conversations).
   */
  clearCache() {
    this.stopAndReset();
    this.remoteVoiceTimedOut = false;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
    api.clearVoiceCache?.().catch(() => {});
  }

  /**
   * Speak the ENTIRE text smoothly and instantaneously without cutting off mid-way.
   */
  async speak(rawText, { key = null, checkEnabled = null } = {}) {
    const cleanText = prepareSpeechText(rawText);
    if (!cleanText) return;

    const wasBusy = this.stopAndReset();

    if (checkEnabled && !checkEnabled()) return;

    const mySession = this.sessionId;
    this.isSpeaking = true;
    this.activeKey = key;
    this._notify();

    // Only wait 45ms if we actually just cancelled active speech (0ms instant start when idle!)
    if (wasBusy) {
      await new Promise((r) => setTimeout(r, 45));
      if (mySession !== this.sessionId || (checkEnabled && !checkEnabled())) return;
    }

    const langTag = detectTextLangTag(cleanText);
    const voices = await getLoadedVoices();
    if (mySession !== this.sessionId || (checkEnabled && !checkEnabled())) return;

    const { neuralVoice, localVoice } = pickVoicesForLanguage(voices, langTag);

    // Tier 1: High-Quality Browser Neural Voice (skip if remote voice previously timed out this session)
    const canTryNeural =
      neuralVoice &&
      (neuralVoice.localService || !this.remoteVoiceTimedOut) &&
      typeof window !== 'undefined' &&
      window.speechSynthesis;

    if (canTryNeural) {
      const ok = await this._speakWithBrowserVoice(cleanText, neuralVoice, langTag, mySession, checkEnabled);
      if (ok || mySession !== this.sessionId) return;
      if (!neuralVoice.localService) {
        this.remoteVoiceTimedOut = true;
      }
    }

    // Tier 2: Fast Local OS Voice (0ms latency!) for English when remote neural timed out,
    // or Backend TTS (/api/speak) for languages without a matching local OS voice
    const hasMatchingLocal =
      localVoice &&
      localVoice.lang &&
      localVoice.lang.toLowerCase().startsWith(langTag.split('-')[0].toLowerCase());

    if (hasMatchingLocal && typeof window !== 'undefined' && window.speechSynthesis) {
      const ok = await this._speakWithBrowserVoice(cleanText, localVoice, langTag, mySession, checkEnabled);
      if (ok || mySession !== this.sessionId) return;
    }

    // Tier 3: Backend Neural / Full-Text TTS (/api/speak)
    if (mySession === this.sessionId && (!checkEnabled || checkEnabled())) {
      const ok = await this._speakWithBackendAudio(cleanText, mySession, checkEnabled);
      if (ok || mySession !== this.sessionId) return;
    }

    // Final safety net: any available OS voice
    if (
      mySession === this.sessionId &&
      (!checkEnabled || checkEnabled()) &&
      localVoice &&
      typeof window !== 'undefined' &&
      window.speechSynthesis
    ) {
      await this._speakWithBrowserVoice(cleanText, localVoice, langTag, mySession, checkEnabled);
    }

    if (mySession === this.sessionId) {
      this.isSpeaking = false;
      this.activeKey = null;
      this._notify();
    }
  }

  _speakWithBrowserVoice(cleanText, voice, langTag, mySession, checkEnabled) {
    return new Promise((resolve) => {
      const chunks = splitIntoSpeakableChunks(cleanText, 200);
      if (!chunks.length) {
        resolve(true);
        return;
      }

      let idx = 0;
      let startedOnce = false;

      this._clearTimers();
      this.keepAliveTimer = setInterval(() => {
        if (mySession !== this.sessionId) {
          this._clearTimers();
          return;
        }
        try {
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }
        } catch {
          // Ignore
        }
      }, 4500);

      const finish = (success) => {
        this._clearTimers();
        this.currentUtterance = null;
        if (success && mySession === this.sessionId) {
          this.isSpeaking = false;
          this.activeKey = null;
          this._notify();
        }
        resolve(success);
      };

      const speakNext = () => {
        if (mySession !== this.sessionId || (checkEnabled && !checkEnabled())) {
          finish(false);
          return;
        }

        if (idx >= chunks.length) {
          finish(true);
          return;
        }

        const utterance = new SpeechSynthesisUtterance(chunks[idx]);
        this.currentUtterance = utterance;
        if (voice) {
          utterance.voice = voice;
          utterance.lang = voice.lang || langTag;
        } else {
          utterance.lang = langTag;
        }
        utterance.rate = 1.06; // Crisp, natural, responsive speaking pace
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        // Fast 900ms watchdog on first chunk so slow remote voices never stall "Speak"
        if (this.startWatchdog) clearTimeout(this.startWatchdog);
        if (!startedOnce) {
          this.startWatchdog = setTimeout(() => {
            if (!startedOnce && mySession === this.sessionId) {
              try {
                window.speechSynthesis.cancel();
              } catch {
                // Ignore
              }
              finish(false);
            }
          }, 900);
        }

        utterance.onstart = () => {
          startedOnce = true;
          if (this.startWatchdog) {
            clearTimeout(this.startWatchdog);
            this.startWatchdog = null;
          }
        };

        utterance.onend = () => {
          if (mySession !== this.sessionId) {
            finish(false);
            return;
          }
          startedOnce = true;
          idx += 1;
          speakNext();
        };

        utterance.onerror = () => {
          finish(false);
        };

        try {
          window.speechSynthesis.resume();
          window.speechSynthesis.speak(utterance);
        } catch {
          finish(false);
        }
      };

      speakNext();
    });
  }

  async _speakWithBackendAudio(cleanText, mySession, checkEnabled) {
    const controller = new AbortController();
    this.abortController = controller;

    try {
      const audioUrl = await api.speak(cleanText, 'auto', controller.signal);

      if (mySession !== this.sessionId || (checkEnabled && !checkEnabled())) {
        URL.revokeObjectURL(audioUrl);
        return false;
      }

      this.activeBlobUrl = audioUrl;
      const audio = new Audio(audioUrl);
      audio.volume = 1.0;
      audio.muted = false;
      audio.playbackRate = 1.05;
      this.activeAudio = audio;

      return await new Promise((resolve) => {
        audio.onended = () => {
          if (mySession === this.sessionId) {
            this.isSpeaking = false;
            this.activeKey = null;
            this._notify();
          }
          resolve(true);
        };
        audio.onerror = () => resolve(false);
        audio.play().catch(() => resolve(false));
      });
    } catch {
      return false;
    }
  }
}

export const voiceEngine = new VoiceEngine();
export default voiceEngine;
