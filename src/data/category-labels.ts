import type { MemoryCategory } from "@/lib/api";

export type CategoryLabelSet = Record<MemoryCategory, string>;
export type DomainFieldLabel = {
  question: string;
  icon: string;
  context: string;
};

export const CATEGORY_LABELS: Record<string, CategoryLabelSet> = {
  generic: {
    preference: "Your preferences and settings",
    fact: "Facts about you",
    goal: "Your goals",
    procedure: "How you do things",
    relationship: "People in your life",
    expertise: "Your skills and knowledge",
  },
  edtech: {
    preference: "How you prefer to learn",
    fact: "Your grade level and board",
    goal: "Your exam targets",
    procedure: "Your study methods",
    relationship: "Your teachers and study partners",
    expertise: "Your subject strengths",
  },
  healthcare: {
    preference: "Your health preferences",
    fact: "Your health conditions and history",
    goal: "Your health goals",
    procedure: "Your treatment routines",
    relationship: "Your doctors and caregivers",
    expertise: "Your medical knowledge",
  },
  hrtech: {
    preference: "Your work style preferences",
    fact: "Your role and experience",
    goal: "Your career goals",
    procedure: "How you work",
    relationship: "Your team and colleagues",
    expertise: "Your professional skills",
  },
};

export function getDomainLabels(domain: string | null | undefined): CategoryLabelSet {
  const normalized = String(domain || "generic").trim().toLowerCase();
  return CATEGORY_LABELS[normalized] ?? CATEGORY_LABELS.generic;
}

export const DOMAIN_FIELD_LABELS: Record<string, Record<string, DomainFieldLabel>> = {
  edtech: {
    grade_level: {
      question: "What is your current class?",
      icon: "🎓",
      context: "Your grade level",
    },
    weak_topic: {
      question: "Is this topic still difficult for you?",
      icon: "📚",
      context: "Your subject difficulty",
    },
    exam_context: {
      question: "What is your exam date?",
      icon: "📅",
      context: "Your upcoming exam",
    },
    explanation_style: {
      question: "How do you prefer to learn?",
      icon: "💡",
      context: "Your learning style",
    },
    language_profile: {
      question: "What language do you prefer?",
      icon: "🗣️",
      context: "Your language preference",
    },
  },
  healthcare: {
    condition: {
      question: "Is this health information current?",
      icon: "🏥",
      context: "Your health information",
    },
  },
};

export function getDomainFieldLabel(
  domain: string | null | undefined,
  field: string | null | undefined,
): DomainFieldLabel | null {
  const normalizedDomain = String(domain || "").trim().toLowerCase();
  const normalizedField = String(field || "").trim().toLowerCase();
  const labels = DOMAIN_FIELD_LABELS[normalizedDomain];
  if (!labels || !normalizedField) {
    return null;
  }
  const direct = labels[normalizedField];
  if (direct) {
    return direct;
  }
  const fuzzyKey = Object.keys(labels).find((key) => normalizedField.includes(key));
  return fuzzyKey ? labels[fuzzyKey] : null;
}
