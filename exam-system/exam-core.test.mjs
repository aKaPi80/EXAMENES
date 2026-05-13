import assert from 'node:assert/strict';
import {
  calculateEvaluationSummary,
  buildPrintableEvaluation,
  normalizeToken,
  validateExamDraft,
} from './exam-core.mjs';

const summary = calculateEvaluationSummary([
  { technique_name: 'Uchi uke zuki', score: 10, notes: 'Buen control' },
  { technique_name: 'Tenshin geri', score: 5, notes: 'Falta distancia' },
  { technique_name: 'Yori nuki', score: 0, notes: '' },
], 65);

assert.equal(summary.totalScore, 15);
assert.equal(summary.maxScore, 30);
assert.equal(summary.percentage, 50);
assert.equal(summary.passed, false);

const passing = calculateEvaluationSummary([
  { technique_name: 'Uchi uke zuki', score: 10 },
  { technique_name: 'Tenshin geri', score: 10 },
], 90);

assert.equal(passing.percentage, 100);
assert.equal(passing.passed, true);

const skipped = calculateEvaluationSummary([
  { technique_name: 'Uchi uke zuki', score: 10 },
  { technique_name: 'Tenshin geri', skipped: true, score: null },
  { technique_name: 'Yori nuki', score: 5 },
], 70);

assert.equal(skipped.totalScore, 15);
assert.equal(skipped.maxScore, 20);
assert.equal(skipped.percentage, 75);
assert.equal(skipped.passed, true);

assert.match(normalizeToken(), /^[a-f0-9]{32}$/);
assert.equal(validateExamDraft({
  title: '',
  grade: '3kyu',
  techniques: ['Soto uke zuki'],
  students: [{ student_name: 'Ane', order_number: 1 }],
  examiners: [{ name: 'Sensei', email: 'sensei@example.com' }],
}).valid, false);

assert.equal(validateExamDraft({
  title: 'Examen 3 KYU',
  grade: '3kyu',
  techniques: ['Soto uke zuki'],
  students: [{ student_name: 'Ane', order_number: 1 }],
  examiners: [{ name: 'Sensei', email: 'sensei@example.com' }],
}).valid, true);

const printable = buildPrintableEvaluation({
  clubName: 'SKBC GIPUZKOA',
  examTitle: 'Examen 3 KYU',
  grade: '3kyu',
  studentName: 'Ane',
  examinerName: 'Sensei',
  passPercentage: 65,
  techniqueEvaluations: [
    { technique_name: 'Soto uke zuki', score: 10, notes: 'Bien' },
    { technique_name: 'Tsubame gaeshi', skipped: true, score: null },
  ],
});

assert.equal(printable.summary.totalScore, 10);
assert.equal(printable.summary.maxScore, 10);
assert.equal(printable.summary.passed, true);
assert.equal(printable.skippedCount, 1);
assert.equal(printable.evaluatedCount, 1);
