/* ============================================================
   PS Trophy Viewer — app.js (Version Mur des Platines + Graphique)
   ============================================================ */

(() => {
  "use strict";

  const SUPABASE_URL = "https://ahacsjnxwswymhmqmizd.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoYWNzam54d3N3eW1obXFtaXpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4NzE5NjMsImV4cCI6MjEwODQ0Nzk2M30.clKOjewbJN1NnkxokpElE0KwueoX0-R_1tNPU9OMf_I";
  const supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
  );

  const state = {
    games: [],
    view: "dashboard",
    currentId: null,
    search: "",
    user: null,
    filter: "all",
    sort: "default",
    soundEnabled: true,
    chartInstance: null, // Pour garder une référence au graphique
  };

  const GRADE_ORDER = ["platinum", "gold", "silver", "bronze"];
  const GRADE_LABEL = {
    platinum: "Platine",
    gold: "Or",
    silver: "Argent",
    bronze: "Bronze",
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );

  // ============================================================
  // SYSTÈME DE NIVEAU PSN (Inchangé)
  // ============================================================
  const PSN_POINTS = { bronze: 15, silver: 30, gold: 90, platinum: 300 };
  const PSN_LEVEL_TIERS = [
    { minLevel: 1, pointsPerLevel: 60 },
    { minLevel: 100, pointsPerLevel: 90 },
    { minLevel: 200, pointsPerLevel: 450 },
    { minLevel: 300, pointsPerLevel: 900 },
    { minLevel: 400, pointsPerLevel: 1350 },
    { minLevel: 500, pointsPerLevel: 1800 },
    { minLevel: 600, pointsPerLevel: 2250 },
    { minLevel: 700, pointsPerLevel: 2700 },
    { minLevel: 800, pointsPerLevel: 3150 },
    { minLevel: 900, pointsPerLevel: 3600 },
  ];
  const PSN_MAX_LEVEL = 999;
  const PSN_TITLES = [
    { level: 1, title: "Novice" },
    { level: 3, title: "Apprenti" },
    { level: 10, title: "Chasseur" },
    { level: 25, title: "Traqueur" },
    { level: 50, title: "Élite" },
    { level: 100, title: "Maître" },
    { level: 200, title: "Grand Maître" },
    { level: 400, title: "Légende" },
    { level: 700, title: "Mythe" },
    { level: 999, title: "Légende Absolue" },
  ];

  function getHunterLevel() {
    let totalPoints = 0;
    state.games.forEach((g) => {
      g.trophies.forEach((t) => {
        if (t.earned && PSN_POINTS[t.grade]) totalPoints += PSN_POINTS[t.grade];
      });
    });

    let level = 1;
    let remainingPoints = totalPoints;
    let pointsNeededForNextLevel = PSN_LEVEL_TIERS[0].pointsPerLevel;

    while (level < PSN_MAX_LEVEL) {
      let currentTier = PSN_LEVEL_TIERS[0];
      for (const tier of PSN_LEVEL_TIERS) {
        if (level >= tier.minLevel) currentTier = tier;
      }
      pointsNeededForNextLevel = currentTier.pointsPerLevel;
      if (remainingPoints >= pointsNeededForNextLevel) {
        remainingPoints -= pointsNeededForNextLevel;
        level++;
      } else break;
    }

    const progressPct =
      pointsNeededForNextLevel > 0
        ? (remainingPoints / pointsNeededForNextLevel) * 100
        : 0;
    let levelRank = "bronze";
    if (level >= 300) levelRank = "silver";
    if (level >= 600) levelRank = "gold";
    if (level >= 999) levelRank = "platinum";

    let currentTitle = PSN_TITLES[0].title;
    for (const t of PSN_TITLES) {
      if (level >= t.level) currentTitle = t.title;
    }

    return {
      totalPoints,
      level,
      currentLevelPoints: remainingPoints,
      pointsPerLevel: pointsNeededForNextLevel,
      progressPct,
      title: currentTitle,
      levelRank,
    };
  }

  // --- SONS PS5 ---
  const sounds = {
    trophy: new Audio("sounds/PS5NewTrophy.ogg"),
    platinum: new Audio("sounds/PS5NewPlatinumTrophy.ogg"),
    select: new Audio("sounds/PS5Select.ogg"),
  };
  sounds.trophy.volume = 0.3;
  sounds.platinum.volume = 0.3;
  sounds.select.volume = 0.2;

  function playSound(type) {
    if (!state.soundEnabled) return;
    const sound = sounds[type];
    if (sound) {
      sound.currentTime = 0;
      sound.play().catch(() => {});
    }
  }

  // --- EFFET TILT 3D ---
  function applyTilt3D() {
    $$(".game-card").forEach((card) => {
      card.addEventListener("mousemove", (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const rotateX = ((y - rect.height / 2) / (rect.height / 2)) * -10;
        const rotateY = ((x - rect.width / 2) / (rect.width / 2)) * 10;
        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
      });
      card.addEventListener("mouseleave", () => {
        card.style.transform =
          "perspective(1000px) rotateX(0) rotateY(0) scale3d(1, 1, 1)";
      });
    });
  }

  // --- ANIMATION DES NOMBRES ---
  function animateValue(obj, start, end, duration) {
    if (!obj) return;
    let startTimestamp = null;
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      obj.textContent = Math.floor(progress * (end - start) + start);
      if (progress < 1) window.requestAnimationFrame(step);
      else obj.textContent = end;
    };
    window.requestAnimationFrame(step);
  }

  // --- SUPABASE ---
  async function initSupabase() {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session && session.user) state.user = session.user;
      else {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
        state.user = data.user;
      }
    } catch (e) {
      console.error("Auth Err:", e);
    }
  }

  async function loadProgressFromSupabase() {
    if (!state.user) return;
    try {
      const { data, error } = await supabase
        .from("trophy_progress")
        .select("game_id, trophy_id, earned, earned_at")
        .eq("user_id", state.user.id);
      if (error) throw error;
      if (data) {
        const progressMap = {};
        data.forEach((p) => {
          if (!progressMap[p.game_id]) progressMap[p.game_id] = {};
          if (p.earned)
            progressMap[p.game_id][p.trophy_id] = {
              earned: p.earned,
              earned_at: p.earned_at,
            };
        });
        state.games.forEach((g) => {
          if (progressMap[g.npcommid]) {
            g.trophies.forEach((t) => {
              if (progressMap[g.npcommid][t.id]) {
                t.earned = progressMap[g.npcommid][t.id].earned;
                t.earnedTime = progressMap[g.npcommid][t.id].earned_at;
              }
            });
          }
        });
      }
    } catch (e) {
      console.error("Load Err:", e);
    }
  }

  async function saveProgressToSupabase(gameId, trophyId, earned) {
    if (!state.user) return;
    try {
      const earnedAt = earned ? new Date().toISOString() : null;
      const { error } = await supabase.from("trophy_progress").upsert(
        {
          user_id: state.user.id,
          game_id: gameId,
          trophy_id: trophyId,
          earned: earned,
          earned_at: earnedAt,
        },
        { onConflict: "user_id, game_id, trophy_id" },
      );
      if (error) throw error;
    } catch (e) {
      console.error("Save Err:", e);
    }
  }

  // --- LOGIQUE GRAPHIQUE ---
  function updateScoreHistory() {
    const stats = getHunterLevel();
    const today = new Date().toISOString().split("T")[0]; // Format YYYY-MM-DD
    let history = JSON.parse(localStorage.getItem("ps5_score_history") || "{}");

    // On enregistre le score du jour (on écrase si on recoche des trophées le même jour)
    history[today] = stats.totalPoints;

    localStorage.setItem("ps5_score_history", JSON.stringify(history));
    renderChart();
  }

  function renderChart() {
    const canvas = $("#progressChart");
    if (!canvas) return;

    let history = JSON.parse(localStorage.getItem("ps5_score_history") || "{}");

    // Si l'historique est vide, on initialise avec le score actuel
    if (Object.keys(history).length === 0) {
      const today = new Date().toISOString().split("T")[0];
      history[today] = getHunterLevel().totalPoints;
      localStorage.setItem("ps5_score_history", JSON.stringify(history));
    }

    const labels = Object.keys(history).sort();
    const dataPoints = labels.map((date) => history[date]);

    if (state.chartInstance) {
      state.chartInstance.destroy();
    }

    const ctx = canvas.getContext("2d");
    state.chartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels.map((d) => {
          const [y, m, day] = d.split("-");
          return `${day}/${m}`;
        }),
        datasets: [
          {
            label: "Score",
            data: dataPoints,
            borderColor: "#0072ce",
            backgroundColor: "rgba(0, 114, 206, 0.1)",
            borderWidth: 2,
            pointBackgroundColor: "#fff",
            pointBorderColor: "#0072ce",
            pointRadius: 3,
            fill: true,
            tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#1f1f1f",
            titleColor: "#fff",
            bodyColor: "#a0a0a0",
            borderColor: "rgba(255,255,255,0.1)",
            borderWidth: 1,
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#6a6a6a", font: { size: 10 } },
          },
          y: {
            grid: { color: "rgba(255,255,255,0.05)" },
            ticks: { color: "#6a6a6a", font: { size: 10 } },
            beginAtZero: true,
          },
        },
      },
    });
  }

  // --- RENDU ---
  function trophySvg(grade, size = 16) {
    return `<svg class="mini-trophy ${grade}" viewBox="0 0 24 24" width="${size}" height="${size}">
      <path d="M7 3h10v4q0 4-5 4T7 7V3Z" fill="currentColor"/>
      <path d="M7 4.4C4.3 4.7 4.3 8 7 8.2M17 4.4c2.7.3 2.7 3.6 0 3.8" fill="none" stroke="currentColor" stroke-width="1.3"/>
      <path d="M11.1 11h1.8v6h-1.8z" fill="currentColor"/><rect x="7.4" y="17" width="9.2" height="3.2" rx="1.3" fill="currentColor"/>
    </svg>`;
  }

  function renderHunterCard() {
    const container = $("#hunter-level-card");
    if (!container) return;
    const stats = getHunterLevel();

    const iconMap = {
      bronze: "nbronze(2020+).png",
      silver: "nsilver(2020+).png",
      gold: "ngold(2020+).png",
      platinum: "nplatinum(2020+).png",
    };
    const iconFile = iconMap[stats.levelRank];

    container.innerHTML = `
      <div class="hc-icon-wrap">
        <img src="level-icons/${iconFile}" alt="Niveau ${stats.level}">
        <div class="hc-level-badge">${stats.level}</div>
      </div>
      <div class="hc-details">
        <div class="hc-header">
          <div class="hc-title">${stats.title}</div>
          <div class="hc-score">${stats.totalPoints.toLocaleString("fr-FR")} PTS</div>
        </div>
        <div class="hc-progress-wrap">
          <div class="hc-xp-bar"><i style="width: ${stats.progressPct}%"></i></div>
          <div class="hc-xp-text">${stats.currentLevelPoints} / ${stats.pointsPerLevel} XP</div>
        </div>
      </div>
    `;
  }

  function renderGlobalStats() {
    const container = $("#global-stats");
    if (!container || state.games.length === 0) {
      if (container) container.innerHTML = "";
      return;
    }
    let totalEarned = 0,
      totalTrophies = 0;
    const globalGrades = {
      platinum: [0, 0],
      gold: [0, 0],
      silver: [0, 0],
      bronze: [0, 0],
    };

    state.games.forEach((g) => {
      g.trophies.forEach((t) => {
        totalTrophies++;
        if (!globalGrades[t.grade]) return;
        globalGrades[t.grade][1]++;
        if (t.earned) {
          totalEarned++;
          globalGrades[t.grade][0]++;
        }
      });
    });
    const globalPct = totalTrophies
      ? Math.round((totalEarned / totalTrophies) * 100)
      : 0;

    container.innerHTML = `
      <div class="gs-card main-stat">
        <div class="gs-title">Complétion Globale</div>
        <div class="gs-value"><span id="global-pct-anim">0</span>%</div>
        <div class="gs-progress-bar"><i style="width:${globalPct}%"></i></div>
        <div style="font-size:12px; color:var(--txt-muted); margin-top:8px; font-weight:600;">${totalEarned} / ${totalTrophies} trophées obtenus</div>
      </div>
      ${GRADE_ORDER.map(
        (grade) => `
        <div class="gs-card">
          <div class="gs-title">${GRADE_LABEL[grade]}</div>
          <div class="gs-icon-row">${trophySvg(grade, 20)}<div class="gs-value">${globalGrades[grade][0]} <small>/ ${globalGrades[grade][1]}</small></div></div>
        </div>
      `,
      ).join("")}
    `;
    animateValue($("#global-pct-anim"), 0, globalPct, 800);
  }

  function computeStats(game) {
    const stats = {
      platinum: [0, 0],
      gold: [0, 0],
      silver: [0, 0],
      bronze: [0, 0],
    };
    let earned = 0;
    for (const t of game.trophies) {
      if (!stats[t.grade]) continue;
      stats[t.grade][1]++;
      if (t.earned) {
        stats[t.grade][0]++;
        earned++;
      }
    }
    return {
      stats,
      earned,
      total: game.trophies.length,
      pct: game.trophies.length
        ? Math.round((earned / game.trophies.length) * 100)
        : 0,
    };
  }

  // --- NAVIGATION ---
  function showView(name) {
    state.view = name;
    ["dashboard", "game", "timeline", "platinums"].forEach((v) => {
      const el = $("#view-" + v);
      if (el) el.classList.toggle("hidden", v !== name);
    });
  }

  function goDashboard() {
    state.currentId = null;
    playSound("select");
    $$(".actions .btn").forEach((b) => b.classList.remove("active"));
    $("#btn-nav-dash").classList.add("active");
    renderDashboard();
    showView("dashboard");
  }

  function goGame(npcommid) {
    state.currentId = npcommid;
    state.search = "";
    state.filter = "all";
    state.sort = "default";
    playSound("select");
    renderGame();
    showView("game");
  }

  function goTimeline() {
    playSound("select");
    $$(".actions .btn").forEach((b) => b.classList.remove("active"));
    $("#btn-nav-timeline").classList.add("active");
    renderTimeline();
    showView("timeline");
  }

  function goPlatinums() {
    playSound("select");
    $$(".actions .btn").forEach((b) => b.classList.remove("active"));
    $("#btn-nav-platinums").classList.add("active");
    renderPlatinums();
    showView("platinums");
  }

  // --- DASHBOARD ---
  function renderDashboard() {
    $("#games-count").textContent = `${state.games.length} jeu(x)`;
    renderHunterCard();
    renderChart(); // On dessine le graphique
    renderGlobalStats();
    const grid = $("#game-grid");

    if (state.games.length === 0) {
      grid.innerHTML =
        '<p style="color:#888; text-align:center; width:100%; grid-column: 1/-1; padding: 40px;">Aucun jeu trouvé.</p>';
      return;
    }

    grid.innerHTML = state.games
      .map((g) => {
        const { stats, pct } = computeStats(g);
        const gameIcon = g.iconUrl
          ? `<img src="${g.iconUrl}" style="width:100%;height:100%;object-fit:cover;">`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="#0072ce" stroke-width="2"><path d="M12 2L15 9H22L16 14L18 21L12 17L6 21L8 14L2 9H9L12 2Z"/></svg>`;
        const trophiesHtml = GRADE_ORDER.map(
          (grade) =>
            `<div class="gc-trophy">${trophySvg(grade, 16)}<span>${stats[grade][0]}<small>/${stats[grade][1]}</small></span></div>`,
        ).join("");
        return `
        <div class="game-card" data-id="${esc(g.npcommid)}">
          <div class="gc-top">
            <div class="gc-icon">${gameIcon}</div>
            <div class="gc-info"><div class="gc-title">${esc(g.title)}</div><div class="gc-platform">${esc(g.platform)}</div></div>
          </div>
          <div class="gc-progress">
            <div class="gc-pct-row"><span>Complétion</span><span class="gc-pct">${pct}%</span></div>
            <div class="gc-bar"><i data-pct="${pct}" style="width:0"></i></div>
          </div>
          <div class="gc-trophies">${trophiesHtml}</div>
        </div>
      `;
      })
      .join("");

    requestAnimationFrame(() => {
      $$(".gc-bar > i").forEach(
        (bar) => (bar.style.width = bar.dataset.pct + "%"),
      );
      applyTilt3D();
    });
    grid
      .querySelectorAll(".game-card")
      .forEach((card) =>
        card.addEventListener("click", () => goGame(card.dataset.id)),
      );
  }

  // --- DÉTAIL JEU ---
  function renderToolbar() {
    return `
      <div class="toolbar">
        <div class="filters">
          <button class="filter-btn ${state.filter === "all" ? "active" : ""}" data-filter="all">Tous</button>
          <button class="filter-btn ${state.filter === "earned" ? "active" : ""}" data-filter="earned">Obtenus</button>
          <button class="filter-btn ${state.filter === "unearned" ? "active" : ""}" data-filter="unearned">Non obtenus</button>
        </div>
        <input class="search" type="search" placeholder="Rechercher un trophée..." value="${esc(state.search)}">
        <select class="sort-select">
          <option value="default" ${state.sort === "default" ? "selected" : ""}>Tri par défaut</option>
          <option value="date" ${state.sort === "date" ? "selected" : ""}>Plus récents</option>
          <option value="alpha" ${state.sort === "alpha" ? "selected" : ""}>A → Z</option>
        </select>
      </div>
    `;
  }

  function renderGame() {
    const game = state.games.find((g) => g.npcommid === state.currentId);
    if (!game) return;

    const { stats, earned, total, pct } = computeStats(game);
    const statsHtml = GRADE_ORDER.map(
      (g) =>
        `<div class="stat">${trophySvg(g, 22)}<span class="stat-v"><span class="stat-anim" data-target="${stats[g][0]}">0</span><small>/${stats[g][1]}</small></span></div>`,
    ).join("");
    const gameIcon = game.iconUrl
      ? `<img src="${game.iconUrl}" style="width:100%;height:100%;object-fit:cover;">`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="#0072ce" stroke-width="2"><path d="M12 2L15 9H22L16 14L18 21L12 17L6 21L8 14L2 9H9L12 2Z"/></svg>`;

    $("#game-detail").innerHTML = `
      <div class="game-header">
        <div class="gh-top">
          <div class="gh-icon">${gameIcon}</div>
          <div class="gh-info"><h1 class="gh-title">${esc(game.title)}</h1><div class="gh-meta">${esc(game.platform)} · ${earned}/${total} trophées</div></div>
          <div class="gh-progress">
            <div class="gh-pct"><span id="game-pct-anim">0</span><small>%</small></div>
            <div class="gh-bar"><i data-pct="${pct}" style="width:0"></i></div>
            <div class="gh-label">Complétion</div>
          </div>
        </div>
        <div class="gh-stats">${statsHtml}</div>
      </div>
      ${renderToolbar()}
      <div id="trophy-list-container"></div>
    `;

    animateValue($("#game-pct-anim"), 0, pct, 800);
    $$(".stat-anim").forEach((el) =>
      animateValue(el, 0, parseInt(el.dataset.target), 800),
    );

    $("#game-detail")
      .querySelectorAll(".filter-btn")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          state.filter = btn.dataset.filter;
          renderGame();
        });
      });
    $("#game-detail .search").addEventListener("input", (e) => {
      state.search = e.target.value;
      renderTrophyList(game);
    });
    $("#game-detail .sort-select").addEventListener("change", (e) => {
      state.sort = e.target.value;
      renderTrophyList(game);
    });

    renderTrophyList(game);
    requestAnimationFrame(() =>
      $$("#game-detail .gh-bar > i").forEach(
        (bar) => (bar.style.width = bar.dataset.pct + "%"),
      ),
    );
  }

  function renderTrophyList(game) {
    const q = state.search.trim().toLowerCase();
    let list = game.trophies.filter((t) => {
      if (state.filter === "earned" && !t.earned) return false;
      if (state.filter === "unearned" && t.earned) return false;
      if (q && !(t.name + " " + t.description).toLowerCase().includes(q))
        return false;
      return true;
    });

    if (state.sort === "date") {
      list.sort(
        (a, b) =>
          (b.earnedTime ? new Date(b.earnedTime).getTime() : 0) -
          (a.earnedTime ? new Date(a.earnedTime).getTime() : 0),
      );
    } else if (state.sort === "alpha") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    const container = $("#trophy-list-container");
    if (!list.length) {
      container.innerHTML = `<div class="empty-msg">Aucun trophée.</div>`;
      return;
    }

    container.innerHTML =
      `<ul class="trophy-list">` +
      list
        .map((t) => {
          const dateHtml = t.earnedTime
            ? `<span class="tdate">Obtenu le ${new Date(t.earnedTime).toLocaleDateString("fr-FR")}</span>`
            : "";
          return `
      <li class="trophy-row${t.earned ? "" : " locked"}" data-tid="${t.id}">
        <div class="medal">${t.iconUrl ? `<img src="${t.iconUrl}" style="width:100%;height:100%;object-fit:cover;">` : trophySvg(t.grade, 26)}</div>
        <div class="tinfo"><div class="tname">${esc(t.name)}</div><div class="tdesc">${esc(t.description)}</div></div>
        <div class="tmeta"><span class="rarity">${esc(GRADE_LABEL[t.grade] || "Bronze")}</span>${dateHtml}</div>
      </li>`;
        })
        .join("") +
      `</ul>`;

    container.querySelectorAll(".trophy-row").forEach((row) => {
      row.addEventListener("click", () => {
        const tid = parseInt(row.dataset.tid, 10);
        const trophy = game.trophies.find((t) => t.id === tid);
        if (trophy) {
          row.classList.add("animate-pop");
          setTimeout(() => row.classList.remove("animate-pop"), 300);

          if (!trophy.earned) {
            if (trophy.grade === "platinum") {
              playSound("platinum");
              confetti({
                particleCount: 150,
                spread: 100,
                origin: { y: 0.6 },
                colors: ["#a3d5ff", "#f5c14b", "#ffffff"],
              });
            } else {
              playSound("trophy");
              const color =
                trophy.grade === "gold"
                  ? "#f5c14b"
                  : trophy.grade === "silver"
                    ? "#c9d3df"
                    : "#c9803f";
              confetti({
                particleCount: 40,
                spread: 60,
                origin: { y: 0.6 },
                colors: [color],
              });
            }
          }

          trophy.earned = !trophy.earned;
          trophy.earnedTime = trophy.earned ? new Date().toISOString() : null;

          if (trophy.earned) {
            row.classList.remove("locked");
            const tmeta = row.querySelector(".tmeta");
            if (tmeta && !tmeta.querySelector(".tdate")) {
              const dateSpan = document.createElement("span");
              dateSpan.className = "tdate";
              dateSpan.textContent = `Obtenu le ${new Date(trophy.earnedTime).toLocaleDateString("fr-FR")}`;
              tmeta.appendChild(dateSpan);
            }
          } else {
            row.classList.add("locked");
            const dateSpan = row.querySelector(".tdate");
            if (dateSpan) dateSpan.remove();
          }

          const { stats, earned, total, pct } = computeStats(game);
          animateValue(
            $("#game-pct-anim"),
            parseInt($("#game-pct-anim").textContent),
            pct,
            400,
          );
          const newBars = $$("#game-detail .gh-bar > i");
          if (newBars[0]) newBars[0].style.width = pct + "%";

          const statElements = $$("#game-detail .stat-anim");
          statElements.forEach((el, i) => {
            const grade = GRADE_ORDER[i];
            animateValue(el, parseInt(el.textContent), stats[grade][0], 400);
          });

          renderHunterCard();
          saveProgressToSupabase(game.npcommid, trophy.id, trophy.earned);

          // 👇 MISE À JOUR DU GRAPHIQUE À CHAQUE CLIC
          updateScoreHistory();
        }
      });
    });
  }

  // --- TIMELINE ---
  function renderTimeline() {
    const container = $("#timeline-container");
    if (!container) return;

    let allEarned = [];
    state.games.forEach((g) => {
      g.trophies.forEach((t) => {
        if (t.earned && t.earnedTime) {
          allEarned.push({ ...t, gameTitle: g.title, gameId: g.npcommid });
        }
      });
    });

    allEarned.sort((a, b) => new Date(b.earnedTime) - new Date(a.earnedTime));

    if (allEarned.length === 0) {
      container.innerHTML = `<div class="empty-msg">Aucun trophée obtenu pour le moment.</div>`;
      return;
    }

    const groups = {};
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    allEarned.forEach((trophy) => {
      const d = new Date(trophy.earnedTime);
      let dateLabel = "";
      if (d.toDateString() === today.toDateString()) dateLabel = "Aujourd'hui";
      else if (d.toDateString() === yesterday.toDateString())
        dateLabel = "Hier";
      else {
        dateLabel = d.toLocaleDateString("fr-FR", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        });
      }
      if (!groups[dateLabel]) groups[dateLabel] = [];
      groups[dateLabel].push(trophy);
    });

    let html = "";
    for (const [dateLabel, trophies] of Object.entries(groups)) {
      html += `
        <div class="timeline-date-group">
          <div class="timeline-date-label">${dateLabel}</div>
          <div class="timeline-items">
            ${trophies
              .map(
                (t) => `
              <div class="timeline-item">
                <div class="ti-icon">
                  ${t.iconUrl ? `<img src="${t.iconUrl}">` : trophySvg(t.grade, 20)}
                </div>
                <div class="ti-info">
                  <div class="ti-name">${esc(t.name)}</div>
                  <div class="ti-game">${esc(t.gameTitle)}</div>
                </div>
                <div class="ti-grade ${t.grade}">${esc(GRADE_LABEL[t.grade] || "Bronze")}</div>
              </div>
            `,
              )
              .join("")}
          </div>
        </div>
      `;
    }
    container.innerHTML = html;
  }

  // --- MUR DES PLATINES ---
  function renderPlatinums() {
    const container = $("#platinum-grid");
    if (!container) return;

    let platinums = [];
    state.games.forEach((g) => {
      g.trophies.forEach((t) => {
        // Si le trophée est Platine, est obtenu et a une date
        if (t.grade === "platinum" && t.earned && t.earnedTime) {
          platinums.push({ ...t, gameTitle: g.title, gameIcon: g.iconUrl });
        }
      });
    });

    // Tri par date (du plus récent au plus ancien)
    platinums.sort((a, b) => new Date(b.earnedTime) - new Date(a.earnedTime));

    $("#platinum-count").textContent = `${platinums.length} Platine(s)`;

    if (platinums.length === 0) {
      container.innerHTML = `<div class="empty-msg" style="grid-column: 1/-1;">Aucun Platine obtenu pour le moment. Cochez vos trophées Platine pour les voir apparaître ici !</div>`;
      return;
    }

    container.innerHTML = platinums
      .map(
        (p) => `
      <div class="platinum-card">
        <div class="pc-icon">${trophySvg("platinum", 24)}</div>
        ${p.gameIcon ? `<img src="${p.gameIcon}" alt="${esc(p.gameTitle)}">` : `<div style="width:80px;height:80px;background:#333;border-radius:20px;margin-bottom:16px;"></div>`}
        <div class="pc-title">${esc(p.gameTitle)}</div>
        <div class="pc-date">Obtenu le ${new Date(p.earnedTime).toLocaleDateString("fr-FR")}</div>
      </div>
    `,
      )
      .join("");
  }

  // --- INITIALISATION ---
  $("#btn-back").addEventListener("click", goDashboard);
  $("#btn-nav-dash").addEventListener("click", goDashboard);
  $("#btn-nav-timeline").addEventListener("click", goTimeline);
  $("#btn-nav-platinums").addEventListener("click", goPlatinums);

  const btnSound = $("#btn-sound");
  if (btnSound) {
    btnSound.addEventListener("click", () => {
      state.soundEnabled = !state.soundEnabled;
      btnSound.textContent = state.soundEnabled ? "🔊" : "🔇";
    });
  }

  async function loadGamesFromGitHub() {
    try {
      const res = await fetch("data.json?t=" + Date.now());
      if (res.ok) {
        const games = await res.json();
        if (Array.isArray(games) && games.length > 0) {
          state.games = games;
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  async function init() {
    await initSupabase();
    await loadGamesFromGitHub();
    if (state.games.length > 0) await loadProgressFromSupabase();
    goDashboard();
  }

  init();
})();
