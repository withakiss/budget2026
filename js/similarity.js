/**
 * 재정사업 유사성 분석 엔진 v2.0
 * 알고리즘: Jaccard, Cosine, Dice, Overlap, TF-IDF, BM25, Hybrid, 다차원 가중합
 */

// ═══════════════════════════════════════════════════════
//  한국어 불용어 & 토크나이저
// ═══════════════════════════════════════════════════════
const STOPWORDS = new Set([
  '의','을','를','이','가','은','는','에','서','와','과','도','로','으로',
  '및','등','에서','에게','에서의','으로의','부터','까지','보다','에도',
  '사업','지원','개발','운영','구축','추진','활성화','강화','개선','확대',
  '연구','기술','서비스','시스템','관리','육성','보급','확산','혁신',
  '위한','통한','대한','관한','위하여','하여','되는','있는','하는',
  '공공','국가','정부','중앙','지방','광역','기반','체계','제도',
]);

function tokenize(text) {
  if (!text) return [];
  return text
    .replace(/[^\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F\w\s]/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !STOPWORDS.has(t));
}

function getProjectText(p, mode = 'full') {
  if (mode === 'name') return p.project_name || '';
  return [
    p.project_name, p.program, p.description || '',
    (p.sub_projects || []).map(s => s.name).join(' ')
  ].join(' ');
}

