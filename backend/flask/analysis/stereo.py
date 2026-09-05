import numpy as np
from dataclasses import dataclass, asdict

@dataclass
class StereoMetrics:
    is_stereo: bool
    lr_correlation: float
    mid_side_ratio: float

    def to_dict(self) -> dict:
        return asdict(self)


def analyze_stereo(y: np.ndarray, sr: int = 44100) -> dict:
    """
    Computes L/R correlation (-1.0 to 1.0) and mid/side energy ratio for stereo signals.
    Provides sane defaults (is_stereo=False, lr_correlation=1.0, mid_side_ratio=0.0) for mono.
    
    y: numpy array of shape (samples,) or (2, samples) or (samples, 2)
    sr: sample rate (int)
    """
    y = np.asarray(y, dtype=np.float32)

    # Check dimension and shape
    is_stereo = False
    left = None
    right = None

    if y.ndim == 2:
        if y.shape[0] == 2:
            left = y[0]
            right = y[1]
            is_stereo = True
        elif y.shape[1] == 2:
            left = y[:, 0]
            right = y[:, 1]
            is_stereo = True

    if not is_stereo or left is None or right is None or left.size == 0:
        metrics = StereoMetrics(
            is_stereo=False,
            lr_correlation=1.0,
            mid_side_ratio=0.0
        )
        return metrics.to_dict()

    # 1. Pearson L/R correlation
    l_sum_sq = np.sum(left ** 2)
    r_sum_sq = np.sum(right ** 2)
    denom = np.sqrt(l_sum_sq * r_sum_sq) + 1e-9

    if denom > 1e-9:
        lr_corr = float(np.sum(left * right) / denom)
        lr_corr = float(np.clip(lr_corr, -1.0, 1.0))
    else:
        lr_corr = 1.0

    # 2. Mid/Side Energy Ratio
    mid = (left + right) / np.sqrt(2.0)
    side = (left - right) / np.sqrt(2.0)

    mid_energy = float(np.sum(mid ** 2))
    side_energy = float(np.sum(side ** 2))

    if mid_energy > 1e-9:
        ms_ratio = float(min(999.0, side_energy / mid_energy))
    elif side_energy > 1e-9:
        ms_ratio = 999.0
    else:
        ms_ratio = 0.0

    metrics = StereoMetrics(
        is_stereo=True,
        lr_correlation=round(lr_corr, 4),
        mid_side_ratio=round(ms_ratio, 4)
    )
    return metrics.to_dict()
