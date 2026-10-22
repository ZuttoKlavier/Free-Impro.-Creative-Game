// Plain, versioned metadata only. The prop photograph remains a separate Blob.
export const OBJECT_PROP_SCHEMA_VERSION = 1;
export const OBJECT_PROP_STYLE_VERSION = 'anime-front-v1';
export const MAX_PROP_PHOTO_DATA_URL_LENGTH = 4 * 1024 * 1024;
export const MAX_PROP_PHOTO_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_EDGE = 1280;
const JPEG_PREFIX = 'data:image/jpeg;base64,';
const PROP_IDS = Object.freeze({
  cup: 'cup', apple: 'apple', banana: 'banana', orange: 'orange', carrot: 'carrot', book: 'book',
  'cell phone': 'cell-phone', bowl: 'bowl', scissors: 'scissors', spoon: 'spoon',
  toothbrush: 'toothbrush', 'sports ball': 'sports-ball',
});
const invalid = detail => new Error(`角色物品数据无效：${detail}`);
const isRecord = value => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
// Never import inherited properties or invoke accessors supplied by a caller.
function own(record, key) {
  if (record === null || typeof record !== 'object') return undefined;
  const field = Object.getOwnPropertyDescriptor(record, key);
  return field && Object.hasOwn(field, 'value') ? field.value : undefined;
}
function dimension(value) { return Number.isSafeInteger(value) && value > 0 && value <= MAX_IMAGE_EDGE; }
function boxWithinImage(value, width, height) {
  if (value === null) return null;
  if (!isRecord(value)) throw invalid('识别框格式错误');
  const x = own(value, 'originX'), y = own(value, 'originY');
  const w = own(value, 'width'), h = own(value, 'height');
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0
    || w > width * 2 || h > height * 2 || x < -width || y < -height) throw invalid('识别框范围错误');
  const left = Math.max(0, x), top = Math.max(0, y);
  const right = Math.min(width, x + w), bottom = Math.min(height, y + h);
  if (right <= left || bottom <= top) throw invalid('识别框不在照片内');
  return { originX: left, originY: top, width: right - left, height: bottom - top };
}

/** Returns a new safe record; unknown fields, URLs, callbacks and Blobs are omitted. */
export function validateObjectProp(value) {
  if (!isRecord(value)) throw invalid('元数据必须是普通对象');
  const schemaVersion = own(value, 'schemaVersion'), styleVersion = own(value, 'styleVersion');
  const id = own(value, 'id'), category = own(value, 'category');
  const score = own(value, 'score'), confirmedBy = own(value, 'confirmedBy'), source = own(value, 'source');
  const captureRevision = own(value, 'captureRevision'), capturedAt = own(value, 'capturedAt');
  const width = own(value, 'width'), height = own(value, 'height'), ownerId = own(value, 'ownerId');
  if (schemaVersion !== OBJECT_PROP_SCHEMA_VERSION || styleVersion !== OBJECT_PROP_STYLE_VERSION) throw invalid('版本不受支持');
  if (typeof category !== 'string' || !Object.hasOwn(PROP_IDS, category) || PROP_IDS[category] !== id) throw invalid('物品类别不受支持');
  if (score !== null && (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1)) throw invalid('置信度范围错误');
  if (!['detector', 'user'].includes(confirmedBy) || !['camera', 'file'].includes(source)) throw invalid('物品来源错误');
  if (!Number.isSafeInteger(captureRevision) || captureRevision < 1) throw invalid('拍照版本错误');
  if (!Number.isSafeInteger(capturedAt) || capturedAt < 0 || capturedAt > 8640000000000000) throw invalid('拍照时间错误');
  if (!dimension(width) || !dimension(height)) throw invalid('照片尺寸必须在 1 至 1280 像素之间');
  if (ownerId !== null && (typeof ownerId !== 'string' || !ownerId.trim() || ownerId.length > 128)) throw invalid('账号标识错误');
  const boundingBox = boxWithinImage(own(value, 'boundingBox'), width, height);
  return { schemaVersion, styleVersion, id, category, score, confirmedBy, source, captureRevision,
    width, height, boundingBox, ownerId, capturedAt };
}

