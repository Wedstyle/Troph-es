/* ============================================================
   PS Trophy Viewer — app.js (Version PS5 Feel + Filtres)
   ============================================================ */

(() => {
  "use strict";

  const SUPABASE_URL = "https://ahacsjnxswymhmqmizd.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_5_mW0UxmK0PyVnr3nzfZgw_r-0rsMqH";
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

  // --- GESTION SUPABASE ---
  async function initSupabase() {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session && session.user) {
        state.user = session.user;
        console.log("✅ Session existante récupérée :", state.user.id);
      } else {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
        state.user = data.user;
        console.log("✅ Nouvelle session anonyme créée :", state.user.id);
      }
    } catch (e) {
      console.error("❌ Erreur Supabase Auth :", e);
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
        console.log("🔄 Progression chargée.");
      }
    } catch (e) {
      console.error("❌ Erreur chargement :", e);
    }
  }

  async function saveProgressToSupabase(gameId, trophyId, earned) {
    if (!state.user) return;
    try {
      const earnedAt = earned ? new Date().toISOString() : null;
      const { error } = await supabase
        .from("trophy_progress")
        .upsert(
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
      console.log(`💾 Trophée ${trophyId} sauvegardé.`);
    } catch (e) {
      console.error("❌ Erreur sauvegarde :", e);
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
        <div class="gs-value">${globalPct}%</div>
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
  }

  function addOrUpdateGame(game) {
    const existingIndex = state.games.findIndex(
      (g) => g.npcommid === game.npcommid,
    );
    if (existingIndex >= 0) state.games[existingIndex] = game;
    else state.games.push(game);
    goDashboard();
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

  function goDashboard() {
    state.currentId = null;
    // 👈 On remet le fond par défaut
    document.body.style.background = "var(--bg)";
    renderDashboard();
    showView("dashboard");
  }

  function goGame(npcommid) {
    state.currentId = npcommid;
    state.search = "";
    state.filter = "all";
    state.sort = "default";
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
    requestAnimationFrame(() =>
      $$(".gc-bar > i").forEach(
        (bar) => (bar.style.width = bar.dataset.pct + "%"),
      ),
    );
    grid
      .querySelectorAll(".game-card")
      .forEach((card) =>
        card.addEventListener("click", () => goGame(card.dataset.id)),
      );
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

    // 👇 EFFET PS5 : Le fond prend la couleur de l'icône
    if (game.iconUrl) {
      const img = new Image();
      img.src = game.iconUrl;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        document.body.style.background = `radial-gradient(circle at top, rgba(${r},${g},${b},0.15) 0%, var(--bg) 60%)`;
      };
    } else {
      document.body.style.background = "var(--bg)";
    }
    // 👆 FIN EFFET PS5

    const { stats, earned, total, pct } = computeStats(game);
    const statsHtml = GRADE_ORDER.map(
      (g) =>
        `<div class="stat">${trophySvg(g, 22)}<span class="stat-v">${stats[g][0]}<small>/${stats[g][1]}</small></span></div>`,
    ).join("");
    const bgStyle = game.backgroundUrl
      ? `background-image: url('${game.backgroundUrl}');`
      : "";
    const gameIcon = game.iconUrl
      ? `<img src="${game.iconUrl}" style="width:100%;height:100%;object-fit:cover;">`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="#0072ce" stroke-width="2"><path d="M12 2L15 9H22L16 14L18 21L12 17L6 21L8 14L2 9H9L12 2Z"/></svg>`;

    $("#game-detail").innerHTML = `
      <div class="game-header" style="${bgStyle}">
        <div class="gh-top">
          <div class="gh-icon">${gameIcon}</div>
          <div class="gh-info"><h1 class="gh-title">${esc(game.title)}</h1><div class="gh-meta">${esc(game.platform)} · ${earned}/${total} trophées</div></div>
          <div class="gh-progress">
            <div class="gh-pct">${pct}<small>%</small></div>
            <div class="gh-bar"><i data-pct="${pct}" style="width:0"></i></div>
            <div class="gh-label">Complétion</div>
          </div>
        </div>
        <div class="gh-stats">${statsHtml}</div>
      </div>
      ${renderToolbar()}
      <div id="trophy-list-container"></div>
    `;

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
      list.sort((a, b) => {
        const dateA = a.earnedTime ? new Date(a.earnedTime).getTime() : 0;
        const dateB = b.earnedTime ? new Date(b.earnedTime).getTime() : 0;
        return dateB - dateA;
      });
    } else if (state.sort === "alpha") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    const container = $("#trophy-list-container");
    if (!list.length) {
      container.innerHTML = `<div class="empty-msg">Aucun trophée ne correspond à ces filtres.</div>`;
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
        <div class="tmeta">
          <span class="rarity">${esc(GRADE_LABEL[t.grade] || "Bronze")}</span>
          ${dateHtml}
        </div>
      </li>
    `;
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

          trophy.earned = !trophy.earned;
          trophy.earnedTime = trophy.earned ? new Date().toISOString() : null;

          saveProgressToSupabase(game.npcommid, trophy.id, trophy.earned);

          setTimeout(() => renderGame(), 150);
        }
      });
    });
  }

  // --- INITIALISATION ---
  const btnBack = $("#btn-back");
  if (btnBack) btnBack.addEventListener("click", goDashboard);

  function connectWebSocket() {
    const ws = new WebSocket("ws://localhost:8765");
    ws.onopen = () => {
      const badge = document.createElement("div");
      badge.id = "live-badge";
      badge.style.cssText =
        "position:fixed; top:20px; right:20px; background:#3ddc84; color:#000; padding:8px 16px; border-radius:20px; font-weight:bold; font-family:sans-serif; font-size:12px; z-index:9999;";
      badge.textContent = "🟢 PS5 Connectée (Local)";
      document.body.appendChild(badge);
    };
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "full_game_data") {
        addOrUpdateGame(msg.game);
      }
    };
    ws.onclose = () => document.getElementById("live-badge")?.remove();
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
    connectWebSocket();
  }

  init();
})();
