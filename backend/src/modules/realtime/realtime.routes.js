const express = require('express');
const { streamLive } = require('./realtime.controller');
const { requireAuth } = require('../../middleware/auth.middleware');

const router = express.Router();

router.get('/stream', requireAuth, streamLive);

module.exports = router;
