const { test, expect } = require("@playwright/test");

test("renders core VOICE workspace and built-in personas", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("#voiceGrid .voice-card")).toHaveCount(13);
  await page.locator("#voiceGrid .voice-card").first().click();
  await expect(page.locator("#profile-section")).toBeVisible();
  await expect(page.locator("#studio-section")).toBeVisible();
  await expect(page.locator("#transformBtn")).toBeVisible();
});

test("shows Work IQ drafting controls to members with clear disabled state", async ({ page }) => {
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        name: "Test Member",
        email: "member@example.com",
        role: "member",
        marketingAccess: false,
        termsAccepted: false
      })
    });
  });
  await page.route("**/api/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ configured: true, model: "test-model", workIqConfigured: false })
    });
  });

  await page.goto("/");
  await page.locator("#voiceGrid .voice-card").first().click();

  await expect(page.locator("#workIqPanel")).toBeVisible();
  await expect(page.locator("#workIqEnabled")).toBeDisabled();
  await expect(page.locator("#workIqStatus")).toContainText("not configured");
});

test("uses Work IQ endpoint and renders returned context", async ({ page }) => {
  let workIqPayload = null;
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        name: "Test Member",
        email: "member@example.com",
        role: "member",
        marketingAccess: false,
        termsAccepted: false
      })
    });
  });
  await page.route("**/api/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ configured: true, model: "test-model", workIqConfigured: true })
    });
  });
  await page.route("**/api/work-context-draft", async (route) => {
    workIqPayload = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        text: "Grounded rewrite using the Field Operator voice.",
        context: {
          summary: "Recent Teams discussion emphasized launch timing and manager readiness.",
          references: [
            {
              title: "AI Hub launch notes",
              url: "https://contoso.example/notes",
              source: "Teams",
              snippet: "Managers asked for concise rollout guidance."
            }
          ]
        }
      })
    });
  });

  await page.goto("/");
  await page.locator("#voiceGrid .voice-card").first().click();
  await expect(page.locator("#workIqEnabled")).toBeEnabled();
  await page.locator("#workIqEnabled").check();
  await expect(page.locator("#workIqOptions")).toBeVisible();
  await page.locator("#inputText").fill("We are launching the AI Hub next month.");
  await page.locator("#workIqQuery").fill("Find recent launch planning context.");
  await page.locator("#transformBtn").click();

  await expect(page.locator("#outputArea")).toContainText("Grounded rewrite using the Field Operator voice.");
  await expect(page.locator("#workIqContextPanel")).toContainText("Recent Teams discussion");
  await expect(page.locator("#workIqContextPanel")).toContainText("AI Hub launch notes");
  expect(workIqPayload.contextQuery).toBe("Find recent launch planning context.");
  expect(workIqPayload.voiceName).toBe("The Field Operator");
});

test("shows owner fingerprint controls", async ({ page }) => {
  await page.goto("/");

  await page.locator("#voiceGrid .voice-card").first().click();
  const fingerprintBtn = page.getByRole("button", { name: /fingerprint/i });
  await expect(fingerprintBtn).toBeVisible();
  await fingerprintBtn.first().click();

  await expect(page.locator("#termsModal")).toBeVisible();
  await expect(page.locator("#termsAcceptBtn")).toBeVisible();
});

test("shows marketing sponsor workspace when marketing access is true", async ({ page }) => {
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        name: "Test Owner",
        email: "owner@example.com",
        role: "owner",
        marketingAccess: true,
        termsAccepted: true
      })
    });
  });

  await page.goto("/");

  await expect(page.locator("#voiceIntro")).toBeVisible();
  await expect(page.locator("#gallery-section")).toBeVisible();
  await expect(page.locator("#sponsor-section")).toBeHidden();
  await expect(page.locator("#voiceModeBtn")).toBeVisible();
  await expect(page.locator("#sponsorJumpBtn")).toBeVisible();

  await page.locator("#sponsorJumpBtn").click();
  await expect(page.locator("#sponsor-section")).toBeVisible();
  await expect(page.locator("#voiceIntro")).toBeHidden();
  await expect(page.locator("#gallery-section")).toBeHidden();
  await expect(page.locator("#sponsorGrid .voice-card")).toHaveCount(7);
  await expect(page.getByRole("button", { name: "Test sponsor reaction" })).toBeVisible();

  const archetypes = await page.locator("#sponsorGrid .card-archetype").allTextContents();
  expect(new Set(archetypes).size).toBeGreaterThan(1);

  await page.locator("#voiceModeBtn").click();
  await expect(page.locator("#voiceIntro")).toBeVisible();
  await expect(page.locator("#gallery-section")).toBeVisible();
  await expect(page.locator("#sponsor-section")).toBeHidden();
});

