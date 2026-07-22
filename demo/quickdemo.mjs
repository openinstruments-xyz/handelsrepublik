// This file will demonstrate some simple usage.
// The result will look like this in the console:
({
  amount: 6.79,
  currency: 'EUR',
  raw: [ { accountNumber: 'xxxxxxx', currencyId: 'EUR', amount: 13.37 } ]
})


import {
  FileSessionStore,
  TradeRepublicClient,
} from '../dist/index.js';
import { rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import open from 'open';
import QRCode from 'qrcode';

const qrImagePath = resolve('.tr-login-qr.png');
let qrWindowOpened = false;

await rm(qrImagePath, { force: true });

async function showQrCode(challenge) {
  const imageData = challenge.qrCodeDataUrl;
  const payload = challenge.deepLink ?? challenge.qrCode;
  if (!imageData && !payload) return;

  if (imageData?.startsWith('data:image/')) {
    await writeFile(qrImagePath, Buffer.from(imageData.split(',', 2)[1], 'base64'));
  } else {
    await QRCode.toFile(qrImagePath, payload, { margin: 2, width: 480 });
  }
  console.log(`QR-Code gespeichert unter ${qrImagePath}`);

  if (qrWindowOpened) return;
  qrWindowOpened = true;
  try {
    await open(qrImagePath);
  } catch (error) {
    console.warn(`QR-Datei konnte nicht automatisch geöffnet werden. Öffne sie manuell: ${qrImagePath}`, error);
  }
}

// First, we need to get a token for passing the AWS WAF challenge
// This launches a visible browser, visits the Trade Republic site, collects the WAF token, and then closes it again.
// This process might take a while.
const wafContext = await TradeRepublicClient.collectWafToken({
  // browserLaunchOptions: {
  //  channel: 'chrome',
  //  headless: false, // Set to true to hide the browser in production; visible mode is easier to debug if the WAF challenge fails.
  // },
});

// Second, create the client.
// It takes a session store (you can implement your own, e.g. in Redis. More on that later.).
// We will use the simple file-based session store. It creates `.tr-session.json` in the current directory.
const tr = TradeRepublicClient.create({
  wafContext,
  sessionStore: new FileSessionStore('.tr-session.json'),

  // We currently validate all answers from TradeRepublic via zod schemas.
  // 'throw' lets the application crash on schema drift, 'passthrough' accepts invalid responses.
  rawSchemaValidation: 'throw',
  onRawSchemaValidationFailure({ schemaName, error }) {
    console.warn(`Trade Republic schema drift in ${schemaName}`, error); // Create an issue, if you ever encounter this ;)

  },
});

// Restore old, saved sessions like this
try {
  //
  let session = await tr.auth.restoreSession();

  if (session) {
    // Refreshes the web session and saves the updated session automatically.
    session = await tr.auth.refreshSession().catch(async (error) => {
      console.warn('Saved session could not be refreshed; starting QR login.', error);
      await tr.auth.clearSession();
      return undefined;
    });
  }

  if (!session) {
    session = await tr.auth.loginWithQr({
      deviceName: 'local sdk',
      async onChallengeUpdate(challenge) {
        await showQrCode(challenge);
        /*
          // Show one of these to your user.
          challenge.qrCodeDataUrl // "data:image/png;base64,xxx...", which you could use like <img src="data:image/png;base64,..." />
            ?? challenge.deepLink // e.g. "traderepublic://login/..."
            ?? challenge.qrCode, // "https://app.traderepublic.com/login?...token=...", you want to throw this string into your QR Code generator
        */
      },
    });
  }

  console.log(await tr.portfolio.cash());
} finally {
  tr.close();
  await rm(qrImagePath, { force: true });
}
