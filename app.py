"""MediLens frontend (Gradio).

Run:  python app.py
The backend functions in backend.py are mocks; swap in your agents there.
"""

import html
import tempfile
from pathlib import Path

import gradio as gr

import backend

APP_NAME = "MediLens"  # rename freely
CSS = (Path(__file__).parent / "style.css").read_text(encoding="utf-8")

STATUS_LABEL = {"normal": "Normal", "high": "High", "low": "Low", "critical": "Critical"}
esc = html.escape

HEADER = f"""
<div class="ml-head">
  <div class="ml-brand"><span class="ml-logo"></span><h1>{APP_NAME}</h1><p>Medical report explainer</p></div>
  <div class="ml-disclaimer">General information only. Not a diagnosis. Talk to your doctor.</div>
</div>
"""

EMPTY_REPORT = """
<div class="ml-empty">
  <div class="ml-empty-icon"></div>
  <h3>No report yet</h3>
  <p>Upload a lab report above, or try the sample report to see how it works.</p>
</div>
"""

EMPTY_DOCTOR = '<div class="ml-empty small"><p>Analyse a report to get questions for your doctor.</p></div>'
EMPTY_MEDS = '<div class="ml-empty small"><p>Analyse a report or prescription to see medicine information.</p></div>'

WELCOME = [{
    "role": "assistant",
    "content": "Hello. Upload your report and I'll explain it in simple words. "
               "You can type or press the microphone to ask me anything about it.",
}]


# ----------------------------------------------------------------------------
# Rendering
# ----------------------------------------------------------------------------
def render_report(report):
    if not report:
        return EMPTY_REPORT

    tests = report["tests"]
    abnormal = [t for t in tests if t["status"] != "normal"]
    critical = [t for t in tests if t["status"] == "critical"]
    meta = report["meta"]
    out = []

    if critical:
        names = ", ".join(esc(t["name"]) for t in critical)
        out.append(
            '<div class="ml-alert"><strong>Needs prompt medical attention</strong>'
            f"<span>{names} is far outside the safe range. Please contact your doctor "
            "or a hospital today.</span></div>"
        )

    out.append(
        '<div class="ml-meta">'
        f'<span>{esc(meta["lab"])}</span><span>{esc(meta["date"])}</span><span>{esc(meta["patient"])}</span>'
        "</div>"
    )
    out.append(
        '<div class="ml-counts">'
        f"<span><b>{len(tests)}</b> tests</span>"
        f'<span class="warn"><b>{len(abnormal)}</b> outside range</span>'
        "</div>"
    )

    rows = ['<div class="ml-row head"><div>Test</div><div>Result</div><div>Usual range</div><div>Status</div></div>']
    for t in tests:
        note = f"<small>{esc(t['explain'])}</small>" if t["status"] != "normal" and t.get("explain") else ""
        rows.append(
            f'<div class="ml-row {t["status"]}">'
            f'<div class="ml-name">{esc(t["name"])}{note}</div>'
            f'<div class="ml-val">{esc(t["value"])} <em>{esc(t["unit"])}</em></div>'
            f'<div class="ml-ref">{esc(t["range"])}</div>'
            f'<div class="ml-status"><span class="chip {t["status"]}">{STATUS_LABEL[t["status"]]}</span></div>'
            "</div>"
        )
    out.append('<div class="ml-table">' + "".join(rows) + "</div>")

    if report.get("summary"):
        out.append(f'<div class="ml-summary"><h4>In short</h4><p>{esc(report["summary"])}</p></div>')
    return "".join(out)


def render_doctor(prep):
    qs = "".join(f"<li>{esc(q)}</li>" for q in prep["questions"])
    bring = "".join(f"<li>{esc(b)}</li>" for b in prep["bring"])
    return (
        '<div class="ml-card"><h4>Questions to ask your doctor</h4>'
        f"<ol>{qs}</ol></div>"
        f'<div class="ml-card"><h4>What to bring</h4><ul>{bring}</ul></div>'
    )


def render_meds(meds):
    if not meds:
        return EMPTY_MEDS
    cards = "".join(
        '<div class="ml-card med">'
        f'<h4>{esc(m["name"])}</h4>'
        f'<p><span>What it is for</span>{esc(m["purpose"])}</p>'
        f'<p><span>Common side effects</span>{esc(m["side_effects"])}</p>'
        f'<p><span>Timing</span>{esc(m["timing"])}</p>'
        "</div>"
        for m in meds
    )
    return (
        cards
        + '<div class="ml-note">General information only. Never change, swap or stop a medicine '
        "without asking your doctor or pharmacist.</div>"
    )


# ----------------------------------------------------------------------------
# Handlers
# ----------------------------------------------------------------------------
def run_analysis(path, sample, history, lang, speak_on):
    if not sample and not path:
        gr.Warning("Please choose a report file first.")
        return [gr.update()] * 7

    report = backend.analyze_report(path, use_sample=sample)
    tests = report["tests"]
    abnormal = [t for t in tests if t["status"] != "normal"]
    critical = [t for t in tests if t["status"] == "critical"]

    reply = f"I've read your report. {len(abnormal)} of {len(tests)} results are outside the usual range."
    if critical:
        reply += (f" {critical[0]['name']} is high enough that you should contact your doctor soon.")
    reply += " Ask me about any test, or open the other tabs for doctor questions and medicines."

    history = list(history or []) + [{"role": "assistant", "content": reply}]

    summary_path = Path(tempfile.mkdtemp()) / "doctor_summary.txt"
    summary_path.write_text(backend.summary_text(report), encoding="utf-8")

    audio = backend.speak(reply, lang) if speak_on else None
    return (
        report,
        render_report(report),
        render_doctor(backend.doctor_prep(report)),
        render_meds(backend.medicine_info(report)),
        gr.update(value=str(summary_path), visible=True),
        history,
        audio,
    )