test("persists sponsor description and normalizes profile selections on save", async ({ page }) => {
  const describeText = "A cautious executive sponsor persona that wants concise proof and clear risk controls.";
  let savedPayload = null;

  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        name: "Test Owner",
        email: "owner@example.com",
        role: "owner",
        marketingAccess: true,
        termsAccepted: true
      })
    });
  });

  await page.route("**/api/sponsor-describe", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        persona: {
          name: "Jordan Miller",
          tagline: "Proof before promises.",
          summary: "An evidence-first sponsor lens.",
          sourceDescription: describeText,
          profile: {
            ageRange: "35-54",
            incomeBand: "middle",
            geography: "North America",
            occupationLevel: "executive",
            engagementLevel: "medium",
            tenure: "established",
            givingPattern: "monthly + extra gifts",
            channel: "email",
            interactionType: "occasional",
            motivation: "impact-driven",
            emotionalTone: "neutral",
            trustLevel: "skeptical",
            contentPreference: "detailed",
            engagementIntent: "informational",
            sponsoredChildren: "multiple",
            letterBehavior: "rarely",
            giftActivity: "occasional",
            visitProgramEngagement: "no"
          },
          chips: ["Skeptical", "Data-first", "Concise"],
          initialReaction: "Show me evidence first.",
          likelyQuestions: ["What proof supports this?", "What are the risks?", "What is the timeline?"],
          likelyConcerns: ["Vague outcomes", "No controls", "Hidden cost"],
          recommendedFraming: "Lead with outcomes and controls.",
          contentStrategy: { tone: "Direct", length: "Short", structure: "Bulleted", proof: "Metrics first" },
          color: "#334155"
        }
      })
    });
  });

  await page.route("**/api/sponsor-persona", async (route) => {
    savedPayload = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ persona: { id: "saved-1", ...savedPayload } })
    });
  });

  await page.goto("/");
  await page.locator("#sponsorJumpBtn").click();
  await page.getByRole("button", { name: "Describe a sponsor persona…" }).click();
  await page.locator("#spDescription").fill(describeText);
  await page.locator("#spGenerateBtn").click();

  await expect(page.locator('select[data-sp-field="ageRange"]')).toHaveValue("35–54");
  await expect(page.locator('select[data-sp-field="incomeBand"]')).toHaveValue("Middle");
  await expect(page.locator('select[data-sp-field="occupationLevel"]')).toHaveValue("Executive");

  await page.locator("#spSaveBtn").click();
  await expect.poll(() => savedPayload !== null).toBe(true);
  expect(savedPayload.sourceDescription).toBe(describeText);
});

