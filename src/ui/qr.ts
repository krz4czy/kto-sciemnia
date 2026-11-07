import QRCode from 'qrcode';

export function drawQr(canvas: HTMLCanvasElement, value: string): void {
  void QRCode.toCanvas(canvas, value, {
    margin: 1,
    width: 280,
    errorCorrectionLevel: 'M',
    color: { dark: '#2a1020', light: '#fff7fb' },
  });
}
