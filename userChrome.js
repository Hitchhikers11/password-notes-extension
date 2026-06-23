// Password Notes – userChrome.js (Chrome process)
// Detects about:logins, loads frame script, handles file I/O

(function () {

  // ── Notes file

  const notesFilePath = PathUtils.join(
    Services.dirsvc.get("ProfD", Components.interfaces.nsIFile).path,
    "password-notes.json"
  );

  async function loadNotes() {
    try {
      const raw = await IOUtils.readJSON(notesFilePath);
      return migrateKeys(raw);
    } catch {
      return {};
    }
  }

  // Migrate old keys (full origin or hostname) → base domain, e.g. "https://dev.example.com:::user" → "example.com:::user"
  function migrateKeys(notes) {
    let changed = false;
    const out = {};
    for (const [key, val] of Object.entries(notes)) {
      try {
        const sep = key.indexOf(":::");
        const originOrHost = key.slice(0, sep);
        const username = key.slice(sep + 3);
        const hostname = originOrHost.includes("://") ? new URL(originOrHost).hostname : originOrHost;
        const newKey = `${Services.eTLD.getBaseDomainFromHost(hostname)}:::${username}`;
        if (newKey !== key) { out[newKey] = val; changed = true; continue; }
      } catch {}
      out[key] = val;
    }
    if (changed) IOUtils.writeJSON(notesFilePath, out, { indent: 2 }).catch(() => {});
    return out;
  }

  async function saveNotes(notes) {
    await IOUtils.writeJSON(notesFilePath, notes, { indent: 2 });
  }

  // ── Frame Script URL (located in profile/chrome/)

  const frameScriptURL = (() => {
    const f = Services.dirsvc.get("ProfD", Components.interfaces.nsIFile).clone();
    f.append("chrome");
    f.append("aboutlogins-notes.js");
    return Services.io.newFileURI(f).spec;
  })();

  // ── Message handler between Frame Script and Chrome process

  const listenedBrowsers = new WeakSet();

  function setupBrowser(browser) {
    const mm = browser.messageManager;
    if (listenedBrowsers.has(browser)) return;
    listenedBrowsers.add(browser);

    mm.addMessageListener("pwn:getNotes", async () => {
      const notes = await loadNotes();
      mm.sendAsyncMessage("pwn:notesData", notes);
    });

    mm.addMessageListener("pwn:saveNotes", async (msg) => {
      await saveNotes(msg.data);
    });

    mm.loadFrameScript(frameScriptURL, false);
  }

  // ── Tab monitoring

  const tabListener = {
    onLocationChange(browser, webProgress, request, location) {
      if (!webProgress.isTopLevel) return;
      if (!location.spec.startsWith("about:logins")) return;
      setupBrowser(browser);

      // URL hash = GUID of a preselected login (e.g., direct edit from autocomplete)
      const ref = (() => { try { return location.ref; } catch { return ""; } })();
      if (!ref) return;
      try {
        const guid = decodeURIComponent(ref); // e.g. {f9b96227-...}
        const mm = browser.messageManager;
        Services.logins.getAllLogins().then(allLogins => {
          const login = allLogins.find(l => l.guid === guid);
          if (!login) return;
          const loginData = { origin: login.origin || login.hostname, username: login.username };
          loadNotes().then(notes => mm.sendAsyncMessage("pwn:initialLogin", { login: loginData, notes }));
        }).catch(() => {});
      } catch {}
    }
  };

  gBrowser.addTabsProgressListener(tabListener);

  // ── Autocomplete Popup: Display notes as a third line

  const popup = document.getElementById("PopupAutoComplete");
  if (popup) {
    let annotateTimer = null;

    async function annotatePopup() {
      let host;
      try { host = gBrowser.currentURI?.host; } catch { return; }
      if (!host) return;

      const notes = await loadNotes();

      let baseHost;
      try { baseHost = Services.eTLD.getBaseDomainFromHost(host); } catch { baseHost = host; }

      const hostNotes = {};
      for (const [key, val] of Object.entries(notes)) {
        try {
          const sep = key.indexOf(":::");
          const keyHost = key.slice(0, sep);
          const username = key.slice(sep + 3);
          if (keyHost === baseHost) hostNotes[username] = val.note;
        } catch {}
      }

      const box = popup.querySelector("richlistbox") || popup.querySelector(".autocomplete-richlistbox");
      if (!box) return;

      box.querySelectorAll("richlistitem").forEach(item => {
        const acValue = item.getAttribute("ac-value");
        if (!acValue) return;
        // Firefox appends " (date)" to disambiguate duplicate usernames — strip it
        const username = acValue.replace(/\s*\([^)]+\)\s*$/, "");
        const note     = hostNotes[username];
        const existing = item.querySelector(".pwn-note");
        if (!note) { existing?.remove(); return; }
        if (existing) { existing.textContent = note; return; }

        const noteEl = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
        noteEl.className = "pwn-note";
        noteEl.textContent = note;
        noteEl.style.cssText = "font-size:1.0em; color:#737373; padding-left:68px; margin-top:-4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;";

        const wrapper = item.querySelector(".two-line-wrapper");
        if (!wrapper) { item.appendChild(noteEl); return; }

        wrapper.style.flexWrap  = "wrap";
        wrapper.style.alignContent = "center";
        noteEl.style.flex = "0 0 100%";
        wrapper.appendChild(noteEl);
      });
    }

    let observer = null;

    popup.addEventListener("popupshown", () => {
      annotatePopup();

      // Set up observer each time the popup opens
      const box = popup.querySelector("richlistbox") || popup.querySelector(".autocomplete-richlistbox");
      if (box && !observer) {
        observer = new MutationObserver(() => {
          clearTimeout(annotateTimer);
          annotateTimer = setTimeout(annotatePopup, 80);
        });
        observer.observe(box, { childList: true, subtree: true, attributes: true, attributeFilter: ["ac-value"] });
      }
    });

    popup.addEventListener("popuphidden", () => {
      observer?.disconnect();
      observer = null;
    });
  }

})();
