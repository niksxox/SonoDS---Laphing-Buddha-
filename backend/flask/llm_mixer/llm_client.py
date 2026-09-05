"""
llm_client.py — Robust API wrapper for Gemini 2.0 Flash with retry and schema validation.

Handles model configuration, structured JSON generation, retry-on-invalid-JSON,
and graceful fallback when API keys are absent or requests fail.
"""

from __future__ import annotations
import os
import json
import warnings
from pydantic import ValidationError

from .schema import MixAdjustmentSchema

# Try importing google.generativeai
try:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        import google.generativeai as genai
    HAS_GENAI = True
except ImportError:
    HAS_GENAI = False


def generate_mix_adjustments(
    system_prompt: str,
    user_prompt: str,
    api_key: str | None = None,
    max_retries: int = 3
) -> MixAdjustmentSchema:
    """
    Call Gemini 2.0 Flash to get structured mixing adjustments with retry-on-invalid-JSON.

    Parameters
    ----------
    system_prompt : str
        System instructions persona and constraints.
    user_prompt : str
        Serialized session data.
    api_key : str | None
        API key. Defaults to GEMINI_API_KEY environment variable.
    max_retries : int
        Number of retry attempts if JSON generation or validation fails.

    Returns
    -------
    MixAdjustmentSchema
        Validated Pydantic object containing track/bus adjustments and rationale.
    """
    key = api_key or os.environ.get("GEMINI_API_KEY", "")

    # Fallback if no key or library missing
    if not key or not HAS_GENAI:
        return MixAdjustmentSchema(
            overall_mix_reasoning="Fallback: GEMINI_API_KEY not set or library missing. Using rules-engine baseline mix without LLM adjustments.",
            track_adjustments=[],
            bus_adjustments=[],
        )

    try:
        genai.configure(api_key=key)
        model = genai.GenerativeModel(
            model_name="gemini-2.0-flash",
            system_instruction=system_prompt,
            generation_config=genai.types.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.3,
                max_output_tokens=2048,
            ),
        )
    except Exception as e:
        return MixAdjustmentSchema(
            overall_mix_reasoning=f"Fallback: Failed to initialize Gemini client ({e}). Using baseline mix.",
            track_adjustments=[],
            bus_adjustments=[],
        )

    current_prompt = user_prompt

    for attempt in range(max_retries):
        try:
            response = model.generate_content(current_prompt)
            response_text = response.text.strip()

            # Clean markdown code blocks if model wrapped JSON in ```json ... ```
            if response_text.startswith("```"):
                lines = response_text.splitlines()
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].startswith("```"):
                    lines = lines[:-1]
                response_text = "\n".join(lines).strip()

            parsed_json = json.loads(response_text)
            validated = MixAdjustmentSchema.model_validate(parsed_json)
            return validated

        except (json.JSONDecodeError, ValidationError) as err:
            if attempt == max_retries - 1:
                return MixAdjustmentSchema(
                    overall_mix_reasoning=f"Fallback: LLM output failed schema validation after {max_retries} retries ({err}). Using baseline mix.",
                    track_adjustments=[],
                    bus_adjustments=[],
                )
            # Append error feedback for retry
            current_prompt += f"\n\nERROR: Your previous JSON response failed validation: {err}. Please fix the JSON output to strictly match the schema."

        except Exception as err:
            return MixAdjustmentSchema(
                overall_mix_reasoning=f"Fallback: Gemini API call error ({err}). Using baseline mix.",
                track_adjustments=[],
                bus_adjustments=[],
            )

    return MixAdjustmentSchema(
        overall_mix_reasoning="Fallback: Max retries exceeded. Using baseline mix.",
        track_adjustments=[],
        bus_adjustments=[],
    )
