"use client";

import * as React from "react";
import { Tooltip, TooltipProps } from "@mui/material";

/** Standard CCIP info-icon tooltip. Defaults to `placement="top"` so it
 * floats up into open whitespace above the label it annotates instead of
 * popping down over whatever dropdown/autocomplete/input sits directly
 * below -- the bug this fixes everywhere an <InfoOutlinedIcon> sits on a
 * filter label or card subheader. `disableInteractive` keeps the tooltip's
 * own pointer-events off, so a click always reaches the real control
 * underneath rather than the tooltip intercepting it; `enterDelay`/
 * `leaveDelay` stop a passing cursor from popping a distracting balloon.
 * Any of these still override per-call via props (e.g. `placement="right"`
 * where vertical room is tight). */
export default function InfoTooltip({ children, ...props }: TooltipProps) {
  return (
    <Tooltip arrow disableInteractive enterDelay={300} leaveDelay={100} placement="top" {...props}>
      {children}
    </Tooltip>
  );
}
