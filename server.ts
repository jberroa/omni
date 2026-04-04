import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // Email Configuration
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  // API Route for Email Notifications
  app.post("/api/notify", async (req, res) => {
    const { type, itemName, currentStock, threshold, recipientEmail } = req.body;

    if (!recipientEmail) {
      return res.status(400).json({ error: "Recipient email is required" });
    }

    let subject = "";
    let html = "";

    if (type === "low_stock") {
      subject = `Low Stock Alert: ${itemName}`;
      html = `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #f59e0b;">⚠️ Low Stock Alert</h2>
          <p>The following item has reached its low stock threshold:</p>
          <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Item:</strong> ${itemName}</p>
            <p><strong>Current Stock:</strong> ${currentStock}</p>
            <p><strong>Threshold:</strong> ${threshold}</p>
          </div>
          <p>Please consider restocking this item soon to avoid stockouts.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 12px; color: #6b7280;">This is an automated notification from OmniStock Inventory Control.</p>
        </div>
      `;
    } else if (type === "critical_warning") {
      subject = `CRITICAL Inventory Warning: ${itemName}`;
      html = `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px; border-left: 5px solid #ef4444;">
          <h2 style="color: #ef4444;">🚨 CRITICAL Warning</h2>
          <p>An urgent inventory issue has been detected for:</p>
          <div style="background: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Item:</strong> ${itemName}</p>
            <p><strong>Current Stock:</strong> ${currentStock}</p>
            <p style="color: #ef4444; font-weight: bold;">Immediate action required!</p>
          </div>
          <p>This item is critically low or out of stock.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 12px; color: #6b7280;">This is an automated notification from OmniStock Inventory Control.</p>
        </div>
      `;
    } else {
      return res.status(400).json({ error: "Invalid alert type" });
    }

    try {
      await transporter.sendMail({
        from: `"OmniStock Alerts" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
        to: recipientEmail,
        subject: subject,
        html: html,
      });
      res.json({ success: true, message: "Email sent successfully" });
    } catch (error) {
      console.error("Failed to send email:", error);
      res.status(500).json({ error: "Failed to send email notification" });
    }
  });

  // Vite middleware for development
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
