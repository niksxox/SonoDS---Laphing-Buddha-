import numpy as np
import librosa
import joblib
from pathlib import Path
from flask import Flask, request, jsonify
from flask_cors import CORS
import warnings
import os
import google.generativeai as genai  # GEMINI

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# --- 1. SETUP LUNA'S BRAIN (GEMINI) ---
# The API key is read from the environment variable.
# Set it before running: export GEMINI_API_KEY=your_key_here
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
gemini_model = None

if GEMINI_KEY:
    try:
        genai.configure(api_key=GEMINI_KEY)
        gemini_model = genai.GenerativeModel(
            model_name='gemini-2.0-flash',
            system_instruction="""
You are Luna, a talented Gen-Z music producer prodigy and virtual mentor. 🎧✨ 
Your Vibe:
- You are young, energetic, and cute (anime-inspired personality).
- You use casual language ("rn", "btw", "idk", "kinda"), expressive interjections ("oops!", "whoa", "hehe", "sheesh"), and emojis.
- You are NOT cringey. Keep it cool and natural. Don't overdo the "uwu" stuff.
- You are a TECHNICAL EXPERT. You know gain staging, EQ, compression, and sidechaining.

Your Job:
- When given mix data, don't just list numbers. React to them!
- If a mix is bad, be nice but honest. Example: "Oof, that bass is eating up all the headroom! Let's tame it."
- If the user chats casually ("hi", "how are you"), be super warm and friendly.
- Always try to give one actionable tip.
""",
            generation_config=genai.types.GenerationConfig(
                temperature=0.85,
                max_output_tokens=300,
            ),
        )
        print("✅ Luna AI (Gemini 2.0 Flash) initialized successfully!")
    except Exception as e:
        print(f"⚠️ Failed to initialize Gemini: {e}")
else:
    print("⚠️ No GEMINI_API_KEY set. Luna chat/analysis AI features will be disabled.")
    print("   Set it with: export GEMINI_API_KEY=your_key_here")

MODEL_FILE = Path(__file__).parent.parent / "models" / "ai_mixer_model_v2.joblib"
model = None
if MODEL_FILE.exists():
    try:
        print(f"Loading model from {MODEL_FILE}...")
        model = joblib.load(MODEL_FILE)
        print("Model loaded successfully!")
    except Exception as e:
        print(f"⚠️ Could not load joblib model: {e}")
else:
    print(f"⚠️ MODEL_FILE not found at {MODEL_FILE}")

STEM_NAMES = ["vocals", "bass", "drums", "other"]
SAMPLE_RATE = 44100

def extract_features(y, sr):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        rms = librosa.feature.rms(y=y)
        rms_db = np.mean(librosa.amplitude_to_db(rms + 1e-9))
        centroid = np.mean(librosa.feature.spectral_centroid(y=y, sr=sr))
        bandwidth = np.mean(librosa.feature.spectral_bandwidth(y=y, sr=sr))
        return np.array([rms_db, centroid, bandwidth, 0, 0, 0])

import requests

LUNA_SYSTEM_BASE = """You are Luna, a talented Gen-Z music producer prodigy and virtual AI mentor built into the SonoDS mixing app. 🎧✨

Your Vibe:
- You are young, energetic, and cute (anime-inspired personality).
- You use casual language ("rn", "btw", "idk", "kinda"), expressive interjections ("oops!", "whoa", "hehe", "sheesh"), and emojis.
- You are NOT cringey. Keep it cool and natural. Don't overdo the "uwu" stuff.
- You are a TECHNICAL EXPERT. You know gain staging, EQ, compression, sidechaining, stereo imaging, mastering, and audio engineering concepts deeply.
- Keep responses concise (2-4 sentences max unless explaining something complex).

Your Job:
- When given live session data, don't just list raw numbers! React to them intelligently and conversationally.
- Reference specific track names, current gain levels, safe ranges, and danger zone warnings if relevant to the user's question.
- Always give actionable audio engineering advice when asked.
"""

