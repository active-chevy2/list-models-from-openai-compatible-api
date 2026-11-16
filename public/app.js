(() => {
  "use strict";

  let MODELS = [];
  let LAST_CURL = "";
  let LAST_ENDPOINT = "";
  let exportStatusTimer = null;
  let isPrintPrepared = false;
  let captcha = null;

  const $ = (id) => document.getElementById(id);

  function setStatus(msg, cls) {
    const el = $("status");
    el.textContent = msg;
    el.className = cls || "";
  }

  function setExportStatus(msg, isError = false) {
    const el = $("exportStatus");
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle("is-error", Boolean(isError));
    if (exportStatusTimer) {
      clearTimeout(exportStatusTimer);
    }
    if (msg) {
      exportStatusTimer = setTimeout(() => {
        el.textContent = "";
        el.classList.remove("is-error");
      }, 4500);
    }
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
    if (raw === null || raw === undefined || raw === "") return "\u2014";

    const num = Number(raw);
    if (Number.isFinite(num)) {
      if (num <= 0) return "\u2014";
      const seconds = num > 1e11 ? Math.floor(num / 1000) : num;
      const date = new Date(seconds * 1000);
      const year = date.getUTCFullYear();
      if (!Number.isNaN(date.getTime()) && year >= 2000 && year <= 2100) {
        return date.toISOString().slice(0, 10);
      }
      return "\u2014";
    }

    const parsed = new Date(String(raw));
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }

    return "\u2014";
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

  function getSortedCategories() {
    const categories = Array.from(new Set(MODELS.map((m) => m.provider)));
    return categories.sort((a, b) => {
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      return a.localeCompare(b);
    });
  }

  function populateProviderFilter() {
    const select = $("providerFilter");
    const current = select.value;
    const providers = getSortedCategories();

    select.innerHTML = "";
    const allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = `All categories (${MODELS.length})`;
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

  function populateExportScope() {
    const select = $("exportScope");
    if (!select) return;
    const current = select.value;
    const providers = getSortedCategories();

    select.innerHTML = "";

    const baseOptions = [
      { value: "all-grouped", label: `All models \u2014 by category (${MODELS.length})` },
      { value: "all-flat", label: `All models \u2014 single list (${MODELS.length})` },
      { value: "filtered", label: "Current filtered view" },
    ];

    for (const item of baseOptions) {
      const opt = document.createElement("option");
      opt.value = item.value;
      opt.textContent = item.label;
      select.appendChild(opt);
    }

    if (providers.length > 0) {
      const group = document.createElement("optgroup");
      group.label = "Specific Category";
      for (const p of providers) {
        const count = MODELS.filter((m) => m.provider === p).length;
        const opt = document.createElement("option");
        opt.value = `cat:${p}`;
        opt.textContent = `Category: ${p} (${count})`;
        group.appendChild(opt);
      }
      select.appendChild(group);
    }

    const validValues = Array.from(select.options).map((o) => o.value);
    if (validValues.includes(current)) {
      select.value = current;
    }
  }

  function sortModels(list, sortMode) {
    const copy = [...list];
    copy.sort((a, b) => {
      switch (sortMode) {
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
    return copy;
  }

  function getFilteredAndSorted() {
    const q = $("filter").value.trim().toLowerCase();
    const prov = $("providerFilter").value;
    const sort = $("sortBy").value;

    const filtered = MODELS.filter((m) => {
      if (prov && m.provider !== prov) return false;
      if (!q) return true;
      return (
        m.id.toLowerCase().includes(q) ||
        m.owner.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q)
      );
    });

    return sortModels(filtered, sort);
  }

  function getScopedExportData() {
    const scope = $("exportScope")?.value || "all-grouped";
    const sort = $("sortBy").value;

    if (scope === "all-flat") {
      const models = sortModels(MODELS, sort);
      return {
        scope,
        slug: "all-models",
        scopeLabel: "All Models (Single List)",
        grouped: false,
        models,
        groups: [{ category: "All Models", models }],
      };
    }

    if (scope === "filtered") {
      const models = getFilteredAndSorted();
      const activeProv = $("providerFilter").value;
      const activeSearch = $("filter").value.trim();
      const parts = [];
      if (activeProv) parts.push(`Category: ${activeProv}`);
      if (activeSearch) parts.push(`Query: "${activeSearch}"`);
      const detail = parts.length ? ` (${parts.join(", ")})` : "";
      return {
        scope,
        slug: "filtered-models",
        scopeLabel: `Filtered Models${detail}`,
        grouped: false,
        models,
        groups: [{ category: "Filtered Models", models }],
      };
    }

    if (scope.startsWith("cat:")) {
      const category = scope.slice(4);
      const models = sortModels(
        MODELS.filter((m) => m.provider === category),
        sort
      );
      const safeSlug = category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "category";
      return {
        scope,
        slug: `category-${safeSlug}`,
        scopeLabel: `Category: ${category}`,
        grouped: false,
        models,
        groups: [{ category, models }],
      };
    }

    const categories = getSortedCategories();
    const groups = categories.map((category) => ({
      category,
      models: sortModels(
        MODELS.filter((m) => m.provider === category),
        sort
      ),
    }));
    const models = groups.flatMap((g) => g.models);

    return {
      scope: "all-grouped",
      slug: "all-models-by-category",
      scopeLabel: "All Models (Grouped by Category)",
      grouped: true,
      models,
      groups,
    };
  }

  function renderPrintDocument(data = getScopedExportData()) {
    const container = $("printDocument");
    if (!container) return;

    const endpoint = LAST_ENDPOINT || `${normalizeBase($("baseUrl").value)}/models` || "Unknown endpoint";
    const generatedAt = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

    container.innerHTML = "";

    const header = document.createElement("header");
    header.className = "print-doc-header";

    const title = document.createElement("h1");
    title.className = "print-doc-title";
    title.textContent = "API Models Directory";

    const meta = document.createElement("div");
    meta.className = "print-doc-meta";

    const metaItems = [
      ["Endpoint", endpoint],
      ["Scope", data.scopeLabel],
      ["Total Models", String(data.models.length)],
      ["Generated", generatedAt],
    ];

    for (const [label, value] of metaItems) {
      const span = document.createElement("span");
      const strong = document.createElement("strong");
      strong.textContent = `${label}: `;
      span.append(strong, document.createTextNode(value));
      meta.appendChild(span);
    }

    header.append(title, meta);
    container.appendChild(header);

    if (data.models.length === 0) {
      const empty = document.createElement("p");
      empty.className = "print-empty";
      empty.textContent = "No models available for the selected scope.";
      container.appendChild(empty);
      return;
    }

    for (const group of data.groups) {
      if (group.models.length === 0) continue;

      const section = document.createElement("section");
      section.className = "print-category-section";

      if (data.grouped) {
        const heading = document.createElement("h2");
        heading.className = "print-category-heading";
        heading.textContent = `${group.category} (${group.models.length})`;
        section.appendChild(heading);
      }

      const table = document.createElement("table");
      table.className = "print-table";

      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      const headers = data.grouped
        ? ["#", "Model ID", "Owner", "Created"]
        : ["#", "Model ID", "Category", "Owner", "Created"];

      for (const hText of headers) {
        const th = document.createElement("th");
        th.textContent = hText;
        headRow.appendChild(th);
      }
      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");
      group.models.forEach((m, idx) => {
        const tr = document.createElement("tr");

        const tdIdx = document.createElement("td");
        tdIdx.textContent = String(idx + 1);

        const tdId = document.createElement("td");
        tdId.textContent = m.id;

        const tdOwner = document.createElement("td");
        tdOwner.textContent = m.owner;

        const tdCreated = document.createElement("td");
        tdCreated.textContent = m.created;

        if (data.grouped) {
          tr.append(tdIdx, tdId, tdOwner, tdCreated);
        } else {
          const tdCat = document.createElement("td");
          tdCat.textContent = m.provider;
          tr.append(tdIdx, tdId, tdCat, tdOwner, tdCreated);
        }

        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      section.appendChild(table);
      container.appendChild(section);
    }
  }

  function printAsDocument() {
    if (!MODELS.length) {
      setExportStatus("Fetch models first before printing or saving as PDF.", true);
      return;
    }

    const data = getScopedExportData();
    if (!data.models.length) {
      setExportStatus("No models in the selected scope to print.", true);
      return;
    }

    renderPrintDocument(data);
    $("printDocument")?.setAttribute("aria-hidden", "false");
    isPrintPrepared = true;
    setExportStatus("Opening print / Save as PDF dialog\u2026");

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          window.print();
        } catch (err) {
          isPrintPrepared = false;
          setExportStatus(`Print dialog failed: ${err?.message || err}`, true);
        }
      });
    });
  }

  function escapeCsvCell(value) {
    const str = String(value ?? "");
    if (/[",\r\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  function escapeMdCell(value) {
    return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  }

  function buildMarkdownExport(data) {
    const endpoint = LAST_ENDPOINT || `${normalizeBase($("baseUrl").value)}/models` || "Unknown endpoint";
    const generatedAt = new Date().toISOString();
    const lines = [
      "# API Models Directory",
      "",
      `- **Endpoint:** \`${endpoint}\``,
      `- **Scope:** ${data.scopeLabel}`,
      `- **Total Models:** ${data.models.length}`,
      `- **Generated:** ${generatedAt}`,
      "",
    ];

    if (!data.models.length) {
      lines.push("_No models available for the selected scope._");
      return lines.join("\n");
    }

    for (const group of data.groups) {
      if (!group.models.length) continue;

      if (data.grouped) {
        lines.push(`## ${group.category} (${group.models.length})`);
        lines.push("");
        lines.push("| # | Model ID | Owner | Created |");
        lines.push("| --- | --- | --- | --- |");
        group.models.forEach((m, idx) => {
          lines.push(
            `| ${idx + 1} | \`${escapeMdCell(m.id)}\` | ${escapeMdCell(m.owner)} | ${escapeMdCell(m.created)} |`
          );
        });
        lines.push("");
      } else {
        lines.push("| # | Model ID | Category | Owner | Created |");
        lines.push("| --- | --- | --- | --- | --- |");
        group.models.forEach((m, idx) => {
          lines.push(
            `| ${idx + 1} | \`${escapeMdCell(m.id)}\` | ${escapeMdCell(m.provider)} | ${escapeMdCell(m.owner)} | ${escapeMdCell(m.created)} |`
          );
        });
        lines.push("");
      }
    }

    return lines.join("\n");
  }

  function buildCsvExport(data) {
    const rows = [["model_id", "category", "owner", "created"]];
    for (const m of data.models) {
      rows.push([m.id, m.provider, m.owner, m.created]);
    }
    return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n") + "\r\n";
  }

  function buildJsonExport(data) {
    const endpoint = LAST_ENDPOINT || `${normalizeBase($("baseUrl").value)}/models` || null;
    const mapModel = (m) => ({
      id: m.id,
      category: m.provider,
      owner: m.owner,
      created: m.created,
    });

    if (data.grouped) {
      const categories = {};
      for (const group of data.groups) {
        categories[group.category] = group.models.map(mapModel);
      }
      return JSON.stringify(
        {
          endpoint,
          scope: data.scopeLabel,
          exportedAt: new Date().toISOString(),
          totalModels: data.models.length,
          categories,
        },
        null,
        2
      ) + "\n";
    }

    return JSON.stringify(
      {
        endpoint,
        scope: data.scopeLabel,
        exportedAt: new Date().toISOString(),
        totalModels: data.models.length,
        models: data.models.map(mapModel),
      },
      null,
      2
    ) + "\n";
  }

  function buildTextExport(data) {
    const endpoint = LAST_ENDPOINT || `${normalizeBase($("baseUrl").value)}/models` || "Unknown endpoint";
    const lines = [
      `Endpoint: ${endpoint}`,
      `Scope: ${data.scopeLabel}`,
      `Total Models: ${data.models.length}`,
      `Generated: ${new Date().toISOString()}`,
      "",
    ];

    if (data.grouped) {
      for (const group of data.groups) {
        if (!group.models.length) continue;
        lines.push(`[${group.category}] (${group.models.length})`);
        for (const m of group.models) {
          lines.push(m.id);
        }
        lines.push("");
      }
    } else {
      for (const m of data.models) {
        lines.push(m.id);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  function downloadFile(content, filename, mimeType) {
    try {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.rel = "noopener";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setExportStatus(`Exported ${filename}`);
    } catch {
      try {
        const encoded = encodeURIComponent(content);
        const link = document.createElement("a");
        link.href = `data:${mimeType},${encoded}`;
        link.download = filename;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setExportStatus(`Exported ${filename}`);
      } catch (err) {
        setExportStatus(`Export failed: ${err?.message || err}`, true);
      }
    }
  }

  function handleExport(format) {
    if (!MODELS.length) {
      setExportStatus("Fetch models first before exporting.", true);
      return;
    }

    const data = getScopedExportData();
    if (!data.models.length) {
      setExportStatus("No models in the selected scope to export.", true);
      return;
    }

    const dateStamp = new Date().toISOString().slice(0, 10);

    switch (format) {
      case "md":
        downloadFile(
          buildMarkdownExport(data),
          `${data.slug}-${dateStamp}.md`,
          "text/markdown;charset=utf-8"
        );
        break;
      case "csv":
        downloadFile(
          `\uFEFF${buildCsvExport(data)}`,
          `${data.slug}-${dateStamp}.csv`,
          "text/csv;charset=utf-8"
        );
        break;
      case "json":
        downloadFile(
          buildJsonExport(data),
          `${data.slug}-${dateStamp}.json`,
          "application/json;charset=utf-8"
        );
        break;
      case "txt":
        downloadFile(
          buildTextExport(data),
          `${data.slug}-${dateStamp}.txt`,
          "text/plain;charset=utf-8"
        );
        break;
      default:
        break;
    }
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
    if (!captcha || !captcha.isSolved()) {
      setStatus("Please complete the human check first.", "status-err");
      return;
    }

    const base = normalizeBase($("baseUrl").value);
    const key = $("apiKey").value.trim();

    if (!base) {
      setStatus("Enter a base URL first.", "status-err");
      $("baseUrl").focus();
      return;
    }

    $("fetchBtn").disabled = true;
    setStatus("Fetching\u2026", "status-busy");
    $("errorPanel").classList.add("hidden");

    try {
      const endpoint = `${base}/models`;
      const res = await fetch(endpoint, {
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

      LAST_ENDPOINT = endpoint;
      MODELS = rawList.map((m) => {
        const id = typeof m === "string" ? m : String(m.id || m.name || "");
        const [provider, tagCls] = guessProvider(id);
        const created = typeof m === "object" && m !== null ? formatCreated(m.created) : "\u2014";
        const createdNum = typeof m === "object" && m !== null && Number.isFinite(Number(m.created))
          ? Number(m.created)
          : 0;

        return {
          id,
          provider,
          tagCls,
          owner: typeof m === "object" && m !== null ? String(m.owned_by || m.owner || "\u2014") : "\u2014",
          created,
          createdSort: createdNum > 1e11 ? Math.floor(createdNum / 1000) : createdNum,
        };
      });

      $("resultsPanel").classList.remove("hidden");
      $("filter").value = "";
      populateProviderFilter();
      populateExportScope();
      render();
      setStatus(`\u2713 ${MODELS.length} models loaded`, "status-ok");
    } catch (err) {
      const msg = String(err?.message || err);
      $("errorPanel").classList.remove("hidden");

      let hint = "";
      if (/failed to fetch|networkerror|load failed/i.test(msg)) {
        hint = "\n\nHint: Browser request failed \u2014 usually CORS blocked by the provider, an unreachable local port, or mixed HTTP/HTTPS content. Test with cURL below:";
      } else if (/\b(401|403)\b/.test(msg)) {
        hint = "\n\nHint: Authentication failed. Check that your API key is valid and active.";
      } else if (/\b404\b/.test(msg)) {
        hint = "\n\nHint: Endpoint not found. Verify whether this provider expects /v1 or a custom subpath.";
      }

      LAST_CURL = buildCurl(base, Boolean(key));
      $("errorOut").textContent = `${msg}${hint}\n\ncURL equivalent:\n${LAST_CURL}`;
      setStatus("Failed \u2014 see error details below", "status-err");
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
    out.textContent = "Sending chat completion\u2026";
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
    const fetchBtn = $("fetchBtn");
    fetchBtn.disabled = true;

    captcha = new Captcha("#captchaContainer", {
      onVerified: () => {
        fetchBtn.disabled = false;
      },
      onReset: () => {
        fetchBtn.disabled = true;
      },
    });

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

    $("printDocBtn").addEventListener("click", printAsDocument);
    $("exportMdBtn").addEventListener("click", () => handleExport("md"));
    $("exportCsvBtn").addEventListener("click", () => handleExport("csv"));
    $("exportJsonBtn").addEventListener("click", () => handleExport("json"));
    $("exportTxtBtn").addEventListener("click", () => handleExport("txt"));

    window.addEventListener("beforeprint", () => {
      if (MODELS.length > 0 && !isPrintPrepared) {
        renderPrintDocument();
        $("printDocument")?.setAttribute("aria-hidden", "false");
      }
    });

    window.addEventListener("afterprint", () => {
      isPrintPrepared = false;
      $("printDocument")?.setAttribute("aria-hidden", "true");
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
