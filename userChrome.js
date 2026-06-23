// Password Notes – userChrome.js (Chrome-Prozess)
// Detects about:logins, loads frame script, handles file I/O

(function () {

  // ── Notes file

  const notesFilePath = PathUtils.join(
    Services.dirsvc.get("ProfD", Components.interfaces.nsIFile).path,
    "password-notes.json"
  );

  async function loadNotes() {
    try {
      return await IOUtils.readJSON(notesFilePath);
    } catch {
      return {};
    }
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
    popup.addEventListener("popupshown", async () => {
      const host = gBrowser.currentURI?.host;
      if (!host) return;

      const notes = await loadNotes();

      // Notes of the current host: Username -> Note text
      const hostNotes = {};
      for (const [key, val] of Object.entries(notes)) {
        try {
          const origin   = key.split(":::")[0];
          const username = key.split(":::")[1];
          const originHost = new URL(origin).hostname;
          if (originHost === host || originHost.endsWith("." + host) || host.endsWith("." + originHost)) {
            hostNotes[username] = val.note;
          }
        } catch {}
      }

      if (!Object.keys(hostNotes).length) return;

      const box = popup.querySelector("richlistbox") || popup.querySelector(".autocomplete-richlistbox");
      if (!box) return;

      const items = box.querySelectorAll("richlistitem");

      items.forEach(item => {
        const username = item.getAttribute("ac-value");
        if (!username) return;
        const note = hostNotes[username];
        if (!note) return;
        // Update existing note instead of skipping it (on page reload)
        const existing = item.querySelector(".pwn-note");
        if (existing) { existing.textContent = note; return; }

        const noteEl = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
        noteEl.className = "pwn-note";
        noteEl.textContent = note;
        noteEl.style.cssText = "font-size:1.0em; color:#737373; padding-left:68px; margin-top:-4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;";

        const wrapper = item.querySelector(".two-line-wrapper");
        if (!wrapper) { item.appendChild(noteEl); return; }

        // Line flex wrap – note takes the full width of a new line
        wrapper.style.flexWrap = "wrap";
        wrapper.style.alignContent = "center";
        noteEl.style.flex = "0 0 100%";
        wrapper.appendChild(noteEl);
      });
    });
  }

})();
