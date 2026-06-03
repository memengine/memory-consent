"use client";

import { useState } from "react";

type CorrectionFormProps = {
  initialContent: string;
  loading?: boolean;
  onCancel: () => void;
  onSave: (correctedContent: string) => void | Promise<void>;
};

export function CorrectionForm({ initialContent, loading = false, onCancel, onSave }: CorrectionFormProps) {
  const [value, setValue] = useState(initialContent);

  return (
    <div className="inline-form">
      <label className="field">
        <span>What is the correct information?</span>
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="e.g. I am now in Class 11, not Class 10"
          rows={5}
        />
      </label>
      <div className="button-row">
        <button
          type="button"
          className="primary-button"
          disabled={loading || value.trim().length < 10}
          onClick={() => void onSave(value.trim())}
        >
          {loading ? "Saving..." : "Save correction"}
        </button>
        <button type="button" className="quiet-button" disabled={loading} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
