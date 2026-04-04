/**
 * Service to handle email notifications for inventory alerts.
 */

export type AlertType = 'low_stock' | 'critical_warning';

interface NotifyParams {
  type: AlertType;
  itemName: string;
  currentStock: number;
  threshold: number;
  recipientEmail?: string;
}

export async function sendInventoryAlert({
  type,
  itemName,
  currentStock,
  threshold,
  recipientEmail
}: NotifyParams) {
  try {
    const response = await fetch('/api/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type,
        itemName,
        currentStock,
        threshold,
        recipientEmail: recipientEmail || (import.meta as any).env.VITE_RECIPIENT_EMAIL || 'admin@example.com',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to send notification');
    }

    return await response.json();
  } catch (error) {
    console.error('Notification service error:', error);
    // Don't throw to avoid breaking the main UI flow, but log it
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
