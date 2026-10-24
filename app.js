/* ============================================================
   PS Trophy Viewer — app.js (Version Cloud GitHub Finale)
   ============================================================ */

(() => {
  "use strict";

  const state = { games: [], view: "drop", currentId: null, search: "" };
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

  // --- GESTION DU CLOUD GITHUB ---
  function getCreds() {
    return {
      token: localStorage.getItem("gh_token"),
      gistId: localStorage.getItem("gh_gist_id"),
    };
  }

  function setupCloud() {
    let { token, gistId } = getCreds();
    if (!token || !gistId) {
      token = prompt("☁️ Colle ton TOKEN GitHub ici (commence par ghp_) :");
      if (token) localStorage.setItem("gh_token", token.trim());
      gistId = prompt("☁️ Colle l'ID de ton GIST secret ici :");
      if (gistId) localStorage.setItem("gh_gist_id", gistId.trim());
    }
    return !!getCreds().token;
  }

  async function pushToCloud() {
    const { token, gistId } = getCreds();
    if (!token || !gistId) return;

    const progress = localStorage.getItem("ps5_trophy_progress") || "{}";
    try {
      await fetch(`https://api.github.com/gists/${gistId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
        body: JSON.stringify({
          files: { "trophy_progress.json": { content: progress } },
        }),
      });
      console.log("☁️ Sauvegarde cloud réussie");
    } catch (e) {
      console.error("Erreur Cloud", e);
    }
  }

  async function pullFromCloud() {
    const { token, gistId } = getCreds();
    if (!token || !gistId) return false;

    try {
      const res = await fetch(`https://api.github.com/gists/${gistId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      });
      if (res.ok) {
        const data = await res.json();
        const cloudContent = data.files["trophy_progress.json"]?.content;
        if (cloudContent) {
          const cloudProgress = JSON.parse(cloudContent);
          const localProgress = JSON.parse(
            localStorage.getItem("ps5_trophy_progress") || "{}",
          );

          // Fusion intelligente : on garde ce qui est coché localement ET sur le cloud
          const merged = { ...cloudProgress };
          for (const gameId in localProgress) {
            if (!merged[gameId]) merged[gameId] = {};
            for (const tid in localProgress[gameId]) {
              if (localProgress[gameId][tid]) merged[gameId][tid] = true;
            }
          }

          localStorage.setItem("ps5_trophy_progress", JSON.stringify(merged));
          return true;
        }
      }
    } catch (e) {
      console.error("Erreur de chargement Cloud", e);
    }
    return false;
  }

  // --- SAUVEGARDE LOCALE ---
  function saveProgressToStorage() {
    const progress = {};
    state.games.forEach((g) => {
      progress[g.npcommid] = {};
      g.trophies.forEach((t) => {
        if (t.earned) progress[g.npcommid][t.id] = true;
      });
    });
    localStorage.setItem("ps5_trophy_progress", JSON.stringify(progress));
    pushToCloud(); // Envoi automatique au cloud
  }

  function applyProgressFromStorage() {
    const saved = localStorage.getItem("ps5_trophy_progress");
    if (!saved) return;
    try {
      const progress = JSON.parse(saved);
      state.games.forEach((g) => {
        if (progress[g.npcommid]) {
          g.trophies.forEach((t) => {
            if (progress[g.npcommid][t.id]) t.earned = true;
          });
        }
      });
    } catch (e) {}
  }

  function trophySvg(grade, size = 16) {
    return `<svg class="mini-trophy ${grade}" viewBox="0 0 24 24" width="${size}" height="${size}">
      <path d="M7 3h10v4q0 4-5 4T7 7V3Z" fill="currentColor"/>
      <path d="M7 4.4C4.3 4.7 4.3 8 7 8.2M17 4.4c2.7.3 2.7 3.6 0 3.8" fill="none" stroke="currentColor" stroke-width="1.3"/>
      <path d="M11.1 11h1.8v6h-1.8z" fill="currentColor"/><rect x="7.4" y="17" width="9.2" height="3.2" rx="1.3" fill="currentColor"/>
    </svg>`;
  }

  function addOrUpdateGame(game) {
    const existingIndex = state.games.findIndex(
      (g) => g.npcommid === game.npcommid,
    );
    if (existingIndex >= 0) state.games[existingIndex] = game;
    else state.games.push(game);
    applyProgressFromStorage();
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
    ["drop", "dashboard", "game"].forEach((v) =>
      $("#view-" + v).classList.toggle("hidden", v !== name),
    );
    $("#btn-reset").classList.toggle("hidden", name === "drop");

    // 👇 LE BOUTON CLOUD EST MAINTENANT TOUJOURS VISIBLE 👇
    const btnCloud = $("#btn-cloud");
    if (btnCloud) btnCloud.style.display = "inline-block";
  }

  function goDashboard() {
    state.currentId = null;
    renderDashboard();
    showView("dashboard");
  }
  function goGame(npcommid) {
    state.currentId = npcommid;
    state.search = "";
    renderGame();
    showView("game");
  }

  function renderDashboard() {
    $("#games-count").textContent = `${state.games.length} jeu(x)`;
    const grid = $("#game-grid");
    if (state.games.length === 0) {
      grid.innerHTML =
        '<p style="color:#888; text-align:center; width:100%; grid-column: 1/-1;">Aucun jeu chargé. Clique sur "Sync Cloud" ou ajoute un dossier via le pont Python.</p>';
      return;
    }
    grid.innerHTML = state.games
      .map((g) => {
        const { stats, pct } = computeStats(g);
        const trophiesHtml = GRADE_ORDER.map(
          (grade) => `
        <div class="gc-trophy">${trophySvg(grade, 16)}<span>${stats[grade][0]}<small>/${stats[grade][1]}</small></span></div>
      `,
        ).join("");
        return `
        <div class="game-card" data-id="${esc(g.npcommid)}">
          <div class="gc-top">
            <div class="gc-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#0072ce" stroke-width="2"><path d="M12 2L15 9H22L16 14L18 21L12 17L6 21L8 14L2 9H9L12 2Z"/></svg></div>
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

  function renderGame() {
    const game = state.games.find((g) => g.npcommid === state.currentId);
    if (!game) return;
    const { stats, earned, total, pct } = computeStats(game);
    const statsHtml = GRADE_ORDER.map(
      (g) => `
      <div class="stat">${trophySvg(g, 22)}<span class="stat-v">${stats[g][0]}<small>/${stats[g][1]}</small></span></div>
    `,
    ).join("");
    const bgStyle = game.backgroundUrl
      ? `background-image: url('${game.backgroundUrl}');`
      : "";

    $("#game-detail").innerHTML = `
      <div class="game-header" style="${bgStyle}">
        <div class="gh-top">
          <div class="gh-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#0072ce" stroke-width="2"><path d="M12 2L15 9H22L16 14L18 21L12 17L6 21L8 14L2 9H9L12 2Z"/></svg></div>
          <div class="gh-info"><h1 class="gh-title">${esc(game.title)}</h1><div class="gh-meta">${esc(game.platform)} · ${earned}/${total} trophées</div></div>
          <div class="gh-progress">
            <div class="gh-pct">${pct}<small>%</small></div>
            <div class="gh-bar"><i data-pct="${pct}" style="width:0"></i></div>
            <div class="gh-label">Complétion</div>
          </div>
        </div>
        <div class="gh-stats">${statsHtml}</div>
      </div>
      <div class="toolbar"><input class="search" type="search" placeholder="Rechercher un trophée..."></div>
      <div id="trophy-list-container"></div>
    `;
    renderTrophyList(game);
    requestAnimationFrame(() =>
      $$("#game-detail .gh-bar > i").forEach(
        (bar) => (bar.style.width = bar.dataset.pct + "%"),
      ),
    );
    $("#game-detail .search").addEventListener("input", (e) => {
      state.search = e.target.value;
      renderTrophyList(game);
    });
  }

  function renderTrophyList(game) {
    const q = state.search.trim().toLowerCase();
    const list = game.trophies.filter(
      (t) => !q || (t.name + " " + t.description).toLowerCase().includes(q),
    );
    const container = $("#trophy-list-container");
    if (!list.length) {
      container.innerHTML = `<div class="empty-msg">Aucun trophée.</div>`;
      return;
    }

    container.innerHTML =
      `<ul class="trophy-list">` +
      list
        .map(
          (t) => `
      <li class="trophy-row${t.earned ? "" : " locked"}" data-tid="${t.id}">
        <div class="medal">${t.iconUrl ? `<img src="${t.iconUrl}" style="width:100%;height:100%;object-fit:cover;">` : trophySvg(t.grade, 26)}</div>
        <div class="tinfo"><div class="tname">${esc(t.name)}</div><div class="tdesc">${esc(t.description)}</div></div>
        <div class="tmeta"><span class="rarity">${esc(GRADE_LABEL[t.grade] || "Bronze")}</span></div>
      </li>
    `,
        )
        .join("") +
      `</ul>`;

    container.querySelectorAll(".trophy-row").forEach((row) => {
      row.addEventListener("click", () => {
        const tid = parseInt(row.dataset.tid, 10);
        const trophy = game.trophies.find((t) => t.id === tid);
        if (trophy) {
          trophy.earned = !trophy.earned;
          saveProgressToStorage(); // Déclenche aussi pushToCloud()
          renderGame();
        }
      });
    });
  }

  // --- ÉVÉNEMENTS ---
  $("#btn-pick").addEventListener("click", () => $("#file-input").click());
  $("#file-input").setAttribute("webkitdirectory", "");
  $("#file-input").addEventListener("change", (e) => {
    const files = Array.from(e.target.files);
    if (files.length) processFolder(files);
    e.target.value = "";
  });

  $("#btn-cloud").addEventListener("click", async () => {
    if (setupCloud()) {
      const success = await pullFromCloud();
      applyProgressFromStorage();
      if (state.view === "dashboard") renderDashboard();
      if (state.view === "game") renderGame();

      if (success)
        alert(
          "☁️ Synchronisation avec le Cloud réussie ! Ta progression a été mise à jour.",
        );
      else
        alert(
          "Impossible de récupérer les données. Vérifie ton Token et l'ID du Gist.",
        );
    }
  });

  $("#btn-reset").addEventListener("click", () => {
    if (
      confirm("Voulez-vous vraiment tout effacer (y compris les clés Cloud) ?")
    ) {
      state.games = [];
      localStorage.clear();
      showView("drop");
    }
  });
  $("#btn-back").addEventListener("click", goDashboard);

  function processFolder(files) {
    let jsonFile = files.find((f) => f.name.includes("tropmeta"));
    if (!jsonFile) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = JSON.parse(e.target.result);
      const trophees = data.metadata.trophyMetadata.map((t, i) => ({
        id: i,
        name: t.name,
        description: t.detail,
        grade: t.id === "0000" ? "platinum" : "bronze",
        earned: false,
      }));
      addOrUpdateGame({
        npcommid: "MANUEL_" + Date.now(),
        title: data.metadata.titleMetadata.name,
        platform: "PS5",
        trophies: trophees,
      });
    };
    reader.readAsText(jsonFile);
  }

  function connectWebSocket() {
    const ws = new WebSocket("ws://localhost:8765");
    ws.onopen = () => {
      const badge = document.createElement("div");
      badge.id = "live-badge";
      badge.style.cssText =
        "position:fixed; top:20px; right:20px; background:#3ddc84; color:#000; padding:8px 16px; border-radius:20px; font-weight:bold; font-family:sans-serif; font-size:12px; z-index:9999; transition: all 0.3s;";
      badge.textContent = "🟢 PS5 Connectée";
      document.body.appendChild(badge);
    };
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "full_game_data") {
        addOrUpdateGame(msg.game);
        const badge = document.getElementById("live-badge");
        if (badge) {
          badge.textContent = `✨ ${msg.game.title} synchronisé !`;
          badge.style.background = "#0072ce";
          badge.style.color = "#fff";
          setTimeout(() => {
            badge.textContent = "🟢 PS5 Connectée";
            badge.style.background = "#3ddc84";
            badge.style.color = "#000";
          }, 3000);
        }
      }
    };
    ws.onclose = () => document.getElementById("live-badge")?.remove();
  }

  // --- INITIALISATION ---
  async function init() {
    showView("drop");
    // Si on a déjà les clés, on récupère la sauvegarde du cloud en silence
    if (getCreds().token) {
      const success = await pullFromCloud();
      if (success) applyProgressFromStorage();
    }
    connectWebSocket();
  }

  init();
})();
