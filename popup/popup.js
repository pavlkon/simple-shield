const api = typeof browser !== "undefined" ? browser : chrome;

let currentTabId = null;
let currentDomain = null;

function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return null;
  }
}

async function init() {
  // query lastFocusedWindow so firefox gets the webpage tab instead of the popup context
  const tabs = await api.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs[0];
  if (!tab) return;

  currentTabId = tab.id;
  currentDomain = extractDomain(tab.url);

  document.getElementById("siteName").textContent = currentDomain || "this page";

  // fetch blocked count from background script
  try {
    const state = await api.runtime.sendMessage({ type: "GET_STATE", tabId: currentTabId });
    if (state && state.blockedCount !== undefined) {
      document.getElementById("blockedCount").textContent = state.blockedCount;
    }
  } catch (e) {
    // fallback: Read badge text directly
    if (api.action && api.action.getBadgeText) {
      const text = await api.action.getBadgeText({ tabId: currentTabId });
      document.getElementById("blockedCount").textContent = text || "0";
    }
  }

  // site toggle state
  const state = await api.runtime.sendMessage({ type: "GET_STATE", tabId: currentTabId }).catch(() => ({ disabledSites: [] }));
  const isDisabled = currentDomain && state.disabledSites && state.disabledSites.includes(currentDomain);
  const toggle = document.getElementById("siteToggle");
  toggle.checked = !isDisabled;
  updateHint(!isDisabled);

  toggle.addEventListener("change", async () => {
    if (!currentDomain) return;
    await api.runtime.sendMessage({ type: "TOGGLE_SITE", domain: currentDomain });
    updateHint(toggle.checked);
    api.tabs.reload(currentTabId);
  });

  await renderCustomRules();

  document.getElementById("addRuleBtn").addEventListener("click", addRule);
  document.getElementById("customRuleInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addRule();
  });
}

function updateHint(enabled) {
  const hint = document.getElementById("toggleHint");
  hint.textContent = enabled ? "Blocking enabled here" : "Blocking paused on this site";
}

async function renderCustomRules() {
  try {
    const { customRules = [] } = await api.runtime.sendMessage({ type: "GET_CUSTOM_RULES" });
    const list = document.getElementById("customRuleList");
    list.innerHTML = "";
    customRules.forEach((rule) => {
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.textContent = rule;
      const btn = document.createElement("button");
      btn.textContent = "✕";
      btn.title = "Remove";
      btn.addEventListener("click", async () => {
        await api.runtime.sendMessage({ type: "REMOVE_CUSTOM_RULE", rule });
        renderCustomRules();
      });
      li.appendChild(span);
      li.appendChild(btn);
      list.appendChild(li);
    });
  } catch (e) {}
}

async function addRule() {
  const input = document.getElementById("customRuleInput");
  const value = input.value.trim();
  if (!value) return;
  await api.runtime.sendMessage({ type: "ADD_CUSTOM_RULE", rule: value });
  input.value = "";
  renderCustomRules();
}

init();
