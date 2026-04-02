const { subClient } = require('../../lib/redisPubSub');
const { isAdminEmail } = require('../../lib/admin');

// Идэвхтэй SSE холболтуудын бүртгэл: ownerId (String) -> Set of Response objects
const activeClients = new Map();
const adminClients = new Set();
const SSE_HEARTBEAT_MS = Number(process.env.SSE_HEARTBEAT_MS || 15000);

/**
 * Redis Pub/Sub-аас ирж буй мэдээллийг сонсож, холбогдох SSE хэрэглэгчдэд дамжуулна.
 * Энэ функцийг server.js эсвэл index.js дээр нэг удаа дуудаж идэвхжүүлнэ.
 */
function initRealtimeSub() {
  // 'live_events' сувгийг сонсож эхлэх
  subClient.subscribe('live_events', (message) => {
    try {
      const data = JSON.parse(message);
      
      // ЧУХАЛ: ownerId-г String болгож хөрвүүлснээр Map-аас олоход найдвартай болно
      const ownerId = String(data.ownerId); 
      
      const clients = activeClients.get(ownerId);
      const payload = `data: ${JSON.stringify({ 
        type: 'NEW_EVENT', 
        payload: data.event 
      })}\n\n`;
      
      // Хэрэв тухайн хэрэглэгч Dashboard дээрээ идэвхтэй холболттой байвал:
      if (clients && clients.size > 0) {
        clients.forEach((res) => {
          try {
            // Мэдээллийг шууд браузер руу түлхэх
            res.write(payload);
          } catch (e) {
            console.error('Error writing to client response:', e);
          }
        });
      }

      // Admin dashboard-д бүх мэдээллийг дамжуулна
      if (adminClients.size > 0) {
        adminClients.forEach((res) => {
          try {
            res.write(payload);
          } catch (e) {
            console.error('Error writing to admin client response:', e);
          }
        });
      }
    } catch (err) {
      console.error('Failed to handle live event broadcast:', err);
    }
  });

  console.log("Real-time Subscription initialized on channel: live_events");
}

/**
 * Dashboard-аас ирсэн SSE холболтыг хүлээн авч, идэвхтэй холболтын жагсаалтад нэмнэ.
 */
async function streamLive(req, res) {
  try {
    // JWT-ээс ирж буй userId-г String болгож авах
    const ownerId = String(req.user.userId);
    const isAdmin = isAdminEmail(req.user.email);

    // SSE-д зориулсан Header-үүд тохируулах
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    if (isAdmin) {
      adminClients.add(res);
    } else {
      // Хэрэв энэ хэрэглэгч анх удаа холбогдож байвал Map-д шинэ Set үүсгэх
      if (!activeClients.has(ownerId)) {
        activeClients.set(ownerId, new Set());
      }
      
      // Идэвхтэй холболтын жагсаалтад энэ 'res' объектыг нэмэх
      activeClients.get(ownerId).add(res);
    }

    // Холболт амжилттай болсныг Frontend-д мэдэгдэх
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', message: 'Stream ready' })}\n\n`);

    const heartbeat = setInterval(() => {
      try {
        res.write(`event: heartbeat\ndata: ${JSON.stringify({ ok: true })}\n\n`);
      } catch (error) {
        clearInterval(heartbeat);
      }
    }, SSE_HEARTBEAT_MS);

    // Хэрэв хэрэглэгч Dashboard-ыг хаавал эсвэл холболт тасарвал:
    req.on('close', () => {
      clearInterval(heartbeat);
      if (isAdmin) {
        adminClients.delete(res);
      } else {
        const clients = activeClients.get(ownerId);
        if (clients) {
          clients.delete(res);
          // Хэрэв өөр идэвхтэй Tab байхгүй бол Map-аас устгах
          if (clients.size === 0) {
            activeClients.delete(ownerId);
          }
        }
      }
      res.end();
    });

  } catch (error) {
    console.error('Stream setup error:', error);
    res.status(500).end();
  }
}

module.exports = {
  streamLive,
  initRealtimeSub
};
