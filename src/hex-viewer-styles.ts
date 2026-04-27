export const hexViewerStyles = /* css */ `
.hex-table {
  font-family: "SF Mono", "JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, Monaco, "Courier New", monospace;
  font-size: 12px;
  line-height: 1.4;
}
.hex-cell {
  white-space: pre;
  user-select: text;
}
.hex-offset {
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}
.hex-byte {
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}
.hex-ascii {
  color: var(--text-secondary);
  letter-spacing: 0.5px;
}
.hex-jump-input {
  font-family: "SF Mono", "JetBrains Mono", "Fira Code", Menlo, monospace;
}
`;
