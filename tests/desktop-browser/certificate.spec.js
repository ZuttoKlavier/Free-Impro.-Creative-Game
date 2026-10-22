import { test, expect, _electron } from '@playwright/test';
import electronPath from 'electron';
import { mkdtempSync, cpSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { prepareCertificates } from '../../scripts/https-certificates.js';

test('the registered desktop verifier delegates only the public HTTPS origin to Chromium', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'teacher-desktop-trust-'));
  let application;
  try {
    const certDirectory = join(dir, 'certs');
    const hosts = ['class.empfreeimpro.xyz', 'localhost', 'sub.class.empfreeimpro.xyz', 'class.empfreeimpro.xyz.evil.test'];
    prepareCertificates({ directory: certDirectory, hosts });
    const certificate = { data: readFileSync(join(certDirectory, 'server.crt'), 'utf8') };
    const requests = [
      { hostname: 'class.empfreeimpro.xyz', certificate, verificationResult: 'OK', errorCode: 0 },
      { hostname: 'class.empfreeimpro.xyz', certificate, verificationResult: 'CERT_AUTHORITY_INVALID', errorCode: -202 },
      { hostname: 'class.empfreeimpro.xyz', certificate: { data: 'invalid certificate' }, verificationResult: 'CERT_DATE_INVALID', errorCode: -201 },
      { hostname: 'localhost', certificate, verificationResult: 'OK', errorCode: 0 }
    ];
    for (const [index, [address, expected]] of [
      ['https://class.empfreeimpro.xyz/', [-3, -3, -3, -2]],
      ['https://class.empfreeimpro.xyz:443/', [-3, -3, -3, -2]],
      ['https://class.empfreeimpro.xyz:8443/', [0, 0, -2, -2]],
      ['https://localhost:8443/', [-2, -2, -2, 0]],
      ['https://sub.class.empfreeimpro.xyz/', [-2, -2, -2, -2]],
      ['https://class.empfreeimpro.xyz.evil.test/', [-2, -2, -2, -2]]
    ].entries()) {
      const stage = join(dir, `app-${index}`);
      cpSync(resolve('desktop'), stage, { recursive: true });
      copyFileSync(join(certDirectory, 'classroom-ca.crt'), join(stage, 'classroom-ca.crt'));
      writeFileSync(join(stage, 'classroom.json'), JSON.stringify({ address }));
      // Capture the real registered callback without making public network requests.
      writeFileSync(join(stage, 'trust-test.js'), `import { app, session } from 'electron';
app.whenReady().then(async () => {
  const register = session.defaultSession.setCertificateVerifyProc.bind(session.defaultSession);
  session.defaultSession.setCertificateVerifyProc = procedure => {
    globalThis.empvcCertificateVerifier = procedure;
    register(procedure);
  };
  await import('./main.js');
}).catch(error => { console.error(error); app.exit(1); });
`);
      application = await _electron.launch({ executablePath: electronPath, args: [join(stage, 'trust-test.js')], env: { ...process.env, FREE_IMPRO_DESKTOP_PROFILE: join(dir, `profile-${index}`) } });
      await application.firstWindow();
      const actual = await application.evaluate(async (_, inputs) => {
        if (typeof globalThis.empvcCertificateVerifier !== 'function') throw new Error('The application did not register its certificate verifier.');
        return Promise.all(inputs.map(request => new Promise(resolve => globalThis.empvcCertificateVerifier(request, resolve))));
      }, requests);
      // -3 keeps successful and failed system verification intact; it never accepts blindly.
      expect(actual, address).toEqual(expected);
      await application.close(); application = undefined;
    }
  } finally { await application?.close(); rmSync(dir, { recursive: true, force: true }); }
});
