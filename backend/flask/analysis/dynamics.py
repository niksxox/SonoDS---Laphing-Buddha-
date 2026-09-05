import numpy as np
import librosa
from dataclasses import dataclass, asdict

@dataclass
class DynamicMetrics:
    crest_factor_db: float
    dynamic_range_db: float

    def to_dict(self) -> dict:
        return asdict(self)


def analyze_dynamics(y: np.ndarray, sr: int = 44100) -> dict:
    """
    Computes crest factor (in dB) and rolling RMS-based dynamic range estimate (in dB).
    
    y: numpy array of shape (samples,) or (channels, samples)
    sr: sample rate (int)
    """
    y = np.asarray(y, dtype=np.float32)

    if y.ndim == 2:
        y_mono = np.mean(y, axis=0)
    else:
        y_mono = y

    if y_mono.size == 0 or np.max(np.abs(y_mono)) < 1e-7:
        metrics = DynamicMetrics(crest_factor_db=0.0, dynamic_range_db=0.0)
        return metrics.to_dict()

    # 1. Crest Factor (Peak dB - RMS dB)
    rms_val = float(np.sqrt(np.mean(y_mono ** 2)))
    peak_val = float(np.max(np.abs(y_mono)))

    rms_db = 20.0 * np.log10(rms_val + 1e-9)
    peak_db = 20.0 * np.log10(peak_val + 1e-9)

    crest_factor_db = float(peak_db - rms_db)

    # 2. Rolling RMS-based Dynamic Range Estimate
    # Compute RMS across short time windows (e.g. 50ms frames)
    frame_length = min(2048, y_mono.size)
    hop_length = frame_length // 2

    rms_frames = librosa.feature.rms(y=y_mono, frame_length=frame_length, hop_length=hop_length)[0]
    rms_frames_db = 20.0 * np.log10(rms_frames + 1e-9)

    # Filter out total silence (< -70 dB)
    active_frames = rms_frames_db[rms_frames_db > -70.0]

    if active_frames.size > 1:
        p95 = float(np.percentile(active_frames, 95))
        p10 = float(np.percentile(active_frames, 10))
        dynamic_range_db = float(p95 - p10)
    elif active_frames.size == 1:
        dynamic_range_db = 0.0
    else:
        dynamic_range_db = 0.0

    metrics = DynamicMetrics(
        crest_factor_db=round(crest_factor_db, 2),
        dynamic_range_db=round(max(0.0, dynamic_range_db), 2)
    )
    return metrics.to_dict()
