# Arcade Leaderboard - Agent and System Documentation

Comprehensive architecture, system specification, and implementation documentation for AI agents operating in this repository.

## 1. System Overview

Arcade Leaderboard is a zero-backend, client-side web application designed to track, rank, and export participant performance for Google Cloud Arcade Facilitator programs. The application runs entirely within the user's browser, ensuring strict participant data privacy by never transmitting private information to external servers.

### Key Capabilities
* In-browser CSV ingestion and parsing with automated schema detection (supporting comma and semicolon delimiters).
* Live synchronization of participant profiles via public Google Skills URLs through a CORS proxy with concurrency limits.
* Milestone evaluation and dynamic point tallying based on completed Arcade games and Skill badges.
* Program-wide facilitator milestone progress tracking with strict dual-quota (AND) fulfillment.
* High-resolution graphics rendering and exporting for WhatsApp/Telegram posters (long vertical PNG) and presentation slide decks (ZIP of PNGs and landscape PDF).

---

## 2. Directory and File Structure

```
Arcade-Leaderboard/
├── .agents/
│   └── arcade.md              # Domain rules and calculation cheat sheet
├── assets/
│   ├── app.js                 # Core application logic, DOM management, parsing, sync, exports
│   └── style.css              # Cyberpunk retro arcade design system, animations, print media
├── worker/                    # Cloudflare worker deployment configs and proxy scripts
├── AGENTS.md                  # Comprehensive AI agent documentation (this file)
├── index.html                 # Application entry point, layout grids, modal dialogs, and CDN scripts
├── README.md                  # Human-facing user and setup manual
├── run_server.bat             # Local server launcher using python312
└── .env.example               # Environment variables template
```

### Script and Asset Details
* `index.html`: Contains markup for the file upload dropzone, facilitator milestone progress gauges, search/filter controls, participant table and mobile cards, live sync controls, modal dialogs, and hidden containers used for off-screen rendering. Loads `html2canvas`, `jspdf`, and `jszip` via CDN.
* `assets/app.js`: Main monolithic client script. Divided into clear modules:
  * Module 1: DOM Elements and Application State.
  * Module 2: Initialization, Local Storage, and Event Listeners.
  * Module 3: CSV Parsing, Header Detection, and Point Calculations.
  * Module 4: Live Synchronization Engine and CORS Batch Fetching.
  * Module 5: Filtering, Sorting, and Rendering (Table, Cards, Stats, Facilitator Milestones).
  * Module 6: Participant Detail Modal and Manual Badge Classification.
  * Module 7: Export Generators (PNG poster, ZIP slides, PDF document).
* `assets/style.css`: Visual styling adhering to the retro space arcade theme (deep blue `#0b0f19`, glowing accents in cyan `#00f3ff`, yellow `#ffb800`, green `#00ff9d`, and red/pink `#ff0055`). Contains print styles and responsive layout breakpoints.

---

## 3. Facilitator Milestone Tracking Logic

The facilitator milestone tracker monitors cumulative program completions across all participants. A milestone represents a programmatic goal consisting of both Arcade games and Skill badges.

### Requirements Rule: Dual-Quota (AND Logic)
A milestone is completed if and only if both the arcade game requirement AND the skill badge requirement are fulfilled. Progression cannot be satisfied by overflowing one category to compensate for a deficit in the other.

### Milestone Definitions
1. **Milestone 1**: 100 Arcade Games AND 300 Skill Badges (Target: 400 Total)
2. **Milestone 2**: 200 Arcade Games AND 500 Skill Badges (Target: 700 Total)
3. **Milestone 3**: 300 Arcade Games AND 750 Skill Badges (Target: 1050 Total)
4. **Milestone 4**: 400 Arcade Games AND 1000 Skill Badges (Target: 1400 Total)

### Mathematical Formulation
Given total cumulative program stats:
* `total_games`: Cumulative count of Arcade games completed across all participants.
* `total_skills`: Cumulative count of Skill badges completed across all participants.

For each milestone target `target` with `{ games: G, skills: S, total: G + S }`:
1. Clamp games contributed to this milestone:
   `effective_games = min(total_games, G)`
2. Clamp skill badges contributed to this milestone:
   `effective_skills = min(total_skills, S)`
3. Compute effective total towards milestone quota:
   `effective_total = effective_games + effective_skills`
4. Calculate percentage:
   `percent = min(100, floor((effective_total / target.total) * 100))`

### Example Scenario
Assume `total_games = 50` and `total_skills = 308`:
* Milestone 1 evaluation (`G = 100, S = 300, total = 400`):
  * `effective_games = min(50, 100) = 50`
  * `effective_skills = min(308, 300) = 300`
  * `effective_total = 50 + 300 = 350`
  * The 8 surplus skill badges are disregarded for Milestone 1.
  * `percent = floor(350 / 400 * 100) = 87%`.
  * The progress bar remains at 87% (350/400) and will only advance when `total_games` increases.
* Milestone 2 evaluation (`G = 200, S = 500, total = 700`):
  * `effective_games = min(50, 200) = 50`
  * `effective_skills = min(308, 500) = 308`
  * `effective_total = 50 + 308 = 358`
  * `percent = floor(358 / 700 * 100) = 51%`.

---

## 4. Participant Scoring and Progression

