/**
 * export.js — 내보내기 모듈 v3.1
 * Excel(SheetJS), Markdown, CSV(BOM), 차트 PNG, 국회 질의 문답서 MD
 */

let _xlsxLoaded = false;
async function ensureXLSX() {
  if (window.XLSX) { _xlsxLoaded = true; return; }
  if (_xlsxLoaded) return;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => { _xlsxLoaded = true; resolve(); };
    s.onerror = () => reject(new Error('SheetJS 로드 실패'));
    document.head.appendChild(s);
  });
}

const today = () => new Date().toISOString().slice(0,10).replace(/-/g,'');
const fmtNum = n => n.toLocaleString();
const sign = n => n > 0 ? `+${fmtNum(n)}` : fmtNum(n);

async function exportExcel(ALL, ENGINE, currentFilter) {
  try {
    await ensureXLSX();
    const XLSX = window.XLSX;
    const wb = XLSX.utils.book_new();
    const sheet1data = [
      ['부처','사업명','유형','기능분류','2024예산','2025예산','2026예산','요구액','증감액','증감률(%)','회계유형','신규여부','사업설명']
    ];
    const list = currentFilter ? currentFilter : ALL;
    list.forEach(p => {
      sheet1data.push([
        p.ministry, p.project_name, p.project_type, p.function,
        p.budget_2024||0, p.budget_2025, p.budget_2026,
        p.budget_requested||0, p.change_amount, p.change_rate,
        p.account_type, p.is_new?'신규':'계속', p.description||''
      ]);
    });
    const ws1 = XLSX.utils.aoa_to_sheet(sheet1data);
    ws1['!cols'] = [
      {wch:16},{wch:32},{wch:8},{wch:14},
      {wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:10},
      {wch:16},{wch:8},{wch:40}
    ];
    XLSX.utils.book_append_sheet(wb, ws1, '전체_사업목록');

    const byMin = {};
    ALL.forEach(p => {
      if (!byMin[p.ministry]) byMin[p.ministry] = {b26:0,b25:0,cnt:0,rnd:0,it:0,gen:0,newC:0};
      byMin[p.ministry].b26 += p.budget_2026;
      byMin[p.ministry].b25 += p.budget_2025;
      byMin[p.ministry].cnt++;
      if (p.project_type==='R&D') byMin[p.ministry].rnd++;
      else if (p.project_type==='정보화') byMin[p.ministry].it++;
      else byMin[p.ministry].gen++;
      if (p.is_new) byMin[p.ministry].newC++;
    });
    const sheet2data = [
      ['부처','2025예산(백만원)','2026예산(백만원)','증감액','증감률(%)','사업수','R&D','정보화','일반','신규']
    ];
    Object.entries(byMin).sort((a,b)=>b[1].b26-a[1].b26).forEach(([m,d]) => {
      const diff = d.b26-d.b25;
      sheet2data.push([m, d.b25, d.b26, diff, d.b25>0?((diff/d.b25)*100).toFixed(1):0,
        d.cnt, d.rnd, d.it, d.gen, d.newC]);
    });
    const ws2 = XLSX.utils.aoa_to_sheet(sheet2data);
    ws2['!cols'] = [{wch:18},{wch:16},{wch:16},{wch:12},{wch:10},{wch:8},{wch:6},{wch:8},{wch:6},{wch:6}];
    XLSX.utils.book_append_sheet(wb, ws2, '부처별_요약');

    const byFunc = {};
    ALL.forEach(p => {
      if (!byFunc[p.function]) byFunc[p.function] = {b26:0,b25:0,cnt:0,rnd:0,it:0,gen:0};
      byFunc[p.function].b26 += p.budget_2026;
      byFunc[p.function].b25 += p.budget_2025;
      byFunc[p.function].cnt++;
      if (p.project_type==='R&D') byFunc[p.function].rnd++;
      else if (p.project_type==='정보화') byFunc[p.function].it++;
      else byFunc[p.function].gen++;
    });
    const sheet3data = [['기능분류','2025예산','2026예산','증감액','증감률(%)','사업수','R&D','정보화','일반']];
    Object.entries(byFunc).sort((a,b)=>b[1].b26-a[1].b26).forEach(([f,d]) => {
      const diff = d.b26-d.b25;
      sheet3data.push([f, d.b25, d.b26, diff, d.b25>0?((diff/d.b25)*100).toFixed(1):0, d.cnt, d.rnd, d.it, d.gen]);
    });
    const ws3 = XLSX.utils.aoa_to_sheet(sheet3data);
    ws3['!cols'] = [{wch:18},{wch:14},{wch:14},{wch:12},{wch:10},{wch:8},{wch:6},{wch:8},{wch:6}];
    XLSX.utils.book_append_sheet(wb, ws3, '기능별_요약');

    const SE = window.SimilarityEngine;
    const sheet4data = [['부처','사업명','리스크점수','위험등급','위험사유','2026예산','증감률(%)']];
    if (SE) {
      ALL.map(p => ({project:p, ...SE.calcWasteRisk(p, ALL)}))
        .filter(r=>r.score>0)
        .sort((a,b)=>b.score-a.score)
        .forEach(r => {
          const grade = r.score>=60?'고위험':r.score>=30?'중위험':'저위험';
          sheet4data.push([r.project.ministry, r.project.project_name, r.score, grade,
            r.reasons.join(' / '), r.project.budget_2026, r.project.change_rate]);
        });
    }
    const ws4 = XLSX.utils.aoa_to_sheet(sheet4data);
    ws4['!cols'] = [{wch:16},{wch:32},{wch:10},{wch:8},{wch:50},{wch:12},{wch:10}];
    XLSX.utils.book_append_sheet(wb, ws4, '리스크_분석');

    if (ENGINE && ENGINE._pairs && ENGINE._pairs.length > 0) {
      const sheet5data = [['사업A','부처A','사업B','부처B','유사도(%)','등급','부처간교차','Value Chain패턴']];
      ENGINE._pairs.filter(p=>p.score>=0.5).slice(0,200).forEach(p => {
        sheet5data.push([
          p.a.project_name, p.a.ministry,
          p.b.project_name, p.b.ministry,
          (p.score*100).toFixed(1), p.label,
          p.crossMinistry?'Y':'N',
          p.valueChain?.pattern||''
        ]);
      });
      const ws5 = XLSX.utils.aoa_to_sheet(sheet5data);
      ws5['!cols'] = [{wch:28},{wch:16},{wch:28},{wch:16},{wch:10},{wch:10},{wch:8},{wch:24}];
      XLSX.utils.book_append_sheet(wb, ws5, '유사중복_분석');
    }

    XLSX.writeFile(wb, `재정사업분석_${today()}.xlsx`);
    return { ok: true, msg: 'Excel 파일 다운로드 완료' };
  } catch(e) {
    console.error('Excel export error:', e);
    return { ok: false, msg: e.message };
  }
}

