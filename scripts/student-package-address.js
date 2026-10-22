// The native clients allow system TLS trust only for this public deployment.
export const PUBLIC_CLASSROOM_URL = 'https://class.empfreeimpro.xyz/';

export function validatePublicPackageAddress(value) {
  if (value !== PUBLIC_CLASSROOM_URL) {
    throw new Error(`公开课堂打包地址仅支持 ${PUBLIC_CLASSROOM_URL}，不能包含其他域名、端口、账号、参数或路径。`);
  }
  return value;
}

export function parseStudentPackageAddress(args) {
  let value;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument !== '--classroom-url' && !argument.startsWith('--classroom-url=')) {
      throw new Error('仅支持 --classroom-url https://class.empfreeimpro.xyz/ 打包选项。');
    }
    if (value !== undefined) throw new Error('--classroom-url 不能重复指定。');
    value = argument === '--classroom-url' ? args[++index] : argument.slice('--classroom-url='.length);
    if (value === undefined || value === '') throw new Error('--classroom-url 必须指定公开课堂地址。');
    validatePublicPackageAddress(value);
  }
  return value;
}

export function resolveStudentPackageAddress(publicAddress) {
  // Student packages always use the public classroom, including a plain build.
  return validatePublicPackageAddress(publicAddress ?? PUBLIC_CLASSROOM_URL);
}
