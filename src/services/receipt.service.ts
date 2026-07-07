import PDFDocument from 'pdfkit';
import { Response } from 'express';

interface ReceiptData {
  transactionId: string;
  merchantTxRef: string;
  type: string;
  amount: number;
  status: string | null;
  narration: string | null;
  createdAt: Date | null;
  recipientName?: string | null;
  recipientBank?: string | null;
  recipientAcct?: string | null;
  senderName: string;
}

function formatType(type: string): string {
  const map: Record<string, string> = {
    milestone_payout: 'Milestone Payout',
    marketplace_payment: 'Marketplace Payment',
    inbound: 'Inbound Payment',
    bank_transfer: 'Bank Transfer',
    withdrawal: 'Withdrawal',
  };
  return map[type] || type;
}

export function generateReceiptPdf(data: ReceiptData, res: Response): void {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="BuildSpora-Receipt-${data.merchantTxRef}.pdf"`
  );

  doc.pipe(res);

  const status = data.status ?? 'pending';
  const createdAt = data.createdAt ?? new Date();

  // Header
  doc
    .fontSize(22)
    .fillColor('#16A34A')
    .text('BuildSpora', { align: 'left' });

  doc
    .fontSize(10)
    .fillColor('#6B7280')
    .text('Transaction Receipt', { align: 'left' });

  doc.moveDown(1.5);
  doc
    .strokeColor('#E5E7EB')
    .lineWidth(1)
    .moveTo(50, doc.y)
    .lineTo(545, doc.y)
    .stroke();
  doc.moveDown(1);

  // Status badge
  const statusColor = status === 'success' ? '#16A34A' : status === 'pending' ? '#D97706' : '#DC2626';
  doc
    .fontSize(14)
    .fillColor(statusColor)
    .text(status.toUpperCase(), { align: 'right' });

  doc.moveDown(0.5);

  // Amount — the focal point
  doc
    .fontSize(28)
    .fillColor('#111827')
    .text(`NGN ${data.amount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`, {
      align: 'left',
    });

  doc.moveDown(1);

  // Details table
  const rows: [string, string][] = [
    ['Transaction Type', formatType(data.type)],
    ['Reference', data.merchantTxRef],
    ['Date', createdAt.toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })],
    ['From', data.senderName],
  ];

  if (data.recipientName) rows.push(['Recipient', data.recipientName]);
  if (data.recipientBank) rows.push(['Bank', data.recipientBank]);
  if (data.recipientAcct) rows.push(['Account Number', data.recipientAcct]);
  if (data.narration) rows.push(['Narration', data.narration]);

  rows.forEach(([label, value]) => {
    doc
      .fontSize(10)
      .fillColor('#6B7280')
      .text(label, 50, doc.y, { continued: false });
    doc
      .fontSize(11)
      .fillColor('#111827')
      .text(value, 200, doc.y - 14, { align: 'left' });
    doc.moveDown(0.6);
  });

  doc.moveDown(1.5);
  doc
    .strokeColor('#E5E7EB')
    .lineWidth(1)
    .moveTo(50, doc.y)
    .lineTo(545, doc.y)
    .stroke();
  doc.moveDown(1);

  doc
    .fontSize(9)
    .fillColor('#9CA3AF')
    .text(
      'This is a computer-generated receipt from BuildSpora. For questions about this transaction, contact support.',
      { align: 'left' }
    );

  doc.end();
}