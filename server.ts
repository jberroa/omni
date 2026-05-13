import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import { initDb } from "./server/db";
import { createMailTransport, sendInventoryAlertEmail } from "./server/mail";
import { registerInventoryRoutes } from "./server/inventoryRoutes";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: "2mb" }));

  const db = initDb();
  const transporter = createMailTransport();

  registerInventoryRoutes(app, db, transporter);

  app.post("/api/notify", async (req, res) => {
    const { type, itemName, currentStock, threshold, recipientEmail } = req.body;

    if (!recipientEmail) {
      return res.status(400).json({ error: "Recipient email is required" });
    }

    if (type !== "low_stock" && type !== "critical_warning") {
      return res.status(400).json({ error: "Invalid alert type" });
    }

    try {
      const mailType =
        type === "critical_warning" ? "critical_warning" : "low_stock";
      await sendInventoryAlertEmail(
        transporter,
        recipientEmail,
        mailType,
        itemName,
        currentStock,
        threshold
      );
      res.json({ success: true, message: "Email sent successfully" });
    } catch (error) {
      console.error("Failed to send email:", error);
      res.status(500).json({ error: "Failed to send email notification" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
