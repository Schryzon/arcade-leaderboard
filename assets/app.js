/**
 * THE ARCADE LEADERBOARD - APPLICATION LOGIC
 * Client-side CSV parsing, score calculations, filtering, sorting, and exports.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Generate background stars
  generateStarfield();

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

  // Validate if a badge's earned date string falls within the valid 2026 program window
  // Valid range: 13 July 2026 (10 AM) to 14 September 2026 (23:59) GMT+7
  function isBadgeDateValid(earnedText) {
    if (!earnedText) return false;
    
    // Clean up spaces and word "Earned"
    let clean = earnedText.replace(/Earned/gi, '').replace(/\s+/g, ' ').trim();
    if (!clean) return false;
    
    // Normalize EDT/EST timezone abbreviation to numeric offsets for reliable cross-browser parsing
    let normalized = clean;
    if (normalized.endsWith('EDT')) {
      normalized = normalized.slice(0, -3).trim() + ' GMT-0400';
    } else if (normalized.endsWith('EST')) {
      normalized = normalized.slice(0, -3).trim() + ' GMT-0500';
    }
    
    const timestamp = Date.parse(normalized);
    if (isNaN(timestamp)) {
      console.warn('Failed to parse badge date:', earnedText, 'Normalized as:', normalized);
      return false;
    }
    
    const rangeStart = Date.parse('2026-07-13T10:00:00+07:00'); // 1783911600000
    const rangeEnd = Date.parse('2026-09-14T23:59:59+07:00');   // 1789405199000
    
    return timestamp >= rangeStart && timestamp <= rangeEnd;
  }

  // Cache DOM Elements
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('csv-file-input');
  const browseBtn = document.getElementById('browse-btn');
  const uploadContainer = document.getElementById('upload-container');
  const leaderboardSection = document.getElementById('leaderboard-section');
  const resetDataBtn = document.getElementById('reset-data-btn');

  // Stats Elements
  const statTotalParticipants = document.getElementById('stat-total-participants');
  const statTotalGames = document.getElementById('stat-total-games');
  const statBonusCount = document.getElementById('stat-bonus-count');
  const statTotalSkills = document.getElementById('stat-total-skills');

  // Filters Elements
  const searchInput = document.getElementById('search-input');
  const milestoneFilter = document.getElementById('milestone-filter');
  const bonusFilter = document.getElementById('bonus-filter');
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
  const modalGearBadge = document.getElementById('modal-gear-badge');
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
    reader.onload = function(e) {
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
      localStorage.setItem('arcade_leaderboard_csv_raw', text);
      localStorage.setItem('arcade_leaderboard_csv_timestamp', timestamp);
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

  // --- 4. Filtering, Sorting, and Rendering ---
  searchInput.addEventListener('input', updateLeaderboard);
  milestoneFilter.addEventListener('change', updateLeaderboard);
  bonusFilter.addEventListener('change', updateLeaderboard);
  sortFilter.addEventListener('change', updateLeaderboard);

  function updateLeaderboard() {
    const searchVal = searchInput.value.toLowerCase().trim();
    const milestoneVal = milestoneFilter.value;
    const bonusVal = bonusFilter.value;
    const sortVal = sortFilter.value;

    // Filter
    filteredParticipants = parsedParticipants.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(searchVal);
      
      let matchMilestone = true;
      if (milestoneVal !== 'all') {
        const key = p.milestone.toLowerCase().replace(' ', '-');
        matchMilestone = key === milestoneVal;
      }

      let matchBonus = true;
      if (bonusVal !== 'all') {
        matchBonus = (bonusVal === 'yes' && p.hasBonus) || (bonusVal === 'no' && !p.hasBonus);
      }

      return matchSearch && matchMilestone && matchBonus;
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
    
    const totalGames = parsedParticipants.reduce((sum, p) => sum + p.arcadeCount, 0);
    const totalSkills = parsedParticipants.reduce((sum, p) => sum + p.skillsCount, 0);
    
    statTotalGames.textContent = totalGames;
    statTotalSkills.textContent = totalSkills;

    const bonusCount = parsedParticipants.filter(p => p.hasBonus).length;
    statBonusCount.textContent = bonusCount;

    // Render program-wide milestone tracker
    renderMilestoneTracker(totalGames, totalSkills);
  }

  function renderMilestoneTracker(totalGames, totalSkills) {
    const totalActual = totalGames + totalSkills;
    const targets = [500, 800, 1150, 1500];
    
    for (let i = 1; i <= 4; i++) {
      const target = targets[i - 1];
      const percent = Math.min(100, Math.floor((totalActual / target) * 100));
      
      const pb = document.getElementById(`milestone-progress-bar-${i}`);
      const percentText = document.getElementById(`milestone-progress-percent-${i}`);
      const ratioText = document.getElementById(`milestone-progress-ratio-${i}`);
      
      if (pb) pb.style.width = `${percent}%`;
      if (percentText) percentText.textContent = `${percent}% Completed`;
      if (ratioText) ratioText.textContent = `${totalActual}/${target}`;
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
      if (p.skillsUrl) {
        profileButtons += `<a href="${p.skillsUrl}" target="_blank" class="profile-link" title="Google Skills Profile">G</a>`;
      }
      if (p.devUrl) {
        profileButtons += `<a href="${p.devUrl}" target="_blank" class="profile-link dev" title="Google Developer Profile">D</a>`;
      }

      // GEAR Bonus and Badge Status Logic
      let gearBonusHtml = '<span style="color: var(--text-muted); font-size:0.75rem;">-</span>';
      if (p.hasBonus) {
        gearBonusHtml = '<span class="gear-badge">⚙️ Bonus (+10)</span>';
      }

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
        <td>${gearBonusHtml}</td>
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
            <span class="mobile-label">Bonus GEAR</span>
            <span>${gearBonusHtml}</span>
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

    if (p.hasBonus) {
      modalGearBadge.textContent = '⚙️ GEAR Ready (+10 Poin)';
      modalGearBadge.style.display = 'inline-flex';
      modalGearBadge.style.background = 'linear-gradient(135deg, rgba(57, 255, 20, 0.2) 0%, rgba(0, 242, 254, 0.2) 100%)';
      modalGearBadge.style.borderColor = 'rgba(57, 255, 20, 0.3)';
      modalGearBadge.style.color = 'var(--text-primary)';
    } else {
      modalGearBadge.style.display = 'none';
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
    if (p.skillsUrl) {
      modalLinksContainer.innerHTML += `
        <a href="${p.skillsUrl}" target="_blank" class="profile-link" style="width: auto; height: auto; padding: 6px 12px; border-radius: 4px; font-size: 0.8rem; font-family: var(--font-stats);" title="Profil Skills">
          Google Skills Profile ↗
        </a>`;
    }
    if (p.devUrl) {
      modalLinksContainer.innerHTML += `
        <a href="${p.devUrl}" target="_blank" class="profile-link dev" style="width: auto; height: auto; padding: 6px 12px; border-radius: 4px; font-size: 0.8rem; font-family: var(--font-stats);" title="Profil Developer">
          Google Developer Profile ↗
        </a>`;
    }
    if (!p.skillsUrl && !p.devUrl) {
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
          <th>GEAR</th>
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
          
          let gearBonusHtml = '<span style="color: var(--text-muted); font-size:0.75rem;">-</span>';
          if (p.hasBonus) {
            gearBonusHtml = '<span class="gear-badge" style="transform: scale(0.8); transform-origin: left;">⚙️ Bonus (+10)</span>';
          }
          
          return `
            <tr>
              <td style="text-align: center;"><span class="rank-badge ${rankClass}" style="transform: scale(0.85);">${rank}</span></td>
              <td class="name-cell" style="font-size: 0.9rem;">${escapeHtml(p.name)}</td>
              <td style="text-align: center;" class="points-badge" style="font-size: 0.95rem;">${p.points}</td>
              <td><span class="milestone-badge ${milestoneClass}" style="transform: scale(0.8); transform-origin: left;">${escapeHtml(p.milestone)}</span></td>
              <td style="text-align: center;"><span class="badge-count arcade" style="font-size: 0.8rem;">🎮 ${p.arcadeCount}</span></td>
              <td style="text-align: center;"><span class="badge-count skill" style="font-size: 0.8rem;">🏆 ${p.skillsCount}</span></td>
              <td>${gearBonusHtml}</td>
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
      <div class="stat-card pink">
        <div class="stat-label">GEAR Bonus</div>
        <div class="stat-value" style="font-size: 1.5rem;">${parsedParticipants.filter(p => p.hasBonus).length}</div>
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
          <th style="border-bottom: 2px solid rgba(0,242,254,0.2); padding: 12px 15px;">GEAR</th>
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
          
          let gearBonusHtml = '<span style="color: var(--text-muted); font-size: 0.75rem;">-</span>';
          if (p.hasBonus) {
            gearBonusHtml = '<span class="gear-badge">⚙️ Bonus (+10)</span>';
          }
          
          return `
            <tr>
              <td style="text-align: center; border-bottom: 1px solid rgba(255,255,255,0.05); padding: 12px 15px;"><span class="rank-badge ${rankClass}" style="transform: scale(0.85);">${rank}</span></td>
              <td class="name-cell" style="border-bottom: 1px solid rgba(255,255,255,0.05); padding: 12px 15px; font-size: 0.95rem;">${escapeHtml(p.name)}</td>
              <td style="text-align: center; border-bottom: 1px solid rgba(255,255,255,0.05); padding: 12px 15px;" class="points-badge">${p.points}</td>
              <td style="border-bottom: 1px solid rgba(255,255,255,0.05); padding: 12px 15px;"><span class="milestone-badge ${milestoneClass}" style="transform: scale(0.85); transform-origin: left;">${escapeHtml(p.milestone)}</span></td>
              <td style="text-align: center; border-bottom: 1px solid rgba(255,255,255,0.05); padding: 12px 15px;"><span class="badge-count arcade">🎮 ${p.arcadeCount}</span></td>
              <td style="text-align: center; border-bottom: 1px solid rgba(255,255,255,0.05); padding: 12px 15px;"><span class="badge-count skill">🏆 ${p.skillsCount}</span></td>
              <td style="border-bottom: 1px solid rgba(255,255,255,0.05); padding: 12px 15px;">${gearBonusHtml}</td>
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
    const proxyUrl = 'https://corsproxy.io/?url=' + encodeURIComponent(targetUrl);
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const htmlText = await res.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');

    const badgeElements = doc.querySelectorAll('.profile-badge');
    const arcadeList = [];
    const skillsList = [];

    badgeElements.forEach(badgeEl => {
      const titleEl = badgeEl.querySelector('.ql-title-medium');
      const title = titleEl ? titleEl.textContent.trim() : '';
      if (!title) return;

      const earnedEl = badgeEl.querySelector('.ql-body-medium.l-mbs');
      const earnedText = earnedEl ? earnedEl.textContent.trim() : '';
      if (!isBadgeDateValid(earnedText)) return;

      const dialogId = badgeEl.querySelector('ql-button') ? badgeEl.querySelector('ql-button').getAttribute('modal') : '';
      const dialog = dialogId ? doc.getElementById(dialogId) : null;
      
      const learnMoreBtn = dialog ? dialog.querySelector('ql-button[slot="action"]') : null;
      const href = learnMoreBtn ? (learnMoreBtn.getAttribute('href') || '') : '';
      const description = dialog ? (dialog.querySelector('p') ? dialog.querySelector('p').textContent.toLowerCase() : '') : '';

      let type = 'ignored';
      if (customClassifications[title]) {
        type = customClassifications[title];
      } else {
        const isArcade = href.includes('/games/');
        const isSkill = description.includes('skill badge') || 
                        description.includes('badge keahlian') || 
                        description.includes('lencana keahlian');
        if (isArcade) type = 'arcade';
        else if (isSkill) type = 'skill';
      }

      if (type === 'arcade') arcadeList.push(title);
      else if (type === 'skill') skillsList.push(title);
    });

    const arcadeCount = arcadeList.length;
    const skillsCount = skillsList.length;
    const milestone = getCalculatedMilestone(arcadeCount, skillsCount);
    const milestoneBonus = getMilestoneBonus(milestone);
    const points = arcadeCount * 1 + Math.floor(skillsCount / 2) + milestoneBonus + (hasBonus ? 10 : 0);

    return {
      arcadeCount,
      skillsCount,
      arcadeList,
      skillsList,
      points,
      milestone
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
    const total_participants = participantsWithUrls.length;
    const sync_concurrency = 5;

    for (let i = 0; i < total_participants; i += sync_concurrency) {
      const batch = participantsWithUrls.slice(i, i + sync_concurrency);
      await Promise.all(batch.map(async (p) => {
        try {
          const stats = await fetchAndParseProfile(p.skillsUrl, p.hasBonus);
          if (stats) {
            profileCache[p.skillsUrl] = {
              arcadeCount: stats.arcadeCount,
              skillsCount: stats.skillsCount,
              points: stats.points,
              milestone: stats.milestone,
              arcadeList: stats.arcadeList,
              skillsList: stats.skillsList,
              lastSynced: new Date().getTime()
            };
            
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

    localStorage.setItem('arcade_profile_cache', JSON.stringify(profileCache));
    updateLeaderboard();
    
    if (sync_fail_count === total_participants) {
      showToast('Sinkronisasi gagal untuk semua profil! Periksa CSP / koneksi.', false, 3500, 'error');
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
      const proxyUrl = 'https://corsproxy.io/?url=' + encodeURIComponent(targetUrl);
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
      if (!isBadgeDateValid(badge.earnedText)) {
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
      return { title: badge.title, type, earnedText: badge.earnedText };
    });

    const arcadeList = processedBadges.filter(b => b.type === 'arcade').map(b => b.title);
    const skillsList = processedBadges.filter(b => b.type === 'skill').map(b => b.title);
    const liveMilestone = getCalculatedMilestone(arcadeList.length, skillsList.length);
    const liveMilestoneBonus = getMilestoneBonus(liveMilestone);
    const livePoints = arcadeList.length * 1 + Math.floor(skillsList.length / 2) + liveMilestoneBonus + (activeModalParticipant.hasBonus ? 10 : 0);

    tempLiveStats = {
      arcadeCount: arcadeList.length,
      skillsCount: skillsList.length,
      arcadeList,
      skillsList,
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
          Live: 🎮 ${tempLiveStats.arcadeCount} | 🏆 ${tempLiveStats.skillsCount} | Poin: ${tempLiveStats.points}
        </div>
        <div style="border-left: 2px solid var(--text-muted); padding-left: 5px; color: var(--text-muted);">
          CSV: 🎮 ${activeModalParticipant.csvArcadeCount} | 🏆 ${activeModalParticipant.csvSkillsCount} | Poin: ${activeModalParticipant.csvPoints}
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

      row.innerHTML = `
        <span class="live-badge-title">${escapeHtml(b.title)}</span>
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
          localStorage.setItem('arcade_custom_badge_classifications', JSON.stringify(customClassifications));
          
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
      arcadeCount: tempLiveStats.arcadeCount,
      skillsCount: tempLiveStats.skillsCount,
      points: tempLiveStats.points,
      milestone: tempLiveStats.milestone,
      arcadeList: tempLiveStats.arcadeList,
      skillsList: tempLiveStats.skillsList,
      lastSynced: activeModalParticipant.lastSynced
    };
    localStorage.setItem('arcade_profile_cache', JSON.stringify(profileCache));

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
    return filteredParticipants.findIndex(p => p.skillsUrl === activeModalParticipant.skillsUrl) + 1;
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
