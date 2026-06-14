const { test, expect } = require("@playwright/test");

async function mockMarketingOwner(page) {
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
}

async function mockHealth(page, workIqConfigured = false) {
  await page.route("**/api/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ configured: true, model: "test-model", workIqConfigured })
    });
  });
}

async function expectNoHorizontalOverflow(page) {
  await expect.poll(async () => page.evaluate(() => {
    const doc = document.documentElement;
    return Math.ceil(doc.scrollWidth - doc.clientWidth);
  })).toBeLessThanOrEqual(1);
}

test.describe("mobile layout", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true });

  test("keeps VOICE workspace usable without horizontal overflow", async ({ page }) => {
    await mockMarketingOwner(page);
    await mockHealth(page, true);
    await page.goto("/");

    await expect(page.locator(".site-header")).toBeVisible();
    await expect(page.locator("#voiceModeBtn")).toBeVisible();
    await expect(page.locator("#sponsorJumpBtn")).toBeVisible();
    await expect(page.locator("#voiceGrid .voice-card")).toHaveCount(13);
    await expectNoHorizontalOverflow(page);

    const firstCard = await page.locator("#voiceGrid .voice-card").first().boundingBox();
    expect(firstCard.width).toBeLessThanOrEqual(360);

    await page.locator("#voiceGrid .voice-card").first().click();
    await expect(page.locator("#profile-section")).toBeVisible();
    await expect(page.locator("#studio-section")).toBeVisible();
    await expect(page.locator("#workIqPanel")).toBeVisible();
    await page.locator("#workIqEnabled").check();
    await expect(page.locator("#workIqOptions")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const panes = await page.locator(".studio-pane").evaluateAll((els) => els.map((el) => {
      const box = el.getBoundingClientRect();
      return { top: box.top, width: box.width };
    }));
    expect(panes[1].top).toBeGreaterThan(panes[0].top);
    expect(Math.max(...panes.map((pane) => pane.width))).toBeLessThanOrEqual(360);
  });

  test("stacks sponsor thinking workspace and modal controls cleanly", async ({ page }) => {
    await mockMarketingOwner(page);
    await mockHealth(page, false);
    await page.route("**/api/sponsor-describe", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          persona: {
            name: "The Evidence-Minded Steward",
            tagline: "Proof before promises.",
            summary: "A concise, proof-led sponsor thinker.",
            sourceDescription: "A careful sponsor persona that wants concise proof and risk controls.",
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

    await page.goto("/");
    await page.locator("#sponsorJumpBtn").click();

    await expect(page.locator("#sponsor-section")).toBeVisible();
    await expect(page.locator("#voiceIntro")).toBeHidden();
    await expect(page.locator("#gallery-section")).toBeHidden();
    await expect(page.locator(".sponsor-pane")).toHaveCount(3);
    await expectNoHorizontalOverflow(page);

    const panes = await page.locator(".sponsor-pane").evaluateAll((els) => els.map((el) => {
      const box = el.getBoundingClientRect();
      return { top: box.top, width: box.width };
    }));
    for (let i = 1; i < panes.length; i++) {
      expect(panes[i].top).toBeGreaterThan(panes[i - 1].top);
    }
    expect(Math.max(...panes.map((pane) => pane.width))).toBeLessThanOrEqual(360);

    await page.getByRole("button", { name: "Describe a sponsor persona…" }).click();
    await page.locator("#spDescription").fill("A careful sponsor persona that wants concise proof and risk controls.");
    await page.locator("#spGenerateBtn").click();

    await expect(page.locator("#spStepPreview")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const modalBox = await page.locator("#sponsorDescribeModal").boundingBox();
    expect(modalBox.width).toBeLessThanOrEqual(366);
    await expect(page.locator('select[data-sp-field="ageRange"]')).toHaveValue("35–54");
  });
});
