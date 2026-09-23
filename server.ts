import express from 'express';
import { randomUUID } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createServer } from "vite";

const execAsync = promisify(exec);

async function startServer() {
  const app = express();
  app.use(express.json());

  const sessions = new Map();

  // --- GATEWAY ROUTES ---
  app.post("/session", async (req, res) => {
    console.log("POST /session received");
    const id = randomUUID();
    sessions.set(id, { status: "BOOTING" });

    // Simulated Android VM startup
    setTimeout(() => {
        if (sessions.has(id)) {
            sessions.get(id).status = "READY";
            console.log(`Session ${id} READY`);
        }
    }, 5000);

    res.json({ id, status: "BOOTING" });
  });

  app.get("/session/:id", (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) {
        return res.status(404).json({ error: "Session not found" });
    }
    res.json(session);
  });

  app.delete("/session/:id", async (req, res) => {
    if (sessions.has(req.params.id)) {
        sessions.delete(req.params.id);
        res.json({ status: "DELETED" });
    } else {
        res.status(404).json({ error: "Session not found" });
    }
  });

  // --- REAL OS RUNTIME API ---
  app.get("/os/state", async (req, res) => {
    console.log("GET /os/state received");
    res.setHeader("Content-Type", "application/json");
    res.json({
        files: [
            { id: 'f1', name: 'project.code', type: 'FILE' },
            { id: 'f2', name: 'image.png', type: 'FILE' }
        ],
        processes: [
            { id: 'p1', name: 'browser', type: 'PROCESS', cpu: 15 },
            { id: 'p2', name: 'music', type: 'PROCESS', cpu: 2 }
        ]
    });
  });

  app.post("/os/action", async (req, res) => {
      const { action, targetId } = req.body;
      console.log(`OS Action: ${action} on ${targetId}`);
      // Integrate with ADB/VM command execution
      res.json({ status: "SUCCESS" });
  });

  // Serve Vite in dev mode
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);

  app.listen(3000, () => {
    console.log("Cloud Gateway (NanoAndroid) listening on port 3000");
  });
}

startServer();
