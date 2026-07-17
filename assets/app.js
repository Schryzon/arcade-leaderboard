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

  // Cache DOM Elements
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('csv-file-input');
  const browseBtn = document.getElementById('browse-btn');
  const uploadContainer = document.getElementById('upload-container');
  const leaderboardSection = document.getElementById('leaderboard-section');
  const resetDataBtn = document.getElementById('reset-data-btn');

  // Stats Elements
  const statTotalParticipants = document.getElementById('stat-total-participants');
  const statUltimateCount = document.getElementById('stat-ultimate-count');
  const statBonusCount = document.getElementById('stat-bonus-count');
  const statAveragePoints = document.getElementById('stat-average-points');

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
  if (savedData) {
    processCSVData(savedData);
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
      localStorage.setItem('arcade_leaderboard_csv_raw', text);
      processCSVData(text);
    };
    reader.readAsText(file);
  }

  resetDataBtn.addEventListener('click', () => {
    if (confirm('Apakah Anda yakin ingin menghapus data leaderboard?')) {
      localStorage.removeItem('arcade_leaderboard_csv_raw');
      parsedParticipants = [];
      filteredParticipants = [];
      uploadContainer.style.display = 'block';
      leaderboardSection.style.display = 'none';
      fileInput.value = '';
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

  function processCSVData(csvText) {
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

    // Parse records starting from row index 1
    for (let i = 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      // Skip empty lines
      if (row.length === 0 || (row.length === 1 && row[0] === '')) continue;
      
      const name = (row[nameIdx] || '').trim();
      if (!name) continue;

      const email = (row[emailIdx] || '').trim();
      const skillsCount = parseInt(row[skillsCountIdx]) || 0;
      const skillsList = parseCommaList(row[skillsListIdx]);
      const arcadeCount = parseInt(row[arcadeCountIdx]) || 0;
      const arcadeList = parseCommaList(row[arcadeListIdx]);
      
      // Calculate Points
      const bonusStr = (row[bonusMilestoneIdx] || '').trim().toLowerCase();
      const hasBonus = bonusStr === 'yes' || bonusStr === 'ya' || bonusStr === '10';
      const calculatedPoints = arcadeCount * 1 + Math.floor(skillsCount / 2) + (hasBonus ? 10 : 0);

      // Milestone calculations
      const milestoneCSV = (row[milestoneIdx] || 'None').trim();
      const calculatedMilestone = getCalculatedMilestone(arcadeCount, skillsCount);

      const verifyStatus = (row[verifyStatusIdx] || 'Not yet submitted').trim();
      const gearBadge = (row[gearDigitalBadgeIdx] || '').trim();
      
      const skillsUrl = (row[skillsProfileIdx] || '').trim();
      const devUrl = (row[devProfileIdx] || '').trim();

      parsedParticipants.push({
        name,
        email: maskEmail(email),
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
        devUrl
      });
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
    
    const ultimateCount = parsedParticipants.filter(p => p.milestone === 'Ultimate Milestone').length;
    statUltimateCount.textContent = ultimateCount;

    const bonusCount = parsedParticipants.filter(p => p.hasBonus).length;
    statBonusCount.textContent = bonusCount;

    if (parsedParticipants.length > 0) {
      const totalPoints = parsedParticipants.reduce((sum, p) => sum + p.points, 0);
      const avg = totalPoints / parsedParticipants.length;
      statAveragePoints.textContent = avg.toFixed(1);
    } else {
      statAveragePoints.textContent = '0';
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

      // --- Desktop Row HTML ---
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.innerHTML = `
        <td style="text-align: center;"><span class="rank-badge ${rankClass}">${rank}</span></td>
        <td class="name-cell">${p.name}</td>
        <td style="text-align: center;" class="points-badge">${p.points}</td>
        <td><span class="milestone-badge ${milestoneClass}">${p.milestone}</span></td>
        <td style="text-align: center;"><span class="badge-count arcade">🎮 ${p.arcadeCount}</span></td>
        <td style="text-align: center;"><span class="badge-count skill">🏆 ${p.skillsCount}</span></td>
        <td>${p.hasBonus ? '<span class="gear-badge">⚙️ GEAR BONUS</span>' : '<span style="color: var(--text-muted); font-size:0.75rem;">None</span>'}</td>
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
            <span class="mobile-name">${p.name}</span>
          </div>
          <span class="mobile-points">${p.points} Pts</span>
        </div>
        <div class="mobile-card-body">
          <div class="mobile-stat">
            <span class="mobile-label">Milestone</span>
            <span class="milestone-badge ${milestoneClass}" style="transform: scale(0.9); transform-origin: left; width: fit-content;">${p.milestone}</span>
          </div>
          <div class="mobile-stat">
            <span class="mobile-label">GEAR Bonus</span>
            <span>${p.hasBonus ? '<span class="gear-badge">⚙️ GEAR BONUS</span>' : 'None'}</span>
          </div>
          <div class="mobile-stat" style="margin-top: 5px;">
            <span class="mobile-label">Arcade Games</span>
            <span class="badge-count arcade" style="width: fit-content;">🎮 ${p.arcadeCount} Games</span>
          </div>
          <div class="mobile-stat" style="margin-top: 5px;">
            <span class="mobile-label">Skill Badges</span>
            <span class="badge-count skill" style="width: fit-content;">🏆 ${p.skillsCount} Badges</span>
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
          <div class="badge-list-title">Arcade Games (${p.arcadeCount})</div>
          <div class="badge-tag-list">
            ${p.arcadeList.length > 0 
              ? p.arcadeList.map(b => `<span class="mini-badge-tag arcade-tag">${b}</span>`).join('')
              : '<span style="color: var(--text-muted); font-size: 0.75rem;">Belum menyelesaikan arcade game</span>'
            }
          </div>
          <div class="badge-list-title">Skill Badges (${p.skillsCount})</div>
          <div class="badge-tag-list">
            ${p.skillsList.length > 0 
              ? p.skillsList.map(b => `<span class="mini-badge-tag skill-tag">${b}</span>`).join('')
              : '<span style="color: var(--text-muted); font-size: 0.75rem;">Belum menyelesaikan skill badge</span>'
            }
          </div>
          <div class="badge-list-title">Verifikasi AI Agent</div>
          <p style="font-size: 0.75rem;">Status: ${p.verifyStatus}</p>
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
    modalName.textContent = p.name;
    modalPoints.textContent = `Total Poin: ${p.points} Poin (Peringkat #${rank})`;

    // Milestone badges
    modalMilestoneBadge.textContent = p.milestone;
    modalMilestoneBadge.className = `milestone-badge ${getMilestoneClass(p.milestone)}`;

    if (p.hasBonus) {
      modalGearBadge.style.display = 'inline-flex';
    } else {
      modalGearBadge.style.display = 'none';
    }

    // Dynamic Milestone Progress
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
      modalArcadeProgressText.textContent = `${p.arcadeCount} / ${targetGames} Games`;

      const skillPerc = Math.min(100, (p.skillsCount / targetSkills) * 100);
      modalSkillProgressBar.style.width = `${skillPerc}%`;
      modalSkillProgressText.textContent = `${p.skillsCount} / ${targetSkills} Badges`;

      const needGames = Math.max(0, targetGames - p.arcadeCount);
      const needSkills = Math.max(0, targetSkills - p.skillsCount);
      modalNextMilestoneHint.innerHTML = `Butuh tambahan <strong style="color: var(--accent-cyan); font-family: var(--font-stats);">${needGames} games</strong> dan <strong style="color: var(--accent-pink); font-family: var(--font-stats);">${needSkills} skill badges</strong> untuk mencapai <strong>${nextMilestone}</strong>.`;
    } else {
      // Max milestone reached
      modalArcadeProgressBar.style.width = `100%`;
      modalArcadeProgressText.textContent = `${p.arcadeCount} Games`;
      modalSkillProgressBar.style.width = `100%`;
      modalSkillProgressText.textContent = `${p.skillsCount} Badges`;
      modalNextMilestoneHint.textContent = `🎉 Selamat! Anda telah meraih Ultimate Milestone (Pencapaian Tertinggi).`;
    }

    // Render badges list
    modalArcadeCount.textContent = p.arcadeCount;
    modalArcadeList.innerHTML = p.arcadeList.length > 0 
      ? p.arcadeList.map(b => `<span class="mini-badge-tag arcade-tag">${b}</span>`).join('')
      : '<span style="color: var(--text-muted); font-size: 0.85rem;">Belum ada arcade game yang selesai.</span>';

    modalSkillCount.textContent = p.skillsCount;
    modalSkillList.innerHTML = p.skillsList.length > 0 
      ? p.skillsList.map(b => `<span class="mini-badge-tag skill-tag">${b}</span>`).join('')
      : '<span style="color: var(--text-muted); font-size: 0.85rem;">Belum ada lencana keahlian yang selesai.</span>';

    // Verification
    modalVerificationStatus.innerHTML = `Status: <strong style="color: ${p.verifyStatus === 'Verified' ? 'var(--accent-green)' : 'var(--text-secondary)'}">${p.verifyStatus}</strong>`;

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
  function showToast(message) {
    statusToastText.textContent = message;
    statusToast.style.display = 'flex';
  }

  function hideToast() {
    statusToast.style.display = 'none';
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
          <th style="width: 70px; text-align: center;">Rank</th>
          <th>Nama Peserta</th>
          <th style="width: 100px; text-align: center;">Poin</th>
          <th>Milestone</th>
          <th style="width: 110px; text-align: center;">Arcade Games</th>
          <th style="width: 110px; text-align: center;">Skill Badges</th>
          <th>GEAR Bonus</th>
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
          
          return `
            <tr>
              <td style="text-align: center;"><span class="rank-badge ${rankClass}" style="transform: scale(0.85);">${rank}</span></td>
              <td class="name-cell" style="font-size: 0.9rem;">${p.name}</td>
              <td style="text-align: center;" class="points-badge" style="font-size: 0.95rem;">${p.points}</td>
              <td><span class="milestone-badge ${milestoneClass}" style="transform: scale(0.8); transform-origin: left;">${p.milestone}</span></td>
              <td style="text-align: center;"><span class="badge-count arcade" style="font-size: 0.8rem;">🎮 ${p.arcadeCount}</span></td>
              <td style="text-align: center;"><span class="badge-count skill" style="font-size: 0.8rem;">🏆 ${p.skillsCount}</span></td>
              <td>${p.hasBonus ? '<span class="gear-badge" style="transform: scale(0.8); transform-origin: left;">⚙️ GEAR</span>' : '<span style="color: var(--text-muted); font-size:0.75rem;">-</span>'}</td>
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
      <div>Laporan Leaderboard Google Cloud Arcade Facilitator • ${dateStr}</div>
      <div class="export-slide-footer-logo">Google Cloud Arcade</div>
    `;
    slide.appendChild(footer);

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
        <div class="stat-label">Ultimate Milestone</div>
        <div class="stat-value" style="font-size: 1.5rem;">${parsedParticipants.filter(p => p.milestone === 'Ultimate Milestone').length}</div>
      </div>
      <div class="stat-card pink">
        <div class="stat-label">GEAR Bonus</div>
        <div class="stat-value" style="font-size: 1.5rem;">${parsedParticipants.filter(p => p.hasBonus).length}</div>
      </div>
      <div class="stat-card green">
        <div class="stat-label">Rata-rata Poin</div>
        <div class="stat-value" style="font-size: 1.5rem;">${statAveragePoints.textContent}</div>
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
          <th style="width: 70px; text-align: center; border-bottom: 2px solid rgba(0,242,254,0.2); padding: 12px 15px;">Rank</th>
          <th style="border-bottom: 2px solid rgba(0,242,254,0.2); padding: 12px 15px;">Nama Peserta</th>
          <th style="width: 90px; text-align: center; border-bottom: 2px solid rgba(0,242,254,0.2); padding: 12px 15px;">Poin</th>
          <th style="border-bottom: 2px solid rgba(0,242,254,0.2); padding: 12px 15px;">Milestone</th>
          <th style="width: 120px; text-align: center; border-bottom: 2px solid rgba(0,242,254,0.2); padding: 12px 15px;">Games</th>
          <th style="width: 120px; text-align: center; border-bottom: 2px solid rgba(0,242,254,0.2); padding: 12px 15px;">Skills</th>
          <th style="border-bottom: 2px solid rgba(0,242,254,0.2); padding: 12px 15px;">GEAR Bonus</th>
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
          
          return `
            <tr>
              <td style="text-align: center; border-bottom: 1px solid rgba(255,255,255,0.05); padding: 12px 15px;"><span class="rank-badge ${rankClass}" style="transform: scale(0.85);">${rank}</span></td>
              <td class="name-cell" style="border-bottom: 1px solid rgba(255,255,255,0.05); padding: 12px 15px; font-size: 0.95rem;">${p.name}</td>
              <td style="text-align: center; border-bottom: 1px solid rgba(255,255,255,0.05); padding: 12px 15px;" class="points-badge">${p.points}</td>
              <td style="border-bottom: 1px solid rgba(255,255,255,0.05); padding: 12px 15px;"><span class="milestone-badge ${milestoneClass}" style="transform: scale(0.85); transform-origin: left;">${p.milestone}</span></td>
              <td style="text-align: center; border-bottom: 1px solid rgba(255,255,255,0.05); padding: 12px 15px;"><span class="badge-count arcade">🎮 ${p.arcadeCount}</span></td>
              <td style="text-align: center; border-bottom: 1px solid rgba(255,255,255,0.05); padding: 12px 15px;"><span class="badge-count skill">🏆 ${p.skillsCount}</span></td>
              <td style="border-bottom: 1px solid rgba(255,255,255,0.05); padding: 12px 15px;">${p.hasBonus ? '<span class="gear-badge">⚙️ GEAR BONUS</span>' : '<span style="color: var(--text-muted); font-size: 0.75rem;">-</span>'}</td>
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
      <div>Laporan Leaderboard Lengkap • ${dateStr}</div>
      <div style="font-family: var(--font-retro); color: var(--accent-cyan); font-size: 0.7rem;">Google Cloud Arcade</div>
    `;
    container.appendChild(footer);

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
        link.download = 'Arcade_Leaderboard_Full.png';
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

      pdf.save('Arcade_Leaderboard.pdf');
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
      link.download = 'Arcade_Leaderboard_Slides.zip';
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

});