test("uses the sponsor reaction endpoint and renders populated output", async ({ page }) => {
  let reactionCalled = false;
  let reactionPayload = null;
  let saveCalled = false;

  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        name: "Test Owner",
        email: "owner@example.com",
        role: "owner",
        marketingAccess: true,
        termsAccepted: true
      })
    });
  });

  await page.route("**/api/sponsor-reaction", async (route) => {
    reactionCalled = true;
    reactionPayload = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        persona: {
          personaName: "The Skeptical Impact Executive",
          personaSummary: "A sponsor who wants concise proof before engaging.",
          initialReaction: "This could work if the evidence is clear.",
          likelyQuestions: ["What changed?", "What proof supports it?", "What action is expected?"],
          likelyConcerns: ["Vague outcomes", "Too much emotion", "Hidden effort"],
          recommendedFraming: "Lead with the measurable impact and one concrete next step.",
          contentStrategy: { tone: "Direct", length: "Short", structure: "Bullets", proof: "One metric plus example" },
          confidence: 0.82
        }
      })
    });
  });
  await page.route("**/api/sponsor-personas", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        personas: [{
          id: "concert-seeker",
          name: "The Concert-Introduced Seeker",
          archetype: "Custom sponsor",
          tagline: "I came for the moment; show me the mission.",
          color: "#7C3AED",
          chips: ["Event-led", "Curious", "Proof-seeking"],
          summary: "A concert-introduced sponsor who is emotionally open but still needs a clear bridge from the event experience to credible long-term impact.",
          profile: {
            ageRange: "35–54",
            incomeBand: "Middle",
            geography: "North America",
            occupationLevel: "Manager",
            engagementLevel: "Medium",
            tenure: "New (< 1 yr)",
            givingPattern: "Monthly Only",
            channel: "Email",
            interactionType: "Occasional",
            motivation: "Impact-driven",
            emotionalTone: "Optimistic",
            trustLevel: "Moderate",
            contentPreference: "Narrative",
            engagementIntent: "Informational",
            sponsoredChildren: "Single",
            letterBehavior: "Rarely",
            giftActivity: "None",
            visitProgramEngagement: "No"
          },
          initialReaction: "Help me connect what I felt at the concert to what my sponsorship changes.",
          likelyQuestions: ["What happens next?", "Is this impact real?", "How do I stay connected?"],
          likelyConcerns: ["Too much institutional language", "No concert connection", "Unclear next step"],
          recommendedFraming: "Start from the concert memory, then prove the mission with one human outcome.",
          contentStrategy: { tone: "Warm and credible", length: "Short", structure: "Memory, proof, next step", proof: "One story plus one measurable result" },
          sourceDescription: "Custom sponsor introduced through a concert.",
          createdBy: "Test Owner · with VOICE",
          createdByEmail: "owner@example.com"
        }]
      })
    });
  });

  await page.route("**/api/sponsor-persona", async (route) => {
    saveCalled = true;
    await route.continue();
  });

  await page.goto("/");
  await page.locator("#sponsorJumpBtn").click();
  await page.locator("#sponsorGrid .voice-card", { hasText: "The Concert-Introduced Seeker" }).click();
  await page.locator("#sponsorIdea").fill("A sponsor update that leads with impact data before the child story and asks readers to try a new story format.");
  await page.locator("#sponsorAnalyzeBtn").click();

  await expect(page.locator("#sponsorOutput")).toContainText("Reaction from The Concert-Introduced Seeker");
  await expect(page.locator("#sponsorOutput")).toContainText("This could work if the evidence is clear.");
  await expect(page.locator("#sponsorOutput")).not.toContainText("The Skeptical Impact Executive");
  expect(reactionCalled).toBe(true);
  expect(reactionPayload.sponsor.name).toBe("The Concert-Introduced Seeker");
  expect(saveCalled).toBe(false);
});

test("matches voices to sponsor archetypes and renders lever tuning guidance", async ({ page }) => {
  let matchPayload = null;

  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        name: "Test Owner",
        email: "owner@example.com",
        role: "owner",
        marketingAccess: true,
        termsAccepted: true
      })
    });
  });

  await page.route("**/api/sponsor-voice-match", async (route) => {
    matchPayload = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        match: {
          sponsorArchetype: "The Evidence Guard",
          bestVoiceId: "field-operator",
          bestVoiceName: "The Field Operator",
          summary: "The sponsor will respond best to a concrete, proof-led voice.",
          rankings: [
            { voiceId: "field-operator", voiceName: "The Field Operator", score: 91, fit: "Strong fit", why: "It is direct and practical.", watchOut: "Do not under-explain proof." },
            { voiceId: "quickstart-coach", voiceName: "The Quickstart Coach", score: 64, fit: "Needs tuning", why: "Warmth helps, but it needs more evidence.", watchOut: "May feel too soft." }
          ],
          selectedVoiceAdvice: {
            voiceId: "quickstart-coach",
            voiceName: "The Quickstart Coach",
            currentFit: "Moderate fit",
            recommendation: "Keep the human warmth, but move the voice toward evidence, directness, and tighter structure.",
            levers: [
              { id: "ei", name: "Evidence vs Intuition", direction: "decrease", target: 20, why: "Lead with proof before story." },
              { id: "sf", name: "Structure vs Fluidity", direction: "decrease", target: 25, why: "Use a predictable proof-first shape." }
            ]
          }
        }
      })
    });
  });

  await page.goto("/");
  await page.locator("#sponsorJumpBtn").click();
  await page.locator("#matchVoiceSelect").selectOption({ label: "The Quickstart Coach" });
  await page.locator("#sponsorIdea").fill("A sponsor update that asks readers to support a new outcome dashboard and starts with the evidence behind the change.");
  await page.locator("#voiceMatchBtn").click();

  await expect(page.locator("#voiceMatchOutput")).toContainText("Best fit: The Field Operator");
  await expect(page.locator("#voiceMatchOutput")).toContainText("Tune The Quickstart Coach");
  await expect(page.locator("#voiceMatchOutput")).toContainText("Evidence vs Intuition");
  expect(matchPayload.targetVoiceId).toBe("quickstart-coach");
  expect(matchPayload.voices.length).toBe(13);
  expect(matchPayload.sponsor.name).toBe("The Evidence Guard");
});
