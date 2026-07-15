#!/usr/bin/env node
/**
 * optimize-images.js
 * ------------------------------------------------------------
 * images 폴더 안의 모든 사진을 다음 두 가지 방식으로 최적화합니다.
 * 1) 가로 폭이 MAX_WIDTH보다 크면 비율 유지한 채로 축소 (리사이즈)
 * 2) JPEG/PNG/WebP 품질을 낮춰 재압축
 *
 * 이전에 쓰던 calibreapp/image-actions는 "재압축"만 해줘서
 * 실제 화면 크기보다 훨씬 큰 원본 해상도 사진의 용량 문제는
 * 해결하지 못했습니다. 이 스크립트는 리사이즈까지 함께 처리합니다.
 * ------------------------------------------------------------
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const IMAGES_DIR = path.join(__dirname, '..', 'images');
const MAX_WIDTH = 1920;       // 이보다 넓은 사진만 축소
const JPEG_QUALITY = 78;
const WEBP_QUALITY = 78;

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (IMAGE_EXT.has(path.extname(entry.name).toLowerCase())) {
      files.push(full);
    }
  }
  return files;
}

async function optimizeFile(file) {
  const ext = path.extname(file).toLowerCase();
  const before = fs.statSync(file).size;
  const originalBuffer = fs.readFileSync(file);

  const meta = await sharp(originalBuffer).metadata();
  let pipeline = sharp(originalBuffer).rotate(); // EXIF 방향 정보를 반영해 자동 회전

  if (meta.width && meta.width > MAX_WIDTH) {
    pipeline = pipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true });
  }

  let outBuffer;
  if (ext === '.jpg' || ext === '.jpeg') {
    outBuffer = await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
  } else if (ext === '.png') {
    // PNG는 그라데이션/그림자가 있는 일러스트에서 색상 손실이 눈에 띌 수 있어
    // palette(색상 축소) 없이 완전 무손실 압축만 적용합니다. (화질 100% 동일, 용량 절감폭은 다소 작음)
    outBuffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
  } else if (ext === '.webp') {
    outBuffer = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();
  } else {
    return null;
  }

  const after = outBuffer.length;

  // 아주 드물게 결과가 더 커지면 원본을 그대로 유지합니다.
  if (after < before) {
    fs.writeFileSync(file, outBuffer);
    return { file, before, after, changed: true };
  }
  return { file, before, after: before, changed: false };
}

async function main() {
  if (!fs.existsSync(IMAGES_DIR)) {
    console.log('images 폴더를 찾을 수 없습니다.');
    return;
  }

  const files = walk(IMAGES_DIR);
  console.log(`▶ 이미지 ${files.length}개 발견\n`);

  let totalBefore = 0;
  let totalAfter = 0;
  let changedCount = 0;

  for (const file of files) {
    try {
      const result = await optimizeFile(file);
      if (!result) continue;
      totalBefore += result.before;
      totalAfter += result.after;
      if (result.changed) changedCount++;

      const savedPct = result.before > 0 ? Math.round((1 - result.after / result.before) * 100) : 0;
      const label = path.relative(IMAGES_DIR, file);
      const beforeKB = (result.before / 1024).toFixed(0);
      const afterKB = (result.after / 1024).toFixed(0);
      console.log(`${result.changed ? '✅' : '↔ '} ${label}: ${beforeKB}KB → ${afterKB}KB (${savedPct}% 절감)`);
    } catch (err) {
      console.error(`❌ ${file} 처리 중 오류:`, err.message);
    }
  }

  console.log(`\n총 ${changedCount}개 파일 최적화됨`);
  console.log(`전체 용량: ${(totalBefore / 1024 / 1024).toFixed(1)}MB → ${(totalAfter / 1024 / 1024).toFixed(1)}MB`);
}

main();
