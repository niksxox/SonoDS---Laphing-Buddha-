import numpy as np
import pyloudnorm as pyln
from dataclasses import dataclass, asdict

@dataclass
class LoudnessMetrics:
    integrated_lufs: float
    rms_db: float
    peak_db: float

    def to_dict(self) -> dict:
        return asdict(self)


def analyze_loudness(y: np.ndarray, sr: int = 44100) -> dict:
    """
    Computes integrated LUFS (using pyloudnorm), RMS level in dB, and Peak level in dB.
    
    y: numpy array of shape (samples,) or (channels, samples)
    sr: sample rate (int)
    """
    y = np.asarray(y, dtype=np.float32)
    
    # 1. RMS level in dB
    rms_val = float(np.sqrt(np.mean(y ** 2)))
    rms_db = float(20.0 * np.log10(rms_val + 1e-9))
    
    # 2. Peak level in dB
    peak_val = float(np.max(np.abs(y))) if y.size > 0 else 0.0
    peak_db = float(20.0 * np.log10(peak_val + 1e-9))
    
    # 3. Integrated LUFS via pyloudnorm
    # Prepare array for pyloudnorm: expects shape (samples, channels) or (samples,)
    if y.ndim == 2:
        # y is (channels, samples) -> transpose to (samples, channels)
        y_meter = y.T
    else:
        y_meter = y

    # Check for near silence or empty audio
    if peak_val < 1e-7 or y.size == 0:
        lufs = -100.0
    else:
        try:
            meter = pyln.Meter(sr)
            lufs_val = meter.integrated_loudness(y_meter)
            if np.isinf(lufs_val) or np.isnan(lufs_val):
                lufs = -100.0
            else:
                lufs = float(lufs_val)
        except Exception:
            lufs = -100.0

    metrics = LoudnessMetrics(
        integrated_lufs=round(lufs, 2),
        rms_db=round(rms_db, 2),
        peak_db=round(peak_db, 2)
    )
    return metrics.to_dict()