def respond(message, history, report, lang, speak_on):
    history = list(history or [])
    message = (message or "").strip()
    if not message:
        return history, "", None

    history.append({"role": "user", "content": message})
    if not report:
        reply = "Please upload a report first, or press 'Try sample report'."
    else:
        reply = backend.chat(message, report, lang)
    history.append({"role": "assistant", "content": reply})

    audio = backend.speak(reply, lang) if speak_on else None
    return history, "", audio


def respond_voice(audio, history, report, lang, speak_on):
    if not audio:
        return history, None, None
    text = backend.transcribe(audio, lang)
    if not text:
        history = list(history or []) + [
            {"role": "assistant", "content": "I couldn't hear that clearly. Please try again."}
        ]
        return history, None, None
    history, _, reply_audio = respond(text, history, report, lang, speak_on)
    return history, None, reply_audio


def quick(prompt):
    def _run(history, report, lang, speak_on):
        history, _, audio = respond(prompt, history, report, lang, speak_on)
        return history, audio
    return _run


# ----------------------------------------------------------------------------
# UI
# ----------------------------------------------------------------------------
with gr.Blocks(css=CSS, title=APP_NAME, theme=gr.themes.Base()) as demo:
    report_state = gr.State(None)
    gr.HTML(HEADER)

    with gr.Row(elem_id="layout", equal_height=False):
        # ---------------- left: report ----------------
        with gr.Column(scale=3, min_width=420, elem_id="left"):
            with gr.Column(elem_id="upload-card"):
                gr.HTML('<div class="ml-title">Your report</div>')
                file_in = gr.File(
                    label="Upload a lab report or prescription",
                    file_types=[".pdf", ".png", ".jpg", ".jpeg", ".txt"],
                    type="filepath",
                    elem_id="file-in",
                )
                with gr.Row():
                    analyze_btn = gr.Button("Analyse report", elem_id="analyze-btn", variant="primary")
                    sample_btn = gr.Button("Try sample report", elem_id="sample-btn")
            report_html = gr.HTML(EMPTY_REPORT, elem_id="report")

        # ---------------- right: assistant ----------------
        with gr.Column(scale=2, min_width=360, elem_id="right"):
            with gr.Tabs(elem_id="tabs"):
                with gr.Tab("Ask"):
                    with gr.Row(elem_id="opts"):
                        lang = gr.Dropdown(list(backend.LANGUAGES), value="English", label="Language",
                                           scale=2, container=False, elem_id="lang")
                        speak_on = gr.Checkbox(value=True, label="Speak replies", scale=2,
                                               container=False, elem_id="speak")
                    chat = gr.Chatbot(
                        value=WELCOME,
                        type="messages",
                        height=340,
                        show_label=False,
                        container=False,
                        elem_id="chat",
                    )
                    with gr.Row(elem_id="chips"):
                        q1 = gr.Button("Explain my report", size="sm", elem_classes="chipbtn")
                        q2 = gr.Button("Prepare me for the doctor", size="sm", elem_classes="chipbtn")
                        q3 = gr.Button("About my medicines", size="sm", elem_classes="chipbtn")
                    with gr.Row(elem_id="input-row"):
                        box = gr.Textbox(placeholder="Ask about your report…", show_label=False,
                                         container=False, scale=5, elem_id="box")
                        send = gr.Button("Send", scale=1, elem_id="send-btn")
                    mic = gr.Audio(sources=["microphone"], type="filepath", show_label=False,
                                   elem_id="mic")
                    reply_audio = gr.Audio(autoplay=True, show_label=False, interactive=False,
                                           elem_id="reply-audio")

                with gr.Tab("Doctor prep"):
                    doctor_html = gr.HTML(EMPTY_DOCTOR)
                    summary_file = gr.File(label="One-page summary to show your doctor",
                                           visible=False, interactive=False)

                with gr.Tab("Medicines"):
                    meds_html = gr.HTML(EMPTY_MEDS)

    gr.HTML('<div class="ml-foot">Information only. It does not replace a doctor. '
            "In an emergency, call your local emergency number.</div>")

    # ---------------- wiring ----------------
    analysis_outputs = [report_state, report_html, doctor_html, meds_html, summary_file, chat, reply_audio]
    analyze_btn.click(
        lambda p, h, lg, sp: run_analysis(p, False, h, lg, sp),
        [file_in, chat, lang, speak_on], analysis_outputs,
    )
    sample_btn.click(
        lambda h, lg, sp: run_analysis(None, True, h, lg, sp),
        [chat, lang, speak_on], analysis_outputs,
    )

    send_inputs = [box, chat, report_state, lang, speak_on]
    send.click(respond, send_inputs, [chat, box, reply_audio])
    box.submit(respond, send_inputs, [chat, box, reply_audio])
    mic.stop_recording(respond_voice, [mic, chat, report_state, lang, speak_on], [chat, mic, reply_audio])

    for btn, prompt in ((q1, "Explain my report"), (q2, "Prepare me for the doctor"), (q3, "Tell me about my medicines")):
        btn.click(quick(prompt), [chat, report_state, lang, speak_on], [chat, reply_audio])

if __name__ == "__main__":
    demo.launch(inbrowser=True)
