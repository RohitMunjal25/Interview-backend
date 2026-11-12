const { GoogleGenAI } = require("@google/genai");
const { spawn } = require("child_process");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const AUDIO_CLOUD_TIMEOUT_MS = Number(process.env.AUDIO_CLOUD_TIMEOUT_MS || 8000);

const withAudioTimeout = (promise, provider) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`${provider} timed out`)), AUDIO_CLOUD_TIMEOUT_MS);
  promise.then(
    (result) => { clearTimeout(timer); resolve(result); },
    (error) => { clearTimeout(timer); reject(error); }
  );
});

let localWhisperProcess = null;
let localWhisperBuffer = "";
let localWhisperSequence = 0;
const localWhisperPending = new Map();

const rejectLocalWhisperPending = (error) => {
  for (const { reject } of localWhisperPending.values()) reject(error);
  localWhisperPending.clear();
};

const getLocalWhisperWorker = () => {
  if (localWhisperProcess && !localWhisperProcess.killed) return localWhisperProcess;

  const scriptPath = path.join(__dirname, "localTranscription.py");
  localWhisperProcess = spawn(process.env.PYTHON_PATH || "python", [scriptPath, "--server"], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  localWhisperProcess.stdout.setEncoding("utf8");
  localWhisperProcess.stdout.on("data", (chunk) => {
    localWhisperBuffer += chunk;
    const lines = localWhisperBuffer.split("\n");
    localWhisperBuffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response = JSON.parse(line);
        const pending = localWhisperPending.get(response.id);
        if (!pending) continue;
        localWhisperPending.delete(response.id);
        response.error ? pending.reject(new Error(response.error)) : pending.resolve(response);
      } catch (error) {
        console.error("Local Whisper returned invalid output:", line);
      }
    }
  });
  localWhisperProcess.stderr.setEncoding("utf8");
  localWhisperProcess.stderr.on("data", (chunk) => console.error("[Local Whisper]", chunk.trim()));
  localWhisperProcess.on("error", (error) => rejectLocalWhisperPending(error));
  localWhisperProcess.on("exit", (code) => {
    localWhisperProcess = null;
    rejectLocalWhisperPending(new Error(`Local Whisper stopped unexpectedly (${code})`));
  });
  return localWhisperProcess;
};

const transcribeWithLocalWhisper = (audioPath) => new Promise((resolve, reject) => {
  const worker = getLocalWhisperWorker();
  const id = String(++localWhisperSequence);
  const timer = setTimeout(() => {
    if (localWhisperPending.delete(id)) reject(new Error("Local Whisper transcription timed out"));
  }, Number(process.env.LOCAL_WHISPER_TIMEOUT_MS || 180000));
  localWhisperPending.set(id, {
    resolve: (result) => { clearTimeout(timer); resolve(result); },
    reject: (error) => { clearTimeout(timer); reject(error); },
  });
  worker.stdin.write(`${JSON.stringify({ id, audioPath })}\n`);
});

const getClient = () => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
};

const pcmToWav = (pcmBuffer, sampleRate = 24000, channels = 1) => {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * 2;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmBuffer.length, 40);
  return Buffer.concat([header, pcmBuffer]);
};

const synthesizeQuestion = async (text) => {
  const response = await getClient().models.generateContent({
    model: process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts",
    contents: [{ role: "user", parts: [{ text: `Say this interview question clearly and professionally: ${text}` }] }],
    config: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: process.env.GEMINI_TTS_VOICE || "Kore" } } } },
  });
  const part = response.candidates?.[0]?.content?.parts?.find((item) => item.inlineData?.data);
  if (!part?.inlineData?.data) throw new Error("Speech provider returned no audio");
  const audio = Buffer.from(part.inlineData.data, "base64");
  return part.inlineData.mimeType?.includes("wav") ? audio : pcmToWav(audio);
};

const transcribeAudio = async (buffer, mimeType) => {
  const retryMessage = "I could not hear your answer clearly. Please speak a little louder and repeat your answer.";
  const normalize = (text) => ({
    transcript: String(text || "").trim(),
    isClear: Boolean(String(text || "").trim()),
    retryMessage,
  });

  const errors = [];
  const providers = (process.env.AUDIO_PROVIDER_ORDER || "gemini,groq,openai,local")
    .split(",").map((provider) => provider.trim().toLowerCase()).filter(Boolean);

  for (const provider of providers) {
    try {
      if (provider === "gemini") {
        const response = await withAudioTimeout(getClient().models.generateContent({
          model: process.env.GEMINI_TRANSCRIPTION_MODEL || "gemini-3.8-flash",
          contents: [{ role: "user", parts: [
            { inlineData: { mimeType: mimeType || "audio/webm", data: buffer.toString("base64") } },
            { text: "Transcribe this interview answer. Return only the spoken words." },
          ] }],
        }), provider);
        const transcript = response.text?.trim();
        if (!transcript) throw new Error("Gemini returned no transcript");
        return normalize(transcript);
      }

      if (provider === "groq" || provider === "openai") {
        const apiKey = provider === "groq" ? process.env.GROQ_API_KEY : process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error(`${provider.toUpperCase()} API key is not configured`);
        const form = new FormData();
        form.append("file", new Blob([buffer], { type: mimeType || "audio/webm" }), "answer.webm");
        form.append("model", provider === "groq"
          ? (process.env.GROQ_TRANSCRIPTION_MODEL || "whisper-large-v3-turbo")
          : (process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-transcribe"));
        form.append("language", "en");
        form.append("response_format", "json");
        const response = await withAudioTimeout(fetch(
          provider === "groq"
            ? "https://api.groq.com/openai/v1/audio/transcriptions"
            : "https://api.openai.com/v1/audio/transcriptions",
          { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form }
        ), provider);
        if (!response.ok) throw new Error(`${provider} transcription failed: ${await response.text()}`);
        const result = await response.json();
        if (!result.text) throw new Error(`${provider} returned no transcript`);
        return normalize(result.text);
      }

      if (provider === "local") {
        return await transcribeLocally(buffer, mimeType);
      }

      throw new Error("Unknown audio provider");
    } catch (error) {
      errors.push(`${provider}: ${error.message}`);
      console.error(`[Audio] ${provider} failed:`, error.message);
    }
  }

  throw new Error(`All audio providers failed. ${errors.join(" | ")}`);
};

const transcribeLocally = async (buffer, mimeType) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "ai-interview-audio-"));
  const extension = mimeType?.includes("mp4") ? ".mp4" : ".webm";
  const audioPath = path.join(temporaryDirectory, `answer${extension}`);
  try {
    await fs.writeFile(audioPath, buffer);
    const parsed = await transcribeWithLocalWhisper(audioPath);
    if (parsed.error) throw new Error(parsed.error);
    if (typeof parsed.transcript !== "string") throw new Error("Local Whisper returned an invalid transcript");
    return parsed;
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
};

module.exports = { synthesizeQuestion, transcribeAudio };
