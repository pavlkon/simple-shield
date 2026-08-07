// Simple Shield Ad Blocker - content script
// applies cosmetic (element-hiding) filters to the current page.
(() => {
  const api = typeof browser !== "undefined" ? browser : chrome;

  // tons of selectors in easylist use legacy/extended syntax (:-abp-, :has, :contains, etc.) that plain CSS .hidden classing cant express
  // we only take selectors that are valid standard CSS so unsupported ones are silently skipped
  // rather than throwing and blocking the whole batch.
  function isSelectorSafe(selector) {
    try {
      document.querySelector(selector);
      return true;
    } catch (e) {
      return false;
    }
  }

  function hostnameMatches(ruleDomain, hostname) {
    return hostname === ruleDomain || hostname.endsWith("." + ruleDomain);
  }

  async function applyCosmeticFilters() {
    let data;
    try {
      const url = api.runtime.getURL("rules/cosmetic_rules.json");
      const res = await fetch(url);
      data = await res.json();
    } catch (e) {
      return; // rules file not available fail silently network blocking still works
    }

    const hostname = location.hostname;
    const selectors = new Set();

    // generic selectors apply everywhere unless a same domain exception cancels them
    const exceptionSelectors = new Set();
    for (const [domain, sels] of Object.entries(data.exceptions || {})) {
      if (hostnameMatches(domain, hostname)) {
        sels.forEach(s => exceptionSelectors.add(s));
      }
    }

    for (const sel of data.generic || []) {
      if (!exceptionSelectors.has(sel)) selectors.add(sel);
    }

    for (const [domain, sels] of Object.entries(data.perDomain || {})) {
      if (hostnameMatches(domain, hostname)) {
        sels.forEach(s => {
          if (!exceptionSelectors.has(s)) selectors.add(s);
        });
      }
    }

    if (selectors.size === 0) return;

    // build one stylesheet in batches to avoid one bad selector breaking the rest
    const validSelectors = [];
    for (const sel of selectors) {
      if (isSelectorSafe(sel)) validSelectors.push(sel);
    }
    if (validSelectors.length === 0) return;

    const CHUNK = 800; // keep individual style rules from getting unwieldy
    let css = "";
    for (let i = 0; i < validSelectors.length; i += CHUNK) {
      css += validSelectors.slice(i, i + CHUNK).join(",\n") + " { display: none !important; }\n";
    }

    const style = document.createElement("style");
    style.id = "simple-shield-cosmetic-filters";
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyCosmeticFilters, { once: true });
  } else {
    applyCosmeticFilters();
  }
})();
