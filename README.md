# 🚀 Astronaut Health Monitoring Dashboard

A futuristic, high-fidelity single-page web app for real-time monitoring of a single astronaut's vital physiological parameters and mission telemetry.

Built strictly with **HTML5, CSS3, and Vanilla JavaScript** — zero frameworks, no Node.js or Python backend required.

---

## 🛰️ Key Features

### 1. Real-Time Health Parameters
- **Heart Rate (BPM)**:
  - Dynamic readout with status categorization (*Normal: 55–100 BPM*, *Warning: 101–120 or 50–54 BPM*, *Critical: >120 or <50 BPM*).
  - **Live animated ECG Oscilloscope** drawing real-time cardiac cycles (P-Q-R-S-T waves) synchronized to the astronaut's active heart rate.
- **Oxygen Saturation (SpO2 %)**:
  - Precision blood oxygen gauge bar.
  - Automated threshold: *Nominal ≥95%*, *Advisory 90–94%*, **Critical <90%** (triggers immediate emergency hypoxia alarm).
- **Body Temperature**:
  - Interactive thermometer indicator.
  - One-click **°C / °F toggle** switch.
  - Normal (36.2–37.5°C / 97.2–99.5°F), Warning (37.6–38.3°C), Critical (>38.3°C or <35.5°C).
- **Sleep & Rest Duration**:
  - Daily sleep tracking against the 8.0-hour astronaut circadian target.
  - Visual stage breakdown: **Deep Sleep**, **REM**, and **Light Sleep**.
- **Exercise & Physical Countermeasures**:
  - Daily active workout tracker measuring progress against the NASA microgravity countermeasure quota (120 minutes/day for bone density and muscle mass preservation).
  - Real-time active calorie expenditure calculation.

### 2. Comprehensive Health-Status Indicators
- **Master Status Badge**: Located in the top HUD, dynamically states **NORMAL**, **WARNING**, or **CRITICAL** with color-coded pulses:
  - 🟢 **NORMAL**: Emerald green glow.
  - 🟡 **WARNING**: Amber advisory warning pulse.
  - 🔴 **CRITICAL**: Flashing red strobe alert.
- Per-parameter status pills and top-border indicators on each card.

### 3. Automated Critical Alert Triggers
- **Emergency Alert Banner**: Slides down immediately when any parameter breaches safe operational limits (e.g. Oxygen < 90%, Tachycardia > 120 BPM, Hyperthermia > 38.3°C).
- **Web Audio API Synthesizer**: Generates an audible two-tone emergency alarm for critical triggers and soft chimes for advisory warnings (includes a **Sound: ON/OFF** toggle).
- **Automated Event Log**: Timestamped record of all triggers, advisory warnings, and resolutions with a one-click log clearing option.

### 4. Mission Day & Time Tracking
- **Mission Elapsed Time (MET)**: Real-time ticking counter (e.g. `DAY 142 • 09:42:15`).
- **Coordinated Universal Time (UTC)**: Live synchronized mission clock.

### 5. Multi-Channel Historical Telemetry Graph
- HTML5 Canvas multi-line chart displaying the last 25 telemetry readings for **Heart Rate**, **SpO2**, and **Body Temperature** with color-coded legends and gridlines.

### 6. Interactive Anomaly Injection & Simulation Deck
- **Quick Preset Scenarios**:
  - `Baseline Nominal`: Restores standard resting vitals.
  - `EVA Exertion`: High heart rate and elevated countermeasure burn.
  - `CRITICAL: Hypoxia (O2 < 90%)`: Simulates suit pressure breach / oxygen regulator failure.
  - `CRITICAL: Tachycardia (HR > 120)`: Simulates severe cardiac strain.
  - `CRITICAL: Hyperthermia (> 38.3°C)`: Simulates thermal control subsystem failure.
  - `Sleep Deprivation`: Simulates chronic microgravity sleep deficit.
- **Fine-Tuning Sliders**: Interactively adjust Heart Rate, Oxygen, Temperature, Sleep, and Exercise values to test any threshold or combination in real time.
- **Feed Controls**: Pause/Resume live telemetry feed and test audio alert chime.

---

## 💻 How to Run

Simply open `index.html` in any modern web browser (Google Chrome, Microsoft Edge, Firefox, Safari):

```bash
# On Windows PowerShell
Start-Process "C:\Users\aryaa\.gemini\antigravity\scratch\astronaut-health-dashboard\index.html"
```

Or double-click `index.html` in your file explorer. No web server, dependencies, or installations needed!
