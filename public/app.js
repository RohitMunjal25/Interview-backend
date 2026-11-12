const state = { token: localStorage.getItem("aiInterviewToken"), interview: null, question: null, stream: null, recorder: null, recording: null, audioUrl: null, tabGuard: false, resumeUploaded: false, audioContext: null, silenceTimer: null, listenTimer: null, animationFrame: null, serverTtsUnavailable: false };
const $ = (id) => document.getElementById(id);

function message(text, isError = false) {
  $("notice").textContent = text || "";
  $("notice").style.color = isError ? "#ff9b9b" : "#ffca78";
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (state.token) headers.set("Authorization", `Bearer ${state.token}`);
  if (options.json) { headers.set("Content-Type", "application/json"); options.body = JSON.stringify(options.json); }
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || "Request failed");
    error.status = response.status; error.payload = data;
    throw error;
  }
  return data;
}

function setLoggedIn(loggedIn) {
  $("loginCard").hidden = loggedIn;
  $("setupCard").hidden = !loggedIn;
  $("logoutBtn").hidden = !loggedIn;
  $("userName").textContent = loggedIn ? localStorage.getItem("aiInterviewName") || "" : "";
}

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const result = await api("/api/auth/login", { method: "POST", json: Object.fromEntries(form) });
    state.token = result.data.token;
    localStorage.setItem("aiInterviewToken", state.token);
    localStorage.setItem("aiInterviewName", result.data.user.name);
    setLoggedIn(true); message("Login successful.");
  } catch (error) { message(error.message, true); }
});

$("logoutBtn").onclick = () => { localStorage.removeItem("aiInterviewToken"); localStorage.removeItem("aiInterviewName"); location.reload(); };

$("setupForm").elements.resume.addEventListener("change", async (event) => {
  const resume = event.target.files[0];
  if (!resume) return;
  const roleSelect = $("jobRole");
  roleSelect.disabled = true; roleSelect.innerHTML = "<option>Reading resume and finding matching roles...</option>";
  state.resumeUploaded = false;
  try {
    const resumeForm = new FormData(); resumeForm.append("resume", resume);
    await api("/api/interview/upload-resume", { method: "POST", body: resumeForm });
    const suggestions = await api("/api/interview/suggest-job-roles");
    roleSelect.innerHTML = `<option value="">Select a role</option>${suggestions.data.roles.map((role) => `<option value="${escapeHtml(role)}">${escapeHtml(role)}</option>`).join("")}`;
    roleSelect.disabled = false; state.resumeUploaded = true;
    message("Resume uploaded. Select one of the suggested roles.");
  } catch (error) { roleSelect.innerHTML = "<option value=\"\">Could not suggest roles</option>"; message(error.message, true); }
});

async function startCamera() {
  state.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  $("camera").srcObject = state.stream;
}

async function cameraSnapshot() {
  const video = $("camera");
  await new Promise((resolve) => video.readyState >= 2 ? resolve() : video.addEventListener("loadeddata", resolve, { once: true }));
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 640; canvas.height = video.videoHeight || 480;
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
}

async function startProctoring() {
  const snapshot = await cameraSnapshot();
  const body = new FormData(); body.append("image", snapshot, "camera-start.jpg");
  await api(`/api/interview/${state.interview.interviewId}/proctor/start`, { method: "POST", body });
  state.tabGuard = true;
}

$("setupForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const jobRole = form.get("jobRole");
  try {
    if (!state.resumeUploaded || !jobRole) throw new Error("Upload your resume and select a suggested job role first.");
    message("Generating questions and opening camera...");
    const generated = await api("/api/interview/generate-questions", { method: "POST", json: {
      jobRole, difficulty: form.get("difficulty"), questionCount: Number(form.get("questionCount")), interviewType: form.get("interviewType"),
    } });
    state.interview = { ...generated.data, interviewType: form.get("interviewType"), answered: 0 };
    await startCamera();
    await startProctoring();
    $("setupCard").hidden = true; $("interviewCard").hidden = false;
    showQuestion(generated.data.questions[0]);
    message("Interview started. Keep this tab and camera active.");
  } catch (error) { message(error.message || "Camera permission is required.", true); }
});

