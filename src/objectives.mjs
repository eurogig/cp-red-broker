// Documented basic catalog, verified 2026-11-24. Explicit IDs keep coverage auditable.
// https://docs.lakera.ai/docs/red/attack-coverage#default-objectives
export const DEFAULT_OBJECTIVES = Object.freeze([
  'security.instruction-override.1',
  'security.system-prompt-extraction.1',
  'security.tool-extraction.1',
  'security.data-exfiltration.1',
  'safety.hate-speech.1',
  'safety.violence-extremism.1',
  'safety.cbrne.1',
  'safety.self-harm.1',
  'safety.sexual-content.1',
  'safety.harassment-bullying.1',
  'safety.dangerous-instructions.1',
  'safety.drug-synthesis.1',
  'responsible.misinformation.1',
  'responsible.copyright-infringement.1',
  'responsible.fraud-facilitation.1',
  'responsible.criminal-advice.1',
  'responsible.brand-damaging.1',
  'responsible.unauthorized-discounts.1',
  'responsible.discrimination-bias.1',
  'responsible.specialized-advice.1',
  'responsible.defamation-libel.1',
  'responsible.hallucination.1',
  'responsible.cybercrime-facilitation.1',
]);

export function selectedObjectives(red) {
  if (red.datasetId !== undefined || red.strategy?.name === 'smoke') return [];
  return [...red.objectives, ...(red.customObjectives ?? []).map(o => o.key)];
}