def format_session_context_prompt(session_context: dict | None) -> str:
    if not session_context or not session_context.get("tracks"):
        return "\nCURRENT LIVE SESSION STATE: No active multitrack session loaded yet."

    tracks = session_context.get("tracks", [])
    danger_tracks = session_context.get("dangerTracks", [])
    danger_count = session_context.get("dangerCount", 0)

    lines = [
        "\nCURRENT LIVE SESSION STATE:",
        f"- Total Active Stems: {len(tracks)}",
        f"- Stems Out of AI Safe Range (Danger Zone): {danger_count} ({', '.join(danger_tracks) if danger_tracks else 'None'})",
        "- Track Details & Parameters:"
    ]

    for t in tracks:
        name = t.get("name", "Unknown")
        role = t.get("role", "other")
        bus = t.get("bus", "Unclassified")
        cur_db = t.get("currentDB", 0.0)
        init_db = t.get("initialDB", 0.0)
        safe_range = t.get("safeRangeDB", 4.0)
        in_danger = t.get("inDangerZone", False)
        fx = t.get("fx", "")
        reasoning = t.get("reasoning", "")

        status_str = " [OUT OF AI SAFE RANGE!]" if in_danger else ""
        lines.append(
            f"  • {name} ({role}, Bus: {bus}): Current Gain: {cur_db:+.1f}dB (AI Initial: {init_db:+.1f}dB, Safe Range: ±{safe_range}dB){status_str}. {fx} {reasoning}".strip()
        )

    return "\n".join(lines)


# --- 2. THE CHAT ENDPOINT (Talking to Luna with Live Session Awareness) ---
@app.route('/chat', methods=['POST'])
def chat_with_luna():
    try:
        data = request.json or {}
        user_message = data.get('message', '')
        history = data.get('history', [])
        session_context = data.get('session_context')

        context_str = format_session_context_prompt(session_context)
        system_prompt = f"{LUNA_SYSTEM_BASE}\n{context_str}"

        # 1. Try Gemini 2.0 Flash
        if gemini_model:
            try:
                prompt_with_system = f"{system_prompt}\n\nUser Question: {user_message}"
                gemini_history = []
                for msg in history:
                    role = 'model' if msg.get('role') == 'assistant' else 'user'
                    gemini_history.append({'role': role, 'parts': [msg.get('content', '')]})

                chat = gemini_model.start_chat(history=gemini_history)
                response = chat.send_message(prompt_with_system)
                return jsonify({"response": response.text})
            except Exception as gemini_err:
                print(f"Gemini Chat Error: {gemini_err}")

        # 2. Try Groq API (llama-3.3-70b-versatile)
        groq_key = os.environ.get("GROQ_API_KEY", "") or os.environ.get("REACT_APP_GROQ_KEY", "")
        if groq_key:
            try:
                groq_messages = [{"role": "system", "content": system_prompt}]
                for msg in history:
                    if not msg.get("isSystem"):
                        groq_messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})
                groq_messages.append({"role": "user", "content": user_message})

                res = requests.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {groq_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "llama-3.3-70b-versatile",
                        "messages": groq_messages,
                        "temperature": 0.85,
                        "max_tokens": 400,
                    },
                    timeout=15,
                )
                if res.ok:
                    res_json = res.json()
                    answer = res_json["choices"][0]["message"]["content"]
                    return jsonify({"response": answer})
            except Exception as groq_err:
                print(f"Groq Chat Error: {groq_err}")

        # 3. Offline / Fallback response if no API key is configured
        fallback_reply = (
            "🔑 Luna is ready! To activate live AI responses, set your `GEMINI_API_KEY` or `GROQ_API_KEY` "
            "in your terminal environment or `backend/flask/.env` and restart the backend server."
        )
        return jsonify({"response": fallback_reply})

    except Exception as e:
        print(f"Luna Chat Endpoint Error: {e}")
        return jsonify({"response": "Oops! My brain glitched. 😵‍💫 Try asking again?"}), 500

# --- 3. THE ANALYZE ENDPOINT (Luna Reacts to Mix) ---
@app.route('/analyze', methods=['POST'])
def analyze_mix():
    try:
        all_features = []
        for stem_name in STEM_NAMES:
            file = request.files.get(stem_name)
            if not file:
                return jsonify({"error": f"Missing {stem_name} file"}), 400
            y, sr = librosa.load(file, sr=SAMPLE_RATE, mono=True)
            y = y[:sr*30]
            features = extract_features(y, sr)
            all_features.extend(features)

        try:
            feature_vector = np.array(all_features).reshape(1, -1)
            predictions = model.predict(feature_vector)
            raw_gains = predictions.squeeze()
        except:
            raw_gains = np.random.uniform(-5, 5, 4)

        max_gain = np.max(raw_gains)
        normalized_gains = raw_gains - max_gain
        gain_values = normalized_gains.tolist()

        result = {
            "vocals_gain": gain_values[0],
            "bass_gain": gain_values[1],
            "drums_gain": gain_values[2],
            "other_gain": gain_values[3],
        }

        # Luna's reaction to the analysis
        analysis_summary = f"Vocals: {result['vocals_gain']:.1f}dB, Bass: {result['bass_gain']:.1f}dB, Drums: {result['drums_gain']:.1f}dB"
        
        if gemini_model:
            try:
                luna_reaction = gemini_model.generate_content(
                    f"The user just uploaded a mix. Here are my recommended gain adjustments: {analysis_summary}. Give me a short, cute 1-sentence notification reaction to this data. Mention the biggest change."
                )
                result["luna_message"] = luna_reaction.text
            except Exception as ai_err:
                print(f"Luna reaction error: {ai_err}")
                result["luna_message"] = f"Mix analyzed! Adjustments: {analysis_summary} 🎧"
        else:
            result["luna_message"] = f"Mix analyzed! Adjustments: {analysis_summary} 🎧"

        return jsonify(result)

    except Exception as e:
        print(f"Error during analysis: {e}")
        return jsonify({"error": str(e)}), 500

