import { createHmac, randomUUID } from 'node:crypto';

export const aliyunSmsConfigured = env => ['ALIYUN_SMS_ACCESS_KEY_ID', 'ALIYUN_SMS_ACCESS_KEY_SECRET', 'ALIYUN_SMS_SIGN_NAME', 'ALIYUN_SMS_TEMPLATE_CODE'].every(key => Boolean(env[key]));
const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, character => '%' + character.charCodeAt(0).toString(16).toUpperCase());

export function aliyunSmsRequest({ phoneNumber, code }, env, now = new Date(), nonce = randomUUID()) {
  if (!/^\+861[3-9]\d{9}$/.test(phoneNumber)) throw Object.assign(new Error('当前短信服务仅支持中国大陆手机号。'), { status: 400 });
  const params = {
    AccessKeyId: env.ALIYUN_SMS_ACCESS_KEY_ID, Action: 'SendSms', Format: 'JSON', PhoneNumbers: phoneNumber.slice(3),
    RegionId: 'cn-hangzhou', SignName: env.ALIYUN_SMS_SIGN_NAME, SignatureMethod: 'HMAC-SHA1', SignatureNonce: nonce,
    SignatureVersion: '1.0', TemplateCode: env.ALIYUN_SMS_TEMPLATE_CODE, TemplateParam: JSON.stringify({ code }),
    Timestamp: now.toISOString().replace(/\.\d{3}Z$/, 'Z'), Version: '2017-05-25',
  };
  const canonical = Object.keys(params).sort().map(key => encode(key) + '=' + encode(params[key])).join('&');
  const signature = createHmac('sha1', env.ALIYUN_SMS_ACCESS_KEY_SECRET + '&').update('POST&%2F&' + encode(canonical)).digest('base64');
  return new URLSearchParams({ ...params, Signature: signature });
}

export async function sendAliyunSms(value, env) {
  const response = await fetch('https://dysmsapi.aliyuncs.com/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: aliyunSmsRequest(value, env), signal: AbortSignal.timeout(10000), redirect: 'error' });
  const result = await response.json();
  if (!response.ok || result.Code !== 'OK') throw Object.assign(new Error('短信发送失败，请稍后重试或使用账号密码。'), { status: 503 });
}
