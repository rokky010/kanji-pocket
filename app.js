// app.js
// 漢字ポケット - アプリロジック
// 保存は localStorage のみ（サーバー通信なし）

const STORAGE_KEY = "kanjiPocket.progress.v1";

/* ------------------------------------------------------------
   進捗データの読み書き
   構造: { [questionId]: "○" | "△" | "✕" }
------------------------------------------------------------ */
function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error("進捗の読み込みに失敗しました", e);
    return {};
  }
}

function saveProgress(progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch (e) {
    console.error("進捗の保存に失敗しました", e);
  }
}

let progress = loadProgress();

/* ------------------------------------------------------------
   状態
------------------------------------------------------------ */
let selectedRoundKey = "all";   // "all" または round番号
let currentQueue = [];          // 出題中の配列（シャッフル済み questionオブジェクト）
let currentIndex = 0;
let currentSessionResults = []; // このセッションで付けた {id, grade} の記録
let revealed = false;

/* ------------------------------------------------------------
   ユーティリティ
------------------------------------------------------------ */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getQuestionsForKey(key) {
  if (key === "all") return QUESTIONS.slice();
  return QUESTIONS.filter(q => q.round === key);
}

function countByRound(round) {
  const qs = QUESTIONS.filter(q => q.round === round);
  const counts = { "○": 0, "△": 0, "✕": 0, none: 0 };
  qs.forEach(q => {
    const g = progress[q.id];
    if (g === "○" || g === "△" || g === "✕") counts[g]++;
    else counts.none++;
  });
  return { total: qs.length, ...counts };
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

/* ------------------------------------------------------------
   時計（ステータスバーの見た目用）
------------------------------------------------------------ */
function updateClock() {
  const el = document.getElementById("clock");
  if (!el) return;
  const now = new Date();
  const h = now.getHours().toString().padStart(2, "0");
  const m = now.getMinutes().toString().padStart(2, "0");
  el.textContent = `${h}:${m}`;
}
updateClock();
setInterval(updateClock, 15000);

/* ==============================================================
   ホーム画面
============================================================== */
function renderHome() {
  const list = document.getElementById("round-list");
  list.innerHTML = "";

  ROUNDS.forEach(r => {
    const c = countByRound(r.round);
    const first = QUESTIONS.find(q => q.round === r.round);
    const qs = QUESTIONS.filter(q => q.round === r.round);
    const last = qs[qs.length - 1];

    const card = document.createElement("button");
    card.type = "button";
    card.className = "round-card" + (selectedRoundKey === r.round ? " selected" : "");
    card.innerHTML = `
      <div class="round-card-badge">${r.label.replace("第", "").replace("回", "")}<br></div>
      <div class="round-card-body">
        <div class="round-card-title">${r.label}（全${c.total}問）</div>
        <div class="round-card-range">${first.kana} 〜 ${last.kana}</div>
        <div class="round-card-stats">
          ${c["○"] ? `<span class="stat-pill stat-good">○ ${c["○"]}</span>` : ""}
          ${c["△"] ? `<span class="stat-pill stat-mid">△ ${c["△"]}</span>` : ""}
          ${c["✕"] ? `<span class="stat-pill stat-bad">✕ ${c["✕"]}</span>` : ""}
          ${c.none === c.total ? `<span class="stat-pill stat-none">未挑戦</span>` : ""}
        </div>
      </div>
    `;
    card.addEventListener("click", () => {
      selectedRoundKey = r.round;
      renderHome();
    });
    list.appendChild(card);
  });

  // すべての回カード
  const allCard = document.createElement("button");
  allCard.type = "button";
  allCard.className = "round-card round-card--all" + (selectedRoundKey === "all" ? " selected" : "");
  allCard.innerHTML = `
    <div class="round-card-badge">全</div>
    <div class="round-card-body">
      <div class="round-card-title">すべての回（全${QUESTIONS.length}問）</div>
      <div class="round-card-range">第5回〜第8回をまとめて</div>
    </div>
  `;
  allCard.addEventListener("click", () => {
    selectedRoundKey = "all";
    renderHome();
  });
  list.appendChild(allCard);
}

document.getElementById("btn-start").addEventListener("click", () => {
  startQuiz(getQuestionsForKey(selectedRoundKey), true);
});

document.getElementById("btn-review").addEventListener("click", () => {
  openReview(selectedRoundKey === "all" ? ROUNDS[0].round : selectedRoundKey);
});

/* ==============================================================
   クイズ画面
============================================================== */
function startQuiz(questions, doShuffle) {
  currentQueue = doShuffle ? shuffle(questions) : questions.slice();
  currentIndex = 0;
  currentSessionResults = [];
  showScreen("screen-quiz");
  renderCard();
}

function currentRoundLabelFor(q) {
  const r = ROUNDS.find(r => r.round === q.round);
  return r ? r.label : "";
}

function renderCard() {
  revealed = false;
  const q = currentQueue[currentIndex];

  document.getElementById("card-kana").textContent = q.kana;
  document.getElementById("quiz-round-badge").textContent = currentRoundLabelFor(q);

  // 進捗バー
  const pct = Math.round((currentIndex / currentQueue.length) * 100);
  document.getElementById("quiz-progress-fill").style.width = pct + "%";
  document.getElementById("quiz-progress-text").textContent =
    `${currentIndex + 1} / ${currentQueue.length}`;

  // 文（空欄状態）
  const [before, after] = q.sentence.split("{blank}");
  const sentenceEl = document.getElementById("card-sentence");
  sentenceEl.innerHTML = `${before}<span class="blank">＿＿＿＿</span>${after}`;

  // 答えエリアをリセット
  const answerArea = document.getElementById("card-answer-area");
  answerArea.innerHTML = `<button class="btn btn-reveal" id="btn-reveal">こたえを見る</button>`;
  document.getElementById("btn-reveal").addEventListener("click", revealAnswer);

  document.getElementById("grade-bar").classList.add("hidden");
}

function revealAnswer() {
  if (revealed) return;
  revealed = true;
  const q = currentQueue[currentIndex];

  const [before, after] = q.sentence.split("{blank}");
  const sentenceEl = document.getElementById("card-sentence");
  sentenceEl.innerHTML = `${before}<span class="answer-kanji">${q.answer}</span>${after}`;

  const answerArea = document.getElementById("card-answer-area");
  answerArea.innerHTML = `
    <div class="card-yomi">${q.yomi}</div>
    <div class="card-hint"><b>ヒント：</b>${q.hint}</div>
  `;

  document.getElementById("grade-bar").classList.remove("hidden");
}

document.querySelectorAll(".grade-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (!revealed) return;
    const grade = btn.getAttribute("data-grade");
    const q = currentQueue[currentIndex];
    progress[q.id] = grade;
    saveProgress(progress);
    currentSessionResults.push({ id: q.id, grade });

    if (currentIndex < currentQueue.length - 1) {
      currentIndex++;
      renderCard();
    } else {
      showResult();
    }
  });
});

