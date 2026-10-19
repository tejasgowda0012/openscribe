import React, { useState } from "react";
import { ChevronRight, Plus, Sparkles, Trash2, X } from "lucide-react";
import type { CorrectionRule, ParitySettings, Snippet } from "../../api/parityTypes";

interface PersonalizationSettingsProps {
  settings: ParitySettings;
  onUpdateSettings: (settings: ParitySettings) => void;
}

export const PersonalizationSettings: React.FC<PersonalizationSettingsProps> = ({
  settings,
  onUpdateSettings
}) => {
  const [activeTab, setActiveTab] = useState<"dictionary" | "snippets" | "smart">("dictionary");
  const [heard, setHeard] = useState("");
  const [replacement, setReplacement] = useState("");
  const [trigger, setTrigger] = useState("");
  const [expansion, setExpansion] = useState("");

  const handleToggle = (key: keyof ParitySettings, val: boolean) => {
    onUpdateSettings({ ...settings, [key]: val });
  };

  const handleAddCorrection = () => {
    if (!heard.trim() || !replacement.trim()) return;
    const rule: CorrectionRule = {
      id: crypto.randomUUID().toUpperCase(),
      heard: heard.trim(),
      replacement: replacement.trim()
    };
    onUpdateSettings({
      ...settings,
      correctionRules: [...settings.correctionRules, rule]
    });
    setHeard("");
    setReplacement("");
  };

  const handleRemoveCorrection = (id: string) => {
    onUpdateSettings({
      ...settings,
      correctionRules: settings.correctionRules.filter((r) => r.id !== id)
    });
  };

  const handleAddSnippet = () => {
    if (!trigger.trim() || !expansion.trim()) return;
    const snippet: Snippet = {
      id: crypto.randomUUID().toUpperCase(),
      trigger: trigger.trim(),
      replacement: expansion.trim()
    };
    onUpdateSettings({
      ...settings,
      snippets: [...settings.snippets, snippet]
    });
    setTrigger("");
    setExpansion("");
  };

  const handleRemoveSnippet = (id: string) => {
    onUpdateSettings({
      ...settings,
      snippets: settings.snippets.filter((s) => s.id !== id)
    });
  };

  const handleUpdateVocabulary = (text: string) => {
    const words = text
      .split(/[\n,]/)
      .map((w) => w.trim())
      .filter(Boolean);
    onUpdateSettings({ ...settings, customVocabulary: words });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Sub Tabs */}
      <div style={{ display: "flex", gap: 12, borderBottom: "1px solid rgba(0,0,0,0.08)", paddingBottom: 8 }}>
        {(["dictionary", "snippets", "smart"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: activeTab === t ? "2px solid #2563eb" : "2px solid transparent",
              color: activeTab === t ? "#2563eb" : "#6b7280",
              fontSize: 13,
              fontWeight: activeTab === t ? 600 : 500,
              padding: "4px 2px",
              cursor: "pointer",
              textTransform: "capitalize"
            }}
          >
            {t === "smart" ? "Smart corrections" : t}
          </button>
        ))}
      </div>

      {activeTab === "smart" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              background: "#ffffff",
              border: "1px solid rgba(0,0,0,0.1)",
              borderRadius: 10,
              padding: "16px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 16
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <strong style={{ fontSize: 13.5, display: "block" }}>
                  Send words to the speech model
                </strong>
                <span style={{ fontSize: 12, color: "#6b7280" }}>
                  Passes custom vocabulary and speech hints directly into supported models.
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.speechHints}
                onChange={(e) => handleToggle("speechHints", e.target.checked)}
              />
            </div>

            <div style={{ height: 1, background: "rgba(0,0,0,0.06)" }} />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <strong style={{ fontSize: 13.5, display: "block" }}>
                  Understand spoken corrections
                </strong>
                <span style={{ fontSize: 12, color: "#6b7280" }}>
                  Detect phrases like “no wait” or spelled-out names, correcting them cleanly.
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.spokenCorrections}
                onChange={(e) => handleToggle("spokenCorrections", e.target.checked)}
              />
            </div>

            <div style={{ height: 1, background: "rgba(0,0,0,0.06)" }} />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <strong style={{ fontSize: 13.5, display: "block" }}>
                  Learn words you spell out
                </strong>
                <span style={{ fontSize: 12, color: "#6b7280" }}>
                  Automatically adds spelled-out terminology to your custom vocabulary.
                </span>
              </div>
              <input
                type="checkbox"
                disabled={!settings.spokenCorrections}
                checked={settings.learnSpelledWords}
                onChange={(e) => handleToggle("learnSpelledWords", e.target.checked)}
              />
            </div>

            <div style={{ height: 1, background: "rgba(0,0,0,0.06)" }} />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <strong style={{ fontSize: 13.5, display: "block" }}>
                  Correction model
                </strong>
                <span style={{ fontSize: 12, color: "#6b7280" }}>
                  Fast LLM used to resolve spoken corrections and spelling.
                </span>
              </div>
              <input
                type="text"
                value={settings.correctionModel}
                onChange={(e) => onUpdateSettings({ ...settings, correctionModel: e.target.value })}
                placeholder="e.g. gpt-4o-mini"
                disabled={!settings.spokenCorrections}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid rgba(0,0,0,0.15)",
                  fontSize: 12.5,
                  width: 180
                }}
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === "dictionary" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Custom Vocabulary */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid rgba(0,0,0,0.1)",
              borderRadius: 10,
              padding: "16px 20px"
            }}
          >
            <h4 style={{ fontSize: 13.5, fontWeight: 600, margin: "0 0 6px" }}>
              Custom Vocabulary
            </h4>
            <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 10px" }}>
              Add names, technical jargon, or acronyms (separated by commas or new lines).
            </p>
            <textarea
              value={settings.customVocabulary.join("\n")}
              onChange={(e) => handleUpdateVocabulary(e.target.value)}
              placeholder="e.g. OpenScribe, PostgreSQL, Kubernetes"
              style={{
                width: "100%",
                minHeight: 80,
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid rgba(0,0,0,0.12)",
                fontSize: 13,
                fontFamily: "inherit"
              }}
            />
          </div>

          {/* Corrections Rules */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid rgba(0,0,0,0.1)",
              borderRadius: 10,
              padding: "16px 20px"
            }}
          >
            <h4 style={{ fontSize: 13.5, fontWeight: 600, margin: "0 0 6px" }}>
              Correction Rules
            </h4>
            <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 12px" }}>
              Always replace frequently misheard phrases with the correct term.
            </p>

            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                type="text"
                placeholder="What was heard"
                value={heard}
                onChange={(e) => setHeard(e.target.value)}
                style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.12)", fontSize: 13 }}
              />
              <input
                type="text"
                placeholder="Replacement"
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
                style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.12)", fontSize: 13 }}
              />
              <button
                onClick={handleAddCorrection}
                style={{
                  background: "#2563eb",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 6,
                  padding: "0 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Add
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {settings.correctionRules.map((rule) => (
                <div
                  key={rule.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 10px",
                    background: "#f9fafb",
                    borderRadius: 6,
                    fontSize: 12.5
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "#4b5563" }}>{rule.heard}</span>
                    <ChevronRight size={13} color="#9ca3af" />
                    <strong style={{ color: "#181a1f" }}>{rule.replacement}</strong>
                  </div>
                  <button
                    onClick={() => handleRemoveCorrection(rule.id)}
                    style={{ background: "transparent", border: "none", color: "#9ca3af", cursor: "pointer" }}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "snippets" && (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid rgba(0,0,0,0.1)",
            borderRadius: 10,
            padding: "16px 20px"
          }}
        >
          <h4 style={{ fontSize: 13.5, fontWeight: 600, margin: "0 0 6px" }}>
            Voice Snippets
          </h4>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 12px" }}>
            When a dictation matches the exact trigger phrase, it expands into the full text.
          </p>

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input
              type="text"
              placeholder="Spoken trigger"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.12)", fontSize: 13 }}
            />
            <input
              type="text"
              placeholder="Exact expansion"
              value={expansion}
              onChange={(e) => setExpansion(e.target.value)}
              style={{ flex: 1.5, padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.12)", fontSize: 13 }}
            />
            <button
              onClick={handleAddSnippet}
              style={{
                background: "#2563eb",
                color: "#ffffff",
                border: "none",
                borderRadius: 6,
                padding: "0 14px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Add
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {settings.snippets.map((snip) => (
              <div
                key={snip.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 10px",
                  background: "#f9fafb",
                  borderRadius: 6,
                  fontSize: 12.5
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#4b5563" }}>"{snip.trigger}"</span>
                  <ChevronRight size={13} color="#9ca3af" />
                  <strong style={{ color: "#181a1f" }}>{snip.replacement}</strong>
                </div>
                <button
                  onClick={() => handleRemoveSnippet(snip.id)}
                  style={{ background: "transparent", border: "none", color: "#9ca3af", cursor: "pointer" }}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
