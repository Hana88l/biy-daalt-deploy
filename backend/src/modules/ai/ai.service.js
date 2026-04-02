const crypto = require("crypto");

const DEFAULT_AI_PROVIDER = "openai-compatible";
const DEFAULT_AI_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_AI_MODEL = "qwen/qwen-2.5-72b-instruct:free";
const DEFAULT_GEMINI_PROVIDER = "gemini";
const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const LOCAL_AI_PROVIDER = "builtin";
const LOCAL_AI_MODEL = "analytics-rules-v1";
const INTERNAL_TRACKER_KEY_PATTERN = /^(dp_live_|admin_)/i;
const DEFAULT_AI_SYSTEM_PROMPT = [
  "You are Quantum Stars AI, a helpful assistant inside an analytics SaaS dashboard.",
  "Default to Mongolian unless the user clearly asks for another language.",
  "You can answer both analytics questions and general questions.",
  "When the user asks about dashboard metrics, events, pages, alerts, users, or site performance, use the provided analytics context and conversation history.",
  "When the user asks about a general topic unrelated to analytics, answer normally and do not force the dashboard context into the reply.",
  "Be practical, concise, and specific. If real-time or missing information is required, say that clearly instead of guessing.",
].join(" ");

const ANALYTICS_PROMPT_PATTERN =
  /(analytics|dashboard|metric|metrics|event|events|alert|alerts|site|website|page|pages|visitor|visitors|traffic|session|sessions|conversion|funnel|kpi|response time|latency|error|errors|country|device|devices|domain|tracking|user|users|realtime|logs?|heatmap|bounce|pageview|page view|site scan|monitor|monitored|startup|drop[- ]?off|сайт|аналитик|дашбоард|хэрэглэгч|хэрэглэгчид|хандалт|ивент|алдаа|алдаанууд|хуудс|домэйн|траффик|үзэлт|үзэгч|анхааруулга|анализ|хурд|response|scan|tracking)/i;

const FRESHNESS_PROMPT_PATTERN =
  /(latest|recent|today|yesterday|tomorrow|current|currently|now|news|weather|forecast|price|stock|stocks|btc|bitcoin|ethereum|sports|score|winner|who won|schedule|date|time|year|month|day|president|ceo|2025|2026|өнөөдөр|өчигдөр|маргааш|одоо|сүүлийн|хамгийн сүүлийн|цаг агаар|ханш|үнэ|мэдээ|оноо|ялагч|хуваарь|хэдэн он|огноо|цаг)/i;

function trimString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function getAiTimezone() {
  return trimString(process.env.AI_TIMEZONE || process.env.TZ) || "Asia/Ulaanbaatar";
}

function formatCurrentDateTime() {
  const now = new Date();
  const timeZone = getAiTimezone();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return {
    iso: now.toISOString(),
    local: formatter.format(now).replace(",", ""),
    timeZone,
  };
}

function buildCurrentDateSystemMessage() {
  const current = formatCurrentDateTime();
  return [
    `Current datetime is ${current.local} (${current.timeZone}).`,
    `Current ISO timestamp is ${current.iso}.`,
    "Use this current date/time when the user asks about today, this year, current date, current time, or recency.",
    "Do not default to outdated training-cutoff dates such as 2024 when the current date is provided here.",
  ].join(" ");
}

function getEncryptionSecret() {
  return process.env.AI_SETTINGS_SECRET || process.env.JWT_SECRET || "fallback_secret";
}

function isGeminiProvider(settings = {}) {
  const provider = trimString(settings.aiProvider || settings.provider).toLowerCase();
  const baseUrl = trimString(settings.aiBaseUrl || settings.baseUrl).toLowerCase();

  return (
    provider === "gemini" ||
    provider === "google" ||
    provider === "google-ai" ||
    provider === "google-gemini" ||
    /generativelanguage\.googleapis\.com/.test(baseUrl)
  );
}

