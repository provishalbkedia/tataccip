import { createTheme } from "@mui/material/styles";

// Enterprise telecom palette: dark blue / azure / white / grey.
export const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#0A2540", light: "#1C3A5E", dark: "#061A2E", contrastText: "#FFFFFF" },
    secondary: { main: "#0B6FBF", light: "#3D8FD1", dark: "#084E87", contrastText: "#FFFFFF" },
    background: { default: "#F4F6F8", paper: "#FFFFFF" },
    text: { primary: "#0A2540", secondary: "#5A6B7B" },
    divider: "#E1E6EB",
    // Codified from the hex values already hardcoded ad hoc across the app
    // (KPI cards, status badges, admin match-status chips) -- making them
    // the real palette means `color="success"` etc. now renders exactly
    // what every page already visually expects, and future code can
    // reference theme.palette.success.main instead of repeating the hex.
    success: { main: "#2E7D32", light: "#4CAF50", dark: "#1B5E20", contrastText: "#FFFFFF" },
    error: { main: "#C62828", light: "#E57373", dark: "#8E0000", contrastText: "#FFFFFF" },
    warning: { main: "#EF6C00", light: "#FFA726", dark: "#B34700", contrastText: "#FFFFFF" },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: [
      "-apple-system",
      "BlinkMacSystemFont",
      '"Segoe UI"',
      "Roboto",
      "Helvetica",
      "Arial",
      "sans-serif",
    ].join(","),
    // MUI's stock scale (body2 14px, caption 12px) reads small on a large
    // desktop monitor -- this app leans on body2 and caption for most
    // actual data (table cells, KPI stats, form labels), not just
    // auxiliary hint text, so a modest bump here raises the whole app's
    // baseline readability without touching per-page code. body1/h* stay
    // at MUI's defaults; only the variants doing the heavy lifting move.
    body2: { fontSize: "0.9375rem" }, // 14px -> 15px
    caption: { fontSize: "0.8125rem" }, // 12px -> 13px
    subtitle2: { fontSize: "0.9375rem" }, // 14px -> 15px
    overline: { fontSize: "0.75rem" }, // unchanged (12px) -- deliberately small-caps label text
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: { backgroundColor: "#0A2540" },
      },
    },
    // MUI's default Button height (~37px) and a size="small" IconButton
    // both fall under the 44x44px minimum touch target on mobile — bumped
    // here at the theme level instead of patching every instance. Skips
    // size="small" IconButtons since those live inside dense AG Grid cells
    // (e.g. the PDF icon column) and Table rows, where forcing 44px would
    // blow out the row height instead of just being a bigger tap target.
    MuiButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          [theme.breakpoints.down("sm")]: { minHeight: 44 },
        }),
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: ({ theme, ownerState }) => ({
          ...(ownerState.size !== "small" && {
            [theme.breakpoints.down("sm")]: { minWidth: 44, minHeight: 44 },
          }),
        }),
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          [theme.breakpoints.down("sm")]: { minHeight: 44 },
        }),
      },
    },
    // Enterprise-grade elevation: a subtle shadow instead of MUI's default
    // heavier drop shadow, plus a quick hover transition for any card that
    // turns out to be clickable (KpiCard, comparison-selection cards, ...)
    // — harmless on static cards too, since the shadow only shifts, it
    // doesn't require an onClick to look intentional. Applies once here
    // rather than per-page, so every Card across the app (KPI tiles, Help
    // guide sections, comparison cards) picks it up automatically.
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          transition: "box-shadow 180ms ease-in-out, transform 180ms ease-in-out",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        elevation1: { boxShadow: "0 1px 3px rgba(0,0,0,0.08)" },
      },
    },
    // Slightly bolder label weight than MUI's default reads as a proper
    // status/coverage badge (Active / Planned / Limited, Matched / IR.21
    // Only / Reach List Only, ...) rather than a plain text pill.
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600 },
      },
    },
  },
});
