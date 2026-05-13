import nodemailer from "nodemailer";

export function createMailTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export type AlertMailType = "low_stock" | "critical_warning";

function renderAlertHtml(
  type: AlertMailType,
  itemName: string,
  currentStock: number,
  threshold: number
) {
  if (type === "low_stock") {
    return `
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
  }
  return `
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
}

export async function sendInventoryAlertEmail(
  transporter: nodemailer.Transporter,
  to: string,
  type: AlertMailType,
  itemName: string,
  currentStock: number,
  threshold: number
) {
  const subject =
    type === "low_stock"
      ? `Low Stock Alert: ${itemName}`
      : `CRITICAL Inventory Warning: ${itemName}`;
  const html = renderAlertHtml(type, itemName, currentStock, threshold);
  await transporter.sendMail({
    from: `"OmniStock Alerts" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  });
}