function getEncryptionKey() {
  return crypto.createHash("sha256").update(getEncryptionSecret()).digest();
}

function encryptSecret(plainText) {
  const value = trimString(plainText);
  if (!value) return null;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    iv: iv.toString("base64"),
    tag: authTag.toString("base64"),
    value: encrypted.toString("base64"),
  });
}

function decryptSecret(payload) {
  const raw = trimString(payload);
  if (!raw) return "";

  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.iv || !parsed?.tag || !parsed?.value) return raw;

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getEncryptionKey(),
      Buffer.from(parsed.iv, "base64")
    );
    decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(parsed.value, "base64")),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  } catch {
    return raw;
  }
}

function normalizeUrlOrDefault(value, fallback) {
  const raw = trimString(value) || fallback;
  const parsed = new URL(raw);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("AI base URL must start with http:// or https://");
  }

  return parsed.toString().replace(/\/+$/, "");
}

function getNormalizedAiSettings(input = {}) {
  const requestedProvider = trimString(input.aiProvider || input.provider);
  const provider = requestedProvider || DEFAULT_AI_PROVIDER;
  const geminiProvider = isGeminiProvider({
    aiProvider: provider,
    aiBaseUrl: input.aiBaseUrl || input.baseUrl,
  });
  const baseUrl = normalizeUrlOrDefault(
    input.aiBaseUrl || input.baseUrl,
    geminiProvider ? DEFAULT_GEMINI_BASE_URL : DEFAULT_AI_BASE_URL
  );
  const model = trimString(input.aiModel || input.model) || (geminiProvider ? DEFAULT_GEMINI_MODEL : DEFAULT_AI_MODEL);
  const systemPrompt = trimString(input.aiSystemPrompt || input.systemPrompt) || DEFAULT_AI_SYSTEM_PROMPT;
  const enabled = Boolean(input.aiEnabled ?? input.enabled);
  const hasApiKey = Boolean(trimString(input.aiApiKeyCiphertext)) || Boolean(trimString(input.providerApiKey));

  return {
    enabled,
    provider,
    baseUrl,
    model,
    systemPrompt,
    hasApiKey,
    configured: Boolean(model && baseUrl && hasApiKey),
  };
}

function serializeAiSettings(user = {}) {
  const settings = getNormalizedAiSettings(user);

  return {
    enabled: settings.enabled,
    provider: settings.provider,
    baseUrl: settings.baseUrl,
    model: settings.model,
    systemPrompt: user?.aiSystemPrompt || DEFAULT_AI_SYSTEM_PROMPT,
    hasApiKey: settings.hasApiKey,
    configured: settings.configured,
  };
}

function normalizeClientMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter((message) => message && typeof message === "object")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: trimString(message.content).slice(0, 6000),
    }))
    .filter((message) => message.content)
    .slice(-12);
}

function buildContextMessage(context) {
  if (!context || typeof context !== "object") return "";

  const serialized = JSON.stringify(context, null, 2);
  if (!serialized || serialized === "{}") return "";

  return serialized.length > 12000 ? `${serialized.slice(0, 12000)}\n...` : serialized;
}

function isAnalyticsPrompt(prompt) {
  return ANALYTICS_PROMPT_PATTERN.test(trimString(prompt));
}

function shouldAttachAnalyticsContext({ messages, context }) {
  const prompt = getLastUserPrompt(messages);
  if (!prompt) return Boolean(context);
  return isAnalyticsPrompt(prompt);
}

function shouldUseRealtimeGrounding(messages = []) {
  const prompt = getLastUserPrompt(messages);
  return FRESHNESS_PROMPT_PATTERN.test(prompt);
}

