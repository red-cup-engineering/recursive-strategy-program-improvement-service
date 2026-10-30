import assert from "node:assert/strict";
import test from "node:test";
import { createRecursiveStrategyProgramImprovement } from "@red-cup-engineering/recursive-strategy-program-improvement-service";

const ni = letter => `ni:///sha-256;${letter.repeat(43)}`;
const source = "export function decide(input) { return { scores: { BLK: input.x } }; }";
const request = (maximumGenerations = 1) => ({
  customerActor: "urn:customer:test", originalWork: ni("f"),
  incumbent: { id: ni("a"), source: "old" }, contextProduct: ni("b"),
  acceptanceSuite: ni("c"), maximumGenerations, populationSize: 1,
  maxTokensPerCandidate: 1024, evidenceFacts: [{}],
  allowedFeatureDependencies: [], failureHistory: [], replayProbe: { x: 1 },
});
const received = (overrides = {}) => ({
  kind: "organizing.enterprise.outcome", version: 1,
  id: ni("h"), source: "work-discharge", lot: ni("e"), delivery: ni("g"),
  provider: "urn:producer", judge: "urn:assayer",
  verdict: "accepted", at: "2026-10-29T01:00:00Z",
  evidence: [ni("f"), ni("d"), ni("a"), ni("c")],
  receivingReceipt: ni("j"), receivingAuthorizationReceipt: ni("k"),
  reportedResult: { kind: "skill-result", value: { tested: true } },
  ...overrides,
});
function fixture({ read = async () => [], approval = true, winner = true, reviewerActor = "urn:reviewer:other", assaySource = ni("d"), programs = [source] } = {}) {
  const calls = { reads: [], promotions: [], generations: [] };
  const providers = {
    synthesizePopulation: async ({ generation }) => ({
      candidates: [{ index: 0, provider: "urn:author:one", candidate: { strategySource: programs[generation] ?? source } }],
      residues: [],
    }),
    assayProgram: async ({ source: selected }) => ({ type: "StrategyProgramStaticAssay", source: selected === source ? assaySource : ni("m"), admitted: true }),
    replayProgram: async () => ({ type: "DeterministicStrategyProgramReplay", output: { scores: { BLK: 1 } } }),
    evaluateProgram: async () => ({ type: "PurgedMultiRegimeEvaluation", holdoutScore: 1 }),
    selectTournamentWinner: async () => ({
      type: "GeneratedStrategyTournamentResult", improvementEstablished: winner,
      ...(winner ? { winnerIndex: 0 } : {}),
    }),
    reviewProgram: async () => ({ approved: approval, reviewerActor }),
    readStandingOutcomes: async args => { calls.reads.push(args); return read(args); },
    recordGeneration: async value => { calls.generations.push(value); return { id: `urn:generation:${value.generation}` }; },
    promotePaperProgram: async args => {
      calls.promotions.push(args);
      return { candidate: args.candidate.id, paperPromotionEstablished: true, liveReadinessEstablished: false };
    },
  };
  return { improve: createRecursiveStrategyProgramImprovement(providers), calls };
}

test("provider-supplied tournament success and peer review without original Work do NOT promote", async () => {
  const { improve, calls } = fixture();
  const r = await improve(request());
  assert.equal(r.lineageHead, ni("a"));
  assert.equal(r.promotion, null);
  assert.deepEqual(r.receivedWork, []);
  assert.equal(r.scientificImprovementEstablished, null);
  assert.equal(calls.promotions.length, 0);
  assert.equal(calls.reads.length, 1);
  assert.equal(calls.reads[0].originalWork, ni("f"));
  assert.equal(calls.reads[0].candidateSource, ni("d"));
  assert.equal(calls.generations[0].successor, null);
  assert.equal(r.generations[0].residues[0].disposition, "original-work-not-received");
});

test("only a currently standing, independently received native Work result can promote a paper program", async () => {
  const { improve, calls } = fixture({ read: async () => [received()] });
  const r = await improve(request());
  assert.equal(r.lineageHead, ni("d"));
  assert.equal(r.receivedWork.length, 1);
  assert.equal(r.receivedWork[0].outcome, ni("h"));
  assert.equal(r.receivedWork[0].originalWork, ni("f"));
  assert.equal(r.promotion.paperPromotionEstablished, true);
  assert.equal(r.orderExecutionEstablished, false);
  assert.equal(r.liveReadinessEstablished, false);
  assert.equal(r.scientificImprovementEstablished, null,
    "source-accepted Work is not proof of scientifically improved research methods");
  assert.equal(calls.promotions.length, 1);
  assert.equal(calls.promotions[0].receivedWork[0].outcome, ni("h"));
});

