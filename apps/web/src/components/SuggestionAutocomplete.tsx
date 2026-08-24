"use client";

import * as React from "react";
import { Autocomplete, TextField } from "@mui/material";

const DEBOUNCE_MS = 250;

/** MUI Autocomplete (freeSolo) backed by a debounced server-side lookup —
 * used by both search pages' main query field. freeSolo so the user can
 * still search on arbitrary free text, not just an exact suggestion pick;
 * filterOptions is a no-op because the server has already filtered by `q`,
 * re-filtering client-side would just hide legitimate results (e.g. an
 * alias match whose label doesn't literally contain the typed text). */
export default function SuggestionAutocomplete<T>({
  label,
  value,
  onValueChange,
  fetchSuggestions,
  getOptionLabel,
  onEnter,
}: {
  label: string;
  value: string;
  onValueChange: (v: string) => void;
  fetchSuggestions: (q: string) => Promise<T[]>;
  getOptionLabel: (option: T) => string;
  onEnter?: () => void;
}) {
  const [options, setOptions] = React.useState<T[]>([]);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout>>();

  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setOptions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(value)
        .then(setOptions)
        .catch(() => setOptions([]));
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Autocomplete<T, false, false, true>
      freeSolo
      fullWidth
      options={options}
      filterOptions={(x) => x}
      getOptionLabel={(option) => (typeof option === "string" ? option : getOptionLabel(option))}
      inputValue={value}
      onInputChange={(_, newValue) => onValueChange(newValue)}
      onChange={(_, newValue) => {
        if (newValue && typeof newValue !== "string") onValueChange(getOptionLabel(newValue));
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onEnter) onEnter();
          }}
        />
      )}
    />
  );
}