function buildUpstreamMessages({ systemPrompt, context, messages }) {
  const contextMessage = shouldAttachAnalyticsContext({ messages, context })
    ? buildContextMessage(context)
    : "";
  const upstreamMessages = [
    {
      role: "system",
      content: systemPrompt || DEFAULT_AI_SYSTEM_PROMPT,
    },
    {
      role: "system",
      content: buildCurrentDateSystemMessage(),
    },
  ];

  if (contextMessage) {
    upstreamMessages.push({
      role: "system",
      content: `Analytics context:\n${contextMessage}`,
    });
  }

  return upstreamMessages.concat(normalizeClientMessages(messages));
}

function buildGeminiSystemInstruction({ systemPrompt, context, messages }) {
  const sections = [systemPrompt || DEFAULT_AI_SYSTEM_PROMPT, buildCurrentDateSystemMessage()];

  if (shouldAttachAnalyticsContext({ messages, context })) {
    const contextMessage = buildContextMessage(context);
    if (contextMessage) {
      sections.push(`Analytics context:\n${contextMessage}`);
    }
  }

  return sections.filter(Boolean).join("\n\n");
}

function buildGeminiContents(messages) {
  return normalizeClientMessages(messages).map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));
}

function extractTextContent(content) {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (typeof part?.text === "string") return part.text;
      if (typeof part?.content === "string") return part.content;
      return "";
    })
    .join("\n")
    .trim();
}

function extractGeminiText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";

  return parts
    .map((part) => trimString(part?.text))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function formatGeminiSources(payload) {
  const chunks = payload?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks) || chunks.length === 0) return "";

  const unique = [];
  const seen = new Set();

  for (const chunk of chunks) {
    const uri = trimString(chunk?.web?.uri);
    const title = trimString(chunk?.web?.title);
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    unique.push(`- ${title || uri}: ${uri}`);
    if (unique.length >= 3) break;
  }

  return unique.length > 0 ? `\n\nSources:\n${unique.join("\n")}` : "";
}

function getOpenRouterHeaders(baseUrl) {
  if (!/openrouter\.ai/i.test(baseUrl)) return {};

  return {
    "HTTP-Referer": process.env.APP_ORIGIN || "http://localhost:5173",
    "X-Title": "Quantum Stars Analytics AI",
  };
}

