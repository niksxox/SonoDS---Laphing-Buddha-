import numpy as np
from .loudness import analyze_loudness
from .spectrum import analyze_spectrum
from .dynamics import analyze_dynamics
from .stereo import analyze_stereo
from .masking import compute_spectral_masking

def analyze_track(y: np.ndarray, sr: int = 44100, track_id: str = "track") -> dict:
    """
    Performs full per-track DSP analysis (loudness, spectrum, dynamics, stereo).
    """
    loudness_data = analyze_loudness(y, sr)
    spectrum_data = analyze_spectrum(y, sr)
    dynamics_data = analyze_dynamics(y, sr)
    stereo_data = analyze_stereo(y, sr)

    return {
        'id': track_id,
        'loudness': loudness_data,
        'spectrum': spectrum_data,
        'dynamics': dynamics_data,
        'stereo': stereo_data,
        'band_energies': spectrum_data['band_energies']
    }

def analyze_multitrack(tracks: list[dict]) -> dict:
    """
    Performs per-track analysis for an ARBITRARY list of tracks and computes cross-track masking.
    
    tracks: list of dicts, each containing:
        - 'id' or 'name': str
        - 'y': numpy array audio signal
        - 'sr': int (sample rate, default 44100)
    """
    analyzed_tracks = []
    
    for idx, t in enumerate(tracks):
        track_id = str(t.get('id', t.get('name', f'track_{idx}')))
        y = t['y']
        sr = int(t.get('sr', 44100))
        
        res = analyze_track(y=y, sr=sr, track_id=track_id)
        analyzed_tracks.append(res)
        
    masking_data = compute_spectral_masking(analyzed_tracks)

    return {
        'total_tracks': len(analyzed_tracks),
        'tracks': analyzed_tracks,
        'masking': masking_data
    }
