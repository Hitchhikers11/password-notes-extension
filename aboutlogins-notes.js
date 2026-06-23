// Password Notes – aboutlogins-notes.js (Frame Script)

// Initialize only once per page load
if (content._pwnInit) {
} else {
  content._pwnInit = true;
  run();
}

const i18n = (() => {
  const lang = Services.locale.appLocaleAsBCP47.split("-")[0];
  const strings = {
    de: { label: "Info", placeholder: "Info zu diesem Login...", saved: "Gespeichert" },
    fr: { label: "Info", placeholder: "Info pour cette connexion...", saved: "Enregistré" },
    es: { label: "Info", placeholder: "Info para este inicio de sesión...", saved: "Guardado" },
    it: { label: "Info", placeholder: "Info per questo accesso...", saved: "Salvato" },
    nl: { label: "Info", placeholder: "Info voor deze login...", saved: "Opgeslagen" },
  };
  return strings[lang] || { label: "Info", placeholder: "Info for this login...", saved: "Saved" };
})();

async function run() {
  async function init() {
    // Intercept the event immediately – BEFORE await – to ensure that no InitialLoginSelected event is missed.
    let pendingInitialLogin = null;
    const earlyListener = (e) => { pendingInitialLogin = e.detail; };
    addEventListener("AboutLoginsInitialLoginSelected", earlyListener, { capture: true, once: true });

    await new Promise(resolve => {
      if (content.document.readyState === "complete") {
        resolve();
      } else {
        addEventListener("load", resolve, { once: true, capture: true });
      }
    });

    const doc     = content.document;
    await doc.defaultView.customElements.whenDefined("login-item");

    const loginItem = doc.querySelector("login-item");
    if (!loginItem) return;

    // ── Notes data

    let currentLogin = null;
    let notes        = {};
    let saveTimer    = null;

    sendAsyncMessage("pwn:getNotes");
    addMessageListener("pwn:notesData", (msg) => {
      notes = msg.data || {};
      if (currentLogin) buildContainer();
    });

    // Direct editing via URL hash: Chrome process sends login + notes
    addMessageListener("pwn:initialLogin", (msg) => {
      currentLogin = msg.data.login;
      notes        = msg.data.notes || {};
      buildContainer();
    });

    // ── Build container (re-injected with each login change)

    function buildContainer() {
      const shadow = loginItem.shadowRoot;
      if (!shadow) return;

      // Fallback: Derive currentLogin from Shadow DOM fields (e.g., direct URL call)
      if (!currentLogin) {
        const usernameEl = shadow.querySelector('input[name="username"]');
        const originEl   = shadow.querySelector('input[name="origin"]') || shadow.querySelector('.origin-input');
        if (usernameEl?.value) {
          currentLogin = { origin: originEl?.value || "", username: usernameEl.value };
          sendAsyncMessage("pwn:getNotes");
        }
      }

      // Remove old container
      shadow.querySelector(".pwn-container")?.remove();

      const container = doc.createElement("div");
      container.className = "pwn-container";
      container.style.cssText = "display:flex; flex-direction:column; gap:6px; margin-top:20px; padding:0 4px;";

      const isDark = content.matchMedia("(prefers-color-scheme: dark)").matches;

      const label = doc.createElement("div");
      label.textContent = i18n.label;
      label.style.cssText = `font-size:0.95em; font-weight:400; letter-spacing:0.03em; color:${isDark ? "#ffffff" : "#000000"};`;

      const input = doc.createElement("input");
      input.type = "text";
      input.placeholder = i18n.placeholder;
      const bgColor = isDark ? "rgba(255,255,255,0.08)" : "#ffffff";
      input.style.cssText = `width:100%; padding:8px 10px; border:1px solid rgba(128,128,128,0.3); border-radius:8px; color:var(--in-content-text-color, inherit); background:${bgColor}; font-family:inherit; font-size:0.9em; box-sizing:border-box;`;

      const status = doc.createElement("div");
      status.textContent = i18n.saved;
      status.style.cssText = "font-size:0.8em; color:var(--color-success, #017a40); opacity:0; transition:opacity 0.3s;";

      container.appendChild(label);
      container.appendChild(input);
      container.appendChild(status);

      // Insert into .detail-grid (last position)
      const grid = shadow.querySelector(".detail-grid");
      if (grid) { grid.appendChild(container); } else { shadow.appendChild(container); }

      // Set note value
      if (currentLogin) {
        input.value = notes[makeKey(currentLogin)]?.note || "";
      }

      // Link visibility to the read-only status of the username field
      const usernameInput = shadow.querySelector('input[name="username"]');
      if (usernameInput) {
        const updateVisibility = () => {
          container.style.display = usernameInput.hasAttribute("readonly") ? "none" : "flex";
        };
        updateVisibility();
        new content.MutationObserver(updateVisibility)
          .observe(usernameInput, { attributes: true, attributeFilter: ["readonly"] });
      }

      // Auto-save while typing
      input.addEventListener("input", () => {
        content.clearTimeout(saveTimer);
        saveTimer = content.setTimeout(() => saveNote(input, status), 600);
      });

      return input;
    }

    // ── Save 

    function saveNote(input, status) {
      if (!currentLogin || !input) return;
      const text = input.value.trim();
      const key  = makeKey(currentLogin);
      if (text) {
        notes[key] = { note: text, origin: currentLogin.origin, username: currentLogin.username, updatedAt: new Date().toISOString() };
      } else {
        delete notes[key];
      }
      sendAsyncMessage("pwn:saveNotes", notes);
      if (status) {
        status.style.opacity = "1";
        content.setTimeout(() => { status.style.opacity = "0"; }, 2000);
      }
    }

    // ── Event: Login selected
    // Wait 200ms for the login item to finish rendering its Shadow DOM.

    function onLoginSelected(e) {
      currentLogin = e.detail;
      // New setup: Link pendingNote with the now known login.
      if (pendingNote && currentLogin) {
        const key = makeKey(currentLogin);
        notes[key] = { note: pendingNote, origin: currentLogin.origin, username: currentLogin.username, updatedAt: new Date().toISOString() };
        sendAsyncMessage("pwn:saveNotes", notes);
        pendingNote = null;
      }
      // Reload notes with each selection -> covers direct edit and reload
      sendAsyncMessage("pwn:getNotes");
      content.setTimeout(() => buildContainer(), 200);
    }

    doc.addEventListener("AboutLoginsLoginSelected", onLoginSelected);
    doc.addEventListener("AboutLoginsInitialLoginSelected", onLoginSelected);

    if (pendingInitialLogin) onLoginSelected({ detail: pendingInitialLogin });

    // ── Event: Update login (save button)

    doc.addEventListener("AboutLoginsUpdateLogin", (e) => {
      const shadow = loginItem.shadowRoot;
      const input  = shadow?.querySelector(".pwn-container input");
      const status = shadow?.querySelector(".pwn-container div:last-child");
      saveNote(input, status);
    });

    // ── Event: New login created
    // Cache pendingNote until AboutLoginsLoginAdded delivers the final login

    // pendingNote:  cache info text when creating a new login
    let pendingNote = null;

    doc.addEventListener("AboutLoginsCreateLogin", () => {
      const shadow = loginItem.shadowRoot;
      const input  = shadow?.querySelector(".pwn-container input");
      if (input?.value.trim()) pendingNote = input.value.trim();
    });

    // ── First call: if login has already been selected
    content.setTimeout(() => buildContainer(), 300);
  }

  function makeKey(login) {
    return `${login.origin}:::${login.username}`;
  }

  init().catch(() => {});
}
