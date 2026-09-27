# The Arcade Leaderboard Generator

<div align="center">

[![Google Cloud](https://img.shields.io/badge/Google%20Cloud-Arcade%202026-4285F4?style=for-the-badge&logo=google-cloud&logoColor=white)](https://rsvp.withgoogle.com/events/arcade-fasilitator-id/sistem-poin)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-Deployed-00f2fe?style=for-the-badge&logo=google-chrome&logoColor=white)](https://schryzon.github.io/arcade-leaderboard/)
[![Status](https://img.shields.io/badge/Status-Active-39ff14?style=for-the-badge)](https://schryzon.github.io/arcade-leaderboard/)
[![License](https://img.shields.io/badge/License-Proprietary-ff007f?style=for-the-badge)](#)

</div>

A premium, client-side, responsive scoreboard application built for the **Google Cloud Arcade Facilitator 2026** program. 

This tool is designed to parse participant progress exports, dynamically calculate leaderboard scores, track milestone progress, and export high-quality, shareable marketing graphics—running 100% locally in the browser with **complete data privacy** (no participant names, emails, or phone numbers are ever sent to a server).

## Live URL

The application is deployed and accessible at:
[https://schryzon.github.io/arcade-leaderboard/](https://schryzon.github.io/arcade-leaderboard/)

---

## Key Features

* **Zero-Leak Privacy**: The page loads completely empty. All CSV files are parsed locally in-memory on your machine.
* **Dual-Mode System**:
  * **Facilitator Mode**: Comprehensive cohort leaderboard, facilitator milestone dual-quota progress tracking, batch synchronization, and marketing export generation.
  * **Participant Mode (Personal Progress Tracker)**: Dedicated tracking view for individual learners via their Google Skills public profile URL or shareable deep link (`?url=...`). Displays live event milestone progress, remaining time countdown, extended season progress, accumulated points, tier, and full badge audits without leaderboard confusion.
* **Point System Calculation**:
  * **Arcade Game Badge** = `1 Point`
  * **Skill Badge** = `0.5 Points` (Every 2 badges = `1 Point`, rounded down using `Math.floor`)
  * **Participant Milestone Bonus** = Dynamic bonus points based on the highest achieved milestone (non-cumulative, locked to 29 September 10:30 WIB cutoff):
    * **Milestone 1**: `+7 Points`
    * **Milestone 2**: `+18 Points`
    * **Milestone 3**: `+29 Points`
    * **Ultimate Milestone**: `+40 Points`
  * **Total Points** = `ArcadeGames + floor(SkillBadges / 2) + MilestoneBonus + (BonusMilestone ? 10 : 0)`
* **Dual-Period Evaluation Windows**:
  * **Event Cutoff Window (13 July - 29 September 2026, 10:30 WIB)**: Badges earned in this window determine both Participant Milestone level and Facilitator Milestone progress bars.
  * **Extended Global Arcade Season (29 September 10:30 WIB - 31 December 2026)**: Additional badges award direct points and advance participants towards Tiers, while event milestone bonuses and facilitator milestone quotas remain locked to the 10:30 WIB cutoff.
* **Participant Milestone Tracking**:
  * **Milestone 1**: 6 Arcade Games AND 14 Skill Badges
  * **Milestone 2**: 8 Arcade Games AND 28 Skill Badges
  * **Milestone 3**: 10 Arcade Games AND 42 Skill Badges
  * **Ultimate Milestone**: 12 Arcade Games AND 56 Skill Badges
  * Evaluated per participant in table, mobile cards, and detail modal with dynamic "Needed Badges" feedback.
* **Tiers System**:
  * **★ Trooper**: `50 Points`
  * **★★ Ranger**: `75 Points`
  * **★★★ Champion**: `95 Points`
  * **★★★★ Legend**: `120 Points`
* **Facilitator / Program-Wide Milestone Tracking**:
  * **Milestone #1**: 100 Arcade Games AND 300 Skill Badges (Target: 400 Total)
  * **Milestone #2**: 200 Arcade Games AND 500 Skill Badges (Target: 700 Total)
  * **Milestone #3**: 300 Arcade Games AND 750 Skill Badges (Target: 1050 Total)
  * **Milestone #4**: 400 Arcade Games AND 1000 Skill Badges (Target: 1400 Total)
  * Tracks group-wide cumulative progress gauges requiring both quotas to be met simultaneously (excess skill badges cannot compensate for incomplete games). Evaluated strictly at the 29 September 10:30 WIB cutoff.
* **Responsive Visuals**: Adaptable design optimized for both desktop monitors (detailed table views) and mobile screens (compact click-to-expand scorecard cards).
* **Advanced Shareable Exports**:
  * **Export ZIP (16:9)**: Bundles landscape slide cards (containing up to 10 participants per page) into a single ZIP of images.
  * **Export PDF (16:9)**: Compiles the 16:9 slides into a multi-page landscape PDF file for slide decks.
  * **Export Long Image (PNG)**: Generates a single high-resolution vertical ranking poster, perfect for sharing on messaging channels (WhatsApp/Telegram/Slack).

---

## Arcade Aesthetic

The site is designed with a premium, retro-space theme inspired by the Google Cloud Arcade design:
* Deep-space navy gradients.
* Dynamic twinkling CSS starfield.
* Glassmorphic translucent cards.
* Retro arcade typography (`Silkscreen`, `Press Start 2P`, and `Orbitron` digital fonts).
* Neon glow effects on achievements, ranks, and buttons.

---

## Technology Stack

* **Core Structure**: Semantic HTML5.
* **Styling**: Modern, responsive Vanilla CSS (custom properties, flexbox, grid, glassmorphism, animations).
* **Logic**: Browser-based JavaScript.
* **Libraries (via CDN)**:
  * [html2canvas](https://github.com/niklasvh/html2canvas) for DOM-to-Image rendering.
  * [jsPDF](https://github.com/parallax/jsPDF) for generating landscape document files.
  * [JSZip](https://github.com/Stuk/jszip) for packaging image files client-side.

---

## How to Use

1. Visit the live page at [schryzon.github.io/arcade-leaderboard/](https://schryzon.github.io/arcade-leaderboard/) or open `index.html` locally in any browser.
2. Drag and drop your official program CSV export file into the upload zone.
3. Use the search bar and filter controls to narrow down participants.
4. Click on any participant row or card to inspect complete badge lists and next-milestone requirements.
5. Click **Ekspor** buttons to save PNG graphics or PDF reports to share with your group.

---

## License

This project is licensed under a custom **Proprietary License** (All Rights Reserved). Unauthorized copying, distribution, or modifications of these files are strictly prohibited.
