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
    print(json.dumps({
        "transcript": transcript,
        # Do not reject a valid short reply as unclear. The interview evaluator
        # can assess whether the content is sufficient for the question.
        "isClear": bool(transcript),
        "retryMessage": "I could not hear your answer clearly. Please speak a little louder and repeat your answer.",
    }))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": str(error)}))
        sys.exit(1)
