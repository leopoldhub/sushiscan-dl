import { Cookie, firefox } from 'playwright';
import fs from 'fs';
import fsExtra from 'fs-extra';
import minimist from 'minimist';

const COOKIES_FILE_PATH = './cookies.json';

function loadSavedCookies() {
  const existingCookies: Cookie[] = [];
  if (fs.existsSync(COOKIES_FILE_PATH)) {
    existingCookies.push(
      ...JSON.parse(
        fs.readFileSync(COOKIES_FILE_PATH, { encoding: 'utf8', flag: 'r' })
      )
    );
  }
  return existingCookies;
}

function saveCookies(cookies: Cookie[]) {
  fs.writeFileSync(COOKIES_FILE_PATH, JSON.stringify(cookies, null, '\t'), {
    encoding: 'utf-8',
    flag: 'w',
  });
}

async function preloadCookies(url: string, existingCookies: Cookie[]) {
  const browser = await firefox.launch({
    headless: false,
  });
  const context = await browser.newContext();
  await context.addCookies(existingCookies);
  const page = await context.newPage();
  await page.goto(url, {
    waitUntil: 'domcontentloaded',
  });

  let initial = false;
  while ((await page.locator('title').innerText()) === 'Just a moment...') {
    if (!initial) {
      initial = true;
      console.log('is in cloudflare!');
      console.log(
        'complete the captcha or close the program and manually import valid cookies in the "cookies.json" file.'
      );
    }
    await page.waitForURL('https://sushiscan.net/**', {
      waitUntil: 'domcontentloaded',
    });
  }

  const cookies = await context.cookies();
  await browser.close();
  return cookies;
}

async function downloadingSushiscanPageImages(
  url: string,
  destinationFolder: string
) {
  console.log('preloading cookies');
  const preloadedCookies = await preloadCookies(url, loadSavedCookies());
  console.log('saving loaded cookies');
  saveCookies(preloadedCookies);

  console.log('launching browser');
  const browser =
    await firefox.launch(/*{
    headless: false,
    args: ['-devtools'],
  }*/);

  console.log('loading context...');
  const context = await browser.newContext();
  await context.addCookies(preloadedCookies);
  const page = await context.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => {
    localStorage.setItem('tsms_readingmode', '"full"');
  });

  console.log(
    'loading page... (waiting for the page to stabilize, might take up to a minute)'
  );
  await page.goto(url, {
    waitUntil: 'networkidle',
    timeout: 120000,
  });

  console.log('rendering images...');
  await (
    await page.locator('#readerarea>img').all()
  ).reduce<Promise<any>>(async (previousValue, l) => {
    console.log('loading image', await l.getAttribute('data-index'));
    return previousValue
      .then(() => l.evaluate((img: any) => img.scrollIntoView()))
      .then(() => page.waitForLoadState('networkidle'));
  }, Promise.resolve());
  await page.waitForLoadState('networkidle');

  console.log('extracting images...');
  await Promise.all(
    (await page.locator('#readerarea>img').all()).map(async (l) => {
      const imageUrl = await l.getAttribute('data-index');
      console.log('extracting image', imageUrl);
      const imageData = await l.evaluate((img: any) => {
        const c = document.createElement('canvas');
        c.height = img.naturalHeight;
        c.width = img.naturalWidth;
        const ctx: any = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return {
          data: c.toDataURL(),
          extension: new URL(img.getAttribute('src')).pathname.split('.').pop(),
          index: parseInt(img.getAttribute('data-index')),
        };
      });
      console.log('downloading image', imageUrl);
      const formatedData = imageData.data.replace(/^data:.+;base64,/, '');
      fs.promises
        .writeFile(
          destinationFolder + '/' + imageData.index + '.' + imageData.extension,
          formatedData,
          { encoding: 'base64', flag: 'w' }
        )
        .catch((e) => {
          console.error('failed to download image ' + imageData.index);
          console.trace(e);
        });
    })
  );

  console.log('download complete!');
  await browser.close();
}

const processArgs = minimist(process.argv.slice(2));
console.log(processArgs);
if (processArgs['h'] || processArgs['help']) {
  console.log('-h, --help : help');
  console.log('-----------------');
  console.log('<sushiscan-url> : Sushiscan url to download');
  console.log('-d : destination folder (optional');
}
const destinationFolder: string = processArgs['d'] || './dl';
fsExtra.ensureDirSync(destinationFolder);

const url: string = processArgs['_'][0];
if (!url) {
  console.log('url required, type -h to know more');
  process.exit(1);
}

downloadingSushiscanPageImages(url, destinationFolder);
