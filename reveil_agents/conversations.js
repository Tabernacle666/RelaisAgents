"use strict";
// Règles communes au popup et au service worker.
// Seule l'identité visuelle du titre est conservée entre deux conversations.
// Comparaison STRICTE de titres propres : ni masque, ni sous-chaîne, ni tolérance de casse.
globalThis.ChatConversations = (() => {
  const ORIGINS = new Set(["https://chatgpt.com", "https://chat.openai.com"]);
  function key(rawUrl) {
    try {
      const url = new URL(rawUrl);
      if (!ORIGINS.has(url.origin)) return null;
      const path = url.pathname.replace(/\/$/, "");
      if (!/^\/(?:c\/[\w-]+|g\/[^/]+\/c\/[\w-]+)$/.test(path)) return null;
      return url.origin + path;
    } catch (_) { return null; }
  }
  function title(rawTitle) {
    // Le titre visible dans la liste déroulante est la clé de rapprochement.
    // On n'enlève que le préfixe/suffixe de marque du navigateur, comme en v1.3.
    const result = String(rawTitle || "")
      .replace(/^\s*(ChatGPT|OpenAI)\s*[-–—|]\s*/i, "")
      .replace(/\s*[-–—|]\s*(ChatGPT|OpenAI)\s*$/i, "")
      .replace(/\s+/g, " ").trim();
    return result && !["ChatGPT", "OpenAI", "Conversation sans titre"].includes(result) ? result : "";
  }
  function open(tabs) {
    return (tabs || []).filter(t => key(t.url)).map(t => ({
      tab:t, key:key(t.url), title:title(t.title)
    }));
  }
  // L’URL sélectionnée prime. Si elle est absente, le titre exact sert de secours.
  // l'URL explicitement sélectionnée sert UNIQUEMENT à lever l'ambiguïté.
  function resolve(tabs, savedTitle, savedUrl) {
    const candidates = open(tabs);
    const oldKey = key(savedUrl);
    // The user's explicit selection is authoritative, even after a rename
    // or when another conversation still carries the old title.
    const selected=candidates.find(t=>t.key===oldKey);
    if(selected)return {tab:selected.tab,mode:'url-selectionnee'};
    if (savedTitle) {
      const matches = candidates.filter(t => t.title === savedTitle);
      if (matches.length === 1) return {tab:matches[0].tab, mode:"titre"};
      if (matches.length > 1) {
        const explicit = matches.filter(t => t.key === oldKey);
        if (explicit.length === 1) return {tab:explicit[0].tab, mode:"url-explicite"};
        return {error:`Plusieurs onglets portent exactement le titre « ${savedTitle} ». Sélectionne le nouvel onglet dans l'extension ou ferme l'ancien.`};
      }
      return {error:`Aucun onglet ChatGPT ouvert ne porte exactement le titre « ${savedTitle} ». Ouvre cette conversation dans un onglet ; l'ancienne URL ne sera pas réutilisée.`};
    }
    // Compatibilité avec un réglage créé en v1.3.1, avant l'enregistrement des titres.
    const existing = candidates.find(t => t.key === oldKey);
    return existing ? {tab:existing.tab, mode:"ancienne-url", discoveredTitle:existing.title} : {legacyUrl:savedUrl};
  }
  return {key,title,open,resolve};
})();