// ═══════════════════════════════════════════════════════
//  기본 유사도 알고리즘
// ═══════════════════════════════════════════════════════
function jaccard(setA, setB) {
  const a = new Set(setA), b = new Set(setB);
  const inter = [...a].filter(x => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

function cosineTokens(tokensA, tokensB) {
  const freqA = {}, freqB = {};
  tokensA.forEach(t => freqA[t] = (freqA[t] || 0) + 1);
  tokensB.forEach(t => freqB[t] = (freqB[t] || 0) + 1);
  const allTerms = new Set([...Object.keys(freqA), ...Object.keys(freqB)]);
  let dot = 0, normA = 0, normB = 0;
  allTerms.forEach(t => {
    const a = freqA[t] || 0, b = freqB[t] || 0;
    dot += a * b; normA += a * a; normB += b * b;
  });
  return (normA === 0 || normB === 0) ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function dice(setA, setB) {
  const a = new Set(setA), b = new Set(setB);
  const inter = [...a].filter(x => b.has(x)).length;
  return (a.size + b.size) === 0 ? 0 : (2 * inter) / (a.size + b.size);
}

function overlap(setA, setB) {
  const a = new Set(setA), b = new Set(setB);
  const inter = [...a].filter(x => b.has(x)).length;
  const minSize = Math.min(a.size, b.size);
  return minSize === 0 ? 0 : inter / minSize;
}

function hybrid(tokA, tokB) {
  return 0.5 * jaccard(tokA, tokB) + 0.5 * cosineTokens(tokA, tokB);
}

// ═══════════════════════════════════════════════════════
//  TF-IDF 엔진
// ═══════════════════════════════════════════════════════
class TFIDFEngine {
  constructor(documents) {
    this.docs = documents;
    this.N = documents.length;
    this.df = {};   // document frequency
    this.tfidf = []; // tfidf vectors
    this._build();
  }

  _build() {
    // 1. Document frequency
    this.docs.forEach(tokens => {
      const unique = new Set(tokens);
      unique.forEach(t => { this.df[t] = (this.df[t] || 0) + 1; });
    });
    // 2. TF-IDF vectors
    this.tfidf = this.docs.map(tokens => {
      const tf = {};
      tokens.forEach(t => { tf[t] = (tf[t] || 0) + 1; });
      const vec = {};
      Object.entries(tf).forEach(([t, freq]) => {
        const idf = Math.log((this.N + 1) / ((this.df[t] || 0) + 1)) + 1;
        vec[t] = (freq / tokens.length) * idf;
      });
      return vec;
    });
  }

  cosine(idxA, idxB) {
    const a = this.tfidf[idxA], b = this.tfidf[idxB];
    const allTerms = new Set([...Object.keys(a), ...Object.keys(b)]);
    let dot = 0, normA = 0, normB = 0;
    allTerms.forEach(t => {
      const va = a[t] || 0, vb = b[t] || 0;
      dot += va * vb; normA += va * va; normB += vb * vb;
    });
    return (normA === 0 || normB === 0) ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  query(queryTokens) {
    // query TF-IDF vector
    const tf = {};
    queryTokens.forEach(t => { tf[t] = (tf[t] || 0) + 1; });
    const qVec = {};
    Object.entries(tf).forEach(([t, freq]) => {
      const idf = Math.log((this.N + 1) / ((this.df[t] || 0) + 1)) + 1;
      qVec[t] = (freq / queryTokens.length) * idf;
    });
    return this.tfidf.map((dVec, i) => {
      const allTerms = new Set([...Object.keys(qVec), ...Object.keys(dVec)]);
      let dot = 0, normQ = 0, normD = 0;
      allTerms.forEach(t => {
        const q = qVec[t] || 0, d = dVec[t] || 0;
        dot += q * d; normQ += q * q; normD += d * d;
      });
      const score = (normQ === 0 || normD === 0) ? 0 : dot / (Math.sqrt(normQ) * Math.sqrt(normD));
      return { index: i, score };
    }).sort((a, b) => b.score - a.score);
  }
}

// ═══════════════════════════════════════════════════════
//  BM25 엔진 (KAIB2026에 없던 신규 알고리즘)
// ═══════════════════════════════════════════════════════
class BM25Engine {
  constructor(documents, k1 = 1.5, b = 0.75) {
    this.docs = documents;
    this.k1 = k1;
    this.b = b;
    this.N = documents.length;
    this.avgDL = documents.reduce((s, d) => s + d.length, 0) / this.N || 1;
    this.df = {};
    documents.forEach(tokens => {
      new Set(tokens).forEach(t => { this.df[t] = (this.df[t] || 0) + 1; });
    });
  }

  score(queryTokens, docIdx) {
    const doc = this.docs[docIdx];
    const dl = doc.length;
    const tf = {};
    doc.forEach(t => { tf[t] = (tf[t] || 0) + 1; });
    let score = 0;
    queryTokens.forEach(t => {
      const f = tf[t] || 0;
      if (f === 0) return;
      const idf = Math.log((this.N - (this.df[t] || 0) + 0.5) / ((this.df[t] || 0) + 0.5) + 1);
      const num = f * (this.k1 + 1);
      const den = f + this.k1 * (1 - this.b + this.b * dl / this.avgDL);
      score += idf * (num / den);
    });
    return score;
  }

  // BM25 기반 문서 간 유사도 (0~1 정규화)
  similarity(idxA, idxB) {
    const sAB = this.score(this.docs[idxA], idxB);
    const sBA = this.score(this.docs[idxB], idxA);
    const sAA = this.score(this.docs[idxA], idxA) || 1;
    const sBB = this.score(this.docs[idxB], idxB) || 1;
    return Math.sqrt((sAB / sAA) * (sBA / sBB));
  }
}

// ═══════════════════════════════════════════════════════
//  다차원 유사도 (KAIB2026 하이브리드 방식 확장)
//  차원: 텍스트(TF-IDF), 구조(BM25), Jaccard, 예산규모, 기능분야, 부처간, 법적근거
// ═══════════════════════════════════════════════════════
const PROFILES = {
  default:  { text: 0.30, bm25: 0.15, jaccard: 0.15, func: 0.20, budget: 0.10, ministry: 0.05, legal: 0.05 },
  rnd:      { text: 0.25, bm25: 0.20, jaccard: 0.15, func: 0.15, budget: 0.15, ministry: 0.05, legal: 0.05 },
  welfare:  { text: 0.25, bm25: 0.10, jaccard: 0.15, func: 0.25, budget: 0.15, ministry: 0.05, legal: 0.05 },
  infra:    { text: 0.20, bm25: 0.15, jaccard: 0.15, func: 0.20, budget: 0.20, ministry: 0.05, legal: 0.05 },
  digital:  { text: 0.30, bm25: 0.20, jaccard: 0.20, func: 0.15, budget: 0.05, ministry: 0.05, legal: 0.05 },
  training: { text: 0.25, bm25: 0.15, jaccard: 0.20, func: 0.20, budget: 0.10, ministry: 0.05, legal: 0.05 },
};

function budgetScaleSim(a, b) {
  const max = Math.max(a.budget_2026, b.budget_2026);
  const min = Math.min(a.budget_2026, b.budget_2026);
  return max === 0 ? 1 : min / max;
}

function funcSim(a, b) {
  if (a.function === b.function) return 1.0;
  if (a.function_code && b.function_code) {
    // 같은 대분류(첫 자리)면 0.5
    if (a.function_code[0] === b.function_code[0]) return 0.5;
  }
  return 0.0;
}

function legaSim(a, b) {
  if (!a.legal_basis || !b.legal_basis) return 0;
  const tokA = tokenize(a.legal_basis), tokB = tokenize(b.legal_basis);
  return jaccard(tokA, tokB);
}

// 5단계 등급 분류
function gradeScore(score) {
  if (score >= 0.85) return { grade: 1, label: '완전중복', color: '#ef4444' };
  if (score >= 0.70) return { grade: 2, label: '고유사',   color: '#f97316' };
  if (score >= 0.50) return { grade: 3, label: '부분중복', color: '#f59e0b' };
  if (score >= 0.30) return { grade: 4, label: '약유사',   color: '#84cc16' };
  return                    { grade: 5, label: '비유사',   color: '#94a3b8' };
}

// ═══════════════════════════════════════════════════════
//  Value Chain 협업 패턴 (KAIB2026 참고 + 확장)
// ═══════════════════════════════════════════════════════
const VALUE_CHAIN_PATTERNS = [
  { name: 'R&D → 실증 → 사업화',    from: ['R&D'],    to: ['정보화','일반'], keywords: ['연구','개발','기술'], linkage: 3 },
  { name: '인프라 → 서비스',        from: ['정보화'],  to: ['일반'],         keywords: ['구축','플랫폼','시스템'], linkage: 2 },
  { name: '인력양성 → 산업체',      from: ['일반'],    to: ['일반','R&D'],   keywords: ['인력','교육','훈련','양성'], linkage: 2 },
  { name: '데이터 구축 → 활용',     from: ['정보화'],  to: ['R&D','일반'],   keywords: ['데이터','AI','분석'], linkage: 3 },
  { name: '기반기술 → 도메인 적용', from: ['R&D'],    to: ['R&D'],          keywords: ['기초','원천','핵심'], linkage: 2 },
];

function detectValueChain(projA, projB) {
  let maxScore = 0;
  let bestPattern = null;
  VALUE_CHAIN_PATTERNS.forEach(pat => {
    const aIsFrom = pat.from.includes(projA.project_type);
    const bIsTo   = pat.to.includes(projB.project_type);
    if (!aIsFrom || !bIsTo) return;
    const textAB = (projA.project_name + ' ' + (projA.description || '')).toLowerCase();
    const textBB = (projB.project_name + ' ' + (projB.description || '')).toLowerCase();
    const kwMatch = pat.keywords.filter(k => textAB.includes(k) || textBB.includes(k)).length;
    if (kwMatch === 0) return;
    const score = (kwMatch / pat.keywords.length) * pat.linkage / 3;
    if (score > maxScore) { maxScore = score; bestPattern = pat.name; }
  });
  return { score: maxScore, pattern: bestPattern };
}

// ═══════════════════════════════════════════════════════
//  클러스터링 (DBSCAN-like, 에너지 기반)
// ═══════════════════════════════════════════════════════
function clusterProjects(pairs, allProjects, threshold = 0.5) {
  const adj = {};
  allProjects.forEach(p => { adj[p.id] = []; });
  pairs.filter(p => p.score >= threshold).forEach(({ idA, idB }) => {
    adj[idA].push(idB);
    adj[idB].push(idA);
  });

  const visited = new Set();
  const clusters = [];

  allProjects.forEach(p => {
    if (visited.has(p.id) || adj[p.id].length === 0) return;
    const cluster = [];
    const queue = [p.id];
    while (queue.length > 0) {
      const cur = queue.shift();
      if (visited.has(cur)) continue;
      visited.add(cur);
      cluster.push(cur);
      adj[cur].forEach(nb => { if (!visited.has(nb)) queue.push(nb); });
    }
    if (cluster.length >= 2) clusters.push(cluster);
  });

  return clusters.map(c => ({
    members: c.map(id => allProjects.find(p => p.id === id)).filter(Boolean),
    ministries: [...new Set(c.map(id => allProjects.find(p => p.id === id)?.ministry).filter(Boolean))],
    totalBudget: c.reduce((s, id) => s + (allProjects.find(p => p.id === id)?.budget_2026 || 0), 0),
  }));
}

// ═══════════════════════════════════════════════════════
//  HHI 예산집중도 분석
// ═══════════════════════════════════════════════════════
function calcHHI(projects, groupKey) {
  const groups = {};
  const total = projects.reduce((s, p) => s + p.budget_2026, 0);
  projects.forEach(p => {
    const k = p[groupKey] || '기타';
    groups[k] = (groups[k] || 0) + p.budget_2026;
  });
  const hhi = Object.values(groups).reduce((s, v) => {
    const share = v / total;
    return s + share * share;
  }, 0);
  return { hhi: Math.round(hhi * 10000), groups, total };
}

// ═══════════════════════════════════════════════════════
//  낭비 리스크 스코어 (신규)
// ═══════════════════════════════════════════════════════
function calcWasteRisk(project, allProjects) {
  let risk = 0;
  const reasons = [];

  // 1. 급격한 증감 (±80% 이상)
  if (!project.is_new && Math.abs(project.change_rate) >= 80) {
    risk += 25;
    reasons.push(`급격한 예산 변동 (${project.change_rate.toFixed(1)}%)`);
  }

  // 2. 요구액 대비 편성액 크게 삭감
  if (project.budget_requested && project.budget_2026) {
    const cutRate = (project.budget_requested - project.budget_2026) / project.budget_requested;
    if (cutRate > 0.3) {
      risk += 20;
      reasons.push(`요구액 대비 ${(cutRate * 100).toFixed(0)}% 삭감`);
    }
  }

  // 3. 내역사업 집중도 (단일 내역사업 비중 >70%)
  if (project.sub_projects && project.sub_projects.length > 0) {
    const maxSub = Math.max(...project.sub_projects.map(s => s.budget));
    const totalSub = project.sub_projects.reduce((s, x) => s + x.budget, 0);
    if (totalSub > 0 && maxSub / totalSub > 0.7) {
      risk += 15;
      reasons.push('내역사업 예산 편중 심화');
    }
  }

  // 4. 동일 기능 내 유사 사업 다수
  const sameFuncCount = allProjects.filter(p =>
    p.id !== project.id &&
    p.function === project.function &&
    p.project_type === project.project_type
  ).length;
  if (sameFuncCount >= 3) {
    risk += 15;
    reasons.push(`동일 분야 유사 사업 ${sameFuncCount}개 존재`);
  }

  // 5. 신규 사업 대규모 (>500억)
  if (project.is_new && project.budget_2026 > 50000) {
    risk += 20;
    reasons.push(`신규 대규모 사업 (${(project.budget_2026/10000).toFixed(1)}억원)`);
  }

  return { score: Math.min(risk, 100), reasons };
}

// ═══════════════════════════════════════════════════════
//  전체 분석 실행기
// ═══════════════════════════════════════════════════════
class AnalysisEngine {
  constructor(projects) {
    this.projects = projects;
    this.tokens = projects.map(p => tokenize(getProjectText(p, 'full')));
    this.tfidf = new TFIDFEngine(this.tokens);
    this.bm25 = new BM25Engine(this.tokens);
    this._pairs = null;
  }

  // 전체 N×N 유사도 계산 (Web Worker 없이 청크 처리)
  async computeAllPairs(profileName = 'default', onProgress = null) {
    const w = PROFILES[profileName] || PROFILES.default;
    const n = this.projects.length;
    const pairs = [];
    const total = n * (n - 1) / 2;
    let done = 0;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = this.projects[i], b = this.projects[j];
        const tA = this.tokens[i], tB = this.tokens[j];

        const textScore  = this.tfidf.cosine(i, j);
        const bm25Score  = this.bm25.similarity(i, j);
        const jaccScore  = jaccard(tA, tB);
        const funcScore  = funcSim(a, b);
        const budgScore  = budgetScaleSim(a, b);
        const minScore   = a.ministry !== b.ministry ? 0.5 : 1.0; // 부처 간 교차 보너스 역할
        const legalScore = legaSim(a, b);

        const score = (
          w.text     * textScore  +
          w.bm25     * bm25Score  +
          w.jaccard  * jaccScore  +
          w.func     * funcScore  +
          w.budget   * budgScore  +
          w.ministry * (1 - minScore) + // 교차부처일수록 높게
          w.legal    * legalScore
        );

        const vc = detectValueChain(a, b);

        pairs.push({
          idA: a.id, idB: b.id, a, b,
          score: Math.min(score, 1),
          textScore, bm25Score, jaccScore, funcScore,
          crossMinistry: a.ministry !== b.ministry,
          valueChain: vc,
          ...gradeScore(score),
        });

        done++;
        if (onProgress && done % 50 === 0) {
          onProgress(Math.round(done / total * 100));
          await new Promise(r => setTimeout(r, 0)); // yield to UI
        }
      }
    }

    this._pairs = pairs.sort((a, b) => b.score - a.score);
    return this._pairs;
  }

  getClusters(threshold = 0.5) {
    if (!this._pairs) return [];
    return clusterProjects(this._pairs, this.projects, threshold);
  }

  getWasteRisks() {
    return this.projects
      .map(p => ({ project: p, ...calcWasteRisk(p, this.projects) }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  getHHI(groupKey) {
    return calcHHI(this.projects, groupKey);
  }

  search(query, algorithm = 'tfidf', topN = 20) {
    const qTokens = tokenize(query);
    if (qTokens.length === 0) return [];

    if (algorithm === 'bm25') {
      return this.projects
        .map((p, i) => ({ project: p, score: this.bm25.score(qTokens, i) }))
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topN);
    }

    if (algorithm === 'tfidf') {
      return this.tfidf.query(qTokens)
        .slice(0, topN)
        .filter(r => r.score > 0)
        .map(r => ({ project: this.projects[r.index], score: r.score }));
    }

    // hybrid
    return this.projects.map((p, i) => {
      const toks = this.tokens[i];
      const score = hybrid(qTokens, toks);
      return { project: p, score };
    }).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, topN);
  }
}

// export
window.SimilarityEngine = {
  AnalysisEngine, TFIDFEngine, BM25Engine,
  jaccard, cosineTokens, dice, overlap, hybrid,
  tokenize, getProjectText, gradeScore,
  calcHHI, calcWasteRisk, detectValueChain, clusterProjects,
  PROFILES,
};
