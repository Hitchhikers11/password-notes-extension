// Mandatory: first line must be a comment
try {
  Services.obs.addObserver(function(win) {
    win.addEventListener("load", function() {
      if (win.location.href !== "chrome://browser/content/browser.xhtml") return;

      let script = Services.dirsvc.get("ProfD", Components.interfaces.nsIFile);
      script.append("chrome");
      script.append("userChrome.js");

      if (script.exists()) {
        Services.scriptloader.loadSubScript(
          Services.io.newFileURI(script).spec,
          win
        );
      }
    }, { once: true });
  }, "domwindowopened");
} catch(e) { dump("config.js Error: " + e + "\n"); }