// simple shield ad blocker - background script
const api = typeof browser !== "undefined" ? browser : chrome;

let blockedDomains = new Set();
let blockedPaths = [];
let disabledSites = new Set();
const blockedCountByTab = new Map();
const pendingBadgeTabs = new Set();

// fast url hostname extractor without new URL() allocations
function getHostname(urlStr) {
  let start = urlStr.indexOf("://");
  start = (start === -1) ? 0 : start + 3;

  let end = urlStr.indexOf("/", start);
  if (end === -1) end = urlStr.length;

  let question = urlStr.indexOf("?", start);
  if (question !== -1 && question < end) end = question;

  let colon = urlStr.indexOf(":", start);
  if (colon !== -1 && colon < end) end = colon;

  return urlStr.slice(start, end).toLowerCase();
}

// dynamically load json chunks into memory
async function loadRules() {
  try {
    const pathUrl = api.runtime.getURL("rules/network_paths.json");
    const pathRes = await fetch(pathUrl);
    const pathData = await pathRes.json();
    blockedPaths = pathData.paths || [];

    const allDomains = [];
    let chunkIdx = 0;

    while (true) {
      try {
        const chunkUrl = api.runtime.getURL(`rules/network_rules_${chunkIdx}.json`);
        const res = await fetch(chunkUrl);
        if (!res.ok) break;
        const data = await res.json();
        if (data && data.domains) {
          for (let i = 0; i < data.domains.length; i++) {
            allDomains.push(data.domains[i]);
          }
        }
        chunkIdx++;
      } catch (e) {
        break;
      }
    }

    blockedDomains = new Set(allDomains);
    console.log(`[Simple Shield] Loaded ${blockedDomains.size} domains from ${chunkIdx} chunks.`);
  } catch (e) {
    console.error("[Simple Shield] Failed to load rules:", e);
  }
}

async function loadSettings() {
  const stored = await api.storage.local.get("disabledSites");
  disabledSites = new Set(stored.disabledSites || []);
}

api.runtime.onInstalled.addListener(() => {
  loadRules();
  loadSettings();
});
api.runtime.onStartup.addListener(() => {
  loadRules();
  loadSettings();
});

api.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.disabledSites) {
    disabledSites = new Set(changes.disabledSites.newValue || []);
  }
});

// throttled badge UI update
function bumpBlockedCount(tabId) {
  if (tabId === undefined || tabId < 0) return;
  const count = (blockedCountByTab.get(tabId) || 0) + 1;
  blockedCountByTab.set(tabId, count);

  if (!pendingBadgeTabs.has(tabId)) {
    pendingBadgeTabs.add(tabId);
    setTimeout(() => {
      pendingBadgeTabs.delete(tabId);
      const latest = blockedCountByTab.get(tabId) || 0;
      api.action.setBadgeText({ tabId, text: String(latest) });
      api.action.setBadgeBackgroundColor({ tabId, color: "#2b8a3e" });
    }, 250);
  }
}

// core webRequest blocking engine
api.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (blockedDomains.size === 0 || details.tabId < 0 || details.type === "main_frame") {
      return { cancel: false };
    }

    const hostname = getHostname(details.url);
    if (!hostname) return { cancel: false };

    // youtube and google avatar safety bypass
    if (hostname.endsWith("googlevideo.com") || hostname.endsWith("ytimg.com") || hostname.endsWith("ggpht.com") || hostname.endsWith("googleusercontent.com")) {
      return { cancel: false };
    }

    // site whitelist check
    if (details.documentUrl && disabledSites.size > 0) {
      const docHost = getHostname(details.documentUrl);
      if (disabledSites.has(docHost)) return { cancel: false };
    }

    // explicit path rules check
    if (blockedPaths.length > 0) {
      const fullUrlLower = details.url.toLowerCase();
      for (let i = 0; i < blockedPaths.length; i++) {
        if (fullUrlLower.includes(blockedPaths[i])) {
          bumpBlockedCount(details.tabId);
          return { cancel: true };
        }
      }
    }

    // first-party protection with ad-path override
    if (details.documentUrl) {
      const docHost = getHostname(details.documentUrl);

      if (hostname === docHost || hostname.endsWith("." + docHost) || docHost.endsWith("." + hostname)) {
        const urlLower = details.url.toLowerCase();
        const isAdPath = urlLower.includes("/ad") || urlLower.includes("/ads") || urlLower.includes("adblock") || urlLower.includes("/pixel") || urlLower.includes("/telemetry") || urlLower.includes("/analytics") || urlLower.includes("/pagead");

        if (blockedDomains.has(hostname) && isAdPath) {
          bumpBlockedCount(details.tabId);
          return { cancel: true };
        }

        return { cancel: false };
      }
    }

    // domain set lookup
    if (blockedDomains.has(hostname)) {
      bumpBlockedCount(details.tabId);
      return { cancel: true };
    }

    // subdomain cascade
    let pos = hostname.indexOf('.');
    while (pos !== -1) {
      const parent = hostname.slice(pos + 1);
      if (blockedDomains.has(parent)) {
        bumpBlockedCount(details.tabId);
        return { cancel: true };
      }
      pos = hostname.indexOf('.', pos + 1);
    }

    return { cancel: false };
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);

api.tabs.onRemoved.addListener((tabId) => {
  blockedCountByTab.delete(tabId);
  pendingBadgeTabs.delete(tabId);
});

if (api.webNavigation) {
  api.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId === 0) {
      blockedCountByTab.set(details.tabId, 0);
      api.action.setBadgeText({ tabId: details.tabId, text: "" });
    }
  });
}

// popup messaging
api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg.type === "GET_STATE") {
      const tabId = msg.tabId;
      const { disabledSites = [], enabled = true } = await api.storage.local.get(["disabledSites", "enabled"]);
      sendResponse({
        blockedCount: blockedCountByTab.get(tabId) || 0,
                   disabledSites,
                   enabled,
      });
    } else if (msg.type === "TOGGLE_SITE") {
      const { disabledSites = [] } = await api.storage.local.get("disabledSites");
      const idx = disabledSites.indexOf(msg.domain);
      if (idx === -1) disabledSites.push(msg.domain);
      else disabledSites.splice(idx, 1);
      await api.storage.local.set({ disabledSites });
      sendResponse({ disabledSites });
    }
  })();
  return true;
});

loadRules();
loadSettings();
