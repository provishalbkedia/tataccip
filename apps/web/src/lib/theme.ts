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
  },
});
