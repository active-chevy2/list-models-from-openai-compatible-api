(() => {
  "use strict";

  let MODELS = [];
  let LAST_CURL = "";

  const $ = (id) => document.getElementById(id);

  function setStatus(msg, cls) {
    const el = $("status");
    el.textContent = msg;
    el.className = cls || "";
  }

  function isLocalHost(urlWithoutScheme) {
    const hostPort = urlWithoutScheme.split("/")[0].toLowerCase();
    const host = hostPort.startsWith("[")
      ? hostPort.slice(0, hostPort.indexOf("]") + 1)
      : hostPort.split(":")[0];
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "[::1]" ||
      host.endsWith(".local")
    );
  }

  function normalizeBase(rawUrl) {
    let url = String(rawUrl || "").trim().replace(/\/+$/, "");
    if (!url) return "";

    if (!/^https?:\/\//i.test(url)) {
      const scheme = isLocalHost(url) ? "http://" : "https://";
      url = scheme + url;
    }

    const autoV1 = $("autoV1")?.checked ?? true;
    if (
      autoV1 &&
      !/\/v\d+(alpha|beta)?$/i.test(url) &&
      !/\/openai$/i.test(url)
    ) {
      url += "/v1";
    }

    return url;
  }

  function updateEndpointPreview() {
    const base = normalizeBase($("baseUrl").value);
    $("resolvedPreview").textContent = base ? `GET ${base}/models` : "";
  }

  function guessProvider(id) {
    const s = String(id || "").toLowerCase();

    if (/^(openai\/)?(gpt-|o1($|-)|o3($|-)|o4($|-)|chatgpt-|dall-e|whisper|tts-|text-embedding|davinci|babbage|codex)/i.test(s)) {
      return ["OpenAI", "tag-openai"];
    }
    if (/^(anthropic\/)?claude/i.test(s)) {
      return ["Anthropic", "tag-anthropic"];
    }
    if (/^(google\/)?(gemini|gemma|imagen|veo|palm|learnlm)/i.test(s)) {
      return ["Google", "tag-google"];
    }
    if (/^(meta-llama\/|meta\/)?(llama|codellama)/i.test(s)) {
      return ["Meta", "tag-meta"];
    }
    if (/^(deepseek\/)?deepseek/i.test(s)) {
      return ["DeepSeek", "tag-deepseek"];
    }
    if (/^(qwen\/|alibaba\/)?(qwen|qwq)/i.test(s)) {
      return ["Qwen", "tag-qwen"];
    }
    if (/^(mistralai\/|mistral\/)?(mistral|mixtral|codestral|pixtral|ministral|devstral|magistral)/i.test(s)) {
      return ["Mistral", "tag-mistral"];
    }
    if (/^(x-ai\/|xai\/)?grok/i.test(s)) {
      return ["xAI", "tag-xai"];
    }
    if (/^(cohere\/)?(command|cohere|c4ai|embed-)/i.test(s)) {
      return ["Cohere", "tag-cohere"];
    }
    if (/^(microsoft\/)?(phi-|wizardlm)/i.test(s)) {
      return ["Microsoft", "tag-microsoft"];
    }

    return ["Other", "tag-other"];
  }

  function formatCreated(raw) {
    if (raw === null || raw === undefined || raw === "") return "—";

    const num = Number(raw);
    if (Number.isFinite(num)) {
      if (num <= 0) return "—";
      const seconds = num > 1e11 ? Math.floor(num / 1000) : num;
      const date = new Date(seconds * 1000);
      const year = date.getUTCFullYear();
      if (!Number.isNaN(date.getTime()) && year >= 2000 && year <= 2100) {
        return date.toISOString().slice(0, 10);
      }
      return "—";
    }

    const parsed = new Date(String(raw));
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }

    return "—";
  }

  function buildAuthHeaders(key, extraHeaders = {}) {
    const headers = { ...extraHeaders };
    if (key) {
      headers.Authorization = `Bearer ${key}`;
    }
    return headers;
  }

  function buildCurl(base, hasKey) {
    return hasKey
      ? `curl -sS "${base}/models" -H "Authorization: Bearer YOUR_API_KEY"`
      : `curl -sS "${base}/models"`;
  }

  function populateProviderFilter() {
    const select = $("providerFilter");
    const current = select.value;
    const providers = Array.from(new Set(MODELS.map((m) => m.provider))).sort();

    select.innerHTML = "";
    const allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = `All providers (${MODELS.length})`;
    select.appendChild(allOpt);

    for (const p of providers) {
      const count = MODELS.filter((m) => m.provider === p).length;
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = `${p} (${count})`;
      select.appendChild(opt);
    }

    if (providers.includes(current)) {
      select.value = current;
    }
  }

  function getFilteredAndSorted() {
    const q = $("filter").value.trim().toLowerCase();
    const prov = $("providerFilter").value;
    const sort = $("sortBy").value;

    const list = MODELS.filter((m) => {
      if (prov && m.provider !== prov) return false;
      if (!q) return true;
      return (
        m.id.toLowerCase().includes(q) ||
        m.owner.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q)
      );
    });

    list.sort((a, b) => {
      switch (sort) {
        case "id-desc":
          return b.id.localeCompare(a.id);
        case "created-desc":
          return b.createdSort - a.createdSort || a.id.localeCompare(b.id);
        case "provider-asc":
          return a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id);
        case "id-asc":
        default:
          return a.id.localeCompare(b.id);
      }
    });

    return list;
  }

  async function copyText(text, triggerBtn, defaultLabel) {
    try {
      await navigator.clipboard.writeText(text);
      if (triggerBtn) {
        triggerBtn.textContent = "Copied!";
        setTimeout(() => {
          triggerBtn.textContent = defaultLabel;
        }, 1000);
      }
    } catch {
      window.prompt("Copy manually:", text);
    }
  }

  function render() {
    const list = getFilteredAndSorted();
    const tbody = $("tbody");
    const testSelect = $("testModel");
    const previousSelection = testSelect.value;

    tbody.innerHTML = "";
    testSelect.innerHTML = "";

    const tbodyFrag = document.createDocumentFragment();
    const selectFrag = document.createDocumentFragment();

    for (const m of list) {
      const tr = document.createElement("tr");

      const tdId = document.createElement("td");
      tdId.textContent = m.id;

      const tdProv = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = `tag ${m.tagCls}`;
      badge.textContent = m.provider;
      tdProv.appendChild(badge);

      const tdOwner = document.createElement("td");
      tdOwner.textContent = m.owner;

      const tdCreated = document.createElement("td");
      tdCreated.textContent = m.created;

      const tdAction = document.createElement("td");
      tdAction.className = "cell-action";
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "ghost";
      copyBtn.textContent = "Copy";
      copyBtn.addEventListener("click", () => copyText(m.id, copyBtn, "Copy"));
      tdAction.appendChild(copyBtn);

      tr.append(tdId, tdProv, tdOwner, tdCreated, tdAction);
      tbodyFrag.appendChild(tr);

      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.id;
      selectFrag.appendChild(opt);
    }

    tbody.appendChild(tbodyFrag);
    testSelect.appendChild(selectFrag);

    if (previousSelection && list.some((m) => m.id === previousSelection)) {
      testSelect.value = previousSelection;
    }

    $("count").textContent = `${list.length} / ${MODELS.length} models`;
    $("emptyState").classList.toggle("hidden", list.length > 0);
  }

  async function fetchModels() {
    const base = normalizeBase($("baseUrl").value);
    const key = $("apiKey").value.trim();

    if (!base) {
      setStatus("Enter a base URL first.", "status-err");
      $("baseUrl").focus();
      return;
    }

    $("fetchBtn").disabled = true;
    setStatus("Fetching…", "status-busy");
    $("errorPanel").classList.add("hidden");

    try {
      const res = await fetch(`${base}/models`, {
        headers: buildAuthHeaders(key),
      });
      const text = await res.text();

      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Response was not valid JSON.\n\nPreview:\n${text.slice(0, 400)}`);
      }

      if (!res.ok) {
        const formattedErr = JSON.stringify(json, null, 2).slice(0, 900);
        throw new Error(`HTTP ${res.status} ${res.statusText}\n\n${formattedErr}`);
      }

      const rawList = Array.isArray(json.data)
        ? json.data
        : Array.isArray(json.models)
          ? json.models
          : Array.isArray(json)
            ? json
            : [];

      if (!rawList.length) {
        throw new Error(`Endpoint responded OK (HTTP ${res.status}) but returned zero models.\n\nRaw:\n${text.slice(0, 500)}`);
      }

      MODELS = rawList.map((m) => {
        const id = typeof m === "string" ? m : String(m.id || m.name || "");
        const [provider, tagCls] = guessProvider(id);
        const created = typeof m === "object" && m !== null ? formatCreated(m.created) : "—";
        const createdNum = typeof m === "object" && m !== null && Number.isFinite(Number(m.created))
          ? Number(m.created)
          : 0;

        return {
          id,
          provider,
          tagCls,
          owner: typeof m === "object" && m !== null ? String(m.owned_by || m.owner || "—") : "—",
          created,
          createdSort: createdNum > 1e11 ? Math.floor(createdNum / 1000) : createdNum,
        };
      });

      $("resultsPanel").classList.remove("hidden");
      $("filter").value = "";
      populateProviderFilter();
      render();
      setStatus(`✓ ${MODELS.length} models loaded`, "status-ok");
    } catch (err) {
      const msg = String(err?.message || err);
      $("errorPanel").classList.remove("hidden");

      let hint = "";
      if (/failed to fetch|networkerror|load failed/i.test(msg)) {
        hint = "\n\nHint: Browser request failed — usually CORS blocked by the provider, an unreachable local port, or mixed HTTP/HTTPS content. Test with cURL below:";
      } else if (/\b(401|403)\b/.test(msg)) {
        hint = "\n\nHint: Authentication failed. Check that your API key is valid and active.";
      } else if (/\b404\b/.test(msg)) {
        hint = "\n\nHint: Endpoint not found. Verify whether this provider expects /v1 or a custom subpath.";
      }

      LAST_CURL = buildCurl(base, Boolean(key));
      $("errorOut").textContent = `${msg}${hint}\n\ncURL equivalent:\n${LAST_CURL}`;
      setStatus("Failed — see error details below", "status-err");
    } finally {
      $("fetchBtn").disabled = false;
    }
  }

  async function testModel() {
    const base = normalizeBase($("baseUrl").value);
    const key = $("apiKey").value.trim();
    const model = $("testModel").value;
    const prompt = $("testMsg").value.trim() || "Reply with only the word: ready";
    const out = $("testOut");
    const btn = $("testBtn");
    const testStatus = $("testStatus");

    if (!base || !model) return;

    out.classList.remove("hidden");
    out.textContent = "Sending chat completion…";
    testStatus.textContent = "";
    btn.disabled = true;

    const startedAt = performance.now();

    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: buildAuthHeaders(key, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 150,
        }),
      });

      const elapsedMs = Math.round(performance.now() - startedAt);
      const rawText = await res.text();

      let json;
      try {
        json = JSON.parse(rawText);
      } catch {
        throw new Error(`HTTP ${res.status} ${res.statusText} (non-JSON response):\n${rawText.slice(0, 500)}`);
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}\n${JSON.stringify(json, null, 2).slice(0, 900)}`);
      }

      const choice = json.choices?.[0];
      const reply =
        choice?.message?.content ??
        choice?.message?.reasoning_content ??
        choice?.text ??
        JSON.stringify(json, null, 2);

      const usage = json.usage
        ? `\n\nTokens: ${json.usage.prompt_tokens ?? "?"} prompt + ${json.usage.completion_tokens ?? "?"} completion = ${json.usage.total_tokens ?? "?"} total`
        : "";

      out.textContent = `${reply}${usage}`;
      testStatus.textContent = `Responded in ${elapsedMs} ms`;
    } catch (err) {
      out.textContent = `Error: ${err?.message || err}\n\nNote: The model may be listed in /models without chat permissions for your key, or CORS may block POST /chat/completions.`;
      testStatus.textContent = "Test failed";
    } finally {
      btn.disabled = false;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("baseUrl").addEventListener("input", updateEndpointPreview);
    $("autoV1").addEventListener("change", updateEndpointPreview);

    $("baseUrl").addEventListener("keydown", (e) => {
      if (e.key === "Enter") fetchModels();
    });
    $("apiKey").addEventListener("keydown", (e) => {
      if (e.key === "Enter") fetchModels();
    });

    $("toggleKeyBtn").addEventListener("click", () => {
      const input = $("apiKey");
      const isHidden = input.type === "password";
      input.type = isHidden ? "text" : "password";
      $("toggleKeyBtn").textContent = isHidden ? "Hide" : "Show";
    });

    $("clearKeyBtn").addEventListener("click", () => {
      $("apiKey").value = "";
      $("apiKey").type = "password";
      $("toggleKeyBtn").textContent = "Show";
      $("apiKey").focus();
    });

    $("presetList").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-url]");
      if (!btn) return;
      $("baseUrl").value = btn.dataset.url;
      updateEndpointPreview();
    });

    $("fetchBtn").addEventListener("click", fetchModels);
    $("filter").addEventListener("input", render);
    $("providerFilter").addEventListener("change", render);
    $("sortBy").addEventListener("change", render);

    $("copyAllBtn").addEventListener("click", () => {
      const ids = getFilteredAndSorted().map((m) => m.id).join("\n");
      copyText(ids, $("copyAllBtn"), "Copy IDs");
    });

    $("copyJsonBtn").addEventListener("click", () => {
      const ids = JSON.stringify(getFilteredAndSorted().map((m) => m.id), null, 2);
      copyText(ids, $("copyJsonBtn"), "Copy JSON");
    });

    $("testBtn").addEventListener("click", testModel);
    $("testMsg").addEventListener("keydown", (e) => {
      if (e.key === "Enter") testModel();
    });

    $("copyCurlBtn").addEventListener("click", () => {
      if (LAST_CURL) copyText(LAST_CURL, $("copyCurlBtn"), "Copy cURL");
    });

    try {
      const params = new URLSearchParams(window.location.search);
      const urlParam = params.get("url");
      if (urlParam) {
        $("baseUrl").value = urlParam;
      }
    } catch {
      // Ignore malformed query strings
    }

    updateEndpointPreview();
  });
})();
