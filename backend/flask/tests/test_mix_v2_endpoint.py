"""
test_mix_v2_endpoint.py — End-to-end integration test for POST /mix-v2 Flask endpoint.

Tests uploading the real 9 stems from backend/audio/stems/ to the Flask test client,
verifying that all 6 pipeline stages execute cleanly and produce a complete, structured
JSON response with rendered audio URL, base64 payload, track parameters, dynamic safe ranges,
and reasoning strings.
"""

import pytest
import json
import base64
from pathlib import Path
from app import app


class TestMixV2Endpoint:
    STEMS_DIR = Path(__file__).parent.parent.parent / "audio" / "stems"

    @pytest.fixture
    def client(self):
        app.config["TESTING"] = True
        with app.test_client() as client:
            yield client

    def test_mix_v2_with_real_nine_stems(self, client):
        stem_files = sorted(self.STEMS_DIR.glob("*.wav"))
        assert len(stem_files) == 9, f"Expected 9 stem files, found {len(stem_files)}"

        # Prepare multipart/form-data upload dict
        data = {}
        file_handles = []

        try:
            for f_path in stem_files:
                fh = open(f_path, "rb")
                file_handles.append(fh)
                data[f_path.name] = (fh, f_path.name)

            response = client.post(
                "/mix-v2?duration=3",
                data=data,
                content_type="multipart/form-data"
            )

            assert response.status_code == 200, f"Endpoint failed with status {response.status_code}: {response.data}"

            payload = response.get_json()
            assert payload["status"] == "success"

            # 1. Audio Delivery Verification
            assert "audio_url" in payload
            assert payload["audio_url"] == "http://localhost:3001/renders/rendered_mix.wav"
            assert "audio_base64" in payload
            assert len(payload["audio_base64"]) > 1000  # Non-empty base64 audio

            # Confirm base64 is valid WAV bytes
            raw_wav_bytes = base64.b64decode(payload["audio_base64"])
            assert raw_wav_bytes[:4] == b"RIFF"

            # 2. Summaries Verification
            assert "mix_summary" in payload
            assert payload["mix_summary"]["total_tracks"] == 9

            assert "safety_summary" in payload
            assert "average_health_score" in payload["safety_summary"]

            # 3. Buses Verification
            assert "buses" in payload
            assert "Vocals" in payload["buses"]
            assert "Drums" in payload["buses"]
            assert "Bass" in payload["buses"]
            assert "Instruments" in payload["buses"]

            # 4. Tracks Verification
            assert "tracks" in payload
            tracks = payload["tracks"]
            assert len(tracks) == 9

            for t in tracks:
                assert "id" in t
                assert "filename" in t
                assert "role" in t
                assert "bus" in t
                assert "gain_db" in t
                assert "pan" in t
                assert "eq" in t
                assert "compressor" in t
                assert "sends" in t
                assert "already_good_score" in t
                assert "safe_range_db" in t
                assert 2.0 <= t["safe_range_db"] <= 6.5
                assert "reasoning" in t
                assert len(t["reasoning"]) > 0

            # 5. Disk File Verification
            rendered_disk_file = Path(__file__).parent.parent.parent / "audio" / "renders" / "rendered_mix.wav"
            assert rendered_disk_file.exists()
            assert rendered_disk_file.stat().st_size > 1000

        finally:
            for fh in file_handles:
                fh.close()

    def test_mix_v2_fails_with_no_files(self, client):
        response = client.post("/mix-v2", data={}, content_type="multipart/form-data")
        assert response.status_code == 400
        payload = response.get_json()
        assert "error" in payload
