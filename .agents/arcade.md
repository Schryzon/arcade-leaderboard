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
* `Total Points = ArcadeGames + floor(SkillBadges / 2) + MilestoneBonus + (BonusMilestone === 'Yes' ? 10 : 0)`
* Every Arcade Game badge completed awards `1 Point`.
* Every 2 Skill Badges completed award `1 Point` (fractional values are discarded using `Math.floor`).
* Reaching different milestone levels awards additional milestone bonus points (non-cumulative, only the highest achieved milestone counts):
  * **Milestone 1**: +7 Points
  * **Milestone 2**: +18 Points
  * **Milestone 3**: +29 Points
  * **Ultimate Milestone**: +40 Points
* Earning the GEAR Bonus Milestone (Bonus Milestone yang diraih) awards `10 Points`.

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

## Live Sync, Caching & Classification

### 1. CORS & Concurrency
* Public Google Skills profiles are fetched client-side using `https://corsproxy.io/?url=`.
* Syncing all profiles is performed in parallel batches with a concurrency of `5` to prevent rate-limiting.

### 2. Local Storage & Caching
* **Leaderboard Data**: CSV text and upload time are stored in `arcade_leaderboard_csv_raw` and `arcade_leaderboard_csv_timestamp`.
* **Sync Cache**: Profile stats are cached under `arcade_profile_cache` keyed by the participant's `skillsUrl`. On load, the CSV parser merges records with this cache for O(1) startup times.
* **Custom Classifications**: Manual categorization overrides are stored in `arcade_custom_badge_classifications` (`{ badgeTitle: "arcade" | "skill" | "ignored" }`).

### 3. Classification Engine
* **Arcade Games**: The badge's dialog link `href` contains `/games/`.
* **Skill Badges**: The badge's dialog description contains `"skill badge"` (case-insensitive).
* **Completion Badges**: Ignored.
* **Overrides**: Any entries in `arcade_custom_badge_classifications` immediately bypass default rules.

### 4. Discrepancy Tracking (Diffs)
* Points and badge count differences between live data and the CSV record are calculated and displayed using inline green indicators (e.g., `+2 Live`) next to scores in lists.

