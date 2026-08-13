import {
  pipeline,
  type TextClassificationPipeline,
} from "@huggingface/transformers";

const MODEL = "Xenova/toxic-bert";

const BLOCKED_LABEL_THRESHOLDS = {
  identity_hate: 0.7,
  severe_toxic: 0.7,
  threat: 0.55,
} as const;

let classifierPromise: Promise<TextClassificationPipeline> | undefined;

function containsSexualContentInvolvingAMinor(text: string): boolean {
  const mentionsMinor =
    /\b(?:child|kid|minor|underage|schoolgirl|schoolboy|loli|shota)\b/i.test(
      text,
    ) || /\b(?:1[0-7]|[0-9])[- ]?year[- ]?old\b/i.test(text);
  const isSexual =
    /\b(?:sex|sexual|rape|porn|nude|naked|cock|dick|pussy|vagina|cum|semen)\w*/i.test(
      text,
    );

  return mentionsMinor && isSexual;
}

function containsExplicitViolenceAdvocacy(text: string): boolean {
  return /\b(?:deserves?|needs?|should|must|oughts?) to be (?:raped|murdered|killed|shot|stabbed|tortured)\b/i.test(
    text,
  );
}

function containsExplicitViolentCrimeIntent(text: string): boolean {
  const plannedViolentCrime =
    /\b(?:i|we|you|he|she|they|someone|somebody)(?:['’](?:m|re|s)| am| are| is)?\s+(?:going to|gonna|will|plans? to|intends? to)\s+(?:rape|murder|kidnap|torture|sexually assault|traffic|shoot|stab)\b/i;
  const statedCrime =
    /\b(?:going to|gonna|will|plans? to|intends? to)\s+commit\s+(?:rape|murder|kidnapping|torture|sexual assault|human trafficking|arson)\b/i;

  return plannedViolentCrime.test(text) || statedCrime.test(text);
}

function getModerationSamples(text: string): string[] {
  const clauses = text
    .split(/[.!?;:\n"“”[\]{}()]+/)
    .map((clause) => clause.trim())
    .filter((clause) => clause.split(/\s+/).length >= 3);

  return [...new Set([text, ...clauses])];
}

function getClassifier(): Promise<TextClassificationPipeline> {
  classifierPromise ??= pipeline("text-classification", MODEL, {
    dtype: "q4",
  });

  return classifierPromise;
}

export async function violatesLercheRules(text: string): Promise<boolean> {
  if (
    containsSexualContentInvolvingAMinor(text) ||
    containsExplicitViolenceAdvocacy(text) ||
    containsExplicitViolentCrimeIntent(text)
  ) {
    return true;
  }

  const classifier = await getClassifier();
  const results = await classifier(getModerationSamples(text), {
    top_k: null,
  });

  return results.flat().some(({ label, score }) => {
    const threshold =
      BLOCKED_LABEL_THRESHOLDS[label as keyof typeof BLOCKED_LABEL_THRESHOLDS];

    return threshold !== undefined && score >= threshold;
  });
}
