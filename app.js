/* Corthal landing — small, dependency-free progressive enhancement. */
(() => {
  "use strict";

  /* ---------- Real theme presets (src/lib/theme/presets.ts) ---------- */
  const THEMES = [
    { name: "Onyx Dark",          cat: "dark",  side: "#050507", main: "#09090b", card: "#121216", input: "#16161b", fg: "#f4f4f5", fg2: "#a1a1aa", fg3: "#71717a", border: "rgba(255,255,255,0.09)" },
    { name: "Charcoal Slate",     cat: "dark",  side: "#0e1015", main: "#13161c", card: "#1b1e27", input: "#212530", fg: "#e5e7eb", fg2: "#9ca3af", fg3: "#6b7280", border: "rgba(148,163,184,0.14)", shot: "img/hero.png" },
    { name: "Midnight Abyss",     cat: "dark",  side: "#070a11", main: "#0a0e17", card: "#141a2c", input: "#182035", fg: "#e2e8f0", fg2: "#94a3b8", fg3: "#64748b", border: "rgba(59,130,246,0.16)" },
    { name: "Twilight Violet",    cat: "dark",  side: "#0c0a14", main: "#110e1b", card: "#1e1930", input: "#261f3d", fg: "#f1edfd", fg2: "#a79fc2", fg3: "#756c91", border: "rgba(139,92,246,0.16)", shot: "img/theme-violet.png" },
    { name: "Pine Forest",        cat: "dark",  side: "#090e0c", main: "#0d1411", card: "#17231e", input: "#1d2c26", fg: "#ecfdf5", fg2: "#a7f3d0", fg3: "#6ee7b7", border: "rgba(16,185,129,0.16)", shot: "img/theme-pine.png" },
    { name: "Ashen Stone",        cat: "dark",  side: "#101213", main: "#151719", card: "#222528", input: "#2a2d31", fg: "#e5e7eb", fg2: "#9ca3af", fg3: "#6b7280", border: "rgba(255,255,255,0.11)" },
    { name: "Nordic Sea",         cat: "dark",  side: "#070e10", main: "#0b1517", card: "#162529", input: "#1c2f34", fg: "#e0f2fe", fg2: "#7dd3fc", fg3: "#38bdf8", border: "rgba(6,182,212,0.16)" },
    { name: "Ember Terracotta",   cat: "dark",  side: "#110b0a", main: "#171110", card: "#291e1c", input: "#342624", fg: "#ffedd5", fg2: "#fed7aa", fg3: "#fb923c", border: "rgba(249,115,22,0.16)" },
    { name: "Dark Mulberry",      cat: "dark",  side: "#100a0f", main: "#160f15", card: "#271b26", input: "#322230", fg: "#fce7f3", fg2: "#fbcfe8", fg3: "#f472b6", border: "rgba(236,72,153,0.16)" },
    { name: "Desert Dune",        cat: "dark",  side: "#0f0d0b", main: "#151310", card: "#24211c", input: "#2e2a24", fg: "#fef3c7", fg2: "#fde68a", fg3: "#f59e0b", border: "rgba(245,158,11,0.15)" },
    { name: "Nordic Frost Light", cat: "light", side: "#f8fafc", main: "#ffffff", card: "#ffffff", input: "#f1f5f9", fg: "#0f172a", fg2: "#475569", fg3: "#94a3b8", border: "rgba(0,0,0,0.1)" },
  ];
  const THEME_BY_NAME = Object.fromEntries(THEMES.map((t) => [t.name, t]));
  const DEFAULT_THEME = "default";
  const SYSTEM = "system";
  const LIGHT_FALLBACK = "Nordic Frost Light";

  /* [hex, EN name, RU name] */
  const ACCENTS = [
    ["#2575fc", "Cobalt Blue",      "Кобальтовый синий"],
    ["#00d2ff", "Neon Cyan",        "Неоновый циан"],
    ["#05d59e", "Seafoam Mint",     "Морская мята"],
    ["#10b981", "Emerald Green",    "Изумрудный"],
    ["#8ee000", "Lime Spark",       "Лаймовый всплеск"],
    ["#f59e0b", "Amber Gold",       "Янтарное золото"],
    ["#ff7849", "Tangerine Sunset", "Мандариновый закат"],
    ["#f43f5e", "Coral Red",        "Коралловый красный"],
    ["#f43f9e", "Neon Rose",        "Неоновая роза"],
    ["#d946ef", "Fuchsia Pink",     "Фуксия"],
    ["#8b5cf6", "Amethyst Purple",  "Аметистовый"],
    ["#6366f1", "Deep Indigo",      "Глубокий индиго"],
    ["#94a3b8", "Slate Chrome",     "Хромированный сланец"],
    ["#0c75de", "System Accent",    "Системный акцент"],
  ];
  const DEFAULT_ACCENT = ACCENTS[0][0];

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const root = document.documentElement;
  const lightMQ = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
    del(k) { try { localStorage.removeItem(k); } catch (_) {} },
  };

  const state = {
    lang: "ru",
    theme: DEFAULT_THEME,
    accent: DEFAULT_ACCENT,
  };

  /* ---------- Swatches ---------- */
  function renderSwatches() {
    const host = $("#swatches");
    if (!host) return;
    const html = THEMES.map((t) => `
      <button type="button" class="swatch" data-theme="${t.name}" aria-pressed="false">
        <div class="swatch-win" style="--b:${t.border};--f:${t.fg};--m:${t.fg3};--a:var(--accent)" aria-hidden="true">
          <div class="sw-side" style="background:${t.side}">
            <span class="sw-line" style="width:80%"></span>
            <span class="sw-line is-acc" style="width:90%"></span>
            <span class="sw-line" style="width:65%"></span>
            <span class="sw-line" style="width:75%"></span>
          </div>
          <div class="sw-main" style="background:${t.main}">
            <span class="sw-title"></span>
            <span class="sw-line" style="width:92%"></span>
            <span class="sw-line" style="width:70%"></span>
            <div class="sw-card" style="background:${t.card}">
              <span class="sw-dot"></span><span class="sw-line" style="width:60%"></span>
            </div>
          </div>
        </div>
        <div class="swatch-name"><span>${t.name}</span><small data-ru="${t.cat === "light" ? "светлая" : "тёмная"}">${t.cat}</small></div>
      </button>`).join("");
    host.innerHTML = html + `
      <button type="button" class="swatch swatch-gtk" data-theme="${SYSTEM}" aria-pressed="false">
        <div class="swatch-win"><span>GTK 3 / 4<br><span data-ru="системная тема">system theme</span></span></div>
        <div class="swatch-name"><span data-ru="Как в системе">Follow system</span><small>auto</small></div>
      </button>`;
    $$(".swatch", host).forEach((b) => b.addEventListener("click", () => setTheme(b.dataset.theme, true)));
  }

  function renderAccents() {
    const host = $("#accents");
    if (!host) return;
    host.innerHTML = ACCENTS.map(([hex, en, ru]) => {
      const name = state.lang === "ru" ? ru : en;
      const on = hex === state.accent;
      return `<button type="button" class="accent${on ? " is-active" : ""}" style="--c:${hex}" data-hex="${hex}" data-name="${name}" aria-label="${name}" aria-pressed="${on}"></button>`;
    }).join("");
    $$(".accent", host).forEach((b) => b.addEventListener("click", () => setAccent(b.dataset.hex, true)));
  }

  /* ---------- Theming ---------- */
  const VARS = ["--bg", "--bg-alt", "--surface", "--surface-2", "--line", "--line-strong", "--fg", "--fg-2", "--fg-3"];

  function animateSwitch() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    root.classList.add("theming");
    clearTimeout(animateSwitch.t);
    animateSwitch.t = setTimeout(() => root.classList.remove("theming"), 450);
  }

  function paint(preset) {
    const meta = $('meta[name="theme-color"]');
    if (!preset) {
      VARS.forEach((v) => root.style.removeProperty(v));
      root.style.colorScheme = "dark";
      if (meta) meta.setAttribute("content", "#0b0c0f");
      return;
    }
    const p = preset;
    root.style.setProperty("--bg", p.main);
    root.style.setProperty("--bg-alt", p.side);
    root.style.setProperty("--surface", p.card === p.main ? p.side : p.card);
    root.style.setProperty("--surface-2", p.input);
    root.style.setProperty("--line", p.border);
    root.style.setProperty("--line-strong", `color-mix(in srgb, ${p.fg} 16%, transparent)`);
    root.style.setProperty("--fg", p.fg);
    root.style.setProperty("--fg-2", p.fg2);
    root.style.setProperty("--fg-3", p.fg3);
    root.style.colorScheme = p.cat;
    if (meta) meta.setAttribute("content", p.main);
  }

  function resolvedPreset(theme) {
    if (theme === DEFAULT_THEME) return null;
    if (theme === SYSTEM) return lightMQ && lightMQ.matches ? THEME_BY_NAME[LIGHT_FALLBACK] : THEME_BY_NAME["Charcoal Slate"];
    return THEME_BY_NAME[theme] || null;
  }

  function setTheme(theme, user) {
    if (theme !== DEFAULT_THEME && theme !== SYSTEM && !THEME_BY_NAME[theme]) theme = DEFAULT_THEME;
    state.theme = theme;
    if (user) animateSwitch();
    const preset = resolvedPreset(theme);
    paint(preset);

    $$(".swatch").forEach((b) => {
      const on = b.dataset.theme === theme;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    });

    // Sync the hero screenshot when we have a real capture of this theme.
    if (preset && preset.shot) showShot(preset.name);
    else if (!preset && user) showShot("Charcoal Slate");

    if (user) {
      if (theme === DEFAULT_THEME) store.del("corthal-theme");
      else store.set("corthal-theme", theme);
    }
    updateHint();
  }

  function setAccent(hex, user) {
    state.accent = hex;
    if (user) animateSwitch();
    root.style.setProperty("--accent", hex);
    $$(".accent").forEach((b) => {
      const on = b.dataset.hex === hex;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    if (user) {
      if (hex === DEFAULT_ACCENT) store.del("corthal-accent");
      else store.set("corthal-accent", hex);
    }
    updateHint();
  }

  function updateHint() {
    const cur = $("#theme-current");
    const reset = $("#theme-reset");
    const custom = state.theme !== DEFAULT_THEME || state.accent !== DEFAULT_ACCENT;
    if (cur) {
      if (!custom) cur.textContent = "";
      else {
        const themeName = state.theme === SYSTEM ? (state.lang === "ru" ? "Как в системе" : "Follow system") : state.theme;
        const acc = ACCENTS.find((a) => a[0] === state.accent);
        const accName = acc ? (state.lang === "ru" ? acc[2] : acc[1]) : state.accent;
        cur.textContent = `→ ${themeName} · ${accName}`;
      }
    }
    if (reset) reset.hidden = !custom;
  }

  /* ---------- Hero screenshot ---------- */
  function showShot(name) {
    const img = $("#hero-shot");
    const tab = $$(".theme-tab").find((t) => t.dataset.name === name);
    if (!img || !tab) return;
    $$(".theme-tab").forEach((t) => { t.classList.toggle("is-active", t === tab); t.setAttribute("aria-selected", String(t === tab)); });
    if (img.getAttribute("src") === tab.dataset.shot) return;
    img.classList.add("is-fading");
    setTimeout(() => {
      img.onload = () => img.classList.remove("is-fading");
      img.src = tab.dataset.shot;
      img.alt = img.alt.replace(/^Corthal( in [\w ]+ theme)?/, `Corthal in ${name} theme`);
    }, 140);
  }

  function initThemeTabs() {
    const tabs = $$(".theme-tab");
    tabs.forEach((t) => { const i = new Image(); i.src = t.dataset.shot; });
    // A hero tab is a shortcut: it shows the capture and themes the whole page to match.
    tabs.forEach((tab) => tab.addEventListener("click", () => setTheme(tab.dataset.name, true)));
  }

  /* ---------- i18n ---------- */
  const META = {
    en: {
      title: "Corthal — a local-first second brain for Linux",
      desc: "Corthal is a local-first Markdown workspace for Linux. Plain .md files, secrets encrypted inline with your SSH key, and an AI assistant that never sees them.",
    },
    ru: {
      title: "Corthal — локальный второй мозг для Linux",
      desc: "Corthal — локальное Markdown-пространство для Linux. Обычные .md-файлы, секреты, зашифрованные вашим SSH-ключом прямо в тексте, и ИИ-ассистент, который их не видит.",
    },
  };

  function applyLang(lang) {
    state.lang = lang;
    $$("[data-ru]").forEach((el) => {
      if (!el.hasAttribute("data-en")) el.setAttribute("data-en", el.innerHTML.trim());
      el.innerHTML = lang === "ru" ? el.getAttribute("data-ru") : el.getAttribute("data-en");
    });
    root.lang = lang;
    document.title = META[lang].title;
    const d = $('meta[name="description"]');
    if (d) d.setAttribute("content", META[lang].desc);
    $$(".lang button").forEach((b) => b.classList.toggle("is-active", b.dataset.lang === lang));
    renderAccents();
    updateHint();
    store.set("corthal-lang", lang);
  }

  function initialLang() {
    const q = new URLSearchParams(location.search).get("lang");
    if (q === "ru" || q === "en") return q;
    const s = store.get("corthal-lang");
    if (s === "ru" || s === "en") return s;
    return "ru";
  }

  /* ---------- Copy ---------- */
  function initCopy() {
    $$(".copy, .copy-inline").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const src = document.getElementById(btn.dataset.copy);
        if (!src) return;
        const text = src.textContent.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
        try {
          await navigator.clipboard.writeText(text);
          btn.classList.add("is-done");
          setTimeout(() => btn.classList.remove("is-done"), 1400);
        } catch (_) {}
      });
    });
  }

  /* ---------- Nav border on scroll ---------- */
  function initNav() {
    const nav = $("#nav");
    if (!nav) return;
    const on = () => nav.classList.toggle("is-scrolled", window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
  }

  /* ---------- Gentle reveal ---------- */
  function initReveal() {
    if (!("IntersectionObserver" in window)) return;
    if (new URLSearchParams(location.search).has("static")) return;
    const els = $$(".sec-head, .split, .steps, .spec-grid, .providers, .notes-grid, .editor-grid, .panel-table, .swatches, .dl-grid");
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    els.forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight) return;
      el.classList.add("reveal");
      io.observe(el);
    });
  }

  /* ---------- Boot ---------- */
  const qs = new URLSearchParams(location.search);
  renderSwatches();
  applyLang(initialLang());
  $$(".lang button").forEach((b) => b.addEventListener("click", () => applyLang(b.dataset.lang)));
  initThemeTabs();

  const savedAccent = qs.get("accent") ? "#" + qs.get("accent").replace(/^#/, "") : store.get("corthal-accent");
  setAccent(ACCENTS.some((a) => a[0] === savedAccent) ? savedAccent : DEFAULT_ACCENT, false);
  setTheme(qs.get("theme") || store.get("corthal-theme") || DEFAULT_THEME, false);

  if (lightMQ) {
    const onScheme = () => { if (state.theme === SYSTEM) { animateSwitch(); setTheme(SYSTEM, false); } };
    lightMQ.addEventListener ? lightMQ.addEventListener("change", onScheme) : lightMQ.addListener(onScheme);
  }
  const reset = $("#theme-reset");
  if (reset) reset.addEventListener("click", () => { setAccent(DEFAULT_ACCENT, true); setTheme(DEFAULT_THEME, true); });

  initCopy();
  initNav();
  initReveal();
})();
