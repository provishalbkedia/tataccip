"use client";

import * as React from "react";
import { Box, Dialog, IconButton, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import type { VideoAsset } from "@/lib/videos";

/** Plays a CCIP walkthrough video (see @/lib/videos) in a modal, sized for
 * the video's own orientation -- narrow/tall for a vertical Shorts clip,
 * wide for a widescreen masterclass. `video` is null when closed; the
 * iframe itself is only ever rendered while a video is set, so closing
 * (video -> null) unmounts it in the same render pass instead of waiting on
 * the Dialog's own exit transition -- playback (and audio) stops the
 * instant the modal starts closing, not ~225ms later. */
export default function VideoModal({ video, onClose }: { video: VideoAsset | null; onClose: () => void }) {
  const isVertical = video?.orientation === "vertical";

  return (
    <Dialog
      open={!!video}
      onClose={onClose}
      maxWidth={isVertical ? "xs" : "md"}
      fullWidth
      PaperProps={{ sx: { bgcolor: "#0A2540", overflow: "hidden" } }}
    >
      {video && (
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1 }}>
            <Typography variant="body2" fontWeight={600} sx={{ color: "#fff", pr: 2 }} noWrap>
              {video.title}
            </Typography>
            <IconButton onClick={onClose} aria-label="Close video" size="small" sx={{ color: "#fff", flexShrink: 0 }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
          <Box sx={{ position: "relative", width: "100%", aspectRatio: isVertical ? "9 / 16" : "16 / 9", bgcolor: "#000" }}>
            <iframe
              key={video.videoId}
              src={`${video.embedUrl}?autoplay=1&rel=0`}
              title={video.title}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
            />
          </Box>
        </Box>
      )}
    </Dialog>
  );
}
