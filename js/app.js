/* =========================================================================
   VOICE — Application logic
   Gallery, Voice Lab (adjustable levers, blending, fingerprinting),
   custom voice library, prompt generation, server AI proxy calls.
   ========================================================================= */

(function () {
  "use strict";

  /* ---------- State ---------- */
  let selectedVoice = null;          /* the base voice object (built-in or custom) */
  let workingSettings = null;        /* live lever values driving prompts/output */
  let labMeta = null;                /* { blend: {id,name,weight}|null, fingerprint: {notes:[]}|null } */
  let customVoices = [];             /* committee-saved voices from the server */
  let customSponsorVoices = [];
  let activeArchetype = "All";
  let serverConfigured = null;
  let workIqConfigured = false;
  let pendingColor = "#475569";
  let pendingCustomPrompt = null;    /* AI-crafted prompt awaiting save (fingerprint flow) */
  let currentUser = { name: "", email: "", role: "member", marketingAccess: false, termsAccepted: false };
  let saveMode = { updateId: null }; /* save modal: null = create new, else update in place */
  let sponsorState = { selected: null, draft: null, updateId: null, color: "#475569" };
  let activeWorkspace = "voice";

  const SWATCHES = ["#C2410C", "#D97706", "#0D9488", "#059669", "#0369A1", "#1D4ED8", "#4338CA", "#7C3AED", "#BE185D", "#B91C1C", "#475569", "#334155"];

  /* ---------- Element refs ---------- */
  const $ = (id) => document.getElementById(id);
  const voiceGrid = $("voiceGrid");
  const voiceIntro = $("voiceIntro");
  const sponsorSection = $("sponsor-section");
  const sponsorFields = $("sponsorFields");
  const sponsorForm = $("sponsorForm");
  const sponsorOutput = $("sponsorOutput");
  const voiceMatchOutput = $("voiceMatchOutput");
  const archetypeFilter = $("archetypeFilter");
  const gallerySection = $("gallery-section");
  const profileSection = $("profile-section");
  const studioSection = $("studio-section");
  const redlinesSection = $("redlines-section");
  const voiceProfile = $("voiceProfile");
  const outputArea = $("outputArea");

  function allVoices() { return VOICES.concat(customVoices); }
  function allSponsorVoices() { return SPONSOR_PERSONAS.concat(customSponsorVoices); }
  function isCustom(v) { return !VOICES.some((b) => b.id === v.id); }
  function isCustomSponsor(v) { return !SPONSOR_PERSONAS.some((b) => b.id === v.id); }
  function dirtyCount() {
    if (!selectedVoice || !workingSettings) return 0;
    return Object.keys(workingSettings).filter((k) => workingSettings[k] !== selectedVoice.settings[k]).length;
  }

  /* =========================================================================
     PROMPT GENERATION
     ========================================================================= */

  function leverInstruction(lever, value) {
    if (value <= 15) return lever.instr.left;
    if (value <= 40) return "Lean left of center: " + lowerFirst(lever.instr.left) + " — but allow slight moderation.";
    if (value <= 60) return lever.instr.mid;
    if (value <= 85) return "Lean right of center: " + lowerFirst(lever.instr.right) + " — but stop short of the extreme.";
    return lever.instr.right;
  }

  function lowerFirst(s) {
    return s.charAt(0).toLowerCase() + s.slice(1);
  }

  function buildSystemPrompt(voice, settings) {
    /* Voices with an AI-crafted personal prompt use it verbatim — it already
       embeds the spectrum profile, style notes, red lines, and output rules. */
    if (voice.customPrompt) return voice.customPrompt;
    const s = settings || voice.settings;
    const lines = [];

    lines.push("You are a professional writing-voice specialist. Your job is to rewrite content the user provides so it speaks in a single, precisely defined voice: \"" + voice.name + ".\"");
    lines.push("");
    lines.push("== THE VOICE ==");
    lines.push(voice.essence || ("A custom voice named \"" + voice.name + ".\" The spectrum positions below are its authoritative definition; follow them precisely."));
    lines.push("");
    lines.push("== VOICE PROFILE (calibrated spectrum positions) ==");
    lines.push("Each instruction below positions this voice on a spectrum. Follow all of them simultaneously; together they define the voice.");
    lines.push("");

    CATEGORIES.forEach((cat) => {
      lines.push("-- " + cat.name.toUpperCase() + " --");
      cat.levers.forEach((lever) => {
        const value = s[lever.id] != null ? s[lever.id] : 50;
        lines.push("• " + lever.name + " (" + value + "/100, where 0 = " + plainLabel(lever.left) + ", 100 = " + plainLabel(lever.right) + "): " + leverInstruction(lever, value));
      });
      lines.push("");
    });

    if (voice.signatureMoves && voice.signatureMoves.length) {
      lines.push("== SIGNATURE MOVES (use these actively) ==");
      voice.signatureMoves.forEach((m) => lines.push("• " + m));
      lines.push("");
    }

    if (voice.neverDo && voice.neverDo.length) {
      lines.push("== THIS VOICE NEVER DOES ==");
      voice.neverDo.forEach((n) => lines.push("• " + n));
      lines.push("");
    }

    const liveNotes = (voice === selectedVoice && labMeta && labMeta.fingerprint && labMeta.fingerprint.notes.length)
      ? labMeta.fingerprint.notes
      : (voice.styleNotes || []);
    if (liveNotes.length) {
      lines.push("== PERSONAL STYLE NOTES (from the author's style fingerprint — honor these) ==");
      liveNotes.forEach((n) => lines.push("• " + n));
      lines.push("");
    }

    lines.push("== UNIVERSAL RED LINES (non-negotiable for every voice) ==");
    ANTI_PATTERNS.forEach((a) => lines.push("• " + a.name + ": " + a.rule));
    lines.push("");

    if (voice.sample) {
      lines.push("== REFERENCE SAMPLE ==");
      lines.push("Original: \"" + SAMPLE_BASE + "\"");
      lines.push("In this voice: \"" + voice.sample.replace(/\n/g, " / ") + "\"");
      if (settings && dirtyCount() > 0 && voice === selectedVoice) {
        lines.push("Note: the spectrum positions above have been custom-tuned away from this sample's original calibration. Where they conflict, the spectrum positions win.");
      }
      lines.push("");
    }

    lines.push("== OUTPUT RULES ==");
    lines.push("1. Preserve every fact, figure, name, and commitment in the source content. Add no new facts and remove no information unless the voice profile demands compression — and even then, keep all essential meaning.");
    lines.push("2. Rewrite the entire content in the voice; do not summarize unless the voice profile calls for compression.");
    lines.push("3. Match formatting to the voice profile (bullets vs. paragraphs, emphasis, headers).");
    lines.push("4. Output only the rewritten content. No preamble, no explanation, no quotation marks around the result.");

    return lines.join("\n");
  }

  function plainLabel(s) {
    return s.replace(/[“”]/g, "'");
  }

  function buildUserPrompt(voice, content) {
    return "Rewrite the following content in the \"" + voice.name + "\" voice as defined in your instructions.\n\n--- CONTENT START ---\n" + content + "\n--- CONTENT END ---";
  }

  /* =========================================================================
     SERVER API
     ========================================================================= */

  async function checkHealth() {
    const el = $("serverStatus");
    try {
      const res = await fetch("api/health");
      const data = await res.json();
      serverConfigured = !!data.configured;
      workIqConfigured = !!data.workIqConfigured;
      if (serverConfigured) {
        el.textContent = "AI connected · " + (data.model || "ready");
        el.classList.add("ok");
      } else {
        el.textContent = "AI not configured";
        el.classList.add("warn");
      }
    } catch {
      serverConfigured = false;
      workIqConfigured = false;
      el.textContent = "Server unreachable";
      el.classList.add("warn");
    }
    updateConnectionHint();
    updateWorkIqState();
  }

  async function loadIdentity() {
    try {
      const res = await fetch("api/me");
      if (!res.ok) return;
      const me = await res.json();
      if (me) {
        currentUser = {
          name: me.name || "",
          email: (me.email || "").toLowerCase(),
          role: me.role || "member",
          marketingAccess: !!me.marketingAccess,
          termsAccepted: !!me.termsAccepted
        };
      }
      if (me && me.name && me.name !== "Local development") {
        const badge = $("userBadge");
        const pills = [];
        if (currentUser.role === "owner") pills.push('<span class="role-pill">owner</span>');
        if (currentUser.marketingAccess) pills.push('<span class="role-pill role-marketing">marketing</span>');
        badge.innerHTML = esc(me.name) + (pills.length ? " " + pills.join(" ") : "") + ' · <a href="/.auth/logout">Sign out</a>';
        badge.hidden = false;
      }
      /* Re-render so role-gated controls appear/disappear */
      renderGallery();
      if (selectedVoice) renderProfile(selectedVoice);
      renderSponsorAccess();
    } catch { /* identity unavailable — header badge stays hidden */ }
  }

  function renderSponsorAccess() {
    if (!sponsorSection) return;
    if (currentUser.marketingAccess) {
      if (!sponsorState.selected) {
        const first = allSponsorVoices()[0];
        if (first) selectSponsorPersona(first, true);
      } else {
        renderSponsorFields(sponsorState.selected.profile || {});
        renderSponsorGallery();
      }
    } else {
      activeWorkspace = "voice";
      clearSponsorResult();
      clearVoiceMatchResult();
    }
    renderWorkspaceVisibility();
  }

  function setWorkspace(mode) {
    activeWorkspace = mode === "sponsor" && currentUser.marketingAccess ? "sponsor" : "voice";
    renderWorkspaceVisibility();
    const target = activeWorkspace === "sponsor" ? sponsorSection : gallerySection;
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderWorkspaceVisibility() {
    const sponsorMode = currentUser.marketingAccess && activeWorkspace === "sponsor";
    if (sponsorSection) sponsorSection.hidden = !sponsorMode;
    if (voiceIntro) voiceIntro.hidden = sponsorMode;
    if (gallerySection) gallerySection.hidden = sponsorMode;
    if (redlinesSection) redlinesSection.hidden = sponsorMode;
    if (profileSection) profileSection.hidden = sponsorMode || !selectedVoice;
    if (studioSection) studioSection.hidden = sponsorMode || !selectedVoice;

    const voiceBtn = $("voiceModeBtn");
    const sponsorBtn = $("sponsorJumpBtn");
    if (voiceBtn) {
      voiceBtn.hidden = !currentUser.marketingAccess;
      voiceBtn.classList.toggle("active", !sponsorMode);
    }
    if (sponsorBtn) {
      sponsorBtn.hidden = !currentUser.marketingAccess;
      sponsorBtn.classList.toggle("active", sponsorMode);
    }
    updateSponsorWorkflowContext();
  }

  function renderSponsorFields() {
    if (!sponsorFields) return;
    sponsorFields.innerHTML = "";
    SPONSOR_PROFILE.forEach((group) => {
      const wrap = document.createElement("div");
      wrap.className = "sponsor-field-group";
      const inner = [];
      inner.push("<h4>" + esc(group.title) + "</h4>");
      group.fields.forEach((field) => {
        if (field.type === "select") {
          inner.push('<label>' + esc(field.label) + '<select data-sponsor-field="' + esc(field.id) + '">' +
            field.options.map((opt) => '<option value="' + esc(opt) + '">' + esc(opt) + "</option>").join("") +
            "</select></label>");
        } else {
          inner.push('<label>' + esc(field.label) + '<input type="text" data-sponsor-field="' + esc(field.id) + '" placeholder="' + esc(field.placeholder || "") + '" /></label>');
        }
      });
      wrap.innerHTML = inner.join("");
      sponsorFields.appendChild(wrap);
    });
  }

  function collectSponsorProfile() {
    const profile = {};
    document.querySelectorAll("[data-sponsor-field]").forEach((el) => {
      profile[el.getAttribute("data-sponsor-field")] = el.value.trim();
    });
    return profile;
  }

  function renderSponsorOutput(persona) {
    renderSponsorResult(persona);
  }

  function clearSponsorOutput() {
    clearSponsorResult();
  }

  function renderSponsorPreview() {
    const persona = sponsorState.draft;
    if (!persona) return;
    sponsorState.color = persona.color || sponsorState.color || "#475569";
    $("spName").value = persona.name || "";
    $("spTagline").value = persona.tagline || "";
    $("spSummary").value = persona.summary || "";
    $("spChips").value = (persona.chips || []).join(", ");
    $("spInitialReaction").value = persona.initialReaction || "";
    $("spQuestions").value = (persona.likelyQuestions || []).join(" ");
    $("spConcerns").value = (persona.likelyConcerns || []).join(" ");
    $("spFraming").value = persona.recommendedFraming || "";
    $("spTone").value = persona.contentStrategy && persona.contentStrategy.tone || "";
    $("spLength").value = persona.contentStrategy && persona.contentStrategy.length || "";
    $("spStructure").value = persona.contentStrategy && persona.contentStrategy.structure || "";
    $("spProof").value = persona.contentStrategy && persona.contentStrategy.proof || "";
    $("spPreviewCard").style.setProperty("--voice-color", sponsorState.color);
    const holder = $("spProfileFields");
    holder.innerHTML = "";
    SPONSOR_PROFILE.forEach((group) => {
      const wrap = document.createElement("div");
      wrap.className = "sponsor-field-group";
      const inner = ["<h4>" + esc(group.title) + "</h4>"];
      group.fields.forEach((field) => {
        if (field.type === "select") {
          inner.push('<label>' + esc(field.label) + '<select data-sp-field="' + esc(field.id) + '">' +
            field.options.map((opt) => '<option value="' + esc(opt) + '">' + esc(opt) + "</option>").join("") +
            "</select></label>");
        } else {
          inner.push('<label>' + esc(field.label) + '<input type="text" data-sp-field="' + esc(field.id) + '" placeholder="' + esc(field.placeholder || "") + '" /></label>');
        }
      });
      wrap.innerHTML = inner.join("");
      holder.appendChild(wrap);
    });
    holder.querySelectorAll("[data-sp-field]").forEach((el) => {
      const key = el.getAttribute("data-sp-field");
      if (persona.profile && persona.profile[key] != null) {
        applyProfileFieldValue(el, persona.profile[key]);
      }
    });
    renderSponsorSwatches();
  }

  function renderSponsorSwatches() {
    const holder = $("spSwatches");
    if (!holder) return;
    holder.innerHTML = "";
    SWATCHES.forEach((c) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "swatch" + (c === sponsorState.color ? " active" : "");
      b.style.background = c;
      b.title = c;
      b.addEventListener("click", () => {
        sponsorState.color = c;
        $("spPreviewCard").style.setProperty("--voice-color", c);
        renderSponsorSwatches();
      });
      holder.appendChild(b);
    });
  }

  function openSponsorDescribe(existing) {
    if (!currentUser.marketingAccess) return;
    sponsorState.updateId = existing ? existing.id : null;
    sponsorState.draft = null;
    $("spDescription").value = existing
      ? ((existing.sourceDescription || existing.summary || existing.tagline || existing.name || "") + "\n\nUpdate this persona by describing the changes you want.")
      : "";
    $("spError").textContent = "";
    if (existing) {
      $("spInputTitle").textContent = "Redesign “" + existing.name + "”";
      $("spInputSub").textContent = "Describe the changes you want — VOICE will apply them to the existing sponsor persona and keep the rest coherent.";
      $("spGenerateBtn").textContent = "✦ Redesign with VOICE";
    } else {
      $("spInputTitle").textContent = "Describe a sponsor persona";
      $("spInputSub").textContent = "Describe the sponsor thinker you want VOICE to model — what kind of sponsor they are, how they react, what they care about, and what they never buy into.";
      $("spGenerateBtn").textContent = "✦ Design with VOICE";
    }
    $("sponsorDescribeModal").showModal();
  }

  async function generateSponsorPersona() {
    const description = $("spDescription").value.trim();
    if (description.length < 20) {
      $("spError").textContent = "Please describe the sponsor persona in a little more detail.";
      return;
    }
    const btn = $("spGenerateBtn");
    const oldLabel = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Designing…';
    try {
      const current = sponsorState.updateId ? allSponsorVoices().find((p) => p.id === sponsorState.updateId) : null;
      const res = await fetch("api/sponsor-describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, current })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || ("Server returned " + res.status));
      if (data.persona && !data.persona.sourceDescription) data.persona.sourceDescription = description;
      sponsorState.draft = data.persona;
      $("sponsorDescribeModal").close();
      $("spStepInput").hidden = true;
      $("spStepPreview").hidden = false;
      renderSponsorPreview();
      $("spSaveError").textContent = "";
      $("sponsorDescribeModal").showModal();
    } catch (e) {
      $("spError").textContent = "⚠ " + e.message;
    } finally {
      btn.disabled = false;
      btn.innerHTML = oldLabel;
    }
  }

  async function saveSponsorPersona() {
    if (!sponsorState.draft) return;
    const payload = {
      id: sponsorState.updateId || undefined,
      name: $("spName").value.trim(),
      archetype: sponsorState.draft.archetype || "",
      tagline: $("spTagline").value.trim(),
      summary: $("spSummary").value.trim(),
      profile: collectSponsorProfile(),
      sourceDescription: (sponsorState.draft && sponsorState.draft.sourceDescription) || $("spDescription").value.trim(),
      chips: parseTags($("spChips").value),
      initialReaction: $("spInitialReaction").value.trim(),
      likelyQuestions: String($("spQuestions").value || "").split(/[.\n]+/).map((s) => s.trim()).filter(Boolean).slice(0, 3),
      likelyConcerns: String($("spConcerns").value || "").split(/[.\n]+/).map((s) => s.trim()).filter(Boolean).slice(0, 3),
      recommendedFraming: $("spFraming").value.trim(),
      contentStrategy: {
        tone: $("spTone").value.trim(),
        length: $("spLength").value.trim(),
        structure: $("spStructure").value.trim(),
        proof: $("spProof").value.trim()
      },
      color: sponsorState.color,
      provenance: { source: sponsorState.updateId ? "redesign" : "describe", baseName: sponsorState.selected ? sponsorState.selected.name : "", described: true }
    };
    const btn = $("spSaveBtn");
    const oldLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      const res = await fetch("api/sponsor-persona", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || ("Server returned " + res.status));
      $("sponsorDescribeModal").close();
      sponsorState.updateId = null;
      sponsorState.draft = null;
      await loadSponsorVoices();
      const saved = allSponsorVoices().find((p) => p.id === data.persona.id);
      if (saved) selectSponsorPersona(saved);
    } catch (e) {
      $("spSaveError").textContent = "⚠ " + e.message;
    } finally {
      btn.disabled = false;
      btn.textContent = oldLabel;
    }
  }

  async function deleteSponsorPersona(persona) {
    if (!window.confirm('Delete the custom sponsor persona "' + persona.name + '" for everyone? This cannot be undone.')) return;
    try {
      const res = await fetch("api/sponsor-personas/" + encodeURIComponent(persona.id), { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || ("Server returned " + res.status));
      }
      if (sponsorState.selected && sponsorState.selected.id === persona.id) {
        sponsorState.selected = null;
        clearSponsorOutput();
        $("sponsorPersonaPanel").innerHTML = '<p class="placeholder">Pick a sponsor persona to see its profile here.</p>';
        $("editSponsorBtn").hidden = true;
      }
      await loadSponsorVoices();
    } catch (err) {
      window.alert("Could not delete: " + err.message);
    }
  }

  function renderSponsorResult(persona, selectedSponsor) {
    const sponsor = selectedSponsor || sponsorState.selected || {};
    const sponsorName = sponsor.name || persona.personaName || persona.name || "Sponsor archetype";
    const sponsorLabel = sponsorArchetype(sponsor);
    const strategy = persona.contentStrategy || {};
    const confidence = Number.isFinite(Number(persona.confidence)) ? Number(persona.confidence) : 0.5;
    const summary = persona.personaSummary || persona.summary || sponsor.summary || "";
    sponsorOutput.innerHTML =
      '<div class="sponsor-card">' +
      '<div class="sponsor-meta"><span class="card-archetype">Message rehearsal</span><span>' + esc(sponsorLabel) + '</span><span>analysis confidence ' + Math.round(confidence * 100) + "%</span></div>" +
      "<h4>Reaction from " + esc(sponsorName) + "</h4>" +
      (summary ? '<p class="analysis-note"><strong>AI read:</strong> ' + esc(summary) + "</p>" : "") +
      '<p><strong>Initial reaction:</strong> ' + esc(persona.initialReaction || "") + "</p>" +
      '<div class="sponsor-strategy">' +
      '<div><strong>Likely questions</strong><ul class="sponsor-list">' + (persona.likelyQuestions || []).map((q) => "<li>" + esc(q) + "</li>").join("") + "</ul></div>" +
      '<div><strong>Likely concerns</strong><ul class="sponsor-list">' + (persona.likelyConcerns || []).map((q) => "<li>" + esc(q) + "</li>").join("") + "</ul></div>" +
      "</div>" +
      '<p><strong>Recommended framing:</strong> ' + esc(persona.recommendedFraming || "") + "</p>" +
      '<div class="sponsor-strategy">' +
      '<div><strong>Tone</strong> ' + esc(strategy.tone || "") + "</div>" +
      '<div><strong>Length</strong> ' + esc(strategy.length || "") + "</div>" +
      '<div><strong>Structure</strong> ' + esc(strategy.structure || "") + "</div>" +
      '<div><strong>Proof</strong> ' + esc(strategy.proof || "") + "</div>" +
      "</div>" +
      "</div>";
    const copyBtn = $("copySponsorBtn");
    if (copyBtn) {
      copyBtn.hidden = false;
      copyBtn.dataset.text = JSON.stringify({ sponsor: currentSponsorMatchProfile(), reaction: persona }, null, 2);
    }
  }

  function clearSponsorResult() {
    sponsorOutput.innerHTML = '<p class="placeholder">Message rehearsal results will appear here without replacing the selected sponsor archetype.</p>';
    const copyBtn = $("copySponsorBtn");
    if (copyBtn) {
      copyBtn.hidden = true;
      copyBtn.dataset.text = "";
    }
  }

  async function analyzeSponsorPersona(e) {
    e.preventDefault();
    if (!currentUser.marketingAccess) return;
    const idea = $("sponsorIdea").value.trim();
    if (idea.length < 20) {
      sponsorOutput.innerHTML = '<p class="error">Please enter at least a sentence or two describing the idea you want to test.</p>';
      return;
    }
    const btn = $("sponsorAnalyzeBtn");
    const oldLabel = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Rehearsing…';
    sponsorOutput.innerHTML = '<p class="placeholder">Testing the message against ' + esc((sponsorState.selected && sponsorState.selected.name) || "the selected sponsor archetype") + "…</p>";
    try {
      const sponsor = currentSponsorMatchProfile();
      const res = await fetch("api/sponsor-reaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sponsor,
          profile: collectSponsorProfile(),
          idea,
          context: $("sponsorContext").value.trim()
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || ("Server returned " + res.status));
      if (!data.persona) throw new Error("The AI returned an empty sponsor persona.");
      if (!data.persona.initialReaction && !(data.persona.likelyQuestions || []).length && !(data.persona.likelyConcerns || []).length) {
        throw new Error("The AI response did not include a usable sponsor reaction. Please try again.");
      }
      renderSponsorResult(data.persona, sponsorState.selected);
    } catch (err) {
      sponsorOutput.innerHTML = '<p class="error">⚠ ' + esc(err.message) + "</p>";
      const copyBtn = $("copySponsorBtn");
      if (copyBtn) copyBtn.hidden = true;
    } finally {
      btn.disabled = false;
      btn.innerHTML = oldLabel;
    }
  }

  function isOwner() { return currentUser.role === "owner"; }

  function canModify(voice) {
    if (!isCustom(voice)) return false;
    if (isOwner()) return true;
    return !!currentUser.email && (voice.createdByEmail || "").toLowerCase() === currentUser.email;
  }

  async function loadCustomVoices() {
    try {
      const res = await fetch("api/voices");
      if (!res.ok) return;
      const data = await res.json();
      customVoices = Array.isArray(data.voices) ? data.voices : [];
    } catch {
      customVoices = [];
    }
    renderArchetypeFilter();
    renderGallery();
    refreshVoiceMatchSelect();
  }

  async function loadSponsorVoices() {
    try {
      const res = await fetch("api/sponsor-personas");
      if (!res.ok) return;
      const data = await res.json();
      customSponsorVoices = Array.isArray(data.personas) ? data.personas : [];
    } catch {
      customSponsorVoices = [];
    }
    renderSponsorGallery();
    if (sponsorState.selected) {
      const match = allSponsorVoices().find((p) => p.id === sponsorState.selected.id);
      if (match) selectSponsorPersona(match, false);
    }
  }

  function sponsorCards() {
    return allSponsorVoices();
  }

  function sponsorArchetype(persona) {
    if (persona.archetype) return persona.archetype;
    return isCustomSponsor(persona) ? "Custom sponsor" : "Sponsor thinker";
  }

  function renderSponsorGallery() {
    const grid = $("sponsorGrid");
    if (!grid) return;
    grid.innerHTML = "";
    sponsorCards().forEach((persona) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "voice-card" + (sponsorState.selected && sponsorState.selected.id === persona.id ? " selected" : "");
      card.style.setProperty("--voice-color", persona.color || "#475569");
      const chips = persona.chips || [];
      card.innerHTML =
        '<span class="card-archetype">' + esc(sponsorArchetype(persona)) + "</span>" +
        "<h3>" + esc(persona.name) + "</h3>" +
        '<p class="card-tagline">' + esc(persona.tagline || persona.summary || "") + "</p>" +
        '<div class="card-chips">' + chips.map((c) => "<span>" + esc(c) + "</span>").join("") + "</div>" +
        (isCustomSponsor(persona) ? '<span class="card-meta">by ' + esc(persona.createdBy || "Unknown") + "</span>" : "");
      if (isCustomSponsor(persona) && canModifySponsor(persona)) {
        const del = document.createElement("span");
        del.className = "card-delete";
        del.title = "Delete this custom sponsor persona";
        del.textContent = "×";
        del.addEventListener("click", (e) => {
          e.stopPropagation();
          deleteSponsorPersona(persona);
        });
        card.appendChild(del);
      }
      card.addEventListener("click", () => selectSponsorPersona(persona));
      grid.appendChild(card);
    });
  }

  function canModifySponsor(persona) {
    if (!isCustomSponsor(persona)) return false;
    if (isOwner()) return true;
    return !!currentUser.email && (persona.createdByEmail || "").toLowerCase() === currentUser.email;
  }

  function selectSponsorPersona(persona, populateForm = true) {
    sponsorState.selected = persona;
    sponsorState.color = persona.color || "#475569";
    sponsorState.draft = null;
    renderSponsorGallery();
    renderSponsorPanel(persona);
    clearSponsorResult();
    clearVoiceMatchResult();
    if (populateForm) {
      renderSponsorFields(persona.profile || {});
    }
    $("editSponsorBtn").hidden = !canModifySponsor(persona);
    updateSponsorWorkflowContext();
  }

  function renderSponsorPanel(persona) {
    const panel = $("sponsorPersonaPanel");
    if (!panel) return;
    const profile = persona.profile || {};
    panel.innerHTML =
      '<div class="sponsor-card" style="border-left-color:' + esc(persona.color || "#475569") + '">' +
      '<div class="sponsor-meta"><span class="card-archetype">' + esc(sponsorArchetype(persona)) + '</span><span>' + esc(isCustomSponsor(persona) ? "custom" : "built-in") + "</span></div>" +
      "<h4>" + esc(persona.name) + "</h4>" +
      '<p class="profile-desc">' + esc(persona.summary || persona.tagline || "") + "</p>" +
      '<div class="sponsor-strategy">' +
      '<div><strong>Demographic</strong> ' + esc(profile.ageRange || "") + " · " + esc(profile.incomeBand || "") + " · " + esc(profile.geography || "") + " · " + esc(profile.occupationLevel || "") + "</div>" +
      '<div><strong>Behavioral</strong> ' + esc(profile.engagementLevel || "") + " · " + esc(profile.tenure || "") + " · " + esc(profile.givingPattern || "") + " · " + esc(profile.channel || "") + " · " + esc(profile.interactionType || "") + "</div>" +
      '<div><strong>Psychographic</strong> ' + esc(profile.motivation || "") + " · " + esc(profile.emotionalTone || "") + " · " + esc(profile.trustLevel || "") + " · " + esc(profile.contentPreference || "") + " · " + esc(profile.engagementIntent || "") + "</div>" +
      '<div><strong>Relationship</strong> ' + esc(profile.sponsoredChildren || "") + " · " + esc(profile.letterBehavior || "") + " · " + esc(profile.giftActivity || "") + " · " + esc(profile.visitProgramEngagement || "") + "</div>" +
      "</div>" +
      "</div>";
  }

  function renderSponsorFields(profile = {}) {
    if (!sponsorFields) return;
    sponsorFields.innerHTML = "";
    SPONSOR_PROFILE.forEach((group) => {
      const wrap = document.createElement("div");
      wrap.className = "sponsor-field-group";
      const inner = [];
      inner.push("<h4>" + esc(group.title) + "</h4>");
      group.fields.forEach((field) => {
        if (field.type === "select") {
          inner.push('<label>' + esc(field.label) + '<select data-sponsor-field="' + esc(field.id) + '">' +
            field.options.map((opt) => '<option value="' + esc(opt) + '">' + esc(opt) + "</option>").join("") +
            "</select></label>");
        } else {
          inner.push('<label>' + esc(field.label) + '<input type="text" data-sponsor-field="' + esc(field.id) + '" placeholder="' + esc(field.placeholder || "") + '" /></label>');
        }
      });
      wrap.innerHTML = inner.join("");
      sponsorFields.appendChild(wrap);
    });
    sponsorFields.querySelectorAll("[data-sponsor-field]").forEach((el) => {
      const key = el.getAttribute("data-sponsor-field");
      if (!key) return;
      if (profile[key] != null) applyProfileFieldValue(el, profile[key]);
    });
  }

  function normalizedOptionValue(v) {
    return String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function applyProfileFieldValue(el, rawValue) {
    if (!el) return;
    const value = String(rawValue == null ? "" : rawValue).trim();
    if (el.tagName !== "SELECT") {
      el.value = value;
      return;
    }
    const options = Array.from(el.options || []);
    const exact = options.find((o) => o.value.toLowerCase() === value.toLowerCase());
    if (exact) {
      el.value = exact.value;
      return;
    }
    const norm = normalizedOptionValue(value);
    const fuzzy = options.find((o) => {
      const optNorm = normalizedOptionValue(o.value);
      return optNorm === norm || optNorm.includes(norm) || norm.includes(optNorm);
    });
    if (fuzzy) {
      el.value = fuzzy.value;
      return;
    }
    if (options.length > 0) el.value = options[0].value;
  }

  function collectSponsorProfile() {
    const profile = {};
    document.querySelectorAll("[data-sponsor-field]").forEach((el) => {
      profile[el.getAttribute("data-sponsor-field")] = el.value.trim();
    });
    return profile;
  }

  function refreshVoiceMatchSelect() {
    const select = $("matchVoiceSelect");
    if (!select) return;
    const previous = select.value || (selectedVoice && selectedVoice.id) || "";
    select.innerHTML = "";
    allVoices().forEach((voice) => {
      const opt = document.createElement("option");
      opt.value = voice.id;
      opt.textContent = voice.name;
      select.appendChild(opt);
    });
    if (previous && allVoices().some((voice) => voice.id === previous)) {
      select.value = previous;
    } else if (selectedVoice && allVoices().some((voice) => voice.id === selectedVoice.id)) {
      select.value = selectedVoice.id;
    }
    updateSponsorWorkflowContext();
  }

  function updateSponsorWorkflowContext() {
    const sponsorName = sponsorState.selected ? sponsorState.selected.name : "the selected sponsor archetype";
    const sponsorNodes = [$("matchSponsorName"), $("rehearsalSponsorName")];
    sponsorNodes.forEach((node) => {
      if (node) node.textContent = sponsorName;
    });
    const select = $("matchVoiceSelect");
    const selectedOption = select && select.options && select.options[select.selectedIndex];
    const voiceName = selectedOption ? selectedOption.textContent : (selectedVoice ? selectedVoice.name : "the selected voice");
    const voiceNode = $("rehearsalVoiceName");
    if (voiceNode) voiceNode.textContent = voiceName || "the selected voice";
  }

  function voiceMatchProfile(voice) {
    const settings = {};
    Object.keys(voice.settings || {}).forEach((key) => {
      const n = Number(voice.settings[key]);
      if (Number.isFinite(n)) settings[key] = n;
    });
    return {
      id: voice.id,
      name: voice.name,
      archetype: voiceArchetype(voice),
      tagline: voice.tagline || "",
      description: voice.description || "",
      essence: voice.essence || "",
      chips: voice.chips || [],
      signatureMoves: voice.signatureMoves || [],
      neverDo: voice.neverDo || [],
      settings
    };
  }

  function currentSponsorMatchProfile() {
    const persona = sponsorState.selected || {};
    return {
      id: persona.id || "",
      name: persona.name || "",
      archetype: sponsorArchetype(persona),
      tagline: persona.tagline || "",
      summary: persona.summary || "",
      profile: collectSponsorProfile(),
      sourceProfile: persona.profile || {},
      sourceDescription: persona.sourceDescription || "",
      chips: persona.chips || [],
      initialReaction: persona.initialReaction || "",
      likelyQuestions: persona.likelyQuestions || [],
      likelyConcerns: persona.likelyConcerns || [],
      recommendedFraming: persona.recommendedFraming || "",
      contentStrategy: persona.contentStrategy || persona.strategy || {}
    };
  }

  function renderVoiceMatchResult(result) {
    const rankings = Array.isArray(result.rankings) ? result.rankings : [];
    const advice = result.selectedVoiceAdvice || {};
    const rankingHtml = rankings.slice(0, 8).map((item, i) => {
      const score = Number.isFinite(Number(item.score)) ? Math.round(Number(item.score)) : 0;
      return '<div class="match-row">' +
        '<div class="match-row-head"><strong>' + (i + 1) + ". " + esc(item.voiceName || item.voiceId || "Voice") + '</strong><span class="score-pill">' + score + "%</span></div>" +
        '<div class="match-fit">' + esc(item.fit || "fit unknown") + "</div>" +
        '<p>' + esc(item.why || "") + "</p>" +
        (item.watchOut ? '<p class="match-watch"><strong>Watch:</strong> ' + esc(item.watchOut) + "</p>" : "") +
        "</div>";
    }).join("");
    const leverHtml = (Array.isArray(advice.levers) ? advice.levers : []).map((lever) => {
      const target = Number.isFinite(Number(lever.target)) ? " -> " + Math.round(Number(lever.target)) + "/100" : "";
      return '<li><strong>' + esc(lever.name || lever.id || "Lever") + '</strong> ' + esc(lever.direction || "tune") + target + " - " + esc(lever.why || "") + "</li>";
    }).join("");
    voiceMatchOutput.innerHTML =
      '<div class="sponsor-card">' +
      '<div class="sponsor-meta"><span class="card-archetype">Voice resonance</span><span>' + esc(result.sponsorArchetype || "Sponsor match") + "</span></div>" +
      "<h4>Best fit: " + esc(result.bestVoiceName || "Review rankings") + "</h4>" +
      '<p class="profile-desc">' + esc(result.summary || "") + "</p>" +
      '<div class="match-ranking">' + rankingHtml + "</div>" +
      '<div class="tuning-card">' +
      "<h4>Tune " + esc(advice.voiceName || "selected voice") + "</h4>" +
      '<p><strong>Current fit:</strong> ' + esc(advice.currentFit || "Not rated") + "</p>" +
      '<p>' + esc(advice.recommendation || "No lever changes recommended.") + "</p>" +
      (leverHtml ? '<ul class="lever-tune-list">' + leverHtml + "</ul>" : "") +
      "</div>" +
      "</div>";
    const copyBtn = $("copyVoiceMatchBtn");
    if (copyBtn) {
      copyBtn.hidden = false;
      copyBtn.dataset.text = JSON.stringify(result, null, 2);
    }
  }

  function clearVoiceMatchResult() {
    if (!voiceMatchOutput) return;
    voiceMatchOutput.innerHTML = '<p class="placeholder">Match results will show the best-fit voice, ranked alternatives, and lever tuning guidance for the selected voice.</p>';
    const copyBtn = $("copyVoiceMatchBtn");
    if (copyBtn) {
      copyBtn.hidden = true;
      copyBtn.dataset.text = "";
    }
  }

  async function analyzeVoiceMatch(e) {
    e.preventDefault();
    if (!currentUser.marketingAccess) return;
    const voices = allVoices();
    if (!sponsorState.selected) {
      voiceMatchOutput.innerHTML = '<p class="error">Select a sponsor persona before matching voices.</p>';
      return;
    }
    if (!voices.length) {
      voiceMatchOutput.innerHTML = '<p class="error">No voices are available to compare.</p>';
      return;
    }
    refreshVoiceMatchSelect();
    const targetVoiceId = $("matchVoiceSelect").value || (selectedVoice && selectedVoice.id) || voices[0].id;
    const btn = $("voiceMatchBtn");
    const oldLabel = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Matching…';
    voiceMatchOutput.innerHTML = '<p class="placeholder">Comparing voice resonance for ' + esc(sponsorState.selected.name) + "…</p>";
    try {
      const res = await fetch("api/sponsor-voice-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sponsor: currentSponsorMatchProfile(),
          voices: voices.map(voiceMatchProfile),
          targetVoiceId,
          idea: $("sponsorIdea").value.trim(),
          context: $("sponsorContext").value.trim(),
          levers: leverCatalog()
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || ("Server returned " + res.status));
      if (!data.match) throw new Error("The AI returned an empty voice match.");
      renderVoiceMatchResult(data.match);
    } catch (err) {
      voiceMatchOutput.innerHTML = '<p class="error">⚠ ' + esc(err.message) + "</p>";
      const copyBtn = $("copyVoiceMatchBtn");
      if (copyBtn) copyBtn.hidden = true;
    } finally {
      btn.disabled = false;
      btn.innerHTML = oldLabel;
    }
  }

  async function callServer(voice, content) {
    const res = await fetch("api/transform", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system: buildSystemPrompt(voice, workingSettings),
        user: buildUserPrompt(voice, content),
        temperature: voice.temperature
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ("Server returned " + res.status));
    if (!data.text) throw new Error("Server returned an empty response.");
    return data.text;
  }

  async function callWorkIqServer(voice, content) {
    const query = $("workIqQuery").value.trim();
    const res = await fetch("api/work-context-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system: buildSystemPrompt(voice, workingSettings),
        user: buildUserPrompt(voice, content),
        content,
        contextQuery: query,
        voiceName: voice.name,
        temperature: voice.temperature
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ("Server returned " + res.status));
    if (!data.text) throw new Error("Server returned an empty response.");
    return data;
  }

  function isWorkIqEnabled() {
    const el = $("workIqEnabled");
    return !!(el && el.checked && !el.disabled);
  }

  function updateWorkIqState() {
    const enabled = $("workIqEnabled");
    const status = $("workIqStatus");
    const options = $("workIqOptions");
    if (!enabled || !status || !options) return;
    enabled.disabled = !workIqConfigured;
    if (workIqConfigured) {
      status.textContent = "Work IQ connected. Your query is sent server-side and grounded in your Microsoft 365 context.";
      status.classList.add("ok");
      status.classList.remove("warn");
    } else {
      enabled.checked = false;
      status.textContent = "Work IQ is available in VOICE but not configured for this deployment yet.";
      status.classList.add("warn");
      status.classList.remove("ok");
    }
    options.hidden = !enabled.checked || enabled.disabled;
  }

  function clearWorkIqContext() {
    const panel = $("workIqContextPanel");
    if (!panel) return;
    panel.hidden = true;
    panel.innerHTML = "";
  }

  function renderWorkIqContext(context) {
    const panel = $("workIqContextPanel");
    if (!panel) return;
    const summary = context && context.summary ? String(context.summary) : "";
    const refs = Array.isArray(context && context.references) ? context.references : [];
    if (!summary && !refs.length) {
      clearWorkIqContext();
      return;
    }
    panel.hidden = false;
    panel.innerHTML =
      "<h4>Work IQ context used</h4>" +
      (summary ? '<p class="workiq-summary">' + esc(summary) + "</p>" : "") +
      (refs.length ? '<div class="workiq-refs">' + refs.map((r) => {
        const title = esc(r.title || r.url || r.source || "Reference");
        const source = r.source ? '<span class="workiq-ref-source">' + esc(r.source) + "</span>" : "";
        const url = /^https?:\/\//i.test(String(r.url || "")) ? String(r.url) : "";
        const link = url ? '<a href="' + esc(url) + '" target="_blank" rel="noreferrer">' + title + "</a>" : "<strong>" + title + "</strong>";
        const snippet = r.snippet ? "<p>" + esc(r.snippet) + "</p>" : "";
        return '<div class="workiq-ref">' + link + source + snippet + "</div>";
      }).join("") + "</div>" : "");
  }

  /* =========================================================================
     RENDERING — GALLERY
     ========================================================================= */

  function renderArchetypeFilter() {
    const archetypes = ["All", "Operator", "Consultant", "Thought Leader"];
    if (customVoices.length) archetypes.push("Custom");
    if (activeArchetype === "Custom" && !customVoices.length) activeArchetype = "All";
    archetypeFilter.innerHTML = "";
    archetypes.forEach((a) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "filter-chip" + (a === activeArchetype ? " active" : "");
      btn.textContent = a === "All" ? "All voices" : (a === "Custom" ? "Custom" : a + "s");
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", a === activeArchetype ? "true" : "false");
      btn.addEventListener("click", () => {
        activeArchetype = a;
        renderArchetypeFilter();
        renderGallery();
      });
      archetypeFilter.appendChild(btn);
    });
  }

  function voiceArchetype(v) { return isCustom(v) ? "Custom" : v.archetype; }

  function renderGallery() {
    voiceGrid.innerHTML = "";
    allVoices().filter((v) => activeArchetype === "All" || voiceArchetype(v) === activeArchetype).forEach((voice) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "voice-card" + (selectedVoice && selectedVoice.id === voice.id ? " selected" : "");
      card.style.setProperty("--voice-color", voice.color);

      const custom = isCustom(voice);
      const chips = custom ? customChips(voice) : voice.chips;
      card.innerHTML =
        '<span class="card-archetype">' + esc(voiceArchetype(voice)) + "</span>" +
        "<h3>" + esc(voice.name) + "</h3>" +
        '<p class="card-tagline">' + esc(voice.tagline || (custom ? "Committee-defined voice" : "")) + "</p>" +
        '<div class="card-chips">' + chips.map((c) => "<span>" + esc(c) + "</span>").join("") + "</div>" +
        (custom ? '<span class="card-meta">by ' + esc(voice.createdBy || "Unknown") + "</span>" : "");

      if (custom && canModify(voice)) {
        const del = document.createElement("span");
        del.className = "card-delete";
        del.title = "Delete this custom voice";
        del.textContent = "×";
        del.addEventListener("click", (e) => {
          e.stopPropagation();
          deleteVoice(voice);
        });
        card.appendChild(del);
      }

      card.addEventListener("click", () => selectVoice(voice));
      voiceGrid.appendChild(card);
    });
    refreshVoiceMatchSelect();
  }

  function customChips(voice) {
    const chips = [];
    const p = voice.provenance;
    if (voice.chips && voice.chips.length) chips.push(...voice.chips);
    if (p && p.described) chips.push("Designed with VOICE");
    if (voice.customPrompt) chips.push("Personal prompt");
    if (p && p.blendName) chips.push("Blend: " + p.baseName + " + " + p.blendName);
    else if (p && p.baseName && !p.described) chips.push("Based on " + p.baseName);
    if (p && p.fingerprint) chips.push("Style fingerprint");
    if (!chips.length) chips.push("Custom");
    return chips;
  }

  /* =========================================================================
     RENDERING — PROFILE & VOICE LAB
     ========================================================================= */

  function selectVoice(voice) {
    selectedVoice = voice;
    workingSettings = Object.assign({}, voice.settings);
    labMeta = { blend: null, fingerprint: voice.styleNotes && voice.styleNotes.length ? { notes: voice.styleNotes.slice() } : null };
    renderGallery();
    renderProfile(voice);
    renderWorkspaceVisibility();
    refreshVoiceMatchSelect();
    updateStudioLabels();
    clearWorkIqContext();
    document.documentElement.style.setProperty("--accent", voice.color);
    profileSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function updateStudioLabels() {
    const suffix = !selectedVoice.customPrompt && dirtyCount() > 0 ? " (tuned)" : "";
    $("transformVoiceName").textContent = selectedVoice.name + suffix;
    $("outputVoiceName").textContent = selectedVoice.name + suffix;
  }

  function renderProfile(voice) {
    const wrap = document.createElement("div");
    wrap.className = "profile";

    /* Overview card */
    const overview = document.createElement("div");
    overview.className = "profile-overview";
    overview.style.setProperty("--voice-color", voice.color);

    const custom = isCustom(voice);
    let cols = "";
    if (voice.sample || (voice.whenToUse && voice.whenToUse.length) || (voice.neverDo && voice.neverDo.length)) {
      cols = '<div class="profile-cols">' +
        (voice.sample ? '<div><h4>Sounds like</h4><blockquote class="voice-sample">' + esc(voice.sample).replace(/\n/g, "<br>") + "</blockquote></div>" : "") +
        '<div>' +
        (voice.whenToUse && voice.whenToUse.length ? "<h4>Best for</h4><ul>" + voice.whenToUse.map((w) => "<li>" + esc(w) + "</li>").join("") + "</ul>" : "") +
        (voice.neverDo && voice.neverDo.length ? "<h4>Never does</h4><ul class='never-list'>" + voice.neverDo.map((n) => "<li>" + esc(n) + "</li>").join("") + "</ul>" : "") +
        "</div></div>";
    }
    overview.innerHTML =
      '<div class="profile-title"><h3>' + esc(voice.name) + '</h3><span class="card-archetype">' + esc(voiceArchetype(voice)) + "</span></div>" +
      '<p class="profile-desc">' + esc(voice.description || voice.essence || "") + "</p>" +
      (custom && voice.styleNotes && voice.styleNotes.length
        ? '<div class="fp-notes"><h4>Style fingerprint</h4><ul>' + voice.styleNotes.map((n) => "<li>" + esc(n) + "</li>").join("") + "</ul></div>"
        : "") +
      cols;
    wrap.appendChild(overview);

    /* Voice Lab toolbar */
    wrap.appendChild(renderLab(voice));

    /* Spectrum categories */
    CATEGORIES.forEach((cat, i) => {
      const details = document.createElement("details");
      details.className = "spectrum-cat";
      if (i === 0) details.open = true;
      const summary = document.createElement("summary");
      summary.innerHTML = "<span>" + esc(cat.name) + '</span><span class="cat-sub">' + esc(cat.subtitle) + "</span>";
      details.appendChild(summary);

      const inner = document.createElement("div");
      inner.className = "cat-inner";

      cat.levers.forEach((lever) => {
        inner.appendChild(renderLeverRow(lever, voice));
      });

      const disc = document.createElement("p");
      disc.className = "discussion";
      disc.innerHTML = "💬 <em>Committee discussion: &ldquo;" + esc(cat.discussion) + "&rdquo;</em>";
      inner.appendChild(disc);

      details.appendChild(inner);
      wrap.appendChild(details);
    });

    voiceProfile.innerHTML = "";
    voiceProfile.appendChild(wrap);
    updateLabState();
  }

  function renderLab(voice) {
    const lab = document.createElement("div");
    lab.className = "voice-lab";

    if (voice.customPrompt) {
      /* Prompt-driven voice: the AI-crafted prompt is authoritative, not the sliders */
      const editable = canModify(voice);
      lab.innerHTML =
        '<div class="lab-row lab-head-row">' +
        '<div><h3>Personal prompt voice</h3><p class="lab-sub">This voice uses an AI-crafted personal prompt built from a style fingerprint. The sliders below are reference only — edit the prompt itself to change the voice.</p></div>' +
        "</div>" +
        '<div class="lab-row lab-tools">' +
        '<div class="lab-tool lab-tool-right">' +
        (isOwner() ? '<button class="btn btn-ghost btn-sm" id="fingerprintBtn" type="button">✦ New fingerprint</button>' : "") +
        (isOwner() ? '<button class="btn btn-ghost btn-sm" id="publishBtn" type="button">🚀 Publish as M365 agent…</button>' : "") +
        (editable ? '<button class="btn btn-primary btn-sm" id="editPromptBtn" type="button">Edit personal prompt…</button>' : "") +
        "</div></div>";
      const editBtn = lab.querySelector("#editPromptBtn");
      if (editBtn) editBtn.addEventListener("click", () => openFpResult({ mode: "edit", editVoice: voice }));
      const fpBtn = lab.querySelector("#fingerprintBtn");
      if (fpBtn) fpBtn.addEventListener("click", openFingerprint);
      const pubBtn = lab.querySelector("#publishBtn");
      if (pubBtn) pubBtn.addEventListener("click", () => openPublish(voice));
      return lab;
    }

    const editable = canModify(voice);
    lab.innerHTML =
      '<div class="lab-row lab-head-row">' +
      '<div><h3>Voice Lab</h3><p class="lab-sub">Drag any slider below — your changes feed directly into the prompt and the transformed output.</p></div>' +
      '<span class="lab-dirty" id="labDirty"></span>' +
      "</div>" +
      '<div class="lab-row lab-tools">' +
      '<div class="lab-tool"><label for="blendWith">Blend with</label>' +
      '<select id="blendWith"></select>' +
      '<input type="range" id="blendWeight" min="0" max="100" value="50" />' +
      '<span class="blend-pct" id="blendPct">50%</span>' +
      '<button class="btn btn-ghost btn-sm" id="applyBlendBtn" type="button">Apply blend</button></div>' +
      '<div class="lab-tool lab-tool-right">' +
      (isOwner() ? '<button class="btn btn-ghost btn-sm" id="fingerprintBtn" type="button">✦ My style fingerprint</button>' : "") +
      (isOwner() ? '<button class="btn btn-ghost btn-sm" id="publishBtn" type="button">🚀 Publish as M365 agent…</button>' : "") +
      '<button class="btn btn-ghost btn-sm" id="resetLabBtn" type="button">Reset</button>' +
      (editable ? '<button class="btn btn-ghost btn-sm" id="redesignBtn" type="button">✦ Redesign with VOICE…</button>' : "") +
      (editable ? '<button class="btn btn-primary btn-sm" id="updateVoiceBtn" type="button">Update this voice…</button>' : "") +
      '<button class="btn ' + (editable ? "btn-ghost" : "btn-primary") + ' btn-sm" id="saveVoiceBtn" type="button">Save as new voice…</button>' +
      "</div></div>";

    const select = lab.querySelector("#blendWith");
    allVoices().filter((v) => v.id !== voice.id).forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = v.name;
      select.appendChild(opt);
    });

    lab.querySelector("#blendWeight").addEventListener("input", (e) => {
      lab.querySelector("#blendPct").textContent = e.target.value + "%";
    });
    lab.querySelector("#applyBlendBtn").addEventListener("click", applyBlend);
    const fpBtn2 = lab.querySelector("#fingerprintBtn");
    if (fpBtn2) fpBtn2.addEventListener("click", openFingerprint);
    lab.querySelector("#resetLabBtn").addEventListener("click", resetLab);
    lab.querySelector("#saveVoiceBtn").addEventListener("click", () => openSaveModal());
    const updBtn = lab.querySelector("#updateVoiceBtn");
    if (updBtn) updBtn.addEventListener("click", () => openSaveModal(null, voice));
    const rdBtn = lab.querySelector("#redesignBtn");
    if (rdBtn) rdBtn.addEventListener("click", () => openDescribe(voice));
    const pubBtn2 = lab.querySelector("#publishBtn");
    if (pubBtn2) pubBtn2.addEventListener("click", () => openPublish(voice));
    return lab;
  }

  function updateLabState() {
    const el = $("labDirty");
    if (!el) return;
    const n = dirtyCount();
    const parts = [];
    if (labMeta && labMeta.blend) parts.push("blended with " + labMeta.blend.name + " (" + labMeta.blend.weight + "%)");
    if (labMeta && labMeta.fingerprint && !isCustom(selectedVoice)) parts.push("fingerprint applied");
    if (n > 0) parts.push(n + " lever" + (n === 1 ? "" : "s") + " adjusted");
    el.textContent = parts.length ? "● " + parts.join(" · ") : "Matching the base voice";
    el.classList.toggle("dirty", n > 0);
    updateStudioLabels();
  }

  function renderLeverRow(lever, voice) {
    const row = document.createElement("div");
    row.className = "lever-row";

    const name = document.createElement("div");
    name.className = "lever-name";
    name.innerHTML = esc(lever.name) + ' <span class="lever-val" data-val-for="' + lever.id + '">' + workingSettings[lever.id] + "</span>";
    row.appendChild(name);

    const track = document.createElement("div");
    track.className = "lever-track-wrap";

    const stack = document.createElement("div");
    stack.className = "slider-stack";

    const ghosts = document.createElement("div");
    ghosts.className = "ghost-layer";
    allVoices().forEach((v) => {
      if (v.id === voice.id) return;
      if (v.settings[lever.id] == null) return;
      const dot = document.createElement("span");
      dot.className = "dot ghost";
      dot.style.left = v.settings[lever.id] + "%";
      dot.style.setProperty("--dot-color", v.color);
      dot.title = v.name + " · " + v.settings[lever.id] + "/100";
      ghosts.appendChild(dot);
    });

    /* Base-voice marker: where the unmodified voice sits */
    const baseDot = document.createElement("span");
    baseDot.className = "dot base-marker";
    baseDot.style.left = voice.settings[lever.id] + "%";
    baseDot.title = voice.name + " (base) · " + voice.settings[lever.id] + "/100";
    ghosts.appendChild(baseDot);

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.value = workingSettings[lever.id];
    slider.className = "lever-slider";
    slider.style.setProperty("--dot-color", voice.color);
    slider.setAttribute("aria-label", lever.name);
    slider.dataset.lever = lever.id;
    slider.addEventListener("input", () => {
      workingSettings[lever.id] = Number(slider.value);
      const badge = voiceProfile.querySelector('[data-val-for="' + lever.id + '"]');
      if (badge) badge.textContent = slider.value;
      updateLabState();
    });

    stack.appendChild(ghosts);
    stack.appendChild(slider);

    const labels = document.createElement("div");
    labels.className = "lever-labels";
    labels.innerHTML = "<span>" + esc(lever.left) + "</span><span>" + esc(lever.right) + "</span>";

    track.appendChild(stack);
    track.appendChild(labels);
    row.appendChild(track);
    return row;
  }

  function refreshSliders() {
    voiceProfile.querySelectorAll(".lever-slider").forEach((slider) => {
      const id = slider.dataset.lever;
      slider.value = workingSettings[id];
      const badge = voiceProfile.querySelector('[data-val-for="' + id + '"]');
      if (badge) badge.textContent = workingSettings[id];
    });
    updateLabState();
  }

  /* =========================================================================
     LAB ACTIONS — blend, fingerprint, reset, save, delete
     ========================================================================= */

  function applyBlend() {
    const otherId = $("blendWith").value;
    const weight = Number($("blendWeight").value);
    const other = allVoices().find((v) => v.id === otherId);
    if (!other) return;
    Object.keys(selectedVoice.settings).forEach((k) => {
      const a = selectedVoice.settings[k];
      const b = other.settings[k] != null ? other.settings[k] : a;
      workingSettings[k] = Math.round(a * (1 - weight / 100) + b * (weight / 100));
    });
    labMeta.blend = { id: other.id, name: other.name, weight };
    refreshSliders();
  }

  function resetLab() {
    workingSettings = Object.assign({}, selectedVoice.settings);
    labMeta.blend = null;
    if (!isCustom(selectedVoice)) labMeta.fingerprint = null;
    refreshSliders();
  }

  /* ---------- Fingerprint wizard (free-text) ---------- */

  let fpResult = null; /* { mode: 'fingerprint'|'edit', baseVoice, editVoice } */

  function openFingerprint() {
    if (!isOwner()) return;
    /* First use requires signing the hyper-personalization terms */
    if (!currentUser.termsAccepted) {
      $("termsAgree").checked = false;
      $("termsError").textContent = "";
      $("termsModal").showModal();
      return;
    }
    const holder = $("fpQuestions");
    holder.innerHTML = "";
    FP_QUESTIONS.forEach((q, qi) => {
      const block = document.createElement("div");
      block.className = "fp-q";
      const dims = q.dims.map((d) => LEVER_INDEX[d] ? LEVER_INDEX[d].name : d);
      block.innerHTML =
        '<label class="fp-q-label" for="fp-a-' + q.id + '">' + (qi + 1) + ". " + esc(q.q) + "</label>" +
        '<span class="fp-dims">Probes: ' + esc(dims.join(" · ")) + "</span>" +
        '<textarea id="fp-a-' + q.id + '" class="fp-answer" rows="3" data-q="' + q.id + '" placeholder="' + esc(q.ph || "Answer in your own words…") + '"></textarea>';
      holder.appendChild(block);
    });

    $("fpSample").value = "";
    const baseSel = $("fpBase");
    baseSel.innerHTML = "";
    allVoices().forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = v.name;
      if (selectedVoice && v.id === selectedVoice.id) opt.selected = true;
      baseSel.appendChild(opt);
    });
    $("fpHint").textContent = "";
    $("fpModal").showModal();
  }

  async function acceptTerms() {
    if (!$("termsAgree").checked) {
      $("termsError").textContent = "Please check the box to confirm you agree.";
      return;
    }
    const btn = $("termsAcceptBtn");
    btn.disabled = true;
    try {
      const res = await fetch("api/terms/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agree: true })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || ("Server returned " + res.status));
      currentUser.termsAccepted = true;
      $("termsModal").close();
      openFingerprint();
    } catch (e) {
      $("termsError").textContent = "⚠ " + e.message;
    } finally {
      btn.disabled = false;
    }
  }

  function dimDescriptions(q) {
    return q.dims.map((d) => {
      const L = LEVER_INDEX[d];
      if (!L) return d;
      return L.category + " — " + L.name + " (0 = " + plainLabel(L.left) + " … 100 = " + plainLabel(L.right) + ")";
    });
  }

  async function generateFingerprint() {
    const base = allVoices().find((v) => v.id === $("fpBase").value);
    if (!base) return;

    /* Require every question answered — the analysis needs the full picture */
    const qa = [];
    let missing = 0;
    FP_QUESTIONS.forEach((q) => {
      const el = document.querySelector('.fp-answer[data-q="' + q.id + '"]');
      const answer = (el && el.value || "").trim();
      if (!answer) {
        missing++;
        if (el) el.classList.add("missing");
        return;
      }
      if (el) el.classList.remove("missing");
      qa.push({ question: q.q, dimensions: dimDescriptions(q), answer });
    });
    if (missing > 0) {
      $("fpHint").textContent = "Please answer all " + FP_QUESTIONS.length + " questions — " + missing + " still blank. Every dimension matters for the personalization.";
      return;
    }
    $("fpHint").textContent = "";

    const btn = $("fpGenerateBtn");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Crafting your prompt…';
    try {
      const res = await fetch("api/fingerprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceName: base.name,
          basePrompt: buildSystemPrompt(base, base.settings),
          qa,
          sample: $("fpSample").value.trim()
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || ("Server returned " + res.status));
      if (!data.prompt) throw new Error("The AI returned an empty prompt.");
      $("fpModal").close();
      openFpResult({ mode: "fingerprint", baseVoice: base, promptText: data.prompt });
    } catch (e) {
      $("fpHint").textContent = "⚠ " + e.message;
    } finally {
      btn.disabled = false;
      btn.textContent = "Generate my personal prompt";
    }
  }

  /* ---------- Fingerprint result / prompt editor modal ---------- */

  function renderHighlighted(text) {
    return esc(text).replace(/⟦([\s\S]*?)⟧/g, "<mark>$1</mark>");
  }

  function openFpResult(opts) {
    fpResult = opts;
    const editor = $("fprEditor");
    if (opts.mode === "fingerprint") {
      $("fprTitle").textContent = "Your personalized voice prompt";
      $("fprSub").innerHTML = 'Started from <strong>' + esc(opts.baseVoice.name) + '</strong> — <mark class="legend-mark">highlighted text</mark> shows what changed based on your answers. Edit any part directly before saving.';
      $("fprSaveBtn").textContent = "Save as custom voice…";
      $("fprBackBtn").textContent = "Back to questions";
      editor.innerHTML = renderHighlighted(opts.promptText);
    } else {
      $("fprTitle").textContent = "Edit personal prompt — " + opts.editVoice.name;
      $("fprSub").textContent = "This prompt is sent verbatim as the system prompt when transforming with this voice. Edit freely and save.";
      $("fprSaveBtn").textContent = "Save changes";
      $("fprBackBtn").textContent = "Cancel";
      editor.textContent = opts.editVoice.customPrompt || "";
    }
    $("fprError").textContent = "";
    $("fpResultModal").showModal();
    editor.scrollTop = 0;
  }

  function fprCleanText() {
    return $("fprEditor").innerText.replace(/[⟦⟧]/g, "").replace(/\n{3,}/g, "\n\n").trim();
  }

  function onFprBack() {
    $("fpResultModal").close();
    if (fpResult && fpResult.mode === "fingerprint") $("fpModal").showModal();
    fpResult = fpResult && fpResult.mode === "fingerprint" ? fpResult : null;
  }

  async function onFprSave() {
    if (!fpResult) return;
    const text = fprCleanText();
    if (!text) { $("fprError").textContent = "The prompt is empty."; return; }

    if (fpResult.mode === "fingerprint") {
      pendingCustomPrompt = text;
      $("fpResultModal").close();
      openSaveModal(fpResult.baseVoice);
      return;
    }

    /* edit mode: update the existing custom voice in place */
    const v = fpResult.editVoice;
    const btn = $("fprSaveBtn");
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      const res = await fetch("api/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: v.id, name: v.name, tagline: v.tagline, color: v.color,
          temperature: v.temperature, settings: v.settings, essence: v.essence,
          styleNotes: v.styleNotes || [], provenance: v.provenance, customPrompt: text
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || ("Server returned " + res.status));
      $("fpResultModal").close();
      await loadCustomVoices();
      const updated = customVoices.find((x) => x.id === v.id);
      if (updated) selectVoice(updated);
    } catch (e) {
      $("fprError").textContent = "⚠ " + e.message;
    } finally {
      btn.disabled = false;
      btn.textContent = "Save changes";
    }
  }

  /* ---------- Describe a voice (AI persona design) ---------- */

  let dvPersona = null;
  let dvColor = "#475569";
  let dvRedesign = null; /* existing custom voice being redesigned, or null for create */

  function leverCatalog() {
    const out = [];
    CATEGORIES.forEach((cat) => cat.levers.forEach((l) => {
      out.push({ id: l.id, name: l.name, category: cat.name, left: plainLabel(l.left), right: plainLabel(l.right) });
    }));
    return out;
  }

  function openDescribe(redesignVoice) {
    dvPersona = null;
    dvRedesign = redesignVoice || null;
    $("dvDescription").value = "";
    $("dvError").textContent = "";
    if (dvRedesign) {
      $("dvInputTitle").textContent = "Redesign “" + dvRedesign.name + "”";
      $("dvInputSub").textContent = "Describe the changes you want in plain words — VOICE will apply them to the existing persona and keep everything else intact.";
      $("dvDescription").placeholder = "e.g. Make it less formal, add more energy, and stop using bullet lists. It should also assume the reader already knows our terminology…";
      $("dvGenerateBtn").innerHTML = "✦ Redesign with VOICE";
    } else {
      $("dvInputTitle").textContent = "Describe a voice";
      $("dvInputSub").textContent = "Describe the voice you want in your own words — who it's for, how it should feel, what it should never do. VOICE will clarify your description, calibrate all 33 levers, and design a complete persona with you.";
      $("dvDescription").placeholder = "e.g. A warm but no-nonsense voice for sponsor thank-you letters. It should feel personal and grateful without being gushy, keep sentences short, avoid charity clichés, and always end with one concrete example of impact…";
      $("dvGenerateBtn").innerHTML = "✦ Design with VOICE";
    }
    $("dvStepInput").hidden = false;
    $("dvStepPreview").hidden = true;
    $("describeModal").showModal();
  }

  async function generateDescribedVoice() {
    const description = $("dvDescription").value.trim();
    if (description.length < 20) {
      $("dvError").textContent = "Please describe " + (dvRedesign ? "the changes" : "the voice") + " in a little more detail (a sentence or two at minimum).";
      return;
    }
    $("dvError").textContent = "";
    const btn = $("dvGenerateBtn");
    const oldLabel = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> ' + (dvRedesign ? "Redesigning…" : "Designing…");
    try {
      const body = {
        description,
        levers: leverCatalog(),
        palette: SWATCHES,
        existingNames: allVoices().filter((v) => !dvRedesign || v.id !== dvRedesign.id).map((v) => v.name)
      };
      if (dvRedesign) {
        body.current = {
          name: dvRedesign.name,
          tagline: dvRedesign.tagline,
          description: dvRedesign.description,
          essence: dvRedesign.essence,
          chips: dvRedesign.chips,
          sample: dvRedesign.sample,
          signatureMoves: dvRedesign.signatureMoves,
          neverDo: dvRedesign.neverDo,
          settings: dvRedesign.settings,
          temperature: dvRedesign.temperature,
          color: dvRedesign.color
        };
      }
      const res = await fetch("api/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || ("Server returned " + res.status));
      if (!data.persona) throw new Error("The AI returned an empty persona.");
      dvPersona = data.persona;
      showDescribePreview();
    } catch (e) {
      $("dvError").textContent = "⚠ " + e.message;
    } finally {
      btn.disabled = false;
      btn.innerHTML = oldLabel;
    }
  }

  function showDescribePreview() {
    const p = dvPersona;
    dvColor = p.color || "#475569";
    $("dvName").value = p.name;
    $("dvTagline").value = p.tagline;
    $("dvTags").value = (p.chips || []).join(", ");
    $("dvEssence").value = p.essence;
    $("dvSample").innerHTML = esc(p.sample).replace(/\n/g, "<br>");
    $("dvChips").innerHTML = (p.chips || []).map((c) => "<span>" + esc(c) + "</span>").join("");
    $("dvMoves").innerHTML = (p.signatureMoves || []).map((m) => "<li>" + esc(m) + "</li>").join("");
    $("dvNever").innerHTML = (p.neverDo || []).map((n) => "<li>" + esc(n) + "</li>").join("");
    $("dvPreviewCard").style.setProperty("--voice-color", dvColor);
    renderDvSwatches();
    $("dvSaveError").textContent = "";
    $("dvStepInput").hidden = true;
    $("dvStepPreview").hidden = false;
  }

  function renderDvSwatches() {
    const holder = $("dvSwatches");
    holder.innerHTML = "";
    SWATCHES.forEach((c) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "swatch" + (c === dvColor ? " active" : "");
      b.style.background = c;
      b.title = c;
      b.addEventListener("click", () => {
        dvColor = c;
        $("dvPreviewCard").style.setProperty("--voice-color", c);
        renderDvSwatches();
      });
      holder.appendChild(b);
    });
  }

  async function saveDescribedVoice() {
    if (!dvPersona) return;
    const name = $("dvName").value.trim();
    if (!name) { $("dvSaveError").textContent = "A name is required."; return; }

    const btn = $("dvSaveBtn");
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      const payload = {
        name,
        tagline: $("dvTagline").value.trim(),
        color: dvColor,
        temperature: dvPersona.temperature,
        settings: dvPersona.settings,
        essence: $("dvEssence").value.trim(),
        description: dvPersona.description,
        sample: dvPersona.sample,
        chips: parseTags($("dvTags").value),
        signatureMoves: dvPersona.signatureMoves,
        neverDo: dvPersona.neverDo,
        coCreated: true,
        provenance: { baseId: "", baseName: "", blendName: "", blendWeight: 0, fingerprint: false, described: true }
      };
      if (dvRedesign) {
        payload.id = dvRedesign.id;
        payload.styleNotes = dvRedesign.styleNotes || [];
        payload.customPrompt = dvRedesign.customPrompt || "";
        payload.provenance = Object.assign({}, dvRedesign.provenance, { described: true });
      }
      const res = await fetch("api/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || ("Server returned " + res.status));
      $("describeModal").close();
      await loadCustomVoices();
      activeArchetype = "Custom";
      renderArchetypeFilter();
      renderGallery();
      const saved = customVoices.find((v) => v.id === data.voice.id);
      if (saved) selectVoice(saved);
    } catch (e) {
      $("dvSaveError").textContent = "⚠ " + e.message;
    } finally {
      btn.disabled = false;
      btn.textContent = "Save to custom voices";
    }
  }

  /* ---------- Publish persona as M365 Copilot agent ---------- */

  let pubVoice = null;

  function openPublish(voice) {
    if (!isOwner()) return;
    pubVoice = voice;
    $("pubVoiceName").textContent = voice.name;
    const promptLen = buildSystemPrompt(voice, workingSettings).length;
    $("pubTrimNote").hidden = promptLen <= 7800;
    $("pubError").textContent = "";
    $("publishModal").showModal();
  }

  async function downloadAgentPackage() {
    if (!pubVoice) return;
    const btn = $("pubDownloadBtn");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Building…';
    try {
      const res = await fetch("api/agent-package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: pubVoice.name,
          prompt: buildSystemPrompt(pubVoice, workingSettings),
          description: pubVoice.description || pubVoice.essence || "",
          tagline: pubVoice.tagline || "",
          color: pubVoice.color
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || ("Server returned " + res.status));
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "voice-agent-" + pubVoice.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      btn.textContent = "Downloaded ✓";
      setTimeout(() => { btn.textContent = "Download agent package"; btn.disabled = false; }, 2000);
    } catch (e) {
      $("pubError").textContent = "⚠ " + e.message;
      btn.disabled = false;
      btn.textContent = "Download agent package";
    }
  }

  /* ---------- Save custom voice ---------- */

  function provenanceText() {
    let t = "Based on " + selectedVoice.name;
    if (labMeta.blend) t += ", blended " + (100 - labMeta.blend.weight) + "/" + labMeta.blend.weight + " with " + labMeta.blend.name;
    if (labMeta.fingerprint) t += ", carrying a personal style fingerprint";
    const n = dirtyCount();
    if (n > 0 && !labMeta.blend && !labMeta.fingerprint) t += " with " + n + " hand-tuned lever" + (n === 1 ? "" : "s");
    return t + ".";
  }

  function composeEssence() {
    let s = "";
    if (labMeta.blend) {
      const other = allVoices().find((v) => v.id === labMeta.blend.id);
      s += "A hybrid voice blending \"" + selectedVoice.name + "\" (" + (100 - labMeta.blend.weight) + "%) with \"" + labMeta.blend.name + "\" (" + labMeta.blend.weight + "%). ";
      if (selectedVoice.essence) s += "From the first: " + selectedVoice.essence + " ";
      if (other && other.essence) s += "From the second: " + other.essence + " ";
      s += "Blend these characters in proportion; the spectrum positions below are the authoritative result.";
    } else {
      s = selectedVoice.essence || "";
      if (dirtyCount() > 0) s += (s ? " " : "") + "This voice has been custom-tuned by the committee; the spectrum positions below override the base calibration wherever they differ.";
    }
    if (labMeta.fingerprint) s += " It also carries the author's personal style fingerprint (see personal style notes).";
    return s.trim();
  }

  function parseTags(str) {
    return String(str || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 5).map((s) => s.slice(0, 24));
  }

  function openSaveModal(fpBaseVoice, updateVoice) {
    /* fpBaseVoice: arriving from the fingerprint result editor.
       updateVoice: editing an existing custom voice in place (creator/owner). */
    saveMode.updateId = updateVoice ? updateVoice.id : null;
    const base = fpBaseVoice || updateVoice || selectedVoice;
    pendingColor = base.color;
    $("svName").value = updateVoice ? updateVoice.name : "";
    $("svTagline").value = updateVoice ? (updateVoice.tagline || "") : "";
    $("svTags").value = updateVoice ? (updateVoice.chips || []).join(", ") : "";
    $("svTemp").value = Math.round((base.temperature != null ? base.temperature : 0.5) * 100);
    $("svTempVal").textContent = (Number($("svTemp").value) / 100).toFixed(2);
    const essenceField = $("svEssence").closest("label");
    if (fpBaseVoice) {
      essenceField.hidden = true;
      $("svEssence").value = "";
      $("saveProvenance").textContent = "Personalized from " + base.name + " via your style fingerprint. The AI-crafted prompt you just reviewed will be used verbatim for this voice.";
    } else if (updateVoice) {
      essenceField.hidden = false;
      pendingCustomPrompt = null;
      $("svEssence").value = updateVoice.essence || "";
      $("saveProvenance").textContent = "Updating “" + updateVoice.name + "” in place — the current Voice Lab slider positions will become its new calibration. This affects everyone who uses this voice.";
    } else {
      essenceField.hidden = false;
      pendingCustomPrompt = null;
      $("svEssence").value = composeEssence();
      $("saveProvenance").textContent = provenanceText();
    }
    $("svSaveBtn").textContent = updateVoice ? "Update voice" : "Save voice";
    $("svError").textContent = "";
    renderSwatches();
    $("saveVoiceModal").showModal();
  }

  function renderSwatches() {
    const holder = $("svSwatches");
    holder.innerHTML = "";
    SWATCHES.forEach((c) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "swatch" + (c === pendingColor ? " active" : "");
      b.style.background = c;
      b.title = c;
      b.addEventListener("click", () => { pendingColor = c; renderSwatches(); });
      holder.appendChild(b);
    });
  }

  async function saveVoice(e) {
    e.preventDefault();
    const name = $("svName").value.trim();
    if (!name) return;

    const fromFingerprint = !!pendingCustomPrompt;
    const fpBase = fpResult && fpResult.mode === "fingerprint" ? fpResult.baseVoice : null;
    const baseVoice = fromFingerprint && fpBase ? fpBase : selectedVoice;
    const updating = saveMode.updateId ? customVoices.find((v) => v.id === saveMode.updateId) : null;
    const payload = updating ? {
      /* In-place update: keep the voice's identity fields, refresh calibration */
      id: updating.id,
      name,
      tagline: $("svTagline").value.trim(),
      color: pendingColor,
      temperature: Number($("svTemp").value) / 100,
      settings: workingSettings,
      essence: $("svEssence").value.trim(),
      description: updating.description || "",
      sample: updating.sample || "",
      chips: parseTags($("svTags").value),
      signatureMoves: updating.signatureMoves || [],
      neverDo: updating.neverDo || [],
      customPrompt: updating.customPrompt || "",
      styleNotes: updating.styleNotes || [],
      provenance: updating.provenance || null
    } : {
      name,
      tagline: $("svTagline").value.trim(),
      color: pendingColor,
      temperature: Number($("svTemp").value) / 100,
      settings: fromFingerprint ? Object.assign({}, baseVoice.settings) : workingSettings,
      essence: fromFingerprint ? "" : $("svEssence").value.trim(),
      customPrompt: fromFingerprint ? pendingCustomPrompt : "",
      chips: parseTags($("svTags").value),
      styleNotes: !fromFingerprint && labMeta && labMeta.fingerprint ? labMeta.fingerprint.notes : [],
      provenance: {
        baseId: baseVoice.id,
        baseName: baseVoice.name,
        blendName: !fromFingerprint && labMeta && labMeta.blend ? labMeta.blend.name : "",
        blendWeight: !fromFingerprint && labMeta && labMeta.blend ? labMeta.blend.weight : 0,
        fingerprint: fromFingerprint || !!(labMeta && labMeta.fingerprint)
      }
    };

    const btn = $("svSaveBtn");
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      const res = await fetch("api/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || ("Server returned " + res.status));
      $("saveVoiceModal").close();
      await loadCustomVoices();
      activeArchetype = "Custom";
      renderArchetypeFilter();
      renderGallery();
      pendingCustomPrompt = null;
      fpResult = null;
      saveMode.updateId = null;
      const saved = customVoices.find((v) => v.id === data.voice.id);
      if (saved) selectVoice(saved);
    } catch (err) {
      $("svError").textContent = "⚠ " + err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = "Save voice";
    }
  }

  async function deleteVoice(voice) {
    if (!window.confirm('Delete the custom voice "' + voice.name + '" for everyone? This cannot be undone.')) return;
    try {
      const res = await fetch("api/voices/" + encodeURIComponent(voice.id), { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || ("Server returned " + res.status));
      }
      if (selectedVoice && selectedVoice.id === voice.id) {
        selectedVoice = null;
        workingSettings = null;
        profileSection.hidden = true;
        studioSection.hidden = true;
      }
      await loadCustomVoices();
    } catch (err) {
      window.alert("Could not delete: " + err.message);
    }
  }

  /* =========================================================================
     STUDIO INTERACTIONS
     ========================================================================= */

  function updateConnectionHint() {
    $("connectionHint").hidden = serverConfigured !== false;
  }

  async function onTransform() {
    if (!selectedVoice) return;
    const content = $("inputText").value.trim();
    if (!content) {
      showOutput('<p class="placeholder">Add some content on the left first.</p>');
      return;
    }

    const btn = $("transformBtn");
    btn.disabled = true;
    const useWorkIq = isWorkIqEnabled();
    $("transformLabel").innerHTML = '<span class="spinner"></span> Transforming…';
    showOutput('<p class="placeholder">' + (useWorkIq ? "Calling Work IQ and Azure AI…" : "Calling Azure AI…") + "</p>");
    $("copyOutputBtn").hidden = true;
    clearWorkIqContext();

    try {
      const data = useWorkIq ? await callWorkIqServer(selectedVoice, content) : await callServer(selectedVoice, content);
      const result = typeof data === "string" ? data : data.text;
      showOutput("<pre class='result-text'>" + esc(result) + "</pre>");
      if (useWorkIq) renderWorkIqContext(data.context || {});
      $("copyOutputBtn").hidden = false;
      $("copyOutputBtn").dataset.text = result;
    } catch (e) {
      const msg = e instanceof TypeError
        ? "Could not reach the server. Check your connection and try again."
        : e.message;
      showOutput('<p class="error">⚠ ' + esc(msg) + "</p>");
    } finally {
      btn.disabled = false;
      const suffix = !selectedVoice.customPrompt && dirtyCount() > 0 ? " (tuned)" : "";
      $("transformLabel").innerHTML = "Transform with <span id='transformVoiceName'>" + esc(selectedVoice.name + suffix) + "</span>";
    }
  }

  function showOutput(html) {
    outputArea.innerHTML = html;
  }

  /* =========================================================================
     RENDERING — RED LINES
     ========================================================================= */

  function renderRedlines() {
    const grid = $("redlinesGrid");
    grid.innerHTML = "";
    ANTI_PATTERNS.forEach((a) => {
      const card = document.createElement("div");
      card.className = "redline-card";
      card.innerHTML =
        "<h4>" + esc(a.name) + "</h4>" +
        '<p class="rl-avoid">✕ ' + esc(a.avoid) + "</p>" +
        '<p class="rl-allowed">✓ ' + esc(a.allowed) + "</p>";
      grid.appendChild(card);
    });
  }

  /* =========================================================================
     MODALS
     ========================================================================= */

  function openPromptViewer() {
    if (!selectedVoice) return;
    const suffix = selectedVoice.customPrompt ? " (personal prompt)" : (dirtyCount() > 0 ? " (custom-tuned)" : "");
    $("promptVoiceName").textContent = selectedVoice.name + suffix;
    const content = $("inputText").value.trim() || "[your content here]";
    const full = "SYSTEM PROMPT\n=============\n" + buildSystemPrompt(selectedVoice, workingSettings) +
      "\n\nUSER PROMPT\n===========\n" + buildUserPrompt(selectedVoice, content) +
      "\n\nPARAMETERS\n==========\ntemperature: " + (selectedVoice.temperature != null ? selectedVoice.temperature : 0.5) + "\nmax_tokens: 4000";
    $("promptText").textContent = full;
    $("promptModal").showModal();
  }

  async function copyToClipboard(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      const old = btn.textContent;
      btn.textContent = "Copied ✓";
      setTimeout(() => { btn.textContent = old; }, 1500);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      btn.textContent = "Copied ✓";
      setTimeout(() => { btn.textContent = "Copy"; }, 1500);
    }
  }

  /* =========================================================================
     UTILITIES & INIT
     ========================================================================= */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function init() {
    renderArchetypeFilter();
    renderGallery();
    renderRedlines();
    checkHealth();
    loadIdentity();
    loadCustomVoices();
    loadSponsorVoices();

    $("transformBtn").addEventListener("click", onTransform);
    $("viewPromptBtn").addEventListener("click", openPromptViewer);
    $("closePromptBtn").addEventListener("click", () => $("promptModal").close());
    $("workIqEnabled").addEventListener("change", updateWorkIqState);

    $("copyPromptBtn").addEventListener("click", (e) => copyToClipboard($("promptText").textContent, e.currentTarget));
    $("copyOutputBtn").addEventListener("click", (e) => copyToClipboard(e.currentTarget.dataset.text || "", e.currentTarget));

    $("sampleBtn").addEventListener("click", () => {
      $("inputText").value = SAMPLE_BASE;
    });

    /* Save-voice modal */
    $("saveVoiceForm").addEventListener("submit", saveVoice);
    $("svCancelBtn").addEventListener("click", () => $("saveVoiceModal").close());
    $("svTemp").addEventListener("input", () => {
      $("svTempVal").textContent = (Number($("svTemp").value) / 100).toFixed(2);
    });

    /* Fingerprint wizard + result editor */
    $("fpGenerateBtn").addEventListener("click", generateFingerprint);
    $("fpCancelBtn").addEventListener("click", () => $("fpModal").close());
    $("fprBackBtn").addEventListener("click", onFprBack);
    $("fprSaveBtn").addEventListener("click", onFprSave);

    /* Describe a voice */
    $("describeBtn").addEventListener("click", () => openDescribe());
    $("dvCancelBtn").addEventListener("click", () => $("describeModal").close());
    $("dvGenerateBtn").addEventListener("click", generateDescribedVoice);
    $("dvBackBtn").addEventListener("click", () => {
      $("dvStepPreview").hidden = true;
      $("dvStepInput").hidden = false;
    });
    $("dvSaveBtn").addEventListener("click", saveDescribedVoice);

    /* Hyper-personalization terms */
    $("termsAcceptBtn").addEventListener("click", acceptTerms);
    $("termsCancelBtn").addEventListener("click", () => $("termsModal").close());

    /* Publish agent */
    $("pubCancelBtn").addEventListener("click", () => $("publishModal").close());
    $("pubDownloadBtn").addEventListener("click", downloadAgentPackage);

    /* Sponsor workspace */
    $("voiceModeBtn").addEventListener("click", () => setWorkspace("voice"));
    $("sponsorJumpBtn").addEventListener("click", () => setWorkspace("sponsor"));
    $("describeSponsorBtn").addEventListener("click", () => openSponsorDescribe());
    $("spCancelBtn").addEventListener("click", () => $("sponsorDescribeModal").close());
    $("spGenerateBtn").addEventListener("click", generateSponsorPersona);
    $("spBackBtn").addEventListener("click", () => {
      $("spStepPreview").hidden = true;
      $("spStepInput").hidden = false;
    });
    $("spSaveBtn").addEventListener("click", saveSponsorPersona);
    $("editSponsorBtn").addEventListener("click", () => { if (sponsorState.selected) openSponsorDescribe(sponsorState.selected); });
    $("copySponsorBtn").addEventListener("click", (e) => copyToClipboard(e.currentTarget.dataset.text || "", e.currentTarget));
    $("copyVoiceMatchBtn").addEventListener("click", (e) => copyToClipboard(e.currentTarget.dataset.text || "", e.currentTarget));
    $("matchVoiceSelect").addEventListener("change", updateSponsorWorkflowContext);
    $("sponsorForm").addEventListener("submit", analyzeSponsorPersona);
    $("voiceMatchForm").addEventListener("submit", analyzeVoiceMatch);
    $("spSaveError").textContent = "";

    /* Sponsor personas */
    clearSponsorResult();
    clearVoiceMatchResult();
  }

  init();
})();
