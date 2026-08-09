const $ = (id) => document.getElementById(id);

let current = null;
let health = { transactionMode: "sandbox" };
let toastTimer = null;
let paymentPollTimer = null;

const THEME_STORAGE_KEY = "reliefcart-theme";
const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

function savedThemePreference() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return ["system", "light", "dark"].includes(saved) ? saved : "system";
  } catch {
    return "system";
  }
}

function resolvedTheme(preference) {
  return preference === "system"
    ? (systemThemeQuery.matches ? "dark" : "light")
    : preference;
}

function applyTheme(preference, { persist = true } = {}) {
  const normalized = ["system", "light", "dark"].includes(preference)
    ? preference
    : "system";
  const resolved = resolvedTheme(normalized);

  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = normalized;
  $("themeSelect").value = normalized;
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    resolved === "dark" ? "#101511" : "#eeece5",
  );

  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, normalized);
    } catch {
      // Theme still applies for this session when storage is unavailable.
    }
  }
}

function initThemeControl() {
  const select = $("themeSelect");
  applyTheme(savedThemePreference(), { persist: false });
  select.addEventListener("change", () => applyTheme(select.value));

  const handleSystemThemeChange = () => {
    if (document.documentElement.dataset.themePreference === "system") {
      applyTheme("system", { persist: false });
    }
  };

  if (typeof systemThemeQuery.addEventListener === "function") {
    systemThemeQuery.addEventListener("change", handleSystemThemeChange);
  } else {
    systemThemeQuery.addListener(handleSystemThemeChange);
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "The request could not be completed.");
  }
  return data;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeUrl(value) {
  try {
    const url = new URL(String(value), window.location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "#";
  } catch {
    return "#";
  }
}

function sourceDomain(value) {
  try {
    return new URL(String(value)).hostname.replace(/^www\./, "");
  } catch {
    return "policy source";
  }
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

function shortDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function statusCopy(status) {
  return {
    intake: "Intake",
    planned: "Evidence ready",
    quoted: "Quote ready",
    awaiting_payment: "Awaiting approval",
    paid: "Approved",
    checked_out: "Order placed",
    aborted: "Purchase blocked",
    failed: "Needs attention",
  }[status] || String(status);
}

function statusClass(status) {
  if (status === "checked_out") return "is-complete";
  if (["aborted", "failed"].includes(status)) return "is-blocked";
  if (["quoted", "awaiting_payment", "paid"].includes(status)) return "is-warning";
  return "";
}

function productIcon(category) {
  if (category === "toiletries") {
    return `
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <path d="M39 30h22v50H39zM44 20h12v10M42 20h16M43 45h14M50 45v19" />
      </svg>`;
  }
  if (category === "underwear") {
    return `
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <path d="M24 31h52l-5 42H29zM27 47c13 0 23 8 23 26M73 47c-13 0-23 8-23 26M26 40h48" />
      </svg>`;
  }
  if (category === "phone_accessory") {
    return `
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <rect x="29" y="25" width="42" height="50" rx="8" />
        <path d="M43 25v-9M57 25v-9M50 42v16M42 50h16" />
      </svg>`;
  }
  return `
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="m31 27-18 14 12 16 9-7v28h32V50l9 7 12-16-18-14-9 9H40z" />
      <path d="M40 27c1 7 19 7 20 0" />
    </svg>`;
}

function showToast(message, type = "success") {
  window.clearTimeout(toastTimer);
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.toggle("is-error", type === "error");
  toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 4200);
}

function setFormMessage(message = "") {
  $("formMessage").textContent = message;
}

function setBusy(button, busy) {
  button.classList.toggle("is-loading", busy);
  button.setAttribute("aria-busy", String(busy));
  button.disabled = busy;
}

async function runAction(button, action, successMessage) {
  setBusy(button, true);
  try {
    const nextCase = await action();
    setCase(nextCase);
    if (successMessage) showToast(successMessage);
    return nextCase;
  } catch (error) {
    showToast(error.message, "error");
    return null;
  } finally {
    setBusy(button, false);
    updateActions(current);
  }
}

function renderJourney(reliefCase) {
  let activeIndex = 0;
  if (reliefCase) activeIndex = 1;
  if (reliefCase?.quote || ["quoted", "awaiting_payment", "paid"].includes(reliefCase?.status)) {
    activeIndex = 2;
  }
  if (reliefCase?.status === "checked_out") activeIndex = 3;

  [...$("journey").children].forEach((item, index) => {
    item.classList.toggle("is-complete", Boolean(reliefCase) && index < activeIndex);
    item.classList.toggle("is-active", index === activeIndex);
  });
}

function renderCaseHeader(reliefCase) {
  const incident = reliefCase.incident;
  $("caseTitle").textContent = `${incident.airlineName} baggage delay`;
  $("caseSubtitle").textContent = [
    incident.claimReference || "Missing claim reference",
    incident.flight,
    incident.station,
  ]
    .filter(Boolean)
    .join(" · ");

  const status = $("caseStatus");
  status.textContent = statusCopy(reliefCase.status);
  status.className = `case-status ${statusClass(reliefCase.status)}`.trim();

  $("caseAlert").hidden = !reliefCase.error;
  $("caseAlertText").textContent = reliefCase.error || "";
}

function renderUatHandoff(reliefCase) {
  const stageCopy = {
    planned: "Policy decision ready",
    quoted: "Quote ready · approval is next",
    awaiting_payment: "Approval pending · no order placed",
    paid: "Approval recorded · checkout unlocked",
    checked_out: "Sandbox order placed · claim packet ready",
    aborted: "Purchase blocked · no order placed",
    failed: "Needs attention · UAT evidence remains separate",
  };
  const stage = $("uatHandoffStage");
  stage.textContent = stageCopy[reliefCase.status] || "UAT pattern available";
  stage.dataset.state = reliefCase.status;
}

function renderBudget(reliefCase) {
  const plan = reliefCase.plan;
  if (!plan) return;

  const effective = Number(plan.effectiveCapUsd);
  const projectedCost = reliefCase.quote
    ? Number(reliefCase.quote.totalAmount)
    : Number(plan.primary?.unitPriceUsd || 0);
  const actualRemaining =
    reliefCase.claimPack?.amounts.remainingBudgetAfter ??
    Math.max(0, effective - projectedCost);
  const percentage = effective > 0 ? Math.max(0, Math.min(100, (actualRemaining / effective) * 100)) : 0;

  $("effectiveCap").textContent = money(effective);
  $("policyCap").textContent = money(plan.policyCapUsd);
  $("personalCap").textContent = money(plan.personalCapUsd);
  $("remainingCap").textContent = plan.primary ? money(actualRemaining) : "No eligible item";
  $("budgetMeter").style.width = `${percentage}%`;
  $("budgetCaption").textContent = reliefCase.quote
    ? `${money(projectedCost)} exact quoted total`
    : plan.primary
      ? `${money(projectedCost)} projected item price before tax and shipping`
      : "No spend has been authorized";
}

function policySourcesFor(reliefCase) {
  const items = reliefCase.plan?.items || [];
  const allSources = items.flatMap((item) => item.decision?.citations || []);
  const unique = new Map();
  allSources.forEach((source) => unique.set(source.id, source));
  return [...unique.values()];
}

function renderEvidence(reliefCase) {
  const sources = policySourcesFor(reliefCase);
  $("policySources").innerHTML = sources.length
    ? sources
        .map(
          (source, index) => `
          <a class="source-card" href="${escapeHtml(safeUrl(source.url))}" target="_blank" rel="noreferrer">
            <span class="source-icon">${String(index + 1).padStart(2, "0")}</span>
            <span>
              <strong>${escapeHtml(source.title)}</strong>
              <small>${escapeHtml(source.excerpt)}</small>
            </span>
            <span class="source-arrow" aria-hidden="true">↗</span>
          </a>`,
        )
        .join("")
    : `
      <div class="empty-decision">
        No authoritative policy evidence is available. ReliefCart has abstained from assigning an eligibility label.
      </div>`;

  const list = (items) =>
    items.length ? items.map((item) => `<li>${escapeHtml(item)}</li>`).join("") : "<li>None recorded</li>";

  $("knownFacts").innerHTML = list(reliefCase.incident.knownFacts);
  $("inferences").innerHTML = list(reliefCase.incident.inferences);
  $("missingFacts").innerHTML = list([
    ...reliefCase.incident.missingFacts,
    reliefCase.incident.reimbursementUncertainty,
  ]);
}

function renderPlan(reliefCase) {
  const element = $("plan");
  const plan = reliefCase.plan;
  const primary = plan?.primary;

  if (!plan || !primary) {
    element.innerHTML = `
      <div class="empty-decision">
        <strong>No item cleared SpecLock.</strong><br />
        ReliefCart will not prepare payment until the claim reference, policy evidence, category, size, and budget all pass.
      </div>`;
    return;
  }

  const citations = primary.decision.citations
    .map(
      (source) => `
      <a class="citation-link" href="${escapeHtml(safeUrl(source.url))}" target="_blank" rel="noreferrer">
        ${escapeHtml(source.id)} <span aria-hidden="true">↗</span>
      </a>`,
    )
    .join("");

  const abstentions = (plan.abstentions || []).slice(0, 3);
  const alternatives = plan.items
    .filter((item) => item.role === "alternative")
    .slice(0, 3);

  element.innerHTML = `
    <div class="decision-layout">
      <article class="product-card">
        <div class="product-art">${productIcon(primary.product.category)}</div>
        <div class="product-copy">
          <div class="product-topline">
            <span class="decision-badge">Supported</span>
            <strong class="product-price">${money(primary.unitPriceUsd)}</strong>
          </div>
          <h3 class="product-name">${escapeHtml(primary.product.title)}</h3>
          <p class="product-meta">
            ${escapeHtml(primary.product.category.replaceAll("_", " "))} ·
            size ${escapeHtml(primary.product.size || "not applicable")} ·
            quantity 1
          </p>
          <p class="product-rationale">${escapeHtml(primary.product.rationale)}</p>
          <ul class="reason-list">
            ${primary.decision.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}
          </ul>
          <div class="citation-links">${citations}</div>
        </div>
      </article>

      <aside class="abstention-panel">
        <h3>Deliberate refusals</h3>
        <p>Unrelated, excessive, or weakly supported products stay out of the payment path.</p>
        <div class="abstention-list">
          ${
            abstentions.length
              ? abstentions
                  .map(
                    (item) => `
                    <article class="abstention-card">
                      <strong>${escapeHtml(item.title)}</strong>
                      <p>${escapeHtml(item.reason)}</p>
                    </article>`,
                  )
                  .join("")
              : '<p class="product-meta">No rejected demo candidates.</p>'
          }
        </div>
      </aside>

      ${
        alternatives.length
          ? `
          <div class="alternatives">
            <h3>Eligible alternatives — not auto-selected</h3>
            <ul>
              ${alternatives
                .map(
                  (item) =>
                    `<li>${escapeHtml(item.product.title)} · ${money(item.unitPriceUsd)}</li>`,
                )
                .join("")}
            </ul>
          </div>`
          : ""
      }
    </div>`;
}

function renderTransactionSteps(reliefCase) {
  const completed = [
    Boolean(reliefCase.quote),
    Boolean(reliefCase.payment),
    reliefCase.payment?.status === "completed" || ["paid", "checked_out"].includes(reliefCase.status),
    Boolean(reliefCase.checkout?.orderId),
  ];
  const active = completed.findIndex((value) => !value);
  [...$("transactionSteps").children].forEach((item, index) => {
    item.classList.toggle("is-complete", completed[index]);
    item.classList.toggle("is-active", index === (active === -1 ? 3 : active));
  });
}

function renderPayment(reliefCase) {
  const element = $("pay");
  const parts = [];

  if (reliefCase.quote) {
    const quote = reliefCase.quote;
    parts.push(`
      <div class="quote-receipt">
        <div>
          <p class="receipt-label">Fresh quote · ${escapeHtml(quote.merchantName)}</p>
          <p class="receipt-total">${money(quote.totalAmount)}</p>
        </div>
        <dl class="receipt-details">
          <dt>Item</dt><dd>${money(quote.subtotal)}</dd>
          <dt>Shipping</dt><dd>${money(quote.shipping)}</dd>
          <dt>Tax</dt><dd>${money(quote.tax)}</dd>
          <dt>Expires</dt><dd>${escapeHtml(shortDate(quote.expiresAt))}</dd>
        </dl>
      </div>`);
  }

  if (reliefCase.payment) {
    const payment = reliefCase.payment;
    parts.push(`
      <div class="payment-state">
        <div>
          <p class="payment-label">Payment session</p>
          <strong>${escapeHtml(statusCopy(payment.status === "completed" ? "paid" : "awaiting_payment"))}</strong>
          <p>The approval amount is bound to the current quote.</p>
        </div>
        <div class="state-value">
          <p class="payment-label">${money(payment.totalAmount)} ${escapeHtml(payment.currency)}</p>
          <p class="mono">${escapeHtml(payment.sessionId)}</p>
        </div>
      </div>`);
  }

  if (reliefCase.checkout?.orderId) {
    const checkout = reliefCase.checkout;
    parts.push(`
      <div class="order-state">
        <div>
          <p class="payment-label">Checkout confirmed</p>
          <strong>Order placed</strong>
          <p>${checkout.replayed ? "Original order returned safely." : "Merchant returned a non-empty order ID."}</p>
        </div>
        <div class="state-value">
          <p class="payment-label">Order ID</p>
          <p class="mono">${escapeHtml(checkout.orderId)}</p>
        </div>
      </div>`);
  }

  element.innerHTML = parts.length
    ? `<div class="payment-stack">${parts.join("")}</div>`
    : "<p>Select “Request sandbox quote” to calculate shipping, tax, and the exact approval total.</p>";

  renderTransactionSteps(reliefCase);
}

function layerCopy(layer) {
  return {
    "deterministically-verified": "Verified",
    "model-inferred": "Inferred",
    "sandbox-enforced": "Sandbox",
  }[layer] || layer;
}

function renderClaim(reliefCase) {
  const section = $("claimSection");
  const element = $("claim");
  const packet = reliefCase.claimPack;

  section.hidden = !packet;
  if (!packet) {
    element.innerHTML = "";
    return;
  }

  element.innerHTML = `
    <article class="claim-hero">
      <div>
        <div class="claim-order">
          <span class="claim-check" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="m6 12 4 4 8-9" /></svg>
          </span>
          <div>
            <h3>${escapeHtml(packet.product.title)}</h3>
            <p>
              ${escapeHtml(packet.product.merchantName)} ·
              <span class="mono">${escapeHtml(packet.product.orderId)}</span>
            </p>
          </div>
        </div>
        <p class="claim-disclaimer">${escapeHtml(packet.disclaimer)}</p>
      </div>
      <dl class="claim-amount">
        <dt>Claim reference</dt><dd class="mono">${escapeHtml(packet.incident.claimReference)}</dd>
        <dt>Exact order total</dt><dd>${money(packet.amounts.quotedTotal)}</dd>
        <dt>Budget before</dt><dd>${money(packet.amounts.remainingBudgetBefore)}</dd>
        <dt>Budget after</dt><dd>${money(packet.amounts.remainingBudgetAfter)}</dd>
        <dt>Generated</dt><dd>${escapeHtml(shortDate(packet.generatedAt))}</dd>
      </dl>
    </article>

    <div class="claim-grid">
      <article class="claim-card">
        <h3>Policy evidence</h3>
        ${packet.policyCitations
          .map(
            (source) => `
            <a class="claim-source" href="${escapeHtml(safeUrl(source.url))}" target="_blank" rel="noreferrer">
              <strong>${escapeHtml(source.title)} ↗</strong>
              <span>${escapeHtml(source.excerpt)}</span>
            </a>`,
          )
          .join("")}
      </article>

      <article class="claim-card">
        <h3>Control ledger</h3>
        ${packet.controlLayers
          .map(
            (item) => `
            <div class="control-row">
              <span class="control-label ${escapeHtml(item.layer)}">${escapeHtml(layerCopy(item.layer))}</span>
              <p>${escapeHtml(item.control)}</p>
            </div>`,
          )
          .join("")}
      </article>

      <article class="claim-card">
        <h3>Eligibility language</h3>
        <ul class="claim-list">
          <li>${escapeHtml(packet.eligibilityLanguage)}</li>
          <li>${escapeHtml(packet.product.rationale)}</li>
          <li>${escapeHtml(packet.incident.reimbursementUncertainty)}</li>
        </ul>
      </article>

      <article class="claim-card">
        <h3>Incident record</h3>
        <ul class="claim-list">
          ${packet.incident.knownFacts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join("")}
        </ul>
      </article>
    </div>`;
}

function updateActions(reliefCase) {
  const quoteButton = $("quoteBtn");
  const payButton = $("payBtn");
  const approvalLink = $("approvalLink");
  const approveButton = $("approveBtn");
  const declineButton = $("declineBtn");
  const checkoutButton = $("checkoutBtn");

  quoteButton.textContent = "Request sandbox quote";

  if (!reliefCase) {
    [quoteButton, payButton, approveButton, declineButton, checkoutButton].forEach((button) => {
      button.disabled = true;
    });
    approvalLink.hidden = true;
    return;
  }

  const paymentPending = reliefCase.payment?.status === "pending";
  const paymentCompleted = reliefCase.payment?.status === "completed";
  const terminal = reliefCase.status === "checked_out";
  const canQuote =
    Boolean(reliefCase.plan?.primary) &&
    !["aborted", "failed", "awaiting_payment", "paid", "checked_out"].includes(reliefCase.status);
  const canPay =
    Boolean(reliefCase.quote) &&
    reliefCase.status === "quoted" &&
    (!reliefCase.payment || reliefCase.payment.status === "failed");

  quoteButton.disabled = !canQuote;
  payButton.disabled = !canPay;
  checkoutButton.disabled = terminal || !paymentCompleted;

  approvalLink.hidden = !paymentPending;
  if (paymentPending) {
    approvalLink.href = safeUrl(reliefCase.payment.paymentUrl);
  } else {
    approvalLink.removeAttribute("href");
  }

  const showMockControls = paymentPending;
  approveButton.hidden = !showMockControls;
  declineButton.hidden = !showMockControls;
  approveButton.disabled = !showMockControls;
  declineButton.disabled = !showMockControls;

  if (terminal) {
    quoteButton.disabled = true;
    payButton.disabled = true;
    approveButton.disabled = true;
    declineButton.disabled = true;
  }

  $("transactionNote").textContent = terminal
    ? "The original order is now locked to this case. Duplicate checkout requests return the same order."
    : paymentCompleted
      ? "Approval is complete. Checkout can now place exactly one order."
      : paymentPending
        ? "Open the secure approval page. ReliefCart will refresh when the payment status changes."
        : reliefCase.quote
          ? "The quote does not place an order. Create an exact-total approval session when ready."
          : "A quote does not place an order. Checkout remains locked until approval completes.";
}

function setCase(reliefCase) {
  current = reliefCase;
  renderJourney(reliefCase);

  $("emptyState").hidden = Boolean(reliefCase);
  $("caseView").hidden = !reliefCase;

  if (!reliefCase) {
    updateActions(null);
    return;
  }

  renderCaseHeader(reliefCase);
  renderUatHandoff(reliefCase);
  renderBudget(reliefCase);
  renderEvidence(reliefCase);
  renderPlan(reliefCase);
  renderPayment(reliefCase);
  renderClaim(reliefCase);
  updateActions(reliefCase);
}

function validateIntake() {
  const incident = $("incident");
  const cap = $("cap");
  const nights = $("nights");
  [incident, cap, nights].forEach((field) => field.removeAttribute("aria-invalid"));

  if (incident.value.trim().length < 20) {
    incident.setAttribute("aria-invalid", "true");
    setFormMessage("Paste a delay notice of at least 20 characters.");
    incident.focus();
    return false;
  }

  const capValue = Number(cap.value);
  if (!Number.isFinite(capValue) || capValue < 1 || capValue > 500) {
    cap.setAttribute("aria-invalid", "true");
    setFormMessage("Set a personal cap between $1 and $500.");
    cap.focus();
    return false;
  }

  const nightsValue = Number(nights.value);
  if (!Number.isInteger(nightsValue) || nightsValue < 1 || nightsValue > 7) {
    nights.setAttribute("aria-invalid", "true");
    setFormMessage("Set the delay window between 1 and 7 nights.");
    nights.focus();
    return false;
  }

  setFormMessage("");
  return true;
}

function schedulePaymentPoll(attempt = 0) {
  window.clearTimeout(paymentPollTimer);
  if (!current?.payment || current.payment.status !== "pending" || attempt > 40) return;

  paymentPollTimer = window.setTimeout(async () => {
    try {
      const refreshed = await api(`/api/cases/${current.id}/payment-status`);
      setCase(refreshed);
      if (refreshed.payment?.status === "pending") {
        schedulePaymentPoll(attempt + 1);
      } else if (refreshed.payment?.status === "completed") {
        showToast("Payment approved. The order is ready to place.");
      }
    } catch {
      schedulePaymentPoll(attempt + 1);
    }
  }, 1600);
}

function downloadClaimPack() {
  if (!current?.claimPack) return;
  const blob = new Blob([JSON.stringify(current.claimPack, null, 2)], {
    type: "application/json",
  });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `reliefcart-${current.incident.claimReference || current.id}-claim-pack.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

async function init() {
  initThemeControl();

  const [healthResponse, airlineResponse] = await Promise.all([
    api("/api/health"),
    api("/api/airlines"),
  ]);
  health = healthResponse;

  const badge = $("modeBadge");
  badge.classList.add("is-ready");
  badge.lastChild.textContent = " Sandbox transaction";

  $("airline").innerHTML = airlineResponse.airlines
    .map(
      (airline) =>
        `<option value="${escapeHtml(airline.id)}">${escapeHtml(airline.name)} · ${money(airline.dailyCapUsd)}/day</option>`,
    )
    .join("");

  $("loadDemo").addEventListener("click", async () => {
    try {
      const { text } = await api("/api/demo/incident");
      $("incident").value = text;
      $("airline").value = "united";
      $("incident").removeAttribute("aria-invalid");
      setFormMessage("");
      showToast("Synthetic PIR loaded. Review the details, then build the plan.");
    } catch (error) {
      showToast(error.message, "error");
    }
  });

  $("intakeForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validateIntake()) return;

    const alreadyHas = $("already")
      .value.split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const result = await runAction(
      $("planBtn"),
      () =>
        api("/api/cases", {
          method: "POST",
          body: JSON.stringify({
            rawIncidentText: $("incident").value.trim(),
            airlineHint: $("airline").value,
            needs: {
              size: $("size").value,
              urgentNeed: $("need").value,
              alreadyHas,
              personalCapUsd: Number($("cap").value),
              nights: Number($("nights").value),
            },
          }),
        }),
      "Evidence checked. ReliefCart prepared one bounded recommendation.",
    );

    if (result) {
      $("caseView").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  $("resetBtn").addEventListener("click", () => {
    window.clearTimeout(paymentPollTimer);
    setCase(null);
    $("intakePanel").scrollIntoView({ behavior: "smooth", block: "start" });
    showToast("Ready for a new recovery case.");
  });

  $("quoteBtn").addEventListener("click", async () => {
    if (!current) return;
    await runAction(
      $("quoteBtn"),
      () => api(`/api/cases/${current.id}/quote`, { method: "POST", body: "{}" }),
      "Fresh quote received. Tax and shipping are now included.",
    );
  });

  $("payBtn").addEventListener("click", async () => {
    if (!current) return;
    const result = await runAction(
      $("payBtn"),
      () => api(`/api/cases/${current.id}/pay`, { method: "POST", body: "{}" }),
      "Approval session created. No money has moved yet.",
    );
    if (result?.payment?.status === "pending") schedulePaymentPoll();
  });

  $("approveBtn").addEventListener("click", async () => {
    if (!current) return;
    await runAction(
      $("approveBtn"),
      () => api(`/api/cases/${current.id}/mock-approve`, { method: "POST", body: "{}" }),
      "Sandbox payment approved. Checkout is now unlocked.",
    );
  });

  $("declineBtn").addEventListener("click", async () => {
    if (!current) return;
    await runAction(
      $("declineBtn"),
      () => api(`/api/cases/${current.id}/mock-decline`, { method: "POST", body: "{}" }),
      "Payment declined. No order was placed.",
    );
  });

  $("checkoutBtn").addEventListener("click", async () => {
    if (!current) return;
    const result = await runAction(
      $("checkoutBtn"),
      () => api(`/api/cases/${current.id}/checkout`, { method: "POST", body: "{}" }),
      "Order placed. The claim-support packet is ready.",
    );
    if (result?.status === "checked_out") {
      $("claimSection").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  $("downloadBtn").addEventListener("click", downloadClaimPack);
  $("printBtn").addEventListener("click", () => window.print());

  window.addEventListener("focus", async () => {
    if (!current?.payment || current.payment.status !== "pending") return;
    try {
      setCase(await api(`/api/cases/${current.id}/payment-status`));
    } catch {
      // Polling will retry; keep the visible state stable.
    }
  });

  setCase(null);
}

init().catch((error) => {
  $("modeBadge").lastChild.textContent = " Connection failed";
  setFormMessage("ReliefCart could not connect to the local service. Restart the app and try again.");
  showToast(error.message, "error");
});
