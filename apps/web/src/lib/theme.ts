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
  },
});
