(() => {
  const init = () => {
    const mainEl = document.getElementById("main");
    const API_BASE = (mainEl?.dataset.apiBase || "/backend/api").replace(/\/+$/, "");
    const USER_KEY = "sportshub_user";

    const ENDPOINTS = {
      clubs: `${API_BASE}/clubs.php`,
      joinClub: `${API_BASE}/clubs.php`,
      upcomingFixtures: `${API_BASE}/tournaments.php`,
    };

    function getUser() {
      try {
        const raw = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    }

    function getErrorMessage(err, fallback = "Could not complete request right now. Please try again later.") {
      if (typeof err === "string" && err.trim()) return err.trim();
      if (err instanceof Error && typeof err.message === "string" && err.message.trim()) {
        return err.message.trim();
      }
      if (err && typeof err === "object") {
        if (typeof err.message === "string" && err.message.trim()) return err.message.trim();
        if (typeof err.error === "string" && err.error.trim()) return err.error.trim();
      }
      return fallback;
    }

    function getHtmlClubImages() {
      const tpl = document.getElementById("club-images");
      const map = new Map();
      if (!tpl) return map;

      tpl.content.querySelectorAll("img[data-slug]").forEach((img) => {
        const slug = img.dataset.slug?.trim();
        const src = img.getAttribute("src")?.trim();
        if (slug && src) {
          map.set(slug, src);
        }
      });
      return map;
    }

    const HTML_CLUB_IMAGES = getHtmlClubImages();

    function resolveClubImage(slug, apiImage = "") {
      return HTML_CLUB_IMAGES.get(slug) || apiImage || "";
    }

    function slugify(name = "") {
      return String(name)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    }

    const FALLBACK_CLUBS = [
      {
        id: 1,
        slug: "nsbm-athletics-club",
        name: "Athletics Club",
        category: "field",
        categoryLabel: "Track & Field",
        venue: "NSBM Athletics Track & Grounds",
        schedule: "Tue & Thu · 4:00 PM – 6:00 PM",
        membersCount: 84,
        lead: "Athletics Captain · Sports Council",
        summary: "Sprint, middle-distance, relay, and field event training for university track meets and inter-university championships.",
        officialUrl: "https://www.nsbm.ac.lk/club/nsbm-athletics-club/",
      },
      {
        id: 2,
        slug: "nsbm-badminton-club",
        name: "Badminton Club",
        category: "indoor",
        categoryLabel: "Indoor Court",
        venue: "NSBM Indoor Sports Complex",
        schedule: "Mon & Wed · 4:30 PM – 6:30 PM",
        membersCount: 68,
        lead: "Badminton Captain · Sports Council",
        summary: "Singles and doubles drills, footwork conditioning, and selection trials for inter-faculty and SLUG badminton tournaments.",
        officialUrl: "https://www.nsbm.ac.lk/club/nsbm-badminton-club/",
      },
      {
        id: 3,
        slug: "chess-club",
        name: "Chess Club",
        category: "indoor",
        categoryLabel: "Mind Sport",
        venue: "Student Centre · Level 2",
        schedule: "Wed & Fri · 3:30 PM – 5:30 PM",
        membersCount: 52,
        lead: "Chess President · Sports Council",
        summary: "Rapid and classical over-the-board sessions, opening prep, and inter-university chess squad selection.",
        officialUrl: "https://www.nsbm.ac.lk/club/chess-club/",
      },
      {
        id: 4,
        slug: "cricket-club",
        name: "Cricket Club",
        category: "field",
        categoryLabel: "Field Sport",
        venue: "NSBM Cricket Ground & Nets",
        schedule: "Tue, Thu & Sat · 3:30 PM – 6:00 PM",
        membersCount: 96,
        lead: "Cricket Captain · Sports Council",
        summary: "Net practice, fielding drills, and squad matches across hard-ball and university tournament formats.",
        officialUrl: "https://www.nsbm.ac.lk/club/cricket-club/",
      },
      {
        id: 5,
        slug: "nsbm-martial-arts-club",
        name: "Martial Arts Club",
        category: "combat-aquatic",
        categoryLabel: "Combat & Martial Arts",
        venue: "NSBM Multi-Purpose Martial Arts Hall",
        schedule: "Tue & Thu · 4:30 PM – 6:30 PM",
        membersCount: 61,
        lead: "Martial Arts Lead · Sports Council",
        summary: "Structured technique, pattern/form discipline, sparring conditioning, and grading preparation for beginners and experienced practitioners.",
        officialUrl: "https://www.nsbm.ac.lk/club/nsbm-martial-arts-club/",
      },
      {
        id: 6,
        slug: "nsbm-netball-club",
        name: "Netball Club",
        category: "field",
        categoryLabel: "Court Sport",
        venue: "NSBM Outdoor Courts",
        schedule: "Mon & Thu · 4:00 PM – 6:00 PM",
        membersCount: 57,
        lead: "Netball Captain · Sports Council",
        summary: "Tactical court play, shooting accuracy, agility work, and inter-university netball fixtures.",
        officialUrl: "https://www.nsbm.ac.lk/club/nsbm-netball-club/",
      },
      {
        id: 7,
        slug: "nsbm-rugby-club",
        name: "Rugby Club",
        category: "field",
        categoryLabel: "Field Sport",
        venue: "NSBM Main Sports Field",
        schedule: "Mon, Wed & Fri · 4:15 PM – 6:30 PM",
        membersCount: 73,
        lead: "Rugby Captain · Sports Council",
        summary: "Contact and sevens rugby conditioning, set-piece execution, and inter-university tournament preparation.",
        officialUrl: "https://www.nsbm.ac.lk/club/nsbm-rugby-club/",
      },
      {
        id: 8,
        slug: "swimming-club",
        name: "Swimming Club",
        category: "combat-aquatic",
        categoryLabel: "Aquatics",
        venue: "NSBM Aquatic Centre",
        schedule: "Tue & Fri · 3:30 PM – 5:30 PM",
        membersCount: 49,
        lead: "Swimming Captain · Sports Council",
        summary: "Stroke mechanics, endurance sets, and time trials for freestyle, backstroke, breaststroke, and butterfly swimmers.",
        officialUrl: "https://www.nsbm.ac.lk/club/swimming-club/",
      },
      {
        id: 9,
        slug: "table-tennis-club",
        name: "Table Tennis Club",
        category: "indoor",
        categoryLabel: "Indoor Sport",
        venue: "NSBM Indoor Recreation Zone",
        schedule: "Wed & Fri · 4:00 PM – 6:00 PM",
        membersCount: 44,
        lead: "Table Tennis Lead · Sports Council",
        summary: "Spin control, rally consistency, ladder matches, and inter-faculty table tennis tournaments.",
        officialUrl: "https://www.nsbm.ac.lk/club/table-tennis-club/",
      },
      {
        id: 10,
        slug: "tennis-club",
        name: "Tennis Club",
        category: "field",
        categoryLabel: "Court Sport",
        venue: "NSBM Hard Courts",
        schedule: "Tue & Thu · 4:00 PM – 6:00 PM",
        membersCount: 38,
        lead: "Tennis Captain · Sports Council",
        summary: "Groundstroke consistency, serve drills, and singles/doubles match play across all skill tiers.",
        officialUrl: "https://www.nsbm.ac.lk/club/tennis-club/",
      },
      {
        id: 11,
        slug: "nsbm-volleyball-club",
        name: "Volleyball Club",
        category: "field",
        categoryLabel: "Court Sport",
        venue: "NSBM Sports Arena",
        schedule: "Mon, Wed & Fri · 4:00 PM – 6:00 PM",
        membersCount: 66,
        lead: "Volleyball Captain · Sports Council",
        summary: "Passing, setting, spiking, rotation drills, and inter-university volleyball squad training.",
        officialUrl: "https://www.nsbm.ac.lk/club/nsbm-volleyball-club/",
      },
    ];

    const FALLBACK_FIXTURES = [
      {
        id: 1,
        dateLabel: "Upcoming · Nov 28, 2026",
        title: "Inter-Faculty Athletics & Relay Trials",
        venue: "NSBM Athletics Track · 3:30 PM",
      },
      {
        id: 2,
        dateLabel: "Upcoming · Dec 03, 2026",
        title: "Campus Open Chess & Table Tennis Qualifiers",
        venue: "Student Centre & Indoor Zone · 2:00 PM",
      },
      {
        id: 3,
        dateLabel: "Upcoming · Dec 09, 2026",
        title: "Volleyball & Cricket Squad Selection Camp",
        venue: "NSBM Main Grounds · 4:00 PM",
      },
    ];

    const gridEl = document.getElementById("clubs-grid");
    const emptyEl = document.getElementById("clubs-empty");
    const searchInput = document.getElementById("club-search-input");
    const filterChips = Array.from(document.querySelectorAll(".sh-chip[data-category]"));
    const resetFiltersBtn = document.getElementById("reset-filters-btn");
    const syncStatusEl = document.getElementById("api-sync-status");
    const heroCountEl = document.getElementById("hero-club-count");
    const dirCountEl = document.getElementById("directory-club-count");
    const fixturesListEl = document.getElementById("upcoming-fixtures-list");
    const refreshFixturesBtn = document.getElementById("refresh-fixtures-btn");

    const modalEl = document.getElementById("club-modal");
    const closeModalBtn = document.getElementById("close-modal-btn");
    const detailViewEl = document.getElementById("modal-detail-view");
    const joinFormEl = document.getElementById("club-join-form");
    const joinClubSelect = document.getElementById("join-club-select");
    const switchToJoinBtn = document.getElementById("switch-to-join-btn");
    const backToDetailBtn = document.getElementById("back-to-detail-btn");
    const joinFeedbackEl = document.getElementById("join-feedback");
    const openJoinModalBtn = document.getElementById("open-join-modal-btn");
    const ctaJoinClubBtn = document.getElementById("cta-join-club-btn");

    const state = {
      clubs: [],
      category: "all",
      search: "",
      activeClubSlug: null,
      lastFocusedEl: null,
    };

    function escapeHtml(value = "") {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function setSyncStatus(text, isFallback = false) {
      if (!syncStatusEl) return;
      syncStatusEl.textContent = text;
      syncStatusEl.className = isFallback ? "badge badge-warning" : "badge badge-success";
      syncStatusEl.style.background = isFallback ? "#fef3c7" : "#e2f4e9";
      syncStatusEl.style.color = isFallback ? "#92400e" : "#136747";
    }

    async function fetchJson(url, options = {}) {
      const user = getUser();
      const headers = {
        Accept: "application/json",
        ...(user?.id ? { "X-User-Id": String(user.id) } : {}),
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      };

      const response = await fetch(url, {
        credentials: "include",
        ...options,
        headers,
      });

      const text = await response.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = {};
      }

      if (!response.ok || data.success === false) {
        const serverMsg = getErrorMessage(
          data,
          `Request failed (HTTP ${response.status}). Check that your PHP backend is running and accessible.`
        );
        throw new Error(serverMsg);
      }

      return data;
    }

    function mapCategory(sport = "") {
      const s = String(sport).toLowerCase();
      if (s.includes("swim") || s.includes("martial") || s.includes("aquatic") || s.includes("combat")) {
        return "combat-aquatic";
      }
      if (s.includes("badminton") || s.includes("chess") || s.includes("table tennis") || s.includes("indoor")) {
        return "indoor";
      }
      return "field";
    }

    function normalizeClubs(payload) {
      const rawList = Array.isArray(payload) ? payload : payload?.data ?? payload?.clubs;
      if (!Array.isArray(rawList) || rawList.length === 0) {
        throw new Error("Invalid clubs payload");
      }

      return rawList.map((club, index) => {
        const name = club.name || club.club_name || "Sports Club";
        const slug = club.slug || slugify(name) || `club-${index + 1}`;
        const fallback = FALLBACK_CLUBS.find((f) => f.slug === slug);
        const sport = club.sport || fallback?.categoryLabel || "Sports Club";

        return {
          id: Number(club.id ?? fallback?.id ?? index + 1),
          slug,
          name,
          category: club.category || mapCategory(sport),
          categoryLabel: club.category_label || club.categoryLabel || sport,
          venue: club.venue || club.location || fallback?.venue || "NSBM Sports Facilities",
          schedule: club.schedule || club.training_schedule || fallback?.schedule || "Weekly Campus Sessions",
          membersCount: club.member_count ?? club.members_count ?? club.membersCount ?? fallback?.membersCount ?? "Active",
          lead: club.president || club.lead || club.captain || fallback?.lead || "NSBM Sports Council",
          summary: club.description || club.summary || fallback?.summary || "Official NSBM student sports club.",
          image: resolveClubImage(slug, club.image || club.image_url),
          officialUrl: club.official_url || club.officialUrl || fallback?.officialUrl || "https://www.nsbm.ac.lk/sports-clubs/",
          myStatus: club.my_status || null,
        };
      });
    }

    async function loadClubs() {
      gridEl?.setAttribute("aria-busy", "true");
      try {
        const data = await fetchJson(ENDPOINTS.clubs);
        state.clubs = normalizeClubs(data);
        setSyncStatus("Live · clubs.php", false);
      } catch (_err) {
        state.clubs = FALLBACK_CLUBS.map((club) => ({
          ...club,
          image: resolveClubImage(club.slug),
        }));
        setSyncStatus("Preview · Local Data", true);
      } finally {
        gridEl?.setAttribute("aria-busy", "false");
      }

      const totalCount = state.clubs.length;
      if (heroCountEl) heroCountEl.textContent = String(totalCount);
      if (dirCountEl) dirCountEl.textContent = String(totalCount);
      if (gridEl) gridEl.dataset.count = String(totalCount);

      populateClubSelect();
      renderClubs();
    }

    function populateClubSelect() {
      if (!joinClubSelect) return;
      joinClubSelect.innerHTML = state.clubs
        .map(
          (club) =>
            `<option value="${escapeHtml(String(club.id))}">${escapeHtml(club.name)}</option>`
        )
        .join("");
    }

    function getFilteredClubs() {
      const q = state.search.trim().toLowerCase();
      return state.clubs.filter((club) => {
        const matchesCategory = state.category === "all" || club.category === state.category;
        const haystack = `${club.name} ${club.categoryLabel} ${club.venue} ${club.lead} ${club.summary}`.toLowerCase();
        const matchesSearch = !q || haystack.includes(q);
        return matchesCategory && matchesSearch;
      });
    }

    function renderClubs() {
      if (!gridEl) return;
      const filtered = getFilteredClubs();

      if (filtered.length === 0) {
        gridEl.innerHTML = "";
        if (emptyEl) emptyEl.hidden = false;
        return;
      }

      if (emptyEl) emptyEl.hidden = true;
      gridEl.innerHTML = filtered
        .map(
          (club) => `
          <li class="ab-clubcard">
            <div>
              ${
                club.image
                  ? `<img src="${escapeHtml(club.image)}" alt="${escapeHtml(club.name)}" decoding="async">`
                  : ""
              }
              <span class="badge badge-success" style="margin-bottom: 6px;">${escapeHtml(club.categoryLabel)}</span>
              <h3>${escapeHtml(club.name)}</h3>
              <p style="margin-bottom: 8px;">${escapeHtml(club.summary)}</p>
              <p class="muted">${escapeHtml(club.venue)} · ${escapeHtml(club.schedule)}</p>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px;">
              <button type="button" class="btn btn-primary" style="margin-top:0;" data-club-slug="${escapeHtml(club.slug)}">
                Details &amp; Join
              </button>
            </div>
          </li>
        `
        )
        .join("");
    }

    async function loadUpcomingFixtures() {
      if (!fixturesListEl) return;
      fixturesListEl.innerHTML = `<div class="feed-item"><strong>Loading upcoming fixtures...</strong></div>`;

      try {
        const data = await fetchJson(ENDPOINTS.upcomingFixtures);
        const raw = Array.isArray(data) ? data : data?.data ?? data?.fixtures;
        if (!Array.isArray(raw) || raw.length === 0) {
          throw new Error("No fixtures returned");
        }
        renderFixtures(
          raw.slice(0, 5).map((item, i) => ({
            id: item.id || i + 1,
            dateLabel: item.date_label || item.dateLabel || item.start_date || item.event_date || "Upcoming",
            title: item.title || item.name || "SportsHub Event",
            venue: item.venue || item.location || item.sport || "NSBM Campus",
          }))
        );
      } catch (_err) {
        renderFixtures(FALLBACK_FIXTURES);
      }
    }

    function renderFixtures(items) {
      if (!fixturesListEl) return;
      fixturesListEl.innerHTML = items
        .map(
          (f) => `
          <div class="feed-item">
            <span class="eyebrow">${escapeHtml(f.dateLabel)}</span>
            <strong>${escapeHtml(f.title)}</strong>
            <span class="muted">${escapeHtml(f.venue)}</span>
          </div>
        `
        )
        .join("");
    }

    function setText(id, value) {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    }

    function openModal({ mode = "detail", clubSlug = null, triggerEl = null } = {}) {
      if (!modalEl) return;
      state.lastFocusedEl = triggerEl || document.activeElement;

      const club =
        state.clubs.find((c) => c.slug === clubSlug) ||
        state.clubs.find((c) => c.slug === state.activeClubSlug) ||
        state.clubs[0];

      if (club) {
        state.activeClubSlug = club.slug;
        setText("modal-club-category", club.categoryLabel.toUpperCase());
        setText("modal-title", club.name);
        setText("modal-club-desc", club.summary);
        setText("modal-club-venue", club.venue);
        setText("modal-club-schedule", club.schedule);
        setText("modal-club-members", String(club.membersCount));
        setText("modal-club-lead", club.lead);

        const officialLink = document.getElementById("modal-official-link");
        if (officialLink) officialLink.href = club.officialUrl;

        if (joinClubSelect) {
          joinClubSelect.value = String(club.id);
        }
      }

      if (joinFeedbackEl) {
        joinFeedbackEl.textContent = "";
        joinFeedbackEl.style.color = "";
      }

      const isJoin = mode === "join";
      if (detailViewEl) detailViewEl.hidden = isJoin;
      if (joinFormEl) joinFormEl.hidden = !isJoin;
      if (backToDetailBtn) backToDetailBtn.hidden = !(isJoin && club);

      modalEl.hidden = false;
      closeModalBtn?.focus();
    }

    function closeModal() {
      if (!modalEl) return;
      modalEl.hidden = true;
      if (state.lastFocusedEl && typeof state.lastFocusedEl.focus === "function") {
        state.lastFocusedEl.focus();
      }
      state.lastFocusedEl = null;
    }

    async function handleJoinSubmit(event) {
      event.preventDefault();
      if (!joinFormEl || !joinFeedbackEl) return;

      const formData = new FormData(joinFormEl);
      const clubId = Number(formData.get("club_slug") || 0);
      const studentName = String(formData.get("student_name") || "").trim();
      const studentId = String(formData.get("student_id") || "").trim();
      const faculty = String(formData.get("faculty") || "");
      const email = String(formData.get("email") || "").trim();
      const notes = String(formData.get("notes") || "").trim();

      const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!clubId || !studentName || !studentId || !emailValid) {
        joinFeedbackEl.textContent = "Please select a club and enter a valid name, student ID, and email address.";
        joinFeedbackEl.style.color = "#b91c1c";
        return;
      }

      const submitBtn = document.getElementById("submit-join-btn");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Submitting...";
      }
      joinFeedbackEl.textContent = "";

      try {
        const res = await fetchJson(ENDPOINTS.joinClub, {
          method: "POST",
          body: JSON.stringify({
            club_id: clubId,
            student_name: studentName,
            student_id: studentId,
            faculty,
            email,
            notes,
          }),
        });

        const clubName = res?.data?.club_name || state.clubs.find((c) => c.id === clubId)?.name || "club";
        joinFeedbackEl.textContent =
          typeof res?.message === "string" && res.message
            ? res.message
            : `Membership request submitted for ${clubName}.`;
        joinFeedbackEl.style.color = "#136747";
        joinFormEl.reset();
        if (joinClubSelect) {
          joinClubSelect.value = String(clubId);
        }
        loadClubs();
      } catch (err) {
        joinFeedbackEl.textContent = getErrorMessage(err);
        joinFeedbackEl.style.color = "#b91c1c";
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Submit Application";
        }
      }
    }

    gridEl?.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-club-slug]");
      if (!trigger) return;
      openModal({ mode: "detail", clubSlug: trigger.dataset.clubSlug, triggerEl: trigger });
    });

    searchInput?.addEventListener("input", (event) => {
      state.search = event.target.value;
      renderClubs();
    });

    filterChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        filterChips.forEach((c) => c.classList.remove("is-active"));
        chip.classList.add("is-active");
        state.category = chip.dataset.category || "all";
        renderClubs();
      });
    });

    resetFiltersBtn?.addEventListener("click", () => {
      state.category = "all";
      state.search = "";
      if (searchInput) searchInput.value = "";
      filterChips.forEach((c) => c.classList.toggle("is-active", c.dataset.category === "all"));
      renderClubs();
    });

    refreshFixturesBtn?.addEventListener("click", loadUpcomingFixtures);

    openJoinModalBtn?.addEventListener("click", (e) => openModal({ mode: "join", triggerEl: e.currentTarget }));
    ctaJoinClubBtn?.addEventListener("click", (e) => openModal({ mode: "join", triggerEl: e.currentTarget }));
    switchToJoinBtn?.addEventListener("click", (e) =>
      openModal({ mode: "join", clubSlug: state.activeClubSlug, triggerEl: e.currentTarget })
    );
    backToDetailBtn?.addEventListener("click", (e) =>
      openModal({ mode: "detail", clubSlug: state.activeClubSlug, triggerEl: e.currentTarget })
    );

    closeModalBtn?.addEventListener("click", closeModal);
    modalEl?.addEventListener("click", (event) => {
      if (event.target.hasAttribute("data-close-modal")) {
        closeModal();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && modalEl && !modalEl.hidden) {
        closeModal();
      }
    });

    joinFormEl?.addEventListener("submit", handleJoinSubmit);

    loadClubs();
    loadUpcomingFixtures();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
