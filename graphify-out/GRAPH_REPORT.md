# Graph Report - Arcade-Leaderboard  (2026-09-27)

## Corpus Check
- 8 files · ~15,092 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 2, .example 1, .css 1)

## Summary
- 116 nodes · 185 edges · 12 communities (10 shown, 2 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8a38a834`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- renderIndividualScorecard
- package.json
- app.js
- fetchAndParseProfile
- index.js
- safeSetStorage
- processCSVData
- Arcade Leaderboard - Agent and System Documentation
- Arcade Leaderboard Agent Guidelines
- The Arcade Leaderboard Generator
- rules/graphify.md
- workflows/graphify.md

## God Nodes (most connected - your core abstractions)
1. `renderIndividualScorecard()` - 12 edges
2. `escapeHtml()` - 10 edges
3. `processCSVData()` - 9 edges
4. `fetchAndParseProfile()` - 9 edges
5. `renderLiveVerifyList()` - 9 edges
6. `applySingleProfileLiveStats()` - 8 edges
7. `Arcade Leaderboard - Agent and System Documentation` - 8 edges
8. `safeSetStorage()` - 7 edges
9. `updateLeaderboard()` - 7 edges
10. `renderLeaderboardList()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `renderLiveVerifyList()` --calls--> `escapeHtml()`  [EXTRACTED]
  assets/app.js → assets/app.js  _Bridges community 0 → community 3_
- `applySingleProfileLiveStats()` --calls--> `safeSetStorage()`  [EXTRACTED]
  assets/app.js → assets/app.js  _Bridges community 5 → community 0_
- `handleFile()` --calls--> `safeSetStorage()`  [EXTRACTED]
  assets/app.js → assets/app.js  _Bridges community 5 → community 6_
- `renderLiveVerifyList()` --calls--> `safeSetStorage()`  [EXTRACTED]
  assets/app.js → assets/app.js  _Bridges community 5 → community 3_
- `processCSVData()` --calls--> `getCalculatedMilestone()`  [EXTRACTED]
  assets/app.js → assets/app.js  _Bridges community 6 → community 3_

## Import Cycles
- None detected.

## Communities (12 total, 2 thin omitted)

### Community 0 - "renderIndividualScorecard"
Cohesion: 0.29
Nodes (15): applySingleProfileLiveStats(), escapeHtml(), generateSlideDOM(), getMilestoneClass(), getNextMilestoneGoal(), getNextPrizeTier(), getPrizeTier(), getPrizeTierHtml() (+7 more)

### Community 1 - "package.json"
Cohesion: 0.18
Nodes (10): wrangler, description, devDependencies, wrangler, main, name, scripts, deploy (+2 more)

### Community 2 - "app.js"
Cohesion: 0.22
Nodes (3): activeParticipantIndex(), renderMilestoneTracker(), renderStats()

### Community 3 - "fetchAndParseProfile"
Cohesion: 0.36
Nodes (9): fetchAndParseProfile(), forceEnglishLocale(), get_proxy_url(), getBadgeDateCategory(), getCalculatedMilestone(), getMilestoneBonus(), isBadgeDateValid(), renderLiveVerifyList() (+1 more)

### Community 4 - "index.js"
Cohesion: 0.46
Nodes (7): ALLOWED_ORIGINS, ALLOWED_TARGET_HOSTS, extract_origin(), fetch(), get_cors_headers(), is_origin_allowed(), is_private_ip()

### Community 5 - "safeSetStorage"
Cohesion: 0.29
Nodes (7): handleIndividualLookup(), hideToast(), safeSetStorage(), showLookupStatus(), showToast(), switchMode(), syncAllProfiles()

### Community 6 - "processCSVData"
Cohesion: 0.29
Nodes (7): findHeaderIndex(), handleFile(), handleFileSelect(), maskEmail(), parseCSV(), processCSVData(), splitBadgesList()

### Community 7 - "Arcade Leaderboard - Agent and System Documentation"
Cohesion: 0.09
Nodes (21): 1. Facilitator Mode (Leaderboard & Group Operations), 1. Point Formula, 1. System Overview, 1. Validity Date Windows, 2. Classification Heuristics, 2. Directory and File Structure, 2. Participant Milestone Thresholds, 2. Participant Mode (Personal Progress Tracker) (+13 more)

### Community 8 - "Arcade Leaderboard Agent Guidelines"
Cohesion: 0.13
Nodes (14): 1. CORS & Concurrency, 1. Point Calculation, 2. Local Storage & Caching, 2. Milestone Targets, 3. Dual-Period Classification Engine, 3. Facilitator Milestone Targets, 4. Discrepancy Tracking (Diffs), Arcade Leaderboard Agent Guidelines (+6 more)

### Community 9 - "The Arcade Leaderboard Generator"
Cohesion: 0.25
Nodes (7): Arcade Aesthetic, How to Use, Key Features, License, Live URL, Technology Stack, The Arcade Leaderboard Generator

## Knowledge Gaps
- **43 isolated node(s):** `name`, `version`, `description`, `main`, `dev` (+38 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 54 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `name`, `version`, `description` to the rest of the system?**
  _43 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Arcade Leaderboard - Agent and System Documentation` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `Arcade Leaderboard Agent Guidelines` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._