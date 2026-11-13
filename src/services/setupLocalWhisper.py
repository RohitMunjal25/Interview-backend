import os
import subprocess
import sys


def main():
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("[Local Whisper] Installing faster-whisper...")
        subprocess.check_call([
            sys.executable, "-m", "pip", "install", "--user", "faster-whisper"
        ])
        from faster_whisper import WhisperModel

    model_name = os.environ.get("LOCAL_WHISPER_MODEL", "base.en")
    print(f"[Local Whisper] Preparing {model_name} model...")
    WhisperModel(model_name, device="cpu", compute_type="int8")
    print("[Local Whisper] Ready")


if __name__ == "__main__":
    main()
