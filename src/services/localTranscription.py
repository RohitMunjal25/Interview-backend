import json
import os
import sys

from faster_whisper import WhisperModel


def load_model():
    return WhisperModel(
        os.environ.get("LOCAL_WHISPER_MODEL", "base.en"),
        device="cpu", compute_type="int8"
    )


def transcribe(model, audio_path):
    segments, _ = model.transcribe(
        audio_path, language="en", vad_filter=True, beam_size=3,
        condition_on_previous_text=False,
    )
    transcript = " ".join(segment.text.strip() for segment in segments).strip()
    return {
        "transcript": transcript,
        # Do not reject a valid short reply as unclear. The interview evaluator
        # can assess whether the content is sufficient for the question.
        "isClear": bool(transcript),
        "retryMessage": "I could not hear your answer clearly. Please speak a little louder and repeat your answer.",
    }


def main():
    if len(sys.argv) == 2 and sys.argv[1] == "--server":
        model = load_model()
        for line in sys.stdin:
            request = None
            try:
                request = json.loads(line)
                response = {"id": request["id"], **transcribe(model, request["audioPath"])}
            except Exception as error:
                response = {"id": request.get("id") if request else None, "error": str(error)}
            print(json.dumps(response), flush=True)
        return

    if len(sys.argv) != 2:
        raise ValueError("Audio file path is required")
    print(json.dumps(transcribe(load_model(), sys.argv[1])))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": str(error)}))
        sys.exit(1)
