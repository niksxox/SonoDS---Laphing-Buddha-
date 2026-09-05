import numpy as np
import librosa
from dataclasses import dataclass, asdict

# 7 Standard Audio Engineering Frequency Bands (in Hz)
BANDS = {
    'sub': (20.0, 60.0),
    'bass': (60.0, 250.0),
    'low_mid': (250.0, 500.0),
    'mid': (500.0, 2000.0),
    'upper_mid': (2000.0, 4000.0),
    'presence': (4000.0, 8000.0),
    'air': (8000.0, 20000.0),
}

@dataclass
class SpectralMetrics:
    sub_energy: float
    bass_energy: float
    low_mid_energy: float
    mid_energy: float
    upper_mid_energy: float
    presence_energy: float
    air_energy: float
    band_energies: dict
    spectral_centroid: float

    def to_dict(self) -> dict:
        return asdict(self)


def analyze_spectrum(y: np.ndarray, sr: int = 44100) -> dict:
    """
    Computes energy distribution across 7 frequency bands and spectral centroid.
    
    y: numpy array of shape (samples,) or (channels, samples)
    sr: sample rate (int)
    """
    y = np.asarray(y, dtype=np.float32)

    # Convert to mono for spectral calculations
    if y.ndim == 2:
        y_mono = np.mean(y, axis=0)
    else:
        y_mono = y

    if y_mono.size == 0 or np.max(np.abs(y_mono)) < 1e-7:
        band_energies = {band: 0.0 for band in BANDS}
        metrics = SpectralMetrics(
            sub_energy=0.0,
            bass_energy=0.0,
            low_mid_energy=0.0,
            mid_energy=0.0,
            upper_mid_energy=0.0,
            presence_energy=0.0,
            air_energy=0.0,
            band_energies=band_energies,
            spectral_centroid=0.0
        )
        return metrics.to_dict()

    # 1. Compute STFT magnitude spectrum
    n_fft = min(4096, max(512, 1 << (y_mono.size - 1).bit_length()))
    stft = np.abs(librosa.stft(y_mono, n_fft=n_fft))
    power_spec = np.mean(stft ** 2, axis=1)  # average power per frequency bin
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)

    # 2. Compute energy in each frequency band
    band_energies = {}
    total_band_energy = 0.0

    for band_name, (f_min, f_max) in BANDS.items():
        mask = (freqs >= f_min) & (freqs < f_max)
        energy = float(np.sum(power_spec[mask])) if np.any(mask) else 0.0
        band_energies[band_name] = energy
        total_band_energy += energy

    # Normalize band energies to proportions (sum to 1.0)
    if total_band_energy > 0:
        normalized_band_energies = {
            k: round(float(v / total_band_energy), 4) for k, v in band_energies.items()
        }
    else:
        normalized_band_energies = {k: 0.0 for k in BANDS}

    # 3. Compute Spectral Centroid
    centroid_arr = librosa.feature.spectral_centroid(y=y_mono, sr=sr, n_fft=n_fft)
    mean_centroid = float(np.mean(centroid_arr)) if centroid_arr.size > 0 else 0.0

    metrics = SpectralMetrics(
        sub_energy=normalized_band_energies['sub'],
        bass_energy=normalized_band_energies['bass'],
        low_mid_energy=normalized_band_energies['low_mid'],
        mid_energy=normalized_band_energies['mid'],
        upper_mid_energy=normalized_band_energies['upper_mid'],
        presence_energy=normalized_band_energies['presence'],
        air_energy=normalized_band_energies['air'],
        band_energies=normalized_band_energies,
        spectral_centroid=round(mean_centroid, 2)
    )
    return metrics.to_dict()
