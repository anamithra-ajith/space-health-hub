/**
 * ASTRONAUT HEALTH MONITORING DASHBOARD - APP JAVASCRIPT
 * Real-time Telemetry, Critical Alert Trigger Engine, ECG Waveform & Multi-metric Chart
 */

(function () {
  'use strict';

  // --- AUDIO SYNTHESIZER (Web Audio API) ---
  let audioCtx = null;
  let isMuted = false;
  let lastSoundPlayedAt = 0;

  function initAudio() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playAlertSound(type) {
    if (isMuted) return;
    const now = Date.now();
    // Throttle sound to prevent audio spam (min 2.5s between beeps)
    if (now - lastSoundPlayedAt < 2500) return;
    lastSoundPlayedAt = now;

    try {
      initAudio();
      if (!audioCtx) return;

      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      const currentTime = audioCtx.currentTime;

      if (type === 'critical') {
        // High-low emergency siren tone
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, currentTime);
        osc.frequency.setValueAtTime(659.25, currentTime + 0.15);
        osc.frequency.setValueAtTime(880, currentTime + 0.3);
        osc.frequency.setValueAtTime(659.25, currentTime + 0.45);

        gainNode.gain.setValueAtTime(0.18, currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, currentTime + 0.65);

        osc.start(currentTime);
        osc.stop(currentTime + 0.65);
      } else if (type === 'warning') {
        // Soft double advisory chime
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, currentTime); // D5
        osc.frequency.setValueAtTime(783.99, currentTime + 0.12); // G5

        gainNode.gain.setValueAtTime(0.15, currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, currentTime + 0.35);

        osc.start(currentTime);
        osc.stop(currentTime + 0.35);
      }
    } catch (e) {
      console.warn('Audio synthesis not permitted or failed', e);
    }
  }

  // --- STATE DEFINITION ---
  const state = {
    // Current physiological parameters
    telemetry: {
      heartRate: 72,        // bpm
      oxygen: 98.2,         // % (SpO2)
      temperature: 36.8,    // °C
      sleepDuration: 7.4,   // hours (past 24h cycle)
      exerciseTime: 78      // minutes (today)
    },

    // Units & Settings
    tempUnit: 'C',          // 'C' or 'F'
    isLive: true,           // stream running or paused
    updateIntervalMs: 1500, // telemetry refresh interval
    timerId: null,

    // Environmental / Suit support extras
    suit: {
      pressure: 4.3,        // psi (nominal EVA suit)
      co2: 0.18,            // %
      radiation: 16.4,      // µSv/h
      suitBattery: 92       // %
    },

    // Mission Time Reference (Day 142, 09:42:15 at load time)
    missionElapsedSeconds: 142 * 86400 + 9 * 3600 + 42 * 60 + 15,

    // History buffer for trend chart (last 25 points)
    history: {
      timestamps: [],
      hr: [],
      oxygen: [],
      temp: []
    },

    // Alert tracking
    activeAlerts: [],
    acknowledgedAlertKeys: new Set(),
    alertLogs: []
  };

  // --- THRESHOLD CONSTANTS ---
  const THRESHOLDS = {
    heartRate: {
      normalMin: 55,
      normalMax: 100,
      warningLowMin: 50,
      warningHighMax: 120
      // Critical: < 50 (bradycardia) or > 120 (tachycardia / extreme exertion)
    },
    oxygen: {
      normalMin: 95.0,
      warningMin: 90.0
      // Critical: < 90.0 (Hypoxia / suit cabin pressure breach)
    },
    temperature: {
      // in °C
      normalMin: 36.2,
      normalMax: 37.5,
      warningLowMin: 35.5,
      warningHighMax: 38.3
      // Critical: < 35.5 (hypothermia) or > 38.3 (fever / hyperthermia)
    },
    sleepDuration: {
      // in hours
      target: 8.0,
      normalMin: 7.0,
      warningMin: 5.5
      // Critical: < 5.5 hours
    },
    exerciseTime: {
      // in minutes (NASA target = 120 mins countermeasure daily)
      target: 120,
      normalMin: 90,
      warningMin: 45
      // Critical: < 45 minutes
    }
  };

  // --- EVALUATION HELPERS ---
  function evaluateMetric(key, val) {
    if (key === 'oxygen') {
      if (val < THRESHOLDS.oxygen.warningMin) {
        return { status: 'critical', msg: `Critical Hypoxia detected! SpO2 at ${val.toFixed(1)}% (< 90%). Emergency O2 flow triggered.` };
      }
      if (val < THRESHOLDS.oxygen.normalMin) {
        return { status: 'warning', msg: `Oxygen saturation sub-optimal: ${val.toFixed(1)}% (90-94%). Monitor cabin regulator.` };
      }
      return { status: 'normal', msg: 'Oxygen saturation nominal.' };
    }

    if (key === 'heartRate') {
      if (val > THRESHOLDS.heartRate.warningHighMax) {
        return { status: 'critical', msg: `Tachycardia alert! Heart rate at ${Math.round(val)} BPM (> 120 BPM). Reduce exertion.` };
      }
      if (val < THRESHOLDS.heartRate.warningLowMin) {
        return { status: 'critical', msg: `Severe Bradycardia alert! Heart rate at ${Math.round(val)} BPM (< 50 BPM). Medical intervention flag.` };
      }
      if (val > THRESHOLDS.heartRate.normalMax || val < THRESHOLDS.heartRate.normalMin) {
        return { status: 'warning', msg: `Elevated cardiac activity: ${Math.round(val)} BPM. Caution during physical tasks.` };
      }
      return { status: 'normal', msg: 'Cardiovascular rhythm stable.' };
    }

    if (key === 'temperature') {
      // evaluated in °C internally
      if (val > THRESHOLDS.temperature.warningHighMax) {
        return { status: 'critical', msg: `Hyperthermia / High core fever! Body temp at ${val.toFixed(1)}°C (> 38.3°C). Suit liquid cooling maxed.` };
      }
      if (val < THRESHOLDS.temperature.warningLowMin) {
        return { status: 'critical', msg: `Hypothermia hazard! Body temp at ${val.toFixed(1)}°C (< 35.5°C). Thermal garment failure risk.` };
      }
      if (val > THRESHOLDS.temperature.normalMax || val < THRESHOLDS.temperature.normalMin) {
        return { status: 'warning', msg: `Mild thermal variation: ${val.toFixed(1)}°C. Adjust bio-suit thermo-regulator.` };
      }
      return { status: 'normal', msg: 'Thermoregulation nominal.' };
    }

    if (key === 'sleepDuration') {
      if (val < THRESHOLDS.sleepDuration.warningMin) {
        return { status: 'critical', msg: `Severe Sleep Deficit! Rest duration at ${val.toFixed(1)} hrs (< 5.5 hrs). Cognitive impairment risk.` };
      }
      if (val < THRESHOLDS.sleepDuration.normalMin) {
        return { status: 'warning', msg: `Sub-optimal sleep: ${val.toFixed(1)} hrs. Target is 8.0 hrs.` };
      }
      return { status: 'normal', msg: 'Rest and circadian cycle optimal.' };
    }

    if (key === 'exerciseTime') {
      if (val < THRESHOLDS.exerciseTime.warningMin) {
        return { status: 'critical', msg: `Countermeasure Deficit! Only ${Math.round(val)} mins active (< 45 mins). Microgravity bone/muscle atrophy risk.` };
      }
      if (val < THRESHOLDS.exerciseTime.normalMin) {
        return { status: 'warning', msg: `Exercise under quota: ${Math.round(val)} / 120 mins completed.` };
      }
      return { status: 'normal', msg: 'Countermeasure regimen satisfactory.' };
    }

    return { status: 'normal', msg: 'Nominal.' };
  }

  // --- OVERALL HEALTH STATUS DETERMINATION ---
  function computeOverallStatus() {
    const statuses = [
      evaluateMetric('oxygen', state.telemetry.oxygen).status,
      evaluateMetric('heartRate', state.telemetry.heartRate).status,
      evaluateMetric('temperature', state.telemetry.temperature).status,
      evaluateMetric('sleepDuration', state.telemetry.sleepDuration).status,
      evaluateMetric('exerciseTime', state.telemetry.exerciseTime).status
    ];

    if (statuses.includes('critical')) return 'critical';
    if (statuses.includes('warning')) return 'warning';
    return 'normal';
  }

  // --- LOGGING ENGINE ---
  function addLog(status, message) {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    const logItem = {
      id: Math.random().toString(36).substring(2, 9),
      time: timeStr,
      status: status,
      msg: message
    };

    // Prepend to array
    state.alertLogs.unshift(logItem);
    if (state.alertLogs.length > 50) state.alertLogs.pop();

    renderLogs();
  }

  function renderLogs() {
    const container = document.getElementById('logList');
    if (!container) return;

    if (state.alertLogs.length === 0) {
      container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.75rem; font-family: var(--font-mono); padding: 8px;">No alert events recorded. All systems operational.</div>';
      return;
    }

    let html = '';
    state.alertLogs.slice(0, 20).forEach(log => {
      html += `
        <div class="log-entry ${log.status}">
          <span class="log-time">[${log.time}]</span>
          <span class="log-desc">${log.msg}</span>
          <span class="log-status-tag">${log.status}</span>
        </div>
      `;
    });
    container.innerHTML = html;
  }

  // --- DOM CACHE & INITIALIZATION ---
  const DOM = {};

  function cacheDOM() {
    DOM.masterHealthBadge = document.getElementById('masterHealthBadge');
    DOM.masterHealthText = document.getElementById('masterHealthText');

    DOM.alertBanner = document.getElementById('alertBanner');
    DOM.alertBannerTitle = document.getElementById('alertBannerTitle');
    DOM.alertBannerDesc = document.getElementById('alertBannerDesc');
    DOM.btnAckAlert = document.getElementById('btnAckAlert');

    DOM.valHeartRate = document.getElementById('valHeartRate');
    DOM.badgeHeartRate = document.getElementById('badgeHeartRate');
    DOM.cardHeartRate = document.getElementById('cardHeartRate');

    DOM.valOxygen = document.getElementById('valOxygen');
    DOM.badgeOxygen = document.getElementById('badgeOxygen');
    DOM.cardOxygen = document.getElementById('cardOxygen');
    DOM.o2FillBar = document.getElementById('o2FillBar');

    DOM.valTemp = document.getElementById('valTemp');
    DOM.unitTemp = document.getElementById('unitTemp');
    DOM.badgeTemp = document.getElementById('badgeTemp');
    DOM.cardTemp = document.getElementById('cardTemp');
    DOM.btnToggleTemp = document.getElementById('btnToggleTemp');
    DOM.tempFillBar = document.getElementById('tempFillBar');

    DOM.valSleep = document.getElementById('valSleep');
    DOM.badgeSleep = document.getElementById('badgeSleep');
    DOM.cardSleep = document.getElementById('cardSleep');
    DOM.sleepDeep = document.getElementById('sleepDeep');
    DOM.sleepRem = document.getElementById('sleepRem');
    DOM.sleepLight = document.getElementById('sleepLight');

    DOM.valExercise = document.getElementById('valExercise');
    DOM.badgeExercise = document.getElementById('badgeExercise');
    DOM.cardExercise = document.getElementById('cardExercise');
    DOM.exerciseFillBar = document.getElementById('exerciseFillBar');

    // Clocks
    DOM.clockMET = document.getElementById('clockMET');
    DOM.clockUTC = document.getElementById('clockUTC');

    // Controls
    DOM.btnToggleAudio = document.getElementById('btnToggleAudio');
    DOM.btnToggleLive = document.getElementById('btnToggleLive');
    DOM.btnTestSound = document.getElementById('btnTestSound');
    DOM.sliderHr = document.getElementById('sliderHr');
    DOM.sliderO2 = document.getElementById('sliderO2');
    DOM.sliderTemp = document.getElementById('sliderTemp');
    DOM.sliderSleep = document.getElementById('sliderSleep');
    DOM.sliderExercise = document.getElementById('sliderExercise');

    // Value Labels for sliders
    DOM.previewHr = document.getElementById('previewHr');
    DOM.previewO2 = document.getElementById('previewO2');
    DOM.previewTemp = document.getElementById('previewTemp');
    DOM.previewSleep = document.getElementById('previewSleep');
    DOM.previewExercise = document.getElementById('previewExercise');

    DOM.btnClearLog = document.getElementById('btnClearLog');
  }

  // --- TIME FORMATTERS ---
  function formatMET(totalSecs) {
    const days = Math.floor(totalSecs / 86400);
    const rem = totalSecs % 86400;
    const hrs = Math.floor(rem / 3600).toString().padStart(2, '0');
    const mins = Math.floor((rem % 3600) / 60).toString().padStart(2, '0');
    const secs = (rem % 60).toString().padStart(2, '0');
    return `DAY ${days} • ${hrs}:${mins}:${secs}`;
  }

  function formatUTC() {
    const d = new Date();
    const iso = d.toISOString();
    return iso.replace('T', ' ').substring(0, 19) + ' UTC';
  }

  function updateClocks() {
    state.missionElapsedSeconds += 1;
    if (DOM.clockMET) DOM.clockMET.textContent = formatMET(state.missionElapsedSeconds);
    if (DOM.clockUTC) DOM.clockUTC.textContent = formatUTC();
  }

  // --- CORE UI UPDATE ---
  let lastMasterStatus = 'normal';

  function updateUI() {
    const { heartRate, oxygen, temperature, sleepDuration, exerciseTime } = state.telemetry;

    // 1. Heart Rate
    const hrEval = evaluateMetric('heartRate', heartRate);
    DOM.valHeartRate.textContent = Math.round(heartRate);
    DOM.badgeHeartRate.textContent = hrEval.status.toUpperCase();
    DOM.badgeHeartRate.className = `param-badge ${hrEval.status}`;
    DOM.cardHeartRate.className = `param-card status-${hrEval.status}`;

    // 2. Oxygen SpO2
    const o2Eval = evaluateMetric('oxygen', oxygen);
    DOM.valOxygen.textContent = oxygen.toFixed(1);
    DOM.badgeOxygen.textContent = o2Eval.status.toUpperCase();
    DOM.badgeOxygen.className = `param-badge ${o2Eval.status}`;
    DOM.cardOxygen.className = `param-card status-${o2Eval.status}`;
    const o2PercentClamped = Math.min(100, Math.max(0, oxygen));
    DOM.o2FillBar.style.width = `${o2PercentClamped}%`;
    DOM.o2FillBar.className = `target-fill-bar ${o2Eval.status}`;

    // 3. Body Temperature
    const tempEval = evaluateMetric('temperature', temperature);
    let displayTemp = temperature;
    if (state.tempUnit === 'F') {
      displayTemp = (temperature * 9 / 5) + 32;
    }
    DOM.valTemp.textContent = displayTemp.toFixed(1);
    DOM.unitTemp.textContent = `°${state.tempUnit}`;
    DOM.badgeTemp.textContent = tempEval.status.toUpperCase();
    DOM.badgeTemp.className = `param-badge ${tempEval.status}`;
    DOM.cardTemp.className = `param-card status-${tempEval.status}`;
    // Fill bar normalized between 34°C (0%) and 41°C (100%)
    const tempNorm = Math.min(100, Math.max(0, ((temperature - 34) / (41 - 34)) * 100));
    DOM.tempFillBar.style.width = `${tempNorm}%`;
    DOM.tempFillBar.className = `target-fill-bar ${tempEval.status}`;

    // 4. Sleep Duration
    const sleepEval = evaluateMetric('sleepDuration', sleepDuration);
    DOM.valSleep.textContent = sleepDuration.toFixed(1);
    DOM.badgeSleep.textContent = sleepEval.status.toUpperCase();
    DOM.badgeSleep.className = `param-badge ${sleepEval.status}`;
    DOM.cardSleep.className = `param-card status-${sleepEval.status}`;
    // Dynamic sleep segments
    const deepHrs = Math.max(0.5, (sleepDuration * 0.28)).toFixed(1);
    const remHrs = Math.max(0.5, (sleepDuration * 0.24)).toFixed(1);
    const lightHrs = Math.max(0.5, (sleepDuration - deepHrs - remHrs)).toFixed(1);
    DOM.sleepDeep.style.width = `${(deepHrs / sleepDuration) * 100}%`;
    DOM.sleepRem.style.width = `${(remHrs / sleepDuration) * 100}%`;
    DOM.sleepLight.style.width = `${(lightHrs / sleepDuration) * 100}%`;

    // 5. Exercise Time
    const exEval = evaluateMetric('exerciseTime', exerciseTime);
    DOM.valExercise.textContent = Math.round(exerciseTime);
    DOM.badgeExercise.textContent = exEval.status.toUpperCase();
    DOM.badgeExercise.className = `param-badge ${exEval.status}`;
    DOM.cardExercise.className = `param-card status-${exEval.status}`;
    const exPercent = Math.min(100, Math.max(0, (exerciseTime / THRESHOLDS.exerciseTime.target) * 100));
    DOM.exerciseFillBar.style.width = `${exPercent}%`;
    DOM.exerciseFillBar.className = `target-fill-bar ${exEval.status}`;

    // Update Slider inputs to reflect state (if not currently focused)
    if (document.activeElement !== DOM.sliderHr) DOM.sliderHr.value = Math.round(heartRate);
    if (document.activeElement !== DOM.sliderO2) DOM.sliderO2.value = oxygen.toFixed(1);
    if (document.activeElement !== DOM.sliderTemp) DOM.sliderTemp.value = temperature.toFixed(1);
    if (document.activeElement !== DOM.sliderSleep) DOM.sliderSleep.value = sleepDuration.toFixed(1);
    if (document.activeElement !== DOM.sliderExercise) DOM.sliderExercise.value = Math.round(exerciseTime);

    DOM.previewHr.textContent = `${Math.round(heartRate)} bpm`;
    DOM.previewO2.textContent = `${oxygen.toFixed(1)}%`;
    DOM.previewTemp.textContent = `${temperature.toFixed(1)}°C`;
    DOM.previewSleep.textContent = `${sleepDuration.toFixed(1)}h`;
    DOM.previewExercise.textContent = `${Math.round(exerciseTime)}m`;

    // Overall Status
    const overall = computeOverallStatus();
    DOM.masterHealthBadge.className = `master-health-badge status-${overall}`;
    DOM.masterHealthText.textContent = overall.toUpperCase();

    // Check for Critical and Warning Alerts
    handleAlertTriggers(overall, [
      { key: 'oxygen', eval: o2Eval },
      { key: 'heartRate', eval: hrEval },
      { key: 'temperature', eval: tempEval },
      { key: 'sleepDuration', eval: sleepEval },
      { key: 'exerciseTime', eval: exEval }
    ]);

    // Track status transition for logging & sound
    if (overall !== lastMasterStatus) {
      if (overall === 'critical') {
        playAlertSound('critical');
      } else if (overall === 'warning') {
        playAlertSound('warning');
      }
      lastMasterStatus = overall;
    }
  }

  // --- AUTOMATED ALERT TRIGGER ENGINE ---
  let currentActiveBannerKey = null;

  function handleAlertTriggers(overall, metrics) {
    // Find the most urgent alert
    const criticalMetric = metrics.find(m => m.eval.status === 'critical');
    const warningMetric = metrics.find(m => m.eval.status === 'warning');

    if (criticalMetric) {
      const alertKey = `critical-${criticalMetric.key}`;
      DOM.alertBanner.className = 'alert-banner active';
      DOM.alertBannerTitle.textContent = `CRITICAL ALERT: ${criticalMetric.key.toUpperCase()} BREACH`;
      DOM.alertBannerDesc.textContent = criticalMetric.eval.msg;

      // Log if not yet recorded in current episode
      if (currentActiveBannerKey !== alertKey) {
        currentActiveBannerKey = alertKey;
        addLog('critical', criticalMetric.eval.msg);
        playAlertSound('critical');
      }
    } else if (warningMetric) {
      const alertKey = `warning-${warningMetric.key}`;
      DOM.alertBanner.className = 'alert-banner active warning-level';
      DOM.alertBannerTitle.textContent = `ADVISORY WARNING: ${warningMetric.key.toUpperCase()}`;
      DOM.alertBannerDesc.textContent = warningMetric.eval.msg;

      if (currentActiveBannerKey !== alertKey) {
        currentActiveBannerKey = alertKey;
        addLog('warning', warningMetric.eval.msg);
        playAlertSound('warning');
      }
    } else {
      // Nominal
      DOM.alertBanner.className = 'alert-banner';
      if (currentActiveBannerKey !== null) {
        addLog('normal', 'All vital parameters returned to nominal thresholds.');
        currentActiveBannerKey = null;
      }
    }
  }

  // --- HISTORY BUFFER & CHART ENGINE ---
  function pushHistoryPoint() {
    const now = new Date();
    const timeLabel = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    state.history.timestamps.push(timeLabel);
    state.history.hr.push(state.telemetry.heartRate);
    state.history.oxygen.push(state.telemetry.oxygen);
    state.history.temp.push(state.telemetry.temperature);

    const maxPoints = 24;
    if (state.history.timestamps.length > maxPoints) {
      state.history.timestamps.shift();
      state.history.hr.shift();
      state.history.oxygen.shift();
      state.history.temp.shift();
    }

    renderTrendChart();
  }

  function initHistoryBuffer() {
    const baseHr = 72;
    const baseO2 = 98.4;
    const baseTemp = 36.8;

    for (let i = 20; i >= 0; i--) {
      const d = new Date(Date.now() - i * 15000);
      const label = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
      state.history.timestamps.push(label);
      state.history.hr.push(baseHr + (Math.sin(i * 0.4) * 3));
      state.history.oxygen.push(baseO2 + (Math.cos(i * 0.3) * 0.4));
      state.history.temp.push(baseTemp + (Math.sin(i * 0.2) * 0.1));
    }
  }

  // --- CANVAS CHART RENDERING ---
  function renderTrendChart() {
    const canvas = document.getElementById('trendChartCanvas');
    if (!canvas) return;

    // Handle high-DPI
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    // Clear background
    ctx.clearRect(0, 0, w, h);

    const padLeft = 40;
    const padRight = 16;
    const padTop = 18;
    const padBottom = 26;

    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    const gridRows = 4;
    for (let i = 0; i <= gridRows; i++) {
      const y = padTop + (plotH / gridRows) * i;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(w - padRight, y);
      ctx.stroke();
    }

    // Y Axis labels (Normalized 0 to 100%)
    ctx.fillStyle = '#64748b';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('140', padLeft - 6, padTop + 4);
    ctx.fillText('100', padLeft - 6, padTop + plotH * 0.35);
    ctx.fillText('60', padLeft - 6, padTop + plotH * 0.7);
    ctx.fillText('30', padLeft - 6, padTop + plotH);

    const count = state.history.timestamps.length;
    if (count < 2) return;

    // Helper to map series to Canvas Y coordinate
    // HR mapped to 40..150 bpm
    function hrToY(val) {
      const min = 40, max = 150;
      const norm = (val - min) / (max - min);
      return padTop + plotH * (1 - Math.max(0, Math.min(1, norm)));
    }

    // O2 mapped to 80..100%
    function o2ToY(val) {
      const min = 80, max = 100;
      const norm = (val - min) / (max - min);
      return padTop + plotH * (1 - Math.max(0, Math.min(1, norm)));
    }

    // Temp mapped to 34..40°C
    function tempToY(val) {
      const min = 34, max = 40;
      const norm = (val - min) / (max - min);
      return padTop + plotH * (1 - Math.max(0, Math.min(1, norm)));
    }

    // Draw Line Series helper
    function drawSeries(data, yMapping, strokeColor, glowColor) {
      ctx.save();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2.2;
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 6;
      ctx.beginPath();

      data.forEach((val, i) => {
        const x = padLeft + (plotW / (count - 1)) * i;
        const y = yMapping(val);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Current head point dot
      const lastX = padLeft + plotW;
      const lastY = yMapping(data[data.length - 1]);
      ctx.fillStyle = strokeColor;
      ctx.beginPath();
      ctx.arc(lastX, lastY, 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // Draw series
    drawSeries(state.history.hr, hrToY, '#ef4444', 'rgba(239, 68, 68, 0.4)');
    drawSeries(state.history.oxygen, o2ToY, '#00f0ff', 'rgba(0, 240, 255, 0.4)');
    drawSeries(state.history.temp, tempToY, '#f59e0b', 'rgba(245, 158, 11, 0.4)');

    // X axis time markers
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.font = '9px monospace';
    const firstTime = state.history.timestamps[0];
    const lastTime = state.history.timestamps[count - 1];
    ctx.fillText(firstTime, padLeft + 15, h - 8);
    ctx.fillText(lastTime, w - padRight - 15, h - 8);
  }

  // --- LIVE ECG CANVAS OSCILLOSCOPE ---
  let ecgAnimationId = null;
  let ecgPhase = 0;

  function initECG() {
    const canvas = document.getElementById('ecgCanvas');
    if (!canvas) return;

    function renderECG() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      }

      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      const w = rect.width;
      const h = rect.height;

      // Dark oscilloscope background
      ctx.fillStyle = 'rgba(6, 12, 24, 0.85)';
      ctx.fillRect(0, 0, w, h);

      // Subtle phosphor grid
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < w; x += 18) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = 0; y < h; y += 12) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();

      // ECG P-Q-R-S-T wave model
      const hr = state.telemetry.heartRate;
      // Frequency proportional to heart rate
      const speed = (hr / 60) * 0.045;
      ecgPhase = (ecgPhase + speed) % 1;

      // Draw trace
      ctx.strokeStyle = hr > 120 || hr < 50 ? '#ef4444' : '#10b981';
      ctx.shadowColor = hr > 120 || hr < 50 ? 'rgba(239, 68, 68, 0.8)' : 'rgba(16, 185, 129, 0.8)';
      ctx.shadowBlur = 8;
      ctx.lineWidth = 2;
      ctx.beginPath();

      const centerY = h * 0.55;

      for (let x = 0; x < w; x++) {
        // Position in cardiac cycle [0..1]
        const cycleProgress = ((x / w) * 2.8 - ecgPhase * 2.8) % 1;
        const normCycle = cycleProgress < 0 ? cycleProgress + 1 : cycleProgress;

        let yOffset = 0;
        // P wave
        if (normCycle > 0.15 && normCycle < 0.22) {
          yOffset = -Math.sin((normCycle - 0.15) / 0.07 * Math.PI) * (h * 0.15);
        }
        // Q dip
        else if (normCycle >= 0.28 && normCycle < 0.31) {
          yOffset = Math.sin((normCycle - 0.28) / 0.03 * Math.PI) * (h * 0.12);
        }
        // R peak (massive spike)
        else if (normCycle >= 0.31 && normCycle < 0.36) {
          yOffset = -Math.sin((normCycle - 0.31) / 0.05 * Math.PI) * (h * 0.45);
        }
        // S dip
        else if (normCycle >= 0.36 && normCycle < 0.40) {
          yOffset = Math.sin((normCycle - 0.36) / 0.04 * Math.PI) * (h * 0.18);
        }
        // T wave
        else if (normCycle >= 0.50 && normCycle < 0.65) {
          yOffset = -Math.sin((normCycle - 0.50) / 0.15 * Math.PI) * (h * 0.22);
        }

        const y = centerY + yOffset;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ecgAnimationId = requestAnimationFrame(renderECG);
    }

    renderECG();
  }

  // --- TELEMETRY SIMULATION STEP ---
  function simulationTick() {
    if (!state.isLive) return;

    // Small organic physiological fluctuations
    const hrNoise = (Math.random() - 0.5) * 1.4;
    const o2Noise = (Math.random() - 0.5) * 0.25;
    const tempNoise = (Math.random() - 0.5) * 0.04;

    // Natural exercise burn increment (0.05 min per tick if not static)
    state.telemetry.exerciseTime = Math.min(180, state.telemetry.exerciseTime + 0.015);

    // Apply fluctuations while keeping within sensible absolute ranges
    state.telemetry.heartRate = Math.max(30, Math.min(180, state.telemetry.heartRate + hrNoise));
    state.telemetry.oxygen = Math.max(70, Math.min(100, state.telemetry.oxygen + o2Noise));
    state.telemetry.temperature = Math.max(34.0, Math.min(41.5, state.telemetry.temperature + tempNoise));

    updateUI();
    pushHistoryPoint();
  }

  function startSimulation() {
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = setInterval(simulationTick, state.updateIntervalMs);
  }

  function toggleLiveStream() {
    state.isLive = !state.isLive;
    if (DOM.btnToggleLive) {
      if (state.isLive) {
        DOM.btnToggleLive.innerHTML = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Pause Feed';
        DOM.btnToggleLive.className = 'sim-action-btn';
      } else {
        DOM.btnToggleLive.innerHTML = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Resume Feed';
        DOM.btnToggleLive.className = 'sim-action-btn paused';
      }
    }
  }

  // --- SCENARIO PRESETS ---
  function applyScenario(scenarioKey) {
    initAudio(); // User interaction unlocks audio
    switch (scenarioKey) {
      case 'nominal':
        state.telemetry.heartRate = 72;
        state.telemetry.oxygen = 98.4;
        state.telemetry.temperature = 36.8;
        state.telemetry.sleepDuration = 7.6;
        state.telemetry.exerciseTime = 85;
        addLog('normal', 'Scenario Injected: Baseline Resting Astronaut Telemetry.');
        break;

      case 'hypoxia':
        // Critical: Oxygen < 90%
        state.telemetry.oxygen = 87.2;
        state.telemetry.heartRate = 114; // compensatory tachycardia
        state.telemetry.temperature = 36.9;
        addLog('critical', 'Simulation Triggered: Severe Cabin Decompression / Hypoxia event.');
        break;

      case 'tachycardia':
        // Critical: Heart Rate > 120 bpm
        state.telemetry.heartRate = 142;
        state.telemetry.oxygen = 96.0;
        state.telemetry.temperature = 37.4;
        addLog('critical', 'Simulation Triggered: Cardiac Arrythmia / Extreme High Workload.');
        break;

      case 'fever':
        // Critical: Body Temp > 38.3°C
        state.telemetry.temperature = 39.2;
        state.telemetry.heartRate = 104;
        state.telemetry.oxygen = 95.5;
        addLog('critical', 'Simulation Triggered: Extreme Hyperthermia / Suit Heat Exchanger Failure.');
        break;

      case 'sleep_deprived':
        // Warning / Critical Sleep Duration
        state.telemetry.sleepDuration = 4.2;
        state.telemetry.heartRate = 86;
        state.telemetry.oxygen = 97.2;
        addLog('warning', 'Simulation Triggered: Chronic Sleep Deficit / High Fatigue Alert.');
        break;

      case 'eva_spacewalk':
        // High exercise & active workload
        state.telemetry.heartRate = 115;
        state.telemetry.oxygen = 95.8;
        state.telemetry.exerciseTime = 135;
        state.telemetry.temperature = 37.3;
        addLog('warning', 'Simulation Triggered: EVA Airlock Ingress / Heavy Exertion.');
        break;
    }

    updateUI();
    pushHistoryPoint();
  }

  // --- EVENT LISTENERS ---
  function setupEvents() {
    // Clocks ticker
    setInterval(updateClocks, 1000);

    // Audio Mute Toggle
    DOM.btnToggleAudio.addEventListener('click', () => {
      initAudio();
      isMuted = !isMuted;
      DOM.btnToggleAudio.innerHTML = isMuted
        ? '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"></path></svg> Sound: OFF'
        : '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path></svg> Sound: ON';
      DOM.btnToggleAudio.classList.toggle('active', !isMuted);
    });

    // Test Sound Button
    DOM.btnTestSound.addEventListener('click', () => {
      initAudio();
      playAlertSound('critical');
    });

    // Pause / Resume Feed
    DOM.btnToggleLive.addEventListener('click', toggleLiveStream);

    // Temperature Unit Toggle
    DOM.btnToggleTemp.addEventListener('click', () => {
      state.tempUnit = state.tempUnit === 'C' ? 'F' : 'C';
      DOM.btnToggleTemp.textContent = `Unit: °${state.tempUnit}`;
      updateUI();
    });

    // Acknowledge Alert Banner
    DOM.btnAckAlert.addEventListener('click', () => {
      DOM.alertBanner.className = 'alert-banner';
      addLog('normal', 'Current alert acknowledged by Flight Surgeon / Operator.');
    });

    // Clear Logs
    DOM.btnClearLog.addEventListener('click', () => {
      state.alertLogs = [];
      renderLogs();
    });

    // Sliders Real-time input
    DOM.sliderHr.addEventListener('input', (e) => {
      state.telemetry.heartRate = parseFloat(e.target.value);
      updateUI();
    });

    DOM.sliderO2.addEventListener('input', (e) => {
      state.telemetry.oxygen = parseFloat(e.target.value);
      updateUI();
    });

    DOM.sliderTemp.addEventListener('input', (e) => {
      state.telemetry.temperature = parseFloat(e.target.value);
      updateUI();
    });

    DOM.sliderSleep.addEventListener('input', (e) => {
      state.telemetry.sleepDuration = parseFloat(e.target.value);
      updateUI();
    });

    DOM.sliderExercise.addEventListener('input', (e) => {
      state.telemetry.exerciseTime = parseFloat(e.target.value);
      updateUI();
    });

    // Scenario preset buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const scenario = btn.getAttribute('data-scenario');
        if (scenario) applyScenario(scenario);
      });
    });

    // Window resize handler for canvas
    window.addEventListener('resize', () => {
      renderTrendChart();
    });
  }

  // --- APP BOOTSTRAP ---
  window.addEventListener('DOMContentLoaded', () => {
    cacheDOM();
    setupEvents();
    initHistoryBuffer();
    initECG();
    updateClocks();
    updateUI();
    renderLogs();
    startSimulation();

    // Log initial system boot
    addLog('normal', 'Bio-telemetry uplink established. Sensor suite calibration: PASS.');
  });

})();
