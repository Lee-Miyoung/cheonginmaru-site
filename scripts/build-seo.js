#!/usr/bin/env node
/**
 * build-seo.js
 * ------------------------------------------------------------
 * 구글 시트(시공사례)를 읽어와 index.html의 SSR 마커 사이에
 * "이미 완성된" 정적 HTML을 구워 넣는 빌드 스크립트입니다.
 *
 * 목적: 클라이언트 사이드에서만 구글 시트를 긁어와 그리면
 * 네이버/구글 검색로봇이 빈 페이지로 인식할 수 있습니다.
 * 이 스크립트를 GitHub Actions로 주기 실행하면, 실제 배포되는
 * index.html 안에 이미 시공사례 텍스트가 들어있게 됩니다.
 *
 * 실행: node scripts/build-seo.js  (Node 18 이상, 내장 fetch 사용)
 * ------------------------------------------------------------
 */
const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

const INDEX_PATH = path.join(__dirname, '..', 'index.html');

const PORTFOLIO_SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1rt4nMI1JAhLFvk3WWz6IyvlnmUExlbgLj6yGK9Ta0MA/gviz/tq?tqx=out:csv&sheet=%EC%8B%9C%EB%B3%B5%EC%82%AC%EB%A1%80";

const SSR_START = '<!-- SSR:PORTFOLIO:START -->';
const SSR_END = '<!-- SSR:PORTFOLIO:END -->';

// index.html의 클라이언트 스크립트와 동일한 브랜드/모델 하이라이트 규칙
const PORTFOLIO_BRAND_TERMS = [
  "동화자연마루", "동화마루", "노바마루", "한솔홈데코", "한솔마루", "구정마루", "네스트", "이건", "성원",
  "시그니월", "진그란데스퀘어", "진 그란데 스퀘어", "듀오텍스쳐맥스", "마뷸러스젠", "원목마루STK", "콜렉트월",
  "미네랄월", "SB스톤", "sb스톤", "SB스퀘어", "sb스퀘어", "아크로K", "아크로", "사각돌마루", "미네랄마루",
  "오크스트립", "동화", "노바", "한솔", "구정"
].sort((a, b) => b.length - a.length);

const portfolioBrandRegex = new RegExp(
  '(' + PORTFOLIO_BRAND_TERMS.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')',
  'g'
);

const SPEC_DIMENSION_RE = /\d[\d,.]*\s*[×x*]\s*[\d,.]+/i;

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function highlightPortfolioDesc(text) {
  let out = text.replace(portfolioBrandRegex, `<b class="brand-tag">$1</b>`);
  out = out.replace(/'([^']+)'/g, `<b class="model-tag">$1</b>`);
  return out;
}

function extractSpecGroups(desc) {
  const groups = [];
  let depth = 0, startIdx = -1;
  for (let i = 0; i < desc.length; i++) {
    const ch = desc[i];
    if (ch === '(' || ch === '（') {
      if (depth === 0) startIdx = i;
      depth++;
    } else if (ch === ')' || ch === '）') {
      if (depth > 0) {
        depth--;
        if (depth === 0 && startIdx !== -1) {
          groups.push(desc.slice(startIdx, i + 1));
          startIdx = -1;
        }
      }
    }
  }
  return groups.filter(g => SPEC_DIMENSION_RE.test(g));
}

function renderCard(item) {
  const tag = item.link ? 'a' : 'div';
  const attrs = item.link ? ` href="${escapeHtml(item.link)}" target="_blank" rel="noopener"` : '';
  const color = item.color || '#C99456';

  const rawDesc = item.desc || '';
  const specMatches = extractSpecGroups(rawDesc);
  let descMain = rawDesc;
  specMatches.forEach(m => { descMain = descMain.replace(m, ''); });
  descMain = descMain.replace(/\s+([.,])/g, '$1').trim();
  descMain = highlightPortfolioDesc(escapeHtml(descMain));

  const specChips = specMatches
    .map(m => m.replace(/^[(（]|[)）]$/g, '').trim())
    .map(s => `<span class="portfolio-spec">${escapeHtml(s)}</span>`)
    .join('');

  const title = escapeHtml(item.title || '');
  const category = escapeHtml(item.category || '');

  return `
      <${tag} class="portfolio-card"${attrs}>
        <div class="portfolio-thumb" ${item.image ? '' : `style="background-color:${color}"`}>
          ${item.image ? `<img src="images/portfolio/${escapeHtml(item.image)}" alt="${title}" loading="lazy" onerror="onPortfolioThumbError(this,'${color}')">` : ''}
          <span class="pill">${category}</span>
          ${item.link ? `<span class="portfolio-view">전체 사진 보기 →</span>` : ''}
        </div>
        <div class="portfolio-info">
          <h3>${title}</h3>
          <p>${descMain}</p>
          ${specChips ? `<div class="portfolio-spec-row">${specChips}</div>` : ''}
        </div>
      </${tag}>`;
}

async function main() {
  console.log('▶ 구글 시트(시공사례) 불러오는 중...');
  const res = await fetch(PORTFOLIO_SHEET_CSV_URL);
  if (!res.ok) {
    throw new Error(`시트를 가져오지 못했습니다 (status ${res.status})`);
  }
  const csvText = await res.text();

  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  const rows = parsed.data
    .map(r => ({
      category: (r['카테고리'] || '').trim(),
      title: (r['제목(현장명)'] || r['제목'] || '').trim(),
      desc: (r['설명'] || '').trim(),
      image: (r['사진파일명'] || '').trim(),
      link: (r['블로그 링크'] || r['링크'] || '').trim()
    }))
    .filter(r => r.title);

  const items = rows.length ? rows.slice().reverse() : [];
  console.log(`▶ 시공사례 ${items.length}건 발견`);

  const html = items.map(renderCard).join('\n');

  let indexHtml = fs.readFileSync(INDEX_PATH, 'utf8');
  const startIdx = indexHtml.indexOf(SSR_START);
  const endIdx = indexHtml.indexOf(SSR_END);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error('index.html에서 SSR 마커(SSR:PORTFOLIO:START/END)를 찾을 수 없습니다.');
  }

  const before = indexHtml.slice(0, startIdx + SSR_START.length);
  const after = indexHtml.slice(endIdx);
  indexHtml = `${before}\n${html}\n${after}`;

  fs.writeFileSync(INDEX_PATH, indexHtml, 'utf8');
  console.log(`✅ index.html에 시공사례 ${items.length}건을 정적으로 반영했습니다.`);
}

main().catch(err => {
  console.error('❌ 빌드 실패:', err.message);
  process.exit(1);
});