export function createObjectProp(definition, metadata, { ownerId = null, capturedAt = Date.now() } = {}) {
  if (!isRecord(definition) || !isRecord(metadata)) throw invalid('缺少物品或拍照信息');
  const detection = own(metadata, 'detection');
  const boundingBox = own(metadata, 'boundingBox') ?? own(detection, 'boundingBox') ?? null;
  return validateObjectProp({ schemaVersion: OBJECT_PROP_SCHEMA_VERSION, styleVersion: OBJECT_PROP_STYLE_VERSION,
    id: own(definition, 'id'), category: own(definition, 'category'), score: own(metadata, 'score'),
    confirmedBy: own(metadata, 'confirmedBy'), source: own(metadata, 'source'),
    captureRevision: own(metadata, 'captureRevision'), width: own(metadata, 'width'), height: own(metadata, 'height'),
    boundingBox, ownerId, capturedAt });
}

function readPair(item) {
  if (!isRecord(item)) throw invalid('备份作品格式错误');
  const objectProp = own(item, 'objectProp'), propPhoto = own(item, 'propPhoto');
  if (objectProp == null && propPhoto == null) return null;
  if (objectProp == null || propPhoto == null) throw invalid('物品信息和照片必须同时存在');
  return { objectProp: validateObjectProp(objectProp), propPhoto };
}
function checkJpegHeader(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw invalid('物品照片不是有效 JPEG');
}
function bytesFromPhotoDataURL(value) {
  if (typeof value !== 'string' || !value.startsWith(JPEG_PREFIX)) throw invalid('物品照片必须是 JPEG dataURL');
  if (value.length > MAX_PROP_PHOTO_DATA_URL_LENGTH) throw invalid('物品照片备份超过 4 MB');
  const encoded = value.slice(JPEG_PREFIX.length);
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw invalid('物品照片 base64 无效');
  let decoded;
  try { decoded = atob(encoded); } catch { throw invalid('物品照片 base64 无效'); }
  if (decoded.length > MAX_PROP_PHOTO_BYTES) throw invalid('物品照片过大');
  const bytes = Uint8Array.from(decoded, character => character.charCodeAt(0));
  checkJpegHeader(bytes);
  return bytes;
}
async function checkedBlobBytes(photo) {
  if (!(photo instanceof Blob) || photo.type !== 'image/jpeg') throw invalid('物品照片必须是 JPEG Blob');
  if (!photo.size || photo.size > MAX_PROP_PHOTO_BYTES) throw invalid('物品照片过大或为空');
  const bytes = new Uint8Array(await photo.arrayBuffer());
  checkJpegHeader(bytes);
  return bytes;
}

/** A patch for the backup item. Never spread the stored propPhoto Blob into JSON. */
export async function encodeAvatarBackup(sound, toDataURL) {
  const pair = readPair(sound);
  if (!pair) return {};
  if (typeof toDataURL !== 'function') throw new TypeError('备份需要照片 dataURL 转换函数');
  const bytes = await checkedBlobBytes(pair.propPhoto);
  const encoded = await toDataURL(pair.propPhoto);
  const roundtrip = bytesFromPhotoDataURL(encoded);
  if (bytes.length !== roundtrip.length || !bytes.every((byte, index) => byte === roundtrip[index])) throw invalid('备份照片与原照片不一致');
  return { objectProp: pair.objectProp, propPhoto: encoded };
}

async function readPhotoDimensions(photo) {
  if (typeof createImageBitmap !== 'function') throw invalid('当前环境无法验证物品照片尺寸');
  const image = await createImageBitmap(photo);
  try { return { width: image.width, height: image.height }; } finally { image.close(); }
}

/** decodePhoto(blob) can inject a local image decoder returning {width,height}. */
export async function decodeAvatarBackup(item, { decodePhoto = readPhotoDimensions } = {}) {
  const pair = readPair(item);
  if (!pair) return {};
  const bytes = bytesFromPhotoDataURL(pair.propPhoto);
  const propPhoto = new Blob([bytes], { type: 'image/jpeg' });
  let image;
  try {
    image = await decodePhoto(propPhoto);
    if (!image || !dimension(image.width) || !dimension(image.height)) throw invalid('物品照片实际尺寸超过限制或无效');
    if (image.width !== pair.objectProp.width || image.height !== pair.objectProp.height) throw invalid('物品照片与记录尺寸不符');
  } catch (error) {
    if (error?.message?.startsWith('角色物品数据无效：')) throw error;
    throw invalid('物品照片无法解码');
  } finally { image?.close?.(); }
  return { objectProp: pair.objectProp, propPhoto };
}
