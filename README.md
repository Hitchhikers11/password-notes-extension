# Firefox Password Notes

Adds a free-text **Info** field to each saved login in Firefox's built-in password manager (`about:logins`). 
The note also appears as a third line in the browser's password autocomplete dropdown.

**Developed by [Hitchhikers11](https://github.com/hitchhikers11) with [Claude](https://claude.ai), AI assistant by Anthropic.**

---

## What it looks like

**In `about:logins` (edit mode):**

```
Username    ••••••••••
Password    ••••••••••
Info        [Main customer, contract since 2019    ]
```

**In the autocomplete dropdown:**

```
  john@example.com
  From this website
  Main customer, contract since 2019
```

---

## How it works

This solution uses Firefox's **autoconfig mechanism** — four plain JavaScript files, no extension signing required.

| File | Location | Purpose |
|---|---|---|
| `config-prefs.js` | Firefox app bundle | Tells Firefox to load `config.js` on startup |
| `config.js` | Firefox app bundle | Watches for browser windows and loads `userChrome.js` from the profile |
| `userChrome.js` | Firefox profile `chrome/` | Monitors tabs, reads/writes the notes file, annotates the autocomplete popup |
| `aboutlogins-notes.js` | Firefox profile `chrome/` | Runs inside the `about:logins` process, injects the Info field |

Notes are stored as JSON in `password-notes.json` in your Firefox profile folder. No data leaves your machine.

---

## Requirements

- **macOS** (installation paths are macOS-specific; see [Other platforms](#other-platforms) for notes)
- **Firefox 128 or newer** (tested on Firefox 152)

---

## Installation

### Step 1 — Firefox app bundle (requires sudo)

Create the `defaults/pref` folder if it does not exist, then copy both files:

```bash
sudo mkdir -p "/Applications/Firefox.app/Contents/Resources/defaults/pref"
sudo cp config-prefs.js "/Applications/Firefox.app/Contents/Resources/defaults/pref/config-prefs.js"
sudo cp config.js "/Applications/Firefox.app/Contents/Resources/config.js"
```

### Step 2 — Firefox profile

Find your profile folder:

1. Open Firefox and go to `about:support`
2. Look for **Profile Folder** and click **Show in Finder**

Create the `chrome` subfolder if it does not exist, then copy both files:

```bash
# Replace the path with your actual profile path
PROFILE="$HOME/Library/Application Support/Firefox/Profiles/YOUR_PROFILE.default-release"

mkdir -p "$PROFILE/chrome"
cp userChrome.js "$PROFILE/chrome/userChrome.js"
cp aboutlogins-notes.js "$PROFILE/chrome/aboutlogins-notes.js"
```

### Step 3 — Restart Firefox

Fully quit and restart Firefox. Open `about:logins`, select a login, click **Edit** — the **Info** field appears at the bottom.

---

## Uninstall

Remove the four files you copied in Steps 1 and 2, then restart Firefox.

```bash
sudo rm "/Applications/Firefox.app/Contents/Resources/defaults/pref/config-prefs.js"
sudo rm "/Applications/Firefox.app/Contents/Resources/config.js"
rm "$PROFILE/chrome/userChrome.js"
rm "$PROFILE/chrome/aboutlogins-notes.js"
```

---

## Other platforms

The autoconfig mechanism works on Windows and Linux too, but the installation paths differ:

| Platform | App bundle path |
|---|---|
| **macOS** | `/Applications/Firefox.app/Contents/Resources/` |
| **Windows** | `C:\Program Files\Mozilla Firefox\` |
| **Linux** | `/usr/lib/firefox/` or `/usr/share/firefox/` |

The profile path and the two profile files (`userChrome.js`, `aboutlogins-notes.js`) are identical on all platforms.

---

## Security

**Read the code before installing.**

This solution uses Firefox's autoconfig mechanism, which requires disabling the autoconfig sandbox:

```js
pref("general.config.sandbox_enabled", false);
```

This is unavoidable — there is no other way to load privileged JavaScript into Firefox at startup. With the sandbox disabled, any file loaded via autoconfig (`config.js` and anything it loads) runs with **full system privileges**: unrestricted filesystem access, network access, and complete control over the browser.

This project's code does exactly three things:
1. Reads and writes a single JSON file in your Firefox profile (`password-notes.json`)
2. Observes the `about:logins` tab to inject the Info field
3. Annotates the password autocomplete popup

There are no network requests, no external connections, and no data leaves your machine.

**Because of the elevated privileges, you should:**
- Read all four files yourself before installing
- Only install from a source you trust
- Re-read `config.js` and `userChrome.js` after any Firefox major update, as Firefox updates may overwrite the app bundle files

**If you already use `userChrome.js` for other purposes:**  
Any code you add to `userChrome.js` — or any additional scripts it loads — runs with the same full system privileges. Treat every snippet you add from the internet with the same caution as running an unsigned executable. Never blindly paste code from unknown sources.

**How could malicious code get in?**  
There is no automatic mechanism — someone would need direct access to your machine to modify one of these files. The two realistic paths are:

- Editing `userChrome.js` in your profile folder (writable by your user account, so any malware already running as you could modify it)
- Replacing `config.js` in the Firefox app bundle (requires `sudo`, so significantly harder)

Neither path is unique to this project — any locally installed software faces the same exposure. This solution does not make your system less secure than it already is. What matters is that you only install these four files from a source you have read and trust, and that you treat any future additions to `userChrome.js` with the same care.

---

## Notes & caveats

- The Info field is only visible in **edit mode** in `about:logins`.
- Firefox updates may overwrite `config.js` and `config-prefs.js` in the app bundle — re-copy them after major updates.
- No warranty. Use at your own risk. See [LICENSE](LICENSE).

---

## A note to Mozilla

This project exists because Firefox's WebExtension API intentionally blocks access to `about:` pages and chrome-level JavaScript. That is a reasonable security decision — but it means that useful, privacy-respecting customisations like this one can only be built through the autoconfig mechanism, which requires disabling the sandbox entirely and grants full system privileges.

We would like to suggest that Mozilla consider a **privileged extension tier** — a class of locally-installed, user-approved extensions that could access `about:` pages and browser UI APIs without requiring the autoconfig workaround. This would allow:

- Per-login notes in `about:logins`
- Custom fields in the password manager
- Other UI enhancements to built-in Firefox pages

…all within a properly sandboxed, reviewable extension model, without needing to touch the Firefox app bundle or disable the autoconfig sandbox.

The demand is clearly there. This project is a workaround for the absence of that capability.

---

## License

MIT — see [LICENSE](LICENSE).
