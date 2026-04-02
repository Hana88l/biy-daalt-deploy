const express = require("express");
const { requireAuth } = require("../../middleware/auth.middleware");
const aiController = require("./ai.controller");

const router = express.Router();

router.get("/settings", requireAuth, aiController.getSettings);
router.put("/settings", requireAuth, aiController.updateSettings);
router.post("/chat", requireAuth, aiController.chat);

module.exports = router;
