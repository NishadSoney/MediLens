/**
 * MediLens API Client
 * Connects React frontend directly to FastAPI backend.
 */

const BASE_URL = ''; // Relative path leverages Vite dev proxy (/api -> localhost:8000)

export const api = {
  async health() {
    const res = await fetch(`${BASE_URL}/api/health`);
    if (!res.ok) throw new Error(`Health check failed: ${res.statusText}`);
    return res.json();
  },

  async getModels() {
    const res = await fetch(`${BASE_URL}/api/models`);
    if (!res.ok) throw new Error(`Failed to fetch models: ${res.statusText}`);
    return res.json();
  },

  async analyzeReport(file, sessionId = 'default', model = null) {
    const formData = new FormData();
    if (file) {
      formData.append('file', file);
    }
    formData.append('use_sample', file ? 'false' : 'true');
    formData.append('session_id', sessionId);
    if (model) {
      formData.append('model', model);
    }

    const res = await fetch(`${BASE_URL}/api/analyze`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to analyze report');
    }
    return res.json();
  },

  async loadSample(sessionId = 'default', model = null) {
    const url = new URL(`${window.location.origin}/api/sample`);
    url.searchParams.set('session_id', sessionId);
    if (model) url.searchParams.set('model', model);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error('Failed to load sample report');
    return res.json();
  },

  async chat(message, sessionId = 'default', model = null, language = 'auto', report = null) {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        session_id: sessionId,
        model,
        language,
        report,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to send message');
    }
    return res.json();
  },

  async getDoctorPrep(sessionId = 'default') {
    const res = await fetch(`${BASE_URL}/api/doctor-prep?session_id=${sessionId}`);
    if (!res.ok) throw new Error('Failed to fetch doctor preparation data');
    return res.json();
  },

  async getMedicines(sessionId = 'default') {
    const res = await fetch(`${BASE_URL}/api/medicines?session_id=${sessionId}`);
    if (!res.ok) throw new Error('Failed to fetch medicines');
    return res.json();
  },

  async getDetailedSummary(sessionId = 'default', model = null, language = 'English', report = null) {
    const res = await fetch(`${BASE_URL}/api/detailed-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        model,
        language,
        report,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to generate detailed summary');
    }
    return res.json();
  },

  async downloadSummary(sessionId = 'default') {
    const res = await fetch(`${BASE_URL}/api/summary-download?session_id=${sessionId}`);
    if (!res.ok) throw new Error('Failed to download summary');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `medilens_doctor_summary_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  },

  async clearVoiceCache() {
    const res = await fetch(`${BASE_URL}/api/voice/clear-cache`, { method: 'POST' });
    if (!res.ok) return { cleared: false };
    return res.json();
  },

  async speak(text, language = 'auto', signal = null) {
    const formData = new FormData();
    formData.append('text', text);
    formData.append('language', language);

    const res = await fetch(`${BASE_URL}/api/speak`, {
      method: 'POST',
      body: formData,
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) throw new Error('TTS generation failed');
    const blob = await res.blob();
    return window.URL.createObjectURL(blob);
  },

  async transcribe(audioBlob, language = 'auto') {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.wav');
    formData.append('language', language);

    const res = await fetch(`${BASE_URL}/api/transcribe`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error('Audio transcription failed');
    return res.json();
  },

  async getHistory(sessionId = 'default') {
    const res = await fetch(`${BASE_URL}/api/history?session_id=${sessionId}`);
    if (!res.ok) throw new Error('Failed to fetch history');
    return res.json();
  },
};

export default api;