function exportMarkdown(ALL, ENGINE) {
  const t26 = ALL.reduce((s,p)=>s+p.budget_2026,0);
  const t25 = ALL.reduce((s,p)=>s+p.budget_2025,0);
  const mins = [...new Set(ALL.map(p=>p.ministry))].length;
  const newC = ALL.filter(p=>p.is_new).length;
  const rnd = ALL.filter(p=>p.project_type==='R&D').reduce((s,p)=>s+p.budget_2026,0);
  const fmt = n => n>=1e12?(n/1e12).toFixed(1)+'조':n>=1e8?(n/1e8).toFixed(1)+'억':n>=1e4?(n/1e4).toFixed(0)+'만':n.toLocaleString();
  const diff = t26-t25;
  const cr = t25>0?((diff/t25)*100).toFixed(1):'N/A';

  let md = `# 2026년도 재정사업 분석 보고서\n\n`;
  md += `> 생성일: ${new Date().toLocaleDateString('ko-KR')} | 데이터: 샘플 데이터 기반 비공식 분석\n\n`;
  md += `---\n\n`;
  md += `## 📊 핵심 요약\n\n`;
  md += `| 항목 | 수치 |\n|---|---|\n`;
  md += `| 총 예산 (2026) | ${fmt(t26*1e6)} |\n`;
  md += `| 전년 대비 증감 | ${diff>=0?'+':''}${fmt(Math.abs(diff)*1e6)} (${cr}%) |\n`;
  md += `| 총 사업 수 | ${ALL.length}개 (신규 ${newC}개) |\n`;
  md += `| 참여 부처 | ${mins}개 |\n`;
  md += `| R&D 예산 비중 | ${((rnd/t26)*100).toFixed(1)}% |\n\n`;

  const byMin = {};
  ALL.forEach(p => { byMin[p.ministry]=(byMin[p.ministry]||0)+p.budget_2026; });
  const topMin = Object.entries(byMin).sort((a,b)=>b[1]-a[1]).slice(0,10);
  md += `## 🏛️ 부처별 예산 Top 10\n\n`;
  md += `| 순위 | 부처 | 2026 예산 | 점유율 |\n|---|---|---|---|\n`;
  topMin.forEach(([m,b],i) => { md += `| ${i+1} | ${m} | ${fmtNum(b)} 백만원 | ${((b/t26)*100).toFixed(1)}% |\n`; });
  md += '\n';

  const byFunc = {};
  ALL.forEach(p => { byFunc[p.function]=(byFunc[p.function]||0)+p.budget_2026; });
  const topFunc = Object.entries(byFunc).sort((a,b)=>b[1]-a[1]);
  md += `## 📂 기능별 예산 현황\n\n`;
  md += `| 기능 | 2026 예산 | 점유율 |\n|---|---|---|\n`;
  topFunc.forEach(([f,b]) => { md += `| ${f} | ${fmtNum(b)} 백만원 | ${((b/t26)*100).toFixed(1)}% |\n`; });
  md += '\n';

  const sorted = [...ALL].sort((a,b)=>b.change_amount-a.change_amount);
  md += `## 📈 예산 증가 Top 5\n\n`;
  md += `| 부처 | 사업명 | 증감액 | 증감률 |\n|---|---|---|---|\n`;
  sorted.slice(0,5).forEach(p => { md += `| ${p.ministry} | ${p.project_name} | +${fmtNum(p.change_amount)} 백만원 | +${p.change_rate.toFixed(1)}% |\n`; });
  md += '\n';

  md += `## 📉 예산 감소 Top 5\n\n`;
  md += `| 부처 | 사업명 | 증감액 | 증감률 |\n|---|---|---|---|\n`;
  [...sorted].reverse().filter(p=>p.change_amount<0).slice(0,5).forEach(p => { md += `| ${p.ministry} | ${p.project_name} | ${fmtNum(p.change_amount)} 백만원 | ${p.change_rate.toFixed(1)}% |\n`; });
  md += '\n';

  const SE = window.SimilarityEngine;
  if (SE) {
    const risks = ALL.map(p=>({project:p,...SE.calcWasteRisk(p,ALL)})).filter(r=>r.score>=60).sort((a,b)=>b.score-a.score);
    if (risks.length > 0) {
      md += `## ⚠️ 고위험 사업 (리스크 60점 이상)\n\n`;
      md += `| 부처 | 사업명 | 점수 | 사유 |\n|---|---|---|---|\n`;
      risks.slice(0,10).forEach(r => { md += `| ${r.project.ministry} | ${r.project.project_name} | ${r.score} | ${r.reasons.join(', ')} |\n`; });
      md += '\n';
    }
  }

  if (ENGINE && ENGINE._pairs && ENGINE._pairs.length > 0) {
    const dupPairs = ENGINE._pairs.filter(p=>p.score>=0.7 && p.crossMinistry).slice(0,10);
    if (dupPairs.length > 0) {
      md += `## 🔍 부처 간 고유사 사업 (70% 이상)\n\n`;
      md += `| 사업 A | 부처 A | 사업 B | 부처 B | 유사도 |\n|---|---|---|---|---|\n`;
      dupPairs.forEach(p => { md += `| ${p.a.project_name} | ${p.a.ministry} | ${p.b.project_name} | ${p.b.ministry} | ${(p.score*100).toFixed(0)}% |\n`; });
      md += '\n';
    }
  }

  md += `---\n\n> ⚠️ 본 보고서는 비공식 분석 자료입니다. 공식 예산 자료는 기획재정부(moef.go.kr) 및 열린재정(openfiscaldata.go.kr)을 참고하세요.\n`;

  const blob = new Blob([md], {type:'text/markdown;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `재정사업분석보고서_${today()}.md`; a.click();
  URL.revokeObjectURL(url);
  return { ok: true, msg: 'Markdown 파일 다운로드 완료' };
}

function exportInquiryMarkdown(data) {
  try {
    const { drafts, principles } = data;
    let md = `# 국회 질의 대응 문답서 초안\n\n`;
    md += `> 생성일: ${new Date().toLocaleDateString('ko-KR')} | 예산 인사이트 기반 자동 생성 초안\n\n`;
    md += `## 공통 답변 원칙\n\n`;
    principles.forEach((p, i) => { md += `${i+1}. ${p}\n`; });
    md += `\n---\n\n`;
    drafts.forEach((d, i) => {
      md += `## ${i+1}. ${d.title}\n\n`;
      md += `**예상 질문**  \n${d.question}\n\n`;
      md += `**짧은 답변**  \n${d.shortAnswer}\n\n`;
      md += `**상세 답변**  \n${d.detailAnswer}\n\n`;
      md += `**핵심 근거**  \n${d.evidence}\n\n`;
      md += `**보완 필요사항**  \n${d.followup}\n\n`;
      md += `**추가 제출자료**  \n- ${d.docs.join('\n- ')}\n\n`;
    });
    md += `---\n\n> 본 문답서는 자동 생성 초안으로, 실제 국회 제출 전 부처별 사실관계 및 최신 수치 확인이 필요합니다.\n`;
    const blob = new Blob([md], {type:'text/markdown;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `국회질의_문답서초안_${today()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    return { ok: true, msg: '국회 질의 문답서 Markdown 다운로드 완료' };
  } catch (e) {
    console.error('Inquiry markdown export error:', e);
    return { ok: false, msg: e.message };
  }
}

function exportCSV(data, filename) {
  const header = '부처,사업명,유형,기능분류,2025예산(백만원),2026예산(백만원),증감액,증감률(%),회계유형,신규여부\n';
  const rows = data.map(p =>
    [p.ministry, `"${p.project_name}"`, p.project_type, p.function,
     p.budget_2025, p.budget_2026, p.change_amount, p.change_rate,
     p.account_type, p.is_new?'신규':'계속'].join(',')
  ).join('\n');
  const blob = new Blob(['\uFEFF'+header+rows], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `재정사업_${today()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function saveChartPNG(canvasId, filename) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const link = document.createElement('a');
  link.download = `${filename || canvasId}_${today()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

window.EX = { ensureXLSX, exportExcel, exportMarkdown, exportInquiryMarkdown, exportCSV, saveChartPNG };
