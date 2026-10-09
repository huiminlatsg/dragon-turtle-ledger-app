import { expect, test } from "@playwright/test";

test("home page loads on an iPhone-sized screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Dragon Turtle Ledger|龙龟账本/ })).toBeVisible();
  await expect(page.getByTestId("database")).toBeVisible();
});

test("app can be installed to the home screen", async ({ page, request }) => {
  await page.goto("/");
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestHref).toBeTruthy();

  const manifest = await (await request.get(manifestHref!)).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

  for (const icon of manifest.icons) {
    const res = await request.get(icon.src);
    expect(res.status(), icon.src).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  }

  const appleIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect(appleIcon).toBeTruthy();
});

test("test versions are labelled with their environment; production is not", async ({ page, request }) => {
  const { environment } = await (await request.get("/api/health")).json();
  await page.goto("/login");
  if (environment === "production") {
    await expect(page.getByTestId("env-badge")).toHaveCount(0);
    await expect(page).toHaveTitle("Dragon Turtle Ledger");
  } else {
    await expect(page.getByTestId("env-badge")).toHaveText(environment.toUpperCase());
    await expect(page).toHaveTitle(`Dragon Turtle Ledger-${environment}`);
  }
});

test("health endpoint responds", async ({ request }) => {
  const res = await request.get("/api/health");
  const body = await res.json();
  expect(body).toHaveProperty("version");
  expect(["ok", "not_configured", "unreachable"]).toContain(body.database);
});

test("language switch changes the interface between English and Chinese", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Family expense tracker")).toBeVisible();
  await page.getByTestId("lang-switch").click();
  await expect(page.getByText("家庭记账")).toBeVisible();
  await page.getByTestId("lang-switch").click();
  await expect(page.getByText("Family expense tracker")).toBeVisible();
});

test("signed-out visitors are sent to sign in with Google", async ({ page, request }) => {
  const health = await (await request.get("/api/health")).json();
  test.skip(health.database === "not_configured", "needs a database (runs on deployed previews)");

  await page.goto("/family");
  await expect(page).toHaveURL(/\/login\?next=%2Ffamily/);
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();

  await page.goto("/accounts");
  await expect(page).toHaveURL(/\/login\?next=%2Faccounts/);

  await page.goto("/me");
  await expect(page).toHaveURL(/\/login\?next=%2Fme/);
});

test("coming back from Google without a valid sign-in goes to the sign-in page with a message", async ({ page }) => {
  await page.goto("/auth/google#id_token=fake&state=nope");
  await expect(page).toHaveURL(/\/login\?error=1/);
});

test("addresses not registered with Google keep the redirect sign-in button", async ({ page, request }) => {
  const { database } = await (await request.get("/api/health")).json();
  test.skip(database === "not_configured", "no Supabase here, so the sign-in section is hidden");
  await page.goto("/login");
  await expect(page.locator(".google-button")).toBeVisible();
});
