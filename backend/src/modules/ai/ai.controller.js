const prisma = require("../../lib/prisma");
const { getPrimaryAdminEmail } = require("../../lib/admin");
const {
  DEFAULT_AI_PROVIDER,
  LOCAL_AI_MODEL,
  LOCAL_AI_PROVIDER,
  buildSharedAiSettingsFromEnv,
  buildLocalAnalyticsReply,
  encryptSecret,
  getValidatedProviderKey,
  getNormalizedAiSettings,
  requestAiCompletion,
  serializeAiSettings,
  trimString,
} = require("./ai.service");

const AI_USER_SELECT = {
  id: true,
  email: true,
  aiEnabled: true,
  aiProvider: true,
  aiBaseUrl: true,
  aiModel: true,
  aiApiKeyCiphertext: true,
  aiSystemPrompt: true,
};

function getAuthenticatedUserId(req) {
  return Number(req?.user?.userId || req?.user?.id || 0);
}

async function getAiUser(userId) {
  if (!Number.isFinite(userId) || userId <= 0) return null;

  return prisma.user.findUnique({
    where: { id: userId },
    select: AI_USER_SELECT,
  });
}

async function getAdminAiUser() {
  return prisma.user.findUnique({
    where: { email: getPrimaryAdminEmail() },
    select: AI_USER_SELECT,
  });
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function toRuntimePayload(settings, source) {
  if (source === "local_builtin") {
    return {
      available: true,
      source,
      shared: true,
      provider: LOCAL_AI_PROVIDER,
      baseUrl: null,
      model: LOCAL_AI_MODEL,
      requiresExternalAuth: false,
    };
  }

  const serialized = serializeAiSettings(settings);
  return {
    available: true,
    source,
    shared: source === "admin_shared" || source === "env_shared",
    provider: serialized.provider,
    baseUrl: serialized.baseUrl,
    model: serialized.model,
    requiresExternalAuth: false,
  };
}

async function resolveRuntimeAi(user) {
  const envShared = buildSharedAiSettingsFromEnv();
  if (envShared) {
    try {
      getValidatedProviderKey(envShared);
      return { settings: envShared, source: "env_shared" };
    } catch {
      // Ignore broken env settings if present.
    }
  }

  const admin = await getAdminAiUser();
  if (admin && admin.id !== user.id) {
    const adminSettings = serializeAiSettings(admin);
    if (adminSettings.enabled && adminSettings.hasApiKey) {
      try {
        getValidatedProviderKey(admin);
        return { settings: admin, source: "admin_shared" };
      } catch {
        // Ignore broken admin settings and report runtime unavailable.
      }
    }
  }

  const ownSettings = serializeAiSettings(user);
  if (ownSettings.enabled && ownSettings.hasApiKey) {
    try {
      getValidatedProviderKey(user);
      return { settings: user, source: "user" };
    } catch {
      // Ignore broken personal settings and continue to the built-in fallback.
    }
  }

  return {
    settings: null,
    source: "local_builtin",
  };
}

function buildAiUpdateInput(existingUser, body = {}) {
  const apiKeyProvided = hasOwn(body, "apiKey");
  const rawApiKey = apiKeyProvided ? body.apiKey : undefined;
  if (apiKeyProvided) {
    getValidatedProviderKey(
      {
        aiBaseUrl: hasOwn(body, "baseUrl") ? body.baseUrl : existingUser.aiBaseUrl,
        providerApiKey: rawApiKey,
      }
    );
  }
  const nextCiphertext = apiKeyProvided
    ? (trimString(rawApiKey) ? encryptSecret(rawApiKey) : null)
    : existingUser.aiApiKeyCiphertext;

  const normalized = getNormalizedAiSettings({
    aiEnabled: hasOwn(body, "enabled") ? body.enabled : existingUser.aiEnabled,
    aiProvider: hasOwn(body, "provider") ? body.provider : existingUser.aiProvider,
    aiBaseUrl: hasOwn(body, "baseUrl") ? body.baseUrl : existingUser.aiBaseUrl,
    aiModel: hasOwn(body, "model") ? body.model : existingUser.aiModel,
    aiSystemPrompt: hasOwn(body, "systemPrompt") ? body.systemPrompt : existingUser.aiSystemPrompt,
    aiApiKeyCiphertext: nextCiphertext,
  });

  if (normalized.enabled && !nextCiphertext) {
    throw new Error("Please add an AI API key before enabling the assistant");
  }

  return {
    aiEnabled: normalized.enabled,
    aiProvider: trimString(normalized.provider) || DEFAULT_AI_PROVIDER,
    aiBaseUrl: normalized.baseUrl,
    aiModel: normalized.model,
    aiApiKeyCiphertext: nextCiphertext,
    aiSystemPrompt: trimString(
      hasOwn(body, "systemPrompt") ? body.systemPrompt : existingUser.aiSystemPrompt
    ) || normalized.systemPrompt,
  };
}

async function getSettings(req, res) {
  try {
    const userId = getAuthenticatedUserId(req);
    const user = await getAiUser(userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const runtime = await resolveRuntimeAi(user);

    return res.json({
      settings: serializeAiSettings(user),
      runtime: toRuntimePayload(runtime.settings, runtime.source),
    });
  } catch (error) {
    console.error("AI settings load error:", error);
    return res.status(500).json({ error: "Failed to load AI settings" });
  }
}

async function updateSettings(req, res) {
  try {
    const userId = getAuthenticatedUserId(req);
    const user = await getAiUser(userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const nextData = buildAiUpdateInput(user, req.body || {});
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: nextData,
      select: AI_USER_SELECT,
    });
    const runtime = await resolveRuntimeAi(updatedUser);

    return res.json({
      message: "AI settings saved successfully",
      settings: serializeAiSettings(updatedUser),
      runtime: toRuntimePayload(runtime.settings, runtime.source),
    });
  } catch (error) {
    console.error("AI settings update error:", error);
    return res.status(400).json({ error: error.message || "Failed to save AI settings" });
  }
}

async function chat(req, res) {
  try {
    const userId = getAuthenticatedUserId(req);
    const user = await getAiUser(userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const runtime = await resolveRuntimeAi(user);
    if (runtime.source === "local_builtin") {
      const completion = buildLocalAnalyticsReply({
        messages: req.body?.messages,
        context: req.body?.context,
      });

      return res.json({
        message: {
          role: "assistant",
          content: completion.content,
        },
        meta: {
          provider: completion.provider,
          model: completion.model,
          source: runtime.source,
        },
      });
    }

    let completion;
    let source = runtime.source;

    try {
      completion = await requestAiCompletion(runtime.settings, {
        messages: req.body?.messages,
        context: req.body?.context,
      });
    } catch (providerError) {
      console.error("AI provider request failed, using built-in fallback:", providerError);
      completion = buildLocalAnalyticsReply({
        messages: req.body?.messages,
        context: req.body?.context,
      });
      source = "local_builtin_fallback";
    }

    return res.json({
      message: {
        role: "assistant",
        content: completion.content,
      },
      meta: {
        provider: completion.provider,
        model: completion.model,
        source,
      },
    });
  } catch (error) {
    console.error("AI chat error:", error);
    return res.status(400).json({ error: error.message || "Failed to generate AI response" });
  }
}

module.exports = {
  getSettings,
  updateSettings,
  chat,
};