### 1. Point Formula
`Total Points = ArcadeGames + floor(SkillBadges / 2) + MilestoneBonus + BonusMilestonePoints`
* `ArcadeGames`: 1 point per completed arcade game.
* `SkillBadges`: 1 point per 2 completed skill badges (`Math.floor(skills / 2)`).
* `MilestoneBonus`: Non-cumulative point bonus awarded based on highest achieved milestone:
  * Milestone 1: +7 Points
  * Milestone 2: +18 Points
  * Milestone 3: +29 Points
  * Ultimate Milestone: +40 Points
  * None: 0 Points
* `BonusMilestonePoints`: +10 points if `Bonus Milestone yang diraih` equals `"Yes"`.

### 2. Participant Milestone Thresholds
* Milestone 1: 6 Arcade Games AND 14 Skill Badges
* Milestone 2: 8 Arcade Games AND 28 Skill Badges
* Milestone 3: 10 Arcade Games AND 42 Skill Badges
* Ultimate Milestone: 12 Arcade Games AND 56 Skill Badges

### 3. Tiers
* ★ Trooper: 50 - 74 Points
* ★★ Ranger: 75 - 94 Points
* ★★★ Champion: 95 - 119 Points
* ★★★★ Legend: 120+ Points

---

## 5. Dual-Period Badge Classification and Validity Engine

### 1. Validity Date Windows
The platform evaluates badge timestamps across two distinct program windows:
* Event Cutoff Window: `13 July 2026, 10:00:00 GMT+7` to `29 September 2026, 10:30:00 GMT+7` (WIB).
  * Evaluates Participant Milestone achievements (Milestone 1, 2, 3, Ultimate Milestone).
  * Evaluates Program-Wide Facilitator Milestone progress bars (100 & 300, 200 & 500, etc.).
* Extended Global Arcade Season: `29 September 2026, 10:30:01 GMT+7` to `31 December 2026, 23:59:59 GMT+7`.
  * Badges earned during this extended period award direct points (1 point per game, 0.5 points per skill badge).
  * Accumulates towards global Tiers (Trooper, Ranger, Champion, Legend).
  * Does NOT contribute towards Facilitator milestone progress bars or participant event milestone bonus bonuses.
* Invalid Dates: Badges earned before `13 July 2026, 10:00:00 GMT+7` or after `31 December 2026, 23:59:59 GMT+7` are flagged as invalid-date and excluded from all calculations.

### 2. Classification Heuristics
When synchronizing profile details from Google Skills public profile pages, individual badges are classified according to these deterministic heuristics:
1. Date Verification: Checked against the dual-window date engine (`getBadgeDateCategory`).
2. Manual Overrides: Checked against `arcade_custom_badge_classifications` in localStorage.
3. Arcade Games: Badge link contains `/games/`.
4. Skill Badges: Badge description text contains `"skill badge"`, `"badge keahlian"`, or `"lencana keahlian"` (case-insensitive).
5. Ignored Badges: Completion badges, non-skill learning paths, or unclassified items.

---

## 6. Dual-Mode Architecture

The application provides two distinct operational interfaces tailored for facilitators and individual learners:

### 1. Facilitator Mode (Leaderboard & Group Operations)
* Targeted at program coordinators and facilitators managing a cohort.
* Features CSV ingestion, full participant ranking table, search and filtering, batch synchronization with concurrency limiting, off-screen export generation (16:9 ZIP/PDF slides and long PNG poster), and facilitator milestone progress bars locked to the 29 September 10:30 WIB cutoff.

### 2. Participant Mode (Personal Progress Tracker)
* Dedicated progress tracker for individual participants accessed via their Google Skills public profile URL or deep link query parameters (`?url=` or `?profile=`).
* Operates in real-time both before and after the event cutoff:
  * Prior to Cutoff (Active Event): Card 1 displays active status, live countdown timer to 29 September 10:30 WIB, and dynamic milestone gap analysis (exact games and skill badges required to reach the next milestone). Card 2 indicates upcoming status.
  * After Cutoff: Card 1 locks milestone achievements and bonus points permanently; Card 2 activates to tally extended arcade season points.
* Displays a dedicated three-card breakdown:
  * Card 1: Official Facilitator Event Milestone (locked to 29 September 2026 10:30 WIB cutoff).
  * Card 2: Extended Arcade Season (badges earned between 29 September 10:30 WIB and 31 December 2026).
  * Card 3: Accumulated Season Score and Tier with dynamic next-tier progression gauge.
* Includes a three-tab badge audit inspector (Event Badges, Extended Season Badges, Non-Skill / Other Badges) and a one-click button to copy shareable progress links.

---

## 7. Coding and Architectural Rules

1. **Readability and Cognitive Control**: Maintain clean spacing, minimal visual noise, and deterministic data flow.
2. **Flat Control Flow**: Avoid deep nesting. Rely on guard clauses, early returns, and linear dispatch.
3. **Naming Standards**:
   * Use `tiny_snake_case` for local processing variables, data properties, and mathematical helpers.
   * Use `Title_Snake_Case` for class definitions if created.
   * Use `UPPER_SNAKE_CASE` for configuration constants and enums.
   * Standard camelCase is reserved for DOM node variables and native browser APIs.
4. **Optimistic Error Handling**: Do not obscure runtime errors with silent catch blocks during data manipulation. Allow unexpected inputs to reveal their location immediately.
5. **Zero Emojis in Documentation**: Markdown documentation in this repository must remain strictly devoid of emojis.