test("revoked, contested, self-judged, failed and wrong-source Work cannot be credited", async () => {
  const negatives = [
    ["rejected", received({ verdict: "rejected" }), "unqualified-original-work"],
    ["voided", received({ verdict: "voided" }), "unqualified-original-work"],
    ["wrong-source", received({ evidence: [ni("f"), ni("z"), ni("a"), ni("c")] }), "original-work-not-received"],
    ["wrong-Work", received({ evidence: [ni("y"), ni("d"), ni("a"), ni("c")] }), "original-work-not-received"],
    ["wrong-incumbent", received({ evidence: [ni("f"), ni("d"), ni("y"), ni("c")] }), "original-work-not-received"],
    ["wrong-comparator-suite", received({ evidence: [ni("f"), ni("d"), ni("a"), ni("y")] }), "original-work-not-received"],
    ["self-judged", received({ judge: "urn:producer" }), "unqualified-original-work"],
    ["author-judged", received({ judge: "urn:author:one" }), "unqualified-original-work"],
    ["no independent receiver", received({ receivingAuthorizationReceipt: undefined }), "unqualified-original-work"],
    ["skill-error", received({ reportedResult: { kind: "skill-error", error: "failed" } }), "unqualified-original-work"],
    ["contested", [received(), received({ id: ni("p"), judge: "urn:assayer-two", verdict: "rejected" })], "contested-original-work"],
  ];
  for (const [name, candidate, expected] of negatives) {
    const { improve, calls } = fixture({ read: async () => Array.isArray(candidate) ? candidate : [candidate] });
    const r = await improve(request());
    assert.equal(r.lineageHead, ni("a"), name);
    assert.equal(r.promotion, null, name);
    assert.equal(calls.promotions.length, 0, name);
    assert.equal(r.generations[0].residues[0].disposition, expected, name);
  }
});

test("one original Work lot/outcome cannot reward two generations in the same run", async () => {
  const { improve, calls } = fixture({
    programs: [source, source + " // alternate method"],
    read: async ({ generation }) => generation === 0
      ? [received()]
      : [received({ id: ni("p"), evidence: [ni("f"), ni("d"), ni("m"), ni("c")] })],
  });
  const r = await improve(request(2));
  assert.equal(r.generations.length, 2);
  assert.equal(r.receivedWork.length, 1);
  assert.equal(r.generations[0].successor, ni("d"));
  assert.equal(r.generations[1].successor, null);
  assert.equal(r.generations[1].residues[0].disposition, "original-work-already-credited");
  assert.equal(calls.promotions.length, 1);
});

test("unavailable or malformed upstream Work reads fail closed without making a paper", async () => {
  for (const read of [async () => { throw Error("not installed"); }, async () => ({}), async () => null]) {
    const { improve, calls } = fixture({ read });
    const r = await improve(request());
    assert.equal(r.lineageHead, ni("a"));
    assert.equal(r.promotion, null);
    assert.equal(r.generations[0].residues[0].disposition, "original-work-source-refused");
    assert.equal(calls.promotions.length, 0);
  }
});

test("review refusal or unselected candidate never uses Work results to mint success", async () => {
  for (const opts of [{ approval: false }, { winner: false }, { reviewerActor: "" }, { reviewerActor: "urn:author:one" }]) {
    const { improve, calls } = fixture({ ...opts, read: async () => [received()] });
    const r = await improve(request());
    assert.equal(r.lineageHead, ni("a"));
    assert.equal(r.promotion, null);
    assert.equal(calls.reads.length, 0);
  }
});

test("original Work is mandatory and the original source reader port cannot be omitted", () => {
  assert.throws(() => createRecursiveStrategyProgramImprovement({}), /explicit-evolution-providers-required/);
  const { improve } = fixture();
  return assert.rejects(improve({ ...request(), originalWork: undefined }), /immutable-evolution-inputs-required/);
});

test("unaddressed candidate source cannot become received Work and records exact refusal", async () => {
  const { improve, calls } = fixture({ assaySource: "arbitrary caller string", read: async () => [received()] });
  const r = await improve(request());
  assert.equal(r.lineageHead, ni("a"));
  assert.equal(r.promotion, null);
  assert.equal(calls.reads.length, 0);
  assert.equal(r.generations[0].residues[0].disposition, "original-work-source-refused");
});

test("an unchanged candidate is not a method improvement even when Work was once accepted", async () => {
  const { improve, calls } = fixture({ read: async () => [received()] });
  const r = await improve(request(2));
  assert.equal(r.receivedWork.length, 1);
  assert.equal(r.generations[1].residues[0].disposition, "unchanged-strategy-cannot-improve-itself");
  assert.equal(calls.reads.length, 1, "do not reread work for identical old and new strategies");
});
