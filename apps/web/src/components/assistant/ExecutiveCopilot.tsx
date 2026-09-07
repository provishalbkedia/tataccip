"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  ClickAwayListener,
  Divider,
  FormControlLabel,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Popper,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CloseIcon from "@mui/icons-material/Close";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import SearchIcon from "@mui/icons-material/Search";
import { GuideTopic, searchGuideTopics, topicsForRoute } from "@/data/platformGuideContent";

const MUTE_STORAGE_KEY = "ccip_copilot_muted";
const DISMISSED_VIEWS_STORAGE_KEY = "ccip_copilot_dismissed_views";

function readStoredMuted(): boolean {
  try {
    const raw = window.localStorage.getItem(MUTE_STORAGE_KEY);
    // Defaults to muted (true) whenever nothing is stored yet, or storage
    // is unreadable -- audio must never autoplay without explicit consent.
    return raw === null ? true : raw === "true";
  } catch {
    return true;
  }
}

function readStoredDismissedViews(): string[] {
  try {
    const raw = window.localStorage.getItem(DISMISSED_VIEWS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/** Thin wrapper around window.speechSynthesis -- every call is guarded so a
 * browser without the API (or one that blocks it, e.g. some locked-down
 * corporate policies) degrades to "no voice", not a thrown error breaking
 * the rest of the assistant. */
function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export default function ExecutiveCopilot() {
  const router = useRouter();
  const pathname = usePathname();
  const anchorRef = React.useRef<HTMLButtonElement | null>(null);
  // The whole floating pill (button + mute toggle), not just the button
  // used to anchor/position the Popper -- ClickAwayListener only wraps the
  // popover's own Paper, so without this a click on the mute icon (which
  // sits in the pill, outside that Paper) would register as "away" and
  // close the popover the instant it opened.
  const pillRef = React.useRef<HTMLDivElement | null>(null);

  const [hydrated, setHydrated] = React.useState(false);
  const [muted, setMuted] = React.useState(true);
  const [dismissedViews, setDismissedViews] = React.useState<string[]>([]);
  const [open, setOpen] = React.useState(false);
  const [speaking, setSpeaking] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const autoShownRoutesRef = React.useRef<Set<string>>(new Set());

  // Read localStorage only after mount -- it doesn't exist during SSR, and
  // reading it in the initializer would make the very first client render
  // disagree with the server-rendered markup (a hydration mismatch).
  React.useEffect(() => {
    setMuted(readStoredMuted());
    setDismissedViews(readStoredDismissedViews());
    setHydrated(true);
  }, []);

  const stopSpeaking = React.useCallback(() => {
    if (speechSupported()) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Nothing more to do -- the speech API itself is what's misbehaving.
      }
    }
    setSpeaking(false);
  }, []);

  const speak = React.useCallback((text: string) => {
    if (!speechSupported()) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
    } catch {
      // Speech synthesis threw (some browsers do this when the API is
      // present but disabled by policy) -- the rest of the UI still works.
      setSpeaking(false);
    }
  }, []);

  const toggleMute = React.useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      if (next) stopSpeaking();
      try {
        window.localStorage.setItem(MUTE_STORAGE_KEY, String(next));
      } catch {
        // Private browsing / storage blocked -- the toggle still works for
        // this session, it just won't survive a reload.
      }
      return next;
    });
  }, [stopSpeaking]);

  const setViewDismissed = React.useCallback(
    (dismissed: boolean) => {
      setDismissedViews((prev) => {
        const already = prev.includes(pathname);
        if (dismissed === already) return prev;
        const next = dismissed ? [...prev, pathname] : prev.filter((p) => p !== pathname);
        try {
          window.localStorage.setItem(DISMISSED_VIEWS_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Private browsing / storage blocked -- works for this session regardless.
        }
        return next;
      });
    },
    [pathname],
  );

  // Esc cancels active speech from anywhere on the page, not just while the
  // popover has focus -- a global affordance, not a Popover-scoped one.
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") stopSpeaking();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stopSpeaking]);

  const routeTopics = React.useMemo(() => topicsForRoute(pathname), [pathname]);

  // Gentle, one-time-per-route auto-open -- never plays audio on its own
  // (that would be autoplay without a direct user gesture, which most
  // browsers block outright and which the muted-by-default design
  // explicitly avoids anyway). Skipped entirely once a route is in
  // dismissedViews, and only fires once per route per session even if not
  // dismissed, so switching back and forth between two pages doesn't
  // re-trigger it every time.
  React.useEffect(() => {
    if (!hydrated) return;
    if (routeTopics.length === 0) return;
    if (dismissedViews.includes(pathname)) return;
    if (autoShownRoutesRef.current.has(pathname)) return;
    autoShownRoutesRef.current.add(pathname);
    const timer = setTimeout(() => {
      setSearch("");
      setOpen(true);
    }, 700);
    return () => clearTimeout(timer);
  }, [hydrated, pathname, routeTopics, dismissedViews]);

  // Closing (for any reason) or navigating away should stop any briefing
  // that's mid-sentence -- nothing should keep talking about a page you've
  // left.
  React.useEffect(() => {
    stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const searchResults = React.useMemo(() => (search.trim() ? searchGuideTopics(search) : null), [search]);
  const displayedTopics = searchResults ?? routeTopics;

  const handleToggleOpen = () => {
    setOpen((prev) => {
      const next = !prev;
      if (!next) stopSpeaking();
      return next;
    });
  };

  const handleClose = () => {
    setOpen(false);
    stopSpeaking();
  };

  const handlePlayBriefing = (topic: GuideTopic) => {
    // Deliberately bypasses the global mute -- an explicit click on "Play
    // Briefing" is a direct user gesture, distinct from the ambient
    // auto-open above that never triggers audio unprompted.
    speak(topic.shortVoiceSummary);
  };

  if (!hydrated) return null;

  return (
    <>
      <Tooltip title={open ? "Close Executive Copilot" : "Open Executive Copilot"} placement="left">
        <Paper
          ref={pillRef}
          elevation={6}
          sx={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 1250,
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            borderRadius: 999,
            bgcolor: "#0A2540",
            border: "1px solid #00D4B2",
            color: "#fff",
            pl: 1,
            pr: 0.5,
            py: 0.5,
            boxShadow: "0 8px 24px rgba(10,37,64,0.35)",
          }}
        >
          <Box
            ref={anchorRef}
            component="button"
            onClick={handleToggleOpen}
            aria-label="Open Executive Copilot"
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              bgcolor: "transparent",
              border: "none",
              color: "#fff",
              cursor: "pointer",
              px: 0.5,
              py: 0.5,
              fontFamily: "inherit",
            }}
          >
            <AutoAwesomeIcon fontSize="small" sx={{ color: "#00D4B2" }} />
            <Typography variant="body2" fontWeight={700} sx={{ display: { xs: "none", sm: "inline" } }}>
              Copilot
            </Typography>
            {speaking && (
              <Box sx={{ display: "flex", alignItems: "flex-end", gap: "2px", height: 14, ml: 0.25 }}>
                {[0, 1, 2, 3].map((i) => (
                  <Box
                    key={i}
                    sx={{
                      width: 3,
                      bgcolor: "#00D4B2",
                      borderRadius: "2px",
                      animation: `ccip-copilot-wave 0.9s ease-in-out ${i * 0.12}s infinite`,
                      "@keyframes ccip-copilot-wave": {
                        "0%, 100%": { height: "4px" },
                        "50%": { height: "14px" },
                      },
                    }}
                  />
                ))}
              </Box>
            )}
          </Box>
          <IconButton
            size="small"
            onClick={toggleMute}
            aria-label={muted ? "Unmute Executive Copilot" : "Mute Executive Copilot"}
            sx={{ color: muted ? "rgba(255,255,255,0.5)" : "#00D4B2" }}
          >
            {muted ? <VolumeOffIcon fontSize="small" /> : <VolumeUpIcon fontSize="small" />}
          </IconButton>
        </Paper>
      </Tooltip>

      <Popper
        open={open}
        anchorEl={anchorRef.current}
        placement="top-end"
        style={{ zIndex: 1251 }}
        modifiers={[{ name: "offset", options: { offset: [0, 12] } }]}
      >
        <ClickAwayListener
          onClickAway={(event) => {
            if (pillRef.current?.contains(event.target as Node)) return;
            handleClose();
          }}
        >
          <Paper
            elevation={8}
            sx={{
              width: { xs: "92vw", sm: 400 },
              maxWidth: 420,
              maxHeight: "70vh",
              display: "flex",
              flexDirection: "column",
              borderRadius: 2,
              overflow: "hidden",
              border: "1px solid #E1E6EB",
            }}
          >
            <Box sx={{ bgcolor: "#0A2540", color: "#fff", px: 2, py: 1.5, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <AutoAwesomeIcon fontSize="small" sx={{ color: "#00D4B2" }} />
                <Typography variant="subtitle2" fontWeight={700}>
                  Executive Copilot
                </Typography>
              </Box>
              <IconButton size="small" onClick={handleClose} aria-label="Close" sx={{ color: "#fff" }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>

            <Box sx={{ p: 1.5, borderBottom: "1px solid #E1E6EB" }}>
              <TextField
                fullWidth
                size="small"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ask or search platform features (e.g., ASN, DSX Churn, Reach List Exclusive)..."
                InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ color: "text.disabled", mr: 1 }} /> }}
              />
            </Box>

            <Box sx={{ overflowY: "auto", px: 1.5, py: 1.5, flex: 1 }}>
              {displayedTopics.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                  {searchResults
                    ? "No matching topics — try a different term."
                    : "No Copilot guidance is registered for this page yet."}
                </Typography>
              ) : (
                displayedTopics.map((topic, i) => (
                  <Box key={topic.id} sx={{ mb: i === displayedTopics.length - 1 ? 0 : 2 }}>
                    <Typography variant="subtitle2" fontWeight={700} sx={{ color: "#0A2540" }}>
                      {topic.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {topic.detailedExplanation}
                    </Typography>
                    {topic.proTips.length > 0 && (
                      <List dense disablePadding sx={{ mb: 1 }}>
                        {topic.proTips.map((tip, ti) => (
                          <ListItemButton key={ti} disableRipple disableGutters sx={{ py: 0.25, cursor: "default", "&:hover": { bgcolor: "transparent" } }}>
                            <ListItemText
                              primary={`• ${tip}`}
                              primaryTypographyProps={{ variant: "caption", color: "text.secondary" }}
                            />
                          </ListItemButton>
                        ))}
                      </List>
                    )}
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<PlayArrowIcon fontSize="small" />}
                        onClick={() => handlePlayBriefing(topic)}
                        disabled={!speechSupported()}
                      >
                        Play Briefing
                      </Button>
                      <Button
                        size="small"
                        startIcon={<MenuBookIcon fontSize="small" />}
                        onClick={() => {
                          handleClose();
                          router.push("/help");
                        }}
                      >
                        View Full Chapter
                      </Button>
                    </Box>
                    {i !== displayedTopics.length - 1 && <Divider sx={{ mt: 2 }} />}
                  </Box>
                ))
              )}
            </Box>

            {!searchResults && routeTopics.length > 0 && (
              <Box sx={{ px: 1.5, py: 1, borderTop: "1px solid #E1E6EB", bgcolor: "#F4F6F8" }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={dismissedViews.includes(pathname)}
                      onChange={(e) => setViewDismissed(e.target.checked)}
                    />
                  }
                  label={<Typography variant="caption">Don&apos;t show automatic popups for this view</Typography>}
                />
              </Box>
            )}

            <Box sx={{ px: 1.5, py: 1, borderTop: "1px solid #E1E6EB", display: "flex", justifyContent: "flex-end" }}>
              <Chip size="small" label="Got it" onClick={handleClose} sx={{ bgcolor: "#0A2540", color: "#fff", fontWeight: 600, cursor: "pointer" }} />
            </Box>
          </Paper>
        </ClickAwayListener>
      </Popper>
    </>
  );
}
