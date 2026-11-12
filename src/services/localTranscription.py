import json
import os
import sys

from faster_whisper import WhisperModel


def main():
    if len(sys.argv) != 2:
        raise ValueError("Audio file path is required")

    model = WhisperModel(
        os.environ.get("LOCAL_WHISPER_MODEL", "base.en"),
        device="cpu",
        compute_type="int8",
    )
    segments, _ = model.transcribe(
        sys.argv[1], language="en", vad_filter=True, beam_size=3,
        condition_on_previous_text=False,
    )
    transcript = " ".join(segment.text.strip() for segment in segments).strip()
    words = [word for word in transcript.split() if any(char.isalnum() for char in word)]
    print(json.dumps({
        "transcript": transcript,
        "isClear": len(words) >= 3,
        "retryMessage": "I could not hear your answer clearly. Please speak a little louder and repeat your answer.",
    }))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": str(error)}))
        sys.exit(1)