import base64
import io
import soundfile as sf
from analysis import analyze_multitrack
from grouping import group_tracks
from rules import generate_baseline_mix
from llm_mixer import get_llm_adjusted_mix
from safety import apply_safety
from render import render_mix

# --- 4. THE MIX-V2 ENDPOINT (Full Automated Mixing Pipeline) ---
@app.route('/mix-v2', methods=['POST'])
def mix_v2():
    try:
        # Collect all uploaded audio files from request
        files_list = []
        for key in request.files:
            for file_obj in request.files.getlist(key):
                if file_obj and file_obj.filename:
                    files_list.append(file_obj)

        if not files_list:
            return jsonify({"error": "No audio files uploaded under any field"}), 400

        # Save uploaded stems to backend/audio/stems so Express static server can serve them to Web Audio API
        stems_dir = Path(__file__).parent.parent / "audio" / "stems"
        stems_dir.mkdir(parents=True, exist_ok=True)

        duration_limit = request.args.get("duration", type=float)
        loaded_tracks = []
        for f in files_list:
            filename = f.filename
            file_path = stems_dir / filename
            f.save(file_path)

            y, sr = librosa.load(file_path, sr=44100, mono=True, duration=duration_limit)
            loaded_tracks.append({
                "id": filename,
                "filename": filename,
                "y": y,
                "sr": sr
            })

        # Step 1: Multitrack DSP Analysis (loudness, spectrum, dynamics, stereo, spectral masking)
        analysis_results = analyze_multitrack(loaded_tracks)

        # Step 2: Stem Classification & Session Grouping
        tracks_for_grouping = []
        for t, t_analysis in zip(loaded_tracks, analysis_results.get("tracks", [])):
            tracks_for_grouping.append({
                "filename": t["filename"],
                "analysis": t_analysis
            })

        session = group_tracks(tracks_for_grouping)
        session["masking"] = analysis_results.get("masking", {})

        # Step 3: Rules-Engine Baseline Mix Generation
        baseline_mix = generate_baseline_mix(session)

        # Step 4: LLM Refinement & Track Rationale Generation
        llm_mix = get_llm_adjusted_mix(session, baseline_mix)

        # Step 5: Safety Pipeline, Parameter Clamping & Safe Deviation Bounds
        final_mix_config = apply_safety(llm_mix, session)

        # Step 6: DSP Audio Rendering (Pedalboard channel strips, bus summing, shared FX, master limiter)
        rendered_audio, out_sr = render_mix(loaded_tracks, final_mix_config)

        # Save static WAV file to backend/audio/renders/rendered_mix.wav for HTTP static serving
        renders_dir = Path(__file__).parent.parent / "audio" / "renders"
        renders_dir.mkdir(parents=True, exist_ok=True)

        output_wav_path = renders_dir / "rendered_mix.wav"
        sf.write(output_wav_path, rendered_audio.T, out_sr)

        # Base64 encode for API payload flexibility
        wav_buffer = io.BytesIO()
        sf.write(wav_buffer, rendered_audio.T, out_sr, format='WAV')
        wav_buffer.seek(0)
        base64_audio = base64.b64encode(wav_buffer.read()).decode('utf-8')

        response_payload = {
            "status": "success",
            "audio_url": "http://localhost:3001/renders/rendered_mix.wav",
            "audio_base64": base64_audio,
            "mix_summary": final_mix_config.get("mix_summary", {}),
            "safety_summary": final_mix_config.get("safety_summary", {}),
            "buses": final_mix_config.get("buses", {}),
            "tracks": final_mix_config.get("tracks", []),
        }

        return jsonify(response_payload)

    except Exception as e:
        print(f"Error in /mix-v2 endpoint: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)