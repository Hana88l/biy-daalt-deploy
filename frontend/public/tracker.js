(function () {
  const INSTANCE_KEY = "__quantumTrackerInstance";
  const currentScript = document.currentScript;
  const scriptSrc = currentScript?.getAttribute("src") || "";
  const scriptOrigin = scriptSrc ? new URL(scriptSrc, window.location.href).origin : window.location.origin;
  const initialSiteId = currentScript?.getAttribute("data-site-id") || "";
  const initialEndpoint = currentScript?.getAttribute("data-endpoint") || `${scriptOrigin}/track`;

  if (window[INSTANCE_KEY]?.reconfigure) {
    window[INSTANCE_KEY].reconfigure({
      siteId: initialSiteId,
      endpoint: initialEndpoint,
    });
    return;
  }

  let config = {
    siteId: initialSiteId,
    endpoint: initialEndpoint,
  };

  let userId = localStorage.getItem("qs_user_id");
  if (!userId) {
    userId = `usr_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem("qs_user_id", userId);
  }

  const SIGNATURE_DEDUPE_WINDOW_MS = 5000;
  const AUTH_ATTEMPT_DEDUPE_WINDOW_MS = 1500;
  const PAGE_VIEW_DEDUPE_WINDOW_MS = 2500;
  const recentSignatureMap = new Map();
  const recentAuthAttemptMap = new Map();
  const pendingDomScanMap = new Map();

  let domScanTimer = null;
  let currentPath = window.location.pathname + window.location.search + window.location.hash;
  let initialTracked = false;

  const AUTH_ACTION_PATTERNS = [
    {
      action: "login",
      keywords: ["login", "log in", "signin", "sign in", "sign-in", "session", "token", "нэвтрэх"],
    },
    {
      action: "signup",
      keywords: ["signup", "sign up", "sign-up", "register", "create account", "create-account", "бүртгүүлэх"],
    },
    {
      action: "reset_password",
      keywords: ["forgot", "reset password", "reset-password", "recover", "password reset", "нууц үг сэргээх"],
    },
  ];

  const AUTH_FAILURE_PHRASES = [
    "invalid credentials",
    "incorrect credentials",
    "invalid login",
    "login failed",
    "sign in failed",
    "authentication failed",
    "auth failed",
    "wrong password",
    "incorrect password",
    "invalid password",
    "password is incorrect",
    "email or password incorrect",
    "email/password incorrect",
    "wrong email or password",
    "wrong username or password",
    "user not found",
    "account not found",
    "email not found",
    "not registered",
    "not registered yet",
    "unauthorized",
    "forbidden",
    "access denied",
    "бүртгэлгүй",
    "бүртгэлгүй байна",
    "хэрэглэгч олдсонгүй",
    "имэйл нууц үг буруу",
    "и-мэйл нууц үг буруу",
    "имэйл эсвэл нууц үг буруу",
    "нууц үг буруу",
    "нэвтрэх нэр эсвэл нууц үг буруу",
    "нэвтрэх боломжгүй",
    "нэвтрэлт амжилтгүй",
    "нэвтрэхэд алдаа гарлаа",
    "хандах эрхгүй",
  ];

  const AUTH_ERROR_TOKENS = [
    "error",
    "failed",
    "incorrect",
    "invalid",
    "wrong",
    "unauthorized",
    "forbidden",
    "алдаа",
    "буруу",
    "олдсонгүй",
    "хүчингүй",
  ];

  const AUTH_MESSAGE_SELECTOR = [
    '[role="alert"]',
    '[aria-live]',
    '[data-error]',
    '[data-state="error"]',
    '[class*="error"]',
    '[class*="alert"]',
    '[class*="invalid"]',
    '[class*="warning"]',
    '[class*="message"]',
    '[id*="error"]',
    '[id*="alert"]',
  ].join(",");

  const trimText = (value, max = 500) => {
    if (value == null) return null;
    const text = String(value).replace(/\s+/g, " ").trim();
    if (!text) return null;
    return text.length > max ? `${text.slice(0, max)}...` : text;
  };

  const safeSerialize = (value, max = 1000) => {
    if (value == null) return null;
    if (typeof value === "string") return trimText(value, max);

    try {
      return trimText(JSON.stringify(value), max);
    } catch (error) {
      return trimText(String(value), max);
    }
  };

  const normalizeTextForMatch = (value) => {
    if (value == null) return "";
    const raw = String(value);
    const normalized = typeof raw.normalize === "function" ? raw.normalize("NFKC") : raw;
    return normalized.toLowerCase().replace(/\s+/g, " ").trim();
  };

  const cleanupMap = (map, maxAge, now = Date.now()) => {
    map.forEach((timestamp, key) => {
      if (now - timestamp > maxAge) {
        map.delete(key);
      }
    });
  };

  const shouldTrackSignature = (signature, windowMs = SIGNATURE_DEDUPE_WINDOW_MS) => {
    const now = Date.now();
    const previous = recentSignatureMap.get(signature);
    if (previous && now - previous < windowMs) {
      return false;
    }

    recentSignatureMap.set(signature, now);
    cleanupMap(recentSignatureMap, windowMs * 4, now);
    return true;
  };

  const shouldTrackAuthAttempt = (action) => {
    const key = `${action || "login"}|${window.location.pathname}`;
    const now = Date.now();
    const previous = recentAuthAttemptMap.get(key);
    if (previous && now - previous < AUTH_ATTEMPT_DEDUPE_WINDOW_MS) {
      return false;
    }

    recentAuthAttemptMap.set(key, now);
    cleanupMap(recentAuthAttemptMap, AUTH_ATTEMPT_DEDUPE_WINDOW_MS * 4, now);
    return true;
  };

  const toUrl = (input) => {
    try {
      return new URL(input, window.location.href);
    } catch (error) {
      return null;
    }
  };

  const normalizeRequestUrl = (input) => {
    if (!input) return null;
    const raw = typeof input === "string" ? input : input?.url || String(input);
    return toUrl(raw)?.toString() || raw;
  };

  const isTrackerRequest = (requestUrl) => {
    if (!requestUrl) return false;
    const normalized = normalizeRequestUrl(requestUrl);
    const endpoint = normalizeRequestUrl(config.endpoint);
    if (!normalized || !endpoint) return false;
    return normalized === endpoint;
  };

  const parseBodyHints = (body) => {
    if (!body) return {};

    if (typeof body === "string") {
      try {
        return JSON.parse(body);
      } catch (error) {
        try {
          return Object.fromEntries(new URLSearchParams(body).entries());
        } catch (parseError) {
          return { raw: body };
        }
      }
    }

    if (typeof FormData !== "undefined" && body instanceof FormData) {
      return Object.fromEntries(body.entries());
    }

    if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
      return Object.fromEntries(body.entries());
    }

    if (typeof body === "object") {
      return body;
    }

    return {};
  };

  const inferAuthActionFromText = (value) => {
    const text = normalizeTextForMatch(value);
    if (!text) return null;

    for (const entry of AUTH_ACTION_PATTERNS) {
      if (entry.keywords.some((keyword) => text.includes(keyword))) {
        return entry.action;
      }
    }

    return null;
  };

  const inferAuthAction = ({ url, body, method }) => {
    const requestUrl = normalizeRequestUrl(url);
    const methodName = String(method || "GET").toUpperCase();
    const bodyHints = parseBodyHints(body);

    const actionFromUrl = inferAuthActionFromText(requestUrl);
    if (actionFromUrl) return actionFromUrl;

    const values = Object.entries(bodyHints).reduce((acc, [key, value]) => {
      acc[String(key).toLowerCase()] = typeof value === "string" ? value.toLowerCase() : value;
      return acc;
    }, {});

    const hasIdentity =
      typeof values.email === "string" ||
      typeof values.username === "string" ||
      typeof values.identifier === "string" ||
      typeof values.phone === "string";
    const hasPassword = typeof values.password === "string" || typeof values.pass === "string";
    const hasPasswordConfirmation =
      typeof values.confirmpassword === "string" ||
      typeof values.confirm_password === "string" ||
      typeof values.passwordconfirmation === "string";

    if (hasIdentity && hasPasswordConfirmation) return "signup";
    if (hasIdentity && hasPassword) return "login";
    if (methodName === "POST" && hasPassword) return "login";

    return null;
  };

  const inferAuthFailureMessage = (value) => {
    if (!value) return null;

    const normalized = normalizeTextForMatch(value);
    if (AUTH_FAILURE_PHRASES.some((phrase) => normalized.includes(normalizeTextForMatch(phrase)))) {
      return trimText(value, 500);
    }

    return null;
  };

  const extractResponseMessages = (value, bucket = [], depth = 0) => {
    if (depth > 3 || bucket.length >= 20 || value == null) return bucket;

    if (typeof value === "string") {
      bucket.push(value);
      return bucket;
    }

    if (Array.isArray(value)) {
      value.slice(0, 10).forEach((item) => extractResponseMessages(item, bucket, depth + 1));
      return bucket;
    }

    if (typeof value === "object") {
      Object.values(value)
        .slice(0, 12)
        .forEach((entry) => extractResponseMessages(entry, bucket, depth + 1));
    }

    return bucket;
  };

  const analyzeAuthResponse = ({ action, status, text, contentType }) => {
    const normalizedText = trimText(text, 2000);
    let parsed = null;

    if (normalizedText) {
      const looksJson =
        (contentType && contentType.toLowerCase().includes("application/json")) ||
        normalizedText.startsWith("{") ||
        normalizedText.startsWith("[");

      if (looksJson) {
        try {
          parsed = JSON.parse(normalizedText);
        } catch (error) {
          parsed = null;
        }
      }
    }

    const candidateMessages = [];
    if (parsed) {
      extractResponseMessages(parsed, candidateMessages);
    }
    if (normalizedText) {
      candidateMessages.push(normalizedText);
    }

    const matchedMessage = candidateMessages.map(inferAuthFailureMessage).find(Boolean);
    const explicitFailure =
      parsed &&
      (parsed.success === false ||
        parsed.ok === false ||
        String(parsed.status || "").toLowerCase() === "error" ||
        String(parsed.status || "").toLowerCase() === "failed" ||
        String(parsed.status || "").toLowerCase() === "fail");

    if (matchedMessage) {
      return {
        isFailure: true,
        message: matchedMessage,
        responseSnippet: normalizedText,
      };
    }

    if (explicitFailure) {
      return {
        isFailure: true,
        message: `Auth ${action} failed`,
        responseSnippet: normalizedText,
      };
    }

    if (status >= 400) {
      return {
        isFailure: true,
        message: normalizedText || `Auth ${action} failed with status ${status}`,
        responseSnippet: normalizedText,
      };
    }

    return {
      isFailure: false,
      message: null,
      responseSnippet: normalizedText,
    };
  };

  const trackEvent = (eventName, properties = {}) => {
    if (!config.siteId) return;

    const payload = {
      event: eventName,
      userId,
      properties: {
        url: window.location.pathname,
        host: window.location.hostname,
        country: "Mongolia",
        device: /Mobile|Android|iP(ad|hone)/.test(navigator.userAgent) ? "Mobile" : "Desktop",
        browser: navigator.userAgent.includes("Firefox")
          ? "Firefox"
          : navigator.userAgent.includes("Safari") && !navigator.userAgent.includes("Chrome")
            ? "Safari"
            : navigator.userAgent.includes("Edg")
              ? "Edge"
              : "Chrome",
        ...properties,
      },
    };

    fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.siteId,
      },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // Ignore tracker transport failures.
    });
  };

  const trackCapturedError = (kind, details = {}) => {
    const message = trimText(details.message || "Unknown error");
    const signature =
      details.dedupeKey ||
      [
        kind,
        message,
        details.file || details.resourceUrl || details.requestUrl || "",
        details.line || "",
        details.column || "",
        details.status || "",
      ].join("|");

    if (!shouldTrackSignature(signature)) return;

    trackEvent("error", {
      severity: "error",
      kind,
      capturedBy: "tracker",
      message,
      stack: trimText(details.stack, 2000),
      file: details.file || null,
      line: details.line ?? null,
      column: details.column ?? null,
      resourceUrl: details.resourceUrl || null,
      requestUrl: details.requestUrl || null,
      method: details.method || null,
      status: details.status ?? null,
      responseSnippet: trimText(details.responseSnippet, 500),
      tagName: details.tagName || null,
      reason: details.reason || null,
      source: details.source || "auto_capture",
      action: details.action || null,
      authRelated: details.authRelated === true,
      ...details.extra,
    });
  };

  const trackAuthAttempt = (action, details = {}) => {
    const normalizedAction = action || "login";
    if (!shouldTrackAuthAttempt(normalizedAction)) return;

    trackEvent("auth_attempt", {
      action: normalizedAction,
      source: details.source || "auth_request",
      method: details.method || null,
      requestUrl: details.requestUrl || null,
    });
  };

  const trackAuthFailure = (action, details = {}) => {
    const normalizedAction = action || inferAuthActionFromText(details.message) || "login";
    const dedupeKey =
      details.dedupeKey ||
      `auth|${normalizedAction}|${normalizeTextForMatch(details.message || `Auth ${normalizedAction} failed`)}`;

    trackCapturedError("auth", {
      message: details.message || `Auth ${normalizedAction} failed`,
      requestUrl: details.requestUrl || null,
      method: details.method || null,
      status: details.status ?? null,
      responseSnippet: details.responseSnippet || null,
      reason: details.reason || null,
      source: details.source || "auth_request",
      action: normalizedAction,
      authRelated: true,
      dedupeKey,
      extra: details.extra,
    });
  };

  const trackInitialPageView = (source) => {
    if (initialTracked || !config.siteId) return;
    initialTracked = true;
    trackPageView(source);
  };

  const shouldTrackPageView = (path, source) => {
    const key = `${path}|${source || "unknown"}`;
    const now = Date.now();

    try {
      const raw = sessionStorage.getItem("qs_last_page_view");
      if (raw) {
        const previous = JSON.parse(raw);
        if (previous?.key === key && now - Number(previous.ts || 0) < PAGE_VIEW_DEDUPE_WINDOW_MS) {
          return false;
        }
      }

      sessionStorage.setItem("qs_last_page_view", JSON.stringify({ key, ts: now }));
    } catch (error) {
      // Ignore storage failures and fall back to best-effort tracking.
    }

    return true;
  };

  const trackPageView = (source) => {
    const path = window.location.pathname + window.location.search + window.location.hash;
    if (!shouldTrackPageView(path, source)) return;
    trackEvent("page_view", {
      source,
      url: path,
      statusCode: 200,
      loadTimeMs: (() => {
        if (source === "spa_navigation" || !window.performance?.getEntriesByType) return null;

        const navigationEntries = window.performance.getEntriesByType("navigation");
        const entry = Array.isArray(navigationEntries) ? navigationEntries[0] : null;
        if (!entry) return null;

        const candidate =
          Number(entry.loadEventEnd) ||
          Number(entry.domComplete) ||
          Number(entry.domContentLoadedEventEnd) ||
          Number(entry.responseEnd) ||
          Number(entry.duration);

        return candidate > 0 ? Math.round(candidate) : null;
      })(),
    });
  };

  const reconfigure = (nextConfig = {}) => {
    const previousSiteId = config.siteId;
    config = {
      ...config,
      ...nextConfig,
      siteId: nextConfig.siteId || "",
      endpoint: nextConfig.endpoint || config.endpoint,
    };

    if (!previousSiteId && config.siteId) {
      initialTracked = false;
      currentPath = window.location.pathname + window.location.search + window.location.hash;
      trackInitialPageView("tracker_configured");
    }
  };

  const getElementText = (element) => {
    if (!element) return null;
    return trimText(element.innerText || element.textContent || "", 500);
  };

  const isElementVisible = (element) => {
    if (!element || element.hidden) return false;
    if (element.getAttribute("aria-hidden") === "true") return false;

    if (typeof window.getComputedStyle !== "function") return true;
    const styles = window.getComputedStyle(element);
    return styles.display !== "none" && styles.visibility !== "hidden";
  };

  const hasInput = (root, selector) => {
    return Boolean(root?.querySelector?.(selector));
  };

  const inferAuthActionFromForm = (form) => {
    if (!form) return null;

    const actionFromFormText = inferAuthActionFromText(
      [
        form.getAttribute("action"),
        form.getAttribute("id"),
        form.getAttribute("name"),
        form.getAttribute("class"),
        form.getAttribute("aria-label"),
        form.textContent,
        window.location.pathname,
      ]
        .filter(Boolean)
        .join(" "),
    );

    if (actionFromFormText) return actionFromFormText;

    const hasPassword = hasInput(form, 'input[type="password"], input[name*="password" i], input[id*="password" i]');
    const hasConfirm = hasInput(form, 'input[name*="confirm" i], input[id*="confirm" i]');
    const hasIdentity = hasInput(
      form,
      'input[type="email"], input[name*="email" i], input[id*="email" i], input[name*="user" i], input[id*="user" i], input[name*="identifier" i]',
    );

    if (hasPassword && hasConfirm) return "signup";
    if (hasPassword && hasIdentity) return "login";
    if (hasPassword) return inferAuthActionFromText(window.location.pathname) || "login";
    return null;
  };

  const inferAuthActionFromElement = (element) => {
    if (!element) return inferAuthActionFromText(window.location.pathname);

    const form = element.closest?.("form");
    const formAction = inferAuthActionFromForm(form);
    if (formAction) return formAction;

    let current = element;
    for (let depth = 0; current && depth < 5; depth += 1) {
      const action = inferAuthActionFromText(
        [
          current.getAttribute?.("id"),
          current.getAttribute?.("class"),
          current.getAttribute?.("name"),
          current.getAttribute?.("aria-label"),
          current.getAttribute?.("data-testid"),
          current.getAttribute?.("data-test"),
          current.getAttribute?.("data-qa"),
          current.getAttribute?.("action"),
          current.getAttribute?.("href"),
          current.textContent,
          window.location.pathname,
        ]
          .filter(Boolean)
          .join(" "),
      );

      if (action) return action;

      if (hasInput(current, 'input[type="password"], input[name*="password" i], input[id*="password" i]')) {
        if (hasInput(current, 'input[name*="confirm" i], input[id*="confirm" i]')) {
          return "signup";
        }
        return "login";
      }

      current = current.parentElement;
    }

    return inferAuthActionFromText(window.location.pathname);
  };

  const buildElementHint = (element) => {
    if (!element?.tagName) return null;
    const tag = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : "";
    const className =
      typeof element.className === "string" && element.className.trim()
        ? `.${element.className.trim().split(/\s+/).slice(0, 3).join(".")}`
        : "";
    return trimText(`${tag}${id}${className}`, 120);
  };

  const detectAuthDomFailure = (element) => {
    if (!element || !isElementVisible(element)) return null;

    const text = getElementText(element);
    if (!text) return null;
    const action = inferAuthActionFromElement(element);
    if (!action) return null;

    const exactMessage = inferAuthFailureMessage(text);
    const hasErrorToken = AUTH_ERROR_TOKENS.some((token) =>
      normalizeTextForMatch(text).includes(normalizeTextForMatch(token)),
    );

    if (!exactMessage && !hasErrorToken) return null;

    return {
      action,
      message: exactMessage || text,
      selector: buildElementHint(element),
    };
  };

  const scanNodeForAuthMessages = (node, source = "dom_observer") => {
    if (!node || node.nodeType !== 1) return;

    const candidates = [];
    const seen = new Set();
    const pushCandidate = (element) => {
      if (!element || !element.tagName) return;
      if (seen.has(element)) return;
      seen.add(element);
      candidates.push(element);
    };

    const rootText = getElementText(node);
    if ((node.matches?.(AUTH_MESSAGE_SELECTOR) || (rootText && rootText.length <= 250)) && isElementVisible(node)) {
      pushCandidate(node);
    }

    if (node.querySelectorAll) {
      Array.from(node.querySelectorAll(AUTH_MESSAGE_SELECTOR))
        .slice(0, 30)
        .forEach((element) => pushCandidate(element));

      const isAuthScope =
        Boolean(inferAuthActionFromElement(node)) ||
        hasInput(node, 'input[type="password"], input[name*="password" i], input[id*="password" i]');

      if (isAuthScope) {
        Array.from(node.querySelectorAll("p, span, div, small, li"))
          .slice(0, 40)
          .forEach((element) => {
            const text = getElementText(element);
            if (text && text.length <= 180) {
              pushCandidate(element);
            }
          });
      }
    }

    candidates.forEach((element) => {
      const match = detectAuthDomFailure(element);
      if (!match) return;

      trackAuthFailure(match.action, {
        source: "auth_dom",
        message: match.message,
        extra: {
          observedBy: source,
          element: match.selector,
        },
      });
    });
  };

  const scheduleDomScan = (node, source = "dom_observer") => {
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    if (!element) return;

    pendingDomScanMap.set(element, source);
    if (domScanTimer) return;

    domScanTimer = window.setTimeout(() => {
      const entries = Array.from(pendingDomScanMap.entries());
      pendingDomScanMap.clear();
      domScanTimer = null;
      entries.forEach(([queuedElement, queuedSource]) => {
        scanNodeForAuthMessages(queuedElement, queuedSource);
      });
    }, 120);
  };

  const handlePageView = () => {
    const nextPath = window.location.pathname + window.location.search + window.location.hash;
    if (nextPath !== currentPath) {
      currentPath = nextPath;
      trackPageView("spa_navigation");
      scheduleDomScan(document.body, "route_change");
    }
  };

  const setupAuthDomObserver = () => {
    if (typeof MutationObserver === "undefined" || !document.documentElement) return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "characterData") {
          scheduleDomScan(mutation.target?.parentElement, "character_data");
          return;
        }

        mutation.addedNodes.forEach((addedNode) => {
          scheduleDomScan(addedNode, "added_node");
        });

        if (mutation.target) {
          scheduleDomScan(mutation.target, "mutation_target");
        }
      });
    });

    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
    });

    scheduleDomScan(document.body || document.documentElement, "initial_scan");
  };

  window[INSTANCE_KEY] = {
    reconfigure,
    getConfig: () => ({ ...config }),
  };

  window.quantumTracker = {
    track: trackEvent,
    trackError: (errorLike, extra = {}) => {
      const isNativeError = errorLike instanceof Error;
      trackCapturedError(extra.kind || "manual", {
        message: isNativeError ? errorLike.message : safeSerialize(errorLike) || "Manual error",
        stack: isNativeError ? errorLike.stack : null,
        reason: !isNativeError ? safeSerialize(errorLike) : null,
        source: "manual_report",
        action: extra.action || null,
        authRelated: extra.authRelated === true,
        extra,
      });
    },
  };

  const originalPushState = history.pushState;
  history.pushState = function () {
    originalPushState.apply(this, arguments);
    handlePageView();
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function () {
    originalReplaceState.apply(this, arguments);
    handlePageView();
  };

  window.addEventListener("popstate", handlePageView);
  window.addEventListener("hashchange", handlePageView);

  if (document.readyState === "complete" || document.readyState === "interactive") {
    trackInitialPageView("initial_load");
    scheduleDomScan(document.body || document.documentElement, "document_ready");
  } else {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        trackInitialPageView("initial_load");
        scheduleDomScan(document.body || document.documentElement, "dom_content_loaded");
      },
      { once: true },
    );
  }

  window.addEventListener("pageshow", () => {
    trackInitialPageView("pageshow");
    scheduleDomScan(document.body || document.documentElement, "pageshow");
  });

  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;

      const action = inferAuthActionFromForm(form);
      if (!action) return;

      trackAuthAttempt(action, {
        source: "auth_form",
        method: String(form.method || "GET").toUpperCase(),
        requestUrl: normalizeRequestUrl(form.action) || window.location.href,
      });
    },
    true,
  );

  document.addEventListener(
    "click",
    (event) => {
      if (event.isTrusted === false || event.detail === 0) return;

      const target = event.target.closest("button, a, [data-track]");
      if (!target) return;

      const text = trimText(target.innerText || target.title || target.name || "icon", 60);
      const action = target.getAttribute("data-track") || "click";

      trackEvent(action, {
        tag: target.tagName,
        text,
        href: target.href || null,
      });
    },
    true,
  );

  if (typeof window.fetch === "function") {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async function quantumTrackedFetch(input, init = {}) {
      const requestUrl = normalizeRequestUrl(typeof input === "string" || input instanceof URL ? input : input?.url);

      if (isTrackerRequest(requestUrl)) {
        return originalFetch(input, init);
      }

      const method = String(init?.method || input?.method || "GET").toUpperCase();
      const action = inferAuthAction({
        url: requestUrl,
        body: init?.body || input?.body,
        method,
      });

      if (!action) {
        return originalFetch(input, init);
      }

      trackAuthAttempt(action, {
        source: "auth_request",
        method,
        requestUrl,
      });

      try {
        const response = await originalFetch(input, init);
        let responseSnippet = null;
        let contentType = "";

        try {
          responseSnippet = await response.clone().text();
          contentType = response.headers?.get("content-type") || "";
        } catch (error) {
          responseSnippet = null;
        }

        const analysis = analyzeAuthResponse({
          action,
          status: response.status,
          text: responseSnippet,
          contentType,
        });

        if (analysis.isFailure) {
          trackAuthFailure(action, {
            source: "auth_request",
            method,
            requestUrl,
            status: response.status,
            message: analysis.message,
            responseSnippet: analysis.responseSnippet,
          });
        }

        return response;
      } catch (error) {
        trackAuthFailure(action, {
          source: "auth_request",
          method,
          requestUrl,
          message: error?.message || `Auth ${action} network error`,
          reason: safeSerialize(error),
        });
        throw error;
      }
    };
  }

  if (typeof XMLHttpRequest !== "undefined") {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function patchedOpen(method, url) {
      this.__qsRequestMeta = {
        method: String(method || "GET").toUpperCase(),
        requestUrl: normalizeRequestUrl(url),
      };
      return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function patchedSend(body) {
      const meta = this.__qsRequestMeta || {};
      const action = inferAuthAction({
        url: meta.requestUrl,
        body,
        method: meta.method,
      });

      if (!action || isTrackerRequest(meta.requestUrl)) {
        return originalSend.apply(this, arguments);
      }

      trackAuthAttempt(action, {
        source: "auth_xhr",
        method: meta.method,
        requestUrl: meta.requestUrl,
      });

      this.addEventListener("load", () => {
        const contentType = this.getResponseHeader("content-type") || "";
        const analysis = analyzeAuthResponse({
          action,
          status: this.status,
          text: typeof this.responseText === "string" ? this.responseText : null,
          contentType,
        });

        if (analysis.isFailure) {
          trackAuthFailure(action, {
            source: "auth_xhr",
            method: meta.method,
            requestUrl: meta.requestUrl,
            status: this.status,
            responseSnippet: analysis.responseSnippet,
            message: analysis.message,
          });
        }
      });

      this.addEventListener("error", () => {
        trackAuthFailure(action, {
          source: "auth_xhr",
          method: meta.method,
          requestUrl: meta.requestUrl,
          message: `Auth ${action} request failed`,
        });
      });

      return originalSend.apply(this, arguments);
    };
  }

  window.addEventListener(
    "error",
    (event) => {
      const target = event.target;

      if (target && target !== window) {
        trackCapturedError("resource", {
          message: `${target.tagName || "RESOURCE"} failed to load`,
          resourceUrl: target.currentSrc || target.src || target.href || null,
          tagName: target.tagName || null,
          source: "resource_error",
        });
        return;
      }

      trackCapturedError("runtime", {
        message: event.message || event.error?.message || "Uncaught runtime error",
        stack: event.error?.stack || null,
        file: event.filename || null,
        line: typeof event.lineno === "number" ? event.lineno : null,
        column: typeof event.colno === "number" ? event.colno : null,
        source: "window_error",
      });
    },
    true,
  );

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const isNativeError = reason instanceof Error;

    trackCapturedError("promise", {
      message: isNativeError ? reason.message : safeSerialize(reason) || "Unhandled promise rejection",
      stack: isNativeError ? reason.stack : null,
      reason: !isNativeError ? safeSerialize(reason) : null,
      source: "unhandled_rejection",
    });
  });

  setupAuthDomObserver();

  const HEARTBEAT_INTERVAL_MS = 15000;
  const sendHeartbeat = () => {
    if (document.visibilityState !== "visible") return;
    trackEvent("heartbeat", { source: "presence_ping" });
  };

  setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      sendHeartbeat();
    }
  });
})();
