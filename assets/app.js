/**
 * THE ARCADE LEADERBOARD - APPLICATION LOGIC
 * Client-side CSV parsing, score calculations, filtering, sorting, and exports.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Generate background stars
  generateStarfield();

  // Mobile Debug Console (Activate by adding ?debug to URL)
  if (window.location.search.includes('debug') || window.location.hash.includes('debug')) {
    const erudaScript = document.createElement('script');
    erudaScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/eruda/3.0.1/eruda.min.js';
    erudaScript.onload = () => {
      if (window.eruda) window.eruda.init();
    };
    document.head.appendChild(erudaScript);
  }

  // CORS Proxy Configuration (Cloudflare Worker)
  const PROXY_BASE_URL = 'https://arcade-cors-proxy.schryzon.workers.dev';

  function get_proxy_url(target_url) {
    return `${PROXY_BASE_URL}/?url=${encodeURIComponent(target_url)}`;
  }

  // App State
  let rawData = [];
  let parsedParticipants = [];
  let filteredParticipants = [];
  let activeParticipant = null;

  // Live Verification & Cache State
  const knownSkillBadges = new Set();
  const knownArcadeGames = new Set();
  let customClassifications = {};
  let profileCache = {};
  let activeModalParticipant = null;

  try {
    const savedClassifications = localStorage.getItem('arcade_custom_badge_classifications');
    if (savedClassifications) {
      customClassifications = JSON.parse(savedClassifications);
    }
  } catch (e) {
    console.error('Failed to load custom classifications:', e);
  }

  try {
    const savedCache = localStorage.getItem('arcade_profile_cache');
    if (savedCache) {
      profileCache = JSON.parse(savedCache);
    }
  } catch (e) {
    console.error('Failed to load profile cache:', e);
  }

  // Soft Match helper
  function softMatch(a, b) {
    const normA = a.toLowerCase().trim();
    const normB = b.toLowerCase().trim();
    if (normA === normB) return true;
    if (normA.includes(normB) || normB.includes(normA)) return true;

    const getParenthesesContent = str => {
      const match = str.match(/\(([^)]+)\)/);
      return match ? match[1].toLowerCase().trim() : '';
    };

    const parenA = getParenthesesContent(a);
    const parenB = getParenthesesContent(b);
    if (parenA && parenB && parenA === parenB) return true;
    if (parenA && normB.includes(parenA)) return true;
    if (parenB && normA.includes(parenB)) return true;

    return false;
  }

  // Split badges by comma-space helper
  function splitBadgesList(str) {
    if (!str) return [];
    return str.split(/,\s+/).map(s => s.trim()).filter(Boolean);
  }

  // HTML Escape helper to prevent XSS/Injection from CSV data
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return str.toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // URL sanitization helper to prevent javascript: or attribute breakout XSS
  function sanitizeUrl(url) {
    if (!url) return '';
    const trimmed = url.trim();
    if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
      return escapeHtml(trimmed);
    }
    return '';
  }

  // Safe localStorage helper to prevent unhandled QuotaExceededError exceptions
  function safeSetStorage(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn(`LocalStorage write failed for "${key}":`, e);
    }
  }

  // Filename timestamp helper to prevent duplicate/overwritten downloads
  function getFilenameTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}_${hour}${minute}${second}`;
  }

  // Program Windows:
  // 1. Official Facilitator Event Period: 13 July 2026 (10 AM) to 29 September 2026 (23:59:59) GMT+7
  // 2. Extended Global Arcade Season: 30 September 2026 (00:00:00) to 31 December 2026 (23:59:59) GMT+7
  const PROGRAM_START_DATE = Date.parse('2026-07-13T10:00:00+07:00');
  const EVENT_CUTOFF_DATE = Date.parse('2026-09-29T23:59:59+07:00');
  const EXTENDED_SEASON_END_DATE = Date.parse('2026-12-31T23:59:59+07:00');

  function getBadgeDateCategory(earned_text) {
    if (!earned_text) return 'invalid';

    // Clean up spaces and word "Earned"
    let clean = earned_text.replace(/Earned/gi, '').replace(/\s+/g, ' ').trim();
    if (!clean) return 'invalid';

    // Normalize EDT/EST timezone abbreviation to numeric offsets for reliable cross-browser parsing
    let normalized = clean;
    if (normalized.endsWith('EDT')) {
      normalized = normalized.slice(0, -3).trim() + ' GMT-0400';
    } else if (normalized.endsWith('EST')) {
      normalized = normalized.slice(0, -3).trim() + ' GMT-0500';
    }

    const timestamp = Date.parse(normalized);
    if (isNaN(timestamp)) {
      console.warn('Failed to parse badge date:', earned_text, 'Normalized as:', normalized);
      return 'invalid';
    }

    if (timestamp < PROGRAM_START_DATE || timestamp > EXTENDED_SEASON_END_DATE) {
      return 'invalid';
    }
    if (timestamp <= EVENT_CUTOFF_DATE) {
      return 'event';
    }
    return 'extended';
  }

  function isBadgeDateValid(earned_text) {
    const category = getBadgeDateCategory(earned_text);
    return category === 'event' || category === 'extended';
  }

  // Cache DOM Elements
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('csv-file-input');
  const browseBtn = document.getElementById('browse-btn');
  const uploadContainer = document.getElementById('upload-container');
  const leaderboardSection = document.getElementById('leaderboard-section');
  const resetDataBtn = document.getElementById('reset-data-btn');

  // Mode Elements
  const modeTabFacilitator = document.getElementById('mode-tab-facilitator');
  const modeTabPlayer = document.getElementById('mode-tab-player');
  const playerLookupContainer = document.getElementById('player-lookup-container');
  const playerUrlInput = document.getElementById('player-url-input');
  const playerHasBonusCheckbox = document.getElementById('player-has-bonus');
  const checkPlayerBtn = document.getElementById('check-player-btn');
  const playerLookupStatus = document.getElementById('player-lookup-status');
  const individualTrackerSection = document.getElementById('individual-tracker-section');

  // Stats Elements
  const statTotalParticipants = document.getElementById('stat-total-participants');
  const statTotalGames = document.getElementById('stat-total-games');
  const statTierCount = document.getElementById('stat-tier-count');
  const statTotalSkills = document.getElementById('stat-total-skills');

  // Filters Elements
  const searchInput = document.getElementById('search-input');
  const milestoneFilter = document.getElementById('milestone-filter');
  const tierFilter = document.getElementById('tier-filter');
  const sortFilter = document.getElementById('sort-filter');

  // Tables & Layout Elements
  const tableBody = document.getElementById('leaderboard-table-body');
  const mobileCardsContainer = document.getElementById('mobile-cards-container');

  // Modal Elements
  const detailsModal = document.getElementById('details-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalName = document.getElementById('modal-participant-name');
  const modalPoints = document.getElementById('modal-participant-points');
  const modalMilestoneBadge = document.getElementById('modal-milestone-badge');
  const modalTierBadge = document.getElementById('modal-tier-badge');
  const modalArcadeProgressText = document.getElementById('modal-arcade-progress-text');
  const modalArcadeProgressBar = document.getElementById('modal-arcade-progress-bar');
  const modalSkillProgressText = document.getElementById('modal-skill-progress-text');
  const modalSkillProgressBar = document.getElementById('modal-skill-progress-bar');
  const modalNextMilestoneHint = document.getElementById('modal-next-milestone-hint');
  const modalArcadeCount = document.getElementById('modal-arcade-count');
  const modalArcadeList = document.getElementById('modal-arcade-list');
  const modalSkillCount = document.getElementById('modal-skill-count');
  const modalSkillList = document.getElementById('modal-skill-list');
  const modalVerificationStatus = document.getElementById('modal-verification-status');
  const modalLinksContainer = document.getElementById('modal-links-container');

  // Live Sync & Cache Elements
  const syncLiveBtn = document.getElementById('sync-live-btn');
  const modalVerifyLiveBtn = document.getElementById('modal-verify-live-btn');
  const modalLiveVerifyContainer = document.getElementById('modal-live-verify-container');
  const modalLiveVerifySummary = document.getElementById('modal-live-verify-summary');
  const modalLiveBadgeList = document.getElementById('modal-live-badge-list');
  const modalLiveSyncAction = document.getElementById('modal-live-sync-action');
  const modalApplyLiveBtn = document.getElementById('modal-apply-live-btn');

  // Export Elements
  const exportLongBtn = document.getElementById('export-long-btn');
  const exportPdfBtn = document.getElementById('export-pdf-btn');
  const exportZipBtn = document.getElementById('export-zip-btn');
  const statusToast = document.getElementById('status-toast');
  const statusToastText = document.getElementById('status-toast-text');
  const exportRenderArea = document.getElementById('export-render-area');
  const exportLongRenderArea = document.getElementById('export-long-render-area');

  // Load saved data from localStorage on load if available
  const savedData = localStorage.getItem('arcade_leaderboard_csv_raw');
  const savedTimestamp = localStorage.getItem('arcade_leaderboard_csv_timestamp') || '';
  if (savedData) {
    processCSVData(savedData, savedTimestamp);
  }

  // --- Mode Switching Logic ---
  function switchMode(mode) {
    if (mode === 'player') {
      if (modeTabPlayer) modeTabPlayer.classList.add('active');
      if (modeTabFacilitator) modeTabFacilitator.classList.remove('active');
      if (uploadContainer) uploadContainer.style.display = 'none';
      if (leaderboardSection) leaderboardSection.style.display = 'none';

      if (individualTrackerSection && individualTrackerSection.innerHTML.trim() !== '') {
        individualTrackerSection.style.display = 'flex';
        if (playerLookupContainer) playerLookupContainer.style.display = 'none';
      } else {
        if (playerLookupContainer) playerLookupContainer.style.display = 'block';
        if (individualTrackerSection) individualTrackerSection.style.display = 'none';
      }
      safeSetStorage('arcade_app_mode', 'player');
    } else {
      if (modeTabFacilitator) modeTabFacilitator.classList.add('active');
      if (modeTabPlayer) modeTabPlayer.classList.remove('active');
      if (playerLookupContainer) playerLookupContainer.style.display = 'none';
      if (individualTrackerSection) individualTrackerSection.style.display = 'none';

      if (parsedParticipants.length > 0) {
        if (leaderboardSection) leaderboardSection.style.display = 'block';
        if (uploadContainer) uploadContainer.style.display = 'none';
      } else {
        if (uploadContainer) uploadContainer.style.display = 'block';
        if (leaderboardSection) leaderboardSection.style.display = 'none';
      }
      safeSetStorage('arcade_app_mode', 'facilitator');
    }
  }

  if (modeTabFacilitator) {
    modeTabFacilitator.addEventListener('click', () => switchMode('facilitator'));
  }
  if (modeTabPlayer) {
    modeTabPlayer.addEventListener('click', () => switchMode('player'));
  }

  // Restore saved player profile input
  const savedPlayerUrl = localStorage.getItem('arcade_saved_player_url');
  if (savedPlayerUrl && playerUrlInput) {
    playerUrlInput.value = savedPlayerUrl;
  }
  const savedPlayerBonus = localStorage.getItem('arcade_saved_player_bonus') === 'true';
  if (playerHasBonusCheckbox) {
    playerHasBonusCheckbox.checked = savedPlayerBonus;
  }

  const savedMode = localStorage.getItem('arcade_app_mode') || (savedData ? 'facilitator' : 'player');
  switchMode(savedMode);

  // Individual lookup event listeners
  if (checkPlayerBtn) {
    checkPlayerBtn.addEventListener('click', handleIndividualLookup);
  }
  if (playerUrlInput) {
    playerUrlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleIndividualLookup();
      }
    });
  }

  async function handleIndividualLookup() {
    const rawUrl = playerUrlInput ? playerUrlInput.value.trim() : '';
    const hasBonus = playerHasBonusCheckbox ? playerHasBonusCheckbox.checked : false;

    if (!rawUrl || !rawUrl.includes('skills.google/public_profiles/')) {
      showLookupStatus('Tolong masukkan URL profil publik Google Skills yang valid (contoh: https://www.skills.google/public_profiles/...)', 'error');
      return;
    }

    showLookupStatus('Menghubungkan ke profil Google Skills dan memverifikasi lencana...', 'loading');
    checkPlayerBtn.disabled = true;

    try {
      const stats = await fetchAndParseProfile(rawUrl, hasBonus);
      if (!stats) {
        throw new Error('Gagal mengurai profil. Pastikan URL benar dan profil disetel ke publik.');
      }

      safeSetStorage('arcade_saved_player_url', rawUrl);
      safeSetStorage('arcade_saved_player_bonus', String(hasBonus));

      showLookupStatus('', 'clear');
      checkPlayerBtn.disabled = false;
      if (playerLookupContainer) playerLookupContainer.style.display = 'none';
      renderIndividualScorecard(stats, rawUrl);
    } catch (err) {
      checkPlayerBtn.disabled = false;
      showLookupStatus(`Gagal memproses profil: ${err.message || 'Koneksi CORS terhambat atau profil tidak ditemukan.'}`, 'error');
    }
  }

  function showLookupStatus(msg, type) {
    if (!playerLookupStatus) return;
    if (type === 'clear') {
      playerLookupStatus.style.display = 'none';
      playerLookupStatus.textContent = '';
      return;
    }
    playerLookupStatus.textContent = msg;
    playerLookupStatus.className = `lookup-status-msg ${type}`;
    playerLookupStatus.style.display = 'block';
  }

  // --- 1. Background Starfield ---
  function generateStarfield() {
    const starfield = document.getElementById('starfield');
    const starCount = window.innerWidth < 768 ? 50 : 120;
    starfield.innerHTML = '';
    for (let i = 0; i < starCount; i++) {
      const star = document.createElement('div');
      star.className = 'star';
      star.style.left = `${Math.random() * 100}%`;
      star.style.top = `${Math.random() * 100}%`;
      const size = Math.random() * 2 + 1;
      star.style.width = `${size}px`;
      star.style.height = `${size}px`;
      star.style.setProperty('--duration', `${Math.random() * 3 + 2}s`);
      star.style.setProperty('--opacity', `${Math.random() * 0.7 + 0.3}`);
      starfield.appendChild(star);
    }
  }

  window.addEventListener('resize', () => {
    // Throttled starfield update
    clearTimeout(window.starfieldTimeout);
    window.starfieldTimeout = setTimeout(generateStarfield, 500);
  });

  // --- 2. Uploader Event Listeners ---
  browseBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleFileSelect);

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  });

  function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }

  function handleFile(file) {
    if (!file.name.endsWith('.csv')) {
      alert('Tolong unggah berkas bertipe .csv saja.');
      return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
      const text = e.target.result;
      const now = new Date();
      const timestamp = now.toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      safeSetStorage('arcade_leaderboard_csv_raw', text);
      safeSetStorage('arcade_leaderboard_csv_timestamp', timestamp);
      processCSVData(text, timestamp);
    };
    reader.readAsText(file);
  }

  resetDataBtn.addEventListener('click', () => {
    if (confirm('Apakah Anda yakin ingin menghapus data leaderboard?')) {
      localStorage.removeItem('arcade_leaderboard_csv_raw');
      localStorage.removeItem('arcade_leaderboard_csv_timestamp');
      localStorage.removeItem('arcade_profile_cache');
      profileCache = {};
      parsedParticipants = [];
      filteredParticipants = [];
      uploadContainer.style.display = 'block';
      leaderboardSection.style.display = 'none';
      fileInput.value = '';
      const lastUpdatedEl = document.getElementById('last-updated-time');
      if (lastUpdatedEl) {
        lastUpdatedEl.style.display = 'none';
        lastUpdatedEl.textContent = '';
      }
    }
  });

  // --- 3. CSV Parsing & Calculations ---
  function parseCSV(text) {
    const lines = [];
    let row = [""];
    let inQuotes = false;

    // Detect separator (comma vs semicolon)
    const firstLine = text.split(/\r?\n/)[0];
    const sep = firstLine.includes(';') ? ';' : ',';

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const next = text[i + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          row[row.length - 1] += '"';
          i++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === sep && !inQuotes) {
        row.push("");
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && next === '\n') {
          i++;
        }
        lines.push(row);
        row = [""];
      } else {
        row[row.length - 1] += char;
      }
    }
    if (row.length > 1 || row[0] !== "") {
      lines.push(row);
    }
    return lines;
  }

  function findHeaderIndex(headers, keywords) {
    return headers.findIndex(h => {
      const lower = h.toLowerCase().trim();
      return keywords.some(keyword => lower.includes(keyword.toLowerCase()));
    });
  }

  function processCSVData(csvText, timestamp) {
    const lastUpdatedEl = document.getElementById('last-updated-time');
    if (lastUpdatedEl) {
      if (timestamp) {
        lastUpdatedEl.textContent = `Terakhir disimpan: ${timestamp}`;
        lastUpdatedEl.style.display = 'block';
      } else {
        lastUpdatedEl.style.display = 'none';
      }
    }
    const rawRows = parseCSV(csvText);
    if (rawRows.length < 2) {
      alert('Berkas CSV kosong atau tidak valid.');
      return;
    }

    const headers = rawRows[0];

    // Find index of headers dynamically
    const nameIdx = findHeaderIndex(headers, ['nama peserta', 'name']);
    const emailIdx = findHeaderIndex(headers, ['email peserta', 'email']);
    const skillsCountIdx = findHeaderIndex(headers, ['jumlah lencana keahlian', 'skill badge count', 'lencana keahlian yang diselesaikan']);
    const skillsListIdx = findHeaderIndex(headers, ['nama lencana keahlian', 'skill badge name']);
    const arcadeCountIdx = findHeaderIndex(headers, ['jumlah arcade game', 'arcade game count', 'arcade game yang diselesaikan']);
    const arcadeListIdx = findHeaderIndex(headers, ['nama arcade game', 'arcade game name']);
    const milestoneIdx = findHeaderIndex(headers, ['milestone yang diraih', 'milestone achieved']);
    const bonusMilestoneIdx = findHeaderIndex(headers, ['bonus milestone yang diraih', 'bonus milestone']);
    const verifyStatusIdx = findHeaderIndex(headers, ['status verifikasi ai agent', 'verification status']);
    const gearDigitalBadgeIdx = findHeaderIndex(headers, ['lencana digital gear', 'gear digital badge']);
    const skillsProfileIdx = findHeaderIndex(headers, ['url profil google skills', 'skills profile url']);
    const devProfileIdx = findHeaderIndex(headers, ['url profil google developer', 'developer profile url']);

    if (nameIdx === -1) {
      alert('Tidak menemukan kolom nama peserta. Pastikan header CSV Anda benar.');
      return;
    }

    parsedParticipants = [];
    knownSkillBadges.clear();
    knownArcadeGames.clear();

    // Parse records starting from row index 1
    for (let i = 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      // Skip empty lines
      if (row.length === 0 || (row.length === 1 && row[0] === '')) continue;

      const name = (row[nameIdx] || '').trim();
      if (!name) continue;

      const email = (row[emailIdx] || '').trim();
      const skillsCount = parseInt(row[skillsCountIdx]) || 0;
      const skillsList = splitBadgesList(row[skillsListIdx]);
      const arcadeCount = parseInt(row[arcadeCountIdx]) || 0;
      const arcadeList = splitBadgesList(row[arcadeListIdx]);

      // Populate known badges sets
      skillsList.forEach(badge => knownSkillBadges.add(badge));
      arcadeList.forEach(badge => knownArcadeGames.add(badge));

      // Milestone calculations
      const milestoneCSV = (row[milestoneIdx] || 'None').trim();
      const calculatedMilestone = getCalculatedMilestone(arcadeCount, skillsCount);

      // Calculate Points
      const bonusStr = (row[bonusMilestoneIdx] || '').trim().toLowerCase();
      const hasBonus = bonusStr === 'yes' || bonusStr === 'ya' || bonusStr === '10';
      const milestoneBonus = getMilestoneBonus(calculatedMilestone);
      const calculatedPoints = arcadeCount * 1 + Math.floor(skillsCount / 2) + milestoneBonus + (hasBonus ? 10 : 0);

      const verifyStatus = (row[verifyStatusIdx] || 'Not yet submitted').trim();
      const gearBadge = (row[gearDigitalBadgeIdx] || '').trim();

      const rawSkillsUrl = (row[skillsProfileIdx] || '').trim();
      const rawDevUrl = (row[devProfileIdx] || '').trim();
      const skillsUrl = (rawSkillsUrl.startsWith('http://') || rawSkillsUrl.startsWith('https://')) ? rawSkillsUrl : '';
      const devUrl = (rawDevUrl.startsWith('http://') || rawDevUrl.startsWith('https://')) ? rawDevUrl : '';

      // Merge with cache if available
      const cache = profileCache[skillsUrl];
      if (cache && skillsUrl) {
        const cacheMilestone = getCalculatedMilestone(cache.arcadeCount, cache.skillsCount);
        const cacheMilestoneBonus = getMilestoneBonus(cacheMilestone);
        const cachePoints = cache.arcadeCount * 1 + Math.floor(cache.skillsCount / 2) + cacheMilestoneBonus + (hasBonus ? 10 : 0);

        parsedParticipants.push({
          name,
          email: maskEmail(email),
          // original CSV stats
          csvSkillsCount: skillsCount,
          csvArcadeCount: arcadeCount,
          csvPoints: calculatedPoints,
          // active stats (initially from cache)
          skillsCount: cache.skillsCount,
          skillsList: cache.skillsList || skillsList,
          arcadeCount: cache.arcadeCount,
          arcadeList: cache.arcadeList || arcadeList,
          points: cachePoints,
          milestoneCSV,
          milestone: cacheMilestone,
          hasBonus,
          verifyStatus,
          gearBadge,
          skillsUrl,
          devUrl,
          diffCount: (cache.arcadeCount + cache.skillsCount) - (arcadeCount + skillsCount),
          diffPoints: cachePoints - calculatedPoints,
          lastSynced: cache.lastSynced
        });
      } else {
        parsedParticipants.push({
          name,
          email: maskEmail(email),
          // original CSV stats
          csvSkillsCount: skillsCount,
          csvArcadeCount: arcadeCount,
          csvPoints: calculatedPoints,
          // active stats (initially from CSV)
          skillsCount,
          skillsList,
          arcadeCount,
          arcadeList,
          points: calculatedPoints,
          milestoneCSV,
          milestone: calculatedMilestone,
          hasBonus,
          verifyStatus,
          gearBadge,
          skillsUrl,
          devUrl,
          diffCount: 0,
          diffPoints: 0,
          lastSynced: null
        });
      }
    }

    // Hide upload and show leaderboard
    uploadContainer.style.display = 'none';
    leaderboardSection.style.display = 'block';

    updateLeaderboard();
  }

  function parseCommaList(fieldValue) {
    if (!fieldValue) return [];
    return fieldValue.split(',').map(s => s.trim()).filter(s => s.length > 0);
  }

  function maskEmail(email) {
    if (!email) return '';
    const parts = email.split('@');
    if (parts.length !== 2) return '***';
    const name = parts[0];
    const domain = parts[1];
    if (name.length <= 2) return `**@${domain}`;
    return `${name.substring(0, 2)}*****@${domain}`;
  }

  function getCalculatedMilestone(games, skills) {
    if (games >= 12 && skills >= 56) return "Ultimate Milestone";
    if (games >= 10 && skills >= 42) return "Milestone 3";
    if (games >= 8 && skills >= 28) return "Milestone 2";
    if (games >= 6 && skills >= 14) return "Milestone 1";
    return "None";
  }

  function getMilestoneBonus(milestone) {
    if (milestone === "Ultimate Milestone") return 40;
    if (milestone === "Milestone 3") return 29;
    if (milestone === "Milestone 2") return 18;
    if (milestone === "Milestone 1") return 7;
    return 0;
  }

  // --- Tier Helpers ---
  function getPrizeTier(points) {
    if (points >= 120) {
      return {
        key: 'legend',
        name: 'Legend',
        stars: '★★★★',
        className: 'tier-legend',
        pointsReq: 120
      };
    }
    if (points >= 95) {
      return {
        key: 'champion',
        name: 'Champion',
        stars: '★★★',
        className: 'tier-champion',
        pointsReq: 95
      };
    }
    if (points >= 75) {
      return {
        key: 'ranger',
        name: 'Ranger',
        stars: '★★',
        className: 'tier-ranger',
        pointsReq: 75
      };
    }
    if (points >= 50) {
      return {
        key: 'trooper',
        name: 'Trooper',
        stars: '★',
        className: 'tier-trooper',
        pointsReq: 50
      };
    }
    return null;
  }

  function getNextPrizeTier(points) {
    if (points < 50) {
      return { key: 'trooper', name: 'Trooper', stars: '★', pointsReq: 50 };
    }
    if (points < 75) {
      return { key: 'ranger', name: 'Ranger', stars: '★★', pointsReq: 75 };
    }
    if (points < 95) {
      return { key: 'champion', name: 'Champion', stars: '★★★', pointsReq: 95 };
    }
    if (points < 120) {
      return { key: 'legend', name: 'Legend', stars: '★★★★', pointsReq: 120 };
    }
    return null;
  }

  function getPrizeTierHtml(points) {
    const tier = getPrizeTier(points);
    if (!tier) {
      return '<span style="color: var(--text-muted); font-size:0.75rem;">-</span>';
    }
    return `<span class="tier-badge ${tier.className}" title="${tier.name} (${tier.pointsReq}+ Pts)">
      <span class="tier-stars">${tier.stars}</span> ${tier.name}
    </span>`;
  }

  // --- 4. Filtering, Sorting, and Rendering ---
  searchInput.addEventListener('input', updateLeaderboard);
  milestoneFilter.addEventListener('change', updateLeaderboard);
  if (tierFilter) {
    tierFilter.addEventListener('change', updateLeaderboard);
  }
  sortFilter.addEventListener('change', updateLeaderboard);

  function updateLeaderboard() {
    const searchVal = searchInput.value.toLowerCase().trim();
    const milestoneVal = milestoneFilter.value;
    const tierVal = tierFilter ? tierFilter.value : 'all';
    const sortVal = sortFilter.value;

    // Filter
    filteredParticipants = parsedParticipants.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(searchVal);

      let matchMilestone = true;
      if (milestoneVal !== 'all') {
        const key = p.milestone.toLowerCase().replace(' ', '-');
        matchMilestone = key === milestoneVal;
      }

      let matchTier = true;
      if (tierVal !== 'all') {
        const tier = getPrizeTier(p.points);
        if (tierVal === 'legend') matchTier = tier && tier.key === 'legend';
        else if (tierVal === 'champion') matchTier = tier && tier.key === 'champion';
        else if (tierVal === 'ranger') matchTier = tier && tier.key === 'ranger';
        else if (tierVal === 'trooper') matchTier = tier && tier.key === 'trooper';
        else if (tierVal === 'none') matchTier = !tier;
      }

      return matchSearch && matchMilestone && matchTier;
    });

    // Sort
    filteredParticipants.sort((a, b) => {
      if (sortVal === 'rank') {
        // High points first, tie-break with arcade games, then skills, then name
        if (b.points !== a.points) return b.points - a.points;
        if (b.arcadeCount !== a.arcadeCount) return b.arcadeCount - a.arcadeCount;
        if (b.skillsCount !== a.skillsCount) return b.skillsCount - a.skillsCount;
        return a.name.localeCompare(b.name);
      } else if (sortVal === 'points-asc') {
        if (a.points !== b.points) return a.points - b.points;
        return a.name.localeCompare(b.name);
      } else if (sortVal === 'name') {
        return a.name.localeCompare(b.name);
      } else if (sortVal === 'arcade') {
        if (b.arcadeCount !== a.arcadeCount) return b.arcadeCount - a.arcadeCount;
        return b.points - a.points;
      } else if (sortVal === 'skills') {
        if (b.skillsCount !== a.skillsCount) return b.skillsCount - a.skillsCount;
        return b.points - a.points;
      }
      return 0;
    });

    // Render Stats
    renderStats();

    // Render Tables & Cards
    renderLeaderboardList();
  }

  function renderStats() {
    statTotalParticipants.textContent = parsedParticipants.length;

    // Overall stats display total badges across all participants (including extended season)
    const total_games = parsedParticipants.reduce((sum, p) => sum + p.arcadeCount, 0);
    const total_skills = parsedParticipants.reduce((sum, p) => sum + p.skillsCount, 0);

    statTotalGames.textContent = total_games;
    statTotalSkills.textContent = total_skills;

    const tier_count = parsedParticipants.filter(p => p.points >= 50).length;
    if (statTierCount) statTierCount.textContent = tier_count;

    // Facilitator cumulative milestone targets evaluate strictly at cutoff (29 September 2026)
    // CSV counts are pre-cutoff exports; live-synced participants track cutoffArcade & cutoffSkills separately
    const total_cutoff_games = parsedParticipants.reduce((sum, p) => sum + (p.cutoffArcade !== undefined ? p.cutoffArcade : p.arcadeCount), 0);
    const total_cutoff_skills = parsedParticipants.reduce((sum, p) => sum + (p.cutoffSkills !== undefined ? p.cutoffSkills : p.skillsCount), 0);

    // Render program-wide milestone tracker with dual-quota AND logic evaluated at event cutoff
    renderMilestoneTracker(total_cutoff_games, total_cutoff_skills);
  }

  function renderMilestoneTracker(total_games, total_skills) {
    const milestone_targets = [
      { games: 100, skills: 300, total: 400 },
      { games: 200, skills: 500, total: 700 },
      { games: 300, skills: 750, total: 1050 },
      { games: 400, skills: 1000, total: 1400 }
    ];

    for (let i = 0; i < milestone_targets.length; i++) {
      const target = milestone_targets[i];
      const milestone_num = i + 1;

      // Both games AND skill badges must reach their targets (AND logic, not unconstrained OR).
      // Progression is strictly clamped: excess badges beyond this milestone's quota cannot compensate for missing games.
      const effective_games = Math.min(total_games, target.games);
      const effective_skills = Math.min(total_skills, target.skills);
      const effective_total = effective_games + effective_skills;
      const percent = Math.min(100, Math.floor((effective_total / target.total) * 100));

      const pb = document.getElementById(`milestone-progress-bar-${milestone_num}`);
      const percent_text = document.getElementById(`milestone-progress-percent-${milestone_num}`);
      const ratio_text = document.getElementById(`milestone-progress-ratio-${milestone_num}`);

      if (pb) pb.style.width = `${percent}%`;
      if (percent_text) percent_text.textContent = `${percent}% Completed`;
      if (ratio_text) {
        ratio_text.textContent = `${effective_total}/${target.total}`;
        ratio_text.title = `${effective_games}/${target.games} Arcade Games, ${effective_skills}/${target.skills} Skill Badges`;
      }
    }
  }

  function renderLeaderboardList() {
    tableBody.innerHTML = '';
    mobileCardsContainer.innerHTML = '';

    if (filteredParticipants.length === 0) {
      const emptyRow = `<tr><td colspan="8" style="text-align:center; padding: 30px; color: var(--text-secondary);">Tidak ada data yang cocok dengan filter Anda.</td></tr>`;
      tableBody.innerHTML = emptyRow;
      mobileCardsContainer.innerHTML = `<div style="text-align:center; padding: 30px; color: var(--text-secondary);">Tidak ada data yang cocok.</div>`;
      return;
    }

    filteredParticipants.forEach((p, index) => {
      // Calculate true rank (index + 1)
      const rank = index + 1;
      let rankClass = '';
      if (rank === 1) rankClass = 'rank-1';
      else if (rank === 2) rankClass = 'rank-2';
      else if (rank === 3) rankClass = 'rank-3';

      const milestoneClass = getMilestoneClass(p.milestone);

      // Profile buttons
      let profileButtons = '';
      const safeSkillsUrl = sanitizeUrl(p.skillsUrl);
      const safeDevUrl = sanitizeUrl(p.devUrl);
      if (safeSkillsUrl) {
        profileButtons += `<a href="${safeSkillsUrl}" target="_blank" rel="noopener noreferrer" class="profile-link" title="Google Skills Profile">G</a>`;
      }
      if (safeDevUrl) {
        profileButtons += `<a href="${safeDevUrl}" target="_blank" rel="noopener noreferrer" class="profile-link dev" title="Google Developer Profile">D</a>`;
      }

      // Tier HTML
      const prizeTierHtml = getPrizeTierHtml(p.points);

      // --- Desktop Row HTML ---
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';

      let diffHtml = '';
      if (p.diffPoints && p.diffPoints > 0) {
        diffHtml = `<span class="diff-badge positive">+${p.diffPoints} Live</span>`;
      } else if (p.diffPoints && p.diffPoints < 0) {
        diffHtml = `<span class="diff-badge negative">${p.diffPoints} Live</span>`;
      }

      tr.innerHTML = `
        <td style="text-align: center;"><span class="rank-badge ${rankClass}">${rank}</span></td>
        <td class="name-cell">${escapeHtml(p.name)}</td>
        <td style="text-align: center;" class="points-badge">${p.points}${diffHtml}</td>
        <td><span class="milestone-badge ${milestoneClass}">${escapeHtml(p.milestone)}</span></td>
        <td style="text-align: center;"><span class="badge-count arcade">🎮 ${p.arcadeCount}</span></td>
        <td style="text-align: center;"><span class="badge-count skill">🏆 ${p.skillsCount}</span></td>
        <td>${prizeTierHtml}</td>
        <td>
          <div class="profile-links-container">
            ${profileButtons || '<span style="color: var(--text-muted); font-size:0.75rem;">-</span>'}
          </div>
        </td>
      `;

      // Bind row click for modal
      tr.addEventListener('click', (e) => {
        // Prevent click if link was clicked
        if (e.target.tagName.toLowerCase() === 'a') return;
        openParticipantModal(p, rank);
      });

      tableBody.appendChild(tr);

      // --- Mobile Card HTML ---
      const mobileCard = document.createElement('div');
      mobileCard.className = 'mobile-card';
      mobileCard.innerHTML = `
        <div class="mobile-card-header">
          <div class="mobile-card-left">
            <span class="rank-badge ${rankClass}">${rank}</span>
            <span class="mobile-name">${escapeHtml(p.name)}</span>
          </div>
          <span class="mobile-points">${p.points} Pts${diffHtml}</span>
        </div>
        <div class="mobile-card-body">
          <div class="mobile-stat">
            <span class="mobile-label">Milestone</span>
            <span class="milestone-badge ${milestoneClass}" style="transform: scale(0.9); transform-origin: left; width: fit-content;">${escapeHtml(p.milestone)}</span>
          </div>
          <div class="mobile-stat">
            <span class="mobile-label">Tier</span>
            <span>${prizeTierHtml}</span>
          </div>
          <div class="mobile-stat" style="margin-top: 5px;">
            <span class="mobile-label">Game Arcade</span>
            <span class="badge-count arcade" style="width: fit-content;">🎮 ${p.arcadeCount} Game</span>
          </div>
          <div class="mobile-stat" style="margin-top: 5px;">
            <span class="mobile-label">Badge Keahlian</span>
            <span class="badge-count skill" style="width: fit-content;">🏆 ${p.skillsCount} Badge</span>
          </div>
        </div>
        <div class="mobile-card-footer">
          <div class="profile-links-container">
            ${profileButtons}
          </div>
          <button class="expand-btn" id="mobile-expand-${rank}">
            Detail <span class="arrow-icon">▼</span>
          </button>
        </div>
        <div class="mobile-expanded-content" id="mobile-expanded-content-${rank}">
          <div class="badge-list-title">Game Arcade (${p.arcadeCount})</div>
          <div class="badge-tag-list">
            ${p.arcadeList.length > 0
          ? p.arcadeList.map(b => `<span class="mini-badge-tag arcade-tag">${escapeHtml(b)}</span>`).join('')
          : '<span style="color: var(--text-muted); font-size: 0.75rem;">Belum menyelesaikan game arcade</span>'
        }
          </div>
          <div class="badge-list-title">Badge Keahlian (${p.skillsCount})</div>
          <div class="badge-tag-list">
            ${p.skillsList.length > 0
          ? p.skillsList.map(b => `<span class="mini-badge-tag skill-tag">${escapeHtml(b)}</span>`).join('')
          : '<span style="color: var(--text-muted); font-size: 0.75rem;">Belum menyelesaikan badge keahlian</span>'
        }
          </div>
          <div class="badge-list-title">Verifikasi AI Agent</div>
          <p style="font-size: 0.75rem;">Status: ${escapeHtml(p.verifyStatus)}</p>
        </div>
      `;

      // Bind expand click
      const expandBtn = mobileCard.querySelector(`#mobile-expand-${rank}`);
      const expandedContent = mobileCard.querySelector(`#mobile-expanded-content-${rank}`);
      expandBtn.addEventListener('click', () => {
        const isVisible = expandedContent.style.display === 'block';
        expandedContent.style.display = isVisible ? 'none' : 'block';
        expandBtn.innerHTML = isVisible ? 'Detail <span class="arrow-icon">▼</span>' : 'Tutup <span class="arrow-icon">▲</span>';
      });

      mobileCardsContainer.appendChild(mobileCard);
    });
  }

  function getMilestoneClass(milestone) {
    if (milestone === 'Ultimate Milestone') return 'm-ultimate';
    if (milestone === 'Milestone 3') return 'm-milestone-3';
    if (milestone === 'Milestone 2') return 'm-milestone-2';
    if (milestone === 'Milestone 1') return 'm-milestone-1';
    return 'm-none';
  }

  // --- 5. Detail Modal ---
  function openParticipantModal(p, rank) {
    activeParticipant = p;
    activeModalParticipant = p;
    modalName.textContent = p.name;
    modalPoints.textContent = `Total Poin: ${p.points} Poin (Peringkat #${rank})`;

    // Milestone badges
    modalMilestoneBadge.textContent = p.milestone;
    modalMilestoneBadge.className = `milestone-badge ${getMilestoneClass(p.milestone)}`;

    // Tier in modal
    const tier = getPrizeTier(p.points);
    if (tier) {
      modalTierBadge.innerHTML = `<span class="tier-stars">${tier.stars}</span> ${tier.name} (${tier.pointsReq}+ Pts)`;
      modalTierBadge.className = `tier-badge ${tier.className}`;
      modalTierBadge.style.display = 'inline-flex';
      modalTierBadge.style.opacity = '1';
    } else {
      const needed = 50 - p.points;
      modalTierBadge.innerHTML = `<span class="tier-stars" style="opacity:0.6;">★</span> Butuh ${needed} poin lagi menuju Trooper (50 Pts)`;
      modalTierBadge.className = 'tier-badge tier-trooper';
      modalTierBadge.style.display = 'inline-flex';
      modalTierBadge.style.opacity = '0.8';
    }

    let nextMilestone = "";
    let targetGames = 0;
    let targetSkills = 0;

    if (p.milestone === "None") {
      nextMilestone = "Milestone 1";
      targetGames = 6;
      targetSkills = 14;
    } else if (p.milestone === "Milestone 1") {
      nextMilestone = "Milestone 2";
      targetGames = 8;
      targetSkills = 28;
    } else if (p.milestone === "Milestone 2") {
      nextMilestone = "Milestone 3";
      targetGames = 10;
      targetSkills = 42;
    } else if (p.milestone === "Milestone 3") {
      nextMilestone = "Ultimate Milestone";
      targetGames = 12;
      targetSkills = 56;
    }

    if (nextMilestone !== "") {
      const arcadePerc = Math.min(100, (p.arcadeCount / targetGames) * 100);
      modalArcadeProgressBar.style.width = `${arcadePerc}%`;
      modalArcadeProgressText.textContent = `${p.arcadeCount} / ${targetGames} Game`;

      const skillPerc = Math.min(100, (p.skillsCount / targetSkills) * 100);
      modalSkillProgressBar.style.width = `${skillPerc}%`;
      modalSkillProgressText.textContent = `${p.skillsCount} / ${targetSkills} Badge`;

      const needGames = Math.max(0, targetGames - p.arcadeCount);
      const needSkills = Math.max(0, targetSkills - p.skillsCount);
      modalNextMilestoneHint.innerHTML = `Butuh tambahan <strong style="color: var(--accent-cyan); font-family: var(--font-stats);">${needGames} game</strong> dan <strong style="color: var(--accent-pink); font-family: var(--font-stats);">${needSkills} badge keahlian</strong> untuk mencapai <strong>${nextMilestone}</strong>.`;
    } else {
      // Max milestone reached
      modalArcadeProgressBar.style.width = `100%`;
      modalArcadeProgressText.textContent = `${p.arcadeCount} Game`;
      modalSkillProgressBar.style.width = `100%`;
      modalSkillProgressText.textContent = `${p.skillsCount} Badge`;
      modalNextMilestoneHint.textContent = `🎉 Selamat! Anda telah meraih Ultimate Milestone (Pencapaian Tertinggi).`;
    }

    // Render badges list
    modalArcadeCount.textContent = p.arcadeCount;
    modalArcadeList.innerHTML = p.arcadeList.length > 0
      ? p.arcadeList.map(b => `<span class="mini-badge-tag arcade-tag">${escapeHtml(b)}</span>`).join('')
      : '<span style="color: var(--text-muted); font-size: 0.85rem;">Belum ada arcade game yang selesai.</span>';

    modalSkillCount.textContent = p.skillsCount;
    modalSkillList.innerHTML = p.skillsList.length > 0
      ? p.skillsList.map(b => `<span class="mini-badge-tag skill-tag">${escapeHtml(b)}</span>`).join('')
      : '<span style="color: var(--text-muted); font-size: 0.85rem;">Belum ada lencana keahlian yang selesai.</span>';

    // Verification
    modalVerificationStatus.innerHTML = `Status: <strong style="color: ${p.verifyStatus === 'Verified' ? 'var(--accent-green)' : 'var(--text-secondary)'}">${escapeHtml(p.verifyStatus)}</strong>`;

    // Profile links in Modal
    modalLinksContainer.innerHTML = '';
    const safeModalSkillsUrl = sanitizeUrl(p.skillsUrl);
    const safeModalDevUrl = sanitizeUrl(p.devUrl);
    if (safeModalSkillsUrl) {
      modalLinksContainer.innerHTML += `
        <a href="${safeModalSkillsUrl}" target="_blank" rel="noopener noreferrer" class="profile-link" style="width: auto; height: auto; padding: 6px 12px; border-radius: 4px; font-size: 0.8rem; font-family: var(--font-stats);" title="Profil Skills">
          Google Skills Profile ↗
        </a>`;
    }
    if (safeModalDevUrl) {
      modalLinksContainer.innerHTML += `
        <a href="${safeModalDevUrl}" target="_blank" rel="noopener noreferrer" class="profile-link dev" style="width: auto; height: auto; padding: 6px 12px; border-radius: 4px; font-size: 0.8rem; font-family: var(--font-stats);" title="Profil Developer">
          Google Developer Profile ↗
        </a>`;
    }
    if (!safeModalSkillsUrl && !safeModalDevUrl) {
      modalLinksContainer.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">Tidak ada tautan profil publik.</span>';
    }

    // Reset Live Sync UI states
    modalLiveVerifyContainer.style.display = 'none';
    modalVerifyLiveBtn.textContent = 'Sinkronisasi Sekarang';
    modalVerifyLiveBtn.disabled = false;
    modalLiveVerifySummary.innerHTML = '';
    modalLiveBadgeList.innerHTML = '';
    modalLiveSyncAction.style.display = 'none';

    if (p.skillsUrl) {
      modalVerifyLiveBtn.style.display = 'inline-block';
      const cache = profileCache[p.skillsUrl];
      if (cache) {
        const syncedDate = new Date(cache.lastSynced).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const syncedDay = new Date(cache.lastSynced).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
        modalVerifyLiveBtn.textContent = `Disinkronkan (${syncedDay}, ${syncedDate})`;
      }
    } else {
      modalVerifyLiveBtn.style.display = 'none';
    }

    detailsModal.style.display = 'flex';
  }

  // Close modal event listeners
  modalCloseBtn.addEventListener('click', closeModal);
  detailsModal.addEventListener('click', (e) => {
    if (e.target === detailsModal) closeModal();
  });

  function closeModal() {
    detailsModal.style.display = 'none';
    activeParticipant = null;
  }

  // Close modal on Escape key press
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && detailsModal.style.display === 'flex') {
      closeModal();
    }
  });


  // --- 6. Export Functions ---

  // Trigger Toast Notification
  function showToast(message, showSpinner = true, duration = 0, toast_type = '') {
    statusToastText.textContent = message;
    const spinner = statusToast.querySelector('.spinner');
    if (spinner) {
      spinner.style.display = showSpinner ? 'block' : 'none';
    }

    statusToast.classList.remove('success', 'warning', 'error');
    if (toast_type) {
      statusToast.classList.add(toast_type);
    }

    statusToast.style.display = 'flex';

    if (duration > 0) {
      setTimeout(hideToast, duration);
    }
  }

  function hideToast() {
    statusToast.style.display = 'none';
  }

  // Helper to inline @font-face rules and CSS variables for rendering inside sandbox (like Firefox SVG rendering)
  function inlineStylesAndFonts(targetElement) {
    let styleContent = '';
    try {
      for (const stylesheet of document.styleSheets) {
        try {
          if (stylesheet.cssRules) {
            for (const rule of stylesheet.cssRules) {
              if (rule.type === CSSRule.FONT_FACE_RULE || rule.cssText.startsWith('@font-face')) {
                styleContent += rule.cssText + '\n';
              }
            }
          }
        } catch (e) {
          // Ignore CORS/cross-origin stylesheet reading exceptions
        }
      }
    } catch (e) {
      console.error('Failed to parse font-face rules:', e);
    }

    styleContent += `
      :root {
        --bg-primary: #060b16;
        --bg-secondary: #0c1428;
        --bg-card: rgba(12, 20, 40, 0.7);
        --border-color: rgba(0, 242, 254, 0.15);
        --accent-gold: #fbc531;
        --accent-gold-glow: rgba(251, 197, 49, 0.4);
        --accent-cyan: #00f2fe;
        --accent-cyan-glow: rgba(0, 242, 254, 0.4);
        --accent-pink: #ff007f;
        --accent-pink-glow: rgba(255, 0, 127, 0.4);
        --accent-green: #39ff14;
        --accent-green-glow: rgba(57, 255, 20, 0.4);
        --accent-red: #ff3838;
        --text-primary: #ffffff;
        --text-secondary: #8b9bb4;
        --text-muted: #53647c;
        --font-retro: 'VT323', 'Silkscreen', 'Press Start 2P', monospace;
        --font-stats: 'Orbitron', sans-serif;
        --font-body: 'Inter', sans-serif;
      }
    `;

    const styleTag = document.createElement('style');
    styleTag.textContent = styleContent;
    targetElement.appendChild(styleTag);
  }

  // Helper to chunk participants into pages of size N (for 16:9 layouts)
  function chunkArray(array, size) {
    const chunked = [];
    for (let i = 0; i < array.length; i += size) {
      chunked.push(array.slice(i, i + size));
    }
    return chunked;
  }

  // Generate 16:9 slide elements in off-screen render area
  function generateSlideDOM(participantsChunk, pageIndex, totalPages) {
    exportRenderArea.innerHTML = ''; // Clear previous

    const slide = document.createElement('div');
    slide.className = 'export-slide';

    // Header
    const header = document.createElement('div');
    header.className = 'export-slide-header';
    header.innerHTML = `
      <div class="export-slide-title">THE ARCADE LEADERBOARD</div>
      <div class="export-slide-meta">Halaman ${pageIndex} dari ${totalPages}</div>
    `;
    slide.appendChild(header);

    // Table of 10 participants
    const table = document.createElement('table');
    table.className = 'export-slide-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th style="width: 70px; text-align: center;">#</th>
          <th>Peserta</th>
          <th style="width: 100px; text-align: center;">Poin</th>
          <th>Milestone</th>
          <th style="width: 110px; text-align: center;">Game</th>
          <th style="width: 110px; text-align: center;">Skill</th>
          <th>Tier</th>
        </tr>
      </thead>
      <tbody>
        ${participantsChunk.map((p, idx) => {
      // Rank calculation based on page size of 10
      const rank = (pageIndex - 1) * 10 + idx + 1;
      let rankClass = '';
      if (rank === 1) rankClass = 'rank-1';
      else if (rank === 2) rankClass = 'rank-2';
      else if (rank === 3) rankClass = 'rank-3';

      const milestoneClass = getMilestoneClass(p.milestone);
      const prizeTierHtml = getPrizeTierHtml(p.points);

      return `
            <tr>
              <td style="text-align: center;"><span class="rank-badge ${rankClass}" style="transform: scale(0.85);">${rank}</span></td>
              <td class="name-cell" style="font-size: 0.9rem;">${escapeHtml(p.name)}</td>
              <td style="text-align: center;" class="points-badge" style="font-size: 0.95rem;">${p.points}</td>
              <td><span class="milestone-badge ${milestoneClass}" style="transform: scale(0.8); transform-origin: left;">${escapeHtml(p.milestone)}</span></td>
              <td style="text-align: center;"><span class="badge-count arcade" style="font-size: 0.8rem;">🎮 ${p.arcadeCount}</span></td>
              <td style="text-align: center;"><span class="badge-count skill" style="font-size: 0.8rem;">🏆 ${p.skillsCount}</span></td>
              <td>${prizeTierHtml}</td>
            </tr>
          `;
    }).join('')}
      </tbody>
    `;
    slide.appendChild(table);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'export-slide-footer';

    // Add date/timestamp
    const now = new Date();
    const dateStr = now.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });

    footer.innerHTML = `
      <div>Laporan Leaderboard Google Cloud Arcade Facilitator • ${dateStr} • Created by Schryzon</div>
      <div class="export-slide-footer-logo">Google Cloud Arcade</div>
    `;
    slide.appendChild(footer);

    inlineStylesAndFonts(slide);
    exportRenderArea.appendChild(slide);
  }

  // --- Export as a single long vertical image ---
  exportLongBtn.addEventListener('click', async () => {
    if (filteredParticipants.length === 0) {
      alert('Tidak ada data untuk diekspor.');
      return;
    }

    showToast('Menyiapkan gambar leaderboard panjang...');

    // Build vertical long dashboard layout in off-screen render area
    exportLongRenderArea.innerHTML = '';

    const container = document.createElement('div');
    container.style.padding = '40px';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '30px';
    container.style.background = 'var(--bg-primary)';

    // Banner
    const banner = document.createElement('div');
    banner.style.textAlign = 'center';
    banner.style.borderBottom = '3px solid rgba(0, 242, 254, 0.3)';
    banner.style.paddingBottom = '25px';
    banner.innerHTML = `
      <div style="font-family: var(--font-retro); font-size: 2.2rem; color: var(--accent-gold); text-shadow: 0 0 10px var(--accent-gold-glow); letter-spacing: 2px; margin-bottom: 5px;">THE ARCADE</div>
      <div style="font-family: var(--font-stats); font-size: 1.1rem; color: var(--accent-cyan); letter-spacing: 2px;">LEADERBOARD RESMI KELOMPOK</div>
    `;
    container.appendChild(banner);

    // Summary Card Rows
    const summary = document.createElement('div');
    summary.style.display = 'grid';
    summary.style.gridTemplateColumns = 'repeat(4, 1fr)';
    summary.style.gap = '15px';
    summary.innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Total Peserta</div>
        <div class="stat-value" style="font-size: 1.5rem;">${parsedParticipants.length}</div>
      </div>
      <div class="stat-card gold">
        <div class="stat-label">Total Game Badge</div>
        <div class="stat-value" style="font-size: 1.5rem;">${parsedParticipants.reduce((sum, p) => sum + p.arcadeCount, 0)}</div>
      </div>
      <div class="stat-card green">
        <div class="stat-label">Total Skill Badge</div>
        <div class="stat-value" style="font-size: 1.5rem;">${parsedParticipants.reduce((sum, p) => sum + p.skillsCount, 0)}</div>
      </div>
      <div class="stat-card gold">
        <div class="stat-label">Tier Achievers</div>
        <div class="stat-value" style="font-size: 1.5rem;">${parsedParticipants.filter(p => p.points >= 50).length}</div>
      </div>
    `;
    container.appendChild(summary);

    // Table
    const table = document.createElement('table');
    table.className = 'leaderboard-table';
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.background = 'var(--bg-card)';
    table.style.border = '1px solid var(--border-color)';
    table.style.borderRadius = '10px';

    table.innerHTML = `
      <thead>
        <tr>
          <th style="width: 70px; text-align: center; border-bottom: 2px solid rgba(0,242,254,0.2); padding: 12px 15px;">#</th>
          <th style="border-bottom: 2px solid rgba(0,242,254,0.2); padding: 12px 15px;">Peserta</th>
          <th style="width: 90px; text-align: center; border-bottom: 2px solid rgba(0,242,254,0.2); padding: 12px 15px;">Poin</th>
          <th style="border-bottom: 2px solid rgba(0,242,254,0.2); padding: 12px 15px;">Milestone</th>
          <th style="width: 120px; text-align: center; border-bottom: 2px solid rgba(0,242,254,0.2); padding: 12px 15px;">Game</th>
          <th style="width: 120px; text-align: center; border-bottom: 2px solid rgba(0,242,254,0.2); padding: 12px 15px;">Skill</th>
          <th style="border-bottom: 2px solid rgba(0,242,254,0.2); padding: 12px 15px;">Tier</th>
        </tr>
      </thead>
      <tbody>
        ${filteredParticipants.map((p, idx) => {
      const rank = idx + 1;
      let rankClass = '';
      if (rank === 1) rankClass = 'rank-1';
      else if (rank === 2) rankClass = 'rank-2';
      else if (rank === 3) rankClass = 'rank-3';

      const milestoneClass = getMilestoneClass(p.milestone);
      const prizeTierHtml = getPrizeTierHtml(p.points);

      return `
            <tr>
              <td style="text-align: center; border-bottom: 1px solid rgba(255,255,255,0.05); padding: 12px 15px;"><span class="rank-badge ${rankClass}" style="transform: scale(0.85);">${rank}</span></td>
              <td class="name-cell" style="border-bottom: 1px solid rgba(255,255,255,0.05); padding: 12px 15px; font-size: 0.95rem;">${escapeHtml(p.name)}</td>
              <td style="text-align: center; border-bottom: 1px solid rgba(255,255,255,0.05); padding: 12px 15px;" class="points-badge">${p.points}</td>
              <td style="border-bottom: 1px solid rgba(255,255,255,0.05); padding: 12px 15px;"><span class="milestone-badge ${milestoneClass}" style="transform: scale(0.85); transform-origin: left;">${escapeHtml(p.milestone)}</span></td>
              <td style="text-align: center; border-bottom: 1px solid rgba(255,255,255,0.05); padding: 12px 15px;"><span class="badge-count arcade">🎮 ${p.arcadeCount}</span></td>
              <td style="text-align: center; border-bottom: 1px solid rgba(255,255,255,0.05); padding: 12px 15px;"><span class="badge-count skill">🏆 ${p.skillsCount}</span></td>
              <td style="border-bottom: 1px solid rgba(255,255,255,0.05); padding: 12px 15px;">${prizeTierHtml}</td>
            </tr>
          `;
    }).join('')}
      </tbody>
    `;
    container.appendChild(table);

    // Footer timestamp
    const footer = document.createElement('div');
    footer.style.display = 'flex';
    footer.style.justifyContent = 'space-between';
    footer.style.borderTop = '1px solid rgba(255,255,255,0.1)';
    footer.style.paddingTop = '15px';
    footer.style.color = 'var(--text-muted)';
    footer.style.fontSize = '0.8rem';
    footer.style.fontFamily = 'var(--font-stats)';
    const dateStr = new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
    footer.innerHTML = `
      <div>Laporan Leaderboard Lengkap • ${dateStr} • Created by Schryzon</div>
      <div style="font-family: var(--font-retro); color: var(--accent-cyan); font-size: 0.7rem;">Google Cloud Arcade</div>
    `;
    container.appendChild(footer);

    inlineStylesAndFonts(container);
    exportLongRenderArea.appendChild(container);

    // Render Canvas
    setTimeout(async () => {
      try {
        const canvas = await html2canvas(container, {
          backgroundColor: '#060b16',
          scale: 2, // High resolution
          useCORS: true,
          logging: false
        });

        // Trigger download
        const link = document.createElement('a');
        link.download = `Arcade_Leaderboard_Full_${getFilenameTimestamp()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();

        hideToast();
      } catch (err) {
        console.error(err);
        alert('Terjadi kesalahan saat memproses gambar.');
        hideToast();
      }
    }, 500);
  });

  // --- Export as landscape 16:9 PDF ---
  exportPdfBtn.addEventListener('click', async () => {
    if (filteredParticipants.length === 0) {
      alert('Tidak ada data untuk diekspor.');
      return;
    }

    // Chunk array by 10 (10 rows per 16:9 slide is ideal for legibility and proportions)
    const chunks = chunkArray(filteredParticipants, 10);
    showToast(`Menyiapkan PDF 16:9 (${chunks.length} Halaman)...`);

    // Import jsPDF
    const { jsPDF } = window.jspdf;
    // Create landscape PDF with exact 1280x720 page size (in pixels)
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: [1280, 720]
    });

    try {
      for (let i = 0; i < chunks.length; i++) {
        showToast(`Membuat halaman ${i + 1} dari ${chunks.length}...`);

        // Render current page DOM
        generateSlideDOM(chunks[i], i + 1, chunks.length);

        // Let fonts render
        await new Promise(r => setTimeout(r, 100));

        const slideElement = exportRenderArea.querySelector('.export-slide');
        const canvas = await html2canvas(slideElement, {
          width: 1280,
          height: 720,
          scale: 2, // Retain high quality
          backgroundColor: '#060b16',
          useCORS: true,
          logging: false
        });

        const imgData = canvas.toDataURL('image/png');
        if (i > 0) {
          pdf.addPage([1280, 720], 'l');
        }
        // Draw image 1-to-1 without resizing distortion
        pdf.addImage(imgData, 'PNG', 0, 0, 1280, 720);
      }

      pdf.save(`Arcade_Leaderboard_${getFilenameTimestamp()}.pdf`);
      hideToast();
    } catch (err) {
      console.error(err);
      alert('Gagal mengekspor PDF.');
      hideToast();
    } finally {
      exportRenderArea.innerHTML = ''; // Clean up
    }
  });

  // --- Export as ZIP of 16:9 Images ---
  exportZipBtn.addEventListener('click', async () => {
    if (filteredParticipants.length === 0) {
      alert('Tidak ada data untuk diekspor.');
      return;
    }

    const chunks = chunkArray(filteredParticipants, 10);
    showToast(`Menyiapkan ZIP Gambar 16:9 (${chunks.length} slide)...`);

    const zip = new JSZip();

    try {
      for (let i = 0; i < chunks.length; i++) {
        showToast(`Merender gambar ${i + 1} dari ${chunks.length}...`);

        // Render page DOM
        generateSlideDOM(chunks[i], i + 1, chunks.length);

        // Wait for render
        await new Promise(r => setTimeout(r, 100));

        const slideElement = exportRenderArea.querySelector('.export-slide');
        const canvas = await html2canvas(slideElement, {
          width: 1280,
          height: 720,
          scale: 2,
          backgroundColor: '#060b16',
          useCORS: true,
          logging: false
        });

        // Convert canvas to blob
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

        // Add to zip file structure
        zip.file(`arcade_leaderboard_page_${i + 1}.png`, blob);
      }

      showToast('Mengompresi berkas ZIP...');
      const zipBlob = await zip.generateAsync({ type: 'blob' });

      const link = document.createElement('a');
      link.download = `Arcade_Leaderboard_Slides_${getFilenameTimestamp()}.zip`;
      link.href = URL.createObjectURL(zipBlob);
      link.click();

      hideToast();
    } catch (err) {
      console.error(err);
      alert('Gagal mengekspor ZIP gambar.');
      hideToast();
    } finally {
      exportRenderArea.innerHTML = ''; // Clean up
    }
  });

  // --- 7. Live Profile Synchronizer & Concurrency Queue ---

  // Helper to ensure target URL is fetched in English
  function forceEnglishLocale(url) {
    if (!url) return '';
    const cacheBuster = `_t=${new Date().getTime()}`;
    try {
      const parsedUrl = new URL(url);
      parsedUrl.searchParams.set('locale', 'en');
      parsedUrl.searchParams.set('_t', new Date().getTime());
      return parsedUrl.toString();
    } catch (e) {
      if (url.includes('?')) {
        if (url.includes('locale=')) {
          return url.replace(/locale=[^&]+/, 'locale=en') + '&' + cacheBuster;
        }
        return url + '&locale=en&' + cacheBuster;
      }
      return url + '?locale=en&' + cacheBuster;
    }
  }

  async function fetchAndParseProfile(profileUrl, hasBonus) {
    if (!profileUrl) return null;
    const targetUrl = forceEnglishLocale(profileUrl);
    const proxyUrl = get_proxy_url(targetUrl);
    const res = await fetch(proxyUrl);
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}${errText ? ': ' + errText : ''}`);
    }
    const htmlText = await res.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');

    // Extract profile name and avatar if available
    const nameEl = doc.querySelector('h1.ql-headline-medium') || doc.querySelector('h1');
    const playerName = nameEl ? nameEl.textContent.trim() : 'Peserta Google Skills';
    const avatarEl = doc.querySelector('.profile-avatar img') || doc.querySelector('ql-avatar img');
    const avatarUrl = avatarEl ? (avatarEl.getAttribute('src') || '') : '';

    const badgeElements = doc.querySelectorAll('.profile-badge');
    const eventArcadeList = [];
    const eventSkillsList = [];
    const extendedArcadeList = [];
    const extendedSkillsList = [];
    const allBadgesAudit = [];

    badgeElements.forEach(badgeEl => {
      const titleEl = badgeEl.querySelector('.ql-title-medium');
      const title = titleEl ? titleEl.textContent.trim() : '';
      if (!title) return;

      const earnedEl = badgeEl.querySelector('.ql-body-medium.l-mbs');
      const earnedText = earnedEl ? earnedEl.textContent.trim() : '';
      const dateCategory = getBadgeDateCategory(earnedText);

      const dialogId = badgeEl.querySelector('ql-button') ? badgeEl.querySelector('ql-button').getAttribute('modal') : '';
      const dialog = dialogId ? doc.getElementById(dialogId) : null;

      const learnMoreBtn = dialog ? dialog.querySelector('ql-button[slot="action"]') : null;
      const href = learnMoreBtn ? (learnMoreBtn.getAttribute('href') || '') : '';
      const description = dialog ? (dialog.querySelector('p') ? dialog.querySelector('p').textContent.toLowerCase() : '') : '';

      let baseType = 'ignored';
      if (customClassifications[title]) {
        baseType = customClassifications[title];
      } else {
        const isArcade = href.includes('/games/');
        const isSkill = description.includes('skill badge') ||
          description.includes('badge keahlian') ||
          description.includes('lencana keahlian');
        if (isArcade) baseType = 'arcade';
        else if (isSkill) baseType = 'skill';
      }

      allBadgesAudit.push({
        title,
        earnedText,
        baseType,
        dateCategory,
        href,
        description
      });

      if (dateCategory === 'invalid') return;

      if (dateCategory === 'event') {
        if (baseType === 'arcade') eventArcadeList.push(title);
        else if (baseType === 'skill') eventSkillsList.push(title);
      } else if (dateCategory === 'extended') {
        if (baseType === 'arcade') extendedArcadeList.push(title);
        else if (baseType === 'skill') extendedSkillsList.push(title);
      }
    });

    const cutoffArcadeCount = eventArcadeList.length;
    const cutoffSkillsCount = eventSkillsList.length;
    const extendedArcadeCount = extendedArcadeList.length;
    const extendedSkillsCount = extendedSkillsList.length;

    const totalArcadeCount = cutoffArcadeCount + extendedArcadeCount;
    const totalSkillsCount = cutoffSkillsCount + extendedSkillsCount;

    // Player milestone is evaluated strictly against badges earned on or before event cutoff (29 Sept 2026)
    const milestone = getCalculatedMilestone(cutoffArcadeCount, cutoffSkillsCount);
    const milestoneBonus = getMilestoneBonus(milestone);

    // Total points combines total eligible badges (event + extended) plus cutoff milestone bonus and gear bonus
    const points = totalArcadeCount * 1 + Math.floor(totalSkillsCount / 2) + milestoneBonus + (hasBonus ? 10 : 0);

    const arcadeList = [...eventArcadeList, ...extendedArcadeList];
    const skillsList = [...eventSkillsList, ...extendedSkillsList];

    return {
      playerName,
      avatarUrl,
      cutoffArcadeCount,
      cutoffSkillsCount,
      extendedArcadeCount,
      extendedSkillsCount,
      arcadeCount: totalArcadeCount,
      skillsCount: totalSkillsCount,
      eventArcadeList,
      eventSkillsList,
      extendedArcadeList,
      extendedSkillsList,
      arcadeList,
      skillsList,
      allBadgesAudit,
      points,
      milestone,
      milestoneBonus,
      hasBonus: Boolean(hasBonus)
    };
  }

  async function syncAllProfiles() {
    const participantsWithUrls = parsedParticipants.filter(p => p.skillsUrl);
    if (participantsWithUrls.length === 0) {
      alert('Tidak ada tautan profil Google Skills untuk disinkronisasi.');
      return;
    }

    const progressContainer = document.getElementById('sync-progress-container');
    const progressText = document.getElementById('sync-progress-text');
    const progressPercent = document.getElementById('sync-progress-percent');
    const progressBar = document.getElementById('sync-progress-bar');

    syncLiveBtn.disabled = true;
    syncLiveBtn.textContent = 'Syncing...';
    progressContainer.style.display = 'block';

    let sync_completed = 0;
    let sync_success_count = 0;
    let sync_fail_count = 0;
    let last_sync_error = '';
    const total_participants = participantsWithUrls.length;
    const sync_concurrency = 5;

    for (let i = 0; i < total_participants; i += sync_concurrency) {
      const batch = participantsWithUrls.slice(i, i + sync_concurrency);
      await Promise.all(batch.map(async (p) => {
        try {
          const stats = await fetchAndParseProfile(p.skillsUrl, p.hasBonus);
          if (stats) {
            profileCache[p.skillsUrl] = {
              playerName: stats.playerName,
              avatarUrl: stats.avatarUrl,
              cutoffArcadeCount: stats.cutoffArcadeCount,
              cutoffSkillsCount: stats.cutoffSkillsCount,
              extendedArcadeCount: stats.extendedArcadeCount,
              extendedSkillsCount: stats.extendedSkillsCount,
              arcadeCount: stats.arcadeCount,
              skillsCount: stats.skillsCount,
              points: stats.points,
              milestone: stats.milestone,
              eventArcadeList: stats.eventArcadeList,
              eventSkillsList: stats.eventSkillsList,
              extendedArcadeList: stats.extendedArcadeList,
              extendedSkillsList: stats.extendedSkillsList,
              arcadeList: stats.arcadeList,
              skillsList: stats.skillsList,
              lastSynced: new Date().getTime()
            };

            p.cutoffArcade = stats.cutoffArcadeCount;
            p.cutoffSkills = stats.cutoffSkillsCount;
            p.extendedArcade = stats.extendedArcadeCount;
            p.extendedSkills = stats.extendedSkillsCount;
            p.arcadeCount = stats.arcadeCount;
            p.skillsCount = stats.skillsCount;
            p.arcadeList = stats.arcadeList;
            p.skillsList = stats.skillsList;
            p.points = stats.points;
            p.milestone = stats.milestone;
            p.diffCount = (stats.arcadeCount + stats.skillsCount) - (p.csvArcadeCount + p.csvSkillsCount);
            p.diffPoints = stats.points - p.csvPoints;
            p.lastSynced = profileCache[p.skillsUrl].lastSynced;
            sync_success_count++;
          } else {
            sync_fail_count++;
          }
        } catch (err) {
          last_sync_error = err.message || String(err);
          console.error(`Gagal sinkronisasi profil ${p.name}:`, err);
          sync_fail_count++;
        } finally {
          sync_completed++;
          const percentage = Math.round((sync_completed / total_participants) * 100);
          progressText.textContent = `Menyelaraskan profil: ${sync_completed} / ${total_participants} peserta...`;
          progressPercent.textContent = `${percentage}%`;
          progressBar.style.width = `${percentage}%`;
        }
      }));
    }

    safeSetStorage('arcade_profile_cache', JSON.stringify(profileCache));
    updateLeaderboard();

    if (sync_fail_count === total_participants) {
      showToast(`Sinkronisasi gagal (${last_sync_error || 'Koneksi/CSP error'})`, false, 5000, 'error');
    } else if (sync_fail_count > 0) {
      showToast(`Sinkronisasi selesai! ${sync_success_count} berhasil, ${sync_fail_count} gagal.`, false, 3500, 'warning');
    } else {
      showToast('Sinkronisasi profil selesai!', false, 2000, 'success');
    }

    setTimeout(() => {
      progressContainer.style.display = 'none';
      syncLiveBtn.disabled = false;
      syncLiveBtn.textContent = 'Sync Live';
    }, 2000);
  }

  let tempLiveStats = null;

  async function syncSingleProfile() {
    if (!activeModalParticipant || !activeModalParticipant.skillsUrl) {
      alert('Tautan profil tidak tersedia.');
      return;
    }

    modalVerifyLiveBtn.disabled = true;
    modalVerifyLiveBtn.textContent = 'Memproses...';
    modalLiveVerifyContainer.style.display = 'block';
    modalLiveVerifySummary.innerHTML = '<span style="color: var(--accent-cyan);">Menghubungkan ke profil...</span>';
    modalLiveBadgeList.innerHTML = '';
    modalLiveSyncAction.style.display = 'none';

    try {
      const targetUrl = forceEnglishLocale(activeModalParticipant.skillsUrl);
      const proxyUrl = get_proxy_url(targetUrl);
      const res = await fetch(proxyUrl);
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${errText ? ': ' + errText : ''}`);
      }
      const htmlText = await res.text();

      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, 'text/html');

      const badgeElements = doc.querySelectorAll('.profile-badge');
      const rawBadges = [];

      badgeElements.forEach(badgeEl => {
        const titleEl = badgeEl.querySelector('.ql-title-medium');
        const title = titleEl ? titleEl.textContent.trim() : '';
        if (!title) return;

        const earnedEl = badgeEl.querySelector('.ql-body-medium.l-mbs');
        const earnedText = earnedEl ? earnedEl.textContent.trim() : '';

        const dialogId = badgeEl.querySelector('ql-button') ? badgeEl.querySelector('ql-button').getAttribute('modal') : '';
        const dialog = dialogId ? doc.getElementById(dialogId) : null;
        const learnMoreBtn = dialog ? dialog.querySelector('ql-button[slot="action"]') : null;
        const href = learnMoreBtn ? (learnMoreBtn.getAttribute('href') || '') : '';
        const description = dialog ? (dialog.querySelector('p') ? dialog.querySelector('p').textContent.toLowerCase() : '') : '';

        rawBadges.push({ title, href, description, earnedText });
      });

      renderLiveVerifyList(rawBadges);
    } catch (err) {
      console.error(err);
      modalLiveVerifySummary.innerHTML = `<span style="color: var(--accent-pink);">Gagal memproses profil: ${escapeHtml(err.message)}</span>`;
      modalVerifyLiveBtn.disabled = false;
      modalVerifyLiveBtn.textContent = 'Sinkronisasi Sekarang';
    }
  }

  function renderLiveVerifyList(rawBadges) {
    modalLiveBadgeList.innerHTML = '';

    const processedBadges = rawBadges.map(badge => {
      let type = 'ignored';
      const dateCategory = getBadgeDateCategory(badge.earnedText);

      if (dateCategory === 'invalid') {
        type = 'invalid-date';
      } else if (customClassifications[badge.title]) {
        type = customClassifications[badge.title];
      } else {
        const isArcade = badge.href.includes('/games/');
        const isSkill = badge.description.includes('skill badge') ||
          badge.description.includes('badge keahlian') ||
          badge.description.includes('lencana keahlian');
        if (isArcade) type = 'arcade';
        else if (isSkill) type = 'skill';
      }
      return { title: badge.title, type, dateCategory, earnedText: badge.earnedText };
    });

    const eventArcade = processedBadges.filter(b => b.type === 'arcade' && b.dateCategory === 'event').map(b => b.title);
    const eventSkills = processedBadges.filter(b => b.type === 'skill' && b.dateCategory === 'event').map(b => b.title);
    const extendedArcade = processedBadges.filter(b => b.type === 'arcade' && b.dateCategory === 'extended').map(b => b.title);
    const extendedSkills = processedBadges.filter(b => b.type === 'skill' && b.dateCategory === 'extended').map(b => b.title);

    const totalArcade = eventArcade.length + extendedArcade.length;
    const totalSkills = eventSkills.length + extendedSkills.length;

    // Official milestone evaluated strictly on event cutoff badges (<= 29 Sep 2026)
    const liveMilestone = getCalculatedMilestone(eventArcade.length, eventSkills.length);
    const liveMilestoneBonus = getMilestoneBonus(liveMilestone);
    const livePoints = totalArcade * 1 + Math.floor(totalSkills / 2) + liveMilestoneBonus + (activeModalParticipant.hasBonus ? 10 : 0);

    tempLiveStats = {
      cutoffArcadeCount: eventArcade.length,
      cutoffSkillsCount: eventSkills.length,
      extendedArcadeCount: extendedArcade.length,
      extendedSkillsCount: extendedSkills.length,
      arcadeCount: totalArcade,
      skillsCount: totalSkills,
      arcadeList: [...eventArcade, ...extendedArcade],
      skillsList: [...eventSkills, ...extendedSkills],
      eventArcadeList: eventArcade,
      eventSkillsList: eventSkills,
      extendedArcadeList: extendedArcade,
      extendedSkillsList: extendedSkills,
      points: livePoints,
      milestone: liveMilestone
    };

    const isDiff = tempLiveStats.points !== activeModalParticipant.points ||
      tempLiveStats.arcadeCount !== activeModalParticipant.arcadeCount ||
      tempLiveStats.skillsCount !== activeModalParticipant.skillsCount;

    let summaryHtml = `
      <div style="margin-bottom: 8px;">Ditemukan <strong>${processedBadges.length} Lencana Total</strong> di profil live:</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-family: var(--font-stats); font-size: 0.8rem; margin-top: 5px;">
        <div style="border-left: 2px solid var(--accent-cyan); padding-left: 5px;">
          Live Total: 🎮 ${tempLiveStats.arcadeCount} | 🏆 ${tempLiveStats.skillsCount} | Poin: ${tempLiveStats.points}
          <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">
            (Event: 🎮 ${tempLiveStats.cutoffArcadeCount}, 🏆 ${tempLiveStats.cutoffSkillsCount} → ${liveMilestone})<br>
            (Lanjutan: +🎮 ${tempLiveStats.extendedArcadeCount}, +🏆 ${tempLiveStats.extendedSkillsCount})
          </div>
        </div>
        <div style="border-left: 2px solid var(--text-muted); padding-left: 5px; color: var(--text-muted);">
          CSV: 🎮 ${activeModalParticipant.csvArcadeCount} | 🏆 ${activeModalParticipant.csvSkillsCount} | Poin: ${activeModalParticipant.csvPoints}
          <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">
            Milestone CSV: ${activeModalParticipant.milestone}
          </div>
        </div>
      </div>
    `;

    if (isDiff) {
      const diff = tempLiveStats.points - activeModalParticipant.csvPoints;
      const diffSign = diff >= 0 ? `+${diff}` : `${diff}`;
      summaryHtml += `<div style="color: #00e096; margin-top: 8px; font-weight: bold;">⚠️ Selisih terdeteksi! (Diff: ${diffSign} Poin vs CSV)</div>`;
      modalLiveSyncAction.style.display = 'block';
    } else {
      summaryHtml += `<div style="color: var(--accent-green); margin-top: 8px;">✓ Data cocok dengan data CSV/Cache.</div>`;
      modalLiveSyncAction.style.display = 'block';
    }
    modalLiveVerifySummary.innerHTML = summaryHtml;

    processedBadges.forEach(b => {
      const row = document.createElement('div');
      row.className = 'live-badge-item';

      let btnText = 'Ignored';
      let btnClass = 'ignored';
      if (b.type === 'arcade') {
        btnText = '🎮 Arcade';
        btnClass = 'arcade';
      } else if (b.type === 'skill') {
        btnText = '🏆 Skill';
        btnClass = 'skill';
      } else if (b.type === 'invalid-date') {
        btnText = '📅 Invalid Date';
        btnClass = 'invalid-date';
      }

      let dateTag = '';
      if (b.dateCategory === 'event') {
        dateTag = '<span class="badge-tag-event" style="margin-left: 6px;">Event (s.d. 29 Sep)</span>';
      } else if (b.dateCategory === 'extended') {
        dateTag = '<span class="badge-tag-extended" style="margin-left: 6px;">Musim Lanjutan (s.d. 31 Des)</span>';
      }

      row.innerHTML = `
        <span class="live-badge-title">${escapeHtml(b.title)} ${dateTag}</span>
        <button class="live-badge-type-toggle ${btnClass}" data-title="${escapeHtml(b.title)}">${btnText}</button>
      `;

      const toggleBtn = row.querySelector('.live-badge-type-toggle');
      if (b.type === 'invalid-date') {
        toggleBtn.disabled = true;
        toggleBtn.style.cursor = 'not-allowed';
        toggleBtn.style.opacity = '0.6';
      } else {
        toggleBtn.addEventListener('click', () => {
          const currentType = b.type;
          let nextType = 'ignored';
          if (currentType === 'ignored') nextType = 'arcade';
          else if (currentType === 'arcade') nextType = 'skill';
          else if (currentType === 'skill') nextType = 'ignored';

          customClassifications[b.title] = nextType;
          safeSetStorage('arcade_custom_badge_classifications', JSON.stringify(customClassifications));

          renderLiveVerifyList(rawBadges);
        });
      }

      modalLiveBadgeList.appendChild(row);
    });

    modalVerifyLiveBtn.disabled = false;
    modalVerifyLiveBtn.textContent = 'Sinkronisasi Selesai';
  }

  function applySingleProfileLiveStats() {
    if (!activeModalParticipant || !tempLiveStats) return;

    activeModalParticipant.cutoffArcade = tempLiveStats.cutoffArcadeCount;
    activeModalParticipant.cutoffSkills = tempLiveStats.cutoffSkillsCount;
    activeModalParticipant.extendedArcade = tempLiveStats.extendedArcadeCount;
    activeModalParticipant.extendedSkills = tempLiveStats.extendedSkillsCount;
    activeModalParticipant.arcadeCount = tempLiveStats.arcadeCount;
    activeModalParticipant.skillsCount = tempLiveStats.skillsCount;
    activeModalParticipant.arcadeList = tempLiveStats.arcadeList;
    activeModalParticipant.skillsList = tempLiveStats.skillsList;
    activeModalParticipant.points = tempLiveStats.points;
    activeModalParticipant.milestone = tempLiveStats.milestone;

    activeModalParticipant.diffCount = (tempLiveStats.arcadeCount + tempLiveStats.skillsCount) -
      (activeModalParticipant.csvArcadeCount + activeModalParticipant.csvSkillsCount);
    activeModalParticipant.diffPoints = tempLiveStats.points - activeModalParticipant.csvPoints;
    activeModalParticipant.lastSynced = new Date().getTime();

    profileCache[activeModalParticipant.skillsUrl] = {
      cutoffArcadeCount: tempLiveStats.cutoffArcadeCount,
      cutoffSkillsCount: tempLiveStats.cutoffSkillsCount,
      extendedArcadeCount: tempLiveStats.extendedArcadeCount,
      extendedSkillsCount: tempLiveStats.extendedSkillsCount,
      arcadeCount: tempLiveStats.arcadeCount,
      skillsCount: tempLiveStats.skillsCount,
      points: tempLiveStats.points,
      milestone: tempLiveStats.milestone,
      arcadeList: tempLiveStats.arcadeList,
      skillsList: tempLiveStats.skillsList,
      lastSynced: activeModalParticipant.lastSynced
    };
    safeSetStorage('arcade_profile_cache', JSON.stringify(profileCache));

    updateLeaderboard();

    modalPoints.textContent = `Total Poin: ${activeModalParticipant.points} Poin (Peringkat #${activeParticipantIndex()})`;
    modalMilestoneBadge.textContent = activeModalParticipant.milestone;
    modalMilestoneBadge.className = `milestone-badge ${getMilestoneClass(activeModalParticipant.milestone)}`;

    modalArcadeCount.textContent = activeModalParticipant.arcadeCount;
    modalArcadeList.innerHTML = activeModalParticipant.arcadeList.length > 0
      ? activeModalParticipant.arcadeList.map(b => `<span class="mini-badge-tag arcade-tag">${escapeHtml(b)}</span>`).join('')
      : '<span style="color: var(--text-muted); font-size: 0.85rem;">Belum ada arcade game yang selesai.</span>';

    modalSkillCount.textContent = activeModalParticipant.skillsCount;
    modalSkillList.innerHTML = activeModalParticipant.skillsList.length > 0
      ? activeModalParticipant.skillsList.map(b => `<span class="mini-badge-tag skill-tag">${escapeHtml(b)}</span>`).join('')
      : '<span style="color: var(--text-muted); font-size: 0.85rem;">Belum ada lencana keahlian yang selesai.</span>';

    openParticipantModal(activeModalParticipant, activeParticipantIndex());

    showToast('Data live berhasil diterapkan ke leaderboard!', false, 2000);
    modalLiveSyncAction.style.display = 'none';
  }

  function activeParticipantIndex() {
    if (!activeModalParticipant) return 1;
    const idx = filteredParticipants.indexOf(activeModalParticipant);
    if (idx !== -1) return idx + 1;
    if (activeModalParticipant.skillsUrl) {
      const uIdx = filteredParticipants.findIndex(p => p.skillsUrl === activeModalParticipant.skillsUrl);
      if (uIdx !== -1) return uIdx + 1;
    }
    const nIdx = filteredParticipants.findIndex(p => p.name === activeModalParticipant.name);
    return nIdx !== -1 ? nIdx + 1 : 1;
  }

  // --- Dedicated Individual Player Scorecard Renderer ---
  function renderIndividualScorecard(stats, url) {
    if (!individualTrackerSection) return;

    const prize_tier = getPrizeTier(stats.points);
    const next_tier = getNextPrizeTier(stats.points);
    const milestone_class = getMilestoneClass(stats.milestone);
    const safe_url = sanitizeUrl(url);

    let next_tier_html = '';
    if (next_tier) {
      const needed_points = next_tier.pointsReq - stats.points;
      const progress_percent = Math.min(100, Math.floor((stats.points / next_tier.pointsReq) * 100));
      next_tier_html = `
        <div style="margin-top: 10px;">
          <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 5px;">
            <span>Menuju ${next_tier.stars} ${next_tier.name} (${next_tier.pointsReq} Poin)</span>
            <span style="font-weight: 600; color: var(--accent-cyan);">${needed_points} Poin lagi</span>
          </div>
          <div class="progress-container" style="height: 10px;">
            <div class="progress-bar" style="width: ${progress_percent}%; background: var(--accent-cyan);"></div>
          </div>
        </div>
      `;
    } else {
      next_tier_html = `<div style="font-size: 0.78rem; color: var(--accent-gold); margin-top: 8px;">Tingkat hadiah tertinggi (Legend) telah tercapai!</div>`;
    }

    const event_badges_count = stats.cutoffArcadeCount + stats.cutoffSkillsCount;
    const extended_badges_count = stats.extendedArcadeCount + stats.extendedSkillsCount;
    const extended_points = stats.extendedArcadeCount + Math.floor(stats.extendedSkillsCount / 2);

    let html = `
      <div class="player-tracker-hero">
        <div class="player-hero-profile">
          ${stats.avatarUrl ? `<img src="${stats.avatarUrl}" class="player-avatar" alt="Avatar">` : `<div class="player-avatar-placeholder">👤</div>`}
          <div>
            <div class="player-hero-name">${escapeHtml(stats.playerName)}</div>
            <div class="player-hero-meta">
              <span>Google Skills Public Profile</span>
              <span>•</span>
              <span style="color: var(--accent-green);">Terverifikasi Live</span>
            </div>
          </div>
        </div>
        <div class="player-hero-actions">
          ${safe_url ? `<a href="${safe_url}" target="_blank" rel="noopener noreferrer" class="btn" style="padding: 8px 16px; font-size: 0.8rem; background: rgba(0, 243, 255, 0.1); border: 1px solid var(--accent-cyan); color: var(--accent-cyan);">Buka Profil Skills</a>` : ''}
          <button type="button" class="btn" id="player-refresh-btn" style="padding: 8px 16px; font-size: 0.8rem;">Segarkan Data</button>
          <button type="button" class="btn btn-secondary" id="player-change-btn" style="padding: 8px 16px; font-size: 0.8rem;">Ganti Akun</button>
        </div>
      </div>

      <div class="player-cards-grid">
        <!-- Card 1: Event Milestone Status (Cutoff 29 Sep 2026) -->
        <div class="player-card event-card">
          <div class="player-card-header">
            <div>
              <div class="player-card-title" style="color: var(--accent-gold);">Milestone Event Fasilitator</div>
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">Batas Akhir: 29 September 2026</div>
            </div>
            <span class="pill-tag locked">Terkunci (Final)</span>
          </div>
          <div>
            <div class="milestone-badge ${milestone_class}" style="font-size: 0.9rem; padding: 6px 14px; display: inline-block;">
              ${escapeHtml(stats.milestone)}
            </div>
            <div style="font-size: 0.82rem; color: var(--text-primary); margin-top: 10px; font-family: var(--font-stats);">
              🎮 ${stats.cutoffArcadeCount} Arcade Games &nbsp;|&nbsp; 🏆 ${stats.cutoffSkillsCount} Skill Badges
            </div>
            <div style="font-size: 0.78rem; color: var(--accent-gold); margin-top: 4px;">
              Bonus Poin Milestone: <strong>+${stats.milestoneBonus} Poin</strong>
              ${stats.hasBonus ? ` &nbsp;|&nbsp; Bonus GEAR: <strong>+10 Poin</strong>` : ''}
            </div>
          </div>
          <p style="font-size: 0.75rem; color: var(--text-muted); margin: 0; line-height: 1.4;">
            Program fasilitator Indonesia telah berakhir pada 29 September 2026 (23:59 GMT+7). Milestone dan bonus poin ini bersifat resmi dan tidak berubah.
          </p>
        </div>

        <!-- Card 2: Extended Arcade Season (30 Sep - 31 Des 2026) -->
        <div class="player-card extended-card">
          <div class="player-card-header">
            <div>
              <div class="player-card-title" style="color: var(--accent-cyan);">Musim Lanjutan Arcade</div>
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">Periode: 30 Sep - 31 Des 2026</div>
            </div>
            <span class="pill-tag active-season">Aktif</span>
          </div>
          <div>
            <div class="player-stat-big" style="color: var(--accent-cyan);">
              +${extended_badges_count} <span style="font-size: 1rem; font-weight: 500; color: var(--text-secondary);">Lencana Baru</span>
            </div>
            <div style="font-size: 0.82rem; color: var(--text-primary); margin-top: 8px; font-family: var(--font-stats);">
              +🎮 ${stats.extendedArcadeCount} Arcade Games &nbsp;|&nbsp; +🏆 ${stats.extendedSkillsCount} Skill Badges
            </div>
            <div style="font-size: 0.78rem; color: var(--accent-cyan); margin-top: 4px;">
              Poin Tambahan Musim Lanjutan: <strong>+${extended_points} Poin</strong>
            </div>
          </div>
          <p style="font-size: 0.75rem; color: var(--text-muted); margin: 0; line-height: 1.4;">
            Lencana setelah 29 September tetap dihitung ke akumulasi poin musim global Arcade dan membantu Anda membuka Tier!
          </p>
        </div>

        <!-- Card 3: Total Points & Tier -->
        <div class="player-card points-card">
          <div class="player-card-header">
            <div>
              <div class="player-card-title" style="color: var(--accent-green);">Akumulasi Skor & Hadiah</div>
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">Total Poin Musim 2026</div>
            </div>
            <span class="pill-tag total">Akumulasi</span>
          </div>
          <div>
            <div class="player-stat-big" style="color: var(--accent-green);">
              ${stats.points} <span style="font-size: 1rem; font-weight: 500; color: var(--text-secondary);">Poin</span>
            </div>
            <div style="margin-top: 8px;">
              ${prize_tier ? `
                <span class="prize-tier-badge ${prize_tier.className}">
                  ${prize_tier.stars} ${prize_tier.name} (${prize_tier.pointsReq} Pts)
                </span>
              ` : `
                <span class="prize-tier-badge tier-none">Belum Masuk Tier (&lt; 50 Poin)</span>
              `}
            </div>
            ${next_tier_html}
          </div>
          <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">
            Total Terverifikasi: 🎮 ${stats.arcadeCount} Games | 🏆 ${stats.skillsCount} Badges
          </div>
        </div>
      </div>

      <!-- Badge Audit Section -->
      <div class="badge-audit-container">
        <h4 style="margin: 0 0 14px 0; font-family: var(--font-retro); font-size: 0.95rem; color: var(--text-primary); letter-spacing: 1px;">
          Audit Rincian Lencana (${stats.allBadgesAudit.length} Terdeteksi)
        </h4>
        <div class="badge-audit-tabs">
          <button type="button" class="audit-tab-btn active" data-tab="event">
            Lencana Event (s.d. 29 Sep) [${event_badges_count}]
          </button>
          <button type="button" class="audit-tab-btn" data-tab="extended">
            Musim Lanjutan (30 Sep - 31 Des) [${extended_badges_count}]
          </button>
          <button type="button" class="audit-tab-btn" data-tab="other">
            Lainnya / Non-Skill [${stats.allBadgesAudit.length - (event_badges_count + extended_badges_count)}]
          </button>
        </div>
        <div id="audit-badge-list" style="display: flex; flex-direction: column; gap: 8px; max-height: 400px; overflow-y: auto; padding-right: 4px;">
          <!-- Dynamically populated tab items -->
        </div>
      </div>
    `;

    individualTrackerSection.innerHTML = html;
    individualTrackerSection.style.display = 'flex';

    // Hook up action buttons inside rendered section
    const refreshBtn = document.getElementById('player-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        refreshBtn.disabled = true;
        refreshBtn.textContent = 'Menyegarkan...';
        try {
          const freshStats = await fetchAndParseProfile(url, stats.hasBonus);
          if (freshStats) {
            renderIndividualScorecard(freshStats, url);
          }
        } catch (err) {
          alert(`Gagal menyegarkan data: ${err.message}`);
          refreshBtn.disabled = false;
          refreshBtn.textContent = 'Segarkan Data';
        }
      });
    }

    const changeBtn = document.getElementById('player-change-btn');
    if (changeBtn) {
      changeBtn.addEventListener('click', () => {
        individualTrackerSection.style.display = 'none';
        playerLookupContainer.style.display = 'block';
        if (playerUrlInput) {
          playerUrlInput.focus();
        }
      });
    }

    // Hook up audit tabs
    const auditTabBtns = individualTrackerSection.querySelectorAll('.audit-tab-btn');
    const auditBadgeList = document.getElementById('audit-badge-list');

    function renderAuditTab(tabKey) {
      auditTabBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === tabKey));
      if (!auditBadgeList) return;
      auditBadgeList.innerHTML = '';

      let list = [];
      if (tabKey === 'event') {
        list = stats.allBadgesAudit.filter(b => b.dateCategory === 'event' && (b.baseType === 'arcade' || b.baseType === 'skill'));
      } else if (tabKey === 'extended') {
        list = stats.allBadgesAudit.filter(b => b.dateCategory === 'extended' && (b.baseType === 'arcade' || b.baseType === 'skill'));
      } else {
        list = stats.allBadgesAudit.filter(b => b.dateCategory === 'invalid' || b.baseType === 'ignored');
      }

      if (list.length === 0) {
        auditBadgeList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px; font-size: 0.85rem;">Tidak ada lencana pada kategori ini.</div>`;
        return;
      }

      list.forEach(item => {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 6px; font-size: 0.82rem;';

        let typeBadge = '';
        if (item.baseType === 'arcade') {
          typeBadge = `<span class="live-badge-type-toggle arcade" style="font-size: 0.72rem; padding: 2px 8px; cursor: default;">🎮 Arcade</span>`;
        } else if (item.baseType === 'skill') {
          typeBadge = `<span class="live-badge-type-toggle skill" style="font-size: 0.72rem; padding: 2px 8px; cursor: default;">🏆 Skill</span>`;
        } else {
          typeBadge = `<span class="live-badge-type-toggle ignored" style="font-size: 0.72rem; padding: 2px 8px; cursor: default;">Abaikan</span>`;
        }

        row.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <div style="font-weight: 500; color: var(--text-primary);">${escapeHtml(item.title)}</div>
            <div style="font-size: 0.74rem; color: var(--text-muted);">${escapeHtml(item.earnedText || 'Tanpa Tanggal')}</div>
          </div>
          <div>${typeBadge}</div>
        `;
        auditBadgeList.appendChild(row);
      });
    }

    auditTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        renderAuditTab(btn.getAttribute('data-tab'));
      });
    });

    renderAuditTab('event');
  }

  // Wires Event Listeners
  if (syncLiveBtn) {
    syncLiveBtn.addEventListener('click', syncAllProfiles);
  }
  if (modalVerifyLiveBtn) {
    modalVerifyLiveBtn.addEventListener('click', syncSingleProfile);
  }
  if (modalApplyLiveBtn) {
    modalApplyLiveBtn.addEventListener('click', applySingleProfileLiveStats);
  }

});
