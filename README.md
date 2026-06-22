# ⚡ StudyFlow AI
### Smart Productivity Dashboard for College Students

A complete desktop productivity application built with Electron.js, featuring task management, focus timer, analytics, gamification, and more.

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** v18 or higher — https://nodejs.org
- **npm** (comes with Node.js)
- **Windows 10/11** (for .exe build)

---

## 📦 Installation

### Step 1 — Clone / Extract the project
```
studyflow-ai/
```

### Step 2 — Install dependencies
Open a terminal inside the `studyflow-ai` folder and run:
```bash
npm install
```

> Note: `better-sqlite3` is a native module. If it fails to install, run:
> ```bash
> npm install --build-from-source
> ```
> Or install `windows-build-tools` first:
> ```bash
> npm install --global windows-build-tools
> ```

### Step 3 — Run the app
```bash
npm start
```

---

## 🏗 Build Windows Executable

### Build installer (.exe with NSIS)
```bash
npm run build
```

This creates:
- `dist/StudyFlow AI Setup 1.0.0.exe` — Installable Windows setup
- `dist/StudyFlow AI 1.0.0.exe` — Portable executable

### Build directory (no installer)
```bash
npm run build:dir
```

---

## 📁 Project Structure

```
studyflow-ai/
├── src/
│   ├── main/
│   │   ├── main.js          ← Electron main process
│   │   ├── preload.js       ← Secure IPC bridge
│   │   └── database.js      ← SQLite database layer
│   └── renderer/
│       ├── index.html       ← Main app window
│       ├── widget.html      ← Floating widget window
│       ├── app.js           ← All page logic & UI
│       └── styles/
│           └── main.css     ← Complete stylesheet + themes
├── assets/
│   └── icons/               ← App icons
├── package.json
└── README.md
```

---

## 🗄 Database

SQLite database is stored at:
```
%APPDATA%\studyflow-ai\studyflow.db
```

### Schema Overview
| Table | Purpose |
|-------|---------|
| `tasks` | All tasks with category, priority, XP |
| `sessions` | Focus/study sessions |
| `xp_log` | XP history |
| `streaks` | Daily streak tracking |
| `notes` | Quick notes |
| `wellness` | Daily health tracking |
| `achievements` | Earned badges |
| `settings` | App configuration |
| `planner_entries` | Daily plans |

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🎯 Task Management | Add, edit, complete tasks across 9 categories |
| ⚡ XP & Levels | Earn XP for tasks, level up, earn badges |
| 🔥 Streaks | Daily study streak counter |
| ⏱ Focus Timer | Pomodoro, countdown, stopwatch |
| 📊 Analytics | Chart.js charts for all study data |
| 📅 Planner | AI-generated daily schedule |
| 📝 Notes | Pinnable rich notes with search |
| 💧 Wellness | Water, exercise, sleep tracking |
| 🏆 Achievements | 8 achievement badges |
| 🎨 Themes | Dark, Light, Blue, Cyberpunk, Minimal |
| 🔔 Notifications | Desktop notifications with reminders |
| ◈ Widget | Always-on-top floating widget |
| ⚙️ System Tray | Runs in tray after window close |

---

## 🎨 Themes

- **Dark** — Deep space indigo (default)
- **Light** — Clean professional white
- **Blue** — Ocean deep blue
- **Cyberpunk** — Electric cyan + pink
- **Minimal** — Clean monochrome

---

## 🔧 Troubleshooting

**App won't start:**
- Make sure Node.js v18+ is installed
- Run `npm install` again
- Try `npm start` from inside the project folder

**Database errors:**
- The DB auto-creates on first launch
- Delete `%APPDATA%\studyflow-ai\studyflow.db` to reset

**Build fails:**
- Install Visual Studio Build Tools for native modules
- Or use `npm install --build-from-source`

**Widget not visible:**
- Click the ◈ button in the titlebar to toggle the widget

---

## 📈 Roadmap Ideas

- Cloud sync with Firebase
- AI-generated study plans via API
- Pomodoro sound effects
- Calendar integration
- Export analytics to PDF
- Mobile companion app

---

Built with ❤️ using Electron.js, SQLite, Chart.js
