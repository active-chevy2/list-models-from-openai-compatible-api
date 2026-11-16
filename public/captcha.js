(() => {
  "use strict";

  const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1

  function randomCode(length = 5) {
    let code = "";
    const array = new Uint32Array(length);
    crypto.getRandomValues(array);
    for (let i = 0; i < length; i++) {
      code += CHARS[array[i] % CHARS.length];
    }
    return code;
  }

  class Captcha {
    constructor(container, options = {}) {
      this.container = typeof container === "string" ? document.querySelector(container) : container;
      if (!this.container) throw new Error("Captcha container not found");
      this.options = Object.assign({ length: 5, width: 160, height: 60 }, options);
      this.code = "";
      this.solved = false;
      this.attempts = 0;
      this.maxAttempts = 5;
      this._render();
      this.refresh();
    }

    _render() {
      this.container.innerHTML = "";
      this.container.classList.add("captcha-root");

      this.canvas = document.createElement("canvas");
      this.canvas.width = this.options.width;
      this.canvas.height = this.options.height;
      this.canvas.className = "captcha-canvas";
      this.canvas.setAttribute("aria-label", "CAPTCHA image");
      this.canvas.setAttribute("role", "img");

      this.refreshBtn = document.createElement("button");
      this.refreshBtn.type = "button";
      this.refreshBtn.className = "ghost captcha-refresh";
      this.refreshBtn.textContent = "↻";
      this.refreshBtn.setAttribute("aria-label", "Refresh CAPTCHA");
      this.refreshBtn.addEventListener("click", () => this.refresh());

      this.input = document.createElement("input");
      this.input.type = "text";
      this.input.className = "captcha-input";
      this.input.placeholder = "Enter code";
      this.input.autocomplete = "off";
      this.input.spellcheck = false;
      this.input.maxLength = this.options.length;
      this.input.setAttribute("aria-label", "CAPTCHA code");
      this.input.addEventListener("input", () => this._onInput());

      this.verifyBtn = document.createElement("button");
      this.verifyBtn.type = "button";
      this.verifyBtn.className = "captcha-verify";
      this.verifyBtn.textContent = "Verify";
      this.verifyBtn.addEventListener("click", () => this.verify());

      this.statusEl = document.createElement("span");
      this.statusEl.className = "captcha-status";
      this.statusEl.setAttribute("role", "status");
      this.statusEl.setAttribute("aria-live", "polite");

      const row = document.createElement("div");
      row.className = "captcha-row";
      row.append(this.canvas, this.refreshBtn);

      const inputRow = document.createElement("div");
      inputRow.className = "captcha-input-row";
      inputRow.append(this.input, this.verifyBtn);

      this.container.append(row, inputRow, this.statusEl);
    }

    refresh() {
      this.code = randomCode(this.options.length);
      this.solved = false;
      this.attempts = 0;
      this.input.value = "";
      this.statusEl.textContent = "";
      this.statusEl.className = "captcha-status";
      this._draw();
      this._updateState();
    }

    _draw() {
      const ctx = this.canvas.getContext("2d");
      const w = this.canvas.width;
      const h = this.canvas.height;

      ctx.fillStyle = "#1e222e";
      ctx.fillRect(0, 0, w, h);

      for (let i = 0; i < 8; i++) {
        ctx.strokeStyle = `rgba(${100 + Math.random() * 155}, ${100 + Math.random() * 155}, ${100 + Math.random() * 155}, 0.3)`;
        ctx.beginPath();
        ctx.moveTo(Math.random() * w, Math.random() * h);
        ctx.lineTo(Math.random() * w, Math.random() * h);
        ctx.stroke();
      }

      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = `rgba(${100 + Math.random() * 155}, ${100 + Math.random() * 155}, ${100 + Math.random() * 155}, 0.5)`;
        ctx.beginPath();
        ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 2, 0, Math.PI * 2);
        ctx.fill();
      }

      const charWidth = w / (this.code.length + 1);
      for (let i = 0; i < this.code.length; i++) {
        const char = this.code[i];
        const x = charWidth * (i + 1);
        const y = h / 2 + (Math.random() - 0.5) * 10;
        const angle = (Math.random() - 0.5) * 0.5;
        const fontSize = 24 + Math.random() * 8;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.font = `bold ${fontSize}px ${Math.random() > 0.5 ? "monospace" : "sans-serif"}`;
        ctx.fillStyle = `rgb(${200 + Math.random() * 55}, ${200 + Math.random() * 55}, ${200 + Math.random() * 55})`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(char, 0, 0);
        ctx.restore();
      }
    }

    _onInput() {
      this.statusEl.textContent = "";
      this.statusEl.className = "captcha-status";
    }

    verify() {
      if (this.solved) return true;

      if (this.attempts >= this.maxAttempts) {
        this.statusEl.textContent = "Too many attempts. Refresh.";
        this.statusEl.className = "captcha-status is-error";
        return false;
      }

      const input = this.input.value.trim().toUpperCase();
      if (input === this.code) {
        this.solved = true;
        this.statusEl.textContent = "✓ Verified";
        this.statusEl.className = "captcha-status is-success";
        this._updateState();
        return true;
      }

      this.attempts++;
      this.statusEl.textContent = `Incorrect. ${this.maxAttempts - this.attempts} attempts left.`;
      this.statusEl.className = "captcha-status is-error";
      return false;
    }

    _updateState() {
      this.input.disabled = this.solved;
      this.verifyBtn.disabled = this.solved;
      this.refreshBtn.disabled = this.solved;
      this.verifyBtn.textContent = this.solved ? "Verified" : "Verify";
    }

    isSolved() {
      return this.solved;
    }
  }

  window.Captcha = Captcha;
})();