document.getElementById("btn-quiz-back").addEventListener("click", () => {
  const ok = confirm("クイズを中断してホームにもどりますか？\n（ここまでの結果は保存されています）");
  if (ok) {
    renderHome();
    showScreen("screen-home");
  }
});

/* ==============================================================
   結果画面
============================================================== */
function showResult() {
  const counts = { "○": 0, "△": 0, "✕": 0 };
  currentSessionResults.forEach(r => counts[r.grade]++);

  const roundsInQueue = [...new Set(currentQueue.map(q => q.round))];
  const label = roundsInQueue.length === 1
    ? ROUNDS.find(r => r.round === roundsInQueue[0]).label
    : "すべての回";

  document.getElementById("result-sub").textContent = `${label}・全${currentQueue.length}問の結果`;

  document.getElementById("result-summary").innerHTML = `
    <div class="summary-box stat-good" style="background:var(--good-bg);color:var(--good);">
      <span class="num">${counts["○"]}</span><span class="lbl">○ わかった</span>
    </div>
    <div class="summary-box" style="background:var(--mid-bg);color:var(--mid);">
      <span class="num">${counts["△"]}</span><span class="lbl">△ あやしい</span>
    </div>
    <div class="summary-box" style="background:var(--bad-bg);color:var(--bad);">
      <span class="num">${counts["✕"]}</span><span class="lbl">✕ わからない</span>
    </div>
  `;

  const listEl = document.getElementById("result-list");
  listEl.innerHTML = "";
  currentQueue.forEach(q => {
    const g = progress[q.id] || "";
    const row = document.createElement("div");
    row.className = "result-row";
    row.innerHTML = `
      <div class="result-row-mark" style="${markStyle(g)}">${g}</div>
      <div class="result-row-body">
        <div class="result-row-kana">${q.kana}（${currentRoundLabelFor(q)}）</div>
        <div class="result-row-answer">${q.answer}<span style="color:var(--ink-soft);font-weight:600;font-size:12px;"> ${q.yomi}</span></div>
      </div>
    `;
    listEl.appendChild(row);
  });

  showScreen("screen-result");
}

