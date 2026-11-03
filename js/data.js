/* =========================================================
 * data.js — カテゴリ・質問・判定ロジック（DOMに依存しない純粋な処理）
 * ========================================================= */

const CATEGORIES = [
  { id: 'clothes', label: '服・ファッション', mark: '服' },
  { id: 'books', label: '本・書類', mark: '本' },
  { id: 'kitchen', label: 'キッチン用品', mark: '台' },
  { id: 'gadget', label: '家電・ガジェット', mark: '電' },
  { id: 'hobby', label: '趣味・コレクション', mark: '趣' },
  { id: 'memory', label: '思い出の品', mark: '想' },
  { id: 'daily', label: '日用品・その他', mark: '他' },
];

/**
 * 質問と配点。
 * score: 加点（残す寄り）/ 減点（手放す寄り）
 * reason: 判定理由として表示する文（点数の大きい選択肢にだけ付ける）
 * flag: 判定の補正に使う目印
 */
const QUESTIONS = [
  {
    id: 'lastUsed',
    q: '最後に使ったのはいつ？',
    hint: '着た・読んだ・飾ったなども「使った」に含めます。',
    options: [
      { label: '1ヶ月以内', score: 3, reason: '最近使っている' },
      { label: '半年以内', score: 1 },
      { label: '1年以内', score: -1 },
      { label: '1年以上前', score: -3, reason: '1年以上使っていない' },
      { label: '覚えていない', score: -3, reason: '最後に使った時を覚えていない' },
    ],
  },
  {
    id: 'condition',
    q: '今の状態は？',
    options: [
      { label: '問題なく使える', score: 1 },
      { label: '少し傷み・汚れがある', score: -1 },
      { label: '壊れている・サイズが合わない', score: -4, reason: 'そのままでは使えない', flag: 'broken' },
    ],
  },
  {
    id: 'duplicate',
    q: '同じ役割の物を他にも持っている？',
    options: [
      { label: 'これしかない', score: 2, reason: '代わりになる物がない' },
      { label: '似た物が1つある', score: -1 },
      { label: '似た物が2つ以上ある', score: -3, reason: '同じ役割の物が他にもある' },
    ],
  },
  {
    id: 'rebuy',
    q: '今日お店で見かけたら、また買う？',
    hint: '値段も、今の暮らしに合うかも考えて答えてみてください。',
    options: [
      { label: '迷わず買う', score: 3, reason: '今でも買いたいと思える' },
      { label: '迷う', score: 0 },
      { label: '買わない', score: -3, reason: '今なら買わない' },
    ],
  },
  {
    id: 'feeling',
    q: '手に取ったとき、どんな気持ち？',
    options: [
      { label: 'うれしい・気分が上がる', score: 2, reason: '持っていてうれしい' },
      { label: '特に何も感じない', score: -1 },
      { label: '罪悪感・負担を感じる', score: -2, reason: '持っていることが負担になっている' },
    ],
  },
  {
    id: 'reasonKeep',
    q: '残したい一番の理由は？',
    options: [
      { label: '今の暮らしで使っている', score: 2, reason: '今の暮らしで使っている' },
      { label: 'いつか使うかもしれない', score: -2, reason: '「いつか使う」が理由になっている' },
      { label: '高かった・もったいない', score: -2, reason: '残す理由が値段になっている' },
      { label: 'もらい物で気が引ける', score: -1 },
      { label: '特に理由はない', score: -2, reason: '残す理由が見当たらない' },
    ],
  },
  {
    id: 'memory',
    q: '代わりのきかない思い出がある？',
    options: [
      { label: '強い思い出がある', score: 3, reason: '代わりのきかない思い出がある', flag: 'memory' },
      { label: '少しある', score: 1 },
      { label: '特にない', score: 0 },
    ],
  },
  {
    id: 'replace',
    q: '手放した後に必要になったら？',
    options: [
      { label: 'すぐ・安く手に入る', score: -1 },
      { label: '借りたり代用したりできる', score: -1 },
      { label: '二度と手に入らない', score: 2, reason: 'もう手に入らない' },
    ],
  },
];

/** 判定のしきい値 */
const SCORE_KEEP = 4;     // これ以上で「残す」
const SCORE_DISCARD = -3; // これ以下で「手放す」
const SCORE_MAX = QUESTIONS.reduce((s, q) => s + Math.max(...q.options.map(o => o.score)), 0);
const SCORE_MIN = QUESTIONS.reduce((s, q) => s + Math.min(...q.options.map(o => o.score)), 0);

const VERDICTS = {
  keep: { label: '残す', desc: '今の暮らしに必要な物です。気持ちよく使える場所に置きましょう。' },
  hold: { label: '保留', desc: '今は決めきれない物です。期限を決めて、もう一度判定しましょう。' },
  discard: { label: '手放す', desc: '手放しても困らない可能性が高い物です。' },
};

/**
 * 回答から判定する
 * @param {Object<string, number>} answers 質問ID → 選んだ選択肢の番号
 * @returns {{score:number, verdict:'keep'|'hold'|'discard', reasons:{text:string,score:number}[], note:string, flags:string[]}}
 */
function judgeItem(answers) {
  let score = 0;
  const picked = [];
  const flags = new Set();

  QUESTIONS.forEach(q => {
    const i = answers[q.id];
    if (i == null || !q.options[i]) return;
    const o = q.options[i];
    score += o.score;
    if (o.flag) flags.add(o.flag);
    if (o.reason) picked.push({ text: o.reason, score: o.score });
  });

  let verdict = score >= SCORE_KEEP ? 'keep' : score <= SCORE_DISCARD ? 'discard' : 'hold';
  let note = '';

  // 補正1：思い出の品はいきなり「手放す」にしない
  if (flags.has('memory') && verdict === 'discard') {
    verdict = 'hold';
    note = '思い出のある物なので、すぐには「手放す」にしていません。写真に撮って残してから手放す方法もあります。';
  // 補正2：使えない物は「残す」にしない
  } else if (flags.has('broken') && !flags.has('memory') && verdict === 'keep') {
    verdict = 'hold';
    note = '今のままでは使えない状態です。修理や直しの予定を決められないなら、手放すことも考えてみてください。';
  } else if (verdict === 'hold') {
    note = '期限を決めて保留にしましょう。期限までに一度も使わなければ、手放す目安になります。';
  }

  const byWeight = (a, b) => Math.abs(b.score) - Math.abs(a.score);
  const dir = verdict === 'keep' ? 1 : verdict === 'discard' ? -1 : 0;
  let reasons;
  if (dir === 0) {
    // 保留は「残す理由」と「手放す理由」を両方見せる
    const plus = picked.filter(p => p.score > 0).sort(byWeight).slice(0, 2);
    const minus = picked.filter(p => p.score < 0).sort(byWeight).slice(0, 2);
    reasons = [...plus, ...minus];
  } else {
    reasons = picked.filter(p => Math.sign(p.score) === dir).sort(byWeight).slice(0, 3);
  }
  if (!reasons.length) reasons = [...picked].sort(byWeight).slice(0, 3);

  return { score, verdict, reasons, note, flags: [...flags] };
}

if (typeof module !== 'undefined') {
  module.exports = { CATEGORIES, QUESTIONS, VERDICTS, SCORE_KEEP, SCORE_DISCARD, SCORE_MAX, SCORE_MIN, judgeItem };
}
