"use client";

import { useMemo, useState } from "react";

import type { EdTechUserProfile } from "@/lib/api";

function targetText(target: Record<string, unknown> | null) {
  if (!target) return "Not set";
  const pct = target.overall_pct ?? target.percentage ?? target.target;
  return pct ? `${pct}%+` : "Set";
}

function styleValue(value: Record<string, unknown> | null, keys: string[]) {
  if (!value) return "Not recorded";
  for (const key of keys) {
    if (value[key]) return String(value[key]);
  }
  return "Recorded";
}

function groupedStages(stages: Record<string, string>) {
  return Object.values(stages).reduce<Record<string, number>>((acc, stage) => {
    acc[stage] = (acc[stage] ?? 0) + 1;
    return acc;
  }, {});
}

export function EdTechProfileCard({
  defaultExpanded = false,
  profile,
}: {
  defaultExpanded?: boolean;
  profile: EdTechUserProfile;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [learningOpen, setLearningOpen] = useState(false);
  const stages = useMemo(() => groupedStages(profile.forgetting_stages), [profile]);
  const riskCount = (stages.forgotten ?? 0) + (stages.critical ?? 0);

  if (!expanded) {
    return (
      <section className="domain-profile-card collapsed">
        <div>
          <span className="section-kicker">Academic profile</span>
          <h3>Your Academic Profile</h3>
          <p>What EdTech AI agents know about your learning context.</p>
        </div>
        <button type="button" className="primary-button compact" onClick={() => setExpanded(true)}>
          View your academic profile
        </button>
      </section>
    );
  }

  return (
    <section className="domain-profile-card">
      <div className="domain-profile-header">
        <span className="domain-profile-icon" aria-hidden>
          🎓
        </span>
        <div>
          <h3>Your Academic Profile</h3>
          <p>What EdTech AI agents know about you</p>
        </div>
        <button type="button" className="quiet-button compact" onClick={() => setExpanded(false)}>
          Collapse
        </button>
      </div>

      <div className="academic-summary-grid">
        <div>
          <span>Grade + Board</span>
          <strong>
            {[profile.grade_level, profile.board].filter(Boolean).join(" ") || "Not recorded"}
          </strong>
        </div>
        <div>
          <span>Exam</span>
          <strong>{profile.exam_name || "No exam recorded"}</strong>
        </div>
        <div className={profile.days_to_exam !== null && profile.days_to_exam < 30 ? "urgent" : ""}>
          <span>Days to exam</span>
          <strong>{profile.days_to_exam ?? "-"}</strong>
        </div>
        <div>
          <span>Target</span>
          <strong>{targetText(profile.marks_target)}</strong>
        </div>
      </div>

      <div className="profile-two-column">
        <div className="profile-panel">
          <h4>Needs work</h4>
          {profile.weak_topics.length > 0 ? (
            profile.weak_topics.map((topic) => (
              <div className="topic-row" key={`weak-${topic.topic}`}>
                <span>{topic.topic}</span>
                <small className={`severity-pill severity-${topic.severity || "mild"}`}>
                  {topic.severity || "mild"}
                </small>
                <small>{topic.attempts ?? 0} attempts</small>
              </div>
            ))
          ) : (
            <p>No weak topics recorded yet</p>
          )}
        </div>

        <div className="profile-panel">
          <h4>You know well</h4>
          {profile.strong_topics.length > 0 ? (
            profile.strong_topics.map((topic) => (
              <div className="topic-row" key={`strong-${topic.topic}`}>
                <span>{topic.topic}</span>
                <small>{Math.round((topic.confidence ?? 0) * 100)}%</small>
              </div>
            ))
          ) : (
            <p>No strengths recorded yet</p>
          )}
        </div>
      </div>

      {riskCount > 0 ? (
        <div className="profile-panel">
          <h4>Topics to review</h4>
          <div className="stage-grid">
            <span>🔴 Forgotten: {stages.forgotten ?? 0}</span>
            <span>🟠 Critical: {stages.critical ?? 0}</span>
            <span>🟡 Fading: {stages.fading ?? 0}</span>
            <span>🟢 Fresh: {stages.fresh ?? 0}</span>
          </div>
        </div>
      ) : null}

      <button type="button" className="learning-toggle" onClick={() => setLearningOpen((value) => !value)}>
        Your learning preferences -&gt;
      </button>
      {learningOpen ? (
        <div className="profile-panel">
          <p>Explanation style: {styleValue(profile.explanation_style, ["primary", "explanation_preference"])}</p>
          <p>Language: {styleValue(profile.language_profile, ["primary", "comfort", "explanation_preference"])}</p>
        </div>
      ) : null}

      <footer className="domain-profile-footer">
        This profile is built from {profile.total_edtech_memories} memories across {profile.source_agent_count} agents.
        <a href="#flat-memory-list">See all memories below ↓</a>
      </footer>
    </section>
  );
}
