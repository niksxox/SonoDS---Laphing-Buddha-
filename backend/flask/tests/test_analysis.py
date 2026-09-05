import pytest
import numpy as np
import json
from pathlib import Path
import librosa

from analysis.loudness import analyze_loudness
from analysis.spectrum import analyze_spectrum
from analysis.dynamics import analyze_dynamics
from analysis.stereo import analyze_stereo
from analysis.masking import compute_spectral_masking
from analysis import analyze_track, analyze_multitrack


# --- SYNTHETIC SIGNAL TESTS ---

def test_loudness_synthetic():
    sr = 44100
    duration = 1.0
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    
    # 1. Full-scale 1kHz sine wave (Amplitude = 1.0)
    y_full = np.sin(2 * np.pi * 1000 * t).astype(np.float32)
    loud_full = analyze_loudness(y_full, sr)
    assert -0.5 <= loud_full['peak_db'] <= 0.5
    assert -3.5 <= loud_full['rms_db'] <= -2.5
    assert loud_full['integrated_lufs'] > -30.0

    # 2. Quiet sine wave (Amplitude = 0.1)
    y_quiet = 0.1 * y_full
    loud_quiet = analyze_loudness(y_quiet, sr)
    assert loud_quiet['rms_db'] < loud_full['rms_db'] - 15.0
    assert loud_quiet['peak_db'] < -19.0

    # 3. Silence
    y_silent = np.zeros(sr, dtype=np.float32)
    loud_silent = analyze_loudness(y_silent, sr)
    assert loud_silent['integrated_lufs'] == -100.0
    assert loud_silent['rms_db'] <= -100.0


def test_spectrum_synthetic():
    sr = 44100
    duration = 1.0
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)

    # 1. Sub frequency sine wave (50 Hz)
    y_sub = np.sin(2 * np.pi * 50 * t).astype(np.float32)
    spec_sub = analyze_spectrum(y_sub, sr)
    assert spec_sub['sub_energy'] > 0.8
    assert 30.0 <= spec_sub['spectral_centroid'] <= 80.0

    # 2. Mid frequency sine wave (1000 Hz)
    y_mid = np.sin(2 * np.pi * 1000 * t).astype(np.float32)
    spec_mid = analyze_spectrum(y_mid, sr)
    assert spec_mid['mid_energy'] > 0.8
    assert 900.0 <= spec_mid['spectral_centroid'] <= 1100.0


def test_dynamics_synthetic():
    sr = 44100
    duration = 1.0
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)

    # Pure sine wave has crest factor ~3.01 dB (Peak=1.0, RMS=0.707)
    y_sine = np.sin(2 * np.pi * 440 * t).astype(np.float32)
    dyn_sine = analyze_dynamics(y_sine, sr)
    assert 2.5 <= dyn_sine['crest_factor_db'] <= 3.5

    # Transient impulse (High crest factor)
    y_impulse = np.zeros(int(sr * duration), dtype=np.float32)
    y_impulse[0] = 1.0
    dyn_impulse = analyze_dynamics(y_impulse, sr)
    assert dyn_impulse['crest_factor_db'] > 10.0


def test_stereo_synthetic():
    sr = 44100
    samples = int(sr * 0.5)

    # 1. Mono array (1D)
    y_mono = np.random.randn(samples).astype(np.float32)
    st_mono = analyze_stereo(y_mono, sr)
    assert st_mono['is_stereo'] is False
    assert st_mono['lr_correlation'] == 1.0

    # 2. Identical Stereo (L = R)
    y_identical = np.vstack([y_mono, y_mono])
    st_identical = analyze_stereo(y_identical, sr)
    assert st_identical['is_stereo'] is True
    assert 0.99 <= st_identical['lr_correlation'] <= 1.0
    assert st_identical['mid_side_ratio'] <= 0.01

    # 3. Out-of-phase Stereo (L = -R)
    y_inverted = np.vstack([y_mono, -y_mono])
    st_inverted = analyze_stereo(y_inverted, sr)
    assert st_inverted['is_stereo'] is True
    assert st_inverted['lr_correlation'] <= -0.99
    assert st_inverted['mid_side_ratio'] > 10.0


def test_masking_arbitrary_tracks():
    # Test arbitrary number of tracks (e.g. 5 tracks)
    tracks = [
        {'id': f'track_{i}', 'band_energies': {'sub': 0.5 if i == 0 else 0.1, 'mid': 0.8 if i > 2 else 0.2}}
        for i in range(5)
    ]
    masking = compute_spectral_masking(tracks)
    assert len(masking['pairwise_masking']) == (5 * 4) // 2  # 10 pairs
    assert len(masking['track_masking_summary']) == 5


# --- INTEGRATION TEST ON 9 REAL STEMS ---

def test_integration_nine_stems():
    stems_dir = Path(__file__).parent.parent.parent / "audio" / "stems"
    stem_files = list(stems_dir.glob("*.wav"))

    assert len(stem_files) == 9, f"Expected 9 stem files in {stems_dir}, found {len(stem_files)}"

    loaded_tracks = []
    # Load 5 seconds of each stem for fast integration test
    for f in stem_files:
        y, sr = librosa.load(f, sr=22050, duration=5.0, mono=True)
        loaded_tracks.append({
            'id': f.stem,
            'y': y,
            'sr': sr
        })

    result = analyze_multitrack(loaded_tracks)

    assert result['total_tracks'] == 9
    assert len(result['tracks']) == 9
    assert 'masking' in result
    assert len(result['masking']['pairwise_masking']) == (9 * 8) // 2  # 36 pairs

    # Assert JSON serializable
    json_str = json.dumps(result)
    assert len(json_str) > 100
