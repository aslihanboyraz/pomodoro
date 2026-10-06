const MODES = {
  pomodoro: { minutes: 25, label: "Odaklanma", title: "Pomodoro" },
  short: { minutes: 5, label: "Kısa Mola", title: "Kısa Mola" },
  long: { minutes: 15, label: "Uzun Mola", title: "Uzun Mola" },
};

const STORAGE_KEY = "pomodoro-zamanlayicisi-stats";
const RING_RADIUS = 120;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

const BURST_COLORS = {
  pomodoro: ["#ff3b30", "#ffd60a", "#ff7a18", "#ff4fa3"],
  short: ["#00a884", "#7dff6b", "#3d9bff", "#ffd60a"],
  long: ["#6c4dff", "#ff4fa3", "#3d9bff", "#ffd60a"],
};

const timeEl = document.getElementById("time");
const modeLabelEl = document.getElementById("mode-label");
const statusEl = document.getElementById("status");
const ringEl = document.getElementById("ring");
const timerEl = document.querySelector(".timer");
const completedEl = document.getElementById("completed");
const minutesEl = document.getElementById("minutes");
const startBtn = document.getElementById("start");
const pauseBtn = document.getElementById("pause");
const resetBtn = document.getElementById("reset");
const resetStatsBtn = document.getElementById("reset-stats");
const modeButtons = document.querySelectorAll(".mode");

const state = {
  mode: "pomodoro",
  remaining: MODES.pomodoro.minutes * 60,
  running: false,
  timerId: null,
  endAt: 0,
  completed: 0,
  totalMinutes: 0,
};

let audioCtx = null;

function loadStats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    const completed = Number(data.completed);
    const totalMinutes = Number(data.totalMinutes);
    state.completed = Number.isFinite(completed) && completed >= 0 ? Math.floor(completed) : 0;
    state.totalMinutes = Number.isFinite(totalMinutes) && totalMinutes >= 0 ? Math.floor(totalMinutes) : 0;
  } catch {
    state.completed = 0;
    state.totalMinutes = 0;
  }
}

function saveStats() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      completed: state.completed,
      totalMinutes: state.totalMinutes,
    })
  );
}

function formatTime(totalSeconds) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function fullDuration() {
  return MODES[state.mode].minutes * 60;
}

function ensureAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioCtx) audioCtx = new AudioContextClass();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function playChime() {
  const ctx = ensureAudio();
  if (!ctx) return;

  const now = ctx.currentTime;
  [784, 988].forEach((frequency, index) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = now + index * 0.16;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.34);
  });
}

function celebrate(mode) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || typeof confetti !== "function") return;

  confetti({
    particleCount: mode === "pomodoro" ? 150 : 80,
    spread: 86,
    startVelocity: 38,
    origin: { y: 0.62 },
    colors: BURST_COLORS[mode],
    scalar: 0.95,
  });
}

function stopTimer() {
  if (state.timerId !== null) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
  state.running = false;
}

function render() {
  const mode = MODES[state.mode];
  const clock = formatTime(state.remaining);
  const progress = fullDuration() === 0 ? 0 : state.remaining / fullDuration();

  timeEl.textContent = clock;
  modeLabelEl.textContent = mode.label;
  completedEl.textContent = String(state.completed);
  minutesEl.textContent = String(state.totalMinutes);
  document.title = `(${clock}) ${mode.title} - Zamanlayıcı`;
  document.documentElement.dataset.mode = state.mode;
  timerEl.classList.toggle("is-running", state.running);

  ringEl.style.stroke = `url(#grad-${state.mode})`;
  ringEl.style.strokeDasharray = String(RING_LENGTH);
  ringEl.style.strokeDashoffset = String(RING_LENGTH * (1 - progress));

  modeButtons.forEach((button) => {
    const active = button.dataset.mode === state.mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });

  startBtn.disabled = state.running;
  pauseBtn.disabled = !state.running;
}

function tick() {
  const msLeft = state.endAt - Date.now();
  if (msLeft <= 0) {
    state.remaining = 0;
    completeSession();
    return;
  }
  state.remaining = Math.ceil(msLeft / 1000);
  render();
}

function startTimer() {
  if (state.running) return;
  if (state.remaining <= 0) state.remaining = fullDuration();

  ensureAudio();
  state.running = true;
  state.endAt = Date.now() + state.remaining * 1000;
  state.timerId = setInterval(tick, 250);
  statusEl.textContent = "Sayaç çalışıyor.";
  render();
}

function pauseTimer() {
  if (!state.running) return;
  state.remaining = Math.max(0, Math.ceil((state.endAt - Date.now()) / 1000));
  stopTimer();
  statusEl.textContent = "Sayaç duraklatıldı.";
  render();
}

function resetTimer() {
  stopTimer();
  state.remaining = fullDuration();
  statusEl.textContent = "Sayaç sıfırlandı.";
  render();
}

function completeSession() {
  const finishedMode = state.mode;
  stopTimer();
  state.remaining = 0;
  playChime();
  celebrate(finishedMode);

  if (finishedMode === "pomodoro") {
    state.completed += 1;
    state.totalMinutes += MODES.pomodoro.minutes;
    saveStats();
    statusEl.textContent = "Odaklanma tamamlandı. İstatistikler güncellendi.";
  } else {
    statusEl.textContent = "Mola tamamlandı.";
  }

  render();
}

function selectMode(nextMode) {
  if (!MODES[nextMode]) return;
  stopTimer();
  state.mode = nextMode;
  state.remaining = fullDuration();
  statusEl.textContent = `${MODES[nextMode].title} seçildi.`;
  render();
}

function resetStats() {
  const confirmed = window.confirm("İstatistikler silinsin mi? Bu işlem geri alınamaz.");
  if (!confirmed) return;
  state.completed = 0;
  state.totalMinutes = 0;
  localStorage.removeItem(STORAGE_KEY);
  statusEl.textContent = "İstatistikler sıfırlandı.";
  render();
}

startBtn.addEventListener("click", startTimer);
pauseBtn.addEventListener("click", pauseTimer);
resetBtn.addEventListener("click", resetTimer);
resetStatsBtn.addEventListener("click", resetStats);
modeButtons.forEach((button) => {
  button.addEventListener("click", () => selectMode(button.dataset.mode));
});

loadStats();
render();
statusEl.textContent = "Hazır. Başlat ile odaklanmaya başlayın.";
