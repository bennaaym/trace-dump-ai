const stopWords = new Set([
  "a",
  "an",
  "and",
  "are",
  "at",
  "from",
  "in",
  "is",
  "it",
  "near",
  "of",
  "on",
  "the",
  "to",
  "was",
]);

export function distinctEvidenceClaims(values: string[], limit = 3) {
  const accepted: Array<{
    value: string;
    tokens: Set<string>;
    stages: string;
  }> = [];
  for (const raw of values) {
    const value = raw.replace(/\s+/g, " ").trim();
    if (!value) continue;
    const tokens = claimTokens(value);
    const stages = claimStages(value);
    const duplicate = accepted.some((item) => {
      const intersection = [...tokens].filter((token) =>
        item.tokens.has(token),
      ).length;
      const containment =
        intersection / Math.max(1, Math.min(tokens.size, item.tokens.size));
      return (
        value.toLocaleLowerCase() === item.value.toLocaleLowerCase() ||
        (stages === item.stages && containment >= 0.6)
      );
    });
    if (!duplicate) accepted.push({ value, tokens, stages });
    if (accepted.length === limit) break;
  }
  return accepted.map((item) => item.value);
}

export function investigationUncertainty(value: string | null) {
  const uncertain = sentences(value).filter((sentence) => {
    const lower = sentence.toLocaleLowerCase();
    const hasUncertainty =
      /\b(cannot|can't|could|may|might|unclear|unknown|uncertain|ambiguous|obscur|insufficient|limited|whether|not visible|not establish|unable)\b/.test(
        lower,
      );
    const positiveOnly =
      /\b(clear visibility|visibility is clear|clearly visible|unambiguous|no (?:material )?(?:visual )?limitations?)\b/.test(
        lower,
      );
    return hasUncertainty && !positiveOnly;
  });
  if (uncertain.length) return uncertain.join(" ");
  return "No material visual limitation was reported. The footage alone does not establish whether disposal was authorized.";
}

function claimTokens(value: string) {
  return new Set(
    value
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((token) => token.length > 2 && !stopWords.has(token))
      .map((token) => token.replace(/(?:ing|ed|es|s)$/, "")),
  );
}

function claimStages(value: string) {
  const lower = value.toLocaleLowerCase();
  const stages = [
    /\b(?:carr\w*|lift\w*|mov\w*|remov\w*|tak\w*)/.test(lower)
      ? "movement"
      : "",
    /\b(?:releas\w*|plac\w*|drop\w*|throw\w*|deposit\w*|put)\b/.test(lower)
      ? "release"
      : "",
    /\b(?:remain\w*|left|stay\w*|ground|after)\b/.test(lower)
      ? "aftermath"
      : "",
  ].filter(Boolean);
  return stages.join("+") || "observation";
}

function sentences(value: string | null) {
  if (!value) return [];
  return (
    value
      .replace(/\s+/g, " ")
      .trim()
      .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
      ?.map((sentence) => sentence.trim())
      .filter(Boolean) ?? []
  );
}
