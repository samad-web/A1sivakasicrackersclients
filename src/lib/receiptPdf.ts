/**
 * Receipt PDF generation and hosting — the job n8n used to do, now entirely ours.
 *
 * The layout is fixed-position HTML with base64-embedded fonts and logo, so it is rendered
 * offscreen in an iframe, rasterised, and placed on a single A4 page. Rasterising (rather
 * than laying the receipt out again in a PDF library) is what keeps it pixel-identical to
 * the receipts customers already receive.
 *
 * Everything here is loaded on demand: html2canvas + jsPDF + the 76KB template add up to a
 * chunk nobody should pay for on first paint, and receipts are only ever made when an admin
 * verifies a payment.
 */
import { supabase } from '@/integrations/supabase/client';
import type { ReceiptData } from './receiptTemplate';

/** A4 at 96dpi. The template is authored at these proportions. */
const A4_PX = { width: 794, height: 1123 };
const BUCKET = 'receipts';

/** Render the receipt to a single-page A4 PDF. Browser-only — needs a DOM. */
export async function generateReceiptPdf(data: Partial<ReceiptData>): Promise<Blob> {
    const [{ default: html2canvas }, { jsPDF }, { renderReceiptHtml }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
        import('./receiptTemplate'),
    ]);

    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    Object.assign(frame.style, {
        position: 'fixed', left: '-10000px', top: '0', border: '0',
        width: `${A4_PX.width}px`, height: `${A4_PX.height}px`,
    });
    document.body.appendChild(frame);

    try {
        const doc = frame.contentDocument;
        if (!doc) throw new Error('could not open an offscreen document');
        doc.open();
        doc.write(renderReceiptHtml(data));
        doc.close();

        // The @font-face rules are base64 data URIs, so this resolves without network access
        // — but rasterising before it settles would fall back to a default face.
        await doc.fonts?.ready;
        // The template's inline fit-to-page pass also runs on fonts.ready; give it a frame to
        // apply its transforms, or a long address gets captured mid-overflow.
        await new Promise((r) => requestAnimationFrame(() => r(null)));

        const target = doc.getElementById('page_0') ?? doc.body;
        const canvas = await html2canvas(target as HTMLElement, {
            scale: 2,                    // 2x so text stays crisp when printed
            backgroundColor: '#ffffff',
            width: A4_PX.width,
            height: A4_PX.height,
            windowWidth: A4_PX.width,
            windowHeight: A4_PX.height,
            logging: false,
            // Render via SVG foreignObject so the browser lays the text out itself.
            // html2canvas's default path re-implements text layout and inserts visible gaps
            // between runs — "a1sivakasicrackers  .com" on the first receipts we shipped.
            foreignObjectRendering: true,
        });

        const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
        pdf.addImage(
            canvas.toDataURL('image/jpeg', 0.92), 'JPEG',
            0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight(),
        );
        return pdf.output('blob');
    } finally {
        frame.remove();
    }
}

/**
 * Upload the receipt and return its public URL. The path is deterministic per order+month,
 * so re-verifying a payment replaces that month's receipt instead of littering the bucket —
 * and the URL already in orders.invoice_url stays valid.
 */
export async function uploadReceipt(
    orderId: string, monthNames: string[], pdf: Blob,
): Promise<string> {
    const month = (monthNames[0] ?? 'receipt').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const suffix = monthNames.length > 1 ? `-plus${monthNames.length - 1}` : '';
    const path = `${orderId}/${month}${suffix}.pdf`;

    const { error } = await supabase.storage.from(BUCKET).upload(path, pdf, {
        contentType: 'application/pdf',
        upsert: true,
    });
    if (error) throw new Error(`receipt upload failed: ${error.message}`);

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) throw new Error('receipt uploaded but no public URL was returned');
    return data.publicUrl;
}
