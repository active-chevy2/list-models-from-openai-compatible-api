(() => {
  "use strict";

  class Captcha {
    constructor(container, options = {}) {
      this.container =
        typeof container === "string" ? document.querySelector(container) : container;
      if (!this.container) throw new Error("Captcha container not found");

      this.options = Object.assign({}, options);
      this.token = "";
      this.solved = false;
      this.verifying = false;

      this._render();
      this.refresh();
    }

    _render() {
      this.container.innerHTML = "";
      this.container.classList.add("captcha-root");

      // Hidden honeypot — bots tend to fill every field in the DOM.
      this.hpField = document.createElement("input");
      this.hpField.type = "text";
      this.hpField.name = "website";
      this.hpField.tabIndex = -1;
      this.hpField.autocomplete = "off";
      this.hpField.setAttribute("aria-hidden", "true");
      this.hpField.style.position = "absolute";
      this.hpField.style.left = "-9999px";
      this.hpField.style.width = "1px";
      this.hpField.style.height = "1px";
      this.hpField.style.overflow = "hidden";
      this.hpField.style.opacity = "0";
      this.hpField.style.pointerEvents = "none";

      // Challenge image (server-rendered SVG)
      this.img = document.createElement("img");
      this.img.className = "captcha-canvas";
      this.img.alt = "Anti-bot math challenge";
      this.img.width = 156;
      this.img.height = 42;

      // Refresh button
      this.refreshBtn = document.createElement("button");
      this.refreshBtn.type = "button";
      this.refreshBtn.className = "ghost captcha-refresh";
      this.refreshBtn.textContent = "\u21BB";
      this.refreshBtn.setAttribute("aria-label", "Refresh CAPTCHA");
      this.refreshBtn.title = "New challenge";
      this.refreshBtn.addEventListener("click", () => this.refresh());

      // Answer input
      this.input = document.createElement("input");
      this.input.type = "text";
      this.input.className = "captcha-input";
      this.input.placeholder = "Answer";
      this.input.autocomplete = "off";
      this.input.spellcheck = false;
      this.input.inputMode = "numeric";
      this.input.setAttribute("aria-label", "Anti-bot math answer");
      this.input.addEventListener("input", () => this._onInput());
      this.input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.verify();
        }
      });

      // Verify button
      this.verifyBtn = document.createElement("button");
      this.verifyBtn.type = "button";
      this.verifyBtn.className = "captcha-verify";
      this.verifyBtn.textContent = "Verify";
      this.verifyBtn.addEventListener("click", () => this.verify());

      // Status line
      this.statusEl = document.createElement("span");
      this.statusEl.className = "captcha-status";
      this.statusEl.setAttribute("role", "status");
      this.statusEl.setAttribute("aria-live", "polite");

      const row = document.createElement("div");
      row.className = "captcha-row";
      row.append(this.img, this.refreshBtn);

      const inputRow = document.createElement("div");
      inputRow.className = "captcha-input-row";
      inputRow.append(this.input, this.verifyBtn);

      this.container.append(this.hpField, row, inputRow, this.statusEl);
    }

    _setStatus(text, state) {
      this.statusEl.textContent = text;
      this.statusEl.className = state
        ? `captcha-status is-${state}`
        : "captcha-status";
    }

    _onInput() {
      this._setStatus("", "");
    }

    async refresh() {
      this.token = "";
      this.solved = false;
      this.verifying = false;
      this.input.value = "";
      this.input.disabled = true;
      this.verifyBtn.disabled = true;
      this.refreshBtn.disabled = true;
      this.img.removeAttribute("src");
      this._setStatus("Loading challenge\u2026", "");

      if (typeof this.options.onReset === "function") {
        try { this.options.onReset(); } catch {}
      }

      try {
        const res = await fetch("/api/challenge", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || `Server returned HTTP ${res.status}`);
        }
        this.token = data.token;
        this.img.src = data.image;
        this.input.disabled = false;
        this.verifyBtn.disabled = false;
        this._setStatus("", "");
        this.input.focus();
      } catch (err) {
        this._setStatus(`Error loading challenge: ${err.message}`, "error");
      } finally {
        this.refreshBtn.disabled = false;
      }
    }

    async verify() {
      if (this.solved) return true;
      if (this.verifying) return false;

      const answer = this.input.value.trim();
      if (!answer) {
        this._setStatus("Please enter the answer.", "error");
        this.input.focus();
        return false;
      }
      if (!this.token) {
        this._setStatus("Challenge missing. Please refresh.", "error");
        return false;
      }

      this.verifying = true;
      this.verifyBtn.disabled = true;
      this.input.disabled = true;
      this._setStatus("Verifying\u2026", "");

      try {
        const params = new URLSearchParams({
          captchaToken: this.token,
          captchaAnswer: answer,
          hp: this.hpField.value,
        });
        const res = await fetch(`/api/verify?${params.toString()}`, {
          cache: "no-store",
        });
        const data = await res.json();

        if (!res.ok || !data.ok) {
          throw new Error(data.error || `Server returned HTTP ${res.status}`);
        }

        this.solved = true;
        this.verifyBtn.textContent = "Verified";
        this.refreshBtn.disabled = false;
        this._setStatus("\u2713 Verified", "success");

        if (typeof this.options.onVerified === "function") {
          try { this.options.onVerified(); } catch {}
        }
        return true;
      } catch (err) {
        this._setStatus(err.message, "error");
        this.input.disabled = false;
        this.input.focus();
        return false;
      } finally {
        this.verifying = false;
        if (!this.solved) {
          this.verifyBtn.disabled = false;
        }
      }
    }

    isSolved() {
      return this.solved;
    }
  }

  window.Captcha = Captcha;
})();
