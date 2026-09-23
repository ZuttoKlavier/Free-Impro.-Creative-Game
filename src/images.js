export const toDataURL = blob => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('图片读取失败。')); reader.readAsDataURL(blob); });
export function canvasBlob(canvas) { return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片保存失败。')), 'image/png')); }
export async function imageFromDataURL(value) {
  if (typeof value !== 'string' || value.length > 470000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('备份中的图片无效。');
  const bytes = Uint8Array.from(atob(value.split(',')[1]), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: 'image/png' }); const bitmap = await createImageBitmap(blob);
  const valid = bitmap.width <= 512 && bitmap.height <= 512; bitmap.close();
  if (!valid) throw new Error('备份中的图片尺寸过大。'); return blob;
}
export async function normalizeGeneratedImage(value) {
  if (typeof value !== 'string' || value.length > 18000000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('生成图片无效，请重试。');
  const bytes = Uint8Array.from(atob(value.split(',')[1]), c => c.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, 256, 256); bitmap.close(); return canvasBlob(canvas);
}
