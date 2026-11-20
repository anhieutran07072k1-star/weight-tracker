import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { detectDeviceInstallInfo } from '../src/utils/pwaDevice';

test('Device-specific install guide: iPhone Safari shows ONLY iOS Safari steps', () => {
  const info = detectDeviceInstallInfo({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    maxTouchPoints: 5,
    isStandalone: false,
  });

  assert.equal(info.platform, 'ios');
  assert.equal(info.browserFlavor, 'safari');
  assert.equal(info.warningNote, undefined);
  assert.ok(info.guideSteps.some((s) => s.includes('Chia sẻ')));
  assert.ok(info.guideSteps.some((s) => s.includes('Thêm vào Màn hình chính')));
  // Never mix Android or Windows steps into iOS guide
  assert.equal(info.guideSteps.some((s) => s.includes('Google Chrome')), false);
  assert.equal(info.guideSteps.some((s) => s.includes('Start Menu')), false);
});

test('Device-specific install guide: iPadOS Safari + iOS Chrome in-app warning', () => {
  const ipad = detectDeviceInstallInfo({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    maxTouchPoints: 5,
    isStandalone: false,
  });
  assert.equal(ipad.platform, 'ios');
  assert.equal(ipad.osLabel, 'iPad (iPadOS)');

  const iosChrome = detectDeviceInstallInfo({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
    maxTouchPoints: 5,
    isStandalone: false,
  });
  assert.equal(iosChrome.platform, 'ios');
  assert.ok(iosChrome.warningNote && iosChrome.warningNote.includes('Safari'));
});

test('Device-specific install guide: Android Chrome shows ONLY Android steps', () => {
  const android = detectDeviceInstallInfo({
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    maxTouchPoints: 5,
    isStandalone: false,
  });

  assert.equal(android.platform, 'android');
  assert.equal(android.browserFlavor, 'chrome');
  assert.ok(android.guideSteps.some((s) => s.includes('Google Chrome')));
  assert.equal(android.guideSteps.some((s) => s.includes('Safari')), false);
});

test('Device-specific install guide: Windows Chrome & macOS Safari show ONLY matching Desktop steps', () => {
  const winChrome = detectDeviceInstallInfo({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    maxTouchPoints: 0,
    isStandalone: false,
  });
  assert.equal(winChrome.platform, 'desktop');
  assert.equal(winChrome.osLabel, 'Máy tính Windows');
  assert.ok(winChrome.guideSteps.some((s) => s.includes('Google Chrome') || s.includes('Microsoft Edge')));
  assert.equal(winChrome.guideSteps.some((s) => s.includes('Chia sẻ')), false);

  const macSafari = detectDeviceInstallInfo({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
    maxTouchPoints: 0,
    isStandalone: false,
  });
  assert.equal(macSafari.platform, 'desktop');
  assert.equal(macSafari.osLabel, 'Máy tính macOS');
  assert.ok(macSafari.guideSteps.some((s) => s.includes('Thêm vào Dock')));
});

test('Built PWA artifacts: manifest.webmanifest, sw.js, icons, and HTML head compliance', () => {
  const distDir = path.resolve(process.cwd(), 'dist');
  assert.ok(fs.existsSync(distDir), 'dist/ must exist after vite build');

  const manifestPath = path.join(distDir, 'manifest.webmanifest');
  assert.ok(fs.existsSync(manifestPath), 'dist/manifest.webmanifest must be generated');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  assert.equal(manifest.id, '/');
  assert.equal(manifest.name, 'KẾ HOẠCH THU CHI');
  assert.ok(manifest.short_name.length <= 12, 'short_name must be <= 12 characters');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');

  const has192Any = manifest.icons.some(
    (i: any) => i.sizes === '192x192' && i.purpose === 'any' && i.type === 'image/png'
  );
  const has512Any = manifest.icons.some(
    (i: any) => i.sizes === '512x512' && i.purpose === 'any' && i.type === 'image/png'
  );
  const has512Maskable = manifest.icons.some(
    (i: any) => i.sizes === '512x512' && i.purpose === 'maskable' && i.type === 'image/png'
  );
  assert.ok(has192Any && has512Any && has512Maskable, 'Manifest must separate any and maskable PNG icons');

  const swPath = path.join(distDir, 'sw.js');
  assert.ok(fs.existsSync(swPath), 'dist/sw.js Service Worker must be generated');
  const swText = fs.readFileSync(swPath, 'utf-8');
  assert.ok(swText.includes('precacheAndRoute'), 'Service worker must precache app assets with Workbox');
  assert.ok(swText.includes('cleanupOutdatedCaches'), 'Service worker must clean outdated caches');
  assert.ok(swText.includes('index.html'), 'Service worker must support offline index.html fallback');

  const htmlText = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8');
  assert.ok(htmlText.includes('apple-touch-icon.png'));
  assert.ok(htmlText.includes('apple-mobile-web-app-capable'));
  assert.ok(htmlText.includes('manifest.webmanifest'));

  for (const iconFile of ['apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png']) {
    assert.ok(fs.existsSync(path.join(distDir, iconFile)), `${iconFile} must exist in dist/`);
  }
});