function markStyle(g) {
  if (g === "○") return "background:var(--good-bg);color:var(--good);";
  if (g === "△") return "background:var(--mid-bg);color:var(--mid);";
  if (g === "✕") return "background:var(--bad-bg);color:var(--bad);";
  return "background:#EFEAE0;color:var(--ink-soft);";
}

document.getElementById("btn-retry").addEventListener("click", () => {
  // 同じ問題セットをランダムな順番でもう一度
  startQuiz(currentQueue, true);
});

document.getElementById("btn-home-from-result").addEventListener("click", () => {
  renderHome();
  showScreen("screen-home");
});

/* ==============================================================
   一覧（見直し）画面
============================================================== */
let reviewRoundKey = 5;

function openReview(initialKey) {
  reviewRoundKey = initialKey;
  renderReviewTabs();
  renderReviewList();
  showScreen("screen-review");
}

function renderReviewTabs() {
  const tabs = document.getElementById("review-tabs");
  tabs.innerHTML = "";

  const keys = [...ROUNDS.map(r => r.round), "all"];
  keys.forEach(key => {
    const label = key === "all" ? "すべて" : ROUNDS.find(r => r.round === key).label;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "review-tab" + (reviewRoundKey === key ? " active" : "");
    btn.textContent = label;
    btn.addEventListener("click", () => {
      reviewRoundKey = key;
      renderReviewTabs();
      renderReviewList();
    });
    tabs.appendChild(btn);
  });
}

function renderReviewList() {
  const listEl = document.getElementById("review-list");
  listEl.innerHTML = "";

  const qs = reviewRoundKey === "all"
    ? QUESTIONS.slice()
    : QUESTIONS.filter(q => q.round === reviewRoundKey);

  const answered = qs.filter(q => progress[q.id]);

  if (answered.length === 0) {
    listEl.innerHTML = `<div class="review-empty">まだこの回の記録がありません。<br>ホームから挑戦してみましょう！</div>`;
    return;
  }

  qs.forEach(q => {
    const g = progress[q.id];
    if (!g) return;
    const row = document.createElement("div");
    row.className = "result-row";
    row.innerHTML = `
      <div class="result-row-mark" style="${markStyle(g)}">${g}</div>
      <div class="result-row-body">
        <div class="result-row-kana">${q.kana}（${currentRoundLabelFor(q)}）</div>
        <div class="result-row-answer">${q.answer}<span style="color:var(--ink-soft);font-weight:600;font-size:12px;"> ${q.yomi}</span></div>
        <div style="font-size:11.5px;color:var(--ink-soft);margin-top:4px;">${q.sentence.replace("{blank}", q.answer)}</div>
      </div>
    `;
    listEl.appendChild(row);
  });
}

document.getElementById("btn-review-back").addEventListener("click", () => {
  renderHome();
  showScreen("screen-home");
});

/* ==============================================================
   初期化
============================================================== */
renderHome();
showScreen("screen-home");
