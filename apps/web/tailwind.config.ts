import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  corePlugins: {
    preflight: false, // avoid clobbering MUI's baseline styles
  },
  theme: {
    extend: {
      colors: {
        "ccip-navy": "#0A2540",
        "ccip-azure": "#0B6FBF",
        "ccip-grey": "#5A6B7B",
      },
    },
  },
  plugins: [],
};

export default config;