async function loadQuestionAudio(url) {
  try {
    if (state.serverTtsUnavailable) throw new Error("Using browser speech fallback");
    if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${state.token}` } });
    if (!response.ok) throw new Error("Server speech is unavailable");
    state.audioUrl = URL.createObjectURL(await response.blob());
    $("questionAudio").src = state.audioUrl;
    $("recordingStatus").textContent = "AI is speaking…";
    $("questionAudio").onended = () => startRecording();
    await $("questionAudio").play();
  } catch (_) {
    state.serverTtsUnavailable = true;
    // Do not block the interview when the paid/free server TTS quota is exhausted.
    speakWithBrowser(state.question.question, () => startRecording());
  }
}

function speakWithBrowser(text, onEnd) {
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-IN";
  utterance.rate = 0.95;
  utterance.onend = onEnd;
  utterance.onerror = onEnd;
  $("recordingStatus").textContent = "AI is speaking…";
  window.speechSynthesis.speak(utterance);
}

async function playRetryPrompt(retryMessage) {
  $("recordingStatus").textContent = "AI is asking you to repeat your answer…";
  try {
    const response = await fetch(`/api/interview/${state.interview.interviewId}/voice-feedback`, {
      method: "POST", headers: { Authorization: `Bearer ${state.token}` },
    });
    if (!response.ok) throw new Error("Voice feedback unavailable");
    if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
    state.audioUrl = URL.createObjectURL(await response.blob());
    const player = $("questionAudio"); player.src = state.audioUrl;
    player.onended = () => startRecording();
    await player.play();
  } catch (_) {
    state.serverTtsUnavailable = true;
    // Browser speech is a reliable fallback when the server TTS provider is unavailable.
    speakWithBrowser(retryMessage || "I could not hear your answer clearly. Please repeat your answer.", () => startRecording());
  }
}

function showQuestion(question) {
  state.question = question;
  $("questionText").textContent = question.question;
  $("progress").textContent = `Question ${state.interview.answered + 1} of ${state.interview.totalQuestions}`;
  $("modeBadge").textContent = state.interview.interviewType.toUpperCase();
  const audioMode = state.interview.interviewType === "audio";
  $("textAnswer").hidden = audioMode; $("audioAnswer").hidden = !audioMode;
  $("answerText").value = ""; $("answerPreview").hidden = true; state.recording = null;
  if (audioMode) loadQuestionAudio(question.audioUrl).catch((error) => message(error.message, true));
  else { $("questionAudio").removeAttribute("src"); }
}

async function submitResult(result) {
  const data = result.data;
  if (data.completed) return showReport(data);
  state.interview.answered = data.answeredQuestions;
  showQuestion(data.nextQuestion);
  message("Answer saved.");
}

$("sendText").onclick = async () => {
  const answer = $("answerText").value.trim(); if (!answer) return message("Write an answer first.", true);
  try { message("Saving answer..."); await submitResult(await api(`/api/interview/${state.interview.interviewId}/answer`, { method: "POST", json: { questionId: state.question._id, answer } })); } catch (error) { message(error.message, true); }
};

function startRecording() {
  try {
    if (state.recorder?.state === "recording") return;
    if (!window.MediaRecorder) throw new Error("Audio recording is not supported in this browser. Use Chrome or Edge.");
    const audioTracks = state.stream?.getAudioTracks() || [];
    if (!audioTracks.length) throw new Error("Microphone is not available. Allow microphone permission and try again.");
    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
    const chunks = [];
    state.recorder = new MediaRecorder(new MediaStream(audioTracks), mimeType ? { mimeType } : undefined);
    state.recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
    state.recorder.onerror = () => message("Recording failed. Please allow microphone access and record again.", true);
    state.recorder.onstop = () => {
      stopSilenceDetection();
      state.recording = new Blob(chunks, { type: state.recorder.mimeType || "audio/webm" });
      if (!state.recording.size) return retryFromBrowser("No voice was detected. Please repeat your answer.");
      $("recordingStatus").textContent = "Answer captured. AI is evaluating…";
      submitAudio();
    };
    state.recorder.start();
    $("recordingStatus").textContent = "Listening… answer naturally. I will submit after 2.5 seconds of silence.";
    beginSilenceDetection(audioTracks);
  } catch (error) { message(error.message, true); }
}

function beginSilenceDetection(audioTracks) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  state.audioContext = new AudioContextClass();
  const source = state.audioContext.createMediaStreamSource(new MediaStream(audioTracks));
  const analyser = state.audioContext.createAnalyser();
  analyser.fftSize = 2048; source.connect(analyser);
  const samples = new Uint8Array(analyser.fftSize);
  let speechStarted = false;
  let silentSince = null;
  const inspect = () => {
    if (state.recorder?.state !== "recording") return;
    analyser.getByteTimeDomainData(samples);
    let total = 0;
    for (const sample of samples) total += Math.abs(sample - 128) / 128;
    const isSpeaking = total / samples.length > 0.015;
    if (isSpeaking) { speechStarted = true; silentSince = null; }
    else if (speechStarted) {
      silentSince ??= Date.now();
      if (Date.now() - silentSince >= 2500) return state.recorder.stop();
    }
    state.animationFrame = requestAnimationFrame(inspect);
  };
  inspect();
  state.listenTimer = setTimeout(() => { if (state.recorder?.state === "recording") state.recorder.stop(); }, 5 * 60 * 1000);
}

function stopSilenceDetection() {
  if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
  if (state.listenTimer) clearTimeout(state.listenTimer);
  state.animationFrame = null; state.listenTimer = null;
  state.audioContext?.close(); state.audioContext = null;
}

async function submitAudio() {
  if (!state.recording) return;
  try { message("Transcribing and evaluating your answer..."); const body = new FormData(); body.append("questionId", state.question._id); body.append("audio", state.recording, "answer.webm"); await submitResult(await api(`/api/interview/${state.interview.interviewId}/answer/audio`, { method: "POST", body })); }
  catch (error) {
    if (error.status === 422 && error.payload?.code === "VOICE_UNCLEAR") {
      message("Voice was unclear. AI will ask you to repeat.", true);
      return playRetryPrompt(error.payload.data?.retryMessage);
    }
    retryFromBrowser("I could not process that answer. Please repeat it clearly.");
  }
}

function retryFromBrowser(text) {
  message("Let’s try that answer again.", true);
  return playRetryPrompt(text);
}

async function tabViolation() {
  if (!state.tabGuard || !state.interview) return;
  state.tabGuard = false;
  try { await api(`/api/interview/${state.interview.interviewId}/proctor/terminate`, { method: "POST", json: { reason: "User switched browser tab or window" } }); } catch (_) {}
  message("Interview ended because changing tabs is not allowed.", true);
}
document.addEventListener("visibilitychange", () => { if (document.hidden) tabViolation(); });
window.addEventListener("blur", tabViolation);

function showReport(data) {
  state.tabGuard = false; state.stream?.getTracks().forEach((track) => track.stop());
  $("interviewCard").hidden = true; $("reportCard").hidden = false;
  const rows = (data.questionEvaluations || []).map((item, index) => `<div class="report-item"><strong>Q${index + 1}: ${item.score}/100</strong><br>${escapeHtml(item.feedback || "")}</div>`).join("");
  $("report").innerHTML = `<p><strong>Overall score:</strong> ${data.overallScore}/100</p><p><strong>${escapeHtml(data.performanceLevel || "")}</strong></p><p>${escapeHtml(data.summary || "")}</p><h3>Question feedback</h3>${rows}<p>${data.reportUrl ? `<a href="${data.reportUrl}" target="_blank">Download PDF report</a>` : ""}</p>`;
  message("Interview completed successfully.");
}
function escapeHtml(value) { const el = document.createElement("div"); el.textContent = value; return el.innerHTML; }
setLoggedIn(Boolean(state.token));
