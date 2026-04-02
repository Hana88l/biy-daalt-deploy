const express = require('express');
const router = express.Router();

const { requireAuth } = require('../../middleware/auth.middleware');
const analyticsController = require('./analytics.controller');

router.post('/track', analyticsController.collectEvent);

router.get('/site', requireAuth, analyticsController.getConnectedSite);
router.post('/site/connect', requireAuth, analyticsController.connectSiteByUrl);
router.post('/sites/:siteId/activate', requireAuth, analyticsController.activateConnectedSite);
router.post('/sites/:siteId/deactivate', requireAuth, analyticsController.deactivateConnectedSite);
router.post('/sites/:siteId/analyze', requireAuth, analyticsController.analyzeConnectedSiteById);
router.delete('/sites/:siteId', requireAuth, analyticsController.deleteConnectedSite);

router.get('/kpis', requireAuth, analyticsController.getKpis);
router.get('/realtime-summary', requireAuth, analyticsController.getRealtimeSummary);
router.get('/visitors', requireAuth, analyticsController.getVisitors);
router.get('/hourly', requireAuth, analyticsController.getHourly);
router.get('/funnel', requireAuth, analyticsController.getFunnel);
router.get('/pages', requireAuth, analyticsController.getTopPages);
router.get('/devices', requireAuth, analyticsController.getDevices);
router.get('/countries', requireAuth, analyticsController.getCountries);
router.get('/events', requireAuth, analyticsController.getEvents);
router.get('/export', requireAuth, analyticsController.exportDashboard);
router.get('/users', requireAuth, analyticsController.getAllUsers);

module.exports = router;
