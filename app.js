/* ============================================================
   PS Trophy Viewer — app.js (Version Sons PS5 Distincts)
   ============================================================ */

(() => {
  "use strict";

  const SUPABASE_URL = "https://ahacsjnxswymhmqmizd.supabase.co";
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

  // --- GESTION DES SONS PS5 ---
  const sounds = {
    trophy: new Audio("sounds/PS5NewTrophy.ogg"),
    platinum: new Audio("sounds/PS5NewPlatinumTrophy.ogg"),
    select: new Audio("sounds/PS5Select.ogg"), // 👈 Le nouveau son de navigation
  };

  // 👇 RÉGLAGE DU VOLUME (0.0 à 1.0)
  sounds.trophy.volume = 0.3;
  sounds.platinum.volume = 0.3;
  sounds.select.volume = 0.2; // Un peu plus discret pour la navigation

  function playSound(type) {
    if (!state.soundEnabled) return;
    const sound = sounds[type];
    if (sound) {
      sound.currentTime = 0;
      sound.play().catch((e) => console.log("Lecture audio bloquée", e));
    }
  }

  // --- EFFET TILT 3D ---
  function applyTilt3D() {
    $$(".game-card").forEach((card) => {
      card.addEventListener("mousemove", (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = ((y - centerY) / centerY) * -10;
        const rotateY = ((x - centerX) / centerX) * 10;
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

  // --- RENDU ---
  function trophySvg(grade, size = 16) {
    return `<svg class="mini-trophy ${grade}" viewBox="0 0 24 24" width="${size}" height="${size}">
      <path d="M7 3h10v4q0 4-5 4T7 7V3Z" fill="currentColor"/>
      <path d="M7 4.4C4.3 4.7 4.3 8 7 8.2M17 4.4c2.7.3 2.7 3.6 0 3.8" fill="none" stroke="currentColor" stroke-width="1.3"/>
      <path d="M11.1 11h1.8v6h-1.8z" fill="currentColor"/><rect x="7.4" y="17" width="9.2" height="3.2" rx="1.3" fill="currentColor"/>
    </svg>`;
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

  function goDashboard() {
    state.currentId = null;
    playSound("select"); // 👈 Son de navigation
    renderDashboard();
    showView("dashboard");
  }

  function goGame(npcommid) {
    state.currentId = npcommid;
    state.search = "";
    state.filter = "all";
    state.sort = "default";
    playSound("select"); // 👈 Son de navigation
    renderGame();
    showView("game");
  }

  function renderDashboard() {
    $("#games-count").textContent = `${state.games.length} jeu(x)`;
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

  function showView(name) {
    state.view = name;
    ["dashboard", "game"].forEach((v) => {
      const el = $("#view-" + v);
      if (el) el.classList.toggle("hidden", v !== name);
    });
  }

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

          // 👇 LE SON DE TROPHÉE SE JOUE ICI (uniquement pour les trophées)
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

          saveProgressToSupabase(game.npcommid, trophy.id, trophy.earned);
        }
      });
    });
  }

  // --- INITIALISATION ---
  const btnBack = $("#btn-back");
  if (btnBack) btnBack.addEventListener("click", goDashboard);

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