function buildUpstreamUrl(baseUrl) {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function buildGeminiUrl(baseUrl, model, apiKey) {
  const root = baseUrl.replace(/\/+$/, "");
  return `${root}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

function formatInteger(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function formatMs(value) {
  return `${Math.round(Number(value || 0))}ms`;
}

function getLastUserPrompt(messages = []) {
  const normalized = normalizeClientMessages(messages);
  const latest = [...normalized].reverse().find((message) => message.role === "user");
  return trimString(latest?.content).toLowerCase();
}

function getLargestFunnelDrop(funnel = []) {
  if (!Array.isArray(funnel) || funnel.length < 2) return null;

  let bestDrop = null;
  for (let index = 1; index < funnel.length; index += 1) {
    const previous = Number(funnel[index - 1]?.count || 0);
    const current = Number(funnel[index]?.count || 0);
    if (previous <= 0 || current >= previous) continue;

    const dropPercent = ((previous - current) / previous) * 100;
    if (!bestDrop || dropPercent > bestDrop.dropPercent) {
      bestDrop = {
        from: funnel[index - 1]?.stage || `step_${index}`,
        to: funnel[index]?.stage || `step_${index + 1}`,
        previous,
        current,
        dropPercent,
      };
    }
  }

  return bestDrop;
}

function buildHealthInsights(context = {}) {
  const kpis = context?.kpis || {};
  const alerts = Array.isArray(context?.alerts) ? context.alerts : [];
  const topPages = Array.isArray(context?.topPages) ? context.topPages : [];
  const insights = [];

  if (Number(kpis.errors || 0) > 0) {
    insights.push(`Errors ${formatInteger(kpis.errors)} байна, error rate ${formatPercent(kpis.errorRate)}.`)
  }

  if (Number(kpis.averageResponseTimeMs || 0) >= 1500) {
    insights.push(`Average response time ${formatMs(kpis.averageResponseTimeMs)} болсон нь удаашралын дохио байна.`)
  }

  if (Number(kpis.issuesFound || 0) > 0) {
    insights.push(`Site scan дээр ${formatInteger(kpis.issuesFound)} issue илэрсэн.`)
  }

  if (alerts.length > 0) {
    insights.push(`Active alerts: ${alerts.slice(0, 2).map((alert) => alert.message).join(" | ")}.`)
  }

  const unhealthyPages = topPages.filter((page) => {
    const status = trimString(page?.status).toLowerCase();
    return status && !["healthy", "tracked", "live", "ok"].includes(status);
  });

  if (unhealthyPages.length > 0) {
    const sample = unhealthyPages
      .slice(0, 2)
      .map((page) => `${page.page} (${page.status || "n/a"})`)
      .join(", ");
    insights.push(`Анхаарах page-ууд: ${sample}.`)
  }

  return insights;
}

function buildTopPagesSummary(context = {}) {
  const topPages = Array.isArray(context?.topPages) ? context.topPages : [];
  if (topPages.length === 0) return "Top pages data одоогоор алга байна.";

  return topPages
    .slice(0, 3)
    .map((page, index) => {
      const status = page?.status || "n/a";
      const avgTime = page?.avgTime || "n/a";
      return `${index + 1}. ${page.page} - views ${formatInteger(page.views)}, status ${status}, avg ${avgTime}`;
    })
    .join("\n");
}

function buildDeviceCountrySummary(context = {}) {
  const devices = Array.isArray(context?.devices) ? context.devices : [];
  const countries = Array.isArray(context?.countries) ? context.countries : [];
  const lines = [];

  if (devices.length > 0) {
    lines.push(`Top devices: ${devices.slice(0, 3).map((item) => `${item.name} ${formatInteger(item.value)}`).join(", ")}.`);
  }

  if (countries.length > 0) {
    lines.push(`Top countries/signals: ${countries.slice(0, 3).map((item) => `${item.country || item.name || "Unknown"} ${formatInteger(item.count || item.value || 0)}`).join(", ")}.`);
  }

  return lines.join(" ");
}

function buildRecommendations(context = {}) {
  const kpis = context?.kpis || {};
  const recommendations = [];

  if (Number(kpis.averageResponseTimeMs || 0) >= 1500) {
    recommendations.push("Удаан ачаалж байгаа top page-уудын зураг, script, third-party request-үүдийг эхэлж шалга.")
  }

  if (Number(kpis.errorRate || 0) >= 2 || Number(kpis.errors || 0) >= 5) {
    recommendations.push("Error event-үүдийн recent logs-ийг ангилж, хамгийн олон давтагдсан алдааг эхэлж зас.")
  }

  if (Number(kpis.issuesFound || 0) > 0) {
    recommendations.push("Site scan дээр илэрсэн issue-үүдээс indexable болон broken link төрлүүдийг түрүүлж цэвэрлэ.")
  }

  const funnelDrop = getLargestFunnelDrop(context?.funnel);
  if (funnelDrop) {
    recommendations.push(`${funnelDrop.from} -> ${funnelDrop.to} алхам дээр ${formatPercent(funnelDrop.dropPercent)} уналт байна. Энэ хэсгийн UX болон tracking-аа шалга.`)
  }

  if (recommendations.length === 0) {
    recommendations.push("Одоогийн дата дээр ноцтой уналт бага байна. Top pages, alerts, funnel-ээ өдөр бүр харж baseline-аа тогтоогоорой.")
  }

  return recommendations.slice(0, 3);
}

function buildExecutiveSummary(context = {}) {
  const kpis = context?.kpis || {};
  const funnelDrop = getLargestFunnelDrop(context?.funnel);
  const insights = buildHealthInsights(context);

  const summaryLines = [
    `Traffic: ${formatInteger(kpis.totalEvents)} events, ${formatInteger(kpis.totalUsers)} users, ${formatInteger(kpis.pageViews)} page views.`,
    `Quality: ${formatInteger(kpis.errors)} errors, error rate ${formatPercent(kpis.errorRate)}, average response ${formatMs(kpis.averageResponseTimeMs)}.`,
  ];

  if (funnelDrop) {
    summaryLines.push(`Conversion bottleneck: ${funnelDrop.from} -> ${funnelDrop.to} дээр ${formatPercent(funnelDrop.dropPercent)} drop байна.`);
  }

  if (insights.length > 0) {
    summaryLines.push(`Priority signal: ${insights[0]}`);
  }

  return summaryLines.join("\n");
}

function buildGeneralPurposeLocalReply(prompt) {
  const normalizedPrompt = trimString(prompt);
  const current = formatCurrentDateTime();

  if (!normalizedPrompt) {
    return {
      content: "Сайн байна уу. Би dashboard доторх AI туслах тул analytics болон ерөнхий сэдвээр хоёуланд нь тусалж чадна.",
      model: LOCAL_AI_MODEL,
      provider: LOCAL_AI_PROVIDER,
    };
  }

  if (/(hello|hi|hey|сайн уу|сайн байна уу|мэнд|yo)\b/i.test(normalizedPrompt)) {
    return {
      content: "Сайн байна уу. Би analytics, код, тайлбар, санаа боловсруулах, ерөнхий мэдлэгийн асуултуудад тусалж чадна. Шууд асуултаа бичээд явуул.",
      model: LOCAL_AI_MODEL,
      provider: LOCAL_AI_PROVIDER,
    };
  }

  if (/(weather|цаг агаар|forecast|temperature|бороо|нар|сэрүүн|хүйтэн)/i.test(normalizedPrompt)) {
    return {
      content: "Би одоогийн live weather feed-гүй тул яг энэ мөчийн цаг агаарын хэмжилт хэлж чадахгүй. Гэхдээ хот, улс, өдөр заавал хэлбэл тухайн улиралд ер нь ямар байдаг, юунд бэлдэх, forecast-оо яаж шалгах талаар тусалж чадна.",
      model: LOCAL_AI_MODEL,
      provider: LOCAL_AI_PROVIDER,
    };
  }

  if (/(time|date|year|month|day|current date|current time|current year|what time|what year|what date|today|now|өдөр|сар|он|он сар|цаг хэд|өнөөдөр|маргааш)/i.test(normalizedPrompt)) {
    return {
      content: `Одоогийн серверийн цагийн дагуу current datetime нь ${current.local} (${current.timeZone}) байна. ISO timestamp нь ${current.iso}. Хэрэв өөр timezone руу хөрвүүлэх хэрэгтэй бол хот эсвэл UTC offset-оо бичээд асуугаарай.`,
      model: LOCAL_AI_MODEL,
      provider: LOCAL_AI_PROVIDER,
    };
  }

  if (/(translate|translation|орчуул|translate this)/i.test(normalizedPrompt)) {
    return {
      content: "Орчуулга хийж чадна. Орчуулах текстээ явуул, ямар хэлнээс ямар хэл рүү орчуулахыг нь хамт бичээрэй.",
      model: LOCAL_AI_MODEL,
      provider: LOCAL_AI_PROVIDER,
    };
  }

  if (/(code|coding|programming|javascript|react|node|api|sql|python|bug|debug|код|програм|алдаа зас|react|backend|frontend)/i.test(normalizedPrompt)) {
    return {
      content: `Энэ асуулт analytics-аас ангид coding төрлийн асуулт байна. Би тусалж чадна. Асуудлын код, error message, эсвэл яг юу хийх гэж байгаагаа жаахан тодорхой бичвэл алхамтайгаар тайлбарлаж өгнө.\n\nТаны асуулт: "${normalizedPrompt.slice(0, 220)}"`,
      model: LOCAL_AI_MODEL,
      provider: LOCAL_AI_PROVIDER,
    };
  }

  if (/(who is|what is|explain|тайлбарла|юу вэ|яагаад|how does|difference between|compare|харьцуул)/i.test(normalizedPrompt)) {
    return {
      content: `Энэ нь ерөнхий тайлбарын асуулт байна. Би тус сэдвийг ерөнхий мэдлэг дээрээ тулгуурлаад тайлбарлаж чадна. Илүү чанартай хариу авахын тулд яг ойлгохыг хүссэн цэгээ 1-2 өгүүлбэрээр нарийвчилбал илүү оновчтой тайлбар өгнө.\n\nАсуусан сэдэв: "${normalizedPrompt.slice(0, 220)}"`,
      model: LOCAL_AI_MODEL,
      provider: LOCAL_AI_PROVIDER,
    };
  }

  return {
    content: `Энэ асуулт dashboard analytics-аас шууд хамаарахгүй байна. Гэхдээ би ерөнхий AI туслах хэлбэрээр хариулж чадна. Хэрэв та илүү нарийн, чанартай хариу хүсэж байвал асуултаа арай тодорхой бичээд дахин асуугаарай.\n\nТаны сэдэв: "${normalizedPrompt.slice(0, 220)}"\n\nЖишээ нь:\n- тайлбар авах\n- харьцуулалт хийх\n- санаа боловсруулах\n- coding/debug хийх\n- текст орчуулах`,
    model: LOCAL_AI_MODEL,
    provider: LOCAL_AI_PROVIDER,
  };
}

function buildLocalAnalyticsReply({ messages, context }) {
  const prompt = getLastUserPrompt(messages);
  const kpis = context?.kpis || {};
  const siteLabel = context?.activeSite?.name || context?.activeSite?.url || "current dashboard";
  const recommendations = buildRecommendations(context);
  const healthInsights = buildHealthInsights(context);
  const deviceCountrySummary = buildDeviceCountrySummary(context);
  const analyticsPrompt = isAnalyticsPrompt(prompt);

  if (!analyticsPrompt) {
    return buildGeneralPurposeLocalReply(prompt);
  }

  if (!prompt) {
    return {
      content: `Built-in copilot for ${siteLabel} is ready.\n\n${buildExecutiveSummary(context)}\n\nRecommended actions:\n- ${recommendations.join("\n- ")}`,
      model: LOCAL_AI_MODEL,
      provider: LOCAL_AI_PROVIDER,
    };
  }

  if (/(executive|summary|товч|ерөнхий|overview)/i.test(prompt)) {
    return {
      content: `Executive summary for ${siteLabel}:\n\n${buildExecutiveSummary(context)}\n\nNext actions:\n- ${recommendations.join("\n- ")}`,
      model: LOCAL_AI_MODEL,
      provider: LOCAL_AI_PROVIDER,
    };
  }

  if (/(conversion|funnel|signup|purchase|юрүл|шилжилт)/i.test(prompt)) {
    const funnelDrop = getLargestFunnelDrop(context?.funnel);
    const funnelLine = funnelDrop
      ? `${funnelDrop.from} -> ${funnelDrop.to} дээр ${formatPercent(funnelDrop.dropPercent)} уналт байна (${formatInteger(funnelDrop.previous)}-с ${formatInteger(funnelDrop.current)} болсон).`
      : "Funnel drop тодорхой харагдахгүй байна.";

    return {
      content: `Conversion analysis for ${siteLabel}:\n\n${funnelLine}\n\nRecommended actions:\n- ${recommendations.join("\n- ")}`,
      model: LOCAL_AI_MODEL,
      provider: LOCAL_AI_PROVIDER,
    };
  }

  if (/(alert|issue|error|problem|асуудал|алдаа|эрсдэл)/i.test(prompt)) {
    const issueText = healthInsights.length > 0
      ? healthInsights.map((item) => `- ${item}`).join("\n")
      : "- Ноцтой issue одоохондоо тодорхой алга байна.";

    return {
      content: `Priority issues for ${siteLabel}:\n${issueText}\n\nFix first:\n- ${recommendations.join("\n- ")}`,
      model: LOCAL_AI_MODEL,
      provider: LOCAL_AI_PROVIDER,
    };
  }

  if (/(page|top page|status|load|time|хуудс|page)/i.test(prompt)) {
    return {
      content: `Top pages for ${siteLabel}:\n${buildTopPagesSummary(context)}\n\nFocus next:\n- ${recommendations.join("\n- ")}`,
      model: LOCAL_AI_MODEL,
      provider: LOCAL_AI_PROVIDER,
    };
  }

  if (/(country|device|mobile|desktop|улс|төхөөрөмж)/i.test(prompt)) {
    return {
      content: `Audience breakdown for ${siteLabel}:\n\n${deviceCountrySummary || "Device/country data одоогоор хангалтгүй байна."}\n\nTraffic quality:\n- Error rate ${formatPercent(kpis.errorRate)}\n- Avg response ${formatMs(kpis.averageResponseTimeMs)}`,
      model: LOCAL_AI_MODEL,
      provider: LOCAL_AI_PROVIDER,
    };
  }

  return {
    content: `Built-in analytics answer for ${siteLabel}:\n\n${buildExecutiveSummary(context)}\n\nTop pages:\n${buildTopPagesSummary(context)}\n\nRecommended actions:\n- ${recommendations.join("\n- ")}`,
    model: LOCAL_AI_MODEL,
    provider: LOCAL_AI_PROVIDER,
  };
}

function getProviderKeyFromSettings(settings = {}) {
  return trimString(settings.providerApiKey) || decryptSecret(settings.aiApiKeyCiphertext);
}

function validateProviderKey(settings = {}, rawApiKey) {
  const apiKey = trimString(rawApiKey);
  const baseUrl = trimString(settings.aiBaseUrl || settings.baseUrl || DEFAULT_AI_BASE_URL);

  if (!apiKey) {
    return { valid: false, message: "AI API key is missing" };
  }

  if (INTERNAL_TRACKER_KEY_PATTERN.test(apiKey)) {
    return {
      valid: false,
      message: "The saved key is your analytics tracking key, not an AI provider key. Please paste a real OpenRouter/OpenAI key.",
    };
  }

  if (/openrouter\.ai/i.test(baseUrl) && !/^sk-or-/i.test(apiKey)) {
    return {
      valid: false,
      message: "OpenRouter requires an API key that starts with sk-or-. Please save a real OpenRouter key.",
    };
  }

  return { valid: true, apiKey };
}

function getValidatedProviderKey(settings = {}) {
  const validation = validateProviderKey(settings, getProviderKeyFromSettings(settings));
  if (!validation.valid) {
    throw new Error(validation.message);
  }

  return validation.apiKey;
}

function buildSharedAiSettingsFromEnv() {
  const geminiApiKey = trimString(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  if (geminiApiKey) {
    return {
      aiEnabled: true,
      aiProvider: trimString(process.env.GEMINI_PROVIDER) || DEFAULT_GEMINI_PROVIDER,
      aiBaseUrl: trimString(process.env.GEMINI_BASE_URL) || DEFAULT_GEMINI_BASE_URL,
      aiModel: trimString(process.env.GEMINI_MODEL) || DEFAULT_GEMINI_MODEL,
      aiSystemPrompt:
        trimString(process.env.GEMINI_SYSTEM_PROMPT) ||
        trimString(process.env.AI_SHARED_SYSTEM_PROMPT) ||
        DEFAULT_AI_SYSTEM_PROMPT,
      providerApiKey: geminiApiKey,
    };
  }

  const apiKey = trimString(process.env.AI_SHARED_API_KEY);
  if (!apiKey) return null;

  return {
    aiEnabled: true,
    aiProvider: trimString(process.env.AI_SHARED_PROVIDER) || DEFAULT_AI_PROVIDER,
    aiBaseUrl: trimString(process.env.AI_SHARED_BASE_URL) || DEFAULT_AI_BASE_URL,
    aiModel: trimString(process.env.AI_SHARED_MODEL) || DEFAULT_AI_MODEL,
    aiSystemPrompt: trimString(process.env.AI_SHARED_SYSTEM_PROMPT) || DEFAULT_AI_SYSTEM_PROMPT,
    providerApiKey: apiKey,
  };
}

async function requestGeminiCompletion(settings, { messages, context }) {
  const apiKey = getValidatedProviderKey(settings);
  const normalizedSettings = getNormalizedAiSettings(settings);
  const contents = buildGeminiContents(messages);

  if (contents.length === 0) {
    throw new Error("Please enter a message for the AI assistant");
  }

  const body = {
    system_instruction: {
      parts: [
        {
          text: buildGeminiSystemInstruction({
            systemPrompt: settings.aiSystemPrompt || DEFAULT_AI_SYSTEM_PROMPT,
            context,
            messages,
          }),
        },
      ],
    },
    contents,
    generationConfig: {
      temperature: 0.35,
      maxOutputTokens: 1200,
    },
  };

  if (shouldUseRealtimeGrounding(messages)) {
    body.tools = [{ google_search: {} }];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(buildGeminiUrl(normalizedSettings.baseUrl, normalizedSettings.model, apiKey), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMessage =
        payload?.error?.message ||
        payload?.message ||
        "Gemini provider request failed";
      throw new Error(errorMessage);
    }

    const text = extractGeminiText(payload);
    if (!text) {
      throw new Error("Gemini provider returned an empty response");
    }

    return {
      content: `${text}${formatGeminiSources(payload)}`,
      model: normalizedSettings.model,
      provider: normalizedSettings.provider,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Gemini provider timed out. Please try again.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestAiCompletion(settings, { messages, context }) {
  if (isGeminiProvider(settings)) {
    return requestGeminiCompletion(settings, { messages, context });
  }

  const apiKey = getValidatedProviderKey(settings);

  const normalizedSettings = getNormalizedAiSettings(settings);
  const upstreamMessages = buildUpstreamMessages({
    systemPrompt: settings.aiSystemPrompt || DEFAULT_AI_SYSTEM_PROMPT,
    context,
    messages,
  });

  if (upstreamMessages.length <= 1) {
    throw new Error("Please enter a message for the AI assistant");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(buildUpstreamUrl(normalizedSettings.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...getOpenRouterHeaders(normalizedSettings.baseUrl),
      },
      body: JSON.stringify({
        model: normalizedSettings.model,
        messages: upstreamMessages,
        temperature: 0.3,
        max_tokens: 900,
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMessage =
        payload?.error?.message ||
        payload?.message ||
        "AI provider request failed";
      throw new Error(errorMessage);
    }

    const text =
      extractTextContent(payload?.choices?.[0]?.message?.content) ||
      extractTextContent(payload?.message?.content) ||
      "";

    if (!text) {
      throw new Error("AI provider returned an empty response");
    }

    return {
      content: text,
      model: normalizedSettings.model,
      provider: normalizedSettings.provider,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("AI provider timed out. Please try again.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  DEFAULT_AI_PROVIDER,
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_MODEL,
  DEFAULT_GEMINI_PROVIDER,
  DEFAULT_GEMINI_BASE_URL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_AI_SYSTEM_PROMPT,
  LOCAL_AI_MODEL,
  LOCAL_AI_PROVIDER,
  buildSharedAiSettingsFromEnv,
  buildLocalAnalyticsReply,
  encryptSecret,
  getProviderKeyFromSettings,
  getNormalizedAiSettings,
  getValidatedProviderKey,
  isGeminiProvider,
  normalizeClientMessages,
  requestAiCompletion,
  serializeAiSettings,
  trimString,
};
