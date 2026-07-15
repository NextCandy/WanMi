import type { PublicDomain } from "../../shared/types/api";

function commonPrefixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[index] === right[index]) index += 1;
  return index;
}

function similarityScore(domain: PublicDomain, candidate: PublicDomain): number {
  let score = 0;
  if (domain.tld === candidate.tld) score += 6;
  const categories = new Set(domain.categories.length ? domain.categories : domain.category ? [domain.category] : []);
  const candidateCategories = candidate.categories.length ? candidate.categories : candidate.category ? [candidate.category] : [];
  score += Math.min(6, candidateCategories.filter((category) => categories.has(category)).length * 3);

  const lengthDelta = Math.abs(domain.name.length - candidate.name.length);
  score += lengthDelta === 0 ? 4 : lengthDelta === 1 ? 3 : lengthDelta === 2 ? 1 : 0;
  score += Math.min(3, commonPrefixLength(domain.name, candidate.name));
  if (domain.name.includes(candidate.name) || candidate.name.includes(domain.name)) score += 2;
  if (domain.is_featured === candidate.is_featured) score += 1;
  return score;
}

export function getSimilarDomains(
  domain: PublicDomain,
  allDomains: PublicDomain[],
  limit = 6,
): PublicDomain[] {
  const seen = new Set<number>([domain.id]);
  return allDomains
    .filter((candidate) => {
      if (seen.has(candidate.id)) return false;
      seen.add(candidate.id);
      return true;
    })
    .map((candidate) => ({ candidate, score: similarityScore(domain, candidate) }))
    .sort((left, right) => right.score - left.score || left.candidate.domain.localeCompare(right.candidate.domain))
    .slice(0, Math.max(0, limit))
    .map(({ candidate }) => candidate);
}
