# Arcade Leaderboard Agent Guidelines

This document contains rules, logic specifications, and design guidelines for AI agents working in this repository.

## Project Architecture

This is a client-side, zero-backend web application hosted on GitHub Pages. It must remain static and dependency-free.
* **Entry Point**: `index.html` in the root directory.
* **Assets**: All stylesheets and scripts must be placed in the `assets/` folder (`assets/style.css` and `assets/app.js`).
* **Libraries**: Client-side libraries (html2canvas, jsPDF, JSZip) are loaded via CDN in `index.html`. Do not install npm packages or add build steps.

## Coding Style & Principles

* **Readability**: Code must be spacious, consistent, and easy to scan. Minimizing cognitive load is preferred.
* **Anti-Nesting**: Prefer flat logic, early returns, and clear branching to keep indentation shallow.
* **Naming Conventions**: Use `snake_case` for local backend/system-level scripting variables and data models. Use standard camelCase for DOM elements and native web API interactions.
* **Error Handling**: Value truth over safety. Let local parsing errors throw/crash during developer testing so that issues are immediately visible.
* **Privacy Standard**: Never bake participant details (names, emails, or phone numbers) into default code arrays or scripts. All imports must happen purely in-memory in the user's browser.

## Domain Calculations

### 1. Point Calculation
Points are computed from the CSV columns using the following formula:
* `Total Points = ArcadeGames + floor(SkillBadges / 2) + (BonusMilestone === 'Yes' ? 10 : 0)`
* Every Arcade Game badge completed awards `1 Point`.
* Every 2 Skill Badges completed award `1 Point` (fractional values are discarded using `Math.floor`).
* Earning the GEAR Bonus Milestone awards `10 Points`.

### 2. Milestone Targets
Participants progress through 4 milestone levels based on the completed badge counts:
* **Milestone 1**: 6 Arcade Games AND 14 Skill Badges
* **Milestone 2**: 8 Arcade Games AND 28 Skill Badges
* **Milestone 3**: 10 Arcade Games AND 42 Skill Badges
* **Ultimate Milestone**: 12 Arcade Games AND 56 Skill Badges

## Visual Theme & Layout

* **Aesthetic**: Retro space-arcade theme. Use deep space dark blue/navy backgrounds, twinkling animations, glassmorphic panels, and neon glowing borders (gold, cyan, pink, and green).
* **Typography**: Press Start 2P and Silkscreen for retro titles, Orbitron for scores/numbers, and Inter for general list data.
* **Mobile Responsiveness**: On viewports narrower than `768px`, the grid list must collapse into touch-friendly cards containing an accordion dropdown for badge names.
* **Export Templates**: 16:9 landscape slides (ZIP and PDF) and the single long vertical ranking poster must render off-screen with high scaling factors (e.g. scale = 2) for crystal clear graphics.
