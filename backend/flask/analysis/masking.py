import numpy as np

BANDS = ['sub', 'bass', 'low_mid', 'mid', 'upper_mid', 'presence', 'air']

def compute_spectral_masking(tracks: list[dict]) -> dict:
    """
    Computes pairwise spectral masking scores per frequency band and overall track conflict ratings.
    Works for an ARBITRARY number of tracks (N >= 1).
    
    tracks: list of dicts, where each dict has:
        - 'id' or 'name': str
        - 'band_energies': dict mapping band names to energy values/ratios
    """
    if not tracks:
        return {
            'pairwise_masking': [],
            'track_masking_summary': {},
            'conflicts': []
        }

    formatted_tracks = []
    for idx, t in enumerate(tracks):
        track_id = str(t.get('id', t.get('name', f'track_{idx}')))
        energies_dict = t.get('band_energies', {})
        vec = np.array([float(energies_dict.get(b, 0.0)) for b in BANDS], dtype=np.float32)
        norm = np.linalg.norm(vec)
        formatted_tracks.append({
            'id': track_id,
            'vec': vec,
            'norm': float(norm)
        })

    num_tracks = len(formatted_tracks)
    pairwise_results = []
    track_summary = {
        t['id']: {'total_overlap_score': 0.0, 'conflicts': []}
        for t in formatted_tracks
    }
    conflicts_list = []

    for i in range(num_tracks):
        for j in range(i + 1, num_tracks):
            t1 = formatted_tracks[i]
            t2 = formatted_tracks[j]

            # Vector overlap per band: min(v1_b, v2_b)
            band_overlaps = {}
            for idx, b in enumerate(BANDS):
                band_overlaps[b] = float(round(min(t1['vec'][idx], t2['vec'][idx]), 4))

            # Spectral overlap score (cosine similarity & dot product)
            dot_prod = float(np.dot(t1['vec'], t2['vec']))
            if t1['norm'] > 1e-9 and t2['norm'] > 1e-9:
                similarity = float(dot_prod / (t1['norm'] * t2['norm']))
            else:
                similarity = 0.0

            total_overlap = float(np.sum(list(band_overlaps.values())))

            pair_entry = {
                'track_a': t1['id'],
                'track_b': t2['id'],
                'similarity_score': round(similarity, 4),
                'total_overlap': round(total_overlap, 4),
                'band_overlaps': band_overlaps
            }
            pairwise_results.append(pair_entry)

            # Update summaries
            track_summary[t1['id']]['total_overlap_score'] += total_overlap
            track_summary[t2['id']]['total_overlap_score'] += total_overlap

            if similarity > 0.35 or total_overlap > 0.2:
                conflict_item = {
                    'track_a': t1['id'],
                    'track_b': t2['id'],
                    'overlap_score': round(total_overlap, 4),
                    'severity': 'high' if similarity > 0.6 else 'moderate'
                }
                conflicts_list.append(conflict_item)

    # Sort conflicts by overlap score descending
    conflicts_list.sort(key=lambda x: x['overlap_score'], reverse=True)

    for tid in track_summary:
        track_summary[tid]['total_overlap_score'] = round(track_summary[tid]['total_overlap_score'], 4)

    return {
        'pairwise_masking': pairwise_results,
        'track_masking_summary': track_summary,
        'conflicts': conflicts_list
    }
