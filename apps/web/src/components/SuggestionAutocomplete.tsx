"use client";

import * as React from "react";
import { Autocomplete, IconButton, InputAdornment, TextField } from "@mui/material";
import ClearIcon from "@mui/icons-material/Clear";

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
  getOptionValue,
  onEnter,
  onSelect,
}: {
  label: string;
  value: string;
  onValueChange: (v: string) => void;
  fetchSuggestions: (q: string) => Promise<T[]>;
  getOptionLabel: (option: T) => string;
  // What actually gets searched/submitted when an option is picked — falls
  // back to getOptionLabel when omitted. Needed whenever the display label
  // includes disambiguating text (e.g. "Reliance Jio (INDRC)") that
  // wouldn't itself substring-match the field being searched.
  getOptionValue?: (option: T) => string;
  onEnter?: () => void;
  // Fired only for a genuine option pick (mouse click or keyboard-select),
  // never for plain typing -- carries the same resolved value just passed to
  // onValueChange, so a caller can apply an instant, non-debounced filter
  // update for a dropdown selection without reading back its own (possibly
  // not-yet-re-rendered) state.
  onSelect?: (value: string) => void;
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
      onInputChange={(_, newValue, reason) => {
        // MUI fires this with reason "reset" right after a selection, to
        // resync the input's displayed text using plain getOptionLabel —
        // which would clobber the getOptionValue we just set below with
        // the full display label again. onChange already set the correct
        // value for a real selection; only forward genuine typing/clearing.
        if (reason === "reset") return;
        onValueChange(newValue);
      }}
      onChange={(_, newValue) => {
        if (newValue && typeof newValue !== "string") {
          const resolved = (getOptionValue ?? getOptionLabel)(newValue);
          onValueChange(resolved);
          onSelect?.(resolved);
        }
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onEnter) onEnter();
          }}
          InputProps={{
            ...params.InputProps,
            // freeSolo mode has no controlled `value` for MUI's own
            // built-in clear indicator to key off, so it never appears no
            // matter how much text is typed -- this end adornment is a
            // manual equivalent, shown purely off the current inputValue.
            endAdornment: value ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => onValueChange("")} title="Clear" edge="end">
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : (
              params.InputProps.endAdornment
            ),
          }}
        />
      )}
    />
  );
}
